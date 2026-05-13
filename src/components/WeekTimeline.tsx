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
import type { TimelineWeekend, SimulateResult } from "@/lib/types";
import { getHolidayLabel } from "@/lib/holidays";

interface Props {
  data: TimelineWeekend[];
  selectedDate: string | null;
  simulateResults: Map<string, SimulateResult>;
  simulateMode: boolean;
  onSelectWeekend: (date: string) => void;
}

function formatM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(0)}M`;
}

function getMarketColor(gross: number, avg: number): string {
  const ratio = gross / avg;
  if (ratio >= 1.4) return "#22c55e"; // green-500
  if (ratio >= 1.1) return "#86efac"; // green-300
  if (ratio >= 0.8) return "#ca8a04"; // yellow-600
  if (ratio >= 0.5) return "#f97316"; // orange-500
  return "#ef4444"; // red-500
}

function getCompetitionColor(result: SimulateResult | undefined): string {
  if (!result) return "#525252"; // neutral-600
  const { rating } = result;
  if (rating === "HIGH") return "#ef4444";
  if (rating === "MEDIUM") return "#f59e0b";
  return "#22c55e";
}

const CustomTooltip = ({
  active,
  payload,
  simulateMode,
  simulateResults,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimelineWeekend & { avgGross: number } }>;
  simulateMode: boolean;
  simulateResults: Map<string, SimulateResult>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const sim = simulateResults.get(d.weekendDate);
  const holiday = getHolidayLabel(d.weekendDate);
  const date = new Date(d.weekendDate + "T12:00:00Z");

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2.5 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {holiday && ` · ${holiday.emoji} ${holiday.label}`}
      </p>
      <p className="text-neutral-300">
        Market: <span className="text-white font-mono">{formatM(d.totalGross)}</span>
      </p>
      <p className="text-neutral-400">Top: {d.topFilm}</p>
      {simulateMode && sim && (
        <p
          className={`mt-1 font-semibold ${
            sim.rating === "HIGH"
              ? "text-red-400"
              : sim.rating === "MEDIUM"
              ? "text-amber-400"
              : "text-emerald-400"
          }`}
        >
          Competition: {sim.rating}
        </p>
      )}
    </div>
  );
};

// Year boundary reference lines
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
  simulateResults,
  simulateMode,
  onSelectWeekend,
}: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        No data available. Run the seed script first.
      </div>
    );
  }

  const avg = data.reduce((s, d) => s + d.totalGross, 0) / data.length;
  const yearBoundaries = getYearBoundaries(data);

  const enriched = data.map((d) => ({
    ...d,
    avgGross: avg,
    holiday: getHolidayLabel(d.weekendDate),
  }));

  return (
    <div className="w-full h-full" style={{ minWidth: data.length * 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={enriched}
          margin={{ top: 16, right: 8, left: 8, bottom: 24 }}
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
            tick={false}
            axisLine={{ stroke: "#404040" }}
            tickLine={false}
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
                simulateResults={simulateResults}
              />
            }
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />

          {/* Year labels */}
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

          <Bar dataKey="totalGross" radius={[2, 2, 0, 0]} minPointSize={2}>
            {enriched.map((d) => {
              const isSelected = d.weekendDate === selectedDate;
              const color = simulateMode
                ? getCompetitionColor(simulateResults.get(d.weekendDate))
                : getMarketColor(d.totalGross, avg);

              return (
                <Cell
                  key={d.weekendDate}
                  fill={color}
                  opacity={
                    selectedDate
                      ? isSelected
                        ? 1
                        : 0.5
                      : d.holiday
                      ? 1
                      : 0.85
                  }
                  stroke={isSelected ? "#fff" : "transparent"}
                  strokeWidth={isSelected ? 1 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
