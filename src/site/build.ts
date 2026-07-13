import * as fs from "fs/promises";
import * as path from "path";
import { DateTime } from "luxon";
import { PlayerResult, SiteData } from "../types";
import { playerProfileUrl } from "../scraper/parseTennisExplorer";

const DATA_FILE = path.join(__dirname, "..", "..", "data", "data.json");
// template.html/style.css are static assets, not compiled by tsc, so they stay
// in src/ — read them from there regardless of where build.js itself runs from.
const SRC_SITE_DIR = path.join(__dirname, "..", "..", "src", "site");
const TEMPLATE_FILE = path.join(SRC_SITE_DIR, "template.html");
const STYLE_FILE = path.join(SRC_SITE_DIR, "style.css");
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

type Surface = "grass" | "clay" | "hard";

const GRASS_KEYWORDS = ["wimbledon", "queen's", "queens", "halle", "s-hertogenbosch", "newport", "eastbourne", "birmingham", "mallorca"];
const CLAY_KEYWORDS = [
  "roland garros",
  "french open",
  "madrid",
  "rome",
  "internazionali",
  "monte carlo",
  "monte-carlo",
  "hamburg",
  "bastad",
  "båstad",
  "umag",
  "gstaad",
  "kitzbühel",
  "geneva",
  "estoril",
  "munich",
  "münchen",
  "barcelona",
  "santiago",
  "rio de janeiro",
  "buenos aires",
];

const COUNTRY_CODE: Record<string, string> = {
  Italy: "IT",
  Germany: "DE",
  Canada: "CA",
  Serbia: "RS",
  USA: "US",
  "United States": "US",
  "Great Britain": "GB",
  "Czech Republic": "CZ",
  Ukraine: "UA",
  Japan: "JP",
  Belgium: "BE",
  Spain: "ES",
  France: "FR",
  Russia: "RU",
  Australia: "AU",
  Switzerland: "CH",
  Argentina: "AR",
  Greece: "GR",
  Poland: "PL",
  Netherlands: "NL",
  Croatia: "HR",
  Austria: "AT",
  Bulgaria: "BG",
  Norway: "NO",
  Denmark: "DK",
  Sweden: "SE",
  China: "CN",
  Kazakhstan: "KZ",
  Tunisia: "TN",
  Chile: "CL",
  Brazil: "BR",
  Colombia: "CO",
  Mexico: "MX",
  "South Korea": "KR",
  "New Zealand": "NZ",
  Portugal: "PT",
  Romania: "RO",
  Hungary: "HU",
  Slovakia: "SK",
  Slovenia: "SI",
  Finland: "FI",
  India: "IN",
  "South Africa": "ZA",
  Taiwan: "TW",
  Estonia: "EE",
  Latvia: "LV",
  Lithuania: "LT",
};

function countryCode(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_CODE[country] ?? country.slice(0, 2).toUpperCase();
}

function inferSurface(tournament: string): Surface {
  const needle = tournament.toLowerCase();
  if (GRASS_KEYWORDS.some((k) => needle.includes(k))) return "grass";
  if (CLAY_KEYWORDS.some((k) => needle.includes(k))) return "clay";
  return "hard";
}

