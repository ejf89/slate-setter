import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const client = new Anthropic();

interface FilmEntry {
  title: string;
  genres: string[];
  gross: number;
  weeksInRelease: number;
  threatScore: number;
  isThreat: boolean;
}

interface WeekendPayload {
  date: string;
  totalGross: number;
  competitionScore: number;
  rating: string;
  films: FilmEntry[];
}

interface CompFilm {
  title: string;
  genres: string[];
  openingGross: number;
}

interface StrategicBrief {
  forecast: { low: number; high: number; mode: "wide" | "platform" | "limited" };
  rationale: string;
  risks: string[];
  recommendation: { play: "wide" | "platform" | "limited"; reasoning: string };
}

function describeWeekend(w: WeekendPayload, isProjection: boolean): string {
  const threats = w.films
    .filter((f) => f.isThreat)
    .sort((a, b) => b.threatScore - a.threatScore)
    .slice(0, 4)
    .map((f) => `${f.title} (wk ${f.weeksInRelease}, ${f.genres.slice(0, 2).join("/")})`)
    .join("; ");
  const others = w.films
    .filter((f) => !f.isThreat && f.weeksInRelease === 1)
    .slice(0, 3)
    .map((f) => f.title)
    .join(", ");
  const market = `$${(w.totalGross / 1_000_000).toFixed(0)}M market`;
  const competition = `${(w.competitionScore * 100).toFixed(0)}% competition (${w.rating.toLowerCase()})`;
  const proj = isProjection ? " [projected from 2025 analog]" : "";
  return `${w.date}${proj}\n  - ${competition}, ${market}\n  - Genre threats: ${threats || "none"}\n  - Other openers same weekend: ${others || "none"}`;
}

export async function POST(req: NextRequest) {
  try {
    const {
      film,
      primaryWeekend,
      compareWeekend,
      comparableFilms,
      isProjection,
    } = (await req.json()) as {
      film: { title: string; genres: string[] };
      primaryWeekend: WeekendPayload;
      compareWeekend?: WeekendPayload | null;
      comparableFilms?: CompFilm[];
      isProjection?: boolean;
    };

    const compsText =
      comparableFilms && comparableFilms.length > 0
        ? comparableFilms
            .map((f) => `  - ${f.title} (${f.genres.join(", ")}): $${(f.openingGross / 1_000_000).toFixed(1)}M opening`)
            .join("\n")
        : "  No close genre comparables in catalog.";

    const windowsText = compareWeekend
      ? `PRIMARY WINDOW:\n${describeWeekend(primaryWeekend, !!isProjection)}\n\nALT WINDOW:\n${describeWeekend(compareWeekend, !!isProjection)}`
      : `WINDOW:\n${describeWeekend(primaryWeekend, !!isProjection)}`;

    const prompt = `You are a theatrical release strategist for an independent film studio. Analyze this release window and produce a strategic brief.

FILM: ${film.title} (${film.genres.join(", ")})
${isProjection ? "Note: 2026 windows are projected from 2025 seasonal patterns.\n" : ""}
${windowsText}

GENRE COMPARABLES (historical openings):
${compsText}

Return ONLY valid JSON matching this exact schema (no markdown, no preamble):
{
  "forecast": {
    "low": <number — projected opening weekend $M, low end>,
    "high": <number — projected opening weekend $M, high end>,
    "mode": "wide" | "platform" | "limited"
  },
  "rationale": "<2-3 sentences citing specific comp titles and grosses, the window's competitive pressure, and market size. Be quantitative.>",
  "risks": [
    "<specific risk #1 — name competing titles or seasonal factors>",
    "<specific risk #2>",
    "<specific risk #3>"
  ],
  "recommendation": {
    "play": "wide" | "platform" | "limited",
    "reasoning": "<1-2 sentences on why this release strategy fits the film, window, and comp profile>"
  }
}

Use the comp grosses as your forecast anchor. Adjust UP for low-competition windows (under 18%), DOWN for high-competition (over 35%). If no comps available, use the genre+market norms with explicit caveats in the rationale.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON — handle markdown fences, preamble, or trailing prose.
    // Find the outermost balanced { ... } block.
    function extractJson(raw: string): string | null {
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const start = stripped.indexOf("{");
      if (start === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) return stripped.slice(start, i + 1);
        }
      }
      return null;
    }

    const jsonText = extractJson(text);
    if (!jsonText) {
      console.error("analyze: no JSON object found in response. Raw:", text.slice(0, 500));
      return NextResponse.json({ error: "Model returned no JSON", raw: text.slice(0, 1000) }, { status: 502 });
    }

    let brief: StrategicBrief;
    try {
      brief = JSON.parse(jsonText);
    } catch (e) {
      console.error("analyze: JSON parse failed. Extracted:", jsonText.slice(0, 500), "Error:", e);
      return NextResponse.json({ error: "Model returned malformed JSON", raw: jsonText.slice(0, 1000) }, { status: 502 });
    }

    // Basic shape validation — if any required field is missing, surface that
    if (
      !brief.forecast || typeof brief.forecast.low !== "number" || typeof brief.forecast.high !== "number" ||
      !brief.rationale || !Array.isArray(brief.risks) || !brief.recommendation
    ) {
      console.error("analyze: brief missing required fields:", brief);
      return NextResponse.json({ error: "Brief missing required fields", raw: brief }, { status: 502 });
    }

    return NextResponse.json({ brief });
  } catch (err) {
    console.error("analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
