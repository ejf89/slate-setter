import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scoreWeekend, ratingFromScore } from "@/lib/competition";
import type { FilmInTheater, ThreatLevel } from "@/lib/types";

export async function POST(req: Request) {
  const { dates, genres } = await req.json() as { dates: string[]; genres: string[] };
  if (!dates?.length || !genres?.length) return NextResponse.json({ scores: {} });

  const db = getDb();
  const placeholders = dates.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT wp.weekend_date, wp.rank, wp.gross, wp.weeks_in_release, wp.theaters,
            wp.cumulative_gross, f.id as film_id, f.title, f.studio,
            f.genres, f.mpaa_rating, f.overview
     FROM weekend_performances wp
     JOIN films f ON f.id = wp.film_id
     WHERE wp.weekend_date IN (${placeholders})
     ORDER BY wp.weekend_date, wp.rank`
  ).all(...dates) as Array<{
    weekend_date: string; rank: number; gross: number; weeks_in_release: number;
    theaters: number; cumulative_gross: number; film_id: number; title: string;
    studio: string | null; genres: string; mpaa_rating: string | null; overview: string | null;
  }>;

  const byWeekend = new Map<string, FilmInTheater[]>();
  for (const r of rows) {
    if (!byWeekend.has(r.weekend_date)) byWeekend.set(r.weekend_date, []);
    byWeekend.get(r.weekend_date)!.push({
      filmId: r.film_id, title: r.title, studio: r.studio,
      genres: JSON.parse(r.genres || "[]"), gross: r.gross,
      cumulativeGross: r.cumulative_gross, weeksInRelease: r.weeks_in_release,
      theaters: r.theaters, rank: r.rank, mpaaRating: r.mpaa_rating, overview: r.overview,
    });
  }

  const scores: Record<string, { competitionScore: number; rating: ThreatLevel }> = {};
  for (const [date, films] of byWeekend) {
    const competitionScore = scoreWeekend(genres, films);
    scores[date] = { competitionScore, rating: ratingFromScore(competitionScore) };
  }

  return NextResponse.json({ scores });
}
