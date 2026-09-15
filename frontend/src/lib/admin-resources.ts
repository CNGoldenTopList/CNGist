/**
 * 后台数据的按域取数。
 *
 * 不是「一次拉全部、任何操作后再拉全部」的整包快照：
 *   - 每个域一个资源，**用到才加载**（打开对应标签页时）；
 *   - 一次后台命令只让受影响的域失效，见下面的 COMMAND_EFFECTS；
 *   - 目录只有在命令确实改了目录时才重拉（它有 2.5 MB）。
 *
 * 资源是模块级单例，跨组件共享同一份数据与同一次请求。
 */
import { computed, shallowRef, watch, type ComputedRef } from "vue";
import type {
  AdminRecord, AuditItem, AuditPage, PlayerClaimRequestItem, PlayerDirectory, TaskBoard, TrashItem,
} from "@shared/admin";
import { api } from "@/lib/api";
import { refreshCatalog } from "@/lib/catalog";
import { setAdminRecords } from "@/lib/admin-overlay";

export type Resource<T> = {
  name: string;
  path: string;
  data: ComputedRef<T>;
  loaded: ComputedRef<boolean>;
  load: (force?: boolean) => Promise<void>;
  invalidate: () => void;
};

function createResource<T>(name: string, path: string, empty: T): Resource<T> {
  const value = shallowRef<T>(empty);
  const loaded = shallowRef(false);
  let inflight: Promise<void> | null = null;

  async function load(force = false) {
    if (loaded.value && !force) return;
    // 同一时刻的重复请求合并成一个，避免多个面板同时挂载时打三次同样的接口。
    if (inflight) return inflight;
    inflight = api.get<{ data?: T }>(path).then(({ ok, data }) => {
      if (ok && data.data !== undefined) {
        value.value = data.data;
        loaded.value = true;
      }
      inflight = null;
    });
    return inflight;
  }

  return {
    name,
    path,
    data: computed(() => value.value),
    loaded: computed(() => loaded.value),
    load,
    invalidate() {
      loaded.value = false;
      // 正在显示这个域的面板会因为下面的 useAdminResource 重新请求。
      void load(true);
    },
  };
}

export const adminRecordsResource = createResource<AdminRecord[]>("审核队列", "/api/admin/submissions", []);
export const adminTrash = createResource<TrashItem[]>("回收站", "/api/admin/trash", []);
export const adminTasks = createResource<TaskBoard>("待办", "/api/admin/tasks", { otherTasks: [], completedTasks: [], feedbackReports: [] });
export const adminPlayers = createResource<PlayerDirectory>("玩家管理", "/api/admin/players", { statuses: {}, contacts: {} });
export const adminPlayerClaims = createResource<PlayerClaimRequestItem[]>("新身份申请", "/api/admin/player-claims", []);

const ALL = [adminRecordsResource, adminTrash, adminTasks, adminPlayers, adminPlayerClaims];

/* 审核队列同时是公开页的管理态覆盖层，取到就同步过去。 */
watch(adminRecordsResource.data, (records) => setAdminRecords(records));

/**
 * 一次后台命令改了什么。命中第一条匹配的规则；**没命中就当作全改了**，
 * 宁可多刷一次，也不要让新接口默默地漏刷。
 */
