import { toneStyle, type StatusStyle } from "@/lib/constants";
import type { ExecutionStatus, IncidentStatus, Severity } from "./types";

export const INCIDENT_STATUS_STYLES: Record<IncidentStatus, StatusStyle> = {
  WAITING_APPROVAL: toneStyle("Approval required", "neutral"),
  REMEDIATING: toneStyle("Remediation", "neutral"),
  FAILED: toneStyle("Failed", "danger"),
  ESCALATION_REQUIRED: toneStyle("Failed", "danger"),
  ESCALATED: toneStyle("Failed", "danger"),
  RESOLVED: toneStyle("Remediated", "success"),
  REJECTED: toneStyle("Rejected · Escalated", "danger"),
};

export const SEVERITY_STYLES: Record<Severity, StatusStyle> = {
  LOW: toneStyle("Low", "neutral"),
  MEDIUM: toneStyle("Medium", "warning"),
  HIGH: toneStyle("High", "danger"),
  CRITICAL: toneStyle("Critical", "danger"),
};

export const EXECUTION_STATUS_STYLES: Record<ExecutionStatus, StatusStyle> = {
  SUCCESS: toneStyle("Success", "success"),
  FAILED: toneStyle("Failed", "danger"),
  TIMEDOUT: toneStyle("Timed out", "warning"),
};

export const SLA_STYLES: Record<"SAFE" | "CRITICAL", StatusStyle> = {
  SAFE: toneStyle("Safe", "success"),
  CRITICAL: toneStyle("Critical", "danger"),
};

export const DQ_STYLES: Record<"PASS" | "FAIL" | "N/A", StatusStyle> = {
  PASS: toneStyle("Pass", "success"),
  FAIL: toneStyle("Fail", "danger"),
  "N/A": toneStyle("N/A", "neutral"),
};
