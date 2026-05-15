"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { TimelineWeekend } from "@/lib/types";
import { getHolidayLabel } from "@/lib/holidays";

function isCovid(date: string) {
  return date >= "2020-01-01" && date < "2022-01-01";
}

type ScoreEntry = { competitionScore: number; rating: "HIGH" | "MEDIUM" | "LOW" };

interface Props {
  data: TimelineWeekend[];
  selectedDate: string | null;
  compareDate: string | null;
  simulateResults: Map<string, ScoreEntry>;
  simulateMode: boolean;
  opportunityView: boolean;
  excludeCovid: boolean;
  pinnedDates: Array<{ date: string; rank: number }>;
  onSelectWeekend: (date: string) => void;
}

function formatM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function getMarketColor(gross: number, avg: number): string {
  const ratio = gross / avg;
  if (ratio >= 1.4) return "#22c55e";
  if (ratio >= 1.1) return "#86efac";
  if (ratio >= 0.8) return "#ca8a04";
  if (ratio >= 0.5) return "#f97316";
  return "#ef4444";
}

function getCompetitionColor(result: ScoreEntry | undefined): string {
  if (!result) return "#525252";
  if (result.rating === "HIGH") return "#ef4444";   // red-500
  if (result.rating === "MEDIUM") return "#f97316"; // orange-500 (distinct from amber/gold pins)
  return "#22c55e";                                  // green-500
}

const CustomTooltip = ({
  active,
  payload,
  simulateMode,
  opportunityView,
  simulateResults,
  pinnedDates,
  compareDate,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimelineWeekend & { avgGross: number; opportunityGross: number } }>;
  simulateMode: boolean;
  opportunityView: boolean;
  simulateResults: Map<string, ScoreEntry>;
  pinnedDates: Array<{ date: string; rank: number }>;
  compareDate: string | null;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const sim = simulateResults.get(d.weekendDate);
  const holiday = getHolidayLabel(d.weekendDate);
  const date = new Date(d.weekendDate + "T12:00:00Z");
  const pinned = pinnedDates.find((p) => p.date === d.weekendDate);
  const isCompare = d.weekendDate === compareDate;

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2.5 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {holiday && ` · ${holiday.emoji} ${holiday.label}`}
        {isCovid(d.weekendDate) && <span className="text-neutral-500 font-normal"> · COVID</span>}
      </p>
      {pinned && (
        <p className="text-amber-400 text-[11px] font-semibold mb-1">★ Recommended #{pinned.rank}</p>
      )}
      {isCompare && (
        <p className="text-sky-400 text-[11px] font-semibold mb-1">◈ Compare date</p>
      )}
      <p className="text-neutral-300">
        Market: <span className="text-white font-mono">{formatM(d.totalGross)}</span>
      </p>
      {simulateMode && opportunityView && sim && (
        <p className="text-amber-300">
          Available: <span className="font-mono">{formatM(d.opportunityGross)}</span>
          <span className="text-neutral-500 ml-1">({((1 - sim.competitionScore) * 100).toFixed(0)}% uncontested)</span>
        </p>
      )}
      <p className="text-neutral-400">Top: {d.topFilm}</p>
      {simulateMode && sim && (
        <p className={`mt-1 font-semibold ${
          sim.rating === "HIGH" ? "text-red-400" : sim.rating === "MEDIUM" ? "text-amber-400" : "text-emerald-400"
        }`}>
          Competition: {sim.rating}
        </p>
      )}
    </div>
  );
};

function getYearBoundaries(data: TimelineWeekend[]): string[] {
  const seen = new Set<string>();
  return data
    .filter((d) => {
      const year = d.weekendDate.slice(0, 4);
      if (seen.has(year)) return false;
      seen.add(year);
      return true;
    })
    .map((d) => d.weekendDate);
}

export function WeekTimeline({
  data,
  selectedDate,
  compareDate,
  simulateResults,
  simulateMode,
  opportunityView,
  excludeCovid,
  pinnedDates,
  onSelectWeekend,
}: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        No data available. Run the seed script first.
      </div>
    );
  }

  const baselineData = excludeCovid ? data.filter((d) => !isCovid(d.weekendDate)) : data;
  const avg = baselineData.reduce((s, d) => s + d.totalGross, 0) / (baselineData.length || 1);
  const yearBoundaries = getYearBoundaries(data);

  const monthTicks = data
    .filter((d, i) => i === 0 || d.weekendDate.slice(5, 7) !== data[i - 1].weekendDate.slice(5, 7))
    .map((d) => d.weekendDate);

  const pinnedSet = new Set(pinnedDates.map((p) => p.date));

  const enriched = data.map((d) => {
    const sim = simulateResults.get(d.weekendDate);
    const opportunityGross = sim
      ? d.totalGross * (1 - sim.competitionScore)
      : d.totalGross;
    return {
      ...d,
      avgGross: avg,
      holiday: getHolidayLabel(d.weekendDate),
      covid: isCovid(d.weekendDate),
      opportunityGross,
    };
  });

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={enriched}
          margin={{ top: 16, right: 8, left: 8, bottom: 32 }}
          barCategoryGap="20%"
          onClick={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = (e as any)?.activePayload?.[0]?.payload;
            if (payload?.weekendDate) onSelectWeekend(payload.weekendDate);
          }}
          style={{ cursor: "pointer" }}
        >
          <XAxis
            dataKey="weekendDate"
            ticks={monthTicks}
            tickFormatter={(date: string) => {
              const d = new Date(date + "T12:00:00Z");
              return d.toLocaleDateString("en-US", { month: "short" });
            }}
            tick={{ fill: "#737373", fontSize: 10 }}
            axisLine={{ stroke: "#404040" }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={formatM}
            tick={{ fill: "#737373", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            content={
              <CustomTooltip
                simulateMode={simulateMode}
                opportunityView={opportunityView}
                simulateResults={simulateResults}
                pinnedDates={pinnedDates}
                compareDate={compareDate}
              />
            }
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />

          {yearBoundaries.map((date) => (
            <ReferenceLine
              key={date}
              x={date}
              stroke="#404040"
              strokeDasharray="3 3"
              label={{
                value: date.slice(0, 4),
                position: "insideTopLeft",
                fill: "#525252",
                fontSize: 11,
              }}
            />
          ))}

          <Bar
            dataKey={simulateMode && opportunityView ? "opportunityGross" : "totalGross"}
            radius={[2, 2, 0, 0]}
            minPointSize={2}
          >
            {enriched.map((d) => {
              const isSelected = d.weekendDate === selectedDate;
              const isCompare = d.weekendDate === compareDate;
              const isPinned = simulateMode && pinnedSet.has(d.weekendDate);

              // Priority: compare > pinned (recommended) > competition > market
              const color = isCompare
                ? "#38bdf8"   // sky-400 — comparison anchor
                : isPinned
                ? "#f59e0b"   // amber-500 — top recommendation
                : d.covid && excludeCovid
                ? "#404040"
                : simulateMode
                ? getCompetitionColor(simulateResults.get(d.weekendDate))
                : getMarketColor(d.totalGross, avg);

              const baseOpacity = d.covid && excludeCovid ? 0.4 : 1;
              const dimmed = selectedDate && !isSelected && !isCompare;

              return (
                <Cell
                  key={d.weekendDate}
                  fill={color}
                  opacity={dimmed ? 0.3 : baseOpacity}
                  stroke={isSelected ? "#ffffff" : isCompare ? "#7dd3fc" : "transparent"}
                  strokeWidth={isSelected || isCompare ? 1.5 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
