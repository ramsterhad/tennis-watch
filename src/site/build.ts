import * as fs from "fs/promises";
import * as path from "path";
import { DateTime } from "luxon";
import { PlayerResult, SiteData } from "../types";

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
  const { player, nextMatch, broadcast, photoPath, error } = result;
  const surface = nextMatch ? inferSurface(nextMatch.tournament) : null;
  const surfaceStyle = surface ? `style="--surface-color:${SURFACE_VAR[surface]}"` : "";

  const photo = photoPath
    ? `<img class="card__photo" src="${escapeHtml(photoPath)}" alt="${escapeHtml(player.name)}" loading="lazy" />`
    : `<div class="card__photo card__photo--placeholder">${escapeHtml(initialsOf(player.name))}</div>`;

  let matchBlock: string;
  if (error) {
    matchBlock = `<div class="card__match"><p class="card__error">Daten gerade nicht verfügbar — wird beim nächsten nächtlichen Update erneut versucht.</p></div>`;
  } else if (!nextMatch) {
    matchBlock = `<div class="card__match"><p class="card__empty">Kein Spiel angesetzt.</p></div>`;
  } else {
    const chips = broadcast && broadcast.broadcasters.length > 0
      ? `<div class="card__broadcast">${broadcast.broadcasters.map((b) => `<span class="chip">${escapeHtml(b)}</span>`).join("")}</div>`
      : `<div class="card__broadcast"><span class="chip">Sender unbekannt</span></div>`;

    matchBlock = `
      <div class="card__match">
        <p class="card__tournament">${escapeHtml(nextMatch.tournament)}</p>
        <p class="card__round">${escapeHtml(nextMatch.round)}</p>
        <p class="card__vs">gegen <strong>${escapeHtml(nextMatch.opponent)}</strong></p>
        <span class="card__time">${escapeHtml(formatMatchTime(nextMatch.startTime, nextMatch.startDisplay))}</span>
        ${chips}
      </div>`;
  }

  return `
    <article class="card" data-tour="${player.tour}" data-has-match="${Boolean(nextMatch)}" ${surfaceStyle}>
      <div class="card__body">
        <div class="card__player">
          ${photo}
          <div>
            <p class="card__name">${escapeHtml(player.name)}</p>
            <p class="card__tour">${player.tour === "ATP" ? "Herren" : "Damen"}${surface ? ` &middot; <span class="card__surface">${SURFACE_LABEL[surface]}</span>` : ""}</p>
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

  console.log(`[site] public/index.html geschrieben (${sorted.length} Karten).`);
}

main().catch((err) => {
  console.error("[site] Fehler beim Bauen der Seite:", err);
  process.exitCode = 1;
});
