"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BarChart3, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardHeader } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { FailureTrend, type DayStat } from "@/components/dashboard/FailureTrend";
import { IncidentBreakdown } from "@/components/dashboard/IncidentBreakdown";
import { RunTimeline } from "@/components/dashboard/RunTimeline";
import { StatTile } from "@/components/dashboard/StatTile";
import { TopFailureTypes, type FailureTypeCount } from "@/components/dashboard/TopFailureTypes";
import { FAILURE_BY_KEY } from "@/ops/failureTypes";
import { SLA_BASELINE_MINUTES, WORKSPACE_BY_ID, inWorkspace } from "@/ops/catalog";
import { isActive } from "@/ops/derive";
import { useOps } from "@/ops/store";
import { EXECUTION_STATUS_STYLES, INCIDENT_STATUS_STYLES, SEVERITY_STYLES } from "@/ops/styles";
import type { IncidentStatus } from "@/ops/types";
import { cn, formatDate, formatDateTime, formatDuration, formatNumber, formatPercent, formatRelativeTime } from "@/lib/utils";

const int = (n: number) => formatNumber(Math.round(n));
const pct = (n: number) => formatPercent(n);
const duration = (n: number) => formatDuration(Math.round(n));

const SEVERITY_RAIL: Record<string, string> = {
  CRITICAL: "bg-danger-500",
  HIGH: "bg-danger-500/70",
  MEDIUM: "bg-warning-500/80",
  LOW: "bg-neutral-500/60",
};

