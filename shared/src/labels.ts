/** 挑战名称规范化、显示名与排序规则。 */
import type { MessageKey } from "./i18n/format";
import type { Challenge, ChallengeType, SuggestionKind, SuggestionState } from "./types";

export const challengeTypeLabel: Record<ChallengeType, string> = {
  C: "C",
  FC: "FC",
  "C/FC": "C/FC",
  "All Major Secrets": "全部主要隐藏",
  "Silver Segment": "分段银草莓",
  Other: "其他挑战"
};

/** 全站唯一的挑战名显示钩子。 */
export const challengeDisplayName = (challenge: Pick<Challenge, "name">) =>
  challenge.name.replace(/\[(C\/FC|FC|C)\]\s*$/i, "$1");

function hasChallengeQualifier(name: string) {
  return /\[[^\]]+\]/.test(name.replace(/\[(C\/FC|FC|C)\]\s*$/i, ""));
}

export function challengeVariantOrder(name: string) {
  const value = name.match(/(?:^|\s|\[)(C\/FC|FC|C)(?:\]|\s*)$/i)?.[1]?.toUpperCase();
  return value === "C" ? 0 : value === "C/FC" ? 1 : value === "FC" ? 2 : 3;
}

export function compareChallengeNames(a: string, b: string) {
  const aSegment = a.match(/^\s*(Golden|Silver|Berry)\s+(\d+)\b/i);
  const bSegment = b.match(/^\s*(Golden|Silver|Berry)\s+(\d+)\b/i);
  if (aSegment && bSegment) {
    const numberOrder = Number(aSegment[2]) - Number(bSegment[2]);
    if (numberOrder) return numberOrder;
    const kindRank = (value: string) => value.toLowerCase() === "golden" ? 0 : value.toLowerCase() === "silver" ? 1 : 2;
    const kindOrder = kindRank(aSegment[1]) - kindRank(bSegment[1]);
    if (kindOrder) return kindOrder;
    return challengeVariantOrder(a) - challengeVariantOrder(b);
  }
  if (aSegment) return 1;
  if (bSegment) return -1;
  const qualifierOrder = Number(hasChallengeQualifier(a)) - Number(hasChallengeQualifier(b));
  return qualifierOrder || challengeVariantOrder(a) - challengeVariantOrder(b);
}


export const suggestionKindLabel: Record<SuggestionKind | "ALL", MessageKey> = {
  ALL: "feedback.kindAll",
  GENERAL: "feedback.kindGeneral",
  CHALLENGE: "feedback.kindChallenge",
  "OWN COMPLETED CHALLENGES": "feedback.kindOwn"
};

export const suggestionStateLabel: Record<SuggestionState, MessageKey> = {
  ONGOING: "feedback.stateOngoing",
  UNDECIDED: "feedback.stateUndecided",
  DECIDED: "feedback.stateDecided"
};
