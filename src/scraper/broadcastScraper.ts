import { chromium } from "playwright";
import { BroadcastInfo, Tour } from "../types";

interface BroadcasterRule {
  match: string;
  broadcasters: string[];
  note?: string;
}

interface BroadcasterConfig {
  rules: BroadcasterRule[];
  defaultByTour: Record<Tour, string[]>;
}

const KNOWN_BROADCASTERS = [
  "Sky",
  "DAZN",
  "Amazon Prime Video",
  "Amazon Prime",
  "Prime Video",
  "ARD",
  "ZDF",
  "Eurosport",
  "Sport1",
  "MagentaSport",
  "WOW",
];

/** Baseline lookup from the manually-maintained config (long-term broadcast contracts). */
export function resolveConfigBroadcast(
  tournament: string,
  tour: Tour,
  config: BroadcasterConfig
): BroadcastInfo | null {
  const needle = tournament.toLowerCase();
  const rule = config.rules.find((r) => needle.includes(r.match.toLowerCase()));
  if (rule) {
    return { broadcasters: rule.broadcasters, note: rule.note, source: "config" };
  }
  const fallback = config.defaultByTour[tour];
  if (fallback) {
    return { broadcasters: fallback, source: "config" };
  }
  return null;
}

/**
 * Best-effort attempt to find a same-day broadcaster mention for a tournament on a
 * German TV-listing page. These pages tend to be JS-rendered and inconsistently
 * structured, so this scans rendered body text for the tournament name and looks
 * for a known broadcaster keyword nearby, rather than relying on fragile selectors.
 * Returns null (never throws to the caller) if nothing usable was found — the
 * orchestrator then falls back to resolveConfigBroadcast.
 */
export async function scrapeBroadcastForTournament(tournament: string): Promise<string[] | null> {
  const candidateUrls = ["https://www.tennisnet.com/tv/", "https://www.sport.de/tennis/im-tv-und-stream/"];

  for (const url of candidateUrls) {
    try {
      const found = await scanPageForBroadcast(url, tournament);
      if (found && found.length > 0) {
        return found;
      }
    } catch (err) {
      console.warn(`[broadcastScraper] Best-effort scrape von ${url} fehlgeschlagen: ${(err as Error).message}`);
    }
  }
  return null;
}

async function scanPageForBroadcast(url: string, tournament: string): Promise<string[] | null> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const needle = tournament.toLowerCase();
    const matchingIndexes = lines
      .map((line, idx) => (line.toLowerCase().includes(needle) ? idx : -1))
      .filter((idx) => idx >= 0);

    if (matchingIndexes.length === 0) {
      return null;
    }

    const found = new Set<string>();
    for (const idx of matchingIndexes) {
      const context = lines.slice(Math.max(0, idx - 1), idx + 3).join(" ");
      for (const broadcaster of KNOWN_BROADCASTERS) {
        if (context.includes(broadcaster)) {
          found.add(broadcaster);
        }
      }
    }
    return found.size > 0 ? Array.from(found) : null;
  } finally {
    await browser.close();
  }
}
