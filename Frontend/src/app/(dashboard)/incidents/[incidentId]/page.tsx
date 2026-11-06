"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Circle,
  FlaskConical,
  Loader2,
  Mail,
  Rocket,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Timer,
  UserRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AuditTimeline } from "@/components/pipeline/AuditTimeline";
import { EmailModal, RemediationStartedModal } from "@/components/incident/IncidentModals";
import { COUNTRY_LABEL, SLA_BASELINE_MINUTES } from "@/ops/catalog";
import { approvalStatus, guardrailDecision, guardrailOf, remediationStatus, validationStatus } from "@/ops/derive";
import { FAILURE_BY_KEY, type FailureTypeDef } from "@/ops/failureTypes";
import { approveAndRemediate, rejectIncident, useOps, type RemediationStart } from "@/ops/store";
import { INCIDENT_STATUS_STYLES, SEVERITY_STYLES, SLA_STYLES } from "@/ops/styles";
import { fill } from "@/ops/text";
import type { Incident } from "@/ops/types";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";

type StepState = "done" | "active" | "pending" | "blocked" | "failed";
type NodeState = "done" | "current" | "pending" | "failed";

const REMEDIATION_RUN_MS = 7000;

function Kv({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className={cn("mt-1 break-words text-sm font-medium text-text-primary", mono && "font-mono text-xs")}>{children}</p>
    </div>
  );
}

function StepIcon({ state, n }: { state: StepState; n: number }) {
  if (state === "done") return <CheckCircle2 className="size-6 text-success-600" />;
  if (state === "failed") return <XCircle className="size-6 text-danger-500" />;
  if (state === "blocked") return <XCircle className="size-6 text-text-tertiary" />;
  if (state === "active")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-accent-500 text-white">
        <Loader2 className="size-3.5 animate-spin" aria-label={`Step ${n} in progress`} />
      </span>
    );
  return <span className="flex size-6 items-center justify-center rounded-full border border-border-strong bg-surface text-[11px] font-semibold text-text-tertiary">{n}</span>;
}

function Step({
  n,
  icon: Icon,
  title,
  state,
  summary,
  defaultOpen,
  last,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  state: StepState;
  summary: string;
  defaultOpen: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="relative flex gap-4">
      {!last && <span className="absolute left-3 top-8 h-[calc(100%-16px)] w-px bg-border" aria-hidden />}
      <div className="relative z-10 shrink-0 bg-surface pt-1">
        <StepIcon state={state} n={n} />
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-subtle">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Icon className="size-3.5 text-text-tertiary" />
              {title}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">{summary}</p>
          </div>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} />
        </button>
        {open && <div className="mt-2 rounded-lg border border-border bg-surface-subtle p-4 text-sm">{children}</div>}
      </div>
    </li>
  );
}

type ItemState = "done" | "active" | "failed" | "pending";

function Checklist({ items }: { items: { text: string; state: ItemState }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2.5 text-sm">
          {item.state === "done" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" />
          ) : item.state === "active" ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-accent-500" />
          ) : item.state === "failed" ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-danger-500" />
          ) : (
            <Circle className="mt-0.5 size-4 shrink-0 text-border-strong" />
          )}
          <span className={cn("flex-1", item.state === "pending" ? "text-text-tertiary" : item.state === "failed" ? "text-danger-700" : "text-text-primary")}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

interface FlowNode {
  label: string;
  state: NodeState;
}

/**
 * The remediation flow for this incident. Steps still to come (or in progress) are
 * grey, completed steps are green, and a failed remediation is red.
 */
