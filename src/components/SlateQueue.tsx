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
      </div>

      <div className="flex-1 overflow-y-auto">
        {films.map((film) => {
          const isActive = film.id === activeId;
          return (
            <button
              key={film.id}
              onClick={() => onSelect(film)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-800/60 transition-colors hover:bg-neutral-800/50 ${
                isActive ? "bg-amber-950/30 border-l-2 border-l-amber-500" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`font-medium text-sm leading-tight ${
                    isActive ? "text-white" : "text-neutral-200"
                  }`}
                >
                  {film.title}
                </span>
                {film.status === "confirmed" && (
                  <span className="text-[10px] text-emerald-400 shrink-0 mt-0.5">●</span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {film.genres.slice(0, 2).map((g) => (
                  <Badge
                    key={g}
                    variant="outline"
                    className="text-[10px] py-0 px-1 border-neutral-700 text-neutral-500 bg-transparent"
                  >
                    {g}
                  </Badge>
                ))}
              </div>

              {film.director && (
                <p className="text-[11px] text-neutral-600 mt-1 truncate">
                  {film.director}
                </p>
              )}

              {film.tentativeDate && (
                <p className={`text-[11px] mt-0.5 ${STATUS_COLORS[film.status]}`}>
                  {new Date(film.tentativeDate + "T12:00:00Z").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
              {!film.tentativeDate && film.status !== "released" && (
                <p className="text-[11px] text-neutral-600 mt-0.5">Unscheduled</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-neutral-800 text-[11px] text-neutral-600">
        Click a film to analyze release dates
      </div>
    </div>
  );
}
