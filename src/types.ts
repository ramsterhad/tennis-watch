export type Tour = "ATP" | "WTA";

export interface PlayerConfig {
  id: string;
  name: string;
  tour: Tour;
  tennisExplorerSlug: string;
  wikipediaTitle: string;
  addedReason?: string;
}

export interface NextMatch {
  tournament: string;
  /** tennisexplorer.com tournament page, or null if not present (shouldn't normally happen) */
  tournamentUrl: string | null;
  round: string;
  /** ISO 8601 string in Europe/Berlin, or null if only a date (no time) is known */
  startTime: string | null;
  /** Human-readable date/time already formatted for Europe/Berlin, for display fallback */
  startDisplay: string;
  opponent: string;
  /** Current ATP/WTA singles ranking of the opponent, or null if unranked/not found/not yet resolved */
  opponentRank: number | null;
  /** tennisexplorer.com match-detail page for this specific matchup, or null if the opponent isn't known yet */
  matchUrl: string | null;
}

export interface BroadcastInfo {
  broadcasters: string[];
  note?: string;
  source: "scraped" | "config";
}

export interface ScrapedPlayerInfo {
  nextMatch: NextMatch | null;
  /** Current ATP/WTA singles ranking, or null if unranked/not found on the source page */
  currentRank: number | null;
  /** Country name as given by the source (e.g. "Italy", "USA", "Great Britain"), or null if not found */
  country: string | null;
}

export interface PlayerResult {
  player: PlayerConfig;
  nextMatch: NextMatch | null;
  currentRank: number | null;
  country: string | null;
  broadcast: BroadcastInfo | null;
  photoPath: string | null;
  error?: string;
}

export interface SiteData {
  generatedAt: string;
  players: PlayerResult[];
}
