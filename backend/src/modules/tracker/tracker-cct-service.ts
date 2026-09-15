import { pool } from "../../db/client";
import { createCctRepository } from "./cct-repository";

/** Internal data layer; no public telemetry route until device auth and consent are implemented. */
export const trackerCct = createCctRepository(async work => {
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
});
