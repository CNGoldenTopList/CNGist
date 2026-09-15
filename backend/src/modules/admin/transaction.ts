/** 管理动作共用事务；返回业务失败时撤销已经发生的写入。 */
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "../../db/client";
import type { Tx } from "./audit";
export const commandScope = new AsyncLocalStorage<Tx>();
class Rejected extends Error { constructor(readonly result: unknown) { super("command rejected"); } }
export async function commandTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const parent = commandScope.getStore();
  if (parent) return work(parent);
  try { return await db.transaction(async tx => {
    const result = await commandScope.run(tx, () => work(tx));
    if (result && typeof result === "object" && "ok" in result && !result.ok) throw new Rejected(result);
    return result;
  }); } catch (error) { if (error instanceof Rejected) return error.result as T; throw error; }
}
