import Database from "better-sqlite3";
import * as cheerio from "cheerio";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "slate.db");
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const RATE_LIMIT_MS = 1200;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS films (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      studio TEXT,
      tmdb_id INTEGER,
      genres TEXT NOT NULL DEFAULT '[]',
      mpaa_rating TEXT,
      overview TEXT
    );
    CREATE TABLE IF NOT EXISTS weekend_performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      film_id INTEGER REFERENCES films(id),
      weekend_date TEXT NOT NULL,
      rank INTEGER,
      gross INTEGER,
      cumulative_gross INTEGER,
      weeks_in_release INTEGER,
      theaters INTEGER
    );
    CREATE TABLE IF NOT EXISTS slate_films (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      genres TEXT NOT NULL DEFAULT '[]',
      director TEXT,
      logline TEXT,
      tentative_date TEXT,
      status TEXT NOT NULL DEFAULT 'unscheduled'
    );
    CREATE INDEX IF NOT EXISTS idx_wp_date ON weekend_performances(weekend_date);
    CREATE INDEX IF NOT EXISTS idx_wp_film ON weekend_performances(film_id);
  `);
  return db;
}

// ── BOM Scraping ─────────────────────────────────────────────────────────────
// URL format: https://www.boxofficemojo.com/weekend/2024W01/
// Columns: [0]rank [1]LW [2]title [3]gross [4]%chg [5]theaters [6]thtr-chg [7]per-theater [8]cumulative [9]weeks [10]studio

interface BomRow {
  rank: number;
  title: string;
  studio: string;
  gross: number;
  cumulativeGross: number;
  weeksInRelease: number;
  theaters: number;
}

interface BomResult {
  weekendDate: string;  // "YYYY-MM-DD" (Friday of the weekend)
  rows: BomRow[];
}

function parseMoney(s: string): number {
  return parseInt(s.replace(/[$,\s]/g, "")) || 0;
}

// Parse "January 5-7, 2024" → "2024-01-05"
// Also handles cross-month: "December 29, 2023-January 1, 2024" → "2023-12-29"
function parseBomDate(text: string): string | null {
  const clean = text.toLowerCase().trim();
  // Try "month day-day, year"
  const simple = clean.match(/^(\w+)\s+(\d+)[-–]\d+,?\s+(\d{4})/);
  if (simple) {
    const month = MONTHS[simple[1]];
    const day = parseInt(simple[2]);
    const year = parseInt(simple[3]);
    if (month && day && year) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  // Cross-month: "december 29, 2023-january 1, 2024" — take start date
  const crossMonth = clean.match(/^(\w+)\s+(\d+),\s*(\d{4})/);
  if (crossMonth) {
    const month = MONTHS[crossMonth[1]];
    const day = parseInt(crossMonth[2]);
    const year = parseInt(crossMonth[3]);
    if (month && day && year) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

async function fetchBomWeekend(year: number, week: number): Promise<BomResult | null> {
  const weekStr = String(week).padStart(2, "0");
  const url = `https://www.boxofficemojo.com/weekend/${year}W${weekStr}/`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseBomPage(html);
  } catch {
    return null;
  }
}

function parseBomPage(html: string): BomResult | null {
  const $ = cheerio.load(html);

  // Extract weekend date from h4
  const dateText = $("h4.mojo-gutter").first().text().trim();
  if (!dateText) return null;
  const weekendDate = parseBomDate(dateText);
  if (!weekendDate) return null;

  const rows: BomRow[] = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 9) return;

    // [0] rank
    const rank = parseInt($(cells[0]).text().trim());
    if (isNaN(rank) || rank < 1 || rank > 15) return;

    // [2] title (strip link text)
    const title = $(cells[2]).find("a").first().text().trim() || $(cells[2]).text().trim();
    if (!title) return;

    // [3] weekend gross
    const gross = parseMoney($(cells[3]).text());
    if (gross === 0) return;

    // [5] theaters
    const theaters = parseInt($(cells[5]).text().replace(/,/g, "")) || 0;

    // [8] cumulative gross
    const cumulativeGross = parseMoney($(cells[8]).text()) || gross;

    // [9] weeks in release
    const weeksInRelease = parseInt($(cells[9]).text().trim()) || 1;

    // [10] studio — strip SVG/link markup
    const studio = $(cells[10]).find("a").first().text().trim() || $(cells[10]).text().replace(/\s+/g, " ").trim();

    rows.push({ rank, title, studio, gross, cumulativeGross, weeksInRelease, theaters });
  });

  return rows.length > 0 ? { weekendDate, rows } : null;
}

