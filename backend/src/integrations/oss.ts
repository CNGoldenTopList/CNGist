import { getConfig } from "../config";
/** 阿里云 OSS 客户端：手写 V4 签名，不引 ali-oss（那个包 25 个直接依赖，而这里只需要 */
import { createHash, createHmac, randomUUID } from "node:crypto";

export type OssConfig = {
  region: string;
  host: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  /** 公开静态资源前缀。 */
  assetPrefix: string;
  /** 加速域名，公开访问地址由它拼出来。 */
  cdnBaseUrl: string;
};

/** OSS 的 UriEncode：除 A-Za-z0-9-_.~ 外全部百分号编码，斜杠按需保留。 */
function uriEncode(value: string, keepSlash = false) {
  return [...Buffer.from(value, "utf8")].map((byte) => {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(char)) return char;
    if (char === "/" && keepSlash) return char;
    return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
}

export function ossConfig(): OssConfig | null {
  const c = getConfig().oss;
  if (!c) return null;
  const region = c.region.replace(/^oss-/, "");
  return { ...c, region, host: `${c.bucket}.oss-${region}.aliyuncs.com`, assetPrefix: c.assetPrefix.replace(/^\/+|\/+$/g, ""), cdnBaseUrl: c.cdnBaseUrl.replace(/\/+$/, "") };
}

function signingKey(secret: string, day: string, region: string) {
  let key = createHmac("sha256", `aliyun_v4${secret}`).update(day).digest();
  for (const part of [region, "oss", "aliyun_v4_request"]) key = createHmac("sha256", key).update(part).digest();
  return key;
}

/** 签名进 Canonical Headers 的是 x-oss-*、Content-Type 与 Content-MD5；不用 AdditionalHeaders。 */
function signed(config: OssConfig, method: string, key: string, headers: Record<string, string>) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = stamp.slice(0, 8);
  const canonical: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()])),
    "x-oss-content-sha256": "UNSIGNED-PAYLOAD",
    "x-oss-date": stamp,
  };
  const names = Object.keys(canonical)
    .filter((name) => name.startsWith("x-oss-") || name === "content-type" || name === "content-md5")
    .sort();
  const canonicalRequest = [
    method,
    uriEncode(`/${config.bucket}/${key}`, true),
    "",
    `${names.map((name) => `${name}:${canonical[name]}`).join("\n")}\n`,
    "",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${day}/${config.region}/oss/aliyun_v4_request`;
  const stringToSign = ["OSS4-HMAC-SHA256", stamp, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signature = createHmac("sha256", signingKey(config.accessKeySecret, day, config.region)).update(stringToSign).digest("hex");
  return {
    url: `https://${config.host}/${uriEncode(key, true)}`,
    headers: {
      ...headers,
      "x-oss-content-sha256": "UNSIGNED-PAYLOAD",
      "x-oss-date": stamp,
      authorization: `OSS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, Signature=${signature}`,
    },
  };
}

/** 允许的图片类型与它们的文件头。不信任客户端给的 content-type： */
const IMAGE_TYPES = [
  { type: "image/jpeg", ext: "jpg", match: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", match: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/gif", ext: "gif", match: (b: Buffer) => b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a" },
  { type: "image/webp", ext: "webp", match: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

export function detectImage(bytes: Buffer) {
  return IMAGE_TYPES.find((candidate) => candidate.match(bytes)) ?? null;
}

export const ALLOWED_IMAGE_TYPES = IMAGE_TYPES.map((item) => item.type);

async function send(config: OssConfig, method: string, key: string, headers: Record<string, string>, body?: Buffer) {
  const request = signed(config, method, key, headers);
  // Buffer 运行时就是合法的 fetch body；DOM 的 BodyInit 与 @types/node 的
  // Uint8Array<ArrayBufferLike> 泛型对不上，只能在类型层面绕过去。
  const payload = body as unknown as BodyInit | undefined;
  const response = await fetch(request.url, { method, headers: request.headers, body: payload });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? String(response.status);
    const detail = /<Message>([^<]+)<\/Message>/.exec(text)?.[1] ?? "";
    throw new Error(`OSS ${method} 失败：${code}${detail ? ` ${detail}` : ""}`);
  }
}

/** 上传一张图片，返回公开访问地址与对象 key。 */
export async function uploadImage(config: OssConfig, bytes: Buffer, folder: string) {
  const kind = detectImage(bytes);
  if (!kind) throw new Error("只支持 JPEG、PNG、GIF、WebP 图片。");
  const key = [config.assetPrefix, folder, `${randomUUID()}.${kind.ext}`].filter(Boolean).join("/");
  await send(config, "PUT", key, {
    "content-type": kind.type,
    "content-md5": createHash("md5").update(bytes).digest("base64"), // 服务端校验完整性
    "content-length": String(bytes.length),
    "cache-control": "public, max-age=31536000, immutable", // key 含 uuid，内容不会变
  }, bytes);
  return { key, url: `${config.cdnBaseUrl}/${key}`, contentType: kind.type, bytes: bytes.length };
}

export async function deleteObject(config: OssConfig, key: string) {
  await send(config, "DELETE", key, {});
}
