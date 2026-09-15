/** 全仓库 JSON 配置；路径不依赖启动工作目录。 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export type Config = {
  server: { host: string; port: number; origin: string; trustProxy: boolean | string[] };
  database: { url: string; maxConnections: number; toolsContainer?: string };
  auth: { passwordEnabled: boolean; oidc: null | { issuer: string; clientId: string; clientSecret: string; redirectUri: string; scopes: string } };
  mail: null | { host: string; port: number; user: string; password: string; fromName: string };
  oss: null | { region: string; bucket: string; accessKeyId: string; accessKeySecret: string; assetPrefix: string; cdnBaseUrl: string };
  bilibili: { bindingArticleUrl: string };
  backup: { directory: string; keepDays: number };
};
let directory = dirname(fileURLToPath(import.meta.url));
while (!existsSync(resolve(directory, "config.example.json"))) {
  const parent = dirname(directory);
  if (parent === directory) throw new Error("找不到仓库根目录的 config.example.json");
  directory = parent;
}
export const repositoryRoot = directory;
let loaded: Config | undefined;
export function validateConfig(value: unknown): Config {
  const c = value as Config;
  if (!c?.server || !c.database || !c.auth || !c.backup || !c.bilibili) throw new Error("config.json 缺少功能配置");
  if (!Number.isInteger(c.server.port) || c.server.port < 1 || c.server.port > 65535 || typeof c.server.host !== "string") throw new Error("server 配置无效");
  if (!["http:", "https:"].includes(new URL(c.server.origin).protocol)) throw new Error("server.origin 无效");
  if (!["postgres:", "postgresql:"].includes(new URL(c.database.url).protocol) || !Number.isInteger(c.database.maxConnections) || c.database.maxConnections < 1) throw new Error("database 配置无效");
  if (typeof c.auth.passwordEnabled !== "boolean" || !Number.isInteger(c.backup.keepDays) || c.backup.keepDays < 1) throw new Error("auth/backup 配置无效");
  if (c.server.trustProxy !== false && !Array.isArray(c.server.trustProxy)) throw new Error("trustProxy 只接受 false 或可信代理地址数组");
  for (const [section, keys] of [[c.auth.oidc, ["issuer", "clientId", "clientSecret", "redirectUri"]], [c.mail, ["host", "user", "password"]], [c.oss, ["region", "bucket", "accessKeyId", "accessKeySecret", "cdnBaseUrl"]]] as const) {
    if (section && keys.some(k => typeof (section as unknown as Record<string, unknown>)[k] !== "string" || !(section as unknown as Record<string, unknown>)[k])) throw new Error("可选功能配置不完整");
  }
  return c;
}
export function getConfig(): Config {
  return loaded ??= validateConfig(JSON.parse(readFileSync(resolve(repositoryRoot, "config.json"), "utf8")));
}
