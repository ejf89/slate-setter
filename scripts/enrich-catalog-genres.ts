/**
 * Bulk-classifies genres for all historical films in tracked studios that have
 * no genre data, using one Claude batch call. Writes results back to films.genres.
 *
 * Run once: ANTHROPIC_API_KEY=... npx tsx scripts/enrich-catalog-genres.ts
 */
import * as path from "path";
import Database from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";

const VALID_GENRES = [
  "Action", "Adventure", "Animation", "Biography", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "Horror", "Music",
  "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
];

const TRACKED_STUDIOS = [
  "A24", "Universal Pictures", "Walt Disney Studios Motion Pictures",
  "Warner Bros.", "Paramount Pictures", "Sony Pictures Releasing",
  "Amazon MGM Studios", "Lionsgate", "20th Century Fox", "20th Century Studios",
  "Neon", "Focus Features", "Searchlight Pictures", "Fox Searchlight Pictures",
  "Angel", "Vertical Entertainment", "Bleecker Street Media", "Magnolia Pictures",
  "Ketchup Entertainment", "Black Bear Pictures", "Icon Film Distribution",
];

const CHUNK_SIZE = 300;

const client = new Anthropic();

async function classifyChunk(titles: string[]): Promise<Record<string, string[]>> {
  const prompt = `For each movie title below, infer its likely genre(s) based on title and any context from your training data.

Use ONLY these genre labels: ${VALID_GENRES.join(", ")}.

Return ONLY a single JSON object — no preamble, no markdown fences — mapping each title to an array of 1–3 genres. If a title is unfamiliar, return an empty array for it.

Titles:
${titles.map((t) => `- ${t}`).join("\n")}

Output format example:
{"Some Movie":["Drama","Romance"],"Another":["Horror"]}`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Extract outermost object on parse failure
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Failed to parse: ${cleaned.slice(0, 300)}`);
  }
}

async function main() {
  const dbPath = path.join(process.cwd(), "data", "slate.db");
  const db = new Database(dbPath);

  const placeholders = TRACKED_STUDIOS.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, title FROM films
    WHERE studio IN (${placeholders})
      AND (genres IS NULL OR genres = '[]' OR length(genres) <= 4)
    ORDER BY id
  `).all(...TRACKED_STUDIOS) as Array<{ id: number; title: string }>;

  console.log(`Found ${rows.length} historical films needing genre enrichment.`);
  if (rows.length === 0) {
    db.close();
    return;
  }

  const update = db.prepare(`UPDATE films SET genres = ? WHERE id = ?`);
  let totalUpdated = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkTitles = chunk.map((r) => r.title);
    console.log(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(rows.length / CHUNK_SIZE)}: ${chunk.length} titles…`);

    const genreMap = await classifyChunk(chunkTitles);

    const txn = db.transaction(() => {
      for (const row of chunk) {
        const genres = (genreMap[row.title] ?? []).filter((g: string) => VALID_GENRES.includes(g));
        if (genres.length > 0) {
          update.run(JSON.stringify(genres), row.id);
          totalUpdated++;
        }
      }
    });
    txn();
    console.log(`  Updated ${chunk.filter((r) => (genreMap[r.title] ?? []).length > 0).length} films in this chunk.`);
  }

  console.log(`\nDone. Updated genres for ${totalUpdated} / ${rows.length} films (${Math.round((totalUpdated / rows.length) * 100)}%).`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
