"use client";

import type { WeekendData, SimulateResult, SlateFilm, ThreatLevel, RecommendedWeekend } from "@/lib/types";
import { FilmCard } from "./FilmCard";
import { getHolidayLabel } from "@/lib/holidays";

interface Props {
  weekend: WeekendData | null;
  simulate: SimulateResult | null;
  activeFilm: SlateFilm | null;
  loading: boolean;
  recommendations: RecommendedWeekend[];
  recommendLoading: boolean;
  compareDate: string | null;
  compareDetail: WeekendData | null;
  compareSimulate: SimulateResult | null;
  compareLoading: boolean;
  onSelectDate: (date: string | null) => void;
  onCompare: (date: string) => void;
  onClearCompare: () => void;
}

function formatMoney(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

const THREAT_STYLES: Record<ThreatLevel, string> = {
  HIGH:   "text-red-400 border-red-800 bg-red-950/30",
  MEDIUM: "text-amber-400 border-amber-800 bg-amber-950/30",
  LOW:    "text-emerald-400 border-emerald-800 bg-emerald-950/30",
};

const VERDICT: Record<ThreatLevel, { label: string; desc: string }> = {
  HIGH:   { label: "Avoid",     desc: "Heavy genre competition" },
  MEDIUM: { label: "Caution",   desc: "Some audience overlap" },
  LOW:    { label: "Favorable", desc: "Light competition" },
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase mb-2">
      {children}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-neutral-800">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

// ── Comparison column ────────────────────────────────────────────────────────

function DateColumn({
  date,
  detail,
  simulate,
  accent,
}: {
  date: string;
  detail: WeekendData;
  simulate: SimulateResult | null;
  accent: "amber" | "sky";
}) {
  const dateObj = new Date(date + "T12:00:00Z");
  const holiday = getHolidayLabel(date);
  const marketVsAvg = simulate
    ? ((detail.totalGross - simulate.historicalAvgGross) / simulate.historicalAvgGross) * 100
    : null;

  const accentClass = accent === "amber" ? "text-amber-400" : "text-sky-400";
  const borderClass = accent === "amber" ? "border-amber-900/60" : "border-sky-900/60";

  return (
    <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
      <div className={`px-3 py-3 border-b ${borderClass} shrink-0`}>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${accentClass} mb-0.5`}>
          {accent === "amber" ? "Primary" : "Compare"}
        </p>
        <p className="font-semibold text-white text-xs leading-snug">
          {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {holiday && <span className="ml-1">{holiday.emoji}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
        {/* Market */}
        <div>
          <Label>Market</Label>
          <p className="font-mono text-xl font-bold text-white">{formatMoney(detail.totalGross)}</p>
          {marketVsAvg !== null && (
            <p className={`text-xs mt-0.5 ${marketVsAvg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {marketVsAvg >= 0 ? "+" : ""}{marketVsAvg.toFixed(0)}% vs historical avg
            </p>
          )}
        </div>

        {/* Verdict */}
        {simulate && (
          <div>
            <Label>Competition</Label>
            <div className={`rounded-lg border px-3 py-2.5 ${THREAT_STYLES[simulate.rating]}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{VERDICT[simulate.rating].label}</span>
                <span className="font-mono text-xs">{(simulate.competitionScore * 100).toFixed(0)}/100</span>
              </div>
              <p className="text-[11px] mt-0.5 opacity-80">{VERDICT[simulate.rating].desc}</p>
            </div>
            <div className="mt-1.5 h-1 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  simulate.rating === "HIGH" ? "bg-red-500" : simulate.rating === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(simulate.competitionScore * 200, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Top threats */}
        {simulate && simulate.competitors.length > 0 && (
          <div>
            <Label>Top Threats</Label>
            <div className="space-y-1.5">
              {simulate.competitors.slice(0, 3).map((c) => (
                <div key={c.title} className="rounded border border-neutral-800 bg-neutral-900/50 px-2 py-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-neutral-200 text-xs leading-snug truncate">{c.title}</span>
                    <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-semibold border ${THREAT_STYLES[c.threat]}`}>
                      {c.threat}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    {c.weeksInRelease === 1 ? "Opening" : `Wk ${c.weeksInRelease}`}
                    {c.genres.length > 0 && ` · ${c.genres.slice(0, 2).join(", ")}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {simulate && simulate.competitors.length === 0 && (
          <div>
            <Label>Threats</Label>
            <p className="text-xs text-emerald-500">✓ No significant audience overlap</p>
          </div>
        )}

        {/* Top films at box office */}
        <div>
          <Label>At the Box Office</Label>
          <div className="space-y-1">
            {detail.films.slice(0, 5).map((f) => (
              <div key={f.filmId} className="flex items-center justify-between text-xs gap-2">
                <span className="text-neutral-400 truncate">{f.title}</span>
                <span className="text-neutral-600 font-mono shrink-0">{formatMoney(f.gross)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comparison view ──────────────────────────────────────────────────────────

function ComparisonView({
  film,
  primaryDate,
  primaryDetail,
  primarySimulate,
  compareDate,
  compareDetail,
  compareSimulate,
  compareLoading,
  onClearCompare,
}: {
  film: SlateFilm;
  primaryDate: string;
  primaryDetail: WeekendData;
  primarySimulate: SimulateResult | null;
  compareDate: string;
  compareDetail: WeekendData | null;
  compareSimulate: SimulateResult | null;
  compareLoading: boolean;
  onClearCompare: () => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 shrink-0 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-widest">Side by side</p>
          <p className="text-sm font-semibold text-white">
            <span className="text-amber-400">{film.title}</span>
            <span className="text-neutral-600 font-normal"> · release comparison</span>
          </p>
        </div>
        <button
          onClick={onClearCompare}
          className="text-xs text-neutral-500 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded px-2 py-1 transition-colors"
        >
          ✕ Close
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden divide-x divide-neutral-800">
        <DateColumn
          date={primaryDate}
          detail={primaryDetail}
          simulate={primarySimulate}
          accent="amber"
        />
        {compareLoading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
            Loading…
          </div>
        ) : compareDetail ? (
          <DateColumn
            date={compareDate}
            detail={compareDetail}
            simulate={compareSimulate}
            accent="sky"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-700 text-sm px-4 text-center">
            Failed to load comparison data
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendation list ──────────────────────────────────────────────────────

function RecommendationList({
  film,
  recommendations,
  loading,
  onSelectDate,
  onCompare,
}: {
  film: SlateFilm;
  recommendations: RecommendedWeekend[];
  loading: boolean;
  onSelectDate: (date: string | null) => void;
  onCompare: (date: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        Analyzing competition for {film.title}...
      </div>
    );
  }

  const maxOpp = recommendations[0]?.opportunityScore ?? 1;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
        <p className="text-xs text-neutral-500">Best release windows for</p>
        <h2 className="font-semibold text-white text-sm mt-0.5">
          <span className="text-amber-400">{film.title}</span>
        </h2>
        <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
          Ranked by market size × low competition. Click a date to explore its full competition breakdown.
          Use <span className="text-neutral-400 font-medium">Compare</span> to put two dates side by side.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {recommendations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-600 text-sm px-6 text-center">
            No data available. Run the seed script to populate historical weekends.
          </div>
        ) : (
          <div>
            {recommendations.map((rec, i) => {
              const dateObj = new Date(rec.weekendDate + "T12:00:00Z");
              const holiday = getHolidayLabel(rec.weekendDate);
              const barWidth = Math.round((rec.opportunityScore / maxOpp) * 100);
              const oppPct = Math.round((rec.opportunityScore / maxOpp) * 100);

              // ── Hero card: #1 ──────────────────────────────────────────────
              if (i === 0) {
                return (
                  <div key={rec.weekendDate} className="border-b border-neutral-800 bg-amber-950/20">
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-[10px] font-bold tracking-widest text-amber-400 uppercase">
                            Best Window
                          </span>
                          <p className="text-lg font-bold text-white mt-0.5 leading-tight">
                            {dateObj.toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {holiday && <span className="ml-2 font-normal">{holiday.emoji}</span>}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded border shrink-0 ${THREAT_STYLES[rec.rating]}`}
                        >
                          {rec.rating}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mb-3">
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-0.5">
                            Opportunity
                          </p>
                          <p className="text-2xl font-mono font-bold text-amber-400">
                            {oppPct}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-0.5">
                            Market
                          </p>
                          <p className="text-xl font-mono font-bold text-white">
                            {formatMoney(rec.totalGross)}
                          </p>
                        </div>
                      </div>

                      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => onSelectDate(rec.weekendDate)}
                          className="flex-1 text-center text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 border border-amber-700/50 text-amber-300 rounded px-3 py-1.5 transition-colors"
                        >
                          Explore this date
                        </button>
                        <button
                          onClick={() => onCompare(rec.weekendDate)}
                          className="text-xs font-medium bg-neutral-800/60 hover:bg-sky-950/40 border border-neutral-700 hover:border-sky-700/50 text-neutral-400 hover:text-sky-400 rounded px-3 py-1.5 transition-colors"
                        >
                          Compare
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Secondary cards: #2–5 ──────────────────────────────────────
              if (i >= 1 && i <= 4) {
                return (
                  <div
                    key={rec.weekendDate}
                    className="border-b border-neutral-800 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono text-neutral-500 shrink-0 w-4">
                          {i + 1}
                        </span>
                        <p className="text-sm font-medium text-white truncate">
                          {dateObj.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {holiday && <span className="ml-1">{holiday.emoji}</span>}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${THREAT_STYLES[rec.rating]}`}
                      >
                        {rec.rating}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mb-2 pl-6">
                      <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neutral-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                        {oppPct}% opp
                      </span>
                      <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                        {formatMoney(rec.totalGross)}
                      </span>
                    </div>

                    <div className="flex gap-2 pl-6">
                      <button
                        onClick={() => onSelectDate(rec.weekendDate)}
                        className="flex-1 text-left text-[11px] text-neutral-400 hover:text-white transition-colors"
                      >
                        Explore
                      </button>
                      <button
                        onClick={() => onCompare(rec.weekendDate)}
                        className="text-[11px] font-medium border border-neutral-700 hover:border-sky-700/50 text-neutral-500 hover:text-sky-400 rounded px-2 py-0.5 transition-colors"
                      >
                        Compare
                      </button>
                    </div>
                  </div>
                );
              }

              // ── Compact rows: #6–15 ────────────────────────────────────────
              return (
                <div
                  key={rec.weekendDate}
                  className="flex items-stretch border-b border-neutral-800/60"
                >
                  <button
                    onClick={() => onSelectDate(rec.weekendDate)}
                    className="flex-1 text-left px-3 py-2 hover:bg-neutral-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] w-5 shrink-0 font-mono text-neutral-600">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs text-neutral-300 truncate">
                            {dateObj.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {holiday && <span className="ml-1">{holiday.emoji}</span>}
                          </p>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${THREAT_STYLES[rec.rating]}`}
                          >
                            {rec.rating}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-0.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-neutral-700"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-600 font-mono shrink-0">
                            {formatMoney(rec.totalGross)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => onCompare(rec.weekendDate)}
                    className="px-3 text-[11px] font-medium text-neutral-700 hover:text-sky-400 hover:bg-sky-950/30 transition-colors border-l border-neutral-800/60"
                  >
                    Compare
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-neutral-800 shrink-0">
        <p className="text-[10px] text-neutral-600 leading-relaxed">
          Opportunity = market size × (1 − competition score)
        </p>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function WeekDetail({
  weekend,
  simulate,
  activeFilm,
  loading,
  recommendations,
  recommendLoading,
  compareDate,
  compareDetail,
  compareSimulate,
  compareLoading,
  onSelectDate,
  onCompare,
  onClearCompare,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        Loading…
      </div>
    );
  }

  // Comparison mode: primary date is selected + compare date is set
  if (activeFilm && weekend && compareDate) {
    return (
      <ComparisonView
        film={activeFilm}
        primaryDate={weekend.weekendDate}
        primaryDetail={weekend}
        primarySimulate={simulate}
        compareDate={compareDate}
        compareDetail={compareDetail}
        compareSimulate={compareSimulate}
        compareLoading={compareLoading}
        onClearCompare={onClearCompare}
      />
    );
  }

  // Film selected, no weekend → show ranked recommendations
  if (activeFilm && !weekend) {
    return (
      <RecommendationList
        film={activeFilm}
        recommendations={recommendations}
        loading={recommendLoading}
        onSelectDate={onSelectDate}
        onCompare={onCompare}
      />
    );
  }

  // Nothing selected
  if (!activeFilm && !weekend) {
    return (
      <div className="flex flex-col justify-center h-full px-6 gap-6">
        <div className="text-center">
          <p className="text-neutral-300 text-sm font-semibold mb-1">How it works</p>
          <p className="text-neutral-600 text-xs">Pick a film to get a ranked list of best release dates</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-700/50 text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <div>
              <p className="text-neutral-300 text-xs font-medium">Pick a film from your slate</p>
              <p className="text-neutral-600 text-[11px] mt-0.5 leading-relaxed">The chart recolors by competition level for that film's genres</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Review best release windows here</p>
              <p className="text-neutral-600 text-[11px] mt-0.5 leading-relaxed">Ranked by market size × low competition — the top pick appears first</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Click a date to see full competition</p>
              <p className="text-neutral-600 text-[11px] mt-0.5 leading-relaxed">Every film in theaters that week, holdovers included, scored by genre overlap</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
            <div>
              <p className="text-neutral-400 text-xs font-medium">Compare two dates side by side</p>
              <p className="text-neutral-600 text-[11px] mt-0.5 leading-relaxed">Hit Compare on any date to see market and threats in parallel</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!weekend) return null;

  const dateObj = new Date(weekend.weekendDate + "T12:00:00Z");
  const holiday = getHolidayLabel(weekend.weekendDate);
  const dateLabel = dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const activeGenres = activeFilm?.genres ?? [];
  const highlightSet = new Set(activeGenres);

  const marketVsAvg = simulate
    ? ((weekend.totalGross - simulate.historicalAvgGross) / simulate.historicalAvgGross) * 100
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-500">
              {activeFilm ? `Opening ${activeFilm.title} on…` : "Weekend of"}
            </p>
            <h2 className="font-semibold text-white text-sm mt-0.5">
              {dateLabel}
              {holiday && <span className="ml-2 font-normal">{holiday.emoji}</span>}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Market</p>
            <p className="font-mono text-sm text-white">{formatMoney(weekend.totalGross)}</p>
            {marketVsAvg !== null && (
              <p className={`text-[11px] ${marketVsAvg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {marketVsAvg >= 0 ? "+" : ""}{marketVsAvg.toFixed(0)}% vs avg
              </p>
            )}
          </div>
        </div>
        {activeFilm && (
          <button
            onClick={() => { onSelectDate(null); onClearCompare(); }}
            className="mt-2 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            ← Back to best dates for {activeFilm.title}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">

        {simulate && activeFilm && (
          <Section title="Release Verdict">
            <div className={`rounded-lg border px-3 py-2.5 ${THREAT_STYLES[simulate.rating]}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{VERDICT[simulate.rating].label}</span>
                <span className="text-xs font-mono">{(simulate.competitionScore * 100).toFixed(0)} / 100</span>
              </div>
              <p className="text-xs mt-0.5 opacity-80">{VERDICT[simulate.rating].desc}</p>
            </div>
            <div className="mt-2 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  simulate.rating === "HIGH" ? "bg-red-500" : simulate.rating === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(simulate.competitionScore * 200, 100)}%` }}
              />
            </div>
          </Section>
        )}

        {simulate && simulate.alternatives.length > 0 && (
          <Section title="Better Dates Nearby">
            <p className="text-[11px] text-neutral-600 mb-2">
              Lower-competition weekends within 3 months. Click to explore or use Compare to put two dates side by side.
            </p>
            {simulate.alternatives.slice(0, 5).map((alt, i) => {
              const altDate = new Date(alt.weekendDate + "T12:00:00Z");
              const altHoliday = getHolidayLabel(alt.weekendDate);
              return (
                <div key={alt.weekendDate} className="flex items-stretch border-b border-neutral-800/40 last:border-0">
                  <button
                    onClick={() => onSelectDate(alt.weekendDate)}
                    className="flex-1 text-left flex items-center gap-2 py-1.5 hover:bg-neutral-800/20 transition-colors rounded-l"
                  >
                    <span className="text-neutral-600 text-[11px] w-3">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-200">
                        {altDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {altHoliday && <span className="ml-1">{altHoliday.emoji}</span>}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono">{formatMoney(alt.totalGross)} market</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${THREAT_STYLES[alt.rating]}`}>
                      {alt.rating}
                    </span>
                  </button>
                  <button
                    onClick={() => onCompare(alt.weekendDate)}
                    className="px-3 text-[11px] font-medium text-neutral-700 hover:text-sky-400 hover:bg-sky-950/30 transition-colors border-l border-neutral-800/40"
                  >
                    Compare
                  </button>
                </div>
              );
            })}
          </Section>
        )}

        {simulate && activeFilm && (
          <Section title="Who's Competing for Your Audience">
            <p className="text-[11px] text-neutral-600 mb-2 leading-relaxed">
              Films playing this weekend that overlap with{" "}
              <span className="text-neutral-400">{activeFilm.genres.join(", ")}</span> audiences.
            </p>
            {simulate.competitors.length === 0 ? (
              <p className="text-xs text-emerald-500">✓ No significant audience overlap.</p>
            ) : (
              <div className="space-y-1.5">
                {simulate.competitors.slice(0, 5).map((c) => (
                  <div key={c.title} className="rounded border border-neutral-800 bg-neutral-900/60 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-200 text-xs font-medium truncate">{c.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${THREAT_STYLES[c.threat]}`}>
                        {c.threat}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500 flex-wrap">
                      <span className={`font-mono px-1 rounded text-[10px] border ${
                        c.weeksInRelease === 1
                          ? "text-amber-400 border-amber-700/50 bg-amber-950/30"
                          : "text-neutral-400 border-neutral-700"
                      }`}>
                        {c.weeksInRelease === 1 ? "Opening" : `Week ${c.weeksInRelease}`}
                      </span>
                      <span>{c.genres.join(", ") || "Genre unknown"}</span>
                      <span className="ml-auto font-mono">{formatMoney(c.gross)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title={`In Theaters (${weekend.films.length} films)`}>
          {!activeFilm && (
            <p className="text-[11px] text-neutral-600 mb-2">
              Select a film from your slate to see audience overlap.
            </p>
          )}
          <div className="space-y-1.5">
            {weekend.films.map((film) => (
              <FilmCard
                key={film.filmId}
                film={film}
                highlight={activeGenres.length > 0 && film.genres.some((g) => highlightSet.has(g))}
              />
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}
