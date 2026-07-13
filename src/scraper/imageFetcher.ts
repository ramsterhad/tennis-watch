import * as fs from "fs/promises";
import * as path from "path";
import { PlayerConfig } from "../types";

const IMAGE_DIR = path.join(__dirname, "..", "..", "public", "images");
const USER_AGENT = "tennis-watch/1.0 (privates Hobbyprojekt)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wikimedia rate-limits fairly aggressively from shared/cloud IPs; a couple of backed-off retries smooth that over. */
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastRes: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status !== 429) {
      return res;
    }
    lastRes = res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (i + 1));
  }
  return lastRes!;
}

/**
 * Fetches (and caches) a player photo via Wikipedia's public REST summary API —
 * no auth needed, and the returned thumbnail is Wikimedia Commons content
 * (CC-BY-SA / public domain, attributed in the site footer). Downloads are
 * cached on disk so a nightly re-run only fetches new players, not existing ones.
 * Returns the path to use in the generated site (relative to public/), or null
 * if no photo could be obtained (the frontend then shows a placeholder).
 */
export async function fetchPlayerPhoto(player: PlayerConfig): Promise<string | null> {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const destRelative = `images/${player.id}.jpg`;
  const destAbsolute = path.join(IMAGE_DIR, `${player.id}.jpg`);

  try {
    await fs.access(destAbsolute);
    return destRelative;
  } catch {
    // not cached yet, fetch below
  }

  try {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      player.wikipediaTitle
    )}`;
    const summaryRes = await fetchWithRetry(summaryUrl);
    if (!summaryRes.ok) {
      console.warn(`[imageFetcher] Wikipedia-Summary für ${player.name} fehlgeschlagen: HTTP ${summaryRes.status}`);
      return null;
    }
    const summary = (await summaryRes.json()) as { thumbnail?: { source: string } };
    const imageUrl = summary.thumbnail?.source;
    if (!imageUrl) {
      console.warn(`[imageFetcher] Kein Foto in Wikipedia-Summary für ${player.name}`);
      return null;
    }

    const imgRes = await fetchWithRetry(imageUrl);
    if (!imgRes.ok) {
      console.warn(`[imageFetcher] Foto-Download für ${player.name} fehlgeschlagen: HTTP ${imgRes.status}`);
      return null;
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await fs.writeFile(destAbsolute, buffer);
    return destRelative;
  } catch (err) {
    console.warn(`[imageFetcher] Fehler beim Laden des Fotos für ${player.name}: ${(err as Error).message}`);
    return null;
  }
}
