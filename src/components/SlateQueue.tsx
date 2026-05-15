"use client";

import type { SlateFilm } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  films: SlateFilm[];
  activeId: number | null;
  onSelect: (film: SlateFilm) => void;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "text-emerald-400",
  announced: "text-amber-400",
  released: "text-neutral-500",
  unscheduled: "text-neutral-500",
};

export function SlateQueue({ films, activeId, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="text-xs font-semibold tracking-widest text-neutral-400 uppercase">
          Your Slate
        </h2>
        <p className="text-[11px] text-neutral-600 mt-1">
          Select one film to analyze competition
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {films.map((film) => {
          const isActive = film.id === activeId;
          return (
            <button
              key={film.id}
              onClick={() => onSelect(film)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-800/60 transition-all cursor-pointer ${
                isActive
                  ? "bg-amber-950/40 border-l-2 border-l-amber-500"
                  : "hover:bg-neutral-800/50"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`font-medium text-sm leading-tight ${
                    isActive ? "text-white" : "text-neutral-400"
                  }`}
                >
                  {film.title}
                </span>
                {isActive && (
                  <span className="text-[10px] text-amber-400 shrink-0 mt-0.5 font-semibold">
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {film.genres.slice(0, 2).map((g) => (
                  <Badge
                    key={g}
                    variant="outline"
                    className={`text-[10px] py-0 px-1 bg-transparent ${
                      isActive
                        ? "border-amber-700/50 text-amber-300/70"
                        : "border-neutral-700 text-neutral-500"
                    }`}
                  >
                    {g}
                  </Badge>
                ))}
              </div>

              {film.director && (
                <p
                  className={`text-[11px] mt-1 truncate ${
                    isActive ? "text-neutral-600" : "text-neutral-600"
                  }`}
                >
                  {film.director}
                </p>
              )}

              {film.tentativeDate ? (
                <p
                  className={`text-[11px] mt-0.5 ${STATUS_COLORS[film.status]}`}
                >
                  {new Date(
                    film.tentativeDate + "T12:00:00Z"
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {film.status === "confirmed" && (
                    <span className="ml-1 text-[10px]">✓ confirmed</span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-neutral-600 mt-0.5">
                  No date set
                </p>
              )}

              {isActive && (
                <p className="text-[11px] text-amber-500/70 mt-1">
                  Analyzing competition
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-neutral-800 text-[11px] text-neutral-500">
        Click a film to find its best release dates
      </div>
    </div>
  );
}
