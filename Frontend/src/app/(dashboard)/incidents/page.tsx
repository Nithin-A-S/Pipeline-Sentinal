"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Segmented } from "@/components/common/Segmented";
import { SeverityLabel } from "@/components/common/SeverityLabel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardHeader } from "@/components/common/Card";
import { WORKSPACE_BY_ID, inWorkspace } from "@/ops/catalog";
import { isActive, isFailed } from "@/ops/derive";
import { FAILURE_BY_KEY, FAILURE_TYPES, type FailureKey } from "@/ops/failureTypes";
import { useOps } from "@/ops/store";
import { INCIDENT_STATUS_STYLES, SLA_STYLES } from "@/ops/styles";
import type { IncidentStatus } from "@/ops/types";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 25;

type StatusFilter = "ALL" | "ACTIVE" | IncidentStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "RESOLVED", label: "Remediated" },
  { value: "WAITING_APPROVAL", label: "Approval required" },
  { value: "FAILED", label: "Failed" },
  { value: "REJECTED", label: "Rejected" },
];

export default function IncidentsPage() {
  const router = useRouter();
  const { incidents, workspace, today } = useOps();
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [failure, setFailure] = useState<FailureKey | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const scoped = useMemo(() => incidents.filter((i) => inWorkspace(i.pipelineId, workspace)), [incidents, workspace]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((i) => (status === "ALL" ? true : status === "ACTIVE" ? isActive(i) : status === "FAILED" ? isFailed(i) : i.status === status))
      .filter((i) => failure === "ALL" || i.failureKey === failure)
      .filter((i) => !q || i.id.toLowerCase().includes(q) || i.pipeline.toLowerCase().includes(q) || FAILURE_BY_KEY[i.failureKey].label.toLowerCase().includes(q))
      .sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
  }, [scoped, status, failure, query]);

  const counts = useMemo(
    () => ({
      total: scoped.length,
      active: scoped.filter(isActive).length,
      today: scoped.filter((i) => i.date === today).length,
      resolved: scoped.filter((i) => i.status === "RESOLVED").length,
      critical: scoped.filter((i) => i.severity === "CRITICAL" && isActive(i)).length,
    }),
    [scoped, today],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Incidents"
        description={`${WORKSPACE_BY_ID[workspace].name} · Incidents detected in the last 15 days, tracked from detection through investigation to remediation.`}
      />

      <div className="flex flex-col gap-5 p-4 sm:px-8 sm:pb-10 sm:pt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "All incidents", value: counts.total },
            { label: "Created today", value: counts.today },
            { label: "Active", value: counts.active },
            { label: "Critical and active", value: counts.critical },
            { label: "Remediated", value: counts.resolved },
          ].map((c) => (
            <div key={c.label} data-spotlight className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-xs">
              <p className="text-[11px] font-medium text-text-tertiary">{c.label}</p>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.04em] text-text-primary num">{c.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Segmented
              label="Filter by status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
            <select
              value={failure}
              onChange={(e) => {
                setFailure(e.target.value as FailureKey | "ALL");
                setPage(1);
              }}
              aria-label="Filter by failure type"
              className="rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-text-secondary"
            >
              <option value="ALL">All failure types</option>
              {FAILURE_TYPES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5">
              <Search className="size-3.5 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by incident, pipeline or failure type"
                aria-label="Search incidents"
                className="w-56 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No incidents match" description="Try a different status or failure type." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle text-[11px] font-medium text-text-tertiary">
                    <th className="px-4 py-2.5">Incident</th>
                    <th className="px-4 py-2.5">Pipeline</th>
                    <th className="px-4 py-2.5">Failure Type</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Recommended Action</th>
                    <th className="px-4 py-2.5">Detected</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5">SLA</th>
                    <th className="px-4 py-2.5">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => {
                    const def = FAILURE_BY_KEY[i.failureKey];
                    return (
                      <tr
                        key={i.id}
                        tabIndex={0}
                        role="link"
                        onClick={() => router.push(`/incidents/${i.id}`)}
                        onKeyDown={(e) => e.key === "Enter" && router.push(`/incidents/${i.id}`)}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-subtle"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-medium text-text-primary">{i.id}</td>
                        <td className="px-4 py-3 text-text-primary">{i.pipeline}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{def.label}</td>
                        <td className="px-4 py-3">
                          <StatusBadge style={INCIDENT_STATUS_STYLES[i.status]} pulse={i.status === "REMEDIATING"} />
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{def.recommendationText}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDateTime(i.detectedAt)}</td>
                        <td className="px-4 py-3">
                          <SeverityLabel severity={i.severity} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{SLA_STYLES[i.slaStatus].label}</td>
                        <td className="px-4 py-3">{i.emailSent ? <Mail className="size-3.5 text-success-600" aria-label="Email sent" /> : <span className="text-text-tertiary">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-text-tertiary">
            <span>
              {filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length} incidents
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
                className="rounded-md border border-border-strong px-2.5 py-1 font-medium text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-1">
                Page {current} of {pages}
              </span>
              <button
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
                className="rounded-md border border-border-strong px-2.5 py-1 font-medium text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader title="Failure types and remediation playbook" description="How Sentinel classifies each failure type and which remediation it applies." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] font-medium text-text-tertiary">
                  <th className="px-5 py-2.5">#</th>
                  <th className="px-4 py-2.5">Failure Type</th>
                  <th className="px-4 py-2.5">Example Pipeline</th>
                  <th className="px-4 py-2.5">Recommended Action</th>
                  <th className="px-4 py-2.5">Remediation</th>
                </tr>
              </thead>
              <tbody>
                {FAILURE_TYPES.map((f) => (
                  <tr key={f.key} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-text-tertiary">{f.index}</td>
                    <td className="px-4 py-2.5 font-medium text-text-primary">
                      {f.label}
                      <span className="ml-2 font-mono text-[10px] text-text-tertiary">{f.key}</span>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{f.index % 2 === 1 ? "Material Master Processing US" : "Procurement & Sales Processing US"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{f.recommendationText}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{f.remediationLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
