import { NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { getGenresForFilm } from "@/lib/genreMap";

export const runtime = "nodejs";

export function GET() {
  const CACHE_KEY = "catalog";
  const cached = getCached<object>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  const db = getDb();

  const rows = db.prepare(`
    SELECT f.id, f.title, f.genres, MIN(wp.weekend_date) as opening_date,
           wp.gross as opening_gross
    FROM films f
    JOIN weekend_performances wp ON f.id = wp.film_id AND wp.weeks_in_release = 1
    WHERE f.studio = 'A24'
    GROUP BY f.id
    ORDER BY opening_date DESC
  `).all() as Array<{
    id: number;
    title: string;
    genres: string;
    opening_date: string;
    opening_gross: number;
  }>;

  const films = rows
    .map((r) => {
      const dbGenres: string[] = JSON.parse(r.genres || "[]");
      const genres = getGenresForFilm(r.title, dbGenres);
      return {
        id: r.id,
        title: r.title,
        genres,
        openingDate: r.opening_date,
        openingGross: r.opening_gross,
        director: null,
        logline: null,
        tentativeDate: r.opening_date,
        status: "released" as const,
      };
    })
    .filter((f) => f.genres.length > 0);

  setCached(CACHE_KEY, films);
  return NextResponse.json(films);
}
