/**
 * 提醒与确认。用 Naive UI 的离散实例，任何模块都能直接调用，不必是
 * provider 的后代——旧版的 ToastProvider / ConfirmProvider 就此退场。
 *
 * 语言取当前站点语言：确认框的按钮文案由调用方传入，这里不猜。
 */
import { computed, ref } from "vue";
import { createDiscreteApi, darkTheme, lightTheme } from "naive-ui";
import { naiveThemes } from "@/theme/naive";

/* 离散实例不在 NConfigProvider 之下，主题直接跟随根元素上的 data-theme。
   模块可能早于 pinia 初始化被导入，所以不从 display store 取。 */
const rootTheme = ref<"dark" | "light">(readRootTheme());
function readRootTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
new MutationObserver(() => { rootTheme.value = readRootTheme(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

const { message, dialog, loadingBar } = createDiscreteApi(["message", "dialog", "loadingBar"], {
  configProviderProps: computed(() => ({
    theme: rootTheme.value === "light" ? lightTheme : darkTheme,
    themeOverrides: naiveThemes[rootTheme.value],
  })),
  messageProviderProps: { max: 3, placement: "top", duration: 3200 },
});

export const toast = message;
export const loading = loadingBar;

/** 危险操作的确认。确认按钮走 error 配色，形态上与普通对话框分开。 */
export function confirmAction(options: {
  title: string;
  content?: string;
  positiveText: string;
  negativeText: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.create({
      title: options.title,
      content: options.content,
      positiveText: options.positiveText,
      negativeText: options.negativeText,
      type: options.danger ? "error" : "warning",
      positiveButtonProps: options.danger ? { type: "error" } : { type: "primary" },
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false),
    });
  });
}

export { dialog };
