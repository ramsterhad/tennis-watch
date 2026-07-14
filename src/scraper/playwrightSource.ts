import { Browser, chromium } from "playwright";
import { PlayerConfig, ScrapedPlayerInfo } from "../types";
import { ScheduleSource } from "./source";
import {
  TENNIS_EXPLORER_USER_AGENT,
  extractOpponentSlug,
  parsePlayerPage,
  parseRankFromProfileHtml,
  playerProfileUrl,
} from "./parseTennisExplorer";

/** Mirrors TennisExplorerSource's resolveOpponentRank, fetching pages via the browser instead of plain HTTP. */
async function resolveOpponentRank(browser: Browser, matchUrl: string, player: PlayerConfig): Promise<number | null> {
  try {
    const matchPage = await browser.newPage({ userAgent: TENNIS_EXPLORER_USER_AGENT });
    await matchPage.goto(matchUrl, { waitUntil: "domcontentloaded" });
    const matchHtml = await matchPage.content();
    await matchPage.close();

    const slug = extractOpponentSlug(matchHtml, player);
    if (!slug) return null;

    const profilePage = await browser.newPage({ userAgent: TENNIS_EXPLORER_USER_AGENT });
    await profilePage.goto(`https://www.tennisexplorer.com/player/${slug}/`, { waitUntil: "domcontentloaded" });
    const profileHtml = await profilePage.content();
    await profilePage.close();

    return parseRankFromProfileHtml(profileHtml);
  } catch {
    return null;
  }
}

/**
 * Fallback schedule source using a real headless browser. Same parsing logic as
 * TennisExplorerSource (parsePlayerPage) — only how the HTML is obtained differs.
 * Use this if the plain-HTTP source starts failing (e.g. the site adds a JS
 * challenge or the "Next match" table becomes client-rendered). Swapping it in
 * is a one-line change in scraper/index.ts since both implement ScheduleSource.
 */
export class PlaywrightSource implements ScheduleSource {
  async getPlayerInfo(player: PlayerConfig): Promise<ScrapedPlayerInfo> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ userAgent: TENNIS_EXPLORER_USER_AGENT });
      await page.goto(playerProfileUrl(player), { waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.result.gamedetail", { timeout: 10_000 });
      const html = await page.content();
      const info = parsePlayerPage(html, player);
      if (info.nextMatch?.matchUrl) {
        info.nextMatch.opponentRank = await resolveOpponentRank(browser, info.nextMatch.matchUrl, player);
      }
      return info;
    } finally {
      await browser.close();
    }
  }
}
