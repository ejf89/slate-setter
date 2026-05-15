import { NextRequest, NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { FILM_GENRE_MAP } from "@/lib/genreMap";

export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const cacheKey = `films:search:${q.toLowerCase()}`;
  const cached = getCached<object[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const db = getDb();
  const pattern = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT f.id, f.title, f.genres,
              MIN(wp.weekend_date) as first_seen
       FROM films f
       JOIN weekend_performances wp ON wp.film_id = f.id
       WHERE f.title LIKE ?
       GROUP BY f.id
       ORDER BY SUM(wp.gross) DESC
       LIMIT 12`
    )
    .all(pattern) as Array<{
    id: number;
    title: string;
    genres: string;
    first_seen: string;
  }>;

  const results = rows.map((r) => {
    const dbGenres: string[] = JSON.parse(r.genres || "[]");
    const genres =
      dbGenres.length > 0 ? dbGenres : (FILM_GENRE_MAP[r.title] ?? []);
    const year = r.first_seen ? parseInt(r.first_seen.slice(0, 4)) : null;
    return { id: r.id, title: r.title, genres, year };
  });

  setCached(cacheKey, results);
  return NextResponse.json(results);
}
