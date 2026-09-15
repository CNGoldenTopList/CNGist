/** CctError 到 HTTP 状态的映射。单独成一个不碰数据库的模块，方便直接测。 */
const STATUS: Record<string, number> = {
  presence_conflict: 409,
  history_disabled: 403,
  history_epoch_invalid: 403,
  cursor_conflict: 409,
  stale_revision: 409,
  revision_gap: 409,
  baseline_required: 409,
  mutation_conflict: 409,
  state_hash_mismatch: 409,
  scope_quota_exceeded: 409,
  scope_too_large: 413,
};

export function httpStatusForCct(code: string) {
  return STATUS[code] ?? 400;
}

/** 客户端重试同一个请求有没有意义。409/413/400 都没有，重试只会重复失败。 */
export function isRetryable(status: number) {
  return status >= 500;
}
