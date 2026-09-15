/** 业务实体 ID 是 PostgreSQL 正整数；缺省值保持 null。 */
export function entityId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) throw Object.assign(new Error("实体编号必须为正整数"), { statusCode: 400 });
  return value;
}
export function requiredEntityId(value: unknown): number {
  const id = entityId(value);
  if (id === null) throw Object.assign(new Error("缺少实体编号"), { statusCode: 400 });
  return id;
}
export function pathEntityId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw Object.assign(new Error("实体编号无效"), { statusCode: 400 });
  return requiredEntityId(Number(value));
}
