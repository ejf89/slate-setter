"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import type { SlateFilm } from "@/lib/types";
import { genreOverlap } from "@/lib/competition";

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

type CatalogFilm = SlateFilm & { openingGross?: number };

interface StrategicBrief {
  forecast: { low: number; high: number; mode: "wide" | "platform" | "limited" };
  rationale: string;
  risks: string[];
  recommendation: { play: "wide" | "platform" | "limited"; reasoning: string };
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

// Smooth green → yellow → orange → red ramp.
// Linearly interpolates hue 142° (emerald) → 0° (red) across 0 .. 0.60 score range.
// Below 0.05 we boost lightness so very-low scores read as a vivid bright green;
// above 0.6 we saturate to deep red.
function bandColor(score: number) {
  const clamped = Math.min(Math.max(score, 0), 0.6);
  const t = clamped / 0.6;
  const hue = 142 - t * 142;
  // Slight lightness curve — make very-low slightly brighter, very-high slightly darker
  const light = 50 - t * 6;
  const sat = 68 + t * 8;
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

function splitThreats(films: FilmEntry[]) {
  return {
    threats: films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore),
    others:  films.filter((f) => !f.isThreat).sort((a, b) => b.gross - a.gross),
  };
}

function getHolidayLabel(date: string): string | null {
  const d = new Date(date + "T12:00:00Z");
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if ((m === 12 && day >= 19) || (m === 1 && day <= 5)) return "Holiday";
  if (m === 11 && day >= 20 && day <= 30)               return "Thanksgiving";
  if (m === 5  && day >= 22 && day <= 27)               return "Memorial Day";
  if (m === 7  && day >= 1  && day <= 7)                return "July 4th";
  if ((m === 8 && day >= 28) || (m === 9 && day <= 4))  return "Labor Day";
  if (m === 2  && day >= 10 && day <= 14)               return "Valentine's";
  if (m === 2  && day >= 15 && day <= 21)               return "Presidents' Day";
  if (m === 1  && day >= 13 && day <= 21)               return "MLK Weekend";
  return null;
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

// Bucket weekends into a fixed 12-slot array indexed by month (Jan=0..Dec=11).
// Used by MultiYearHeatMap so columns line up across years.
function bucketByMonth(weekends: Weekend[]): Weekend[][] {
  const buckets: Weekend[][] = Array.from({ length: 12 }, () => []);
  for (const w of weekends) {
    const monthIdx = new Date(w.date + "T12:00:00Z").getUTCMonth();
    buckets[monthIdx].push(w);
  }
  return buckets;
}

function getComparableFilms(genres: string[], catalog: CatalogFilm[]): CatalogFilm[] {
  return catalog
    .filter((f) => f.genres.length > 0 && (f.openingGross ?? 0) > 0)
    .map((f) => ({ ...f, _overlap: genreOverlap(genres, f.genres) }))
    .filter((f) => f._overlap >= 0.6)
    .sort((a, b) => b._overlap - a._overlap || (b.openingGross ?? 0) - (a.openingGross ?? 0))
    .slice(0, 6) as CatalogFilm[];
}

function generateReportPDF(params: {
  film: SlateFilm;
  weekends: Weekend[];
  primaryWeekend: Weekend | null;
  compareWeekend: Weekend | null;
  comparableFilms: CatalogFilm[];
  brief: StrategicBrief | null;
  windowKey: WindowKey;
  avgWeekendGross: number;
}) {
  const { film, weekends, primaryWeekend, compareWeekend, comparableFilms, brief, windowKey, avgWeekendGross } = params;
  const yearLabel = WINDOW_OPTIONS.find((o) => o.key === windowKey)?.label ?? windowKey;
  const isProjection = WINDOW_OPTIONS.find((o) => o.key === windowKey)?.projected ?? false;
  const top5 = [...weekends].sort((a, b) => a.competitionScore - b.competitionScore).slice(0, 5);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const M = 60;                  // page margin
  const GAP_SECTION = 22;        // between major sections
  const GAP_SUBSECTION = 14;     // between subsections within a section
  const GAP_AFTER_LABEL = 12;    // after a section label
  const LINE_BODY = 15;          // line height for 10pt body
  const LINE_ROW = 16;           // line height for film rows
  let y = M;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - M - 40) {
      doc.addPage();
      y = M;
    }
  };

  const rule = (color: [number, number, number] = [225, 225, 225]) => {
    y += 4;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.line(M, y, PAGE_W - M, y);
    y += GAP_SECTION;
  };

