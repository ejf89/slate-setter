import { NextRequest, NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { FILM_GENRE_MAP, getGenresForFilm } from "@/lib/genreMap";
import { genreOverlap, ratingFromScore } from "@/lib/competition";

export const runtime = "nodejs";

// Map window slug → [startDate, endDate] using actual DB data.
// Future windows (2026+) proxy to equivalent 2025 dates.
const WINDOWS: Record<string, { start: string; end: string; label: string; proxyYear?: number }> = {
  // Historical full years
  "full-2022":   { start: "2022-01-01", end: "2022-12-31", label: "2022" },
  "full-2023":   { start: "2023-01-01", end: "2023-12-31", label: "2023" },
  "full-2024":   { start: "2024-01-01", end: "2024-12-31", label: "2024" },
  "full-2025":   { start: "2025-01-01", end: "2025-12-31", label: "2025" },
  // 2026 projected (uses 2025 data as structural analog)
  "full-2026":   { start: "2025-01-01", end: "2025-12-31", label: "2026",        proxyYear: 2026 },
  // Seasonal slices (historical)
  "spring-2025": { start: "2025-03-01", end: "2025-05-31", label: "Spring 2025" },
  "summer-2025": { start: "2025-06-01", end: "2025-08-31", label: "Summer 2025" },
  "fall-2025":   { start: "2025-08-29", end: "2025-12-31", label: "Fall 2025" },
  "spring-2024": { start: "2024-03-01", end: "2024-05-31", label: "Spring 2024" },
  "summer-2024": { start: "2024-06-01", end: "2024-08-31", label: "Summer 2024" },
  "fall-2024":   { start: "2024-08-30", end: "2024-12-31", label: "Fall 2024" },
  // 2026 seasonal projections
  "spring-2026": { start: "2025-03-01", end: "2025-05-31", label: "Spring 2026", proxyYear: 2026 },
  "summer-2026": { start: "2025-06-01", end: "2025-08-31", label: "Summer 2026", proxyYear: 2026 },
  "fall-2026":   { start: "2025-08-29", end: "2025-12-31", label: "Fall 2026",   proxyYear: 2026 },
  "holiday-2026":{ start: "2025-11-01", end: "2025-12-31", label: "Holiday 2026", proxyYear: 2026 },
};

function shiftDate(date: string, fromYear: number, toYear: number): string {
  return date.replace(`${fromYear}`, `${toYear}`);
}

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const compsParam  = url.searchParams.get("comps")  ?? "";
  const genresParam = url.searchParams.get("genres") ?? "";
  const windowSlug  = url.searchParams.get("window") ?? "fall-2026";

  const window = WINDOWS[windowSlug] ?? WINDOWS["fall-2026"];

  const compIds = compsParam
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n));

  // Genres can come directly from the param OR be resolved from comp IDs
  const directGenres = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const cacheKey = `window:${windowSlug}:g:${[...directGenres].sort().join(",")}:c:${[...compIds].sort().join(",")}`;
  const cached = getCached<object>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const db = getDb();

  // Build target genres: start with direct genres, then enrich from comp film lookups
  const genreSet = new Set<string>(directGenres);

  if (compIds.length > 0) {
    const placeholders = compIds.map(() => "?").join(",");
    const compFilms = db
      .prepare(`SELECT title, genres FROM films WHERE id IN (${placeholders})`)
      .all(...compIds) as Array<{ title: string; genres: string }>;

    for (const film of compFilms) {
      const dbGenres: string[] = JSON.parse(film.genres || "[]");
      const genres = getGenresForFilm(film.title, dbGenres);
      genres.forEach((g) => genreSet.add(g));
    }
  }

  let targetGenres = Array.from(genreSet);

  // Get all weekends in window
  const weekends = db
    .prepare(
      `SELECT weekend_date, SUM(gross) as total_gross
       FROM weekend_performances
       WHERE weekend_date >= ? AND weekend_date <= ?
       GROUP BY weekend_date
       ORDER BY weekend_date`
    )
    .all(window.start, window.end) as Array<{
    weekend_date: string;
    total_gross: number;
  }>;

  if (weekends.length === 0) {
    return NextResponse.json({ weekends: [], targetGenres, window: window.label });
  }

  const allDates = weekends.map((w) => w.weekend_date);
  const placeholders = allDates.map(() => "?").join(",");

  // Load all films across the window in one query
  const rows = db
    .prepare(
      `SELECT wp.weekend_date, wp.gross, wp.weeks_in_release, wp.rank,
              f.id as film_id, f.title, f.genres
       FROM weekend_performances wp
       JOIN films f ON f.id = wp.film_id
       WHERE wp.weekend_date IN (${placeholders})
       ORDER BY wp.weekend_date, wp.rank`
    )
    .all(...allDates) as Array<{
    weekend_date: string;
    gross: number;
    weeks_in_release: number;
    rank: number;
    film_id: number;
    title: string;
    genres: string;
  }>;

  // Group films by weekend
  const filmsByWeekend = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!filmsByWeekend.has(row.weekend_date)) filmsByWeekend.set(row.weekend_date, []);
    filmsByWeekend.get(row.weekend_date)!.push(row);
  }

  // Build result weekends
  const resultWeekends = weekends.map((w) => {
    const films = filmsByWeekend.get(w.weekend_date) ?? [];
    const totalGross = w.total_gross;

    let competitionScore = 0;
    if (targetGenres.length > 0) {
      competitionScore = films.reduce((score, film) => {
        const dbGenres: string[] = JSON.parse(film.genres || "[]");
        const genres = getGenresForFilm(film.title, dbGenres);
        const overlap = genreOverlap(targetGenres, genres);
        const holdoverDecay = 1 / (film.weeks_in_release || 1);
        const marketShare = film.gross / (totalGross || 1);
        return score + overlap * holdoverDecay * marketShare;
      }, 0);
    }

    const rating = ratingFromScore(competitionScore);

    const filmEntries = films.map((film) => {
      const dbGenres: string[] = JSON.parse(film.genres || "[]");
      const genres = getGenresForFilm(film.title, dbGenres);
      const overlap = genreOverlap(targetGenres, genres);
      const threatScore =
        overlap * (1 / (film.weeks_in_release || 1)) * (film.gross / (totalGross || 1));
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

    // If proxying to a future year, shift the date
    const displayDate =
      window.proxyYear
        ? shiftDate(w.weekend_date, 2025, window.proxyYear)
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
    window: window.label,
    isProjection: !!window.proxyYear,
  };

  setCached(cacheKey, result);
  return NextResponse.json(result);
}