const SURFACE_LABEL: Record<Surface, string> = { grass: "Gras", clay: "Sand", hard: "Hartplatz" };
const SURFACE_VAR: Record<Surface, string> = {
  grass: "var(--court-grass)",
  clay: "var(--court-clay)",
  hard: "var(--court-hard)",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function formatMatchTime(iso: string | null, fallbackDisplay: string): string {
  if (!iso) {
    return fallbackDisplay || "Termin steht noch nicht fest";
  }
  const dt = DateTime.fromISO(iso).setZone("Europe/Berlin");
  const weekday = dt.setLocale("de").toFormat("ccc");
  return `${weekday}. ${dt.toFormat("dd.MM.")} · ${dt.toFormat("HH:mm")} Uhr`;
}

function renderCard(result: PlayerResult): string {
  const { player, nextMatch, currentRank, country, broadcast, photoPath, error } = result;
  const surface = nextMatch ? inferSurface(nextMatch.tournament) : null;
  const surfaceStyle = surface ? `style="--surface-color:${SURFACE_VAR[surface]}"` : "";

  const code = countryCode(country);
  const metaParts = [code ? escapeHtml(code) : null, currentRank ? `#${currentRank}` : null].filter(Boolean) as string[];
  if (surface) {
    metaParts.push(`<span class="card__surface">${SURFACE_LABEL[surface]}</span>`);
  }
  const metaLine = metaParts.length > 0 ? `<p class="card__tour">${metaParts.join(" &middot; ")}</p>` : "";

  const photo = photoPath
    ? `<img class="card__photo" src="${escapeHtml(photoPath)}" alt="${escapeHtml(player.name)}" loading="lazy" />`
    : `<div class="card__photo card__photo--placeholder">${escapeHtml(initialsOf(player.name))}</div>`;

  let matchBlock: string;
  if (error) {
    matchBlock = `<div class="card__match"><p class="card__error">Daten gerade nicht verfügbar — wird beim nächsten nächtlichen Update erneut versucht.</p></div>`;
  } else if (!nextMatch) {
    matchBlock = `<div class="card__match"><p class="card__empty">Kein Spiel angesetzt.</p></div>`;
  } else {
    const broadcastChips = broadcast && broadcast.broadcasters.length > 0
      ? broadcast.broadcasters.map((b) => `<span class="chip">${escapeHtml(b)}</span>`).join("")
      : `<span class="chip">Sender unbekannt</span>`;

    const tournamentLabel = nextMatch.tournamentUrl
      ? `<a class="card__tournament" href="${escapeHtml(nextMatch.tournamentUrl)}" target="_blank" rel="noopener">${escapeHtml(nextMatch.tournament)}</a>`
      : `<span class="card__tournament">${escapeHtml(nextMatch.tournament)}</span>`;

    const opponentLabel = nextMatch.matchUrl
      ? `<a href="${escapeHtml(nextMatch.matchUrl)}" target="_blank" rel="noopener">${escapeHtml(nextMatch.opponent)}</a>`
      : escapeHtml(nextMatch.opponent);

    matchBlock = `
      <div class="card__match">
        ${tournamentLabel}
        <p class="card__vs">vs ${opponentLabel}</p>
        <div class="card__logistics">
          <span class="card__time">${escapeHtml(formatMatchTime(nextMatch.startTime, nextMatch.startDisplay))}</span>
          ${broadcastChips}
        </div>
      </div>`;
  }

  const playerLink = playerProfileUrl(player);

  return `
    <article class="card" data-tour="${player.tour}" data-has-match="${Boolean(nextMatch)}" ${surfaceStyle}>
      <div class="card__body">
        <div class="card__player">
          ${photo}
          <div>
            <p class="card__name"><a href="${escapeHtml(playerLink)}" target="_blank" rel="noopener">${escapeHtml(player.name)}</a></p>
            ${metaLine}
          </div>
        </div>
        ${matchBlock}
      </div>
    </article>`;
}

function sortResults(results: PlayerResult[]): PlayerResult[] {
  const withTime = results.filter((r) => r.nextMatch?.startTime);
  const withoutTimeButMatch = results.filter((r) => r.nextMatch && !r.nextMatch.startTime);
  const withoutMatch = results.filter((r) => !r.nextMatch);

  withTime.sort((a, b) => (a.nextMatch!.startTime! < b.nextMatch!.startTime! ? -1 : 1));
  withoutMatch.sort((a, b) => (a.currentRank ?? Infinity) - (b.currentRank ?? Infinity));

  return [...withTime, ...withoutTimeButMatch, ...withoutMatch];
}

async function main(): Promise<void> {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  const data = JSON.parse(raw) as SiteData;

  const sorted = sortResults(data.players);
  const cardsHtml = sorted.map(renderCard).join("\n");

  const generatedAt = DateTime.fromISO(data.generatedAt).setZone("Europe/Berlin").setLocale("de").toFormat("cccc, dd.MM.yyyy · HH:mm 'Uhr'");

  let template = await fs.readFile(TEMPLATE_FILE, "utf-8");
  template = template
    .replace("{{GENERATED_AT}}", escapeHtml(generatedAt))
    .replace("{{COUNT_TOTAL}}", String(data.players.length))
    .replace("{{CARDS}}", cardsHtml);

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(path.join(PUBLIC_DIR, "index.html"), template, "utf-8");
  await fs.copyFile(STYLE_FILE, path.join(PUBLIC_DIR, "style.css"));

  console.log(`[site] public/index.html geschrieben (${data.players.length} Spieler).`);
}

main().catch((err) => {
  console.error("[site] Fehler beim Bauen der Seite:", err);
  process.exitCode = 1;
});
