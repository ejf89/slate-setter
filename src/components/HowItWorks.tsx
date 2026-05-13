"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">How to use Slate Setter</DialogTitle>
          <DialogDescription className="text-neutral-400">
            A release-date intelligence tool for theatrical teams.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-neutral-300 mt-2">
          <div>
            <h3 className="font-semibold text-white mb-1">1. Pick a film from your slate</h3>
            <p className="text-neutral-400">
              Select an upcoming film in the left panel. Its genres automatically load into
              the competition analyzer.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">2. Read the timeline</h3>
            <p className="text-neutral-400">
              Each bar is one weekend. Bar height = total industry gross. When a film is
              active, bars recolor to show competition intensity — <span className="text-emerald-400">green</span> means
              a clear weekend, <span className="text-red-400">red</span> means heavy genre competition.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">3. Click any weekend</h3>
            <p className="text-neutral-400">
              The right panel shows every film in theaters that week, including holdovers
              (films in their 2nd, 3rd, 4th week). Holdovers still compete for audience — a
              blockbuster in <span className="text-amber-400">W3</span> of its run still draws crowds.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-1">4. Read the competition score</h3>
            <p className="text-neutral-400">
              Score combines genre overlap, holdover decay (W1 = full threat, W4 = 25%), and
              market share. Films in the same genre in their opening weekend are the highest
              threat. Alternatives show nearby weekends with less competition.
            </p>
          </div>

          <div className="pt-2 border-t border-neutral-800 text-neutral-600 text-xs">
            Data: Box Office Mojo (historical grosses 2022–2025) · TMDB (genre metadata)
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HowItWorksBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-amber-950/30 border-b border-amber-800/40 text-sm">
      <p className="text-amber-200/80">
        <span className="font-medium">Get started:</span> Pick a film from your slate →
        explore the timeline → click a weekend to analyze competition.
      </p>
      <button
        onClick={onDismiss}
        className="text-amber-500/60 hover:text-amber-400 text-xs shrink-0 transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}
