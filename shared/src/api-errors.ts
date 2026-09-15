/** 接口错误码。 */
import { translate, type MessageKey, type MessageValues } from "./i18n/format";

export const apiErrorCodes = [
  "bindingRequired", "bindingInvalid", "bindingThrottled", "bindingWait", "bindingMismatch", "bindingTargetChanged",
  "networkError", "suggestionMissing", "suggestionClosed",
  "signInRequired", "signInToUpload", "signInActive",
  "accountMissing", "accountDisabled", "badCredentials", "missingCredentials",
  "emailRequired", "emailInvalid", "emailTaken", "emailRegistered", "emailUsedByOther",
  "emailVerified", "emailMissing", "emailBeforePassword",
  "passwordRequired", "passwordTooShort", "newPasswordTooShort", "passwordWrong",
  "displayNameRequired", "identityMissing", "identityLast",
  "mailDisabled", "mailThrottled", "linkExpiredVerify", "linkExpiredReset", "badOrigin",
  "claimUidRequired", "claimUidInvalid", "claimIncomplete", "claimTaken", "claimPending", "claimRequired",
  "playerNameTaken", "playerMissing", "playerNoBilibili", "avatarSelfOnly", "avatarUnavailable",
  "recordMissing", "recordForbidden", "recordNotEditable",
  "requestIncomplete", "requestMalformed",
  "attachmentMissingId", "attachmentNotImage", "wishlistMissingTarget",
  "bilibiliUnparsable", "bilibiliNotFound", "bilibiliUnavailable", "bilibiliDown",
  "avatarThrottled", "avatarEmpty", "verifyFailed", "verifyLinkIncomplete",
  "wishlistChallengeRequired", "challengeMissing", "wishMissing", "wishStatusInvalid",
  "wishProgressRange", "wishDeathsInvalid",
  "uploadNotConfigured", "imageEmpty", "uploadThrottled", "reportTitleRequired", "reportDetailRequired",
  "videoUrlInvalid", "rawUrlInvalid", "achievedAtInvalid", "proposalIncomplete", "gameBananaInvalid",
  "fcRequiresCombinedChallenge", "suggestedTierInvalid", "challengeRequired", "submissionDuplicate", "claimUidIsPlayer",
  "trackerScopeInvalid", "trackerScopeNotUploaded", "trackerMapRequired", "trackerBindingExists", "mapMissing",
  "deviceCodeInvalid", "deviceCodeUsed", "deviceCodeExpired", "deviceVerifierMismatch", "deviceMissing",
  "deviceRequestInvalid",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorKey = (code: ApiErrorCode) => `error.${code}` as MessageKey;

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (apiErrorCodes as readonly string[]).includes(value);
}

/** 中文原文。词典是唯一出处，改文案只改 zh-CN.json。 */
export const apiErrorText = (code: ApiErrorCode, values?: MessageValues) =>
  translate("zh-CN", apiErrorKey(code), values);

/** 带参数的错误码把参数一起带给客户端，由它按当前语言重新组装整句。 */
export type ApiFailure = { ok: false; error: string; code: ApiErrorCode; values?: MessageValues };

/** 失败结果。直接返回，或展开进更大的响应体。 */
export function fail(code: ApiErrorCode, values?: MessageValues): ApiFailure {
  return values
    ? { ok: false, error: apiErrorText(code, values), code, values }
    : { ok: false, error: apiErrorText(code), code };
}
