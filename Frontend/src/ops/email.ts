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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** e.g. "09 Nov 2026, 05:33 UTC" */
function longUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

const minutes = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

interface CustomEmail {
  subject: string;
  reason: string;
  body: string[];
  resolution: string[];
}

/** Hand-written emails for the demo incidents, keyed by incident ID. */
const CUSTOM_EMAILS: Record<string, (i: Incident, first: string) => CustomEmail> = {
  // Procurement & Sales Processing US — Configuration Failure (approval required).
  "INC-960BD487": (i, first) => {
    const actions = [
      "Approve the proposed configuration fix: Update source_path to /mnt/raw/sap/current and rerun the pipeline.",
      "Prevent recurrence: Review and update the deployment template to ensure the retired path is not reintroduced in future deployments.",
    ];
    return {
      subject: `[Sentinel] Approval required: Configuration Failure — ${i.pipeline} (${i.id})`,
      reason: "Job parameter source_path references a non-existent location: /mnt/raw/sap/legacy.",
      resolution: actions,
      body: [
        `Hi ${first},`,
        "",
        `Sentinel detected a failure in the pipeline ${i.pipeline} (${COUNTRY_LABEL[i.country]}) at ${longUtc(i.detectedAt)} and created incident ${i.id}.`,
        "",
        "The AI investigation has identified a likely configuration issue and recommends a corrective action. Your approval is required before remediation can proceed.",
        "",
        "WHAT HAPPENED",
        "Failure type: Configuration Failure",
        "Error: Job parameter source_path references a non-existent location: /mnt/raw/sap/legacy.",
        "Investigation finding: The configured path appears to be outdated following the SAP storage migration.",
        "Recommended replacement: /mnt/raw/sap/current",
        "Execution status: Failed",
        `Runtime assessment: ${minutes(i.durationMinutes)} against a ${SLA_BASELINE_MINUTES}-minute baseline (within the runtime threshold).`,
        "",
        "RECOMMENDED ACTION",
        ...actions,
        "",
        "REQUIRED ACTION: Review and approve the proposed remediation in Sentinel.",
        "",
        `Incident: ${i.id}`,
        `Pipeline: ${i.pipeline}`,
      ],
    };
  },
  // Procurement & Sales Processing DE — Data Quality Failure (escalated for engineer intervention).
  "INC-6036A738": (i, first) => {
    const actions = [
      "Isolate affected records: Quarantine the impacted records to prevent invalid data from progressing downstream.",
      "Resolve duplicate material IDs: Investigate duplicates and apply approved de-duplication or source correction rules.",
      "Correct missing attributes: Validate and populate MTART and MEINS using authoritative SAP source data.",
      "Reload and validate: Reload the corrected records and rerun data quality checks before resuming downstream processing.",
      "Prevent recurrence: Engage the SAP extract team to investigate the source batch and address the underlying data issue.",
    ];
    return {
      subject: `[Sentinel] Escalation: Data Quality Failure — ${i.pipeline} (${i.id})`,
      reason: "Primary Key Uniqueness and Mandatory Field Completeness checks failed on sap_material_master.",
      resolution: actions,
      body: [
        `Hi ${first},`,
        "",
        `Sentinel detected a data quality failure in the pipeline ${i.pipeline} (${COUNTRY_LABEL[i.country]}) at ${longUtc(i.detectedAt)} and created incident ${i.id}.`,
        "",
        "The AI investigation identified duplicate material identifiers and missing mandatory attributes in the SAP Material Master extract. As these issues require business-rule validation and source-data correction, automated remediation is not permitted. The incident has been escalated for engineer intervention.",
        "",
        "WHAT HAPPENED",
        "Failure type: Data Quality Failure",
        "Failed validation: Primary Key Uniqueness and Mandatory Field Completeness",
        "Affected data: sap_material_master",
        "Source batch: 02:10 UTC SAP extract",
        "",
        "AI INVESTIGATION FINDINGS",
        "312 MATNR values appear more than once, violating the primary-key uniqueness rule.",
        "87 rows have missing mandatory attributes: MTART (Material Type) and MEINS (Base Unit of Measure).",
        "All identified affected rows originate from the same source batch.",
        "The remaining 9,661 rows passed the checks.",
        "",
        "RECOMMENDED ACTION",
        ...actions,
        "",
        "GOVERNANCE STATUS: Engineer intervention required. Sentinel has completed the investigation and routed the incident; no data changes have been performed automatically.",
        "",
        `Runtime assessment: ${minutes(i.durationMinutes)} against a ${SLA_BASELINE_MINUTES}-minute baseline. This is within the runtime threshold; downstream data availability should be assessed separately.`,
        "",
        `Incident: ${i.id}`,
        `Pipeline: ${i.pipeline}`,
      ],
    };
  },
};

export const hasCustomEmail = (incidentId: string) => incidentId in CUSTOM_EMAILS;

/** The email is derived entirely from the incident: reason, evidence, and the solution for its failure type. */
export function buildEmail(incident: Incident): EmailDraft {
  const custom = CUSTOM_EMAILS[incident.id];
  if (custom) {
    const c = custom(incident, incident.owner.name.split(" ")[0]);
    return {
      to: incident.owner.email,
      toName: incident.owner.name,
      cc: ["dataops-oncall@sentinel.ai"],
      subject: c.subject,
      reason: c.reason,
      body: [...c.body, "", "Regards,", "Sentinel", "AI-powered pipeline operations"].join("\n"),
      resolution: c.resolution,
    };
  }
  const def = FAILURE_BY_KEY[incident.failureKey];
  const ctx = { pipeline: incident.pipeline, country: incident.country };
  const first = incident.owner.name.split(" ")[0];
  const resolution = def.solution.map((s) => fill(s, ctx));
  const sla =
    incident.slaStatus === "CRITICAL"
      ? `CRITICAL — runtime ${incident.durationMinutes} min vs ${SLA_BASELINE_MINUTES} min baseline`
      : `Safe — runtime ${incident.durationMinutes} min vs ${SLA_BASELINE_MINUTES} min baseline`;

  const why = def.engineerFix
    ? "Data-quality fixes are made by the data engineer, so the automatic remediation was rejected and the incident is being escalated to you."
    : incident.status === "REJECTED"
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
    `Incident: ${incident.id}`,
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
