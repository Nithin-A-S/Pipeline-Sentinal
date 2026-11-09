import { seededInt, seededRandom, seededShuffle } from "@/lib/seededRandom";
import { PIPELINES, PIPELINE_BY_ID, SLA_BASELINE_MINUTES, buildDays } from "./catalog";
import { buildEmail, hasCustomEmail } from "./email";
import { FAILURE_BY_KEY, FAILURE_TYPES, type FailureKey, type FailureTypeDef } from "./failureTypes";
import type { AppNotification, AuditEvent, Incident, IncidentStatus, PipelineRun } from "./types";

export interface Dataset {
  today: string;
  days: string[];
  runs: PipelineRun[];
  incidents: Incident[];
  notifications: AppNotification[];
}

interface Slot {
  pipelineId: string;
  k: number;
}

/** The 40 daily run slots, interleaved so each pipeline's runs are spread across the day. */
function buildSlots(): Slot[] {
  return PIPELINES.flatMap((p, pi) =>
    Array.from({ length: p.runsPerDay }, (_, k) => ({ pipelineId: p.id, k, key: (k + 0.5) / p.runsPerDay + pi * 0.0007 })),
  )
    .sort((a, b) => a.key - b.key)
    .map(({ pipelineId, k }) => ({ pipelineId, k }));
}

const SLOTS = buildSlots();

interface Plan {
  key: FailureKey;
  status: IncidentStatus;
  /** The remediation attempt failed (so the incident goes down the escalation path). */
  failed: boolean;
  /** What happens if a person approves this incident's remediation in the demo. */
  outcome: "SUCCESS" | "FAILED";
  /** Fixed incident ID, so a demo incident keeps the same ID every day. */
  id?: string;
}

function plan(key: FailureKey, status: IncidentStatus, extra: { failed?: boolean; outcome?: "FAILED"; id?: string } = {}): Plan {
  const def = FAILURE_BY_KEY[key];
  // Engineer-fixed failure types are always rejected and escalated after the investigation.
  if (def.engineerFix) return { key, status: "REJECTED", failed: false, outcome: "SUCCESS", id: extra.id };
  const failed = extra.failed ?? ((status === "ESCALATED" && def.autoRemediable) || (status === "ESCALATION_REQUIRED" && def.autoRun));
  return { key, status, failed, outcome: extra.outcome ?? "SUCCESS", id: extra.id };
}

/**
 * Today's 20 failed runs: all 10 failure types, plus 10 repeats. The newest
 * runs are resolved / remediating / escalated, so "waiting for approval" is
 * never what you see first.
 */
const TODAY_PLAN: Record<string, Plan> = {
  "MM_US#0": plan("CONNECTIVITY_FAILURE", "RESOLVED"),
  "PS_US#0": plan("CONNECTIVITY_FAILURE", "ESCALATION_REQUIRED"),
  "MM_US#1": plan("DEPENDENCY_FAILURE", "RESOLVED"),
  "PS_US#1": plan("DQ_FAILURE", "WAITING_APPROVAL"),
  "MM_US#2": plan("REPEATED_FAILURE", "ESCALATION_REQUIRED"),
  "PS_US#2": plan("REPEATED_FAILURE", "ESCALATED"),
  "MM_US#4": plan("SCHEMA_MISMATCH", "RESOLVED"),
  "PS_US#3": plan("PERMISSION_FAILURE", "WAITING_APPROVAL", { outcome: "FAILED" }),
  "MM_US#5": plan("TRANSIENT_FAILURE", "RESOLVED"),
  "PS_US#4": plan("TIMEOUT_FAILURE", "WAITING_APPROVAL"),
  "MM_US#6": plan("DEPENDENCY_FAILURE", "ESCALATED"),
  "PS_US#6": plan("TIMEOUT_FAILURE", "RESOLVED"),
  "MM_US#7": plan("DATA_CORRUPTION", "RESOLVED"),
  // Configuration failure demo: approval-request email, then approved and remediated (see CUSTOM_EMAILS in email.ts).
  "PS_US#7": plan("CONFIGURATION_FAILURE", "RESOLVED", { id: "INC-960BD487" }),
  "MM_CA#0": plan("CONNECTIVITY_FAILURE", "ESCALATION_REQUIRED"),
  // Data quality demo: escalation email for engineer intervention (see CUSTOM_EMAILS in email.ts).
  "PS_DE#1": plan("DQ_FAILURE", "WAITING_APPROVAL", { id: "INC-6036A738" }),
  "GOLD_GB#0": plan("SCHEMA_MISMATCH", "WAITING_APPROVAL"),
  "GOLD_SG#0": plan("TIMEOUT_FAILURE", "RESOLVED"),
  // Dependency failure demo: upstream job incomplete → verify dependency → wait → rerun downstream task.
  "GOLD_US#1": plan("DEPENDENCY_FAILURE", "RESOLVED", { id: "INC-D3E7A102" }),
  // Data quality demo (Primary Key Uniqueness): duplicate material IDs / missing mandatory fields → quarantine → correct/reload → validate.
  "MM_US#3": plan("DQ_FAILURE", "RESOLVED", { id: "INC-9A4C1E07" }),
};

