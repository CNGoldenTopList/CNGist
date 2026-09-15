/** binding-command 模块。 */
import { playerBindings } from "../auth/player-binding";
import { Admin, Result, failure, done } from "../admin/common";

export async function acceptPlayerBindingCode(admin: Admin, input: Record<string, unknown>): Promise<Result<{ playerId: number | null }>> {
  if (input.confirmed !== true || typeof input.id !== "number" || !Number.isInteger(input.id) || input.id <= 0
    || typeof input.uid !== "string" || typeof input.name !== "string") return failure("请先查询绑定码，核对评论者 UID 和昵称并确认。");
  const result = await playerBindings.accept(input.id, "admin", { uid: input.uid, name: input.name }, admin);
  return result.ok ? done({ playerId: result.data.claimedPlayerId }) : failure(result.error, 409);
}
