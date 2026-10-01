import { pool } from "../../db/client";
import { createSharedRouteRepository } from "./shared-route-repository";
export const sharedRoutes = createSharedRouteRepository(async work => {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
