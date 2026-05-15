"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { SlateFilm } from "@/lib/types";
import { SCORE_HIGH, SCORE_MEDIUM } from "@/lib/competition";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FilmEntry {
  filmId: number;
  title: string;
  genres: string[];
  gross: number;
  weeksInRelease: number;
  threatScore: number;
  isThreat: boolean;
}

interface Weekend {
  date: string;
  totalGross: number;
  competitionScore: number;
  rating: "HIGH" | "MEDIUM" | "LOW";
  films: FilmEntry[];
}

interface WindowResult {
  weekends: Weekend[];
  targetGenres: string[];
  window: string;
  isProjection: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { key: "full-2023", label: "2023", projected: false },
  { key: "full-2024", label: "2024", projected: false },
  { key: "full-2025", label: "2025", projected: false },
  { key: "full-2026", label: "2026 ↗", projected: true },
] as const;

type WindowKey = (typeof WINDOW_OPTIONS)[number]["key"];
const DEFAULT_WINDOW: WindowKey = "full-2026";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return {
    month:     d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day:       String(d.getUTCDate()),
    year:      String(d.getUTCFullYear()),
    monthYear: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

function formatM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function bandColor(score: number) {
  if (score >= 0.55) return "#ef4444";
  if (score >= SCORE_HIGH) return "#f97316";
  if (score >= SCORE_MEDIUM) return "#eab308";
  return "#22c55e";
}

function splitThreats(films: FilmEntry[]) {
  return {
    threats: films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore),
    others:  films.filter((f) => !f.isThreat).sort((a, b) => b.gross - a.gross),
  };
}

function ratingClass(r: "HIGH" | "MEDIUM" | "LOW") {
  return r === "HIGH" ? "text-red-400" : r === "MEDIUM" ? "text-amber-400" : "text-emerald-400";
}

function groupByMonth(weekends: Weekend[]) {
  const map = new Map<string, Weekend[]>();
  for (const w of weekends) {
    const key = parseDate(w.date).monthYear;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return Array.from(map.entries()).map(([label, ws]) => ({ label, weekends: ws }));
}

// ─── Score badge (portal tooltip) ────────────────────────────────────────────

function ScoreBadge({ weekend, size = "sm" }: { weekend: Weekend; size?: "sm" | "lg" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);

  const pct = (weekend.competitionScore * 100).toFixed(0) + "%";
  const cls = ratingClass(weekend.rating);
  const label = weekend.rating === "HIGH" ? "High" : weekend.rating === "MEDIUM" ? "Med" : "Low";

  const TOOLTIP_H = 180;
  const tooltipTop = pos
    ? pos.y - TOOLTIP_H - 8 < 8 ? pos.y + pos.h + 8 : pos.y - TOOLTIP_H - 8
    : 0;

  const tooltip =
    pos && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed z-[9999] w-64 pointer-events-none" style={{ left: pos.x, top: tooltipTop }}>
            <div className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl">
              <p className="text-white text-xs font-medium mb-1.5">Competition score</p>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                Share of box office that weekend from same-genre films.
              </p>
              <div className="mt-2 space-y-1">
                {(
                  [
                    ["Low",    "0–18%", "text-emerald-400"],
                    ["Medium", "18–35%", "text-amber-400"],
                    ["High",   "35%+",   "text-red-400"],
                  ] as const
                ).map(([lvl, range, color]) => (
                  <div key={lvl} className="flex justify-between text-[11px]">
                    <span className={`font-medium ${color}`}>{lvl}</span>
                    <span className="text-neutral-500 font-mono">{range}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 pt-2 border-t border-white/[0.06] text-neutral-600 text-[10px]">
                genre overlap × holdover decay × market share
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ x: r.left, y: r.top, h: r.height });
    }
  };

  if (size === "lg") {
    return (
      <>
        <span ref={ref} className="inline-flex items-baseline gap-1.5 cursor-help" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
          <span className={`text-2xl font-bold ${cls}`}>{pct}</span>
          <span className={`text-sm font-medium ${cls}`}>{label}</span>
          <span className="text-neutral-600 text-xs underline decoration-dotted">competition (?)</span>
        </span>
        {tooltip}
      </>
    );
  }
  return (
    <>
      <span ref={ref} className="inline-flex items-baseline gap-1 cursor-help" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
        <span className={`text-xs font-semibold ${cls}`}>{label} {pct}</span>
        <span className="text-neutral-700 text-[9px]">(?)</span>
      </span>
      {tooltip}
    </>
  );
}

