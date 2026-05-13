/**
 * Run this after getting a TMDB or OMDb API key to add genre data to existing films.
 * TMDB: https://www.themoviedb.org/settings/api  (free, instant)
 * OMDb: https://www.omdbapi.com/apikey.aspx       (free tier, just needs email)
 *
 * Usage:
 *   TMDB_API_KEY=xxx npx tsx scripts/enrich.ts
 *   OMDB_API_KEY=xxx npx tsx scripts/enrich.ts
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "slate.db");
const TMDB_KEY = process.env.TMDB_API_KEY;
const OMDB_KEY = process.env.OMDB_API_KEY;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchGenresTmdb(title: string): Promise<string[] | null> {
  if (!TMDB_KEY) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&api_key=${TMDB_KEY}`
    );
    const data = await res.json();
    const movie = data.results?.[0];
    if (!movie) return null;
    const detail = await fetch(
      `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_KEY}`
    ).then((r) => r.json());
    return detail.genres?.map((g: { name: string }) => g.name) ?? [];
  } catch {
    return null;
  }
}

async function fetchGenresOmdb(title: string): Promise<string[] | null> {
  if (!OMDB_KEY) return null;
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}`
    );
    const data = await res.json();
    if (data.Response === "False" || !data.Genre) return null;
    return data.Genre.split(", ").map((g: string) => g.trim());
  } catch {
    return null;
  }
}

async function main() {
  if (!TMDB_KEY && !OMDB_KEY) {
    console.error("Set TMDB_API_KEY or OMDB_API_KEY env var before running.");
    console.error("  TMDB (free): https://www.themoviedb.org/settings/api");
    console.error("  OMDb (free): https://www.omdbapi.com/apikey.aspx");
    process.exit(1);
  }

  const source = TMDB_KEY ? "TMDB" : "OMDb";
  console.log(`Enriching films with genre data via ${source}…`);

  const db = new Database(DB_PATH);
  const unemriched = db
    .prepare("SELECT id, title FROM films WHERE genres = '[]' OR genres IS NULL ORDER BY id")
    .all() as { id: number; title: string }[];

  console.log(`${unemriched.length} films need genre data.\n`);

  const update = db.prepare("UPDATE films SET genres = ? WHERE id = ?");
  let enriched = 0;
  let failed = 0;

  for (const film of unemriched) {
    await sleep(300);
    const genres = TMDB_KEY
      ? await fetchGenresTmdb(film.title)
      : await fetchGenresOmdb(film.title);

    if (genres && genres.length > 0) {
      update.run(JSON.stringify(genres), film.id);
      enriched++;
      process.stdout.write(`\r  ✓ ${enriched} enriched, ${failed} failed`);
    } else {
      failed++;
      process.stdout.write(`\r  ✓ ${enriched} enriched, ${failed} failed`);
    }
  }

  db.close();
  console.log(`\n\nDone. ${enriched} films now have genre data.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