function flowFor(i: Incident, def: FailureTypeDef): { nodes: FlowNode[]; hint: string | null } {
  const st = i.status;
  const n = (label: string, state: NodeState): FlowNode => ({ label, state });
  const nodes: FlowNode[] = [n("Incident created", "done")];
  let hint: string | null = null;
  const failedHint = "If the remediation fails, the incident is marked Failed and you send the escalation mail to the pipeline owner.";

  const remediation = () => {
    if (st === "REMEDIATING") {
      nodes.push(n("Remediation", "current"));
      hint = failedHint;
    } else if (i.remediationFailed) {
      nodes.push(n("Failed", "failed"));
      if (st === "ESCALATION_REQUIRED") hint = "Send the escalation mail to the pipeline owner.";
      if (st === "RESOLVED") nodes.push(n("Remediated by owner", "done"));
    } else if (st === "RESOLVED") {
      nodes.push(n("Remediated", "done"));
    } else {
      nodes.push(n("Remediation", "pending"));
      hint = failedHint;
    }
  };

  if (def.autoRun) {
    remediation();
  } else if (!def.autoRemediable) {
    nodes.push(n("Failed", "failed"));
    if (st === "ESCALATION_REQUIRED") hint = "AI cannot remediate this failure. Send the escalation mail to the pipeline owner.";
    nodes.push(n(st === "RESOLVED" ? "Remediated by owner" : "Remediation", st === "RESOLVED" ? "done" : "pending"));
  } else if (st === "WAITING_APPROVAL") {
    nodes.push(n("Waiting for approval", "current"), n("Remediation", "pending"));
    hint = "Approval required — approve to start the remediation, or reject to close this incident.";
  } else if (st === "REJECTED") {
    nodes.push(n("Rejected", "failed"));
  } else {
    nodes.push(n("Approved", "done"));
    remediation();
  }
  return { nodes, hint };
}

const NODE_STYLE: Record<NodeState, string> = {
  done: "border-success-500/40 bg-success-50 text-success-700",
  current: "border-border-strong bg-surface-muted text-text-tertiary",
  pending: "border-border bg-surface text-text-tertiary",
  failed: "border-danger-500/40 bg-danger-50 text-danger-700",
};

