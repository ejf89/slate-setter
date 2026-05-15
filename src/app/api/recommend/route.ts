import { NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import { scoreWeekend, ratingFromScore } from "@/lib/competition";
import type { RecommendedWeekend } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const genresParam = searchParams.get("genres") ?? "";
  const excludeCovid = searchParams.get("excludeCovid") === "true";

  const genres = genresParam ? genresParam.split(",").map((g) => g.trim()).filter(Boolean) : [];
  if (!genres.length) return NextResponse.json({ recommendations: [] });

  const cacheKey = `recommend:${[...genres].sort().join(",")}:${excludeCovid}`;
  const cached = getCached<{ recommendations: RecommendedWeekend[] }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const db = getDb();
  const covidClause = excludeCovid
    ? `AND (wp.weekend_date < '2020-01-01' OR wp.weekend_date >= '2022-01-01')`
    : "";

  const rows = db.prepare(
    `SELECT wp.weekend_date, wp.gross, wp.weeks_in_release, f.genres
     FROM weekend_performances wp
     JOIN films f ON f.id = wp.film_id
     WHERE 1=1 ${covidClause}
     ORDER BY wp.weekend_date`
  ).all() as Array<{
    weekend_date: string; gross: number; weeks_in_release: number; genres: string;
  }>;

  // Minimal scoring shape — only the three fields scoreWeekend actually reads
  type ScoringFilm = { gross: number; weeksInRelease: number; genres: string[] };
  const byWeekend = new Map<string, { films: ScoringFilm[]; totalGross: number }>();
  for (const r of rows) {
    if (!byWeekend.has(r.weekend_date)) byWeekend.set(r.weekend_date, { films: [], totalGross: 0 });
    const entry = byWeekend.get(r.weekend_date)!;
    entry.films.push({
      gross: r.gross,
      weeksInRelease: r.weeks_in_release,
      genres: JSON.parse(r.genres || "[]"),
    });
    entry.totalGross += r.gross;
  }

  let totalSum = 0;
  for (const { totalGross } of byWeekend.values()) totalSum += totalGross;
  const avgGross = totalSum / (byWeekend.size || 1);

  const recommendations: RecommendedWeekend[] = [];
  for (const [date, { films, totalGross }] of byWeekend) {
    if (!films.length) continue;
    const competitionScore = scoreWeekend(genres, films);
    const rating = ratingFromScore(competitionScore);
    const opportunityScore = (totalGross / avgGross) * (1 - competitionScore);
    recommendations.push({ weekendDate: date, totalGross, competitionScore, rating, opportunityScore });
  }

  recommendations.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const result = { recommendations: recommendations.slice(0, 15) };
  setCached(cacheKey, result);
  return NextResponse.json(result);
}