  const heading = (text: string, size = 22) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
    doc.text(text, M, y);
    y += size + 4;
  };

  const sectionLabel = (text: string) => {
    ensureSpace(40); // ensure room for label + at least one line of content
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(text.toUpperCase(), M, y);
    y += GAP_AFTER_LABEL;
  };

  const body = (text: string, size = 10, color: [number, number, number] = [50, 50, 50]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineHeight = size === 10 ? LINE_BODY : size + 5;
    const lines = doc.splitTextToSize(text, PAGE_W - M * 2);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, M, y);
      y += lineHeight;
    }
  };

  const kv = (label: string, value: string) => {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(25, 25, 25);
    doc.text(value, M + 100, y);
    y += 20;
  };

  const filmRow = (left: string, right: string, indent = 0, color: [number, number, number] = [55, 55, 55]) => {
    ensureSpace(LINE_ROW);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...color);
    const maxLeft = PAGE_W - M * 2 - 90 - indent;
    const truncated = doc.splitTextToSize(left, maxLeft)[0];
    doc.text(truncated, M + indent, y);
    doc.setTextColor(120, 120, 120);
    doc.text(right, PAGE_W - M, y, { align: "right" });
    y += LINE_ROW;
  };

  const renderWindowBlock = (w: Weekend, label: string) => {
    const { month, day, year } = parseDate(w.date);
    const holiday = getHolidayLabel(w.date);
    const marketMult = avgWeekendGross > 0 ? w.totalGross / avgWeekendGross : 1;
    const threats = w.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
    const others = w.films.filter((f) => !f.isThreat).sort((a, b) => b.gross - a.gross).slice(0, 8);

    ensureSpace(90);

    // Section label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(label.toUpperCase(), M, y);
    y += GAP_AFTER_LABEL + 2;

    // Date headline
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(`${month} ${day}, ${year}${holiday ? `  ·  ${holiday}` : ""}`, M, y);
    y += 22;

    // Stat line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const scoreColor: [number, number, number] = w.rating === "HIGH" ? [200, 60, 60] : w.rating === "MEDIUM" ? [200, 140, 30] : [40, 150, 70];
    doc.setTextColor(...scoreColor);
    const scoreText = `${(w.competitionScore * 100).toFixed(0)}% competition (${w.rating.toLowerCase()})`;
    doc.text(scoreText, M, y);
    const scoreW = doc.getTextWidth(scoreText);
    doc.setTextColor(80, 80, 80);
    const marketLabel = marketMult >= 1.4 ? ` · ${marketMult.toFixed(1)}× avg` : marketMult <= 0.65 ? " · below-avg" : "";
    doc.text(`     ${formatM(w.totalGross)} market${marketLabel}  ·  ${formatM(w.totalGross * (1 - w.competitionScore))} uncontested`, M + scoreW, y);
    y += GAP_SUBSECTION + 6;

    // Threats
    if (threats.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(180, 50, 50);
      doc.text(`▲ GENRE THREATS (${threats.length})`, M, y);
      y += GAP_AFTER_LABEL;
      for (const t of threats) {
        filmRow(`${t.title}  ·  Wk ${t.weeksInRelease}  ·  ${t.genres.slice(0, 2).join(", ")}`, `${(t.threatScore * 100).toFixed(1)}%`, 10, [60, 60, 60]);
      }
      y += 6;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(60, 140, 90);
      doc.text("No direct genre competition.", M, y);
      y += GAP_SUBSECTION + 4;
    }

    // Other films
    if (others.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text("OTHER FILMS IN THEATERS", M, y);
      y += GAP_AFTER_LABEL;
      for (const o of others) {
        filmRow(`${o.title}  ·  Wk ${o.weeksInRelease}  ·  ${o.genres[0] ?? "—"}`, formatM(o.gross), 10);
      }
    }
    y += GAP_SUBSECTION;
  };

  // ─── HEADER ───
  heading("Release Window Brief", 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text(`Slate Setter  ·  Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, M, y);
  y += 22;
  rule([40, 40, 40]);

  // ─── FILM ───
  kv("Film", film.title);
  kv("Genres", film.genres.join(", "));
  kv("Year analyzed", `${yearLabel}${isProjection ? " (projected from 2025)" : ""}`);
  if (film.logline) kv("Logline", film.logline);
  if (film.director) kv("Director", film.director);
  y += 6;
  rule([235, 235, 235]);

  // ─── AI BRIEF ───
  if (brief) {
    sectionLabel("Strategic forecast");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(20, 20, 20);
    doc.text(`$${brief.forecast.low.toFixed(1)}M – $${brief.forecast.high.toFixed(1)}M`, M, y);
    y += 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Opening weekend projection  ·  ${brief.forecast.mode} release`, M, y);
    y += 22;

    sectionLabel("Rationale");
    body(brief.rationale);
    y += 8;

    sectionLabel("Top risks");
    for (const r of brief.risks) {
      body(`•  ${r}`);
    }
    y += 8;

    sectionLabel("Recommended release play");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(brief.recommendation.play.toUpperCase(), M, y);
    y += 18;
    body(brief.recommendation.reasoning);
    y += 10;
    rule([235, 235, 235]);
  }

  // ─── PRIMARY WINDOW ───
  if (primaryWeekend) {
    renderWindowBlock(primaryWeekend, "Primary window");
    y += 4;
  }

  // ─── COMPARE WINDOW ───
  if (compareWeekend) {
    renderWindowBlock(compareWeekend, "Compare window");
    y += 4;
  }

  // ─── HEAD-TO-HEAD ───
  if (primaryWeekend && compareWeekend) {
    sectionLabel("Window comparison");
    const pPct = primaryWeekend.competitionScore * 100;
    const cPct = compareWeekend.competitionScore * 100;
    const winsPrim = primaryWeekend.competitionScore <= compareWeekend.competitionScore;
    const better = winsPrim ? primaryWeekend : compareWeekend;
    const worse = winsPrim ? compareWeekend : primaryWeekend;
    const betterLabel = winsPrim ? "Primary" : "Compare";
    const ptsDiff = Math.abs(pPct - cPct);
    const higher = winsPrim ? compareWeekend.competitionScore : primaryWeekend.competitionScore;
    const lower = winsPrim ? primaryWeekend.competitionScore : compareWeekend.competitionScore;
    const relDiff = higher > 0.01 ? Math.round(((higher - lower) / higher) * 100) : 0;

    if (ptsDiff < 3) {
      body(`The two windows are roughly equivalent — ${ptsDiff < 1 ? "identical" : `${Math.round(ptsDiff)}pt`} difference in competition score. Decision should weigh other factors (market size, holiday context, marketing readiness).`);
    } else {
      const { month: bM, day: bD } = parseDate(better.date);
      const { month: wM, day: wD } = parseDate(worse.date);
      body(`${betterLabel} window (${bM} ${bD}) has ${relDiff}% less genre competition than ${wM} ${wD} — a ${Math.round(ptsDiff)}pt difference. Uncontested market: ${formatM(better.totalGross * (1 - better.competitionScore))} vs ${formatM(worse.totalGross * (1 - worse.competitionScore))}.`);
    }
    y += 8;
    rule([235, 235, 235]);
  }

  // ─── TOP WINDOWS ───
  sectionLabel(`Top low-competition windows (${yearLabel})`);
  top5.forEach((w, i) => {
    const { month, day } = parseDate(w.date);
    const holiday = getHolidayLabel(w.date);
    filmRow(
      `#${i + 1}   ${month} ${day}${holiday ? `  ·  ${holiday}` : ""}   —   ${(w.competitionScore * 100).toFixed(0)}% competition`,
      `${formatM(w.totalGross * (1 - w.competitionScore))} uncontested`,
      0,
      [40, 40, 40]
    );
  });
  y += 8;

  // ─── COMP FILMS ───
  if (comparableFilms.length > 0) {
    sectionLabel("Genre-comparable historical releases");
    for (const f of comparableFilms) {
      filmRow(`${f.title}  (${f.genres.slice(0, 2).join(", ")})`, `${formatM(f.openingGross ?? 0)} opening`);
    }
    y += 8;
  }

  // ─── METHODOLOGY ───
  rule([235, 235, 235]);
  sectionLabel("Methodology");
  body("Competition score = Σ over films in theaters of: genre overlap × (1 / weeks in release) × (film gross / total weekend gross).", 9, [80, 80, 80]);
  body("Genre overlap is 1.0 for matching genres, 0.6 for adjacent (Horror↔Thriller, Drama↔Romance, etc.), 0.15 otherwise. Holdover decay reduces weight of films past opening weekend. Market share concentrates score on films that actually moved the needle. Scores under 18% = low, 18-35% = medium, 35%+ = high.", 9, [80, 80, 80]);
  if (isProjection) {
    y += 4;
    body("2026 projections use 2025's competitive landscape as a structural analog — same seasonal rhythm, same holiday pattern.", 9, [80, 80, 80]);
  }
  body("Data: Box Office Mojo weekly charts (2015-2025), TMDB genre enrichment, and a curated internal genre map.", 9, [80, 80, 80]);

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 170);
    doc.text(`Slate Setter  ·  ${film.title}  ·  Page ${i} of ${pageCount}`, M, PAGE_H - 30);
  }

  const safeTitle = film.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`slate-setter-${safeTitle}-${yearLabel}.pdf`);
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

