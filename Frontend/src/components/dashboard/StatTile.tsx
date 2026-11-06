import type { CSSProperties, ReactNode } from "react";
import { Sparkline } from "@/components/common/Sparkline";

export type Tone = "accent" | "success" | "danger" | "warning" | "neutral";

const TONE_COLOR: Record<Tone, string> = {
  accent: "var(--color-accent-400)",
  success: "var(--color-success-600)",
  danger: "var(--color-danger-600)",
  warning: "var(--color-warning-600)",
  neutral: "var(--color-neutral-600)",
};

/** A ring gauge, 0-100, drawn clockwise from 12 o'clock. */
function Ring({ percent, color }: { percent: number; color: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 44 44" className="size-10 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r="17" fill="none" stroke="var(--color-border-strong)" strokeWidth="3.5" opacity="0.7" />
      <circle
        cx="22"
        cy="22"
        r="17"
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={100}
        className="animate-ring-fill"
        style={{ "--off": 100 - p, filter: `drop-shadow(0 0 4px ${color})` } as CSSProperties}
      />
    </svg>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  supporting?: string;
  tone?: Tone;
  trend?: number[];
  ring?: number;
  /** A two-part proportion bar, e.g. succeeded vs failed. */
  split?: { good: number; bad: number };
  index?: number;
}

export function StatTile({ label, value, supporting, tone = "neutral", trend, ring, split, index = 0 }: StatTileProps) {
  const color = TONE_COLOR[tone];
  const hasSplit = split && split.good + split.bad > 0;
  return (
    <div data-spotlight style={{ "--i": index } as CSSProperties} className="animate-rise rounded-xl border border-border bg-surface px-4 py-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] font-medium text-text-secondary">{label}</p>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="whitespace-nowrap text-[28px] font-semibold leading-none tracking-[-0.045em] text-text-primary">{value}</p>
        {ring !== undefined ? <Ring percent={ring} color={color} /> : trend ? <Sparkline data={trend} color={color} className="h-8 w-20 shrink-0" /> : null}
      </div>
      {hasSplit ? (
        <div className="mt-2.5 flex h-1 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
          <div className="animate-grow-x rounded-l-full bg-success-500" style={{ width: `${(split.good / (split.good + split.bad)) * 100}%` }} />
          <div className="animate-grow-x rounded-r-full bg-danger-500" style={{ width: `${(split.bad / (split.good + split.bad)) * 100}%`, "--i": 1 } as CSSProperties} />
        </div>
      ) : null}
      {supporting && <p className="mt-2 truncate text-[11px] text-text-tertiary">{supporting}</p>}
    </div>
  );
}
