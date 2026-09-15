/**
 * 站点语言。词典住在 @cngist/shared，前后端共用同一批 key。
 *
 * 语言只存在当前浏览器的 localStorage（`cn-golden-site-language`），
 * 不写 Cookie、账户偏好或数据库；顶栏的「中／英」只管地图名称，与此无关。
 */
import { computed, ref } from "vue";
import { isLocale, translate, type Locale, type MessageKey, type MessageValues } from "@shared/i18n/format";
import { isApiErrorCode } from "@shared/api-errors";

const STORAGE_KEY = "cn-golden-site-language";

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // 存储不可用时仍可在当前页面切换，只是刷新保留不了。
  }
  return "zh-CN";
}

const locale = ref<Locale>(initialLocale());

export function setLocale(value: Locale) {
  locale.value = value;
  document.documentElement.lang = value === "en" ? "en" : "zh-CN";
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 同上。
  }
}

/** 接口回复里的 `code` 认得就按当前语言重组整句，否则用服务端原文。 */
export type ApiReply = { ok?: boolean; error?: string; code?: string; values?: MessageValues };

export function useLanguage() {
  const t = (key: MessageKey, values?: MessageValues) => translate(locale.value, key, values);
  const apiError = (reply: ApiReply | null | undefined, fallback: MessageKey = "error.networkError") => {
    if (reply && isApiErrorCode(reply.code)) return translate(locale.value, `error.${reply.code}` as MessageKey, reply.values);
    return reply?.error || t(fallback);
  };
  return { locale: computed(() => locale.value), setLocale, t, apiError };
}

export type { Locale, MessageKey, MessageValues };
