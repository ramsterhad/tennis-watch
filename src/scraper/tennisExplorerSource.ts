import { NextMatch, PlayerConfig } from "../types";
import { ScheduleSource } from "./source";
import { TENNIS_EXPLORER_USER_AGENT, parsePlayerPage, playerProfileUrl } from "./parseTennisExplorer";

/**
 * Primary schedule source: plain HTTP GET + HTML parsing (no JS execution needed).
 * tennisexplorer.com renders the "Next match" table server-side and its robots.txt
 * allows scraping player profile pages. If this ever breaks (site redesign, bot
 * protection), swap in PlaywrightSource — it implements the same interface.
 */
export class TennisExplorerSource implements ScheduleSource {
  async getNextMatch(player: PlayerConfig): Promise<NextMatch | null> {
    const url = playerProfileUrl(player);
    const res = await fetch(url, { headers: { "User-Agent": TENNIS_EXPLORER_USER_AGENT } });
    if (!res.ok) {
      throw new Error(`tennisexplorer.com returned HTTP ${res.status} for ${player.name}`);
    }
    const html = await res.text();
    return parsePlayerPage(html, player);
  }
}
