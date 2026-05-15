import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "slate.db");

// Attach to globalThis so Turbopack hot-reloads don't tear down the connection or cache
type G = typeof globalThis & {
  __slateDb?: Database.Database;
  __slateCache?: Map<string, { value: unknown; at: number }>;
};
const g = global as G;

export function getDb(): Database.Database {
  if (!g.__slateDb || !g.__slateDb.open) {
    g.__slateDb = new Database(DB_PATH, { readonly: true });
  }
  return g.__slateDb;
}

const TTL_MS = 10 * 60 * 1000;

function cache(): Map<string, { value: unknown; at: number }> {
  if (!g.__slateCache) g.__slateCache = new Map();
  return g.__slateCache;
}

export function getCached<T>(key: string): T | null {
  const entry = cache().get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) { cache().delete(key); return null; }
  return entry.value as T;
}

export function setCached(key: string, value: unknown): void {
  cache().set(key, { value, at: Date.now() });
}
