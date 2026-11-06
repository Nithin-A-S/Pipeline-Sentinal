import { FAILURE_BY_KEY, guardrailId } from "./failureTypes";
import type { Incident, PipelineRun } from "./types";

/** An incident is "active" until it is resolved or rejected. */
export const ACTIVE_STATUSES = new Set(["WAITING_APPROVAL", "REMEDIATING", "FAILED", "ESCALATION_REQUIRED", "ESCALATED"]);

/** Every way an incident can end up shown as "Failed" (escalation pending or already sent). */
export const FAILED_STATUSES = new Set(["FAILED", "ESCALATION_REQUIRED", "ESCALATED"]);

export function isFailed(i: Incident): boolean {
  return FAILED_STATUSES.has(i.status);
}

export function isActive(i: Incident): boolean {
  return ACTIVE_STATUSES.has(i.status);
}

export function approvalStatus(i: Incident | undefined): string {
  if (!i) return "-";
  const def = FAILURE_BY_KEY[i.failureKey];
  if (def.autoRun) return "NOT_REQUIRED";
  if (i.status === "WAITING_APPROVAL") return "PENDING";
  if (i.status === "REJECTED") return "REJECTED";
  if (!def.autoRemediable) return i.status === "ESCALATION_REQUIRED" ? "ESCALATION_PENDING" : "ESCALATED";
  return "APPROVED";
}

export function remediationStatus(i: Incident | undefined): string {
  if (!i) return "-";
  if (i.status === "REMEDIATING") return "IN_PROGRESS";
  if (i.remediationFailed) return "FAILED";
  if (i.status === "RESOLVED") return FAILURE_BY_KEY[i.failureKey].autoRemediable ? "SUCCESS" : "MANUAL_FIX";
  if (i.status === "REJECTED") return "NOT_EXECUTED";
  return "NOT_STARTED";
}

export function validationStatus(i: Incident | undefined): string {
  if (!i) return "-";
  if (i.status === "REMEDIATING") return "IN_PROGRESS";
  if (i.remediationFailed) return "FAILED";
  if (i.status === "RESOLVED") return "PASSED";
  return "NOT_STARTED";
}

export function overallStatus(run: PipelineRun, i: Incident | undefined): string {
  if (run.executionStatus === "SUCCESS" || !i) return "SUCCESS";
  if (i.status === "WAITING_APPROVAL") return "ACTION_REQUIRED";
  return i.status;
}

export function guardrailDecision(i: Incident | undefined): string {
  if (!i) return "-";
  const def = FAILURE_BY_KEY[i.failureKey];
  return def.autoRun ? "AUTO_REMEDIATION" : def.autoRemediable ? "APPROVAL_REQUIRED" : "ESCALATION_REQUIRED";
}

export function guardrailOf(i: Incident | undefined): string {
  return i ? guardrailId(FAILURE_BY_KEY[i.failureKey]) : "-";
}
