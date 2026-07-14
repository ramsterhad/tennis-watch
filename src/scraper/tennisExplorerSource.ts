import { PlayerConfig, ScrapedPlayerInfo } from "../types";
import { ScheduleSource } from "./source";
import {
  TENNIS_EXPLORER_USER_AGENT,
  extractOpponentSlug,
  parsePlayerPage,
  parseRankFromProfileHtml,
  playerProfileUrl,
} from "./parseTennisExplorer";

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": TENNIS_EXPLORER_USER_AGENT } });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Resolves the opponent's current rank for a not-yet-fetched next match. Needs two
 * extra requests (match-detail page → opponent slug, then opponent profile → rank),
 * since neither the tracked player's profile page nor the match-detail page expose
 * the opponent's ranking directly. Best-effort: any failure just leaves it null,
 * matching the rest of this scraper's error handling for optional enrichment data.
 */
async function resolveOpponentRank(matchUrl: string, player: PlayerConfig): Promise<number | null> {
  try {
    const matchHtml = await fetchText(matchUrl);
    if (!matchHtml) return null;
    const slug = extractOpponentSlug(matchHtml, player);
    if (!slug) return null;
    const profileHtml = await fetchText(`https://www.tennisexplorer.com/player/${slug}/`);
    if (!profileHtml) return null;
    return parseRankFromProfileHtml(profileHtml);
  } catch {
    return null;
  }
}

/**
 * Primary schedule source: plain HTTP GET + HTML parsing (no JS execution needed).
 * tennisexplorer.com renders the "Next match" table server-side and its robots.txt
 * allows scraping player profile pages. If this ever breaks (site redesign, bot
 * protection), swap in PlaywrightSource — it implements the same interface.
 */
export class TennisExplorerSource implements ScheduleSource {
  async getPlayerInfo(player: PlayerConfig): Promise<ScrapedPlayerInfo> {
    const url = playerProfileUrl(player);
    const res = await fetch(url, { headers: { "User-Agent": TENNIS_EXPLORER_USER_AGENT } });
    if (!res.ok) {
      throw new Error(`tennisexplorer.com returned HTTP ${res.status} for ${player.name}`);
    }
    const html = await res.text();
    const info = parsePlayerPage(html, player);
    if (info.nextMatch?.matchUrl) {
      info.nextMatch.opponentRank = await resolveOpponentRank(info.nextMatch.matchUrl, player);
    }
    return info;
  }
}
