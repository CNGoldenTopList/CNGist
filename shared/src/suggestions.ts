/** 意见箱投票窗口。**不要 import 任何客户端或数据库模块** —— 服务端的目录读取、 */

/** 没有显式截止时间时，投票默认从创建当天零点起开 7 天。 */
export const SUGGESTION_VOTE_DAYS = 7;

/** 历史导入行的 createdAt 只是个日期串（2024-01-05 / 2024.01.05），按北京时间零点解析。 */
function beijingDayStart(createdAt?: string | null) {
  const match = (createdAt || "").trim().replace(/[./]/g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const start = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00+08:00`);
  return Number.isNaN(start.getTime()) ? undefined : start;
}

/** 生效的投票截止时间：管理员设过就用它，否则按「创建当天零点 + 7 天」兜底。 */
export function suggestionDueAt(createdAt?: string | null, dueAt?: string | Date | null) {
  if (dueAt) {
    const parsed = dueAt instanceof Date ? dueAt : new Date(dueAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const start = beijingDayStart(createdAt);
  return start ? new Date(start.getTime() + SUGGESTION_VOTE_DAYS * 86_400_000) : undefined;
}

/** 「3 天 4 小时剩余」这样的倒计时文案，到期显示「已结束」。 */
/** 结构化的剩余时间，交给调用方按当前语言组装文案。 */
export function suggestionRemaining(due?: Date) {
  if (!due) return undefined;
  const remaining = due.getTime() - Date.now();
  if (remaining <= 0) return { ended: true as const, days: 0, hours: 0 };
  return {
    ended: false as const,
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining % 86_400_000) / 3_600_000),
  };
}

export function suggestionRemainingLabel(due?: Date) {
  if (!due) return "";
  const remaining = due.getTime() - Date.now();
  if (remaining <= 0) return "已结束";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  return days > 0 ? `${days} 天 ${hours} 小时剩余` : `${Math.max(1, hours)} 小时剩余`;
}

/** General suggestions stay open until an administrator decides them. */
export function suggestionVotingOpen(topic: { kind: string; state: string; createdAt?: string | null; dueAt?: string | Date | null }) {
  if (topic.state === "DECIDED") return false;
  if (topic.kind === "GENERAL") return true;
  const due = suggestionDueAt(topic.createdAt, topic.dueAt);
  return Boolean((topic.dueAt || topic.state === "ONGOING") && due && due.getTime() > Date.now());
}
