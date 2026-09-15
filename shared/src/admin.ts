import type { RatedTier } from "./types";
/** 后台数据的类型与纯函数。**没有状态**：这里不再有 AdminStore 那样的整包快照。 */
import type { PlayerStatus } from "./types";
import type { TierCode } from "./types";

export type AdminReviewState = "pending" | "accepted" | "rejected" | "hidden";
export type ReviewTag = { id: number; kind: "badge" | "note"; text: string; color?: string };

/** 标记色、预设词表与标签同一性规则都在 `@/lib/review-tags`，服务端命令也要用同一份。 */
export { DTS_TAG_COLOR, FC_TAG_COLOR, NO_MAJOR_SKIPS_TAG_COLOR, fixedTagColor, normalizeTagColor, tagIdentity } from "./review-tags";

export type ProposedChallengeTarget = {
  campaignName: string;
  mapName: string;
  challengeName: string;
  gameBananaUrl?: string;
  suggestedTier?: string;
  rules?: string;
};

export type AdminRecord = {
  id: number;
  challengeId: number | null;
  playerId: number;
  achievedAt: string;
  videoUrl: string;
  rawVideoUrl?: string;
  playerNote?: string;
  verifierNote?: string;
  status: AdminReviewState;
  verified: boolean;
  /** 有人认领了这条待审核记录。只是给其他管理员看的提示，没有任何状态语义。 */
  reviewing?: { by: string; note?: string; at: string };
  marks: string[];
  reviewTags?: ReviewTag[];
  createdAt: string;
  reviewedAt?: string;
  reviewer?: string;
  opinionTier?: RatedTier;
  recommends?: boolean;
  duration?: string;
  /** 玩家提交尚未建档的新地图包、地图或挑战时保存的原始文字。 */
  proposedTarget?: ProposedChallengeTarget;
};

/** 玩家在自己的个人页看到的自己的提交。 */
export type OwnSubmission = {
  id: number;
  challengeId: number | null;
  playerId: number;
  status: AdminReviewState;
  verified: boolean;
  achievedAt: string;
  videoUrl: string;
  rawVideoUrl?: string;
  playerNote?: string;
  verifierNote?: string;
  duration?: string;
  opinionTier?: RatedTier;
  recommends?: boolean;
  proposedTarget?: ProposedChallengeTarget;
  createdAt: string;
  reviewedAt?: string;
};

export type TrashItem = {
  id: number;
  kind: "record" | "campaign" | "map" | "challenge" | "player";
  targetId: number;
  label: string;
  deletedAt: string;
  votes: number[];
};

export type AuditItem = { id: number; at: string; type: string; detail: string; actor: string };
export type AuditPage = { items: AuditItem[]; total: number };

export type FeedbackAttachment = { id: number; url: string; contentType: string; bytes: number };
export type FeedbackReport = {
  id: number; title: string; detail: string; pageUrl?: string; reporter: string; createdAt: string;
  status: "pending" | "resolved"; handledBy?: number; handledAt?: string; attachments?: FeedbackAttachment[];
};

export type AdminTask = { id: number; type: string; title: string; detail: string; createdAt: string; completedAt?: string; completedBy?: string; href?: string };
export type TaskBoard = { otherTasks: AdminTask[]; completedTasks: AdminTask[]; feedbackReports: FeedbackReport[] };

export type PlayerClaimRequestItem = {
  id: number; accountName: string; accountEmail?: string;
  bilibiliUid: string; bilibiliName: string; nameSource: "fetched" | "manual";
  status: "pending" | "approved" | "rejected"; createdAt: string; reviewNote?: string;
};

export type PlayerDirectory = {
  /** 只列出非 normal 的玩家，正常玩家不占体积。 */
  statuses: Record<string, PlayerStatus>;
  /** 认领该玩家的账户的联系方式，只读展示。 */
  contacts: Record<string, { email?: string; qqLinked: boolean }>;
};

export type WishlistStatus = "active" | "soon" | "later" | "archive";
export type WishlistEntry = { id: number; playerId: number | null; challengeId: number; status: WishlistStatus; progress: number; bestDeaths?: number; comment?: string; practiceDuration?: string; /** 兼容旧备份，读取后按时分秒显示。 */ practiceMinutes?: number; createdAt: string; updatedAt: string };

export const WISHLIST_UPDATED_EVENT = "cn-golden-wishlist-updated";

export function isRecordTrashed(trash: TrashItem[], recordId: number) {
  return trash.some((item) => item.kind === "record" && item.targetId === recordId);
}
