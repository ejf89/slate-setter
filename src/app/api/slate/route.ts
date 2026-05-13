import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import type { SlateFilm } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "data", "slate.db");

export async function GET() {
  const db = new Database(DB_PATH, { readonly: true });

  const rows = db
    .prepare("SELECT * FROM slate_films ORDER BY status DESC, title ASC")
    .all() as Array<{
    id: number;
    title: string;
    genres: string;
    director: string | null;
    logline: string | null;
    tentative_date: string | null;
    status: string;
  }>;

  db.close();

  const data: SlateFilm[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    genres: JSON.parse(r.genres || "[]"),
    director: r.director,
    logline: r.logline,
    tentativeDate: r.tentative_date,
    status: r.status,
  }));

  return NextResponse.json(data);
}