const COMMAND_EFFECTS: Array<{ match: RegExp; resources: Array<Resource<unknown>>; catalog: boolean }> = [
  { match: /^\/api\/admin\/player-bindings$/, resources: [adminPlayers, adminPlayerClaims], catalog: true },
  // 建档只修改目录；刷新审核队列会卸载当前审核组件，丢失等待回填的弹窗。
  { match: /^\/api\/admin\/submissions\/\d+\/auto-challenge$/, resources: [], catalog: true },
  // 审核动作会写审计，也可能把记录挪进回收站
  { match: /^\/api\/admin\/submissions/, resources: [adminRecordsResource, adminTrash], catalog: true },
  // 玩家管理：既有资料修改（.../<id>），也有直接建档新玩家（无 <id> 的裸路径）。
  { match: /^\/api\/admin\/players(\/|$)/, resources: [adminPlayers, adminRecordsResource], catalog: true },
  // 通过申请会建档并认领，会改玩家目录、账户认领关系，也可能新增一个玩家。
  { match: /^\/api\/admin\/player-claims\//, resources: [adminPlayerClaims, adminPlayers], catalog: true },
  { match: /^\/api\/admin\/feedback\//, resources: [adminTasks], catalog: false },
  { match: /^\/api\/admin\/tasks/, resources: [adminTasks], catalog: false },
  // 回收站的投票可能触发确认删除，目录随之变化
  { match: /^\/api\/admin\/trash/, resources: [adminTrash, adminRecordsResource, adminPlayers, adminPlayerClaims], catalog: true },
  { match: /^\/api\/admin\/(catalog|maps|campaigns|challenges|campaign-menu)/, resources: [adminTrash], catalog: true },
  // 意见箱的截止时间与决定只影响目录里的 suggestions，没有专属的后台资源。
  { match: /^\/api\/admin\/suggestions\//, resources: [], catalog: true },
  { match: /^\/api\/admin\/accounts(?:\/|$)/, resources: [], catalog: false },
  // Q&A 条目只影响 /qa 页面，由那一页自己刷新，既不属于后台资源也不碰目录。
  { match: /^\/api\/admin\/qa(?:\/|$)/, resources: [], catalog: false },
] as Array<{ match: RegExp; resources: Array<Resource<unknown>>; catalog: boolean }>;

/** 命令成功后的失效处理，单独导出给不走 sendAdminCommand 的少数请求用。 */
export async function applyEffects(path: string) {
  const effect = COMMAND_EFFECTS.find((item) => item.match.test(path));
  const resources = effect ? effect.resources : ALL;
  for (const resource of resources) resource.invalidate();
  if (!effect || effect.catalog) await refreshCatalog();
}

/**
 * 后台写入的唯一出口：一次调用 = 一个命令接口 = 一个服务端事务。
 * 成功后只让受影响的域失效，正在显示它们的面板会自己重新取数。
 * 管理端接口返回中文原文，这里不做错误码翻译。
 */
export async function sendAdminCommand<T = unknown>(
  path: string,
  init: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T | undefined> {
  const method = init.method ?? "POST";
  const payload = init.body ?? {};
  const result = method === "POST" ? await api.post<{ data?: T }>(path, payload)
    : method === "PUT" ? await api.put<{ data?: T }>(path, payload)
      : method === "PATCH" ? await api.patch<{ data?: T }>(path, payload)
        : await api.delete<{ data?: T }>(path, payload);
  if (!result.ok) throw new Error(result.data.error || "操作失败，请稍后重试。");
  await applyEffects(path);
  return result.data.data;
}

/** 订阅一个域：`enabled` 为真且尚未取数时自动请求。 */
export function useAdminResource<T>(resource: Resource<T>, enabled: ComputedRef<boolean> | (() => boolean)) {
  const on = typeof enabled === "function" ? computed(enabled) : enabled;
  watch([on, resource.loaded], () => {
    if (on.value && !resource.loaded.value) void resource.load();
  }, { immediate: true });
  return { data: resource.data, loaded: resource.loaded, reload: () => resource.load(true) };
}

/**
 * 审计日志是带参数的查询，不适合做成整份缓存的资源：日期区间、类型和页码
 * 都由服务端过滤，翻页只取那一页。
 */
export async function fetchAudit(params: { from?: string; to?: string; type?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.type) query.set("type", params.type);
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const { ok, data } = await api.get<{ data?: AuditPage }>(`/api/admin/audit?${query}`);
  return ok && data.data ? data.data : { items: [] as AuditItem[], total: 0 };
}
