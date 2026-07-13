import { NextMatch, PlayerConfig } from "../types";

export interface ScheduleSource {
  /** Returns the player's next scheduled match, or null if none is currently listed. */
  getNextMatch(player: PlayerConfig): Promise<NextMatch | null>;
}
