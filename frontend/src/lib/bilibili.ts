/**
 * 手机端 B 站只给得到 BV 号，复制不出完整链接，所以裸 BV 号也当作合法输入
 * 补成正式地址。分 P 允许写在后面：`BV1xx411c7mD p2`、`BV1xx411c7mD?p=2`、
 * `BV1xx411c7mD-P2` 都识别。
 */
const BV_REF_RE = /^(BV[0-9A-Za-z]{10})(?:[\s?&/_-]*(?:p|page)\s*=?\s*(\d{1,4}))?$/i;

/** 裸 BV 号补成完整视频链接；已经是链接或认不出来的输入原样返回，交给后端校验。 */
export function expandBilibiliVideoRef(raw: string): string {
  const value = raw.trim();
  const match = value.match(BV_REF_RE);
  if (!match) return value;
  const bvid = `BV${match[1].slice(2)}`;
  const page = Number(match[2] ?? "1");
  return `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`;
}