// ─── Year heat map ────────────────────────────────────────────────────────────

function YearHeatMap({
  weekends,
  primaryDate,
  compareDate,
  onSelect,
  rowRefs,
}: {
  weekends: Weekend[];
  primaryDate: string | null;
  compareDate: string | null;
  onSelect: (date: string) => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  const monthGroups = groupByMonth(weekends);

  function handleDotClick(date: string) {
    onSelect(date);
    const el = rowRefs.current.get(date);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="px-5 py-3 border-b border-white/[0.04] shrink-0 bg-white/[0.01]">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {monthGroups.map(({ label, weekends: mws }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-[9px] text-neutral-700 w-7 shrink-0 uppercase tracking-wide">
              {label.slice(0, 3)}
            </span>
            <div className="flex gap-1">
              {mws.map((w) => {
                const isPrimary = w.date === primaryDate;
                const isCompare = w.date === compareDate;
                return (
                  <button
                    key={w.date}
                    onClick={() => handleDotClick(w.date)}
                    title={`${parseDate(w.date).month} ${parseDate(w.date).day} — ${(w.competitionScore * 100).toFixed(0)}% competition`}
                    className={`w-3 h-3 rounded-sm transition-all hover:scale-125 ${
                      isPrimary ? "outline outline-1 outline-offset-1 outline-white" :
                      isCompare ? "outline outline-1 outline-offset-1 outline-sky-400" : ""
                    }`}
                    style={{ backgroundColor: bandColor(w.competitionScore) }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Best windows strip ───────────────────────────────────────────────────────

function BestWindowsStrip({
  weekends,
  primaryDate,
  onSelect,
}: {
  weekends: Weekend[];
  primaryDate: string | null;
  onSelect: (date: string) => void;
}) {
  const top3 = [...weekends].sort((a, b) => a.competitionScore - b.competitionScore).slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="px-5 pt-3 pb-3 border-b border-white/[0.04] shrink-0">
      <div className="text-[9px] text-neutral-700 uppercase tracking-widest font-semibold mb-2.5">
        Best windows
      </div>
      <div className="grid grid-cols-3 gap-2">
        {top3.map((w, i) => {
          const { month, day } = parseDate(w.date);
          const active = w.date === primaryDate;
          const threatCount = w.films.filter((f) => f.isThreat).length;
          const topThreat = w.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore)[0];
          return (
            <button
              key={w.date}
              onClick={() => onSelect(w.date)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                active
                  ? "bg-white/[0.07] border-white/20"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10"
              }`}
            >
              <div className="text-[8px] text-neutral-700 font-mono mb-1.5">#{i + 1}</div>
              <div className="font-[family-name:var(--font-newsreader)] text-white text-lg leading-none mb-1">
                {month} {day}
              </div>
              <div className={`text-base font-bold leading-none mb-1 ${ratingClass(w.rating)}`}>
                {(w.competitionScore * 100).toFixed(0)}%
              </div>
              <div className="text-[10px] text-emerald-600 font-mono mb-1.5">
                {formatM(w.totalGross * (1 - w.competitionScore))} uncontested
              </div>
              <div className="text-[9px] text-neutral-600 leading-snug">
                {threatCount === 0
                  ? "no direct threats"
                  : topThreat
                  ? <>{topThreat.title.length > 18 ? topThreat.title.slice(0, 17) + "…" : topThreat.title}</>
                  : `${threatCount} threat${threatCount > 1 ? "s" : ""}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weekend row ──────────────────────────────────────────────────────────────

function WeekendRow({
  weekend,
  rank,
  isPrimary,
  isCompare,
  onSelect,
  onCompare,
  rowRef,
}: {
  weekend: Weekend;
  rank: number;
  isPrimary: boolean;
  isCompare: boolean;
  onSelect: () => void;
  onCompare: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const { month, day } = parseDate(weekend.date);
  const color = bandColor(weekend.competitionScore);
  const { threats, others } = splitThreats(weekend.films);

  const rowBg = isPrimary
    ? "bg-white/[0.04]"
    : isCompare
    ? "bg-sky-950/20"
    : "hover:bg-white/[0.02]";

  return (
    <div ref={rowRef} className={`flex items-stretch transition-colors ${rowBg}`}>
      {/* Left accent indicator — always present, color changes by state */}
      <div className={`w-0.5 self-stretch shrink-0 transition-colors ${
        isPrimary ? "bg-white" : isCompare ? "bg-sky-400" : "bg-white/[0.06]"
      }`} />
      {/* Row body — click to set as View */}
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-5 px-4 py-2.5 text-left min-w-0"
      >
        {/* Date */}
        <div className="w-14 shrink-0">
          {rank <= 3 && (
            <div className="text-[8px] text-neutral-700 uppercase tracking-widest leading-none mb-0.5">
              #{rank}
            </div>
          )}
          <div className="font-[family-name:var(--font-newsreader)] text-white text-sm leading-tight">
            {month} {day}
          </div>
        </div>

        {/* Competition bar + score */}
        <div className="w-44 shrink-0">
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(weekend.competitionScore * 100, 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <ScoreBadge weekend={weekend} />
        </div>

        {/* Market gross */}
        <div className="w-14 shrink-0 text-right">
          <div className="text-xs text-neutral-500">{formatM(weekend.totalGross)}</div>
        </div>

        {/* Films in theaters */}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-0.5">
          {threats.slice(0, 2).map((f) => (
            <span
              key={`${f.filmId}-t-${f.weeksInRelease}`}
              className="flex items-baseline gap-1 min-w-0"
            >
              <span className="text-red-500 text-[8px] shrink-0">▲</span>
              <span className="font-[family-name:var(--font-newsreader)] text-white text-xs truncate">
                {f.title}
              </span>
              <span className="text-neutral-700 text-[9px] shrink-0">W{f.weeksInRelease}</span>
            </span>
          ))}
          {threats.length === 0 &&
            others.slice(0, 3).map((f) => (
              <span
                key={`${f.filmId}-o-${f.weeksInRelease}`}
                className={`flex items-baseline gap-1 min-w-0 ${f.weeksInRelease > 1 ? "opacity-40" : ""}`}
              >
                <span className="font-[family-name:var(--font-newsreader)] text-neutral-500 text-xs truncate">
                  {f.title}
                </span>
                <span className="text-neutral-700 text-[9px] shrink-0">W{f.weeksInRelease}</span>
              </span>
            ))}
        </div>
      </button>

      {/* Compare button */}
      <button
        onClick={onCompare}
        title={isCompare ? "Remove from compare" : "Compare this weekend"}
        className={`shrink-0 w-16 flex flex-col items-center justify-center gap-0.5 border-l border-white/[0.04] transition-all ${
          isCompare
            ? "bg-sky-950/40 text-sky-400"
            : "text-neutral-600 hover:text-sky-400 hover:bg-sky-950/10"
        }`}
      >
        <span className="text-[9px] font-semibold tracking-wide uppercase">
          {isCompare ? "vs" : "Compare"}
        </span>
        {isCompare && (
          <span className="text-[8px] text-sky-600">remove</span>
        )}
      </button>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function WeekendBreakdown({
  weekend,
  isProjection,
  onClear,
}: {
  weekend: Weekend;
  isProjection?: boolean;
  onClear?: () => void;
}) {
  const { month, day, year } = parseDate(weekend.date);
  const { threats, others } = splitThreats(weekend.films);
  const proxyYear = isProjection ? parseInt(weekend.date.slice(0, 4)) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="font-[family-name:var(--font-newsreader)] text-xl text-white font-normal leading-none">
              {month} {day}
            </div>
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xs italic">
              {year}
            </div>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="text-[10px] text-neutral-700 hover:text-neutral-400 transition-colors mt-0.5 shrink-0"
            >
              ✕
            </button>
          )}
        </div>
        <ScoreBadge weekend={weekend} />
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-neutral-600">market</span>
          <span className="text-white font-medium">{formatM(weekend.totalGross)}</span>
          <span className="text-neutral-700">·</span>
          <span className="text-emerald-400 font-medium">
            {formatM(weekend.totalGross * (1 - weekend.competitionScore))}
          </span>
          <span className="text-neutral-600">uncontested</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
        {isProjection && (
          <div className="px-4 pt-3 pb-0">
            <p className="text-[10px] text-neutral-600 italic">
              Projected — based on {proxyYear} theatrical landscape as proxy.
            </p>
          </div>
        )}

        {threats.length > 0 ? (
          <div className="px-4 py-3 border-b border-white/[0.04]">
            <div className="text-[9px] text-red-500 uppercase tracking-widest font-semibold mb-2">
              {isProjection ? "▲ Genre analogs (historical)" : "▲ Genre competition"}
            </div>
            <div className="space-y-2">
              {threats.map((f) => (
                <div key={`${f.filmId}-${f.weeksInRelease}`} className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-[family-name:var(--font-newsreader)] text-white text-xs leading-tight truncate">
                      {f.title}
                    </div>
                    <div className="text-neutral-600 text-[10px]">
                      {isProjection ? `${proxyYear} · ` : `Wk ${f.weeksInRelease} · `}
                      {f.genres.slice(0, 2).join(", ")}
                    </div>
                  </div>
                  <div className="text-red-400 text-xs font-semibold shrink-0">
                    {(f.threatScore * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-white/[0.04]">
            <div className="text-[9px] text-emerald-600 uppercase tracking-widest font-semibold mb-1">
              Genre competition
            </div>
            <p className="text-neutral-600 text-xs">No direct genre competition.</p>
          </div>
        )}

        <div className="px-4 py-3">
          <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-semibold mb-2">
            {isProjection ? `In theaters (${proxyYear})` : "In theaters"}
          </div>
          <div className="space-y-1.5">
            {others.slice(0, 6).map((f) => (
              <div
                key={`${f.filmId}-${f.weeksInRelease}`}
                className={`flex justify-between gap-2 ${f.weeksInRelease > 1 ? "opacity-40" : ""}`}
              >
                <div className="min-w-0">
                  <div className="font-[family-name:var(--font-newsreader)] text-neutral-300 text-xs truncate">
                    {f.title}
                  </div>
                  <div className="text-neutral-700 text-[9px]">
                    Wk {f.weeksInRelease} · {f.genres[0] ?? "—"}
                  </div>
                </div>
                <div className="text-neutral-600 text-[10px] shrink-0">{formatM(f.gross)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison insight ───────────────────────────────────────────────────────

function ComparisonInsight({ primary, compare }: { primary: Weekend; compare: Weekend }) {
  const pPct = primary.competitionScore * 100;
  const cPct = compare.competitionScore * 100;
  const { month: pMonth, day: pDay } = parseDate(primary.date);
  const { month: cMonth, day: cDay } = parseDate(compare.date);

  const ptsDiff = Math.abs(pPct - cPct);
  const isEquivalent = ptsDiff < 3;

  const primaryWins = primary.competitionScore <= compare.competitionScore;
  const higher = primaryWins ? compare.competitionScore : primary.competitionScore;
  const lower  = primaryWins ? primary.competitionScore : compare.competitionScore;
  const relDiff = higher > 0.01 ? Math.round((higher - lower) / higher * 100) : 0;

  const winnerLabel = primaryWins ? "View" : "Compare";
  const winnerDate  = primaryWins ? `${pMonth} ${pDay}` : `${cMonth} ${cDay}`;
  const winnerAccent = primaryWins ? "text-white" : "text-sky-400";

  const pThreats = primary.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
  const cThreats = compare.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
  const winThreats = primaryWins ? pThreats : cThreats;
  const loseThreats = primaryWins ? cThreats : pThreats;

  const grossDiffPct = Math.abs(primary.totalGross - compare.totalGross) / Math.max(primary.totalGross, compare.totalGross, 1) * 100;
  const biggerMarket = primary.totalGross >= compare.totalGross ? `${pMonth} ${pDay}` : `${cMonth} ${cDay}`;

  const reasons: string[] = [];
  if (!isEquivalent) {
    if (winThreats.length === 0 && loseThreats.length > 0) {
      reasons.push(`No genre threats vs ${loseThreats.length} on the other date`);
    } else if (winThreats.length < loseThreats.length) {
      reasons.push(`${winThreats.length} genre threat${winThreats.length !== 1 ? "s" : ""} vs ${loseThreats.length}`);
    }
    if (loseThreats[0]) {
      const t = loseThreats[0];
      const wk = t.weeksInRelease === 1 ? "opening" : `wk ${t.weeksInRelease}`;
      reasons.push(`${t.title} (${t.genres[0] ?? "—"}, ${wk}) weighs heavily`);
    }
    if (grossDiffPct > 15) {
      reasons.push(`${biggerMarket} is the larger market (${formatM(Math.max(primary.totalGross, compare.totalGross))} vs ${formatM(Math.min(primary.totalGross, compare.totalGross))})`);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0">
      {isEquivalent ? (
        <p className="text-neutral-400 text-xs mb-2.5">
          <span className="font-[family-name:var(--font-newsreader)] text-white">{pMonth} {pDay}</span>
          {" "}and{" "}
          <span className="font-[family-name:var(--font-newsreader)] text-white">{cMonth} {cDay}</span>
          {" "}are roughly equivalent — {ptsDiff < 1 ? "identical" : `${Math.round(ptsDiff)}pt`} difference.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-400 mb-1.5 leading-relaxed">
            <span className={`font-[family-name:var(--font-newsreader)] font-medium ${winnerAccent}`}>{winnerDate}</span>
            {" "}<span className={`text-[10px] font-semibold ${winnerAccent}`}>({winnerLabel})</span>
            {" "}has{" "}
            <span className="text-emerald-400 font-semibold">{relDiff}% less</span>
            {" "}genre competition
            <span className="text-neutral-600"> — {Math.round(ptsDiff)}pt difference</span>.
          </p>
          {reasons.length > 0 && (
            <ul className="mb-2.5 space-y-0.5">
              {reasons.map((r, i) => (
                <li key={i} className="text-[11px] text-neutral-500 flex items-start gap-1.5">
                  <span className="text-neutral-700 shrink-0 mt-px">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Side-by-side bars with labeled values */}
      <div className="space-y-2">
        {([
          { label: `${pMonth} ${pDay}`, score: primary.competitionScore, rating: primary.rating, gross: primary.totalGross, isCompare: false },
          { label: `${cMonth} ${cDay}`, score: compare.competitionScore, rating: compare.rating, gross: compare.totalGross, isCompare: true },
        ] as const).map((row) => (
          <div key={row.label}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[9px] w-11 shrink-0 ${row.isCompare ? "text-sky-600" : "text-neutral-500"}`}>
                {row.label}
              </span>
              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(row.score * 100, 100)}%`, backgroundColor: bandColor(row.score) }}
                />
              </div>
              <span className={`text-[10px] font-mono w-7 text-right shrink-0 ${ratingClass(row.rating)}`}>
                {(row.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="ml-[52px] flex items-center gap-1.5 text-[9px]">
              <span className="text-neutral-600">market {formatM(row.gross)}</span>
              <span className="text-neutral-800">·</span>
              <span className="text-emerald-700">{formatM(row.gross * (1 - row.score))} uncontested</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelSlot({
  weekend,
  label,
  accentClass,
  emptyHeading,
  emptySub,
  isProjection,
  onClear,
}: {
  weekend: Weekend | null;
  label: string;
  accentClass: string;
  emptyHeading: string;
  emptySub: string;
  isProjection?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="px-4 py-1.5 border-b border-white/[0.06] shrink-0">
        <span className={`text-[9px] uppercase tracking-widest font-semibold ${accentClass}`}>
          {label}
        </span>
      </div>
      {weekend ? (
        <WeekendBreakdown weekend={weekend} isProjection={isProjection} onClear={onClear} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="font-[family-name:var(--font-newsreader)] text-neutral-700 text-base italic mb-1">
            {emptyHeading}
          </div>
          <p className="text-neutral-700 text-xs">{emptySub}</p>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  primary,
  compare,
  activeFilm,
  isProjection,
  onClearPrimary,
  onClearCompare,
}: {
  primary: Weekend | null;
  compare: Weekend | null;
  activeFilm: SlateFilm | null;
  isProjection?: boolean;
  onClearPrimary: () => void;
  onClearCompare: () => void;
}) {
  const emptyPrimary = !activeFilm
    ? { heading: "Select a film", sub: "to see which weekends work best" }
    : { heading: "Click any weekend", sub: "to view its breakdown" };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {primary && compare && (
        <ComparisonInsight primary={primary} compare={compare} />
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <PanelSlot
          weekend={primary}
          label="View"
          accentClass="text-neutral-500"
          emptyHeading={emptyPrimary.heading}
          emptySub={emptyPrimary.sub}
          isProjection={isProjection}
          onClear={primary ? onClearPrimary : undefined}
        />
        <div className="w-px bg-white/[0.06] shrink-0" />
        <PanelSlot
          weekend={compare}
          label="Compare"
          accentClass="text-sky-600"
          emptyHeading="Click vs"
          emptySub="on any row to compare"
          isProjection={isProjection}
          onClear={compare ? onClearCompare : undefined}
        />
      </div>
    </div>
  );
}

// ─── Slate sidebar ────────────────────────────────────────────────────────────

const GENRE_OPTIONS = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "Horror", "Music", "Musical",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
];

const CATALOG_GENRE_FILTERS = ["Horror", "Drama", "Thriller", "Comedy", "Action", "Sci-Fi", "Romance", "War", "Documentary", "Fantasy"];

function FilmButton({ film, activeId, onSelect }: {
  film: SlateFilm;
  activeId: number | null;
  onSelect: (film: SlateFilm | null) => void;
}) {
  const active = film.id === activeId;
  const year = film.tentativeDate
    ? new Date(film.tentativeDate + "T12:00:00Z").getUTCFullYear()
    : null;

  return (
    <button
      onClick={() => onSelect(active ? null : film)}
      className={`w-full text-left px-3 py-2 mb-0.5 rounded-lg transition-all ${
        active ? "bg-white/[0.08] ring-1 ring-white/20" : "hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-1 min-w-0">
        <div className={`font-[family-name:var(--font-newsreader)] text-sm font-normal leading-tight truncate ${
          active ? "text-white" : "text-neutral-300"
        }`}>
          {film.title}
        </div>
        {year && (
          <span className="text-[9px] text-neutral-700 shrink-0">{year}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {film.genres.slice(0, 3).map((g) => (
          <span key={g} className={`text-[9px] px-1.5 py-0.5 rounded ${
            active ? "bg-white/10 text-neutral-400" : "bg-white/[0.04] text-neutral-600"
          }`}>
            {g}
          </span>
        ))}
        {film.status === "confirmed" && !active && (
          <span className="text-[9px] text-emerald-700">confirmed</span>
        )}
      </div>
    </button>
  );
}

function SlateSidebar({
  films,
  catalogFilms,
  activeId,
  onSelect,
}: {
  films: SlateFilm[];
  catalogFilms: SlateFilm[];
  activeId: number | null;
  onSelect: (film: SlateFilm | null) => void;
}) {
  const [tab, setTab] = useState<"slate" | "catalog">("slate");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customGenres, setCustomGenres] = useState<string[]>([]);

  const filteredCatalog = catalogFilms.filter((f) => {
    const matchesSearch = !search || f.title.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = !genreFilter || f.genres.includes(genreFilter);
    return matchesSearch && matchesGenre;
  });

  function submitCustom() {
    if (customGenres.length === 0) return;
    onSelect({
      id: -Date.now(),
      title: customTitle.trim() || "Untitled",
      genres: customGenres,
      director: null,
      logline: null,
      tentativeDate: null,
      status: "unscheduled",
    });
    setAdding(false);
    setCustomTitle("");
    setCustomGenres([]);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header + tabs */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="text-xs font-bold tracking-tight text-white mb-3">Slate Setter</div>
        <div className="flex gap-1 bg-white/[0.04] rounded-lg p-1">
          {(["slate", "catalog"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1 rounded text-[10px] font-medium transition-all capitalize ${
                tab === t ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {t === "slate" ? "Upcoming" : "Catalog"}
            </button>
          ))}
        </div>
      </div>

      {tab === "slate" ? (
        <>
          <div className="flex-1 overflow-y-auto px-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
            {films.map((film) => (
              <FilmButton key={film.id} film={film} activeId={activeId} onSelect={onSelect} />
            ))}
          </div>

          {/* Add custom film */}
          <div className="shrink-0 border-t border-white/[0.06] px-2 py-2">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full text-left px-3 py-2 rounded-lg text-neutral-600 hover:text-neutral-300 hover:bg-white/[0.04] text-xs transition-all"
              >
                + Custom film
              </button>
            ) : (
              <div className="px-1 py-1 space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full bg-white/[0.05] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-neutral-700 focus:outline-none focus:border-white/20"
                />
                <div className="flex flex-wrap gap-1">
                  {GENRE_OPTIONS.map((g) => {
                    const on = customGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setCustomGenres((prev) =>
                          prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                        )}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                          on ? "bg-white text-black font-medium" : "bg-white/[0.05] text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={submitCustom}
                    disabled={customGenres.length === 0}
                    className="flex-1 py-1.5 bg-white text-black text-xs font-medium rounded disabled:opacity-30"
                  >
                    Analyze
                  </button>
                  <button
                    onClick={() => { setAdding(false); setCustomTitle(""); setCustomGenres([]); }}
                    className="px-2 py-1.5 text-neutral-600 hover:text-neutral-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Catalog filters */}
          <div className="px-2 pb-2 shrink-0 space-y-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog…"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-700 focus:outline-none focus:border-white/20"
            />
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setGenreFilter(null)}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                  !genreFilter ? "bg-white text-black font-medium" : "bg-white/[0.05] text-neutral-500 hover:text-neutral-300"
                }`}
              >
                All
              </button>
              {CATALOG_GENRE_FILTERS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenreFilter(genreFilter === g ? null : g)}
                  className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                    genreFilter === g ? "bg-white text-black font-medium" : "bg-white/[0.05] text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog list */}
          <div className="flex-1 overflow-y-auto px-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
            {filteredCatalog.length === 0 ? (
              <p className="text-neutral-700 text-xs px-3 py-4">No films match.</p>
            ) : (
              filteredCatalog.map((film) => (
                <FilmButton key={film.id} film={film} activeId={activeId} onSelect={onSelect} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SimulatePage() {
  const [slateFilms, setSlateFilms] = useState<SlateFilm[]>([]);
  const [catalogFilms, setCatalogFilms] = useState<SlateFilm[]>([]);
  const [activeFilm, setActiveFilm] = useState<SlateFilm | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>(DEFAULT_WINDOW);
  const [windowData, setWindowData] = useState<WindowResult | null>(null);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [primaryDate, setPrimaryDate] = useState<string | null>(null);
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetch("/api/slate")
      .then((r) => r.json())
      .then(setSlateFilms)
      .catch(console.error);
    fetch("/api/catalog")
      .then((r) => r.json())
      .then(setCatalogFilms)
      .catch(console.error);
    // Warm raw window cache for all years so first film selection is instant
    for (const opt of WINDOW_OPTIONS) {
      fetch(`/api/simulate/window?window=${opt.key}&genres=`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!activeFilm) {
      setWindowData(null);
      return;
    }
    const controller = new AbortController();
    setLoadingWindow(true);
    setPrimaryDate(null);
    setCompareDate(null);
    rowRefs.current.clear();
    const params = new URLSearchParams({
      genres: activeFilm.genres.join(","),
      window: windowKey,
    });
    fetch(`/api/simulate/window?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: WindowResult) => {
        setWindowData(data);
        setLoadingWindow(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadingWindow(false);
      });
    return () => controller.abort();
  }, [activeFilm, windowKey]);

  const handleSelectFilm = useCallback((film: SlateFilm | null) => {
    setActiveFilm(film);
    setPrimaryDate(null);
    setCompareDate(null);
  }, []);

  // Row body click → set as View; if it was in Compare, clear Compare
  const handleSelectDate = useCallback((date: string) => {
    setPrimaryDate((prev) => (prev === date ? null : date));
    setCompareDate((prev) => (prev === date ? null : prev));
  }, []);

  // "vs" click → set as Compare; if it was in View, clear View
  const handleCompare = useCallback((date: string) => {
    setCompareDate((prev) => (prev === date ? null : date));
    setPrimaryDate((prev) => (prev === date ? null : prev));
  }, []);

  const handleWindowChange = useCallback((key: WindowKey) => {
    setWindowKey(key);
    setPrimaryDate(null);
    setCompareDate(null);
  }, []);

  const weekends = windowData?.weekends ?? [];
  const sortedByScore = [...weekends].sort((a, b) => a.competitionScore - b.competitionScore);
  const rankMap = new Map(sortedByScore.map((w, i) => [w.date, i + 1]));
  const monthGroups = groupByMonth(weekends);
  const primaryWeekend = weekends.find((w) => w.date === primaryDate) ?? null;
  const compareWeekend = weekends.find((w) => w.date === compareDate) ?? null;
  const lowCount = weekends.filter((w) => w.rating === "LOW").length;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">

      {/* Slate sidebar */}
      <aside className="w-48 shrink-0 border-r border-white/[0.06] overflow-hidden">
        <SlateSidebar
          films={slateFilms}
          catalogFilms={catalogFilms}
          activeId={activeFilm?.id ?? null}
          onSelect={handleSelectFilm}
        />
      </aside>

      {/* Center */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar — controls only */}
        <div className="px-5 py-2 border-b border-white/[0.06] shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-neutral-600 min-w-0">
            {loadingWindow && (
              <span className="animate-pulse">Analyzing…</span>
            )}
            {!loadingWindow && windowData && activeFilm && (
              <span>
                <span className="text-emerald-500">{lowCount}</span> low-competition window{lowCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Year selector */}
            <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-1">
              {WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleWindowChange(opt.key)}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    windowKey === opt.key
                      ? "bg-white text-black font-medium"
                      : "text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-neutral-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 rounded-full bg-emerald-500 inline-block" />Low
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 rounded-full bg-amber-400 inline-block" />Med
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 rounded-full bg-red-500 inline-block" />High
              </span>
            </div>

            <a
              href="/about"
              className="text-neutral-700 hover:text-neutral-400 transition-colors border border-white/[0.06] rounded px-2 py-0.5 text-xs"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Film context strip */}
        {activeFilm && (
          <div className="px-5 py-2 border-b border-white/[0.04] bg-white/[0.01] shrink-0 flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-newsreader)] text-sm text-white">{activeFilm.title}</span>
            <span className="text-neutral-700 text-xs">·</span>
            {activeFilm.genres.map((g) => (
              <span key={g} className="text-[10px] text-neutral-500 bg-white/[0.05] px-1.5 py-0.5 rounded-full">
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Content area */}
        {!activeFilm ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-3xl italic mb-3">
              Select a film to begin.
            </div>
            <p className="text-neutral-700 text-sm max-w-xs">
              Choose a title from your slate to map the competitive landscape, or add a custom film
              by genre.
            </p>
          </div>
        ) : loadingWindow ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xl italic animate-pulse">
              Analyzing…
            </div>
          </div>
        ) : windowData ? (
          <>
            {/* Heat map */}
            <YearHeatMap
              weekends={weekends}
              primaryDate={primaryDate}
              compareDate={compareDate}
              onSelect={handleSelectDate}
              rowRefs={rowRefs}
            />

            {/* Best windows strip */}
            <BestWindowsStrip
              weekends={weekends}
              primaryDate={primaryDate}
              onSelect={handleSelectDate}
            />

            {/* Weekend list */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
              {windowData.isProjection && (
                <div className="px-5 py-2 bg-white/[0.01] border-b border-white/[0.03]">
                  <p className="text-[10px] text-neutral-700 italic">
                    2026 is projected — competition scored against 2025 theatrical data as a structural analog.
                  </p>
                </div>
              )}
              <div>
                {monthGroups.map((group) => (
                  <div key={group.label}>
                    {/* Sticky month header */}
                    <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-sm px-5 py-1.5 border-b border-white/[0.04]">
                      <span className="font-[family-name:var(--font-newsreader)] text-neutral-500 text-sm italic">
                        {group.label}
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.025]">
                      {group.weekends.map((weekend) => (
                        <WeekendRow
                          key={weekend.date}
                          weekend={weekend}
                          rank={rankMap.get(weekend.date) ?? 99}
                          isPrimary={weekend.date === primaryDate}
                          isCompare={weekend.date === compareDate}
                          onSelect={() => handleSelectDate(weekend.date)}
                          onCompare={() => handleCompare(weekend.date)}
                          rowRef={(el) => {
                            if (el) rowRefs.current.set(weekend.date, el);
                            else rowRefs.current.delete(weekend.date);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>

      {/* Detail panel */}
      <aside className="w-[520px] shrink-0 border-l border-white/[0.06] overflow-hidden">
        <DetailPanel
          primary={primaryWeekend}
          compare={compareWeekend}
          activeFilm={activeFilm}
          isProjection={windowData?.isProjection}
          onClearPrimary={() => setPrimaryDate(null)}
          onClearCompare={() => setCompareDate(null)}
        />
      </aside>
    </div>
  );
}
