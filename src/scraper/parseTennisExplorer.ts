import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { DateTime } from "luxon";
import { NextMatch, PlayerConfig, ScrapedPlayerInfo } from "../types";

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

const TENNIS_EXPLORER_ORIGIN = "https://www.tennisexplorer.com";

function absoluteUrl(href: string | undefined): string | null {
  if (!href) return null;
  return href.startsWith("http") ? href : `${TENNIS_EXPLORER_ORIGIN}${href}`;
}

function parseNextMatch($: CheerioAPI, player: PlayerConfig): NextMatch | null {
  const table = $("table.result.gamedetail").first();
  if (table.length === 0) {
    throw new Error(`Konnte "Next match"-Tabelle für ${player.name} nicht finden (Seitenstruktur geändert?)`);
  }

  const row = table.find("tbody tr").first();
  if (row.find("td.noData").length > 0 || row.length === 0) {
    return null;
  }

  const tournamentLink = row.find("td.tl a").first();
  const tournament = tournamentLink.text().trim();
  const tournamentUrl = absoluteUrl(tournamentLink.attr("href"));

  // Bracket not fully drawn yet: tennisexplorer collapses round/start/match into
  // one "Next opponent is not known yet" cell instead of the usual 4 columns.
  const pendingCell = row.find("td.tl[colspan]");
  if (pendingCell.length > 0) {
    return {
      tournament: tournament || "Unbekanntes Turnier",
      tournamentUrl,
      round: "Auslosung offen",
      startTime: null,
      startDisplay: "Termin steht noch nicht fest",
      opponent: "noch offen",
      opponentRank: null,
      matchUrl: null,
    };
  }

  const round = row.find("td[title]").first().text().trim();
  const startRaw = row.find("td.time").first().text();
  const matchLink = row.find("th.t-name a").first();
  const matchText = matchLink.text().trim();
  const matchUrl = absoluteUrl(matchLink.attr("href"));

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
    tournamentUrl,
    round: round || "-",
    startTime: iso,
    startDisplay: display,
    opponent: opponent || "TBD",
    opponentRank: null,
    matchUrl,
  };
}

/**
 * The "Next match" row only links to the match-detail page (both players' names
 * combined in one link, e.g. "Baiant R. - Prachar J."), not to the opponent's own
 * profile — so their ranking isn't available yet at this point. This reads the
 * match-detail page's player links (the first two "/player/<slug>" links, before
 * the "?annual=" stats links further down) and returns whichever one isn't `player`,
 * so the caller can fetch that profile page and read their rank the normal way.
 */
export function extractOpponentSlug(matchDetailHtml: string, player: PlayerConfig): string | null {
  const $ = cheerio.load(matchDetailHtml);
  const surname = lastNameOf(player.name);
  const links = $('a[href^="/player/"]')
    .filter((_, el) => !(el.attribs.href || "").includes("?"))
    .toArray()
    .slice(0, 2);

  for (const el of links) {
    const href = $(el).attr("href") || "";
    const name = $(el).text().trim();
    if (stripDiacritics(name).toLowerCase().includes(surname)) continue;
    const slug = href.replace(/^\/player\//, "").replace(/\/$/, "");
    if (slug) return slug;
  }
  return null;
}

/** Reads a player's current rank straight off their (already-fetched) profile page HTML. */
export function parseRankFromProfileHtml(html: string): number | null {
  return parseCurrentRank(cheerio.load(html));
}

/** Reads "Current/Highest rank - singles: 4. / 2." from the player-info box; returns the current figure. */
function parseCurrentRank($: CheerioAPI): number | null {
  const text = $(".box.boxBasic .date")
    .filter((_, el) => $(el).text().includes("Current/Highest rank - singles"))
    .first()
    .text();
  const match = text.match(/singles:\s*(\d+)\s*\./);
  return match ? Number(match[1]) : null;
}

/** Reads "Country: Italy" from the player-info box. */
function parseCountry($: CheerioAPI): string | null {
  const text = $(".box.boxBasic .date")
    .filter((_, el) => $(el).text().trim().startsWith("Country:"))
    .first()
    .text();
  const match = text.match(/Country:\s*(.+)/);
  return match ? match[1].trim() : null;
}

/**
 * Parses a tennisexplorer.com player-profile page (raw HTML, however it was fetched)
 * into next-match + ranking info. Shared by both the plain-HTTP source and the
 * Playwright fallback so the two only differ in how they obtain the HTML, not in
 * how they read it.
 */
export function parsePlayerPage(html: string, player: PlayerConfig): ScrapedPlayerInfo {
  const $ = cheerio.load(html);
  return {
    nextMatch: parseNextMatch($, player),
    currentRank: parseCurrentRank($),
    country: parseCountry($),
  };
}

export function playerProfileUrl(player: PlayerConfig): string {
  return `https://www.tennisexplorer.com/player/${player.tennisExplorerSlug}/`;
}
