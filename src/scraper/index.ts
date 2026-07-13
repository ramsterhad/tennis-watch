import * as fs from "fs/promises";
import * as path from "path";
import { DateTime } from "luxon";
import { PlayerConfig, PlayerResult, SiteData, Tour } from "../types";
import { TennisExplorerSource } from "./tennisExplorerSource";
import { resolveConfigBroadcast, scrapeBroadcastForTournament } from "./broadcastScraper";
import { fetchPlayerPhoto } from "./imageFetcher";

import playersConfig from "../config/players.json";
import broadcastersConfig from "../config/broadcasters.json";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

const players = playersConfig as PlayerConfig[];
const scheduleSource = new TennisExplorerSource();
const broadcastScrapeCache = new Map<string, string[] | null>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapePlayer(player: PlayerConfig): Promise<PlayerResult> {
  const photoPath = await fetchPlayerPhoto(player);

  let nextMatch: PlayerResult["nextMatch"] = null;
  let error: string | undefined;
  try {
    nextMatch = await scheduleSource.getNextMatch(player);
  } catch (err) {
    error = (err as Error).message;
    console.error(`[scraper] ${player.name}: ${error}`);
  }

  let broadcast: PlayerResult["broadcast"] = null;
  if (nextMatch) {
    if (!broadcastScrapeCache.has(nextMatch.tournament)) {
      const scraped = await scrapeBroadcastForTournament(nextMatch.tournament).catch((err) => {
        console.warn(`[scraper] Broadcast-Scrape für "${nextMatch!.tournament}" fehlgeschlagen: ${err.message}`);
        return null;
      });
      broadcastScrapeCache.set(nextMatch.tournament, scraped);
    }
    const scraped = broadcastScrapeCache.get(nextMatch.tournament) ?? null;
    if (scraped && scraped.length > 0) {
      broadcast = { broadcasters: scraped, source: "scraped" };
    } else {
      broadcast = resolveConfigBroadcast(nextMatch.tournament, player.tour as Tour, broadcastersConfig as any);
    }
  }

  return { player, nextMatch, broadcast, photoPath, error };
}

async function main(): Promise<void> {
  const results: PlayerResult[] = [];
  for (const player of players) {
    console.log(`[scraper] Verarbeite ${player.name}...`);
    results.push(await scrapePlayer(player));
    await sleep(500);
  }

  const siteData: SiteData = {
    generatedAt: DateTime.now().setZone("Europe/Berlin").toISO() ?? new Date().toISOString(),
    players: results,
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(siteData, null, 2), "utf-8");

  const withMatch = results.filter((r) => r.nextMatch).length;
  const withError = results.filter((r) => r.error).length;
  console.log(`[scraper] Fertig: ${results.length} Spieler, ${withMatch} mit anstehendem Match, ${withError} Fehler.`);
}

main().catch((err) => {
  console.error("[scraper] Unerwarteter Fehler:", err);
  process.exitCode = 1;
});
