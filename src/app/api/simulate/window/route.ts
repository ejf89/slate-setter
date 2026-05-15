import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getDb, getCached, setCached } from "@/lib/db";
import { getGenresForFilm } from "@/lib/genreMap";
import { genreOverlap, ratingFromScore } from "@/lib/competition";

export const runtime = "nodejs";

const WINDOWS: Record<string, { start: string; end: string; label: string; proxyYear?: number }> = {
  "full-2023": { start: "2023-01-01", end: "2023-12-31", label: "2023" },
  "full-2024": { start: "2024-01-01", end: "2024-12-31", label: "2024" },
  "full-2025": { start: "2025-01-01", end: "2025-12-31", label: "2025" },
  "full-2026": { start: "2025-01-01", end: "2025-12-31", label: "2026", proxyYear: 2026 },
};

const DEFAULT_WINDOW = "full-2026";

function shiftDate(date: string, fromYear: number, toYear: number): string {
  return date.replace(`${fromYear}`, `${toYear}`);
}

type RawWeekend = { weekend_date: string; total_gross: number };
type RawFilm = {
  weekend_date: string;
  gross: number;
  weeks_in_release: number;
  rank: number;
  film_id: number;
  title: string;
  genres: string;
  is_announced?: boolean;
};
interface RawWindowData {
  weekends: RawWeekend[];
  filmsByWeekend: Record<string, RawFilm[]>;
}

interface NumbersRelease {
  date: string;            // ISO YYYY-MM-DD in the target year (2026)
  title: string;
  studio: string;
  genres: string[];
  estimatedOpeningGross: number;
}

// Multi-week holdover curve for a wide release (% of opening gross).
// Based on typical theatrical decay — opens, dips ~50% week 2, then long tail.
const HOLDOVER_DECAY = [1.0, 0.50, 0.30, 0.18, 0.11, 0.07];

let _numbersCache: NumbersRelease[] | null = null;
function loadNumbersReleases(): NumbersRelease[] {
  if (_numbersCache) return _numbersCache;
  try {
    const p = path.join(process.cwd(), "data", "upcoming-numbers-enriched.json");
    if (!fs.existsSync(p)) {
      _numbersCache = [];
      return _numbersCache;
    }
    _numbersCache = JSON.parse(fs.readFileSync(p, "utf-8"));
    return _numbersCache!;
  } catch {
    _numbersCache = [];
    return _numbersCache;
  }
}

// For a 2026 release date, find the closest 2025 weekend in the baseline data
// (within ±7 days). Returns the weekend_date or null if none close enough.
function findClosestBaselineWeekend(date2026: string, weekends: RawWeekend[]): string | null {
  const target2025 = date2026.replace(/^2026/, "2025");
  const targetTime = new Date(`${target2025}T00:00:00Z`).getTime();
  if (isNaN(targetTime)) return null;
  let best: { date: string; diff: number } | null = null;
  for (const w of weekends) {
    const t = new Date(`${w.weekend_date}T00:00:00Z`).getTime();
    const diff = Math.abs(t - targetTime);
    if (!best || diff < best.diff) best = { date: w.weekend_date, diff };
  }
  if (!best) return null;
  if (best.diff > 8 * 86400000) return null;
  return best.date;
}

// Mutates: inject Numbers announcements into the films-by-weekend map with
// week-1 openings on their announced date and decaying holdovers in subsequent
// baseline weekends. Returns the (possibly augmented) weekendTotals so totalGross
// reflects the announced films too.
function augmentWith2026Announcements(raw: RawWindowData): RawWindowData {
  const announcements = loadNumbersReleases();
  if (announcements.length === 0) return raw;

  const sortedWeekends = [...raw.weekends].sort((a, b) =>
    a.weekend_date.localeCompare(b.weekend_date)
  );
  const weekendDates = sortedWeekends.map((w) => w.weekend_date);

  const augmentedFilms: Record<string, RawFilm[]> = {};
  for (const k of weekendDates) {
    augmentedFilms[k] = [...(raw.filmsByWeekend[k] ?? [])];
  }
  const grossDelta: Record<string, number> = {};

  let syntheticId = -100000;
  for (const ann of announcements) {
    const openingBaseline = findClosestBaselineWeekend(ann.date, sortedWeekends);
    if (!openingBaseline) continue;
    const openingIdx = weekendDates.indexOf(openingBaseline);
    if (openingIdx === -1) continue;

    const filmId = syntheticId--;
    const genresJson = JSON.stringify(ann.genres ?? []);

    HOLDOVER_DECAY.forEach((decay, weekOffset) => {
      const idx = openingIdx + weekOffset;
      if (idx >= weekendDates.length) return;
      const baselineDate = weekendDates[idx];
      const gross = Math.round(ann.estimatedOpeningGross * decay);
      if (gross <= 0) return;
      augmentedFilms[baselineDate].push({
        weekend_date: baselineDate,
        gross,
        weeks_in_release: weekOffset + 1,
        rank: 99,
        film_id: filmId,
        title: ann.title,
        genres: genresJson,
        is_announced: true,
      });
      grossDelta[baselineDate] = (grossDelta[baselineDate] ?? 0) + gross;
    });
  }

  const augmentedWeekends = sortedWeekends.map((w) => ({
    weekend_date: w.weekend_date,
    total_gross: w.total_gross + (grossDelta[w.weekend_date] ?? 0),
  }));

  return { weekends: augmentedWeekends, filmsByWeekend: augmentedFilms };
}

