/**
 * 管理态下叠进公开页的待审核与隐藏记录。
 *
 * 这是公开组件里唯一碰后台数据的地方，而且**只读已经缓存的那份**：
 * 公开页不会因此去打后台接口，只有后台页自己拉过之后才有内容。
 * 非管理态一律返回 undefined，投影层拿到的就是纯目录视角。
 */
import { computed, shallowRef } from "vue";
import type { AdminRecord, RecordOverlay } from "@/lib/projection";

const records = shallowRef<AdminRecord[]>([]);

/** 后台拉到审核列表后调用，公开页随即跟着变。 */
export function setAdminRecords(next: AdminRecord[]) {
  records.value = next;
}

export const adminRecords = computed(() => records.value);

/**
 * 数组引用在下次刷新前不变，投影层按 overlay 对象缓存的结果靠它命中。
 * `adminMode` 由调用方传入，避免这个模块依赖会话 store。
 */
export function overlayFor(adminMode: boolean): RecordOverlay | undefined {
  return adminMode && records.value.length ? { records: records.value } : undefined;
}
