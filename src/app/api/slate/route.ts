import { NextResponse } from "next/server";
import { getDb, getCached, setCached } from "@/lib/db";
import type { SlateFilm } from "@/lib/types";

export async function GET() {
  const CACHE_KEY = "slate";
  const cached = getCached<SlateFilm[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM slate_films WHERE status != 'released'
     ORDER BY CASE status WHEN 'confirmed' THEN 0 WHEN 'announced' THEN 1 ELSE 2 END,
     tentative_date ASC NULLS LAST, title ASC`
  ).all() as Array<{
    id: number; title: string; genres: string; director: string | null;
    logline: string | null; tentative_date: string | null; status: string;
  }>;

  const data: SlateFilm[] = rows.map((r) => ({
    id: r.id, title: r.title, genres: JSON.parse(r.genres || "[]"),
    director: r.director, logline: r.logline,
    tentativeDate: r.tentative_date, status: r.status,
  }));

  setCached(CACHE_KEY, data);
  return NextResponse.json(data);
}