function loadRawWindow(windowSlug: string): RawWindowData | null {
  const win = WINDOWS[windowSlug] ?? WINDOWS[DEFAULT_WINDOW];
  const rawKey = `raw:${windowSlug}`;
  const cached = getCached<RawWindowData>(rawKey);
  if (cached) return cached;

  const db = getDb();

  const weekends = db
    .prepare(
      `SELECT weekend_date, SUM(gross) as total_gross
       FROM weekend_performances
       WHERE weekend_date >= ? AND weekend_date <= ?
       GROUP BY weekend_date
       ORDER BY weekend_date`
    )
    .all(win.start, win.end) as RawWeekend[];

  if (weekends.length === 0) return null;

  const allDates = weekends.map((w) => w.weekend_date);
  const placeholders = allDates.map(() => "?").join(",");

  const rows = db
    .prepare(
      `SELECT wp.weekend_date, wp.gross, wp.weeks_in_release, wp.rank,
              f.id as film_id, f.title, f.genres
       FROM weekend_performances wp
       JOIN films f ON f.id = wp.film_id
       WHERE wp.weekend_date IN (${placeholders})
       ORDER BY wp.weekend_date, wp.rank`
    )
    .all(...allDates) as RawFilm[];

  const filmsByWeekend: Record<string, RawFilm[]> = {};
  for (const row of rows) {
    if (!filmsByWeekend[row.weekend_date]) filmsByWeekend[row.weekend_date] = [];
    filmsByWeekend[row.weekend_date].push(row);
  }

  let raw: RawWindowData = { weekends, filmsByWeekend };

  // For 2026 windows, augment with The Numbers' announced wide releases.
  if (win.proxyYear === 2026) {
    raw = augmentWith2026Announcements(raw);
  }

  setCached(rawKey, raw);
  return raw;
}

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const compsParam  = url.searchParams.get("comps")  ?? "";
  const genresParam = url.searchParams.get("genres") ?? "";
  const windowSlug  = url.searchParams.get("window") ?? DEFAULT_WINDOW;

  const win = WINDOWS[windowSlug] ?? WINDOWS[DEFAULT_WINDOW];

  const compIds = compsParam
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n));

  const directGenres = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  // Fast path: exact scored result already cached
  const scoredKey = `scored:${windowSlug}:g:${[...directGenres].sort().join(",")}:c:${[...compIds].sort().join(",")}`;
  const cachedScored = getCached<object>(scoredKey);
  if (cachedScored) return NextResponse.json(cachedScored);

  // Resolve comp film genres (only DB hit outside raw cache)
  const genreSet = new Set<string>(directGenres);
  if (compIds.length > 0) {
    const db = getDb();
    const placeholders = compIds.map(() => "?").join(",");
    const compFilms = db
      .prepare(`SELECT title, genres FROM films WHERE id IN (${placeholders})`)
      .all(...compIds) as Array<{ title: string; genres: string }>;
    for (const film of compFilms) {
      const dbGenres: string[] = JSON.parse(film.genres || "[]");
      getGenresForFilm(film.title, dbGenres).forEach((g) => genreSet.add(g));
    }
  }
  const targetGenres = Array.from(genreSet);

  const raw = loadRawWindow(windowSlug);
  if (!raw) {
    return NextResponse.json({ weekends: [], targetGenres, window: win.label });
  }

  const resultWeekends = raw.weekends.map((w) => {
    const films = raw.filmsByWeekend[w.weekend_date] ?? [];
    const totalGross = w.total_gross;
    let competitionScore = 0;

    const filmEntries = films.map((film) => {
      const dbGenres: string[] = JSON.parse(film.genres || "[]");
      // For announced (synthetic) films, the genres we stored are authoritative.
      // For real DB films, fall through the genreMap override layer.
      const genres = film.is_announced ? dbGenres : getGenresForFilm(film.title, dbGenres);
      const overlap = targetGenres.length > 0 ? genreOverlap(targetGenres, genres) : 0;
      const holdoverDecay = 1 / (film.weeks_in_release || 1);
      const marketShare = film.gross / (totalGross || 1);
      const threatScore = overlap * holdoverDecay * marketShare;
      competitionScore += threatScore;
      return {
        filmId: film.film_id,
        title: film.title,
        genres,
        gross: film.gross,
        weeksInRelease: film.weeks_in_release,
        rank: film.rank,
        threatScore,
        isThreat: overlap >= 0.6 && threatScore >= 0.03,
        isAnnounced: !!film.is_announced,
      };
    });

    const rating = ratingFromScore(competitionScore);
    const displayDate = win.proxyYear
      ? shiftDate(w.weekend_date, 2025, win.proxyYear)
      : w.weekend_date;

    return {
      date: displayDate,
      sourceDate: w.weekend_date,
      totalGross,
      competitionScore,
      rating,
      films: filmEntries,
    };
  });

  const result = {
    weekends: resultWeekends,
    targetGenres,
    window: win.label,
    isProjection: !!win.proxyYear,
  };

  setCached(scoredKey, result);
  return NextResponse.json(result);
}
