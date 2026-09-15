/** common 模块。 */
import { requiredEntityId } from "../../../../shared/src/entity-id";
import { map } from "../../db/schema/index";
import { isDifficultyCode } from "../../../../shared/src/tiers";
import type { AdminReviewState } from "../../../../shared/src/admin";

export type Admin = { id: number; displayName: string; role: "admin" | "super_admin" };

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string; status: number };

export function failure(error: string, status = 400): Result<never> { return { ok: false, error, status }; }

export function done<T>(data: T): Result<T> { return { ok: true, data }; }

export function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export function optional(value: unknown, max: number) { return clean(value, max) || null; }

export function stringArray(value: unknown, maxItems = 500) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => clean(item, 500)).filter(Boolean);
}

export function idArray(value: unknown, maxItems = 500): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw Object.assign(new Error("编号数组无效"), { statusCode: 400 });
  return value.map(requiredEntityId);
}

export function validUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

export function tierCode(value: unknown) {
  const code = clean(value, 32);
  return isDifficultyCode(code) ? code : "undetermined";
}

export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown) {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: string }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

export const REVIEW_STATUSES: AdminReviewState[] = ["accepted", "rejected", "hidden"];

export function isExplicitFcName(name: string) {
  return !/(?:^|[^a-z])C\s*\/\s*FC(?:[^a-z]|$)|(?:^|[^a-z])FC\s*\/\s*C(?:[^a-z]|$)/i.test(name)
    && /(?:^|[^a-z])FC(?:[^a-z]|$)/i.test(name);
}

export type SplitPart = { name?: unknown; tier?: unknown; notice?: unknown };
