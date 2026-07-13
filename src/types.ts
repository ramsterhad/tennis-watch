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
  round: string;
  /** ISO 8601 string in Europe/Berlin, or null if only a date (no time) is known */
  startTime: string | null;
  /** Human-readable date/time already formatted for Europe/Berlin, for display fallback */
  startDisplay: string;
  opponent: string;
}

export interface BroadcastInfo {
  broadcasters: string[];
  note?: string;
  source: "scraped" | "config";
}

export interface PlayerResult {
  player: PlayerConfig;
  nextMatch: NextMatch | null;
  broadcast: BroadcastInfo | null;
  photoPath: string | null;
  error?: string;
}

export interface SiteData {
  generatedAt: string;
  players: PlayerResult[];
}
