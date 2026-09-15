/**
 * 后台命令。管理端接口返回中文原文（后台界面本来就是中文），
 * 因此这里不做错误码翻译，直接把 `error` 抛给调用方。
 */
import { api } from "@/lib/api";

export class AdminCommandError extends Error {}

export async function sendAdminCommand<T = Record<string, unknown>>(
  path: string,
  options: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const result = method === "POST" ? await api.post<T>(path, options.body)
    : method === "PUT" ? await api.put<T>(path, options.body)
      : method === "PATCH" ? await api.patch<T>(path, options.body)
        : await api.delete<T>(path, options.body);
  if (!result.ok) throw new AdminCommandError(result.data.error || "操作失败，请稍后重试。");
  return result.data;
}
