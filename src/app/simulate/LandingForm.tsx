"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface FilmResult {
  id: number;
  title: string;
  genres: string[];
  year: number | null;
}

const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "Historical",
  "Horror", "Music", "Musical", "Mystery", "Romance",
  "Sci-Fi", "Sport", "Thriller", "War", "Western",
];

const FUTURE_WINDOWS = [
  { value: "fall-2026",    label: "Fall 2026",    note: "Sep–Dec" },
  { value: "holiday-2026", label: "Holiday 2026", note: "Nov–Dec" },
  { value: "summer-2026",  label: "Summer 2026",  note: "Jun–Aug" },
  { value: "spring-2026",  label: "Spring 2026",  note: "Mar–May" },
];
const PAST_WINDOWS = [
  { value: "fall-2025",    label: "Fall 2025",    note: "Sep–Dec" },
  { value: "summer-2025",  label: "Summer 2025",  note: "Jun–Aug" },
  { value: "spring-2025",  label: "Spring 2025",  note: "Mar–May" },
  { value: "fall-2024",    label: "Fall 2024",    note: "Sep–Dec" },
];

export function LandingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedWindow, setSelectedWindow] = useState("fall-2026");

  // Comp search (optional enrichment — adds genres)
  const [compSearch, setCompSearch] = useState("");
  const [compResults, setCompResults] = useState<FilmResult[]>([]);
  const [compOpen, setCompOpen] = useState(false);
  const [addedComps, setAddedComps] = useState<FilmResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compRef = useRef<HTMLDivElement>(null);

  const searchFilms = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setCompResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/films?q=${encodeURIComponent(q)}`);
      if (res.ok) setCompResults(await res.json());
    }, 220);
  }, []);

  useEffect(() => { searchFilms(compSearch); }, [compSearch, searchFilms]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (compRef.current && !compRef.current.contains(e.target as Node)) {
        setCompOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  function selectComp(film: FilmResult) {
    // Add film's genres to selected genres
    const newGenres = film.genres.filter((g) => !selectedGenres.includes(g));
    if (newGenres.length > 0) setSelectedGenres((prev) => [...prev, ...newGenres]);
    if (!addedComps.some((c) => c.id === film.id)) {
      setAddedComps((prev) => [...prev, film]);
    }
    setCompSearch("");
    setCompResults([]);
    setCompOpen(false);
  }

  function removeComp(id: number) {
    const comp = addedComps.find((c) => c.id === id);
    setAddedComps((prev) => prev.filter((c) => c.id !== id));
    // Remove genres that only came from this comp (not from other comps or manually selected)
    if (comp) {
      const otherCompGenres = new Set(
        addedComps.filter((c) => c.id !== id).flatMap((c) => c.genres)
      );
      setSelectedGenres((prev) =>
        prev.filter((g) => otherCompGenres.has(g) || !comp.genres.includes(g))
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedGenres.length === 0) return;
    const params = new URLSearchParams({
      genres: selectedGenres.join(","),
      window: selectedWindow,
    });
    if (title.trim()) params.set("title", title.trim());
    if (addedComps.length > 0) params.set("comps", addedComps.map((c) => c.id).join(","));
    router.push(`/simulate?${params.toString()}`);
  }

  const canSubmit = selectedGenres.length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <a href="/" className="text-neutral-500 text-sm hover:text-neutral-300 transition-colors">
          ← Slate Setter
        </a>
        <span className="text-neutral-700 text-xs tracking-widest uppercase">Release Planner</span>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <h1 className="font-[family-name:var(--font-newsreader)] text-5xl text-white font-normal mb-2 leading-tight">
            Find your window.
          </h1>
          <p className="text-neutral-500 text-sm mb-10">
            Select the genres that define your audience. We'll score every weekend in your target window by genre competition.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Genre selection — primary input */}
            <div>
              <label className="block text-xs text-neutral-500 tracking-widest uppercase mb-3">
                Audience genres <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_GENRES.map((genre) => {
                  const active = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                        active
                          ? "bg-white text-black border-white font-medium"
                          : "bg-transparent text-neutral-400 border-white/10 hover:border-white/25 hover:text-neutral-200"
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
              {selectedGenres.length > 0 && (
                <p className="text-neutral-600 text-xs mt-2">
                  {selectedGenres.join(" · ")}
                </p>
              )}
            </div>

            {/* Optional: comp film enrichment */}
            <div>
              <label className="block text-xs text-neutral-500 tracking-widest uppercase mb-1">
                Comp films{" "}
                <span className="text-neutral-700 normal-case tracking-normal">(optional — auto-fills genres)</span>
              </label>
              <p className="text-neutral-700 text-xs mb-3">
                Search a film whose audience matches yours. Its genres will be added above.
              </p>

              {addedComps.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {addedComps.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 bg-white/[0.06] border border-white/10 rounded-full px-3 py-1 text-xs text-white">
                      <span className="font-[family-name:var(--font-newsreader)]">{c.title}</span>
                      <button type="button" onClick={() => removeComp(c.id)} className="text-neutral-600 hover:text-neutral-300 transition-colors">×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative" ref={compRef}>
                <input
                  type="text"
                  value={compSearch}
                  onChange={(e) => { setCompSearch(e.target.value); setCompOpen(true); }}
                  onFocus={() => compSearch.length >= 2 && setCompOpen(true)}
                  placeholder="e.g. Hereditary, Smile, Get Out…"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-md px-4 py-2.5 text-white placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/20 transition-colors"
                />
                {compOpen && compResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-white/10 rounded-md shadow-xl z-50 overflow-hidden">
                    {compResults.map((film) => (
                      <button
                        key={film.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectComp(film); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/[0.05] transition-colors flex items-center justify-between gap-4"
                      >
                        <span className="font-[family-name:var(--font-newsreader)] text-white text-sm">{film.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {film.year && <span className="text-neutral-600 text-xs">{film.year}</span>}
                          <span className="text-neutral-500 text-[10px]">{film.genres.slice(0, 2).join(", ")}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Film title — clearly labeled as optional display name */}
            <div>
              <label className="block text-xs text-neutral-500 tracking-widest uppercase mb-1">
                Your film{" "}
                <span className="text-neutral-700 normal-case tracking-normal">(optional — just a label)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Eddington"
                className="w-full bg-white/[0.04] border border-white/10 rounded-md px-4 py-2.5 text-white placeholder:text-neutral-600 text-sm focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>

            {/* Window selector */}
            <div>
              <label className="block text-xs text-neutral-500 tracking-widest uppercase mb-3">
                Target window
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-neutral-700 uppercase tracking-wider mb-1.5">Upcoming</p>
                  {FUTURE_WINDOWS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setSelectedWindow(w.value)}
                      className={`w-full text-left px-3 py-2 mb-1 rounded-md text-sm transition-all flex items-center justify-between ${
                        selectedWindow === w.value
                          ? "bg-white/[0.08] text-white border border-white/20"
                          : "text-neutral-400 border border-transparent hover:border-white/10 hover:text-neutral-200"
                      }`}
                    >
                      <span>{w.label}</span>
                      <span className="text-neutral-600 text-xs">{w.note}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] text-neutral-700 uppercase tracking-wider mb-1.5">Historical</p>
                  {PAST_WINDOWS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setSelectedWindow(w.value)}
                      className={`w-full text-left px-3 py-2 mb-1 rounded-md text-sm transition-all flex items-center justify-between ${
                        selectedWindow === w.value
                          ? "bg-white/[0.08] text-white border border-white/20"
                          : "text-neutral-400 border border-transparent hover:border-white/10 hover:text-neutral-200"
                      }`}
                    >
                      <span>{w.label}</span>
                      <span className="text-neutral-600 text-xs">{w.note}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3.5 bg-white text-black text-sm font-medium rounded-md hover:bg-neutral-100 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              {canSubmit
                ? `Analyze ${selectedWindow.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())} →`
                : "Select at least one genre to continue"}
            </button>
          </form>

          {/* Quick examples */}
          <div className="mt-10 pt-8 border-t border-white/5">
            <p className="text-neutral-600 text-xs mb-3">Quick examples</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Slow-burn horror", url: "/simulate?genres=Horror,Thriller,Drama&window=fall-2026&title=Untitled+horror" },
                { label: "Prestige drama", url: "/simulate?genres=Drama,Historical,Thriller&window=fall-2026" },
                { label: "Family animation", url: "/simulate?genres=Animation,Family,Comedy&window=fall-2026" },
                { label: "Action thriller", url: "/simulate?genres=Action,Thriller&window=fall-2026" },
              ].map((ex) => (
                <a
                  key={ex.label}
                  href={ex.url}
                  className="text-xs text-neutral-500 border border-white/[0.07] rounded-full px-3 py-1.5 hover:text-neutral-300 hover:border-white/15 transition-colors"
                >
                  {ex.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
