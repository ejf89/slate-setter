import type { FilmInTheater, CompetitorThreat, ThreatLevel } from "./types";

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
  const directMatch = a.some((g) => b.includes(g));
  if (directMatch) return 1.0;
  const adjacent = ADJACENT_GENRES.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))
  );
  return adjacent ? 0.6 : 0.15;
}

export function scoreWeekend(targetGenres: string[], films: FilmInTheater[]): number {
  const totalGross = films.reduce((s, f) => s + f.gross, 0);
  if (totalGross === 0) return 0;
  return films.reduce((score, film) => {
    const overlap = genreOverlap(targetGenres, film.genres);
    const holdoverDecay = 1 / (film.weeksInRelease || 1);
    const marketShare = film.gross / totalGross;
    return score + overlap * holdoverDecay * marketShare;
  }, 0);
}

export function ratingFromScore(score: number): ThreatLevel {
  if (score >= 0.35) return "HIGH";
  if (score >= 0.18) return "MEDIUM";
  return "LOW";
}

export function buildCompetitors(
  targetGenres: string[],
  films: FilmInTheater[]
): CompetitorThreat[] {
  const totalGross = films.reduce((s, f) => s + f.gross, 0);
  return films
    .map((film) => {
      const overlap = genreOverlap(targetGenres, film.genres);
      const holdoverDecay = 1 / (film.weeksInRelease || 1);
      const contribution = overlap * holdoverDecay * (film.gross / (totalGross || 1));
      const threat: ThreatLevel = contribution >= 0.12 ? "HIGH" : contribution >= 0.05 ? "MEDIUM" : "LOW";

      let reason = "";
      if (overlap === 1.0) reason = `Same genre · Week ${film.weeksInRelease}`;
      else if (overlap === 0.6) reason = `Adjacent genre · Week ${film.weeksInRelease}`;
      else reason = `Different audience · Week ${film.weeksInRelease}`;

      return { title: film.title, genres: film.genres, gross: film.gross, weeksInRelease: film.weeksInRelease, threat, reason };
    })
    .filter((c) => c.threat !== "LOW" || films.length <= 5)
    .sort((a, b) => (a.threat === "HIGH" ? -1 : b.threat === "HIGH" ? 1 : 0));
}
