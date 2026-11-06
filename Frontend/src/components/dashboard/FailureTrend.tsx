import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface DayStat {
  total: number;
  failed: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Stacked daily bars: the failed share rises from the baseline, the successful share sits above it. */
export function FailureTrend({ days, stats, today }: { days: string[]; stats: Map<string, DayStat>; today: string }) {
  const peak = Math.max(1, ...days.map((d) => stats.get(d)?.total ?? 0));

  return (
    <div>
      <div className="relative h-44">
        {[0, 0.5, 1].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${g * 100}%` }} />
        ))}
        <ul className="absolute inset-0 flex items-stretch gap-1.5">
          {days.map((d, i) => {
            const s = stats.get(d) ?? { total: 0, failed: 0 };
            const h = (s.total / peak) * 100;
            const fh = s.total ? (s.failed / s.total) * 100 : 0;
            return (
              <li key={d} className="group relative flex min-w-0 flex-1 items-end" tabIndex={0} aria-label={`${label(d)}: ${s.failed} failed of ${s.total} runs`}>
                <div style={{ height: `${h}%`, "--i": i } as CSSProperties} className="animate-grow-y flex w-full flex-col overflow-hidden rounded-[4px]">
                  <div className="flex-1 bg-success-500/60 transition-colors duration-150 group-hover:bg-success-500" />
                  <div style={{ height: `${fh}%` }} className="bg-danger-500/75 transition-colors duration-150 group-hover:bg-danger-500" />
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-navy-800 px-2.5 py-1.5 text-[11px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <p className="font-medium text-text-primary">{label(d)}</p>
                  <p className="num text-text-secondary">
                    <span className="text-danger-600">{s.failed} failed</span> · {s.total - s.failed} succeeded
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <ul className="mt-2 flex gap-1.5">
        {days.map((d) => (
          <li key={d} className={cn("num min-w-0 flex-1 text-center font-mono text-[10px]", d === today ? "font-semibold text-accent-600" : "text-text-tertiary")}>
            {Number(d.slice(8))}
          </li>
        ))}
      </ul>
    </div>
  );
}
