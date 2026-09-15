/** admin-commands 模块。 */
import { commandTransaction } from "../admin/transaction";
import { eq } from "drizzle-orm";
import { account } from "../../db/schema/index";
import { writeAudit } from "../admin/audit";
import { Admin, Result, failure, done } from "../admin/common";

export async function setAdministrator(admin: Admin, id: number, input: { role?: unknown }): Promise<Result> {
  if (admin.role !== "super_admin") return failure("需要超级管理员权限。", 403);
  if (input.role !== "player" && input.role !== "admin") return failure("只能任命或撤销普通管理员。");
  const role = input.role;
  return commandTransaction(async (tx) => {
    const [actor] = await tx.select().from(account).where(eq(account.id, admin.id)).for("share");
    if (!actor || actor.role !== "super_admin" || actor.status !== "active") return failure("需要超级管理员权限。", 403);
    const [target] = await tx.select().from(account).where(eq(account.id, id)).for("update");
    if (!target) return failure("账户不存在。", 404);
    if (target.role === "super_admin") return failure("不能通过此入口修改超级管理员。", 403);
    if (role === "admin" && target.status !== "active") return failure("不能任命已停用的账户。");
    if (target.role === role) return done(undefined);
    await tx.update(account).set({ role, updatedAt: new Date() }).where(eq(account.id, id));
    await writeAudit(tx, actor, role === "admin" ? "任命普通管理员" : "撤销普通管理员",
      `${target.displayName}（${target.id}）\n- 权限：${target.role} → ${role}\n- 操作者账户：${actor.id}`);
    return done(undefined);
  });
}
