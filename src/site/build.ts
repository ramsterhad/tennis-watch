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

/** Homepage/live-hub for each broadcaster in src/config/broadcasters.json — not deep
 *  links to a specific match (those aren't known ahead of time), just where to start. */
const BROADCASTER_URL: Record<string, string> = {
  Sky: "https://www.skysport.de/tennis",
  DAZN: "https://www.dazn.com/de-DE",
  "Amazon Prime Video": "https://www.amazon.de/gp/video/storefront",
  "Amazon Prime": "https://www.amazon.de/gp/video/storefront",
  "Prime Video": "https://www.amazon.de/gp/video/storefront",
  ARD: "https://www.ard.de/live",
  ZDF: "https://www.zdf.de/live-tv",
  Eurosport: "https://www.eurosport.de/tennis/",
  Sport1: "https://www.sport1.de/live-tv",
  MagentaSport: "https://www.magentasport.de/",
  WOW: "https://www.wow.de/sport",
};

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

const SURFACE_LABEL: Record<Surface, string> = { grass: "Gras", clay: "Sand", hard: "Halle" };
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
    return fallbackDisplay || "Termin offen";
  }
  const dt = DateTime.fromISO(iso).setZone("Europe/Berlin");
  const weekday = dt.setLocale("de").toFormat("ccc");
  return `${weekday}. ${dt.toFormat("dd.MM.")} · ${dt.toFormat("HH:mm")}`;
}

function renderRow(result: PlayerResult): string {
  const { player, nextMatch, currentRank, country, broadcast, photoPath, error } = result;
  const surface = nextMatch ? inferSurface(nextMatch.tournament) : null;
  const rowStyle = surface ? `style="--surface-color:${SURFACE_VAR[surface]}"` : "";

  const photo = photoPath
    ? `<img class="schedule__photo" src="${escapeHtml(photoPath)}" alt="${escapeHtml(player.name)}" loading="lazy" />`
    : `<div class="schedule__photo schedule__photo--placeholder">${escapeHtml(initialsOf(player.name))}</div>`;

  const playerLink = playerProfileUrl(player);
  const code = countryCode(country);
  const playerCell = `
    <span role="cell" class="schedule__cell schedule__cell--player">
      <a class="schedule__name" href="${escapeHtml(playerLink)}" target="_blank" rel="noopener">${escapeHtml(player.name)}</a>
      ${currentRank ? `<span class="schedule__rank">${currentRank}</span>` : ""}
      ${code ? `<span class="schedule__country">${escapeHtml(code)}</span>` : ""}
    </span>`;

  let opponentCell: string;
  let eventCell = "";
  let dateCell = "";
  let broadcastCell = "";

  if (error) {
    opponentCell = `<span role="cell" class="schedule__cell schedule__cell--wide"><span class="schedule__error">Daten gerade nicht verfügbar — wird beim nächsten nächtlichen Update erneut versucht.</span></span>`;
  } else if (!nextMatch) {
    opponentCell = `<span role="cell" class="schedule__cell schedule__cell--wide"><span class="schedule__empty">Kein Spiel angesetzt.</span></span>`;
  } else {
    const opponentRank = nextMatch.opponentRank ?? null;
    const opponentLabel = nextMatch.matchUrl
      ? `<a class="schedule__name" href="${escapeHtml(nextMatch.matchUrl)}" target="_blank" rel="noopener">${escapeHtml(nextMatch.opponent)}</a>`
      : `<span class="schedule__name">${escapeHtml(nextMatch.opponent)}</span>`;
    opponentCell = `
      <span role="cell" class="schedule__cell schedule__cell--player schedule__cell--opponent">
        ${opponentLabel}
        ${opponentRank ? `<span class="schedule__rank">${opponentRank}</span>` : ""}
      </span>`;

    const tournamentLabel = nextMatch.tournamentUrl
      ? `<a class="schedule__tournament" href="${escapeHtml(nextMatch.tournamentUrl)}" target="_blank" rel="noopener">${escapeHtml(nextMatch.tournament)}</a>`
      : `<span class="schedule__tournament">${escapeHtml(nextMatch.tournament)}</span>`;
    eventCell = `
      <span role="cell" class="schedule__cell schedule__cell--event">
        ${tournamentLabel}${surface ? ` <span class="schedule__surface">(${SURFACE_LABEL[surface]})</span>` : ""}
      </span>`;

    dateCell = `<span role="cell" class="schedule__cell schedule__cell--date">${escapeHtml(formatMatchTime(nextMatch.startTime, nextMatch.startDisplay))}</span>`;

    const broadcastChips = broadcast && broadcast.broadcasters.length > 0
      ? broadcast.broadcasters
          .map((b) => {
            const url = BROADCASTER_URL[b];
            return url
              ? `<a class="chip" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(b)}</a>`
              : `<span class="chip">${escapeHtml(b)}</span>`;
          })
          .join("")
      : `<span class="chip">Sender unbekannt</span>`;
    broadcastCell = `<span role="cell" class="schedule__cell schedule__cell--broadcast">${broadcastChips}</span>`;
  }

  return `
    <div class="schedule__row" role="row" data-tour="${player.tour}" data-has-match="${Boolean(nextMatch)}" ${rowStyle}>
      <span role="cell" class="schedule__cell schedule__cell--photo">${photo}</span>
      ${playerCell}
      ${opponentCell}
      ${eventCell}
      ${dateCell}
      ${broadcastCell}
    </div>`;
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
  const rowsHtml = sorted.map(renderRow).join("\n");

  const generatedAt = DateTime.fromISO(data.generatedAt).setZone("Europe/Berlin").setLocale("de").toFormat("cccc, dd.MM.yyyy · HH:mm 'Uhr'");

  let template = await fs.readFile(TEMPLATE_FILE, "utf-8");
  template = template
    .replace("{{GENERATED_AT}}", escapeHtml(generatedAt))
    .replace("{{COUNT_TOTAL}}", String(data.players.length))
    .replace("{{ROWS}}", rowsHtml);

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(path.join(PUBLIC_DIR, "index.html"), template, "utf-8");
  await fs.copyFile(STYLE_FILE, path.join(PUBLIC_DIR, "style.css"));

  console.log(`[site] public/index.html geschrieben (${data.players.length} Spieler).`);
}

main().catch((err) => {
  console.error("[site] Fehler beim Bauen der Seite:", err);
  process.exitCode = 1;
});
