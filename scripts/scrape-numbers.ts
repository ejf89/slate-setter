/**
 * Scrapes the-numbers.com/movies/release-schedule for upcoming wide releases.
 * Filters to the studios the team tracks. Writes data/upcoming-numbers.json.
 *
 * Run: npx tsx scripts/scrape-numbers.ts
 */
import * as fs from "fs";
import * as path from "path";

const TRACKED: Record<string, string> = {
  "A24": "A24",
  "Universal": "Universal",
  "Universal Pictures": "Universal",
  "Walt Disney Studios Motion Pictures": "Disney",
  "Walt Disney Pictures": "Disney",
  "Walt Disney": "Disney",
  "Warner Bros.": "Warner Bros.",
  "Warner Bros. Pictures": "Warner Bros.",
  "Paramount Pictures": "Paramount",
  "Paramount": "Paramount",
  "Sony Pictures Releasing": "Sony",
  "Sony Pictures": "Sony",
  "Sony": "Sony",
  "Amazon MGM Studios": "MGM",
  "MGM": "MGM",
  "Lionsgate": "Lionsgate",
  "20th Century Studios": "20th Century",
  "20th Century Fox": "20th Century",
  "Neon": "Neon",
  "Focus Features": "Focus Features",
  "Searchlight Pictures": "Searchlight",
  "Fox Searchlight Pictures": "Searchlight",
  "Angel": "Angel Studios",
  "Angel Studios": "Angel Studios",
  "Vertical Entertainment": "Vertical",
  "Vertical": "Vertical",
  "Bleecker Street Media": "Bleecker Street",
  "Bleecker Street": "Bleecker Street",
  "Magnolia Pictures": "Magnolia",
  "Ketchup Entertainment": "Ketchup",
  "Black Bear Pictures": "Black Bear",
  "Icon Film Distribution": "Icon",
};

const MONTHS: Record<string, number> = {
  Jan: 0, January: 0,
  Feb: 1, February: 1,
  Mar: 2, March: 2,
  Apr: 3, April: 3,
  May: 4,
  Jun: 5, June: 5,
  Jul: 6, July: 6,
  Aug: 7, August: 7,
  Sep: 8, Sept: 8, September: 8,
  Oct: 9, October: 9,
  Nov: 10, November: 10,
  Dec: 11, December: 11,
};

interface ScrapedRelease {
  date: string;            // ISO yyyy-mm-dd
  title: string;
  studio: string;          // normalized display name
  rawStudio: string;       // as scraped
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").trim();
}

function parseSchedule(html: string): ScrapedRelease[] {
  const results: ScrapedRelease[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let currentYear = new Date().getFullYear();
  let lastFullDate = ""; // "Month Day" carried forward when date cell is empty
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html))) {
    const row = m[1];

    // Month header row, e.g.  May 2026
    const headerMatch = row.match(/<td[^>]*colspan=4[^>]*>\s*([A-Z][a-z]+)\s+(\d{4})\s*<\/td>/);
    if (headerMatch) {
      currentYear = parseInt(headerMatch[2]);
      continue;
    }

    const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    if (cellMatches.length < 3) continue;

    const dateRaw = strip(cellMatches[0][1]);
    const titleRaw = strip(cellMatches[1][1]);
    const studioRaw = strip(cellMatches[2][1]);
    if (!titleRaw) continue;

    // Date cell may be empty for additional rows on the same date
    const dateStr = dateRaw || lastFullDate;
    if (!dateStr) continue;
    if (dateRaw) lastFullDate = dateRaw;

    // Parse "Month Day" → (month, day)
    const dateMatch = dateStr.match(/^([A-Z][a-z]+)\s+(\d{1,2})$/);
    if (!dateMatch) continue;
    const monthIdx = MONTHS[dateMatch[1]];
    if (monthIdx === undefined) continue;
    const day = parseInt(dateMatch[2]);

    // Parse the release type from the title's trailing parens
    const typeMatch = titleRaw.match(/\(([^)]+)\)\s*$/);
    const releaseType = typeMatch ? typeMatch[1] : "";
    const cleanTitle = titleRaw.replace(/\s*\([^)]*\)\s*$/, "").trim();

    // Wide-only, no re-releases
    if (!/Wide/i.test(releaseType)) continue;
    if (/re-release/i.test(releaseType)) continue;

    // Tracked studios only
    const studio = TRACKED[studioRaw];
    if (!studio) continue;

    // Build ISO date — use UTC-noon to avoid TZ shenanigans, then take the date portion
    const date = new Date(Date.UTC(currentYear, monthIdx, day, 12));
    const iso = date.toISOString().slice(0, 10);

    results.push({
      date: iso,
      title: cleanTitle,
      studio,
      rawStudio: studioRaw,
    });
  }

  // De-dupe (same title + same date appears occasionally)
  const seen = new Set<string>();
  return results.filter((r) => {
    const k = `${r.date}|${r.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SlateSetter-research/1.0)" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log("Fetching The Numbers release schedule…");
  const html = await fetchPage("https://www.the-numbers.com/movies/release-schedule");
  const releases = parseSchedule(html);

  const today = new Date().toISOString().slice(0, 10);
  const future = releases.filter((r) => r.date >= today);

  console.log(`Parsed ${releases.length} wide releases from tracked studios`);
  console.log(`${future.length} upcoming (on or after ${today})`);

  // Sample
  for (const r of future.slice(0, 8)) {
    console.log(`  ${r.date}  ${r.title.padEnd(40)}  ${r.studio}`);
  }

  const outPath = path.join(process.cwd(), "data", "upcoming-numbers.json");
  fs.writeFileSync(outPath, JSON.stringify(future, null, 2));
  console.log(`\nWrote ${future.length} releases → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
