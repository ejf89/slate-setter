import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scoreWeekend, buildCompetitors, ratingFromScore } from "@/lib/competition";
import type { SimulateResult, AlternativeWeekend, FilmInTheater } from "@/lib/types";

export async function POST(req: Request) {
  const { date, genres, excludeCovid = false } = await req.json() as {
    date: string; genres: string[]; excludeCovid?: boolean;
  };
  if (!date || !genres?.length) {
    return NextResponse.json({ error: "date and genres required" }, { status: 400 });
  }

  const db = getDb();

  // Films in theaters this weekend
  const filmRows = db.prepare(
    `SELECT wp.rank, wp.gross, wp.cumulative_gross, wp.weeks_in_release, wp.theaters,
            f.id as film_id, f.title, f.studio, f.genres, f.mpaa_rating, f.overview
     FROM weekend_performances wp
     JOIN films f ON f.id = wp.film_id
     WHERE wp.weekend_date = ?
     ORDER BY wp.rank ASC`
  ).all(date) as Array<{
    rank: number; gross: number; cumulative_gross: number; weeks_in_release: number;
    theaters: number; film_id: number; title: string; studio: string | null;
    genres: string; mpaa_rating: string | null; overview: string | null;
  }>;

  if (filmRows.length === 0) {
    return NextResponse.json({ error: "Weekend not found" }, { status: 404 });
  }

  const toFilm = (r: typeof filmRows[0]): FilmInTheater => ({
    filmId: r.film_id, title: r.title, studio: r.studio,
    genres: JSON.parse(r.genres || "[]"), gross: r.gross,
    cumulativeGross: r.cumulative_gross, weeksInRelease: r.weeks_in_release,
    theaters: r.theaters, rank: r.rank, mpaaRating: r.mpaa_rating, overview: r.overview,
  });

  const films = filmRows.map(toFilm);
  const competitionScore = scoreWeekend(genres, films);
  const competitors = buildCompetitors(genres, films);
  const totalGross = films.reduce((s, f) => s + f.gross, 0);

  // Historical average — same calendar window, excluding COVID if requested
  const covidClause = excludeCovid ? `AND (weekend_date < '2020-01-01' OR weekend_date >= '2022-01-01')` : "";
  const avgRow = db.prepare(
    `SELECT AVG(weekly_total) as avg_gross FROM (
       SELECT weekend_date, SUM(gross) as weekly_total
       FROM weekend_performances
       WHERE CAST(strftime('%m', weekend_date) AS INTEGER) = ?
         AND ABS(CAST(strftime('%d', weekend_date) AS INTEGER) - ?) <= 14
         ${covidClause}
       GROUP BY weekend_date
     )`
  ).get(parseInt(date.slice(5, 7)), parseInt(date.slice(8, 10))) as { avg_gross: number | null };

  // All weekends for alternatives window — ONE query, not N+1
  const allDates = (db.prepare(
    `SELECT weekend_date FROM weekend_performances
     GROUP BY weekend_date ORDER BY weekend_date`
  ).all() as { weekend_date: string }[]).map((r) => r.weekend_date);

  const idx = allDates.indexOf(date);
  const winStart = Math.max(0, idx - 12);
  const winEnd = Math.min(allDates.length - 1, idx + 12);
  const altDates = allDates.slice(winStart, winEnd + 1).filter((d) => d !== date);

  // Single bulk query for all alternative weekends
  const altPlaceholders = altDates.map(() => "?").join(",");
  const altRows = altDates.length > 0
    ? (db.prepare(
        `SELECT wp.weekend_date, wp.gross, wp.weeks_in_release,
                f.genres, f.id as film_id, f.title, f.studio,
                f.mpaa_rating, f.overview, wp.cumulative_gross, wp.theaters, wp.rank
         FROM weekend_performances wp
         JOIN films f ON f.id = wp.film_id
         WHERE wp.weekend_date IN (${altPlaceholders})
         ORDER BY wp.weekend_date, wp.rank`
      ).all(...altDates) as Array<{
        weekend_date: string; gross: number; weeks_in_release: number; genres: string;
        film_id: number; title: string; studio: string | null; mpaa_rating: string | null;
        overview: string | null; cumulative_gross: number; theaters: number; rank: number;
      }>)
    : [];

  // Group alternative rows by date and score each
  const altByDate = new Map<string, FilmInTheater[]>();
  for (const r of altRows) {
    if (!altByDate.has(r.weekend_date)) altByDate.set(r.weekend_date, []);
    altByDate.get(r.weekend_date)!.push({
      filmId: r.film_id, title: r.title, studio: r.studio,
      genres: JSON.parse(r.genres || "[]"), gross: r.gross,
      cumulativeGross: r.cumulative_gross, weeksInRelease: r.weeks_in_release,
      theaters: r.theaters, rank: r.rank, mpaaRating: r.mpaa_rating, overview: r.overview,
    });
  }

  const alternatives: AlternativeWeekend[] = [];
  for (const [altDate, altFilms] of altByDate) {
    const score = scoreWeekend(genres, altFilms);
    alternatives.push({
      weekendDate: altDate,
      competitionScore: score,
      rating: ratingFromScore(score),
      totalGross: altFilms.reduce((s, f) => s + f.gross, 0),
    });
  }
  alternatives.sort((a, b) => a.competitionScore - b.competitionScore);

  const result: SimulateResult = {
    weekendDate: date,
    competitionScore,
    rating: ratingFromScore(competitionScore),
    competitors,
    totalGross,
    historicalAvgGross: avgRow?.avg_gross ?? totalGross,
    alternatives: alternatives.slice(0, 5),
  };

  return NextResponse.json(result);
}
