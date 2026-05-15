import { NextRequest, NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { getGenresForFilm } from "@/lib/genreMap";
import { genreOverlap, ratingFromScore } from "@/lib/competition";

export const runtime = "nodejs";

const WINDOWS: Record<string, { start: string; end: string; label: string; proxyYear?: number }> = {
  "full-2022":   { start: "2022-01-01", end: "2022-12-31", label: "2022" },
  "full-2023":   { start: "2023-01-01", end: "2023-12-31", label: "2023" },
  "full-2024":   { start: "2024-01-01", end: "2024-12-31", label: "2024" },
  "full-2025":   { start: "2025-01-01", end: "2025-12-31", label: "2025" },
  "full-2026":   { start: "2025-01-01", end: "2025-12-31", label: "2026",        proxyYear: 2026 },
  "spring-2025": { start: "2025-03-01", end: "2025-05-31", label: "Spring 2025" },
  "summer-2025": { start: "2025-06-01", end: "2025-08-31", label: "Summer 2025" },
  "fall-2025":   { start: "2025-08-29", end: "2025-12-31", label: "Fall 2025" },
  "spring-2024": { start: "2024-03-01", end: "2024-05-31", label: "Spring 2024" },
  "summer-2024": { start: "2024-06-01", end: "2024-08-31", label: "Summer 2024" },
  "fall-2024":   { start: "2024-08-30", end: "2024-12-31", label: "Fall 2024" },
  "spring-2026": { start: "2025-03-01", end: "2025-05-31", label: "Spring 2026", proxyYear: 2026 },
  "summer-2026": { start: "2025-06-01", end: "2025-08-31", label: "Summer 2026", proxyYear: 2026 },
  "fall-2026":   { start: "2025-08-29", end: "2025-12-31", label: "Fall 2026",   proxyYear: 2026 },
  "holiday-2026":{ start: "2025-11-01", end: "2025-12-31", label: "Holiday 2026", proxyYear: 2026 },
};

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
};
interface RawWindowData {
  weekends: RawWeekend[];
  filmsByWeekend: Record<string, RawFilm[]>;
}

function loadRawWindow(windowSlug: string): RawWindowData | null {
  const win = WINDOWS[windowSlug] ?? WINDOWS["fall-2026"];
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

  const raw: RawWindowData = { weekends, filmsByWeekend };
  setCached(rawKey, raw);
  return raw;
}

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const compsParam  = url.searchParams.get("comps")  ?? "";
  const genresParam = url.searchParams.get("genres") ?? "";
  const windowSlug  = url.searchParams.get("window") ?? "fall-2026";

  const win = WINDOWS[windowSlug] ?? WINDOWS["fall-2026"];

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

  // Load raw window data (cached per slug — shared across all genre queries)
  const raw = loadRawWindow(windowSlug);
  if (!raw) {
    return NextResponse.json({ weekends: [], targetGenres, window: win.label });
  }

  // Score computation in pure JS — no DB access
  const resultWeekends = raw.weekends.map((w) => {
    const films = raw.filmsByWeekend[w.weekend_date] ?? [];
    const totalGross = w.total_gross;
    let competitionScore = 0;

    const filmEntries = films.map((film) => {
      const dbGenres: string[] = JSON.parse(film.genres || "[]");
      const genres = getGenresForFilm(film.title, dbGenres);
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