/** Failed runs on each earlier day, keyed by how many days ago it was. */
const PAST_FAILURES: Record<number, number> = { 1: 12, 2: 15, 3: 17, 4: 13, 5: 16, 6: 14, 7: 15, 8: 13, 9: 16, 10: 14, 11: 12, 12: 17, 13: 15, 14: 13 };

/** Incidents from earlier days that are still open (keyed by days ago): 12 here + 12 open today = 24 active. */
const CARRY_OVER: Record<number, Plan[]> = {
  1: [plan("PERMISSION_FAILURE", "WAITING_APPROVAL"), plan("DATA_CORRUPTION", "WAITING_APPROVAL", { outcome: "FAILED" }), plan("REPEATED_FAILURE", "ESCALATED"), plan("SCHEMA_MISMATCH", "WAITING_APPROVAL")],
  2: [plan("REPEATED_FAILURE", "ESCALATED"), plan("SCHEMA_MISMATCH", "WAITING_APPROVAL"), plan("DQ_FAILURE", "WAITING_APPROVAL")],
  3: [plan("REPEATED_FAILURE", "ESCALATED")],
  4: [plan("CONFIGURATION_FAILURE", "WAITING_APPROVAL")],
  5: [plan("PERMISSION_FAILURE", "WAITING_APPROVAL")],
  6: [plan("TIMEOUT_FAILURE", "WAITING_APPROVAL"), plan("REPEATED_FAILURE", "ESCALATION_REQUIRED")],
};

const HEX = "0123456789ABCDEF";

function hex(rand: () => number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i += 1) out += HEX[Math.floor(rand() * 16)];
  return out;
}

function digits(rand: () => number, n: number): string {
  let out = String(1 + Math.floor(rand() * 9));
  for (let i = 1; i < n; i += 1) out += String(Math.floor(rand() * 10));
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}Z`;
}

function planFailures(ago: number, day: string, today: string): Map<number, Plan> {
  const map = new Map<number, Plan>();

  if (day === today) {
    SLOTS.forEach((slot, i) => {
      const p = TODAY_PLAN[`${slot.pipelineId}#${slot.k}`];
      if (p) map.set(i, p);
    });
    return map;
  }

  const rand = seededRandom(`failures:${day}`);
  const order = seededShuffle(rand, SLOTS.map((_, i) => i)).slice(0, PAST_FAILURES[ago] ?? 14);
  const forced = CARRY_OVER[ago] ?? [];
  const typeCycle = seededShuffle(rand, FAILURE_TYPES.map((f) => f.key));
  let cycle = 0;
  let counter = 0;

  order.forEach((slotIdx, n) => {
    if (n < forced.length) {
      map.set(slotIdx, forced[n]);
      return;
    }
    const key = typeCycle[cycle % typeCycle.length];
    cycle += 1;
    counter += 1;
    const def = FAILURE_BY_KEY[key];
    const roll = rand();
    if (!def.autoRemediable) map.set(slotIdx, plan(key, "RESOLVED", { failed: false }));
    else if (def.autoRun) map.set(slotIdx, plan(key, "RESOLVED", { failed: roll < 0.2 }));
    else if (counter % 9 === 4) map.set(slotIdx, plan(key, "REJECTED", { failed: false }));
    else map.set(slotIdx, plan(key, "RESOLVED", { failed: roll < 0.2 }));
  });
  return map;
}

interface Story {
  audit: AuditEvent[];
  mailAt: string | null;
  mailKind: "Email" | "Escalation";
}

