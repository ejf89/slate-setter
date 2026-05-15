import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { WeekendData, FilmInTheater } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const db = getDb();

  const rows = db.prepare(
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

  if (rows.length === 0) {
    return NextResponse.json({ error: "Weekend not found" }, { status: 404 });
  }

  const films: FilmInTheater[] = rows.map((r) => ({
    filmId: r.film_id, title: r.title, studio: r.studio,
    genres: JSON.parse(r.genres || "[]"), gross: r.gross,
    cumulativeGross: r.cumulative_gross, weeksInRelease: r.weeks_in_release,
    theaters: r.theaters, rank: r.rank, mpaaRating: r.mpaa_rating, overview: r.overview,
  }));

  const data: WeekendData = {
    weekendDate: date,
    totalGross: films.reduce((s, f) => s + f.gross, 0),
    films,
  };

  return NextResponse.json(data);
}
