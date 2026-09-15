/** 图片上传 OSS，数据库仅保存对象索引与元数据。 */
import { db } from "../../db/client";
import { imageAsset } from "../../db/schema";
import { ossConfig, uploadImage, deleteObject } from "../../integrations/oss";
import type { Tx } from "../admin/audit";
export function imageUrl(key: string | null | undefined): string | null {
  const config = ossConfig();
  return key && config ? `${config.cdnBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}` : null;
}
export async function storeImage(bytes: Buffer, folder: string, executor: Pick<Tx, "insert"> = db) {
  const config = ossConfig();
  if (!config) throw Object.assign(new Error("图片存储未配置"), { statusCode: 503 });
  const uploaded = await uploadImage(config, bytes, folder);
  try { await executor.insert(imageAsset).values({ objectKey: uploaded.key, contentType: uploaded.contentType, bytes: uploaded.bytes }); }
  catch (error) { await deleteObject(config, uploaded.key).catch(() => undefined); throw error; }
  return uploaded;
}
