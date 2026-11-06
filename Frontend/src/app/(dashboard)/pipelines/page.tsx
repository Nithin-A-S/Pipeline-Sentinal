"use client";

import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Segmented } from "@/components/common/Segmented";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { PIPELINE_BY_ID, WORKSPACE_BY_ID, inWorkspace } from "@/ops/catalog";
import { approvalStatus, overallStatus, remediationStatus, validationStatus } from "@/ops/derive";
import { FAILURE_BY_KEY, FAILURE_TYPES, type FailureKey } from "@/ops/failureTypes";
import { DateRangePicker, type DateRange } from "@/components/pipeline/DateRangePicker";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import { useOps } from "@/ops/store";
import { DQ_STYLES, EXECUTION_STATUS_STYLES, INCIDENT_STATUS_STYLES, SLA_STYLES } from "@/ops/styles";
import type { Incident, PipelineRun } from "@/ops/types";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";

type StatusFilter = "ALL" | "SUCCESS" | "FAILED";

const ROW_HEIGHT = 56;

interface Column {
  label: string;
  render: (r: PipelineRun, i: Incident | undefined) => ReactNode;
}

const mono = (v: string) => <span className="font-mono text-[11px] text-text-secondary">{v}</span>;
const dash = <span className="text-text-tertiary">—</span>;

const COLUMNS: Column[] = [
  { label: "Pipeline", render: (r) => <span className="font-medium text-text-primary">{r.pipeline}</span> },
  { label: "Responsible person", render: (r) => <span className="font-medium text-text-primary">{PIPELINE_BY_ID[r.pipelineId]?.owner.name ?? "—"}</span> },
  { label: "Job ID", render: (r) => mono(r.jobId) },
  { label: "Duration", render: (r) => <span className="text-text-secondary">{formatDuration(r.durationMinutes)}</span> },
  { label: "Execution status", render: (r) => <StatusBadge style={EXECUTION_STATUS_STYLES[r.executionStatus]} /> },
  {
    label: "Incident ID",
    render: (r, i) =>
      i ? (
        <Link href={`/incidents/${i.id}`} className="font-mono text-[11px] text-accent-600 hover:text-accent-700 hover:underline">
          {i.id}
        </Link>
      ) : (
        dash
      ),
  },
  {
    label: "Recommended action",
    render: (_, i) => {
      if (!i) return dash;
      const def = FAILURE_BY_KEY[i.failureKey];
      return (
        <div className="min-w-56">
          {def.autoRun ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 ring-1 ring-inset ring-success-500/20">
              <Bot className="size-3" />
              Auto Remediable
            </span>
          ) : (
            <p className="font-medium text-text-primary">{def.recommendationText}</p>
          )}
          <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">{def.recommendation}</p>
        </div>
      );
    },
  },
  { label: "Incident status", render: (_, i) => (i ? <StatusBadge style={INCIDENT_STATUS_STYLES[i.status]} pulse={i.status === "REMEDIATING"} /> : dash) },
  { label: "Start time", render: (r) => <span className="text-text-secondary">{formatDateTime(r.startTime)}</span> },
  { label: "End time", render: (r) => <span className="text-text-secondary">{formatDateTime(r.endTime)}</span> },
  { label: "Detected at", render: (r) => <span className="text-text-secondary">{formatDateTime(r.detectedAt)}</span> },
  { label: "Approval status", render: (_, i) => (i ? mono(approvalStatus(i)) : dash) },
  { label: "Remediation status", render: (_, i) => (i ? mono(remediationStatus(i)) : dash) },
  { label: "DQ status", render: (r) => <StatusBadge style={DQ_STYLES[r.dqStatus]} /> },
  { label: "SLA status", render: (r) => <StatusBadge style={SLA_STYLES[r.slaStatus]} /> },
  { label: "Validation status", render: (_, i) => (i ? mono(validationStatus(i)) : dash) },
  { label: "Issue type", render: (_, i) => (i ? <span className="font-medium text-text-primary">{FAILURE_BY_KEY[i.failureKey].label}</span> : dash) },
  { label: "Criticality", render: (_, i) => (i ? mono(i.severity) : dash) },
  { label: "Overall status", render: (r, i) => mono(overallStatus(r, i)) },
];

/** Opaque so scrolling cells never show through the pinned first column. */
const PINNED = "sticky left-0 z-10 bg-surface group-hover:bg-surface-hover";

const RunRow = memo(function RunRow({ run, incident }: { run: PipelineRun; incident: Incident | undefined }) {
  const failed = run.executionStatus !== "SUCCESS";
  return (
    <tr style={{ height: ROW_HEIGHT }} className="group border-b border-border transition-colors hover:bg-tint-1">
      {COLUMNS.map((c, idx) => (
        <td key={c.label} className={cn("whitespace-nowrap px-4", idx === 0 && [PINNED, failed && "shadow-[inset_3px_0_0_var(--color-danger-500)]"])}>
          {c.render(run, incident)}
        </td>
      ))}
    </tr>
  );
});

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function rangeLabel({ from, to }: DateRange): string {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
}

