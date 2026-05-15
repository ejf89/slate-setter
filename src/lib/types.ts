export type ThreatLevel = "HIGH" | "MEDIUM" | "LOW";

export interface SlateFilm {
  id: number;
  title: string;
  genres: string[];
  director: string | null;
  logline: string | null;
  tentativeDate: string | null;
  status: string;
  studio?: string;
}
