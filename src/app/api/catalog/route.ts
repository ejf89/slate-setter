import { NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { getGenresForFilm } from "@/lib/genreMap";

export const runtime = "nodejs";

// Studios the team tracks (from the brief). Anything not on this list is excluded
// to keep the catalog focused on the wide-release distributors that matter.
const TRACKED_STUDIOS: Record<string, string> = {
  "A24": "A24",
  "Universal Pictures": "Universal",
  "Walt Disney Studios Motion Pictures": "Disney",
  "Warner Bros.": "Warner Bros.",
  "Paramount Pictures": "Paramount",
  "Sony Pictures Releasing": "Sony",
  "Amazon MGM Studios": "MGM",
  "Lionsgate": "Lionsgate",
  "20th Century Fox": "20th Century Fox",
  "20th Century Studios": "20th Century Studios",
  "Neon": "Neon",
  "Focus Features": "Focus Features",
  "Searchlight Pictures": "Searchlight",
  "Fox Searchlight Pictures": "Searchlight",
  "Angel": "Angel Studios",
  "Vertical Entertainment": "Vertical",
  "Bleecker Street Media": "Bleecker Street",
  "Magnolia Pictures": "Magnolia",
  "Ketchup Entertainment": "Ketchup",
  "Black Bear Pictures": "Black Bear",
  "Icon Film Distribution": "Icon",
};

export function GET() {
  const CACHE_KEY = "catalog-v3";
  const cached = getCached<object>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  const db = getDb();

  const studioList = Object.keys(TRACKED_STUDIOS);
  const placeholders = studioList.map(() => "?").join(",");

  const rows = db.prepare(`
    SELECT f.id, f.title, f.genres, f.studio,
           MIN(wp.weekend_date) as opening_date,
           wp.gross as opening_gross
    FROM films f
    JOIN weekend_performances wp ON f.id = wp.film_id AND wp.weeks_in_release = 1
    WHERE f.studio IN (${placeholders})
    GROUP BY f.id
    ORDER BY wp.gross DESC
    LIMIT 1500
  `).all(...studioList) as Array<{
    id: number;
    title: string;
    genres: string;
    studio: string;
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
        studio: TRACKED_STUDIOS[r.studio] ?? r.studio,
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
