import { chromium } from "playwright";
import { NextMatch, PlayerConfig } from "../types";
import { ScheduleSource } from "./source";
import { TENNIS_EXPLORER_USER_AGENT, parsePlayerPage, playerProfileUrl } from "./parseTennisExplorer";

/**
 * Fallback schedule source using a real headless browser. Same parsing logic as
 * TennisExplorerSource (parsePlayerPage) — only how the HTML is obtained differs.
 * Use this if the plain-HTTP source starts failing (e.g. the site adds a JS
 * challenge or the "Next match" table becomes client-rendered). Swapping it in
 * is a one-line change in scraper/index.ts since both implement ScheduleSource.
 */
export class PlaywrightSource implements ScheduleSource {
  async getNextMatch(player: PlayerConfig): Promise<NextMatch | null> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ userAgent: TENNIS_EXPLORER_USER_AGENT });
      await page.goto(playerProfileUrl(player), { waitUntil: "domcontentloaded" });
      await page.waitForSelector("table.result.gamedetail", { timeout: 10_000 });
      const html = await page.content();
      return parsePlayerPage(html, player);
    } finally {
      await browser.close();
    }
  }
}
