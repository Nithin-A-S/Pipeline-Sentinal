import { COUNTRY_LABEL, SLA_BASELINE_MINUTES } from "./catalog";
import { FAILURE_BY_KEY } from "./failureTypes";
import type { Incident } from "./types";
import { fill } from "./text";

export interface EmailDraft {
  to: string;
  toName: string;
  cc: string[];
  subject: string;
  reason: string;
  body: string;
  resolution: string[];
}

function utc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** The email is derived entirely from the incident: reason, evidence, and the solution for its failure type. */
export function buildEmail(incident: Incident): EmailDraft {
  const def = FAILURE_BY_KEY[incident.failureKey];
  const ctx = { pipeline: incident.pipeline, country: incident.country };
  const first = incident.owner.name.split(" ")[0];
  const resolution = def.solution.map((s) => fill(s, ctx));
  const sla =
    incident.slaStatus === "CRITICAL"
      ? `CRITICAL — runtime ${incident.durationMinutes} min vs ${SLA_BASELINE_MINUTES} min baseline`
      : `Safe — runtime ${incident.durationMinutes} min vs ${SLA_BASELINE_MINUTES} min baseline`;

  const why = incident.status === "REJECTED"
    ? `The recommended remediation was rejected${incident.rejectedBy ? ` by ${incident.rejectedBy}` : ""}, so no automatic fix was applied and the incident is being escalated to you.`
    : incident.remediationFailed
    ? "Sentinel tried to fix this automatically, but the remediation did not succeed, so the incident is being escalated to you."
    : !def.autoRemediable
      ? "Sentinel cannot fix this failure automatically, so the incident is being escalated to you."
      : "This is an update on an incident for a pipeline you own.";

  const body = [
    `Hi ${first},`,
    "",
    `Pipeline "${incident.pipeline}" (${COUNTRY_LABEL[incident.country]}) failed at ${utc(incident.detectedAt)}. Sentinel opened incident ${incident.id} and completed an AI investigation. ${why}`,
    "",
    "WHAT HAPPENED",
    `- Failure type: ${def.label}`,
    `- Error: ${def.errorMessage}`,
    `- Likely cause: ${def.rootCause}`,
    `- SLA: ${sla}`,
    "",
    "WHAT TO DO",
    ...resolution.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Recommended action: ${def.recommendationText}`,
    `Incident: /incidents/${incident.id}`,
    "",
    "— Sentinel, AI-powered pipeline operations",
  ].join("\n");

  return {
    to: incident.owner.email,
    toName: incident.owner.name,
    cc: ["dataops-oncall@sentinel.ai"],
    subject: `[Sentinel] ${def.label} — ${incident.pipeline} (${incident.id})`,
    reason: def.errorMessage,
    body,
    resolution,
  };
}
