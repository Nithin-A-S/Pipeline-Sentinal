import Link from "next/link";
import type { CSSProperties } from "react";
import { formatTime } from "@/lib/utils";
import type { PipelineRun } from "@/ops/types";

/** Every run of the day as one cell, oldest to newest. Failed runs link to their incident. */
export function RunTimeline({ runs }: { runs: PipelineRun[] }) {
  if (runs.length === 0) return <p className="py-6 text-center text-xs text-text-tertiary">No runs yet today.</p>;
  const first = runs[0];
  const last = runs[runs.length - 1];

  return (
    <div>
      <ul className="flex h-12 items-stretch gap-[3px]" aria-label="Today's pipeline runs, oldest to newest">
        {runs.map((r, i) => {
          const failed = r.executionStatus !== "SUCCESS";
          const label = `${r.pipeline} · ${formatTime(r.startTime)} · ${failed ? "Failed" : "Success"}`;
          const cell = (
            <span
              title={label}
              aria-label={label}
              style={{ "--i": i } as CSSProperties}
              className={
                failed
                  ? "animate-grow-y block h-full w-full rounded-[3px] bg-danger-500/75 transition-colors duration-150 hover:bg-danger-500"
                  : "animate-grow-y block h-full w-full rounded-[3px] bg-success-500/60 transition-colors duration-150 hover:bg-success-500"
              }
            />
          );
          return (
            <li key={r.runId} className="min-w-0 flex-1">
              {failed && r.incidentId ? (
                <Link href={`/incidents/${r.incidentId}`} className="block h-full">
                  {cell}
                </Link>
              ) : (
                cell
              )}
            </li>
          );
        })}
      </ul>
      <div className="num mt-2 flex justify-between font-mono text-[10px] text-text-tertiary">
        <span>{formatTime(first.startTime)}</span>
        <span>{formatTime(last.startTime)}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2.5 text-xs font-medium">
        <span className="flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-success-700">
          <span className="size-2 rounded-full bg-success-500" /> Success
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1 text-danger-700">
          <span className="size-2 rounded-full bg-danger-500" /> Failed
        </span>
      </div>
    </div>
  );
}
