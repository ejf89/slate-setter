"use client";

import type { WeekendData, SimulateResult, SlateFilm, ThreatLevel } from "@/lib/types";
import { FilmCard } from "./FilmCard";
import { Badge } from "@/components/ui/badge";
import { getHolidayLabel } from "@/lib/holidays";

interface Props {
  weekend: WeekendData | null;
  simulate: SimulateResult | null;
  activeFilm: SlateFilm | null;
  loading: boolean;
}

function formatMoney(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

const THREAT_STYLES: Record<ThreatLevel, string> = {
  HIGH: "text-red-400 border-red-800 bg-red-950/30",
  MEDIUM: "text-amber-400 border-amber-800 bg-amber-950/30",
  LOW: "text-emerald-400 border-emerald-800 bg-emerald-950/30",
};

const THREAT_BAR: Record<ThreatLevel, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-emerald-500",
};

export function WeekDetail({ weekend, simulate, activeFilm, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        Loading…
      </div>
    );
  }

  if (!weekend) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-neutral-500 text-sm">Select a weekend on the timeline</p>
        {activeFilm && (
          <p className="text-neutral-600 text-xs">
            Analyzing <span className="text-amber-400">{activeFilm.title}</span> —
            click any weekend to see competition
          </p>
        )}
      </div>
    );
  }

  const dateObj = new Date(weekend.weekendDate + "T12:00:00Z");
  const holiday = getHolidayLabel(weekend.weekendDate);
  const activeGenres = activeFilm?.genres ?? [];
  const highlightSet = new Set(activeGenres);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white text-sm">
                {dateObj.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              {holiday && (
                <span className="text-xs">
                  {holiday.emoji} {holiday.label}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Total market: <span className="text-white font-mono">{formatMoney(weekend.totalGross)}</span>
              <span className="text-neutral-600 mx-1.5">·</span>
              {weekend.films.length} films in theaters
            </p>
          </div>
        </div>

        {/* Competition score bar (only in simulate mode) */}
        {simulate && activeFilm && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-400">
                Competition for <span className="text-amber-300">{activeFilm.title}</span>
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                  THREAT_STYLES[simulate.rating]
                }`}
              >
                {simulate.rating}
              </span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${THREAT_BAR[simulate.rating]}`}
                style={{ width: `${Math.min(simulate.competitionScore * 200, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Simulate results: competitors + alternatives */}
        {simulate && activeFilm && (
          <div className="px-3 py-3 border-b border-neutral-800 space-y-2">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Key Competitors
            </p>
            {simulate.competitors.length === 0 ? (
              <p className="text-xs text-neutral-600">No significant competition this weekend.</p>
            ) : (
              simulate.competitors.slice(0, 4).map((c) => (
                <div
                  key={c.title}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-neutral-300 truncate">{c.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-neutral-500">{c.reason}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        THREAT_STYLES[c.threat]
                      }`}
                    >
                      {c.threat}
                    </span>
                  </div>
                </div>
              ))
            )}

            {simulate.alternatives.length > 0 && (
              <div className="pt-2 border-t border-neutral-800">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                  Better Alternatives Nearby
                </p>
                {simulate.alternatives.slice(0, 3).map((alt) => (
                  <div
                    key={alt.weekendDate}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <span className="text-neutral-400">
                      {new Date(alt.weekendDate + "T12:00:00Z").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500 font-mono">
                        {formatMoney(alt.totalGross)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          THREAT_STYLES[alt.rating]
                        }`}
                      >
                        {alt.rating}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full film list */}
        <div className="px-3 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            In Theaters
          </p>
          {weekend.films.map((film) => {
            const highlighted =
              activeGenres.length > 0 &&
              film.genres.some((g) => highlightSet.has(g));
            return (
              <FilmCard key={film.filmId} film={film} highlight={highlighted} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