function FlowTrail({ incident, def }: { incident: Incident; def: FailureTypeDef }) {
  const { nodes, hint } = flowFor(incident, def);
  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-medium text-text-tertiary">Remediation flow</p>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Remediation flow">
        {nodes.map((node, idx) => (
          <li key={`${node.label}-${idx}`} className="flex items-center gap-1.5">
            <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", NODE_STYLE[node.state])}>
              {node.state === "current" && <span className="size-1.5 animate-pulse rounded-full bg-text-tertiary" />}
              {node.state === "done" && <CheckCircle2 className="size-3" />}
              {node.state === "failed" && <XCircle className="size-3" />}
              {node.label}
            </span>
            {idx < nodes.length - 1 && <ArrowRight className="size-3 text-text-tertiary" />}
          </li>
        ))}
      </ol>
      {hint && <p className="mt-2 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}

export default function IncidentDetailPage() {
  const params = useParams<{ incidentId: string }>();
  const router = useRouter();
  const { incidents, notifications } = useOps();
  const incident: Incident | undefined = useMemo(() => incidents.find((i) => i.id === decodeURIComponent(params.incidentId)), [incidents, params.incidentId]);

  const [modal, setModal] = useState<"email" | "reject" | null>(null);
  const [started, setStarted] = useState<RemediationStart | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const remediating = incident?.status === "REMEDIATING";
  useEffect(() => {
    if (!remediating) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 600);
    return () => clearInterval(t);
  }, [remediating]);

  if (!incident) {
    return (
      <EmptyState
        title="Incident not found"
        description={`No incident matches the ID "${decodeURIComponent(params.incidentId)}".`}
        className="py-24"
        action={
          <button onClick={() => router.push("/incidents")} className="text-xs font-medium text-accent-600 hover:text-accent-700">
            Back to all incidents
          </button>
        }
      />
    );
  }

  const def = FAILURE_BY_KEY[incident.failureKey];
  const ctx = { pipeline: incident.pipeline, country: incident.country };
  const emails = notifications.filter((n) => n.incidentId === incident.id);
  const status = incident.status;
  const failed = incident.remediationFailed;
  const canApprove = status === "WAITING_APPROVAL" && def.autoRemediable && !def.autoRun;
  const canReject = canApprove;
  const mustEscalate = status === "ESCALATION_REQUIRED";

  /* ---- remediation checklist ---- */
  const remTexts = def.remediationSteps.map((s) => fill(s, ctx));
  let remItems: { text: string; state: ItemState }[];

  if (!def.autoRemediable) {
    const escalateIdx = remTexts.length - 1;
    remItems = remTexts.map((text, idx) => {
      const isEmail = idx === escalateIdx;
      const sent = status === "ESCALATED" || status === "RESOLVED";
      return { text, state: isEmail ? (sent ? "done" : "pending") : "done" };
    });
  } else {
    const failIdx = Math.max(1, remTexts.length - 2);
    remItems = remTexts.map((text, idx) => {
      let state: ItemState = "pending";
      if (status === "RESOLVED" && !failed) state = "done";
      else if (status === "REMEDIATING") {
        const elapsed = now && incident.remediationStartedAt ? Math.max(0, now - Date.parse(incident.remediationStartedAt)) : 0;
        const at = Math.min(remTexts.length - 1, Math.floor((elapsed / REMEDIATION_RUN_MS) * remTexts.length));
        state = idx < at ? "done" : idx === at ? "active" : "pending";
      } else if (failed) state = idx < failIdx ? "done" : idx === failIdx ? "failed" : "pending";
      return { text, state };
    });
    if (failed) {
      const sent = status === "ESCALATED" || status === "RESOLVED";
      remItems.push({ text: "Escalate to the pipeline owner and send the email", state: sent ? "done" : "pending" });
    }
  }

  const remState: StepState = failed ? "failed" : status === "RESOLVED" ? "done" : status === "REJECTED" ? "blocked" : status === "REMEDIATING" ? "active" : !def.autoRemediable && status !== "ESCALATION_REQUIRED" ? "done" : "active";
  const validationState: StepState = status === "RESOLVED" && !failed ? "done" : failed ? (status === "RESOLVED" ? "done" : "blocked") : status === "REMEDIATING" ? "active" : status === "REJECTED" ? "blocked" : !def.autoRemediable && status === "RESOLVED" ? "done" : "pending";
  const remSummary =
    status === "WAITING_APPROVAL"
      ? `Waiting for your approval — ${def.remediationLabel.toLowerCase()}`
      : status === "REMEDIATING"
        ? def.autoRun
          ? "Sentinel is remediating automatically"
          : "Running in Databricks"
        : status === "FAILED"
          ? "The remediation failed"
          : status === "ESCALATION_REQUIRED"
            ? failed
              ? "Failed — send the escalation mail to the pipeline owner"
              : "Failed — AI cannot remediate this; send the escalation mail to the pipeline owner"
            : status === "ESCALATED"
              ? "Failed — the pipeline owner has been emailed"
              : status === "RESOLVED"
                ? failed
                  ? "Failed — remediated by the pipeline owner"
                  : def.autoRun
                    ? `Remediated automatically — ${def.remediationLabel.toLowerCase()} completed`
                    : !def.autoRemediable
                      ? "Remediated by the pipeline owner"
                      : `Remediated — ${def.remediationLabel.toLowerCase()} completed`
                : "Rejected — no action was taken";

  const slaGap = incident.durationMinutes - SLA_BASELINE_MINUTES;
  const scaleMax = Math.max(incident.durationMinutes, SLA_BASELINE_MINUTES) * 1.2;
  const closed = status === "RESOLVED";

  const statusNote: Record<Incident["status"], string> = {
    WAITING_APPROVAL: "Approval required. Approve to start the remediation, or reject to close this incident.",
    REMEDIATING: def.autoRun ? "Sentinel is remediating this automatically. No approval is needed." : "The remediation is running in Databricks.",
    FAILED: "The remediation failed. Send the escalation mail to the pipeline owner.",
    ESCALATION_REQUIRED: failed ? "The remediation failed. Send the escalation mail to the pipeline owner." : "AI cannot remediate this failure. Send the escalation mail to the pipeline owner.",
    ESCALATED: "Failed. The pipeline owner has been emailed and is working on the fix.",
    RESOLVED: def.autoRun && !failed ? "Remediated automatically. No approval was needed." : failed ? "Remediated after the pipeline owner fixed the issue." : "This incident is remediated.",
    REJECTED: "The remediation was rejected, so no action was taken.",
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        title={<span className="font-mono text-lg">{incident.id}</span>}
        breadcrumbs={[{ label: "Incidents", href: "/incidents" }, { label: incident.id }]}
        badge={<StatusBadge style={INCIDENT_STATUS_STYLES[status]} size="md" pulse={status === "REMEDIATING"} />}
        actions={
          <button
            onClick={() => router.push("/incidents")}
            className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted"
          >
            <ArrowLeft className="size-3.5" />
            All incidents
          </button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:px-8 sm:pb-10 sm:pt-6">
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs" aria-label="Incident summary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border p-5 sm:grid-cols-3">
            <Kv label="Pipeline">{incident.pipeline}</Kv>
            <Kv label="Country">{COUNTRY_LABEL[incident.country]}</Kv>
            <Kv label="Failure type">{def.label}</Kv>
            <Kv label="Severity">
              <StatusBadge style={SEVERITY_STYLES[incident.severity]} />
            </Kv>
            <Kv label="Status">
              <StatusBadge style={INCIDENT_STATUS_STYLES[status]} pulse={status === "REMEDIATING"} />
            </Kv>
            <Kv label="Responsible person">{incident.owner.name}</Kv>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <p className="text-[11px] font-medium text-text-tertiary">Error</p>
              <p className="mt-1 text-sm text-text-primary">{def.errorMessage}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-tertiary">Recommended action</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{def.recommendationText}</p>
              <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">{def.recommendation}</p>
            </div>

            {def.change && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
                  <p className="text-[11px] font-medium text-text-tertiary">Current {def.change.label}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{def.change.current}</p>
                </div>
                <div className="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3">
                  <p className="text-[11px] font-medium text-success-700">Recommended {def.change.label}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{def.change.recommended}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
              {canApprove && (
                <Button
                  onClick={() => {
                    const info = approveAndRemediate(incident.id);
                    if (info) setStarted(info);
                  }}
                >
                  <ThumbsUp className="size-3.5" />
                  Approve and remediate
                </Button>
              )}
              {canReject && (
                <Button variant="secondary" onClick={() => setModal("reject")}>
                  <ThumbsDown className="size-3.5" />
                  Reject
                </Button>
              )}
              <Button variant={mustEscalate ? "primary" : "secondary"} onClick={() => setModal("email")}>
                <Mail className="size-3.5" />
                {mustEscalate ? "Escalate and send email" : incident.emailSent ? "Send another email" : "Send email"}
              </Button>
            </div>
            <p className="text-xs text-text-tertiary">{statusNote[status]}</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-xs" aria-label="Incident workflow">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-text-primary">Incident workflow</h2>
          <ol>
            <Step n={1} icon={AlertCircle} title="Incident created" state="done" summary={`Failure detected on ${formatDateTime(incident.detectedAt)} UTC, run ${incident.runId}`} defaultOpen>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Kv label="Incident ID" mono>
                  {incident.id}
                </Kv>
                <Kv label="Run ID" mono>
                  {incident.runId}
                </Kv>
                <Kv label="Job ID" mono>
                  {incident.jobId}
                </Kv>
                <Kv label="Detected">{formatDateTime(incident.detectedAt)} UTC</Kv>
                <Kv label="Execution status">{incident.executionStatus === "TIMEDOUT" ? "Timed out" : "Failed"}</Kv>
                <Kv label="Error code" mono>
                  {def.errorCode}
                </Kv>
              </div>
            </Step>

            <Step n={2} icon={BrainCircuit} title="AI investigation" state="done" summary={def.rootCause} defaultOpen>
              <p className="text-[11px] font-medium text-text-tertiary">What the AI checked</p>
              <div className="mt-2">
                <Checklist items={def.analysisSteps.map((text) => ({ text, state: "done" as const }))} />
              </div>
              <p className="mt-4 text-[11px] font-medium text-text-tertiary">Findings</p>
              <ul className="mt-2 space-y-1.5">
                {def.investigation.map((f, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-text-secondary">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-text-tertiary" />
                    {fill(f, ctx)}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary">
                <span className="font-semibold">Root cause: </span>
                {def.rootCause}
              </p>
            </Step>

            <Step n={3} icon={ShieldAlert} title="Failure type identified" state="done" summary={`${def.label} — ${def.recommendationText}`} defaultOpen>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Kv label="Failure type">{def.label}</Kv>
                <Kv label="Classification code" mono>
                  {def.key}
                </Kv>
                <Kv label="Severity">{SEVERITY_STYLES[incident.severity].label}</Kv>
                <Kv label="Guardrail" mono>
                  {guardrailOf(incident)}
                </Kv>
                <Kv label="Guardrail decision" mono>
                  {guardrailDecision(incident)}
                </Kv>
                <Kv label="Recommended action" mono>
                  {def.recommendation}
                </Kv>
              </div>
              <p className="mt-3 text-xs text-text-tertiary">
                {def.autoRun
                  ? "This failure type is safe to rerun, so Sentinel remediates it automatically without approval."
                  : def.autoRemediable
                    ? "This failure type has an approved, reversible remediation. Sentinel runs it after a person approves."
                    : "This failure type has no safe automated remediation, so it is escalated to a person."}
              </p>
            </Step>

            <Step
              n={4}
              icon={Timer}
              title="SLA check"
              state="done"
              summary={incident.slaStatus === "CRITICAL" ? `Critical — ${slaGap} min over the ${SLA_BASELINE_MINUTES} min baseline` : `Safe — within the ${SLA_BASELINE_MINUTES} min baseline`}
              defaultOpen
            >
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <Kv label="Average runtime (baseline)">{SLA_BASELINE_MINUTES} min</Kv>
                <Kv label="Actual runtime">{formatDuration(incident.durationMinutes)}</Kv>
                <Kv label="SLA status">
                  <StatusBadge style={SLA_STYLES[incident.slaStatus]} />
                </Kv>
              </div>
              <div className="relative mt-4 h-2.5 rounded-full bg-surface-muted" role="img" aria-label={`Runtime ${incident.durationMinutes} minutes against a ${SLA_BASELINE_MINUTES} minute baseline`}>
                <div className={cn("h-full rounded-full", incident.slaStatus === "CRITICAL" ? "bg-danger-500" : "bg-success-500")} style={{ width: `${(incident.durationMinutes / scaleMax) * 100}%` }} />
                <div className="absolute -top-1 h-4.5 w-0.5 bg-text-primary" style={{ left: `${(SLA_BASELINE_MINUTES / scaleMax) * 100}%` }} title={`${SLA_BASELINE_MINUTES} min baseline`} />
              </div>
              <p className="mt-2 text-xs text-text-tertiary">
                {incident.slaStatus === "CRITICAL"
                  ? `The run took ${slaGap} minutes longer than the ${SLA_BASELINE_MINUTES}-minute average, so this incident is marked critical.`
                  : `The run finished ${SLA_BASELINE_MINUTES - incident.durationMinutes} minutes faster than the ${SLA_BASELINE_MINUTES}-minute average, so the SLA is safe.`}
              </p>
            </Step>

            <Step n={5} icon={Wrench} title="Remediation" state={remState} summary={remSummary} defaultOpen>
              <FlowTrail incident={incident} def={def} />

              {!def.autoRemediable ? (
                <div className="mb-4 flex gap-2.5 rounded-lg border border-warning-500/30 bg-warning-50 px-3.5 py-3 text-sm text-warning-700">
                  <UserRound className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <span className="font-semibold">AI cannot perform this remediation.</span> {def.aiLimit}
                  </p>
                </div>
              ) : null}

              <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Kv label="Approval" mono>
                  {approvalStatus(incident)}
                </Kv>
                <Kv label="Remediation" mono>
                  {remediationStatus(incident)}
                </Kv>
                <Kv label={def.autoRun ? "Authorized by" : "Approved by"}>{incident.approvedBy ?? "—"}</Kv>
                <Kv label="Remediation run" mono>
                  {incident.remediationRunId ?? "—"}
                </Kv>
              </div>
              <Checklist items={remItems} />
              {def.change && (
                <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
                  {def.change.label}: <span className="font-medium text-text-primary">{def.change.current}</span> <ArrowRight className="mx-1 inline size-3" /> <span className="font-medium text-text-primary">{def.change.recommended}</span>
                </p>
              )}
              {failed && (
                <p className="mt-3 rounded-lg border border-danger-500/25 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                  The rerun did not complete successfully (result state FAILED), so the remediation could not be validated and the incident goes to the pipeline owner.
                </p>
              )}
            </Step>

            <Step
              n={6}
              icon={Rocket}
              title="Validation"
              state={validationState}
              summary={
                closed && !failed
                  ? "Passed — the pipeline recovered"
                  : closed
                    ? "Confirmed after the owner's manual fix"
                    : failed
                      ? "Not possible — the remediation failed"
                      : status === "REMEDIATING"
                        ? "Validating the new run…"
                        : status === "REJECTED"
                          ? "Skipped — the remediation was rejected"
                          : "Waiting for the remediation to finish"
              }
              defaultOpen={closed || status === "REMEDIATING"}
            >
              <p className="mb-2 text-xs text-text-tertiary">
                Validation status: <span className="font-mono">{validationStatus(incident)}</span>
              </p>
              <Checklist items={def.validation.map((text) => ({ text, state: closed ? ("done" as const) : status === "REMEDIATING" ? ("active" as const) : ("pending" as const) }))} />
            </Step>

            <Step
              n={7}
              icon={Mail}
              title="Notification and escalation"
              state={emails.length > 0 ? "done" : mustEscalate ? "active" : "pending"}
              summary={emails.length > 0 ? `${emails.length} email${emails.length > 1 ? "s" : ""} sent to ${incident.owner.name}` : mustEscalate ? "Failed — send the escalation mail to the pipeline owner" : "No email has been sent yet"}
              defaultOpen={emails.length > 0 || mustEscalate}
            >
              {emails.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-text-secondary">
                    {incident.owner.name} has not been emailed yet. The email, including the reason and the recommended solution, is generated automatically.
                  </p>
                  <Button size="sm" onClick={() => setModal("email")}>
                    <Mail className="size-3.5" />
                    {mustEscalate ? "Escalate and send email" : "Send email"}
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {emails.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{n.subject}</p>
                        <p className="text-xs text-text-tertiary">
                          {n.kind} · {n.recipient.name} · {formatDateTime(n.sentAt)} UTC
                        </p>
                      </div>
                      <Link href={`/notifications/${n.id}`} className="text-xs font-medium text-accent-600 hover:text-accent-700">
                        View email
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Step>

            <Step
              n={8}
              icon={FlaskConical}
              title="Regression test suite"
              state={closed ? "done" : "pending"}
              summary={closed ? `REG-${incident.id} was added to the CI/CD test suite` : "Added to the CI/CD test suite when the incident is resolved"}
              defaultOpen={closed}
              last
            >
              <div className="divide-y divide-border rounded-lg border border-border bg-surface">
                {[
                  ["Test ID", `REG-${incident.id}`],
                  ["Scenario", def.regression.scenario],
                  ["Expected behavior", def.regression.expectedBehavior],
                  ["Expected classification", `${def.label} (${def.key})`],
                  ["Expected workflow", def.regression.expectedWorkflow],
                  ["Expected remediation", `${def.recommendationText} (${def.recommendation})`],
                  ["Expected final state", def.autoRun ? "Remediated automatically, with validation passed" : def.autoRemediable ? "Remediated, with validation passed" : "Failed, then remediated by the pipeline owner"],
                  ["Current state", closed ? `Resolved on ${formatDateTime(incident.resolvedAt)} UTC` : INCIDENT_STATUS_STYLES[status].label],
                ].map(([label, value]) => (
                  <div key={label} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[11rem_1fr]">
                    <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
                    <p className="text-sm text-text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </Step>
          </ol>
        </section>

        <AuditTimeline events={incident.audit} />
      </div>

      <EmailModal incident={incident} escalating={mustEscalate} open={modal === "email"} onClose={() => setModal(null)} />
      <RemediationStartedModal info={started} onClose={() => setStarted(null)} />
      <Modal
        open={modal === "reject"}
        onClose={() => setModal(null)}
        title="Reject the remediation"
        description="No action will be taken on this pipeline, and the incident will be closed as rejected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                rejectIncident(incident.id);
                setModal(null);
              }}
            >
              Confirm rejection
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Do you want to reject the recommended action <strong className="text-text-primary">{def.recommendationText.toLowerCase()}</strong> for <strong className="text-text-primary">{incident.pipeline}</strong>?
        </p>
      </Modal>
    </div>
  );
}