export default function PipelinesPage() {
  const { runs, incidents, workspace, days, today } = useOps();
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [failure, setFailure] = useState<FailureKey | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const incidentById = useMemo(() => new Map(incidents.map((i) => [i.id, i])), [incidents]);
  const scoped = useMemo(() => runs.filter((r) => inWorkspace(r.pipelineId, workspace)), [runs, workspace]);

  const dayRuns = useMemo(() => scoped.filter((r) => r.date >= range.from && r.date <= range.to), [scoped, range]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dayRuns
      .filter((r) => (status === "ALL" ? true : status === "SUCCESS" ? r.executionStatus === "SUCCESS" : r.executionStatus !== "SUCCESS"))
      .filter((r) => (failure === "ALL" ? true : incidentById.get(r.incidentId ?? "")?.failureKey === failure))
      .filter((r) => !q || r.pipeline.toLowerCase().includes(q) || (r.incidentId ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
  }, [dayRuns, status, failure, query, incidentById]);

  // Demo ordering: lead with up to 2 resolved incidents, then up to 2 waiting for approval, then everything else by time.
  const ordered = useMemo(() => {
    const statusOf = (r: PipelineRun) => incidentById.get(r.incidentId ?? "")?.status;
    const resolved = rows.filter((r) => statusOf(r) === "RESOLVED").slice(0, 2);
    const waiting = rows.filter((r) => statusOf(r) === "WAITING_APPROVAL").slice(0, 2);
    const lead = new Set([...resolved, ...waiting]);
    return [...resolved, ...waiting, ...rows.filter((r) => !lead.has(r))];
  }, [rows, incidentById]);

  const stats = useMemo(() => {
    const failed = dayRuns.filter((r) => r.executionStatus !== "SUCCESS").length;
    return { total: dayRuns.length, failed, success: dayRuns.length - failed, critical: dayRuns.filter((r) => r.slaStatus === "CRITICAL").length };
  }, [dayRuns]);

  // Only the rows near the viewport are in the DOM, so a 15-day range (600 rows) scrolls as smoothly as a single day.
  const scrollRef = useRef<HTMLDivElement>(null);
  const { start, end, onScroll } = useVirtualRows(scrollRef, ordered.length, ROW_HEIGHT, 8);
  const visible = ordered.slice(start, end);
  const resetScroll = useCallback(() => scrollRef.current?.scrollTo({ top: 0 }), []);

  return (
    <div className="flex flex-col pb-6">
      <PageHeader title="Pipeline runs" description={`${WORKSPACE_BY_ID[workspace].name} — every pipeline run for the last ${days.length} days, with its incident, SLA and remediation status.`} />

      <div className="flex flex-col gap-4 p-4 sm:px-8 sm:pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker
            days={days}
            today={today}
            value={range}
            onChange={(r) => {
              setRange(r);
              resetScroll();
            }}
          />
          <div className="num flex items-center gap-4 text-xs text-text-secondary">
            <span>
              <strong className="text-text-primary">{stats.total}</strong> runs
            </span>
            <span>
              <strong className="text-success-600">{stats.success}</strong> success
            </span>
            <span>
              <strong className="text-danger-600">{stats.failed}</strong> failed
            </span>
            <span>
              <strong className="text-danger-600">{stats.critical}</strong> SLA critical
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Segmented
              label="Filter by execution status"
              value={status}
              options={[
                { value: "ALL", label: "All" },
                { value: "SUCCESS", label: "Success" },
                { value: "FAILED", label: "Failed" },
              ]}
              onChange={(v) => {
                setStatus(v);
                resetScroll();
              }}
            />
            <select
              value={failure}
              onChange={(e) => {
                setFailure(e.target.value as FailureKey | "ALL");
                resetScroll();
              }}
              aria-label="Filter by failure type"
              className="h-8 rounded-lg border border-border bg-surface-sunken px-2.5 text-xs text-text-secondary transition-colors hover:border-border-strong"
            >
              <option value="ALL">All failure types</option>
              {FAILURE_TYPES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface-sunken px-2.5 transition-colors focus-within:border-border-strong hover:border-border-strong">
              <Search className="size-3.5 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetScroll();
                }}
                placeholder="Search pipeline or incident"
                aria-label="Search runs"
                className="w-52 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {rows.length === 0 ? (
            <EmptyState title="No runs match" description="Try a different date range, status or failure type." />
          ) : (
            <div ref={scrollRef} onScroll={onScroll} className="h-[calc(100dvh-300px)] min-h-72 overflow-auto">
              <table className="w-max min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-border bg-surface">
                    {COLUMNS.map((c, idx) => (
                      <th key={c.label} className={cn("whitespace-nowrap bg-surface px-4 py-3 text-[11px] font-medium text-text-tertiary", idx === 0 && "sticky left-0 z-30")}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {start > 0 && (
                    <tr aria-hidden="true" style={{ height: start * ROW_HEIGHT }}>
                      <td colSpan={COLUMNS.length} />
                    </tr>
                  )}
                  {visible.map((r) => (
                    <RunRow key={r.runId} run={r} incident={r.incidentId ? incidentById.get(r.incidentId) : undefined} />
                  ))}
                  {end < ordered.length && (
                    <tr aria-hidden="true" style={{ height: (ordered.length - end) * ROW_HEIGHT }}>
                      <td colSpan={COLUMNS.length} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="num text-[11px] text-text-tertiary">
          Showing {rows.length} of {stats.total} runs for {rangeLabel(range)}. All times are in UTC.
        </p>
      </div>
    </div>
  );
}
