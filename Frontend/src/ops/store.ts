"use client";

import { useSyncExternalStore } from "react";
import { WORKSPACES, type WorkspaceId } from "./catalog";
import { generateDataset } from "./data";
import { buildEmail } from "./email";
import { FAILURE_BY_KEY } from "./failureTypes";
import type { AppNotification, AuditEvent, Incident, PipelineRun } from "./types";

export interface OpsState {
  /** False on the server and during hydration: the demo data is built on the client so "today" is the viewer's current date. */
  ready: boolean;
  today: string;
  days: string[];
  workspace: WorkspaceId;
  incidents: Incident[];
  notifications: AppNotification[];
  runs: PipelineRun[];
}

/** The signed-in demo user — recorded as the approver / sender on actions. */
export const CURRENT_USER = "Sentinel Operator";

/** How long an approved remediation runs in "Databricks" before it succeeds or fails. */
const REMEDIATION_MS = 7000;
/** How long a failed remediation is shown as "failed" before it is escalated. */
const FAILED_VISIBLE_MS = 2500;

const SERVER_STATE: OpsState = { ready: false, today: "", days: [], workspace: "all", incidents: [], notifications: [], runs: [] };

let state: OpsState | null = null;
const listeners = new Set<() => void>();
let counter = 0;

function current(): OpsState {
  if (!state) {
    const data = generateDataset(Date.now());
    state = { ready: true, workspace: "all", ...data };
  }
  return state;
}

