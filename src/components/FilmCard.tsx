"use client";

import type { FilmInTheater } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  film: FilmInTheater;
  highlight?: boolean;
}

function formatMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function FilmCard({ film, highlight }: Props) {
  const weekLabel = `W${film.weeksInRelease}`;
  const isHoldover = film.weeksInRelease > 1;

  return (
    <div
      className={`rounded-md px-3 py-2.5 border transition-colors ${
        highlight
          ? "bg-amber-950/40 border-amber-700/50"
          : "bg-neutral-900 border-neutral-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-neutral-500 text-xs w-4 shrink-0">#{film.rank}</span>
          <span className="font-medium text-sm text-white truncate">{film.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
              isHoldover
                ? "text-neutral-400 border-neutral-700 bg-neutral-800"
                : "text-amber-400 border-amber-700/50 bg-amber-950/40"
            }`}
          >
            {weekLabel}
          </span>
          <span className="text-sm font-mono text-white">{formatMoney(film.gross)}</span>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {film.studio && (
          <span className="text-xs text-neutral-500">{film.studio}</span>
        )}
        {film.genres.slice(0, 3).map((g) => (
          <Badge
            key={g}
            variant="outline"
            className="text-xs py-0 px-1.5 border-neutral-700 text-neutral-400 bg-transparent"
          >
            {g}
          </Badge>
        ))}
        {film.mpaaRating && (
          <span className="text-xs text-neutral-600 ml-auto">{film.mpaaRating}</span>
        )}
      </div>
    </div>
  );
}
