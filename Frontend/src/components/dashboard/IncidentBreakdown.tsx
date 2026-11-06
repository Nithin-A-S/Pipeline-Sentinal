import type { CSSProperties } from "react";
import { INCIDENT_STATUS_STYLES } from "@/ops/styles";
import type { IncidentStatus } from "@/ops/types";

const ORDER: IncidentStatus[] = ["RESOLVED", "WAITING_APPROVAL", "REMEDIATING", "FAILED", "REJECTED"];

/** Escalation pending and escalation sent are both shown as "Failed", so they share one segment. */
function countFor(counts: Partial<Record<IncidentStatus, number>>, s: IncidentStatus): number {
  if (s === "FAILED") return (counts.FAILED ?? 0) + (counts.ESCALATION_REQUIRED ?? 0) + (counts.ESCALATED ?? 0);
  return counts[s] ?? 0;
}

/** One segmented bar across every incident in the window, with a legend. */
export function IncidentBreakdown({ counts }: { counts: Partial<Record<IncidentStatus, number>> }) {
  const parts = ORDER.map((s) => ({ status: s, n: countFor(counts, s) })).filter((p) => p.n > 0);
  const total = parts.reduce((sum, p) => sum + p.n, 0);

  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Incidents by status">
        {parts.map((p, i) => (
          <div
            key={p.status}
            title={`${INCIDENT_STATUS_STYLES[p.status].label}: ${p.n}`}
            style={{ width: `${(p.n / total) * 100}%`, "--i": i } as CSSProperties}
            className={`animate-grow-x ${INCIDENT_STATUS_STYLES[p.status].dot} first:rounded-l-full last:rounded-r-full`}
          />
        ))}
      </div>
      <ul className="mt-5 space-y-2.5">
        {parts.map((p) => (
          <li key={p.status} className="flex items-center gap-2.5 text-xs">
            <span className={`size-2 rounded-sm ${INCIDENT_STATUS_STYLES[p.status].dot}`} />
            <span className="flex-1 text-text-secondary">{INCIDENT_STATUS_STYLES[p.status].label}</span>
            <span className="num font-medium text-text-primary">{p.n}</span>
            <span className="num w-9 text-right text-text-tertiary">{Math.round((p.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
