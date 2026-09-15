/* 令牌最先加载：它只定义变量，是全站样式的真相来源。 */
import "@/styles/tokens.css";
import "@/styles/fonts.css";
import "@/styles/base.css";
/* 后台共用样式：那是一整块内部界面，多个组件穿插在同几个页面里。 */
import "@/styles/admin.css";
import "@/styles/overlays.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import { router } from "@/router";

createApp(App).use(createPinia()).use(router).mount("#app");
