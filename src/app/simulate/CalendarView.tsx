"use client";

import { useEffect, useState, useRef } from "react";

interface FilmEntry {
  filmId: number;
  title: string;
  genres: string[];
  gross: number;
  weeksInRelease: number;
  rank: number;
  threatScore: number;
  isThreat: boolean;
}

interface WeekendData {
  date: string;
  sourceDate: string;
  totalGross: number;
  competitionScore: number;
  rating: "HIGH" | "MEDIUM" | "LOW";
  films: FilmEntry[];
}

interface WindowResult {
  weekends: WeekendData[];
  targetGenres: string[];
  window: string;
  isProjection: boolean;
}

function formatDate(dateStr: string): { month: string; day: string; year: string } {
  const d = new Date(dateStr + "T12:00:00Z");
  return {
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day: String(d.getUTCDate()),
    year: String(d.getUTCFullYear()),
  };
}

function formatGross(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function competitionBandColor(score: number): string {
  if (score >= 0.55) return "#ef4444";
  if (score >= 0.35) return "#f97316";
  if (score >= 0.18) return "#eab308";
  return "#22c55e";
}

function competitionLabel(rating: "HIGH" | "MEDIUM" | "LOW"): { text: string; className: string } {
  if (rating === "HIGH")   return { text: "High",   className: "text-red-400" };
  if (rating === "MEDIUM") return { text: "Med",    className: "text-amber-400" };
  return { text: "Low",   className: "text-emerald-400" };
}

function WeekendColumn({
  weekend,
  isSelected,
  onClick,
}: {
  weekend: WeekendData;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { month, day, year } = formatDate(weekend.date);
  const band = competitionBandColor(weekend.competitionScore);
  const label = competitionLabel(weekend.rating);

  // Show top 6 films, threats first then by gross
  const sorted = [...weekend.films]
    .sort((a, b) => {
      if (a.isThreat && !b.isThreat) return -1;
      if (!a.isThreat && b.isThreat) return 1;
      return b.gross - a.gross;
    })
    .slice(0, 7);

  return (
    <button
      onClick={onClick}
      className={`flex-none flex flex-col border-r border-white/[0.06] transition-colors group cursor-pointer text-left
        ${isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}
      style={{ width: "160px", minHeight: "100%" }}
    >
      {/* Competition color band */}
      <div className="h-2 w-full shrink-0" style={{ backgroundColor: band }} />

      {/* Date header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-[family-name:var(--font-newsreader)] text-2xl text-white font-normal leading-none">
            {month} {day}
          </span>
        </div>
        <div className="font-[family-name:var(--font-newsreader)] text-neutral-600 text-xs italic mt-0.5">
          {year}
        </div>

        <div className="flex items-center gap-2 mt-2.5">
          <span className={`text-xs font-semibold ${label.className}`}>{label.text}</span>
          <span className="text-neutral-700 text-xs">
            {(weekend.competitionScore * 100).toFixed(0)}%
          </span>
        </div>

        <div className="text-neutral-700 text-[10px] mt-0.5">
          {formatGross(weekend.totalGross)} market
        </div>
      </div>

      {/* Film list */}
      <div className="px-3 py-3 flex flex-col gap-2 flex-1 overflow-hidden">
        {sorted.map((film) => (
          <div key={film.filmId + film.weeksInRelease} className={film.weeksInRelease > 1 ? "opacity-45" : ""}>
            <div className="flex items-start justify-between gap-1">
              <span
                className={`font-[family-name:var(--font-newsreader)] text-[11px] leading-tight truncate font-normal
                  ${film.isThreat ? "text-white" : "text-neutral-400"}`}
              >
                {film.title}
              </span>
              {film.isThreat && (
                <span className="text-[8px] text-red-500 shrink-0 mt-0.5 font-semibold">⚠</span>
              )}
            </div>
            <div className="text-[9px] text-neutral-700 mt-0.5">
              W{film.weeksInRelease}
              {film.genres[0] && ` · ${film.genres[0]}`}
            </div>
          </div>
        ))}
        {weekend.films.length > 7 && (
          <div className="text-[9px] text-neutral-700 mt-1">
            +{weekend.films.length - 7} more
          </div>
        )}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="h-0.5 w-full bg-white shrink-0" />
      )}
    </button>
  );
}

function DetailPanel({
  weekend,
  targetGenres,
  onClose,
}: {
  weekend: WeekendData;
  targetGenres: string[];
  onClose: () => void;
}) {
  const { month, day, year } = formatDate(weekend.date);
  const label = competitionLabel(weekend.rating);

  const threats = weekend.films.filter((f) => f.isThreat).sort((a, b) => b.threatScore - a.threatScore);
  const others = weekend.films.filter((f) => !f.isThreat).sort((a, b) => b.gross - a.gross);
  const totalGross = weekend.totalGross;

  return (
    <div className="w-80 shrink-0 border-l border-white/[0.06] flex flex-col h-full overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="font-[family-name:var(--font-newsreader)] text-3xl text-white font-normal leading-none">
              {month} {day}
            </div>
            <div className="font-[family-name:var(--font-newsreader)] text-neutral-500 text-sm italic mt-0.5">
              {year}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-neutral-400 text-lg transition-colors mt-0.5"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div>
            <div className={`text-2xl font-bold ${label.className}`}>
              {(weekend.competitionScore * 100).toFixed(0)}%
            </div>
            <div className="text-neutral-600 text-[10px] uppercase tracking-wider">competition</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div>
            <div className="text-2xl font-bold text-white">{formatGross(totalGross)}</div>
            <div className="text-neutral-600 text-[10px] uppercase tracking-wider">market size</div>
          </div>
        </div>

        {targetGenres.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {targetGenres.map((g) => (
              <span key={g} className="text-[10px] text-neutral-500 bg-white/[0.05] px-2 py-0.5 rounded-full">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Threats */}
        {threats.length > 0 && (
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <div className="text-[10px] text-red-500 tracking-widest uppercase mb-3 font-semibold">
              Genre competition
            </div>
            <div className="space-y-3">
              {threats.map((film) => (
                <div key={film.filmId + film.weeksInRelease} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-[family-name:var(--font-newsreader)] text-white text-sm font-normal leading-tight truncate">
                      {film.title}
                    </div>
                    <div className="text-neutral-600 text-[10px] mt-0.5">
                      W{film.weeksInRelease} · {film.genres.slice(0, 2).join(", ")} · {formatGross(film.gross)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-red-400 text-xs font-semibold">
                      {(film.threatScore * 100).toFixed(1)}%
                    </div>
                    <div className="text-neutral-700 text-[9px]">threat</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {threats.length === 0 && (
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <div className="text-[10px] text-emerald-600 tracking-widest uppercase mb-2 font-semibold">
              Genre competition
            </div>
            <p className="text-neutral-600 text-xs">
              No direct genre competition this weekend.
            </p>
          </div>
        )}

        {/* Other films */}
        <div className="px-5 py-4">
          <div className="text-[10px] text-neutral-600 tracking-widest uppercase mb-3 font-semibold">
            Also in theaters
          </div>
          <div className="space-y-2.5">
            {others.slice(0, 8).map((film) => (
              <div key={film.filmId + film.weeksInRelease} className={`flex items-start justify-between gap-2 ${film.weeksInRelease > 1 ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <div className="font-[family-name:var(--font-newsreader)] text-neutral-300 text-xs leading-tight truncate">
                    {film.title}
                  </div>
                  <div className="text-neutral-700 text-[10px] mt-0.5">
                    W{film.weeksInRelease} · {film.genres[0] ?? "—"}
                  </div>
                </div>
                <div className="text-neutral-600 text-xs shrink-0">{formatGross(film.gross)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CalendarView({
  title,
  comps,
  window: windowSlug,
}: {
  title: string;
  comps: string;
  window: string;
}) {
  const [data, setData] = useState<WindowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load window data
  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ comps, window: windowSlug });
    fetch(`/api/simulate/window?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
        // Auto-select the lowest competition weekend
        if (d.weekends?.length > 0) {
          const best = [...d.weekends].sort((a: WeekendData, b: WeekendData) => a.competitionScore - b.competitionScore)[0];
          setSelectedDate(best.date);
        }
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [comps, windowSlug]);

  const selectedWeekend = data?.weekends.find((w) => w.date === selectedDate) ?? null;

  // Scroll best window into view after data loads
  useEffect(() => {
    if (!data || !scrollRef.current) return;
    const bestIdx = data.weekends.reduce((bestI, w, i) =>
      w.competitionScore < data.weekends[bestI].competitionScore ? i : bestI
    , 0);
    const col = scrollRef.current.children[bestIdx] as HTMLElement;
    col?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [data]);

  // Parse window label for display
  const windowLabel = data?.window ?? windowSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="font-[family-name:var(--font-newsreader)] text-neutral-500 text-2xl italic mb-2">
            Mapping the landscape…
          </div>
          <div className="text-neutral-700 text-xs">Analyzing genre competition across {windowLabel}</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="text-neutral-500 text-sm mb-2">Could not load window data.</div>
          <a href="/simulate" className="text-neutral-600 text-xs hover:text-neutral-400 underline">
            Try again
          </a>
        </div>
      </div>
    );
  }

  const lowCount = data.weekends.filter((w) => w.rating === "LOW").length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col" style={{ height: "100vh" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-4">
          <a href="/simulate" className="text-neutral-600 text-sm hover:text-neutral-400 transition-colors">
            ←
          </a>
          <div className="flex items-center gap-2 text-sm">
            {title && (
              <>
                <span className="font-[family-name:var(--font-newsreader)] text-white font-normal">{title}</span>
                <span className="text-neutral-700">·</span>
              </>
            )}
            <span className="text-neutral-500">{windowLabel}</span>
            {data.isProjection && (
              <span className="text-neutral-700 text-xs">(based on {windowLabel.replace("2026", "2025").replace("2027", "2025")} data)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Med
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Very high
            </span>
          </div>

          <div className="text-xs text-neutral-600 border-l border-white/[0.06] pl-5">
            <span className="text-emerald-500 font-medium">{lowCount}</span> low-competition window{lowCount !== 1 ? "s" : ""}
          </div>
        </div>
      </header>

      {/* Summary strip */}
      {data.targetGenres.length > 0 && (
        <div className="px-6 py-2.5 border-b border-white/[0.04] bg-white/[0.01] shrink-0 flex items-center gap-3">
          <span className="text-[10px] text-neutral-600 uppercase tracking-widest">Scoring for</span>
          <div className="flex gap-1.5">
            {data.targetGenres.map((g) => (
              <span key={g} className="text-[10px] text-neutral-400 bg-white/[0.05] px-2 py-0.5 rounded-full">
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main area: calendar + detail panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Horizontal calendar */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ minWidth: 0 }}>
          <div
            ref={scrollRef}
            className="flex h-full"
            style={{ width: `${data.weekends.length * 160}px`, minWidth: "100%" }}
          >
            {data.weekends.map((weekend) => (
              <WeekendColumn
                key={weekend.date}
                weekend={weekend}
                isSelected={weekend.date === selectedDate}
                onClick={() => setSelectedDate(weekend.date === selectedDate ? null : weekend.date)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selectedWeekend && (
          <DetailPanel
            weekend={selectedWeekend}
            targetGenres={data.targetGenres}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </div>
    </div>
  );
}
