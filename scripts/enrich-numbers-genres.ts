/**
 * Reads data/upcoming-numbers.json, asks Claude to classify each title's genres
 * in one batch call, writes data/upcoming-numbers-enriched.json.
 *
 * Run once after scrape: npx tsx scripts/enrich-numbers-genres.ts
 */
import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";

const VALID_GENRES = [
  "Action", "Adventure", "Animation", "Biography", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "Horror", "Music",
  "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
];

// Per-studio opening-weekend estimate ($ millions). Used to weight competition.
const STUDIO_OPENING_ESTIMATE_M: Record<string, number> = {
  "Disney": 55,
  "Universal": 45,
  "Warner Bros.": 42,
  "Paramount": 35,
  "Sony": 30,
  "MGM": 22,
  "Lionsgate": 20,
  "20th Century": 28,
  "Focus Features": 9,
  "A24": 7,
  "Neon": 5,
  "Searchlight": 8,
  "Angel Studios": 12,
  "Vertical": 3,
  "Bleecker Street": 3,
  "Magnolia": 3,
  "Ketchup": 2,
  "Black Bear": 4,
  "Icon": 3,
};

interface ScrapedRelease {
  date: string;
  title: string;
  studio: string;
  rawStudio: string;
}

interface EnrichedRelease extends ScrapedRelease {
  genres: string[];
  estimatedOpeningGross: number;
}

const client = new Anthropic();

async function main() {
  const inputPath = path.join(process.cwd(), "data", "upcoming-numbers.json");
  const releases: ScrapedRelease[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  console.log(`Enriching genres for ${releases.length} titles…`);

  const prompt = `For each movie title below, infer its likely genre(s) based on title and any context from your training data. Many are upcoming or recent — make your best inference.

Use ONLY these genre labels: ${VALID_GENRES.join(", ")}.

Return ONLY a single JSON object — no preamble, no markdown fences — mapping each title to an array of 1-3 genres. If you have no information about a title, return an empty array for it.

Titles:
${releases.map((r) => `- ${r.title}`).join("\n")}

Output format example:
{"Some Movie":["Drama","Romance"],"Another Movie":["Horror","Thriller"]}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let genreMap: Record<string, string[]>;
  try {
    genreMap = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse Claude response:");
    console.error(cleaned.slice(0, 500));
    throw e;
  }

  let withGenres = 0;
  const enriched: EnrichedRelease[] = releases.map((r) => {
    const genres = (genreMap[r.title] ?? []).filter((g) => VALID_GENRES.includes(g));
    if (genres.length > 0) withGenres++;
    const grossM = STUDIO_OPENING_ESTIMATE_M[r.studio] ?? 5;
    return {
      ...r,
      genres,
      estimatedOpeningGross: grossM * 1_000_000,
    };
  });

  const outPath = path.join(process.cwd(), "data", "upcoming-numbers-enriched.json");
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log(`Wrote ${enriched.length} enriched releases → ${outPath}`);
  console.log(`  ${withGenres} have genres (${Math.round((withGenres / enriched.length) * 100)}%)`);
  console.log(`  ${enriched.length - withGenres} unclassified — Claude had no context`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
