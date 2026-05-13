import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { scoreWeekend, buildCompetitors, ratingFromScore } from "@/lib/competition";
import type { SimulateResult, AlternativeWeekend, FilmInTheater } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "data", "slate.db");

function getFilmsForWeekend(
  db: Database.Database,
  date: string
): FilmInTheater[] {
  const rows = db
    .prepare(
      `SELECT wp.rank, wp.gross, wp.cumulative_gross, wp.weeks_in_release, wp.theaters,
              f.id as film_id, f.title, f.studio, f.genres, f.mpaa_rating, f.overview
       FROM weekend_performances wp
       JOIN films f ON f.id = wp.film_id
       WHERE wp.weekend_date = ?
       ORDER BY wp.rank ASC`
    )
    .all(date) as Array<{
    rank: number; gross: number; cumulative_gross: number; weeks_in_release: number;
    theaters: number; film_id: number; title: string; studio: string | null;
    genres: string; mpaa_rating: string | null; overview: string | null;
  }>;

  return rows.map((r) => ({
    filmId: r.film_id, title: r.title, studio: r.studio,
    genres: JSON.parse(r.genres || "[]"), gross: r.gross,
    cumulativeGross: r.cumulative_gross, weeksInRelease: r.weeks_in_release,
    theaters: r.theaters, rank: r.rank, mpaaRating: r.mpaa_rating, overview: r.overview,
  }));
}

export async function POST(req: Request) {
  const { date, genres } = await req.json() as { date: string; genres: string[] };
  if (!date || !genres?.length) {
    return NextResponse.json({ error: "date and genres required" }, { status: 400 });
  }

  const db = new Database(DB_PATH, { readonly: true });

  const films = getFilmsForWeekend(db, date);
  if (films.length === 0) {
    db.close();
    return NextResponse.json({ error: "Weekend not found" }, { status: 404 });
  }

  const competitionScore = scoreWeekend(genres, films);
  const competitors = buildCompetitors(genres, films);
  const totalGross = films.reduce((s, f) => s + f.gross, 0);

  // Historical average: same calendar week across all years in DB
  const targetMonth = date.slice(5, 7);
  const targetDay = parseInt(date.slice(8, 10));
  const avgRow = db
    .prepare(
      `SELECT AVG(weekly_total) as avg_gross FROM (
        SELECT weekend_date, SUM(gross) as weekly_total
        FROM weekend_performances
        WHERE CAST(strftime('%m', weekend_date) AS INTEGER) = ?
          AND ABS(CAST(strftime('%d', weekend_date) AS INTEGER) - ?) <= 14
        GROUP BY weekend_date
      )`
    )
    .get(parseInt(targetMonth), targetDay) as { avg_gross: number | null };

  // Find alternatives: scan all weekends, score them, return best ±12 weeks
  const allWeekends = db
    .prepare(
      `SELECT weekend_date FROM (
        SELECT weekend_date FROM weekend_performances GROUP BY weekend_date
      ) ORDER BY weekend_date`
    )
    .all() as { weekend_date: string }[];

  db.close();

  // Find index of target weekend
  const idx = allWeekends.findIndex((w) => w.weekend_date === date);
  const windowStart = Math.max(0, idx - 12);
  const windowEnd = Math.min(allWeekends.length - 1, idx + 12);
  const dbAlt = new Database(DB_PATH, { readonly: true });

  const alternatives: AlternativeWeekend[] = [];
  for (let i = windowStart; i <= windowEnd; i++) {
    if (i === idx) continue;
    const altDate = allWeekends[i].weekend_date;
    const altFilms = getFilmsForWeekend(dbAlt, altDate);
    if (altFilms.length === 0) continue;
    const altScore = scoreWeekend(genres, altFilms);
    alternatives.push({
      weekendDate: altDate,
      competitionScore: altScore,
      rating: ratingFromScore(altScore),
      totalGross: altFilms.reduce((s, f) => s + f.gross, 0),
    });
  }
  dbAlt.close();

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
