"use client";

import { useEffect, useState, useCallback } from "react";
import { WeekTimeline } from "@/components/WeekTimeline";
import { WeekDetail } from "@/components/WeekDetail";
import { SlateQueue } from "@/components/SlateQueue";
import { HowItWorksModal, HowItWorksBanner } from "@/components/HowItWorks";
import type {
  TimelineWeekend,
  WeekendData,
  SimulateResult,
  SlateFilm,
} from "@/lib/types";

export default function Home() {
  const [timeline, setTimeline] = useState<TimelineWeekend[]>([]);
  const [slateFilms, setSlateFilms] = useState<SlateFilm[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeFilm, setActiveFilm] = useState<SlateFilm | null>(null);
  const [weekDetail, setWeekDetail] = useState<WeekendData | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null);
  const [simulateCache, setSimulateCache] = useState<Map<string, SimulateResult>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const simulateMode = activeFilm !== null;

  useEffect(() => {
    fetch("/api/timeline").then((r) => r.json()).then(setTimeline).catch(console.error);
    fetch("/api/slate").then((r) => r.json()).then(setSlateFilms).catch(console.error);
  }, []);

  async function runSimulate(date: string, genres: string[]): Promise<SimulateResult | null> {
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, genres }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  const loadWeekend = useCallback(
    async (date: string, film: SlateFilm | null) => {
      setDetailLoading(true);
      setWeekDetail(null);
      setSimulateResult(null);
      try {
        const detail: WeekendData = await fetch(`/api/week/${date}`).then((r) => r.json());
        setWeekDetail(detail);
        if (film) {
          const sim = await runSimulate(date, film.genres);
          setSimulateResult(sim);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedDate) loadWeekend(selectedDate, activeFilm);
  }, [selectedDate, activeFilm, loadWeekend]);

  // Pre-fetch simulation scores for all weekends when a film is activated (sampled)
  useEffect(() => {
    if (!activeFilm || timeline.length === 0) {
      setSimulateCache(new Map());
      return;
    }
    const controller = new AbortController();
    const batchSimulate = async () => {
      const newCache = new Map<string, SimulateResult>();
      const sampled = timeline.filter((_, i) => i % 2 === 0);
      for (const weekend of sampled) {
        if (controller.signal.aborted) break;
        try {
          const res = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: weekend.weekendDate, genres: activeFilm.genres }),
            signal: controller.signal,
          });
          if (res.ok) {
            const sim: SimulateResult = await res.json();
            newCache.set(weekend.weekendDate, sim);
            setSimulateCache(new Map(newCache));
          }
        } catch {}
      }
    };
    batchSimulate();
    return () => controller.abort();
  }, [activeFilm, timeline]);

  function handleSelectFilm(film: SlateFilm) {
    setActiveFilm((prev) => (prev?.id === film.id ? null : film));
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-bold tracking-tight">Slate Setter</h1>
          <span className="text-neutral-600 text-xs">·</span>
          <span className="text-neutral-500 text-xs">
            {simulateMode ? (
              <>
                Analyzing{" "}
                <span className="text-amber-400 font-medium">{activeFilm!.title}</span>
                <span className="ml-2 text-neutral-600">
                  ({activeFilm!.genres.join(", ")})
                </span>
              </>
            ) : (
              "Box office intelligence · 2022–2025"
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {simulateMode && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Low
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block ml-1" /> Medium
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-1" /> High competition
            </div>
          )}
          <button
            onClick={() => setShowHelp(true)}
            className="text-neutral-500 hover:text-neutral-300 text-xs border border-neutral-700 rounded px-2 py-1 transition-colors"
          >
            ?
          </button>
        </div>
      </header>

      {showBanner && <HowItWorksBanner onDismiss={() => setShowBanner(false)} />}

      <div className="flex flex-1 overflow-hidden">
        {/* Slate Queue */}
        <aside className="w-48 border-r border-neutral-800 shrink-0 flex flex-col overflow-hidden">
          <SlateQueue
            films={slateFilms}
            activeId={activeFilm?.id ?? null}
            onSelect={handleSelectFilm}
          />
        </aside>

        {/* Timeline */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="px-4 py-2 border-b border-neutral-800 shrink-0 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {timeline.length} weekends · click any bar
            </span>
            {!simulateMode ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Strong
                <span className="w-2 h-2 rounded-full bg-yellow-600 inline-block ml-1" /> Average
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-1" /> Weak
              </div>
            ) : (
              <span className="text-xs text-amber-400/70">
                Competition overlay active · loading scores…
              </span>
            )}
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="h-full" style={{ minWidth: Math.max(timeline.length * 8, 600) }}>
              <WeekTimeline
                data={timeline}
                selectedDate={selectedDate}
                simulateResults={simulateCache}
                simulateMode={simulateMode}
                onSelectWeekend={setSelectedDate}
              />
            </div>
          </div>
        </main>

        {/* Week detail */}
        <aside className="w-80 border-l border-neutral-800 shrink-0 flex flex-col overflow-hidden">
          <WeekDetail
            weekend={weekDetail}
            simulate={simulateResult}
            activeFilm={activeFilm}
            loading={detailLoading}
          />
        </aside>
      </div>

      <HowItWorksModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
