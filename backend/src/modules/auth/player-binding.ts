import { db } from "../../db/client";
import { fetchBilibiliName } from "../../integrations/bilibili";
import { createPlayerBindingService } from "../players/player-binding-service";
export const playerBindings = createPlayerBindingService(db, fetchBilibiliName);
