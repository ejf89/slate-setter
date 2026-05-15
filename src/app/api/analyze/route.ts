import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

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

function describeWeekend(w: WeekendPayload, isProjection: boolean): string {
  const threats = w.films
    .filter((f) => f.isThreat)
    .sort((a, b) => b.threatScore - a.threatScore)
    .slice(0, 3)
    .map((f) => `${f.title} (wk ${f.weeksInRelease})`)
    .join(", ");
  const market = `$${(w.totalGross / 1_000_000).toFixed(0)}M market`;
  const competition = `${(w.competitionScore * 100).toFixed(0)}% competition (${w.rating.toLowerCase()})`;
  const qualifier = isProjection ? " [projected]" : "";
  return `${w.date}${qualifier}: ${competition}, ${market}${threats ? `, genre threats: ${threats}` : ", no genre threats"}`;
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
            .map(
              (f) =>
                `  - ${f.title} (${f.genres.join(", ")}): $${(f.openingGross / 1_000_000).toFixed(1)}M opening`
            )
            .join("\n")
        : "  None identified in catalog.";

    const windowsText = compareWeekend
      ? `Primary window: ${describeWeekend(primaryWeekend, !!isProjection)}\nCompare window: ${describeWeekend(compareWeekend, !!isProjection)}`
      : `Window: ${describeWeekend(primaryWeekend, !!isProjection)}`;

    const prompt = `You are a theatrical release strategist for an independent film studio. Analyze this data and give a concise strategic recommendation.

Film: ${film.title} (${film.genres.join(", ")})
${isProjection ? "Note: 2026 windows are projected from 2025 seasonal patterns.\n" : ""}
${windowsText}

Genre-comparable historical releases:
${compsText}

Write 3–4 sentences: recommend a window (or the better of two), name the key competitive threats or lack thereof, and note any market size or seasonal context worth flagging. Be direct and specific. No bullet points.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ analysis: text });
  } catch (err) {
    console.error("analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
