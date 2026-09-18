import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/** 前端与后端同源部署；开发期把 /api 代理到本机 Fastify。 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared/src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8342,
    strictPort: true,
    /* 反向代理按站点源地址转发，Host 头是 cngist.com。 */
    allowedHosts: ["cngist.com"],
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
    /* 与 nginx 的 `location ^~ /api/` 对齐：只代理 /api/ 下面的路径。
       `/api` 本身是站内的接口文档页，代理掉它会变成后端的 404。 */
    proxy: { "^/api/": { target: "http://127.0.0.1:8268", changeOrigin: false } },
  },
  preview: {
    host: "127.0.0.1",
    port: 8342,
    strictPort: true,
    allowedHosts: ["cngist.com"],
    proxy: { "^/api/": { target: "http://127.0.0.1:8268", changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