/** The audit trail for an incident, following the flow its status implies. */
function buildStory(incident: Incident, def: FailureTypeDef, pl: Plan, rand: () => number, capMs: number, informationalEmail: boolean): Story {
  const t0 = Date.parse(incident.detectedAt);
  const ts = (min: number) => iso(Math.min(t0 + min * 60000, capMs));
  const audit: AuditEvent[] = [];
  let n = 0;
  const add = (min: number, label: string, actor: AuditEvent["actor"], detail: string | null) => {
    n += 1;
    audit.push({ id: `${incident.id}-${n}`, timestamp: ts(min), label, actor, detail });
  };

  const st = pl.status;
  const owner = incident.owner;
  let mailAt: string | null = null;
  let mailKind: "Email" | "Escalation" = "Escalation";
  const mail = (min: number) => {
    mailAt = ts(min);
    add(min, mailKind === "Escalation" ? "Escalation email sent" : "Email sent", "system", `To ${owner.name} <${owner.email}>`);
  };
  const ownerFix = (min: number) => {
    add(min, "Pipeline owner fixed the root cause", "human", `By ${owner.name}`);
    add(min + 8, "Incident resolved", "system", "The pipeline recovered after the manual fix");
  };

  add(0, "Incident created", "system", def.errorMessage);
  add(1, "AI investigation completed", "ai", def.rootCause);
  add(2, `Failure type identified: ${def.label}`, "ai", `Recommended action: ${def.recommendationText}`);

  const approveAt = 14 + seededInt(rand, 0, 10);
  const runNote = incident.remediationRunId ? `Remediation run ${incident.remediationRunId}` : null;

  if (def.autoRun) {
    add(3, `Automatic remediation started: ${def.remediationLabel}`, "system", "No approval needed — the guardrail allows an automatic rerun");
    add(4, "Pipeline started in Databricks", "system", runNote);
    if (st !== "REMEDIATING") {
      if (!pl.failed) {
        add(15, "Validation passed — incident resolved automatically", "system", def.validation[0]);
      } else {
        add(14, "Automatic remediation failed", "system", "The rerun did not complete successfully");
        add(15, "Escalation required", "system", "Waiting for you to escalate this to the pipeline owner");
        if (st === "ESCALATED" || st === "RESOLVED") {
          mail(18);
          if (st === "RESOLVED") ownerFix(45);
        }
      }
    }
  } else if (!def.autoRemediable) {
    add(3, "Escalation required", "system", "AI cannot remediate this failure — a person must investigate");
    if (st === "ESCALATED" || st === "RESOLVED") {
      mail(8);
      if (st === "RESOLVED") ownerFix(40);
    }
  } else if (def.engineerFix) {
    add(3, "Remediation rejected", "system", "Data-quality fixes are made by the data engineer — no automatic remediation");
    add(4, "Escalated to the pipeline owner", "system", "Escalated to the data engineer to quarantine, correct and reload the records");
    mail(5);
  } else {
    add(3, "Waiting for approval", "system", def.recommendationText);
    if (st !== "REJECTED" && hasCustomEmail(incident.id)) {
      mailKind = "Email";
      mail(4);
    }
    if (st === "REJECTED") {
      add(approveAt, "Remediation rejected", "human", `By ${owner.name}`);
      add(approveAt + 1, "Escalated to the pipeline owner", "system", "Automatic escalation after the remediation was rejected");
      mail(approveAt + 2);
    } else if (st !== "WAITING_APPROVAL") {
      add(approveAt, "Remediation approved", "human", `By ${owner.name}`);
      add(approveAt + 1, `Remediation started: ${def.remediationLabel}`, "system", runNote ?? "Pipeline started in Databricks");
      if (st !== "REMEDIATING") {
        if (!pl.failed) {
          add(approveAt + 12, "Validation passed — incident resolved", "system", def.validation[0]);
        } else {
          add(approveAt + 9, "Remediation failed", "system", "The rerun did not complete successfully");
          add(approveAt + 10, "Escalated to the pipeline owner", "system", "Automatic escalation after the failed remediation");
          mail(approveAt + 11);
          if (st === "RESOLVED") ownerFix(approveAt + 40);
        }
      }
    }
  }

  if (!mailAt && informationalEmail) {
    mailKind = "Email";
    mail(30);
  }

  audit.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return { audit, mailAt, mailKind };
}