// ─── Multi-year heat map ──────────────────────────────────────────────────────

const MONTH_ABBREVS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function MultiYearHeatMap({
  allYearsData,
  windowKey,
  primaryDate,
  compareDate,
  onSelect,
  onYearChange,
  rowRefs,
}: {
  allYearsData: Partial<Record<WindowKey, WindowResult>>;
  windowKey: WindowKey;
  primaryDate: string | null;
  compareDate: string | null;
  onSelect: (date: string, yearKey: WindowKey) => void;
  onYearChange: (key: WindowKey) => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  // Fixed grid: 44px year label + 12 equal 72px month slots (fits 5 dots × 12px + 4 × 3px gap)
  const gridCols = "grid-cols-[44px_repeat(12,72px)]";

  return (
    <div className="px-5 pt-3 pb-2 border-b border-white/[0.04] shrink-0 bg-white/[0.01] overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="min-w-fit">
        {/* Month label row — aligned to grid columns */}
        <div className={`grid ${gridCols} mb-1.5`}>
          <div />
          {MONTH_ABBREVS.map((m) => (
            <span key={m} className="text-[8px] text-neutral-700 uppercase tracking-wide pl-0.5">{m}</span>
          ))}
        </div>

        {/* Year rows — same grid */}
        <div className="space-y-1">
          {WINDOW_OPTIONS.map((opt) => {
            const data = allYearsData[opt.key];
            const buckets = data ? bucketByMonth(data.weekends) : Array.from({ length: 12 }, () => [] as Weekend[]);
            const isActive = opt.key === windowKey;
            return (
              <div key={opt.key} className={`grid ${gridCols} items-center`}>
                <button
                  onClick={() => onYearChange(opt.key)}
                  title={`Show ${opt.label.replace(" ↗", "")}`}
                  className={`text-left text-[10px] font-mono py-1 px-1.5 rounded transition-all ${
                    isActive
                      ? "text-white bg-white/[0.08] font-semibold"
                      : "text-neutral-600 hover:text-neutral-300 hover:bg-white/[0.04]"
                  }`}
                >
                  {opt.label.replace(" ↗", "")}
                </button>
                {buckets.map((mws, mi) => (
                  <div key={mi} className="flex gap-[3px] items-center min-h-[12px]">
                    {!data
                      ? Array.from({ length: 4 }, (_, j) => (
                          <div key={j} className="w-3 h-3 rounded-sm bg-white/[0.04]" />
                        ))
                      : mws.map((w) => {
                          const isPrimary = isActive && w.date === primaryDate;
                          const isCompare = isActive && w.date === compareDate;
                          return (
                            <button
                              key={w.date}
                              onClick={() => {
                                onSelect(w.date, opt.key);
                                if (isActive) {
                                  const el = rowRefs.current.get(w.date);
                                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                }
                              }}
                              title={`${parseDate(w.date).month} ${parseDate(w.date).day} ${opt.label} — ${(w.competitionScore * 100).toFixed(0)}%`}
                              className={`w-3 h-3 rounded-sm transition-all hover:scale-125 shrink-0 ${
                                isPrimary ? "outline outline-1 outline-offset-1 outline-white" :
                                isCompare ? "outline outline-1 outline-offset-1 outline-sky-400" : ""
                              } ${!isActive ? "opacity-45 hover:opacity-100" : ""}`}
                              style={{ backgroundColor: bandColor(w.competitionScore) }}
                            />
                          );
                        })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
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
          const holiday = getHolidayLabel(w.date);
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
              {holiday && (
                <div className="text-[8px] text-amber-400/70 mb-1">{holiday}</div>
              )}
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
  const holiday = getHolidayLabel(weekend.date);

  const rowBg = isPrimary
    ? "bg-white/[0.04]"
    : isCompare
    ? "bg-sky-950/20"
    : "hover:bg-white/[0.02]";

  return (
    <div ref={rowRef} className={`flex items-stretch transition-colors ${rowBg}`}>
      <div className={`w-0.5 self-stretch shrink-0 transition-colors ${
        isPrimary ? "bg-white" : isCompare ? "bg-sky-400" : "bg-white/[0.06]"
      }`} />
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-5 px-4 py-2.5 text-left min-w-0"
      >
        <div className="w-14 shrink-0">
          {rank <= 3 && (
            <div className="text-[8px] text-neutral-700 uppercase tracking-widest leading-none mb-0.5">
              #{rank}
            </div>
          )}
          <div className="font-[family-name:var(--font-newsreader)] text-white text-sm leading-tight">
            {month} {day}
          </div>
          {holiday && (
            <div className="text-[8px] text-amber-400/70 leading-none mt-0.5 truncate">{holiday}</div>
          )}
        </div>

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

        <div className="w-14 shrink-0 text-right">
          <div className="text-xs text-neutral-500">{formatM(weekend.totalGross)}</div>
        </div>

        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-0.5">
          {threats.slice(0, 2).map((f) => (
            <span key={`${f.filmId}-t-${f.weeksInRelease}`} className="flex items-baseline gap-1 min-w-0">
              <span className="text-red-500 text-[8px] shrink-0">▲</span>
              <span className="font-[family-name:var(--font-newsreader)] text-white text-xs truncate">{f.title}</span>
              <span className="text-neutral-700 text-[9px] shrink-0">W{f.weeksInRelease}</span>
            </span>
          ))}
          {threats.length === 0 &&
            others.slice(0, 3).map((f) => (
              <span
                key={`${f.filmId}-o-${f.weeksInRelease}`}
                className={`flex items-baseline gap-1 min-w-0 ${f.weeksInRelease > 1 ? "opacity-40" : ""}`}
              >
                <span className="font-[family-name:var(--font-newsreader)] text-neutral-500 text-xs truncate">{f.title}</span>
                <span className="text-neutral-700 text-[9px] shrink-0">W{f.weeksInRelease}</span>
              </span>
            ))}
        </div>
      </button>

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
        {isCompare && <span className="text-[8px] text-sky-600">remove</span>}
      </button>
    </div>
  );
}

// ─── Strategic brief ─────────────────────────────────────────────────────────

function StrategicBriefPanel({
  film,
  primaryWeekend,
  compareWeekend,
  comparableFilms,
  brief,
  loading,
  onRequest,
  onClear,
  onDownload,
}: {
  film: SlateFilm;
  primaryWeekend: Weekend | null;
  compareWeekend: Weekend | null;
  comparableFilms: CatalogFilm[];
  brief: StrategicBrief | null;
  loading: boolean;
  onRequest: () => void;
  onClear: () => void;
  onDownload: () => void;
}) {
  const [showInputs, setShowInputs] = useState(false);

  if (!primaryWeekend) return null;

  const playColor = (play: string) =>
    play === "wide" ? "text-emerald-400" : play === "platform" ? "text-amber-400" : "text-sky-400";

  const renderWeekendInputs = (w: Weekend, label: string) => {
    const threats = w.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore).slice(0, 4);
    const { month, day, year } = parseDate(w.date);
    return (
      <div className="mb-2">
        <div className="text-[9px] text-neutral-500 uppercase tracking-wide mb-1">{label}: {month} {day} {year}</div>
        <div className="text-[10px] text-neutral-400 leading-relaxed">
          {(w.competitionScore * 100).toFixed(0)}% competition · {formatM(w.totalGross)} market
          {threats.length > 0 ? (
            <span>
              {" · threats: "}
              <span className="text-red-400">
                {threats.map((t) => `${t.title} (W${t.weeksInRelease})`).join(", ")}
              </span>
            </span>
          ) : (
            <span className="text-emerald-500"> · no genre threats</span>
          )}
        </div>
      </div>
    );
  };

  const comparableCount = comparableFilms.length;

  const hasContent = brief !== null || loading;

  return (
    <div className={`flex flex-col bg-gradient-to-b from-purple-500/[0.03] to-transparent border-t border-white/[0.06] ${
      hasContent ? "flex-1 min-h-0" : "shrink-0"
    }`}>
      {/* Compact header — single row */}
      <div className="shrink-0 px-4 py-1.5 flex items-baseline justify-between gap-2 border-b border-white/[0.04]">
        <div className="text-[9px] text-purple-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
          <span>✦</span>
          <span>Strategic brief</span>
          {brief && <span className="text-neutral-700 normal-case tracking-normal font-normal">· generated</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-neutral-700">
            {comparableCount} comp{comparableCount !== 1 ? "s" : ""}
          </span>
          {brief && (
            <button
              onClick={onClear}
              title="Clear brief"
              className="text-[11px] text-neutral-700 hover:text-neutral-400 transition-colors leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content — only renders when there's something to show */}
      {hasContent && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading && (
            <div className="py-2 text-purple-300 text-[11px] animate-pulse">
              Analyzing comps and competitive context…
            </div>
          )}

          {brief && (
            <div className="space-y-2.5">
              {/* Forecast */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <div className="text-[9px] text-neutral-600 uppercase tracking-widest font-semibold">
                    Opening weekend
                  </div>
                  <div className="text-[9px] text-neutral-600 uppercase capitalize">{brief.forecast.mode}</div>
                </div>
                <div className="font-[family-name:var(--font-newsreader)] text-xl text-white leading-none">
                  ${brief.forecast.low.toFixed(1)}M – ${brief.forecast.high.toFixed(1)}M
                </div>
                <p className="text-neutral-400 text-[11px] leading-relaxed mt-1.5">{brief.rationale}</p>
              </div>

              {/* Risks */}
              <div>
                <div className="text-[9px] text-amber-500 uppercase tracking-widest font-semibold mb-1">Top risks</div>
                <ul className="space-y-0.5">
                  {brief.risks.map((r, i) => (
                    <li key={i} className="text-[11px] text-neutral-400 flex items-start gap-1.5 leading-relaxed">
                      <span className="text-amber-600 shrink-0 mt-px text-[8px]">▲</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendation */}
              <div>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[9px] text-neutral-600 uppercase tracking-widest font-semibold">Play:</span>
                  <span className={`text-sm font-bold uppercase ${playColor(brief.recommendation.play)}`}>
                    {brief.recommendation.play}
                  </span>
                </div>
                <p className="text-neutral-400 text-[11px] leading-relaxed">{brief.recommendation.reasoning}</p>
              </div>

              {/* Inputs disclosure */}
              <div className="pt-1">
                <button
                  onClick={() => setShowInputs((v) => !v)}
                  className="text-[9px] text-neutral-700 hover:text-neutral-400 transition-colors flex items-center gap-1"
                >
                  <span>{showInputs ? "▾" : "▸"}</span>
                  <span>What Claude saw</span>
                </button>
                {showInputs && (
                  <div className="mt-1.5 pl-2.5 border-l border-white/[0.06] pb-1">
                    <div className="mb-1.5">
                      <div className="text-[9px] text-neutral-500 uppercase tracking-wide mb-0.5">Film</div>
                      <div className="text-[10px] text-neutral-400">
                        {film.title} <span className="text-neutral-600">·</span> {film.genres.join(", ")}
                      </div>
                    </div>
                    {renderWeekendInputs(primaryWeekend, "Primary window")}
                    {compareWeekend && renderWeekendInputs(compareWeekend, "Compare window")}
                    <div>
                      <div className="text-[9px] text-neutral-500 uppercase tracking-wide mb-0.5">
                        Genre comparables ({comparableCount})
                      </div>
                      {comparableFilms.length > 0 ? (
                        <ul className="space-y-0.5">
                          {comparableFilms.map((f) => (
                            <li key={f.id} className="text-[10px] text-neutral-400 flex items-baseline justify-between gap-2">
                              <span className="truncate">
                                {f.title} <span className="text-neutral-600">({f.genres.slice(0, 2).join(", ")})</span>
                              </span>
                              <span className="text-neutral-500 font-mono shrink-0">{formatM(f.openingGross ?? 0)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[10px] text-neutral-600 italic">None — genre norms used.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action bar — always at the bottom */}
      <div className="shrink-0 px-4 py-2 flex gap-2 border-t border-white/[0.04]">
        {!brief ? (
          <button
            onClick={onRequest}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
              loading
                ? "bg-purple-500/10 border-purple-500/30 text-purple-300 animate-pulse cursor-default"
                : "bg-purple-500/15 border-purple-500/40 text-purple-300 hover:bg-purple-500/25 hover:border-purple-500/60"
            }`}
          >
            {loading ? "Analyzing…" : "Analyze with AI →"}
          </button>
        ) : (
          <button
            onClick={onRequest}
            className="flex-1 py-2 rounded-lg border border-white/[0.08] text-[11px] text-neutral-400 hover:text-neutral-200 hover:border-white/15 transition-all"
          >
            Re-analyze ↺
          </button>
        )}
        <button
          onClick={onDownload}
          className={`flex-1 py-2 rounded-lg border text-[11px] transition-all ${
            brief
              ? "bg-white/[0.08] border-white/10 text-white font-semibold hover:bg-white/[0.12]"
              : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/15"
          }`}
        >
          Download PDF ↓
        </button>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function WeekendBreakdown({
  weekend,
  isProjection,
  avgWeekendGross,
  onClear,
}: {
  weekend: Weekend;
  isProjection?: boolean;
  avgWeekendGross?: number;
  onClear?: () => void;
}) {
  const { month, day, year } = parseDate(weekend.date);
  const { threats, others } = splitThreats(weekend.films);
  const proxyYear = isProjection ? parseInt(weekend.date.slice(0, 4)) : null;
  const holiday = getHolidayLabel(weekend.date);
  const marketMultiple = avgWeekendGross && avgWeekendGross > 0
    ? weekend.totalGross / avgWeekendGross
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="font-[family-name:var(--font-newsreader)] text-xl text-white font-normal leading-none">
              {month} {day}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xs italic">{year}</div>
              {holiday && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  {holiday}
                </span>
              )}
            </div>
          </div>
          {onClear && (
            <button onClick={onClear} className="text-[10px] text-neutral-700 hover:text-neutral-400 transition-colors mt-0.5 shrink-0">
              ✕
            </button>
          )}
        </div>
        <ScoreBadge weekend={weekend} />
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-neutral-600">market</span>
          <span className="text-white font-medium">{formatM(weekend.totalGross)}</span>
          {marketMultiple !== null && (marketMultiple >= 1.4 || marketMultiple <= 0.65) && (
            <span className={`text-[9px] font-mono ${marketMultiple >= 1.4 ? "text-amber-400" : "text-neutral-600"}`}>
              {marketMultiple >= 1.4 ? `${marketMultiple.toFixed(1)}× avg market` : "below-avg market"}
            </span>
          )}
          <span className="text-neutral-700">·</span>
          <span className="text-emerald-400 font-medium">{formatM(weekend.totalGross * (1 - weekend.competitionScore))}</span>
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
                    <div className="font-[family-name:var(--font-newsreader)] text-white text-xs leading-tight truncate">{f.title}</div>
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
            <div className="text-[9px] text-emerald-600 uppercase tracking-widest font-semibold mb-1">Genre competition</div>
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
                  <div className="font-[family-name:var(--font-newsreader)] text-neutral-300 text-xs truncate">{f.title}</div>
                  <div className="text-neutral-700 text-[9px]">Wk {f.weeksInRelease} · {f.genres[0] ?? "—"}</div>
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

  const winnerLabel  = primaryWins ? "View" : "Compare";
  const winnerDate   = primaryWins ? `${pMonth} ${pDay}` : `${cMonth} ${cDay}`;
  const winnerAccent = primaryWins ? "text-white" : "text-sky-400";

  const pThreats = primary.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
  const cThreats = compare.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
  const winThreats  = primaryWins ? pThreats : cThreats;
  const loseThreats = primaryWins ? cThreats : pThreats;

  const grossDiffPct = Math.abs(primary.totalGross - compare.totalGross) / Math.max(primary.totalGross, compare.totalGross, 1) * 100;
  const biggerMarket = primary.totalGross >= compare.totalGross ? `${pMonth} ${pDay}` : `${cMonth} ${cDay}`;

  const pHoliday = getHolidayLabel(primary.date);
  const cHoliday = getHolidayLabel(compare.date);

  const reasons: string[] = [];
  if (pHoliday) reasons.push(`${pMonth} ${pDay} is the ${pHoliday} frame`);
  if (cHoliday) reasons.push(`${cMonth} ${cDay} is the ${cHoliday} frame`);
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

      <div className="space-y-2">
        {([
          { label: `${pMonth} ${pDay}`, score: primary.competitionScore,  rating: primary.rating,  gross: primary.totalGross,  isCompare: false },
          { label: `${cMonth} ${cDay}`, score: compare.competitionScore, rating: compare.rating, gross: compare.totalGross, isCompare: true  },
        ] as const).map((row) => (
          <div key={row.label}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[9px] w-11 shrink-0 ${row.isCompare ? "text-sky-600" : "text-neutral-500"}`}>{row.label}</span>
              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(row.score * 100, 100)}%`, backgroundColor: bandColor(row.score) }} />
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
  avgWeekendGross,
  onClear,
}: {
  weekend: Weekend | null;
  label: string;
  accentClass: string;
  emptyHeading: string;
  emptySub: string;
  isProjection?: boolean;
  avgWeekendGross?: number;
  onClear?: () => void;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="px-4 py-1.5 border-b border-white/[0.06] shrink-0">
        <span className={`text-[9px] uppercase tracking-widest font-semibold ${accentClass}`}>{label}</span>
      </div>
      {weekend ? (
        <WeekendBreakdown weekend={weekend} isProjection={isProjection} avgWeekendGross={avgWeekendGross} onClear={onClear} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="font-[family-name:var(--font-newsreader)] text-neutral-700 text-base italic mb-1">{emptyHeading}</div>
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
  avgWeekendGross,
  comparableFilms,
  brief,
  briefLoading,
  onClearPrimary,
  onClearCompare,
  onRequestBrief,
  onClearBrief,
  onDownloadPDF,
}: {
  primary: Weekend | null;
  compare: Weekend | null;
  activeFilm: SlateFilm | null;
  isProjection?: boolean;
  avgWeekendGross?: number;
  comparableFilms: CatalogFilm[];
  brief: StrategicBrief | null;
  briefLoading: boolean;
  onClearPrimary: () => void;
  onClearCompare: () => void;
  onRequestBrief: () => void;
  onClearBrief: () => void;
  onDownloadPDF: () => void;
}) {
  const emptyPrimary = !activeFilm
    ? { heading: "Select a film", sub: "to see which weekends work best" }
    : { heading: "Click any weekend", sub: "to view its breakdown" };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {primary && compare && <ComparisonInsight primary={primary} compare={compare} />}

      {/* View/Compare slots take all available space when brief is collapsed */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <PanelSlot
          weekend={primary}
          label="View"
          accentClass="text-neutral-500"
          emptyHeading={emptyPrimary.heading}
          emptySub={emptyPrimary.sub}
          isProjection={isProjection}
          avgWeekendGross={avgWeekendGross}
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
          avgWeekendGross={avgWeekendGross}
          onClear={compare ? onClearCompare : undefined}
        />
      </div>

      {activeFilm && primary && (
        <StrategicBriefPanel
          film={activeFilm}
          primaryWeekend={primary}
          compareWeekend={compare}
          comparableFilms={comparableFilms}
          brief={brief}
          loading={briefLoading}
          onRequest={onRequestBrief}
          onClear={onClearBrief}
          onDownload={onDownloadPDF}
        />
      )}
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
const CATALOG_STUDIO_FILTERS = ["A24", "Universal", "Warner Bros.", "Lionsgate", "Sony", "Paramount", "Disney", "Focus Features", "Neon", "Searchlight", "Bleecker Street"];

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
        <div className={`font-[family-name:var(--font-newsreader)] text-sm font-normal leading-tight truncate ${active ? "text-white" : "text-neutral-300"}`}>
          {film.title}
        </div>
        {year && <span className="text-[9px] text-neutral-700 shrink-0">{year}</span>}
      </div>
      {film.studio && (
        <div className="text-[9px] text-neutral-600 mt-0.5 truncate">{film.studio}</div>
      )}
      <div className="flex flex-wrap gap-1 mt-1">
        {film.genres.slice(0, 3).map((g) => (
          <span key={g} className={`text-[9px] px-1.5 py-0.5 rounded ${active ? "bg-white/10 text-neutral-400" : "bg-white/[0.04] text-neutral-600"}`}>
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
  catalogFilms: CatalogFilm[];
  activeId: number | null;
  onSelect: (film: SlateFilm | null) => void;
}) {
  const [tab, setTab] = useState<"slate" | "catalog">("slate");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [studioFilter, setStudioFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customGenres, setCustomGenres] = useState<string[]>([]);

  const filteredCatalog = catalogFilms.filter((f) => {
    const matchesSearch = !search || f.title.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = !genreFilter || f.genres.includes(genreFilter);
    const matchesStudio = !studioFilter || f.studio === studioFilter;
    return matchesSearch && matchesGenre && matchesStudio;
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
          <div className="px-2 pb-2 shrink-0 space-y-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog…"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-700 focus:outline-none focus:border-white/20"
            />
            {/* Studio filter */}
            <div>
              <div className="text-[8px] text-neutral-700 uppercase tracking-wide mb-1 px-0.5">Studio</div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setStudioFilter(null)}
                  className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                    !studioFilter ? "bg-white text-black font-medium" : "bg-white/[0.05] text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  All
                </button>
                {CATALOG_STUDIO_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStudioFilter(studioFilter === s ? null : s)}
                    className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                      studioFilter === s ? "bg-white text-black font-medium" : "bg-white/[0.05] text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {/* Genre filter */}
            <div>
              <div className="text-[8px] text-neutral-700 uppercase tracking-wide mb-1 px-0.5">Genre</div>
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
            <div className="text-[9px] text-neutral-700 px-0.5">
              {filteredCatalog.length} film{filteredCatalog.length !== 1 ? "s" : ""}
            </div>
          </div>

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
  const [catalogFilms, setCatalogFilms] = useState<CatalogFilm[]>([]);
  const [activeFilm, setActiveFilm] = useState<SlateFilm | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>(DEFAULT_WINDOW);
  const [allYearsData, setAllYearsData] = useState<Partial<Record<WindowKey, WindowResult>>>({});
  const [loadingYears, setLoadingYears] = useState<Set<WindowKey>>(new Set());
  const [primaryDate, setPrimaryDate] = useState<string | null>(null);
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const [brief, setBrief] = useState<StrategicBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetch("/api/slate").then((r) => r.json()).then(setSlateFilms).catch(console.error);
    fetch("/api/catalog").then((r) => r.json()).then(setCatalogFilms).catch(console.error);
    for (const opt of WINDOW_OPTIONS) {
      fetch(`/api/simulate/window?window=${opt.key}&genres=`).catch(() => {});
    }
  }, []);

  // Load all 4 years in parallel whenever active film changes
  useEffect(() => {
    if (!activeFilm) {
      setAllYearsData({});
      setLoadingYears(new Set());
      return;
    }
    const genres = activeFilm.genres.join(",");
    const controllers: AbortController[] = [];
    setAllYearsData({});
    setPrimaryDate(null);
    setCompareDate(null);
    setBrief(null);
    rowRefs.current.clear();
    setLoadingYears(new Set(WINDOW_OPTIONS.map((o) => o.key)));

    for (const opt of WINDOW_OPTIONS) {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const params = new URLSearchParams({ genres, window: opt.key });
      fetch(`/api/simulate/window?${params}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: WindowResult) => {
          setAllYearsData((prev) => ({ ...prev, [opt.key]: data }));
          setLoadingYears((prev) => {
            const next = new Set(prev);
            next.delete(opt.key);
            return next;
          });
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setLoadingYears((prev) => {
              const next = new Set(prev);
              next.delete(opt.key);
              return next;
            });
          }
        });
    }

    return () => controllers.forEach((c) => c.abort());
  }, [activeFilm]);

  const handleSelectFilm = useCallback((film: SlateFilm | null) => {
    setActiveFilm(film);
    setPrimaryDate(null);
    setCompareDate(null);
    setBrief(null);
  }, []);

  const handleSelectDate = useCallback((date: string, yearKey?: WindowKey) => {
    if (yearKey && yearKey !== windowKey) {
      setWindowKey(yearKey);
      setPrimaryDate(date);
      setCompareDate(null);
    } else {
      setPrimaryDate((prev) => (prev === date ? null : date));
      setCompareDate((prev) => (prev === date ? null : prev));
    }
    setBrief(null);
  }, [windowKey]);

  const handleCompare = useCallback((date: string) => {
    setCompareDate((prev) => (prev === date ? null : date));
    setPrimaryDate((prev) => (prev === date ? null : prev));
    setBrief(null);
  }, []);

  const handleWindowChange = useCallback((key: WindowKey) => {
    setWindowKey(key);
    setPrimaryDate(null);
    setCompareDate(null);
    setBrief(null);
  }, []);

  const windowData = allYearsData[windowKey] ?? null;
  const loadingWindow = loadingYears.has(windowKey);

  const weekends = windowData?.weekends ?? [];
  const sortedByScore = [...weekends].sort((a, b) => a.competitionScore - b.competitionScore);
  const rankMap = new Map(sortedByScore.map((w, i) => [w.date, i + 1]));
  const monthGroups = groupByMonth(weekends);
  const primaryWeekend = weekends.find((w) => w.date === primaryDate) ?? null;
  const compareWeekend = weekends.find((w) => w.date === compareDate) ?? null;
  const lowCount = weekends.filter((w) => w.rating === "LOW").length;
  const avgWeekendGross = weekends.length > 0
    ? weekends.reduce((sum, w) => sum + w.totalGross, 0) / weekends.length
    : 0;

  const comparableFilms = activeFilm && catalogFilms.length > 0
    ? getComparableFilms(activeFilm.genres, catalogFilms)
    : [];

  const handleRequestBrief = useCallback(async () => {
    if (!activeFilm || !primaryWeekend) return;
    setBriefLoading(true);
    setBrief(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          film: { title: activeFilm.title, genres: activeFilm.genres },
          primaryWeekend,
          compareWeekend,
          comparableFilms: comparableFilms.map((f) => ({
            title: f.title,
            genres: f.genres,
            openingGross: f.openingGross ?? 0,
          })),
          isProjection: windowData?.isProjection,
        }),
      });
      const data = await res.json();
      if (data.brief) setBrief(data.brief);
    } catch {
      // swallow — leave UI in pre-loading state
    } finally {
      setBriefLoading(false);
    }
  }, [activeFilm, primaryWeekend, compareWeekend, comparableFilms, windowData]);

  const handleDownloadPDF = useCallback(() => {
    if (!activeFilm) return;
    generateReportPDF({
      film: activeFilm,
      weekends,
      primaryWeekend,
      compareWeekend,
      comparableFilms,
      brief,
      windowKey,
      avgWeekendGross,
    });
  }, [activeFilm, weekends, primaryWeekend, compareWeekend, comparableFilms, brief, windowKey, avgWeekendGross]);

  const hasAnyData = Object.keys(allYearsData).length > 0;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">

      <aside className="w-48 shrink-0 border-r border-white/[0.06] overflow-hidden">
        <SlateSidebar
          films={slateFilms}
          catalogFilms={catalogFilms}
          activeId={activeFilm?.id ?? null}
          onSelect={handleSelectFilm}
        />
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        <div className="px-5 py-2 border-b border-white/[0.06] shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-neutral-600 min-w-0">
            {loadingWindow && <span className="animate-pulse">Analyzing…</span>}
            {!loadingWindow && windowData && activeFilm && (
              <span>
                <span className="text-emerald-500">{lowCount}</span> low-competition window{lowCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
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

            <div className="flex items-center gap-2 text-xs text-neutral-700">
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded-full bg-emerald-500 inline-block" />Low</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded-full bg-amber-400 inline-block" />Med</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded-full bg-red-500 inline-block" />High</span>
            </div>

            <a href="/about" className="text-neutral-700 hover:text-neutral-400 transition-colors border border-white/[0.06] rounded px-2 py-0.5 text-xs">
              How it works
            </a>
          </div>
        </div>

        {activeFilm && (
          <div className="px-5 py-2 border-b border-white/[0.04] bg-white/[0.01] shrink-0 flex items-center gap-2 flex-wrap">
            <span className="font-[family-name:var(--font-newsreader)] text-sm text-white">{activeFilm.title}</span>
            <span className="text-neutral-700 text-xs">·</span>
            {activeFilm.genres.map((g) => (
              <span key={g} className="text-[10px] text-neutral-500 bg-white/[0.05] px-1.5 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        )}

        {!activeFilm ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-3xl italic mb-3">
              Select a film to begin.
            </div>
            <p className="text-neutral-700 text-sm max-w-xs">
              Choose a title from your slate to map the competitive landscape, or add a custom film by genre.
            </p>
          </div>
        ) : !hasAnyData && loadingYears.size > 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xl italic animate-pulse">
              Analyzing…
            </div>
          </div>
        ) : (
          <>
            {/* Multi-year heat map */}
            <MultiYearHeatMap
              allYearsData={allYearsData}
              windowKey={windowKey}
              primaryDate={primaryDate}
              compareDate={compareDate}
              onSelect={handleSelectDate}
              onYearChange={handleWindowChange}
              rowRefs={rowRefs}
            />

            {loadingWindow ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xl italic animate-pulse">
                  Loading {WINDOW_OPTIONS.find((o) => o.key === windowKey)?.label}…
                </div>
              </div>
            ) : windowData ? (
              <>
                <BestWindowsStrip weekends={weekends} primaryDate={primaryDate} onSelect={(d) => handleSelectDate(d)} />

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
          </>
        )}
      </main>

      <aside className="w-[520px] shrink-0 border-l border-white/[0.06] overflow-hidden">
        <DetailPanel
          primary={primaryWeekend}
          compare={compareWeekend}
          activeFilm={activeFilm}
          isProjection={windowData?.isProjection}
          avgWeekendGross={avgWeekendGross}
          comparableFilms={comparableFilms}
          brief={brief}
          briefLoading={briefLoading}
          onClearPrimary={() => setPrimaryDate(null)}
          onClearCompare={() => setCompareDate(null)}
          onRequestBrief={handleRequestBrief}
          onClearBrief={() => setBrief(null)}
          onDownloadPDF={handleDownloadPDF}
        />
      </aside>
    </div>
  );
}