export default function OverviewPage() {
  const { runs, incidents, workspace, days, today } = useOps();

  const view = useMemo(() => {
    const scopedRuns = runs.filter((r) => inWorkspace(r.pipelineId, workspace));
    const scopedIncidents = incidents.filter((i) => inWorkspace(i.pipelineId, workspace));

    const perDay = new Map<string, DayStat & { maxDuration: number; incidents: number }>();
    for (const d of days) perDay.set(d, { total: 0, failed: 0, maxDuration: 0, incidents: 0 });
    for (const r of scopedRuns) {
      const b = perDay.get(r.date);
      if (!b) continue;
      b.total += 1;
      if (r.executionStatus !== "SUCCESS") b.failed += 1;
      b.maxDuration = Math.max(b.maxDuration, r.durationMinutes);
    }
    for (const i of scopedIncidents) {
      const b = perDay.get(i.date);
      if (b) b.incidents += 1;
    }

    const todayRuns = scopedRuns.filter((r) => r.date === today).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    const failed = todayRuns.filter((r) => r.executionStatus !== "SUCCESS").length;
    const active = scopedIncidents.filter(isActive);

    const byStatus: Partial<Record<IncidentStatus, number>> = {};
    const byType = new Map<string, number>();
    for (const i of scopedIncidents) {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      byType.set(i.failureKey, (byType.get(i.failureKey) ?? 0) + 1);
    }
    const topTypes: FailureTypeCount[] = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => {
        const def = FAILURE_BY_KEY[key as keyof typeof FAILURE_BY_KEY];
        return { key, label: def.label, count, auto: def.autoRun };
      });

    const series = days.map((d) => perDay.get(d)!);
    return {
      perDay,
      total: todayRuns.length,
      failed,
      successRate: todayRuns.length ? ((todayRuns.length - failed) / todayRuns.length) * 100 : 0,
      maxDuration: todayRuns.reduce((m, r) => Math.max(m, r.durationMinutes), 0),
      activeCount: active.length,
      attention: [...active].sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1)).slice(0, 6),
      recent: [...todayRuns].reverse().slice(0, 6),
      todayRuns,
      byStatus,
      topTypes,
      incidentCount: scopedIncidents.length,
      trends: {
        failed: series.map((s) => s.failed),
        success: series.map((s) => (s.total ? ((s.total - s.failed) / s.total) * 100 : 0)),
        duration: series.map((s) => s.maxDuration),
        incidents: series.map((s) => s.incidents),
      },
    };
  }, [runs, incidents, workspace, days, today]);

  const incidentById = useMemo(() => new Map(incidents.map((i) => [i.id, i])), [incidents]);
  const [now] = useState(() => new Date());

  return (
    <div className="flex flex-col pb-10">
      <PageHeader title="Pipeline overview" description={`${WORKSPACE_BY_ID[workspace].name} · ${formatDate(`${today}T00:00:00Z`)} (UTC) · health, incidents and remediation across the last ${days.length} days.`} />

      <div className="flex flex-col gap-4 p-4 sm:px-8 sm:pt-6">
        <section aria-label="Key metrics" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5 [&>*]:min-w-44 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:min-w-0">
          <StatTile index={0} label="Total pipeline runs" value={<AnimatedNumber value={view.total} format={int} />} supporting="runs today" tone="neutral" split={{ good: view.total - view.failed, bad: view.failed }} />
          <StatTile index={1} label="Failed pipeline runs" value={<AnimatedNumber value={view.failed} format={int} />} supporting="failures today" tone="danger" trend={view.trends.failed} />
          <StatTile index={2} label="Pipeline success rate" value={<AnimatedNumber value={view.successRate} format={pct} />} supporting={`${view.total - view.failed} of ${view.total} runs succeeded`} tone="success" ring={view.successRate} />
          <StatTile index={3} label="Max pipeline run duration" value={<AnimatedNumber value={view.maxDuration} format={duration} />} supporting={`SLA baseline: ${SLA_BASELINE_MINUTES} min`} tone="warning" trend={view.trends.duration} />
          <StatTile index={4} label="Active incidents" value={<AnimatedNumber value={view.activeCount} format={int} />} supporting="open, across all days" tone="accent" trend={view.trends.incidents} />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="animate-rise xl:col-span-8">
            <CardHeader title="Run activity" description="Each cell is one run today; failed runs open their incident." />
            <div className="space-y-4 px-5 py-5">
              <RunTimeline runs={view.todayRuns} />
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-success-50 text-success-600">
                      <BarChart3 className="size-3.5" />
                    </span>
                    Daily outcome, last {days.length} days
                  </p>
                  <p className="num flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1 text-xs font-medium text-danger-700">
                    <AlertTriangle className="size-3.5" />
                    {formatNumber(view.incidentCount)} incidents in window
                  </p>
                </div>
                <FailureTrend days={days} stats={view.perDay} today={today} />
              </div>
            </div>
          </Card>

          <Card className="animate-rise xl:col-span-4">
            <CardHeader title="Incident pipeline" description="Where every incident in the window stands." />
            <div className="px-5 py-5">
              <div className="mb-5 flex items-end justify-between">
                <p className="text-[44px] font-semibold leading-none tracking-[-0.05em] text-text-primary">
                  <AnimatedNumber value={view.activeCount} format={int} />
                </p>
                <p className="pb-1 text-xs text-text-tertiary">open of {formatNumber(view.incidentCount)}</p>
              </div>
              <IncidentBreakdown counts={view.byStatus} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="animate-rise overflow-hidden xl:col-span-7">
            <CardHeader
              title="Incidents needing attention"
              description="The most recently created open incidents."
              action={
                <Link href="/incidents" className="group flex items-center gap-1 text-xs font-medium text-accent-600 transition-colors hover:text-accent-700">
                  View all <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                </Link>
              }
            />
            {view.attention.length === 0 ? (
              <EmptyState title="No open incidents" description="Every pipeline failure has been remediated or resolved." />
            ) : (
              <ul>
                {view.attention.map((i) => (
                  <li key={i.id} className="border-b border-border last:border-0">
                    <Link href={`/incidents/${i.id}`} className="group relative flex flex-wrap items-center justify-between gap-3 py-3.5 pl-6 pr-5 transition-colors hover:bg-tint-1">
                      <span className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full", SEVERITY_RAIL[i.severity])} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{i.pipeline}</p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          <span className="font-mono">{i.id}</span> · {FAILURE_BY_KEY[i.failureKey].label} · {formatRelativeTime(i.detectedAt, now)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge style={SEVERITY_STYLES[i.severity]} />
                        <StatusBadge style={INCIDENT_STATUS_STYLES[i.status]} pulse={i.status === "REMEDIATING"} />
                        <ChevronRight className="size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="animate-rise xl:col-span-5">
            <CardHeader title="Most frequent failure types" description={`Across ${formatNumber(view.incidentCount)} incidents in ${days.length} days.`} />
            <div className="px-5 py-5">{view.topTypes.length ? <TopFailureTypes rows={view.topTypes} /> : <EmptyState title="No failures" description="No incidents in this window." />}</div>
          </Card>
        </div>

        <Card className="animate-rise overflow-hidden">
          <CardHeader
            title="Recent pipeline activity"
            description="The latest runs today."
            action={
              <Link href="/pipelines" className="group flex items-center gap-1 text-xs font-medium text-accent-600 transition-colors hover:text-accent-700">
                View all runs <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
              </Link>
            }
          />
          {view.recent.length === 0 ? (
            <EmptyState title="No pipeline runs" description="There are no runs today for the selected workspace." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium text-text-tertiary">
                    <th className="px-5 py-2.5 font-medium">Pipeline</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Started</th>
                    <th className="px-4 py-2.5 font-medium">Duration</th>
                    <th className="px-4 py-2.5 font-medium">Incident</th>
                  </tr>
                </thead>
                <tbody>
                  {view.recent.map((r) => (
                    <tr key={r.runId} className="border-b border-border transition-colors last:border-0 hover:bg-tint-1">
                      <td className="px-5 py-3 font-medium text-text-primary">{r.pipeline}</td>
                      <td className="px-4 py-3">
                        <StatusBadge style={EXECUTION_STATUS_STYLES[r.executionStatus]} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDateTime(r.startTime)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDuration(r.durationMinutes)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px]">
                        {r.incidentId && incidentById.has(r.incidentId) ? (
                          <Link href={`/incidents/${r.incidentId}`} className="text-accent-600 hover:text-accent-700 hover:underline">
                            {r.incidentId}
                          </Link>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
