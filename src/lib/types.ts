export interface FilmInTheater {
  filmId: number;
  title: string;
  studio: string | null;
  genres: string[];
  gross: number;
  cumulativeGross: number;
  weeksInRelease: number;
  theaters: number | null;
  rank: number;
  mpaaRating: string | null;
  overview: string | null;
}

export interface WeekendData {
  weekendDate: string;
  totalGross: number;
  films: FilmInTheater[];
}

export interface TimelineWeekend {
  weekendDate: string;
  totalGross: number;
  filmCount: number;
  topFilm: string;
}

export interface SlateFilm {
  id: number;
  title: string;
  genres: string[];
  director: string | null;
  logline: string | null;
  tentativeDate: string | null;
  status: string;
}

export type ThreatLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CompetitorThreat {
  title: string;
  genres: string[];
  gross: number;
  weeksInRelease: number;
  threat: ThreatLevel;
  reason: string;
}

export interface SimulateResult {
  weekendDate: string;
  competitionScore: number;
  rating: ThreatLevel;
  competitors: CompetitorThreat[];
  totalGross: number;
  historicalAvgGross: number;
  alternatives: AlternativeWeekend[];
}

export interface AlternativeWeekend {
  weekendDate: string;
  competitionScore: number;
  rating: ThreatLevel;
  totalGross: number;
}

export interface RecommendedWeekend {
  weekendDate: string;
  totalGross: number;
  competitionScore: number;
  rating: ThreatLevel;
  opportunityScore: number;
}