// ── TMDB ─────────────────────────────────────────────────────────────────────

async function fetchTmdbGenres(title: string): Promise<{ genres: string[]; tmdbId: number; overview: string; mpaaRating: string } | null> {
  if (!TMDB_API_KEY) return null;
  try {
    const search = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&api_key=${TMDB_API_KEY}`
    ).then((r) => r.json());
    const movie = search.results?.[0];
    if (!movie) return null;
    const detail = await fetch(
      `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&append_to_response=release_dates`
    ).then((r) => r.json());
    const genres: string[] = detail.genres?.map((g: { name: string }) => g.name) ?? [];
    const usRelease = detail.release_dates?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
    const mpaaRating = usRelease?.release_dates?.find((d: { certification: string }) => d.certification)?.certification ?? "";
    return { genres, tmdbId: movie.id, overview: detail.overview ?? "", mpaaRating };
  } catch {
    return null;
  }
}

// ── Slate data ────────────────────────────────────────────────────────────────

const SLATE_FILMS = [
  { title: "The Backrooms", genres: ["Horror", "Sci-Fi"], director: "Kane Parsons", logline: "A found-footage horror built on the viral internet urban legend of infinite liminal spaces.", tentative_date: "2026-05-29", status: "confirmed" },
  { title: "The Death of Robin Hood", genres: ["Action", "Drama"], director: "Michael Sarnoski", logline: "An aging Robin Hood reckons with his violent legacy — Hugh Jackman stars.", tentative_date: "2026-06-26", status: "confirmed" },
  { title: "The Invite", genres: ["Comedy", "Romance"], director: "Olivia Wilde", logline: "A married couple meets their swinging neighbors at a dinner party that spirals out of control.", tentative_date: "2026-06-01", status: "announced" },
  { title: "Tony", genres: ["Drama", "Biography"], director: "Matt Johnson", logline: "A biopic of the late Anthony Bourdain — Dominic Sessa stars as the culinary icon.", tentative_date: null, status: "announced" },
  { title: "The Moment", genres: ["Comedy", "Music"], director: "Aidan Zamiri", logline: "Charli XCX plays a fictionalized version of herself on her debut arena tour — a meta comedy.", tentative_date: null, status: "announced" },
  { title: "The Entertainment System Is Down", genres: ["Comedy", "Drama"], director: "Ruben Östlund", logline: "On a long-haul flight with no entertainment, passengers unravel — Keanu Reeves leads an all-star cast.", tentative_date: null, status: "unscheduled" },
  { title: "Ronnie Spector Biopic", genres: ["Drama", "Music"], director: "Barry Jenkins", logline: "Zendaya portrays The Ronettes' Ronnie Spector in a long-gestating Barry Jenkins musical biopic.", tentative_date: null, status: "unscheduled" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📽  Slate Setter — Seed Script");
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   TMDB: ${TMDB_API_KEY ? "✓ genre enrichment enabled" : "✗ no key — run 'npm run enrich' later to add genres"}\n`);

  const db = initDb();

  // Slate films
  const existingSlate = (db.prepare("SELECT COUNT(*) as n FROM slate_films").get() as { n: number }).n;
  if (existingSlate === 0) {
    const ins = db.prepare("INSERT INTO slate_films (title,genres,director,logline,tentative_date,status) VALUES (?,?,?,?,?,?)");
    for (const sf of SLATE_FILMS) {
      ins.run(sf.title, JSON.stringify(sf.genres), sf.director, sf.logline, sf.tentative_date, sf.status);
    }
    console.log(`✓ ${SLATE_FILMS.length} slate films seeded`);
  } else {
    console.log(`↩ Slate already seeded (${existingSlate} films)`);
  }

  const insertFilm = db.prepare("INSERT INTO films (title,studio,tmdb_id,genres,mpaa_rating,overview) VALUES (?,?,?,?,?,?)");
  const insertPerf = db.prepare("INSERT INTO weekend_performances (film_id,weekend_date,rank,gross,cumulative_gross,weeks_in_release,theaters) VALUES (?,?,?,?,?,?,?)");
  const findFilm = db.prepare("SELECT id FROM films WHERE lower(title) = lower(?)");
  const checkWeekend = db.prepare("SELECT COUNT(*) as n FROM weekend_performances WHERE weekend_date = ?");

  const filmCache = new Map<string, number>();
  let weekendsScraped = 0;
  let perfsInserted = 0;
  let skipped = 0;

  for (const year of [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
    console.log(`\n── ${year} ──────────────────────────`);

    for (let week = 1; week <= 53; week++) {
      // Quick check: does this weekend already exist?
      // We'll do a lightweight fetch first to get the date, or we can just try
      await sleep(RATE_LIMIT_MS);

      const result = await fetchBomWeekend(year, week);
      if (!result) {
        process.stdout.write("_");
        skipped++;
        // Stop after 4 consecutive misses (end of year)
        if (skipped >= 4) { skipped = 0; break; }
        continue;
      }
      skipped = 0;

      const { weekendDate, rows } = result;

      // Skip future dates
      if (new Date(weekendDate + "T12:00:00Z") > new Date()) break;

      // Skip if already seeded
      const existing = (checkWeekend.get(weekendDate) as { n: number }).n;
      if (existing > 0) {
        process.stdout.write("·");
        continue;
      }

      process.stdout.write(`\n  ${weekendDate} (wk ${String(week).padStart(2)}): ${rows.length} films`);
      weekendsScraped++;

      for (const row of rows) {
        const key = row.title.toLowerCase();
        let filmId = filmCache.get(key);

        if (filmId === undefined) {
          const found = findFilm.get(row.title) as { id: number } | undefined;
          if (found) {
            filmId = found.id;
          } else {
            let tmdb = null;
            if (TMDB_API_KEY) {
              tmdb = await fetchTmdbGenres(row.title);
              await sleep(300);
            }
            const r = insertFilm.run(
              row.title, row.studio, tmdb?.tmdbId ?? null,
              JSON.stringify(tmdb?.genres ?? []),
              tmdb?.mpaaRating ?? null, tmdb?.overview ?? null
            );
            filmId = r.lastInsertRowid as number;
          }
          filmCache.set(key, filmId);
        }

        insertPerf.run(filmId, weekendDate, row.rank, row.gross, row.cumulativeGross, row.weeksInRelease, row.theaters);
        perfsInserted++;
      }
    }
  }

  const filmCount = (db.prepare("SELECT COUNT(*) as n FROM films").get() as { n: number }).n;
  const perfCount = (db.prepare("SELECT COUNT(*) as n FROM weekend_performances").get() as { n: number }).n;

  console.log(`\n\n✅ Done!`);
  console.log(`   ${weekendsScraped} weekends scraped · ${perfsInserted} new performances`);
  console.log(`   ${filmCount} total films · ${perfCount} total performances in DB`);
  if (!TMDB_API_KEY) {
    console.log(`\n💡 No genre data yet. Get a free key and run:`);
    console.log(`   TMDB: https://www.themoviedb.org/settings/api`);
    console.log(`   OMDb: https://www.omdbapi.com/apikey.aspx`);
    console.log(`   Then: npm run enrich`);
  }
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
