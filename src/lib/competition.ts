import type { ThreatLevel } from "./types";

export const SCORE_HIGH = 0.35;
export const SCORE_MEDIUM = 0.18;

const ADJACENT_GENRES: [string, string][] = [
  ["Horror", "Thriller"],
  ["Horror", "Mystery"],
  ["Action", "Adventure"],
  ["Action", "Thriller"],
  ["Drama", "Romance"],
  ["Comedy", "Romance"],
  ["Comedy", "Animation"],
  ["Animation", "Family"],
  ["Fantasy", "Adventure"],
  ["Fantasy", "Sci-Fi"],
  ["Crime", "Thriller"],
  ["Crime", "Drama"],
];

export function genreOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.15;
  if (a.some((g) => b.includes(g))) return 1.0;
  const adjacent = ADJACENT_GENRES.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))
  );
  return adjacent ? 0.6 : 0.15;
}

export function ratingFromScore(score: number): ThreatLevel {
  if (score >= SCORE_HIGH) return "HIGH";
  if (score >= SCORE_MEDIUM) return "MEDIUM";
  return "LOW";
}
