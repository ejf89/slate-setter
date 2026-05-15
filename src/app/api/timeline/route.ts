import { NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import type { TimelineWeekend } from "@/lib/types";

export async function GET() {
  const CACHE_KEY = "timeline";
  const cached = getCached<TimelineWeekend[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  const db = getDb();
  const rows = db.prepare(
    `SELECT agg.weekend_date, agg.total_gross, agg.film_count, f.title as top_film
     FROM (
       SELECT weekend_date, SUM(gross) as total_gross, COUNT(*) as film_count
       FROM weekend_performances GROUP BY weekend_date
     ) agg
     JOIN weekend_performances top ON top.weekend_date = agg.weekend_date AND top.rank = 1
     JOIN films f ON f.id = top.film_id
     ORDER BY agg.weekend_date ASC`
  ).all() as Array<{ weekend_date: string; total_gross: number; film_count: number; top_film: string }>;

  const data: TimelineWeekend[] = rows.map((r) => ({
    weekendDate: r.weekend_date,
    totalGross: r.total_gross,
    filmCount: r.film_count,
    topFilm: r.top_film,
  }));

  setCached(CACHE_KEY, data);
  return NextResponse.json(data);
}
