import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { NextMatch, PlayerConfig } from "../types";

export const TENNIS_EXPLORER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return stripDiacritics(parts[parts.length - 1]).toLowerCase();
}

/** Parses tennisexplorer's "DD.MM. HH:mm" start cell into an ISO string (Europe/Berlin), rolling into next year if needed. */
function parseStart(raw: string): { iso: string | null; display: string } {
  const display = raw.replace(/\s+/g, " ").trim();
  const match = display.match(/(\d{1,2})\.(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
  if (!match) {
    return { iso: null, display };
  }
  const [, day, month, hour, minute] = match;
  const now = DateTime.now().setZone("Europe/Berlin");
  let candidate = DateTime.fromObject(
    {
      year: now.year,
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    },
    { zone: "Europe/Berlin" }
  );
  if (candidate.isValid && candidate < now.minus({ days: 30 })) {
    candidate = candidate.plus({ years: 1 });
  }
  return { iso: candidate.isValid ? candidate.toISO() : null, display };
}

/**
 * Parses a tennisexplorer.com player-profile page (raw HTML, however it was fetched)
 * into a NextMatch. Shared by both the plain-HTTP source and the Playwright fallback
 * so the two only differ in how they obtain the HTML, not in how they read it.
 */
export function parsePlayerPage(html: string, player: PlayerConfig): NextMatch | null {
  const $ = cheerio.load(html);

  const table = $("table.result.gamedetail").first();
  if (table.length === 0) {
    throw new Error(`Konnte "Next match"-Tabelle für ${player.name} nicht finden (Seitenstruktur geändert?)`);
  }

  const row = table.find("tbody tr").first();
  if (row.find("td.noData").length > 0 || row.length === 0) {
    return null;
  }

  const tournament = row.find("td.tl a").first().text().trim();

  // Bracket not fully drawn yet: tennisexplorer collapses round/start/match into
  // one "Next opponent is not known yet" cell instead of the usual 4 columns.
  const pendingCell = row.find("td.tl[colspan]");
  if (pendingCell.length > 0) {
    return {
      tournament: tournament || "Unbekanntes Turnier",
      round: "Auslosung offen",
      startTime: null,
      startDisplay: "Termin steht noch nicht fest",
      opponent: "noch offen",
    };
  }

  const round = row.find("td[title]").first().text().trim();
  const startRaw = row.find("td.time").first().text();
  const matchText = row.find("th.t-name a").first().text().trim();

  const { iso, display } = parseStart(startRaw);

  const sides = matchText.split(" - ").map((s) => s.trim());
  const surname = lastNameOf(player.name);
  let opponent = matchText;
  if (sides.length === 2) {
    const [a, b] = sides;
    if (stripDiacritics(a).toLowerCase().includes(surname)) {
      opponent = b;
    } else if (stripDiacritics(b).toLowerCase().includes(surname)) {
      opponent = a;
    }
  }

  return {
    tournament: tournament || "Unbekanntes Turnier",
    round: round || "-",
    startTime: iso,
    startDisplay: display,
    opponent: opponent || "TBD",
  };
}

export function playerProfileUrl(player: PlayerConfig): string {
  return `https://www.tennisexplorer.com/player/${player.tennisExplorerSlug}/`;
}