/** Builds the whole demo dataset for the days ending on the day of `nowMs` (UTC). */
export function generateDataset(nowMs: number): Dataset {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const days = buildDays(today);
  const minutesNow = new Date(nowMs).getUTCHours() * 60 + new Date(nowMs).getUTCMinutes();

  const runs: PipelineRun[] = [];
  const incidents: Incident[] = [];
  const notifications: AppNotification[] = [];
  const emailRand = seededRandom("emails");

  days.forEach((day, dayIdx) => {
    const isToday = day === today;
    const rand = seededRandom(`day:${day}`);
    const failures = planFailures(days.length - 1 - dayIdx, day, today);
    const base = Date.parse(`${day}T00:00:00.000Z`);
    const window = Math.max(240, minutesNow);
    const step = Math.max(2, (window - 100) / 40);
    let successSeen = 0;

    SLOTS.forEach((slot, i) => {
      const p = PIPELINE_BY_ID[slot.pipelineId];
      const pl = failures.get(i);
      const def = pl ? FAILURE_BY_KEY[pl.key] : null;

      const startMinute = isToday ? 12 + Math.floor(i * step) + seededInt(rand, 0, Math.floor(step / 4)) : 12 + i * 35 + seededInt(rand, 0, 8);
      const startMs = base + startMinute * 60000 + seededInt(rand, 0, 59) * 1000 + seededInt(rand, 0, 999);
      let duration: number;
      if (def) {
        duration = def.failMinutes;
      } else {
        const criticalSuccess = isToday ? successSeen === 3 || successSeen === 9 : rand() < 0.06;
        duration = criticalSuccess ? 16 + (successSeen % 4) : seededInt(rand, 7, 14);
        successSeen += 1;
      }
      const endMs = startMs + duration * 60000 + seededInt(rand, 0, 40) * 1000;
      const runId = digits(rand, 15);
      const generatedId = def ? `INC-${hex(rand, 8)}` : null;
      const incidentId = pl?.id ?? generatedId;

      const run: PipelineRun = {
        date: day,
        pipelineId: p.id,
        pipeline: p.name,
        country: p.country,
        family: p.family,
        jobId: p.jobId,
        runId,
        startTime: iso(startMs),
        endTime: iso(endMs),
        durationMinutes: duration,
        executionStatus: def ? def.executionStatus : "SUCCESS",
        detectedAt: iso(endMs + 60000),
        incidentId,
        dqStatus: def ? (def.key === "DQ_FAILURE" || def.key === "DATA_CORRUPTION" ? "FAIL" : "N/A") : "PASS",
        slaStatus: duration > SLA_BASELINE_MINUTES ? "CRITICAL" : "SAFE",
      };
      runs.push(run);

      if (!def || !pl || !incidentId) return;

      const hasRun = def.autoRun || (def.autoRemediable && pl.status !== "WAITING_APPROVAL" && pl.status !== "REJECTED");
      const approvedByPerson = def.autoRemediable && !def.autoRun && pl.status !== "WAITING_APPROVAL" && pl.status !== "REJECTED";

      const incident: Incident = {
        id: incidentId,
        runId,
        pipelineId: p.id,
        pipeline: p.name,
        country: p.country,
        jobId: p.jobId,
        owner: p.owner,
        failureKey: def.key,
        detectedAt: run.detectedAt,
        date: day,
        status: pl.status,
        severity: run.slaStatus === "CRITICAL" ? "CRITICAL" : def.baseSeverity,
        executionStatus: run.executionStatus,
        durationMinutes: duration,
        slaStatus: run.slaStatus,
        approvedBy: def.autoRun && hasRun ? "auto-remediation" : approvedByPerson ? p.owner.name : null,
        approvedAt: null,
        rejectedBy: pl.status === "REJECTED" ? p.owner.name : null,
        remediationRunId: hasRun ? digits(rand, 15) : null,
        remediationStartedAt: pl.status === "REMEDIATING" ? iso(nowMs - 3000) : null,
        resolvedAt: null,
        emailSent: false,
        remediationFailed: pl.failed,
        remediationOutcome: pl.outcome,
        audit: [],
      };

      const informationalEmail = pl.status === "RESOLVED" && !pl.failed && def.autoRemediable && emailRand() < 0.15;
      const story = buildStory(incident, def, pl, rand, isToday ? nowMs - 20000 : Number.POSITIVE_INFINITY, informationalEmail);
      incident.audit = story.audit;
      if (pl.status === "RESOLVED") incident.resolvedAt = story.audit[story.audit.length - 1].timestamp;

      if (story.mailAt) {
        const draft = buildEmail(incident);
        incident.emailSent = true;
        notifications.push({
          id: "",
          incidentId: incident.id,
          kind: story.mailKind,
          subject: draft.subject,
          reason: draft.reason,
          recipient: incident.owner,
          cc: draft.cc,
          failureKey: incident.failureKey,
          pipeline: incident.pipeline,
          sentAt: story.mailAt,
          sentBy: "Sentinel AI",
          body: draft.body,
          resolution: draft.resolution,
        });
      }
      incidents.push(incident);
    });
  });

  notifications
    .sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1))
    .forEach((n, i) => {
      n.id = `NTF-${String(1001 + i)}`;
    });
  notifications.reverse();
  runs.sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
  incidents.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));

  return { today, days, runs, incidents, notifications };
}
