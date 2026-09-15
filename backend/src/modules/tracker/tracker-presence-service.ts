import { pool } from "../../db/client";
import { createPresenceRepository } from "./presence";

export const presenceTransaction: import("./cct-repository").CctTransaction = async work => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

import { captureGoldenRoomEntry } from "./golden-room-alerts";

export const trackerPresence = createPresenceRepository(presenceTransaction, captureGoldenRoomEntry);
