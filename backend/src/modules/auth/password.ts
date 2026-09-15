/** 口令派生。用 node:crypto 的 scrypt——内存硬，标准库自带，不引原生依赖。 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
// 默认 maxmem 是 32MB，装不下 128*N*r ≈ 33.5MB，必须显式抬高
const MAX_MEM = 128 * N * R * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64");
  try {
    const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEM,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
