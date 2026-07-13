import { PlayerConfig, ScrapedPlayerInfo } from "../types";

export interface ScheduleSource {
  /** Returns the player's next scheduled match (or null) plus their current ranking. */
  getPlayerInfo(player: PlayerConfig): Promise<ScrapedPlayerInfo>;
}