function set(next: Partial<OpsState>) {
  state = { ...current(), ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useOps(): OpsState {
  return useSyncExternalStore(subscribe, current, () => SERVER_STATE);
}

export function setWorkspace(id: WorkspaceId) {
  if (WORKSPACES.some((w) => w.id === id)) set({ workspace: id });
}

/**
 * Live action timestamps: stamped no earlier than one second after the
 * incident's latest event, so the audit trail always stays in order.
 */
function stamp(i: Incident): string {
  const last = i.audit.reduce((m, e) => Math.max(m, Date.parse(e.timestamp)), Date.parse(i.detectedAt));
  return new Date(Math.max(Date.now(), last + 1000)).toISOString();
}

function newEventId(incidentId: string): string {
  counter += 1;
  return `${incidentId}-live-${counter}`;
}

function incidentById(id: string): Incident | undefined {
  return current().incidents.find((i) => i.id === id);
}

function patchIncident(id: string, fn: (i: Incident) => Incident) {
  set({ incidents: current().incidents.map((i) => (i.id === id ? fn(i) : i)) });
}

function withEvent(i: Incident, e: Omit<AuditEvent, "id">): Incident {
  return { ...i, audit: [...i.audit, { ...e, id: newEventId(i.id) }] };
}

function randomRunId(): string {
  let id = String(1 + Math.floor(Math.random() * 9));
  for (let k = 0; k < 14; k += 1) id += String(Math.floor(Math.random() * 10));
  return id;
}

export interface RemediationStart {
  incidentId: string;
  pipeline: string;
  remediationRunId: string;
  action: string;
  startedAt: string;
}

/** Records an email in Notifications and on the incident's audit trail. Returns the notification. */
function recordEmail(incident: Incident, kind: AppNotification["kind"], sentBy: string, nextStatus?: Incident["status"]): AppNotification {
  const draft = buildEmail(incident);
  const sentAt = stamp(incident);
  counter += 1;
  const notification: AppNotification = {
    id: `NTF-${2000 + counter}`,
    incidentId: incident.id,
    kind,
    subject: draft.subject,
    reason: draft.reason,
    recipient: incident.owner,
    cc: draft.cc,
    failureKey: incident.failureKey,
    pipeline: incident.pipeline,
    sentAt,
    sentBy,
    body: draft.body,
    resolution: draft.resolution,
  };
  set({ notifications: [notification, ...current().notifications] });
  patchIncident(incident.id, (i) =>
    withEvent(
      { ...i, emailSent: true, status: nextStatus ?? i.status },
      { timestamp: sentAt, label: kind === "Escalation" ? "Escalation email sent" : "Email sent", actor: sentBy === "Sentinel AI" ? "system" : "human", detail: `To ${incident.owner.name} <${incident.owner.email}>` },
    ),
  );
  return notification;
}

/**
 * Approve: starts the remediation in "Databricks" (simulated). After a short
 * run it either succeeds (resolved) or fails — a failed remediation is
 * escalated to the pipeline owner automatically and the email is recorded.
 */
export function approveAndRemediate(id: string): RemediationStart | null {
  const incident = incidentById(id);
  if (!incident || incident.status !== "WAITING_APPROVAL") return null;
  const def = FAILURE_BY_KEY[incident.failureKey];
  if (!def.autoRemediable || def.autoRun) return null;

  const startedAt = stamp(incident);
  const remediationRunId = randomRunId();
  const outcome = incident.remediationOutcome;

  patchIncident(id, (i) => {
    let next: Incident = { ...i, status: "REMEDIATING", approvedBy: CURRENT_USER, approvedAt: startedAt, remediationRunId, remediationStartedAt: startedAt };
    next = withEvent(next, { timestamp: startedAt, label: "Remediation approved", actor: "human", detail: `By ${CURRENT_USER}` });
    next = withEvent(next, { timestamp: startedAt, label: `Remediation started: ${def.remediationLabel}`, actor: "system", detail: `Pipeline started in Databricks — run ${remediationRunId}` });
    return next;
  });

  setTimeout(() => {
    const live = incidentById(id);
    if (!live || live.status !== "REMEDIATING") return;
    const done = stamp(live);
    if (outcome === "SUCCESS") {
      patchIncident(id, (i) => withEvent({ ...i, status: "RESOLVED", resolvedAt: done }, { timestamp: done, label: "Validation passed — incident resolved", actor: "system", detail: def.validation[0] }));
      return;
    }
    patchIncident(id, (i) => withEvent({ ...i, status: "FAILED", remediationFailed: true }, { timestamp: done, label: "Remediation failed", actor: "system", detail: "The rerun did not complete successfully" }));
    setTimeout(() => {
      const failed = incidentById(id);
      if (!failed || failed.status !== "FAILED") return;
      patchIncident(id, (i) => withEvent(i, { timestamp: stamp(i), label: "Escalated to the pipeline owner", actor: "system", detail: "Automatic escalation after the failed remediation" }));
      const latest = incidentById(id);
      if (latest) recordEmail(latest, "Escalation", "Sentinel AI", "ESCALATED");
    }, FAILED_VISIBLE_MS);
  }, REMEDIATION_MS);

  return { incidentId: id, pipeline: incident.pipeline, remediationRunId, action: def.remediationLabel, startedAt };
}

export function rejectIncident(id: string) {
  const incident = incidentById(id);
  if (!incident || incident.status !== "WAITING_APPROVAL") return;
  const ts = stamp(incident);
  patchIncident(id, (i) => withEvent({ ...i, status: "REJECTED", rejectedBy: CURRENT_USER }, { timestamp: ts, label: "Remediation rejected", actor: "human", detail: `By ${CURRENT_USER}` }));
  patchIncident(id, (i) => withEvent(i, { timestamp: stamp(i), label: "Escalated to the pipeline owner", actor: "system", detail: "Automatic escalation after the remediation was rejected" }));
  const rejected = incidentById(id);
  if (rejected) recordEmail(rejected, "Escalation", "Sentinel AI");
}

/**
 * Sends the auto-generated email to the pipeline's owner. When the incident
 * is waiting for the user to escalate, this is the escalation: the status
 * becomes "Escalated · mail sent".
 */
export function sendEmail(id: string): AppNotification | null {
  const incident = incidentById(id);
  if (!incident) return null;
  const escalating = incident.status === "ESCALATION_REQUIRED";
  return recordEmail(incident, escalating ? "Escalation" : "Email", CURRENT_USER, escalating ? "ESCALATED" : undefined);
}
