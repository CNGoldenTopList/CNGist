import { onBeforeUnmount, onMounted } from "vue";

/** 键盘出现时将弹层限制在可见视口内；内容变化不参与高度计算。 */
export function useOverlayViewport() {
  const viewport = window.visualViewport;
  function update() {
    const height = viewport?.height ?? window.innerHeight;
    const inset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
    const style = document.documentElement.style;
    style.setProperty("--overlay-viewport-height", `${height}px`);
    style.setProperty("--overlay-keyboard-inset", `${inset}px`);
  }
  onMounted(() => {
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
  });
  onBeforeUnmount(() => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    document.documentElement.style.removeProperty("--overlay-viewport-height");
    document.documentElement.style.removeProperty("--overlay-keyboard-inset");
  });
}
