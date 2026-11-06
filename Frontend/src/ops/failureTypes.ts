export type FailureKey =
  | "CONFIGURATION_FAILURE"
  | "DEPENDENCY_FAILURE"
  | "TIMEOUT_FAILURE"
  | "TRANSIENT_FAILURE"
  | "PERMISSION_FAILURE"
  | "SCHEMA_MISMATCH"
  | "DQ_FAILURE"
  | "DATA_CORRUPTION"
  | "CONNECTIVITY_FAILURE"
  | "REPEATED_FAILURE";

export type BaseSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface PlannedChange {
  label: string;
  current: string;
  recommended: string;
}

export interface FailureTypeDef {
  key: FailureKey;
  /** 1-based position in the scenario table. */
  index: number;
  label: string;
  recommendation: string;
  /** The recommended action in plain English. */
  recommendationText: string;
  /** Set when AI cannot perform the remediation itself — why a person is needed. */
  aiLimit?: string;
  remediationLabel: string;
  /** false = no safe automatic action exists; the only path is human escalation (email). */
  autoRemediable: boolean;
  /** true = the guardrail lets Sentinel run the remediation by itself (no approval, no button). */
  autoRun: boolean;
  /**
   * true = after the investigation the remediation is rejected and the incident is
   * escalated straight to the data engineer, who makes the fix.
   */
  engineerFix?: boolean;
  baseSeverity: BaseSeverity;
  errorCode: string;
  errorMessage: string;
  executionStatus: "FAILED" | "TIMEDOUT";
  /** How long the failed run lasted before it stopped (minutes). */
  failMinutes: number;
  rootCause: string;
  /** One-line summary shown on the AI investigation step; falls back to rootCause. */
  investigationSummary?: string;
  investigation: string[];
  analysisSteps: string[];
  remediationSteps: string[];
  validation: string[];
  solution: string[];
  change?: PlannedChange;
  regression: { scenario: string; expectedBehavior: string; expectedWorkflow: string };
}

const WF = "Incident created → AI investigation → failure type identified";

export const FAILURE_TYPES: FailureTypeDef[] = [
  {
    key: "CONFIGURATION_FAILURE",
    index: 1,
    label: "Configuration Failure",
    recommendation: "FIX_CONFIGURATION",
    recommendationText: "Correct the job configuration, then rerun",
    remediationLabel: "Correct configuration",
    autoRemediable: true,
    autoRun: false,
    baseSeverity: "MEDIUM",
    errorCode: "INVALID_PARAMETER",
    errorMessage: "Job parameter 'source_path' points to a location that does not exist: /mnt/raw/sap/legacy",
    executionStatus: "FAILED",
    failMinutes: 1,
    rootCause: "The job configuration contains an outdated source_path following the SAP storage migration. The job is attempting to access a retired landing location instead of the active storage path.",
    investigation: [
      "source_path references the retired /mnt/raw/sap/legacy location.",
      "The configured parameter differs from the last successful job configuration.",
      "/mnt/raw/sap/current exists and contains the expected source files.",
    ],
    analysisSteps: [
      "Analysed the INVALID_PARAMETER error and identified the affected source_path parameter.",
      "Compared the current job configuration with the last successful run.",
      "Verified the existence and accessibility of the configured and replacement storage paths.",
      "Checked the replacement path for expected source files and reviewed other job parameters for inconsistencies.",
    ],
    remediationSteps: ["Validate guardrail: configuration revert is reversible", "Update source_path to /mnt/raw/sap/current", "Rerun {pipeline}", "Validate output row counts"],
    validation: ["Job configuration updated and saved", "Rerun completed with result_state SUCCESS"],
    change: { label: "source_path", current: "/mnt/raw/sap/legacy", recommended: "/mnt/raw/sap/current" },
    solution: ["Approve the configuration fix — the parameter is corrected and the job reruns.", "Update the deployment template so the old path is not reintroduced."],
    regression: {
      scenario: "Job parameter points at a path that no longer exists",
      expectedBehavior: "Parameter is corrected and the pipeline recovers",
      expectedWorkflow: `${WF} → human approval → correct configuration → rerun → validation`,
    },
  },
  {
    key: "DEPENDENCY_FAILURE",
    index: 2,
    label: "Dependency Failure",
    recommendation: "WAIT_AND_RETRY",
    recommendationText: "Verify the upstream dependency, wait for it to complete, then rerun the downstream task",
    remediationLabel: "Wait for dependency",
    autoRemediable: true,
    autoRun: true,
    baseSeverity: "MEDIUM",
    errorCode: "UPSTREAM_DEPENDENCY_FAILED",
    errorMessage: "Upstream dependency check failed: upstream job Material Master Processing US has not completed — silver table not refreshed",
    executionStatus: "FAILED",
    failMinutes: 3,
    rootCause: "The downstream job was triggered before its upstream dependency completed. This resulted in an unmet dependency condition and potential consumption of stale input data.",
    investigationSummary: "The downstream job started before its upstream dependency completed, potentially resulting in stale input data.",
    investigation: [
      "Upstream job Material Master Processing US was still running when the downstream job started.",
      "The upstream job is estimated to complete in approximately 12 minutes, based on its execution history.",
      "The downstream job has no independent execution or configuration issue identified.",
      "The downstream input data freshness should be verified before reprocessing.",
    ],
    analysisSteps: [
      "Analysed the UPSTREAM_DEPENDENCY_FAILED error.",
      "Checked the execution status and run history of the upstream job.",
      "Compared upstream completion status with the downstream start time.",
      "Checked input table freshness and other dependency conditions.",
    ],
    remediationSteps: ["Guardrail check: dependency failures may be rerun automatically once the upstream completes", "Verify the dependency: upstream job is incomplete and its output table is stale", "Wait until the upstream job completes successfully", "Rerun the downstream task in {pipeline}", "Validate freshness of the input table"],
    validation: ["Upstream run completed with result_state SUCCESS", "Pipeline run completed with result_state SUCCESS"],
    solution: ["No action needed — Sentinel waits for the upstream job and reruns the downstream task automatically.", "Consider moving the schedule so it starts after its upstream."],
    regression: {
      scenario: "Pipeline starts before its upstream completes",
      expectedBehavior: "Dependency is verified, the pipeline waits and the downstream task is rerun automatically — no approval needed",
      expectedWorkflow: `Upstream job incomplete → verify dependency → wait → rerun downstream task → validation → resolved`,
    },
  },
  {
    key: "TIMEOUT_FAILURE",
    index: 3,
    label: "Timeout Failure",
    recommendation: "RETRY_WITH_EXTENDED_TIMEOUT",
    recommendationText: "Extend the timeout, then rerun",
    remediationLabel: "Increase timeout",
    autoRemediable: true,
    autoRun: false,
    baseSeverity: "MEDIUM",
    errorCode: "RUN_TIMED_OUT",
    errorMessage: "Run exceeded the configured timeout of 70 minutes and was terminated",
    executionStatus: "TIMEDOUT",
    failMinutes: 70,
    rootCause: "A long-running aggregation did not finish inside the configured job timeout.",
    investigation: [
      "The run was progressing normally — the last task was still writing when it was terminated.",
      "Runtime is 4× the 15-minute baseline because of a one-off data backfill.",
      "No errors in the task logs before the timeout.",
    ],
    analysisSteps: ["Read termination reason (TIMEDOUT)", "Check task progress at termination", "Compare runtime with the 15-minute baseline", "Estimate the time needed to finish"],
    remediationSteps: ["Validate guardrail: timeout increase is reversible", "Raise the job timeout from 70 to 120 minutes", "Rerun {pipeline}", "Restore the original timeout afterwards"],
    validation: ["Rerun completed within the extended timeout", "Job timeout restored to 70 minutes"],
    change: { label: "Job timeout", current: "70 min", recommended: "120 min" },
    solution: ["Approve the extended timeout for this rerun.", "If the runtime stays this high, review the backfill or the query plan."],
    regression: {
      scenario: "Run terminated by the job timeout",
      expectedBehavior: "Timeout is extended for a rerun and the run completes",
      expectedWorkflow: `${WF} → human approval → extend timeout → rerun → validation`,
    },
  },
  {
    key: "TRANSIENT_FAILURE",
    index: 4,
    label: "Transient Failure",
    recommendation: "CONTROLLED_RETRY",
    recommendationText: "Retry the pipeline with a controlled retry",
    remediationLabel: "Controlled retry",
    autoRemediable: true,
    autoRun: true,
    baseSeverity: "MEDIUM",
    errorCode: "SERVICE_UNAVAILABLE",
    errorMessage: "Source endpoint returned HTTP 503 – Service Unavailable during data retrieval",
    executionStatus: "FAILED",
    failMinutes: 4,
    rootCause: "A temporary source-service availability issue interrupted data retrieval, causing the pipeline execution to fail. The failure is classified as a transient connectivity failure.",
    investigationSummary: "The pipeline encountered a temporary service unavailability while accessing the source endpoint. The failure appears transient and potentially recoverable through a controlled retry.",
    investigation: [
      "The source endpoint returned 503 – Service Unavailable during pipeline execution.",
      "The connection failure occurred during data retrieval.",
      "No evidence of invalid configuration or authentication failure was identified.",
      "The failure pattern is consistent with a temporary service interruption.",
      "A controlled retry is recommended, subject to retry limits and idempotency checks.",
    ],
    analysisSteps: [
      "Analysed the connection error and execution logs.",
      "Identified the failed source-system request and HTTP 503 response.",
      "Checked whether the failure was transient or persistent.",
      "Reviewed previous retry attempts and execution history.",
      "Verified that no configuration or authentication issue was detected.",
    ],
    remediationSteps: ["Guardrail check: transient failures may be retried automatically within the retry limit", "Confirm the run is idempotent and safe to retry", "Retry {pipeline} with a controlled retry", "Validate the run output"],
    validation: ["Retry completed with result_state SUCCESS", "Source endpoint responded without HTTP 503 errors"],
    solution: ["No action needed — Sentinel retries the pipeline automatically within the retry limit.", "If the source endpoint keeps returning HTTP 503, contact the source-system team."],
    regression: {
      scenario: "Source endpoint returns HTTP 503 – Service Unavailable during data retrieval",
      expectedBehavior: "Failure is classified as transient and retried automatically — no approval needed",
      expectedWorkflow: `${WF} → automatic controlled retry → validation → remediated`,
    },
  },
  {
    key: "PERMISSION_FAILURE",
    index: 5,
    label: "Permission Failure",
    recommendation: "REQUEST_ACCESS",
    recommendationText: "Grant the missing access, then rerun",
    remediationLabel: "Request/grant access",
    autoRemediable: true,
    autoRun: false,
    baseSeverity: "HIGH",
    errorCode: "PERMISSION_DENIED",
    errorMessage: "PERMISSION_DENIED: service principal lacks SELECT on ai_dataops_poc.sap_demo.sap_vendor_material",
    executionStatus: "FAILED",
    failMinutes: 3,
    rootCause: "The pipeline's service principal lost SELECT access to a Unity Catalog table it needs.",
    investigation: [
      "Unity Catalog audit log shows a denied SELECT for the pipeline service principal.",
      "The grant was removed during a catalog permission cleanup yesterday.",
      "The table itself is healthy and unchanged.",
    ],
    analysisSteps: ["Read the PERMISSION_DENIED error", "Query the Unity Catalog audit log", "Identify the missing privilege", "Find the data owner who can approve the grant"],
    remediationSteps: ["Validate guardrail: access requests need an approver", "Submit the access request / grant SELECT to the service principal", "Wait for grant confirmation", "Rerun {pipeline}"],
    validation: ["SELECT privilege visible on the table for the service principal", "Rerun completed with result_state SUCCESS"],
    change: { label: "Privilege", current: "No access", recommended: "SELECT on sap_vendor_material" },
    solution: ["Approve the access grant (or approve the request to the data owner).", "Confirm that the permission removal was not intentional."],
    regression: {
      scenario: "Service principal loses SELECT on a source table",
      expectedBehavior: "Missing privilege is identified and access is requested/granted",
      expectedWorkflow: `${WF} → human approval → grant access → rerun → validation`,
    },
  },
  {
    key: "SCHEMA_MISMATCH",
    index: 6,
    label: "Schema Mismatch",
    recommendation: "REFRESH_SCHEMA",
    recommendationText: "Add the new column, refresh the schema, then rerun",
    remediationLabel: "Refresh schema",
    autoRemediable: true,
    autoRun: false,
    baseSeverity: "HIGH",
    errorCode: "SCHEMA_MISMATCH",
    errorMessage: "AnalysisException: cannot resolve column 'ZZ_PLANT_CATEGORY' — source schema has changed",
    executionStatus: "FAILED",
    failMinutes: 5,
    rootCause: "The SAP source added a new column that the target Delta table does not have yet.",
    investigation: [
      "Source extract has 14 columns; the target table has 13.",
      "The only difference is the new column ZZ_PLANT_CATEGORY (STRING).",
      "Change is additive — no existing column was renamed or removed.",
    ],
    analysisSteps: ["Read the AnalysisException", "Diff source and target schemas", "Classify the change as additive or breaking", "Check downstream consumers of the table"],
    remediationSteps: ["Validate guardrail: additive schema change is safe", "Run ALTER TABLE ... ADD COLUMNS ZZ_PLANT_CATEGORY STRING", "Refresh the table schema in Unity Catalog", "Rerun {pipeline}"],
    validation: ["Target table now has 14 columns", "Rerun completed with result_state SUCCESS"],
    change: { label: "Target schema", current: "13 columns", recommended: "14 columns (+ ZZ_PLANT_CATEGORY STRING)" },
    solution: ["Approve the schema refresh — the new column is added and the pipeline reruns.", "Confirm with downstream teams that the extra column is expected."],
    regression: {
      scenario: "New column appears in a source table",
      expectedBehavior: "Additive schema change is applied and the pipeline recovers",
      expectedWorkflow: `${WF} → human approval → refresh schema → rerun → validation`,
    },
  },
  {
    key: "DQ_FAILURE",
    index: 7,
    label: "Data Quality Failure",
    recommendation: "QUARANTINE_BAD_DATA",
    recommendationText: "Quarantine the affected records, correct and reload them, then validate",
    remediationLabel: "Quarantine / correct & reload",
    autoRemediable: true,
    autoRun: false,
    engineerFix: true,
    baseSeverity: "HIGH",
    errorCode: "PRIMARY_KEY_UNIQUENESS",
    errorMessage: "Data quality gate failed: Primary Key Uniqueness — 312 duplicate material IDs (MATNR) and 87 rows missing mandatory fields in sap_material_master",
    executionStatus: "FAILED",
    failMinutes: 12,
    rootCause: "The 02:10 UTC SAP Material Master source batch contains duplicate material identifiers and incomplete mandatory attributes, resulting in primary-key uniqueness and mandatory-field validation failures.",
    investigationSummary: "The latest SAP Material Master extract contains duplicate material IDs and missing mandatory attributes, causing data-quality validation failures.",
    investigation: [
      "Primary-key uniqueness check failed: 312 distinct MATNR values appear more than once.",
      "87 records have missing mandatory attributes (MTART or MEINS).",
      "The remaining 9,661 records passed the specified validation checks.",
      "All identified violations originate from a single source batch loaded at 02:10 UTC.",
    ],
    analysisSteps: [
      "Analysed the primary-key uniqueness validation failure.",
      "Identified duplicated MATNR values and the records involved.",
      "Checked mandatory-field completeness for MTART and MEINS.",
      "Traced affected records to their source batch and ingestion timestamp.",
      "Re-evaluated the remaining records against the applicable data-quality rules.",
    ],
    remediationSteps: ["Validate guardrail: quarantine is reversible", "Quarantine the 399 affected records (312 duplicates + 87 incomplete rows)", "Correct the records — de-duplicate on MATNR and fill mandatory fields from the source — and reload them", "Validate: re-run the Primary Key Uniqueness and mandatory-field checks"],
    validation: ["Primary Key Uniqueness check passed — 0 duplicate material IDs", "Mandatory-field check passed — 0 rows with missing MTART/MEINS"],
    solution: ["Quarantine the affected records, correct them (de-duplicate on MATNR, fill MTART/MEINS) and reload them, then re-run the data-quality checks.", "Ask the SAP extract team why duplicate material IDs were produced in the 02:10 UTC batch."],
    regression: {
      scenario: "Duplicate material IDs or missing mandatory fields in a source batch",
      expectedBehavior: "Affected records are quarantined, corrected and reloaded, and the data passes validation",
      expectedWorkflow: `Incident created → AI investigation → rejected and escalated to the data engineer → quarantine → correct/reload → validate`,
    },
  },
  {
    key: "DATA_CORRUPTION",
    index: 8,
    label: "Data Corruption",
    recommendation: "QUARANTINE_BAD_DATA",
    recommendationText: "Quarantine the corrupt files and reprocess the rest",
    remediationLabel: "Quarantine/reprocess",
    autoRemediable: true,
    autoRun: false,
    baseSeverity: "HIGH",
    errorCode: "CORRUPT_RECORD",
    errorMessage: "Malformed records detected: 3 Parquet files have an invalid footer",
    executionStatus: "FAILED",
    failMinutes: 14,
    rootCause: "Three source files were truncated during transfer and cannot be read.",
    investigation: [
      "3 of 214 files in the batch have an invalid Parquet footer.",
      "File sizes are ~40% smaller than their siblings — consistent with a truncated transfer.",
      "The remaining 211 files read correctly.",
    ],
    analysisSteps: ["Read the corrupt-record error", "Identify the unreadable files", "Compare file sizes and checksums", "Confirm the rest of the batch is intact"],
    remediationSteps: ["Validate guardrail: quarantine is reversible", "Move the 3 corrupt files to the quarantine location", "Reprocess the remaining 211 files", "Request a resend of the 3 files"],
    validation: ["Pipeline completed on the 211 valid files", "3 files held in quarantine for resend"],
    solution: ["Approve quarantine and reprocess — valid files are loaded now.", "Ask the source team to resend the 3 corrupted files."],
    regression: {
      scenario: "Truncated Parquet files in a source batch",
      expectedBehavior: "Corrupt files are quarantined and valid data is reprocessed",
      expectedWorkflow: `${WF} → human approval → quarantine → reprocess → validation`,
    },
  },
  {
    key: "CONNECTIVITY_FAILURE",
    index: 9,
    label: "Connectivity Failure",
    recommendation: "RERUN_PIPELINE",
    recommendationText: "Rerun the pipeline",
    remediationLabel: "Rerun",
    autoRemediable: true,
    autoRun: true,
    baseSeverity: "MEDIUM",
    errorCode: "CONNECTION_FAILED",
    errorMessage: "Task failed: connection to the SAP source endpoint timed out (java.net.SocketTimeoutException)",
    executionStatus: "FAILED",
    failMinutes: 4,
    rootCause: "A short-lived network outage broke the connection between the cluster and the source system mid-read.",
    investigation: [
      "Task 'read_source' lost its connection to the SAP endpoint after 2 internal retries.",
      "Network monitoring shows a 6-minute connectivity drop overlapping the run.",
      "The source endpoint is reachable again and no data or schema issue was found.",
    ],
    analysisSteps: ["Read task-level failure details", "Correlate with network and endpoint health", "Verify the source endpoint is reachable now", "Confirm no data-dependent error pattern"],
    remediationSteps: ["Guardrail check: connectivity failures may be rerun automatically", "Trigger a new run of {pipeline}", "Monitor until completion", "Validate task outputs"],
    validation: ["Rerun completed with result_state SUCCESS", "All 5 tasks finished without retries"],
    solution: ["Check network connectivity between the cluster and the source system for the time of the failure.", "Rerun {pipeline} once the connection is healthy.", "If the rerun fails again, open the task log and check the endpoint, firewall and credentials for the source connection."],
    regression: {
      scenario: "Source connection drops during a Procurement & Sales load",
      expectedBehavior: "Run is classified as a connectivity failure and rerun automatically — no approval needed",
      expectedWorkflow: `${WF} → automatic rerun → validation → resolved`,
    },
  },
  {
    key: "REPEATED_FAILURE",
    index: 10,
    label: "Repeated Failure",
    recommendation: "ESCALATE_INCIDENT",
    recommendationText: "Stop retrying and escalate to the pipeline owner",
    aiLimit: "The pipeline keeps failing for different reasons, so another retry would not help. AI stops the retry loop and hands the problem to a person.",
    remediationLabel: "Stop retry loop / escalate",
    autoRemediable: false,
    autoRun: false,
    baseSeverity: "HIGH",
    errorCode: "REPEATED_FAILURE",
    errorMessage: "Pipeline failed 4 consecutive runs; automatic retries are exhausted",
    executionStatus: "FAILED",
    failMinutes: 9,
    rootCause: "The same pipeline has failed four runs in a row with different symptoms — retrying again would not help.",
    investigation: [
      "4 consecutive failures in the last 6 hours (3 different error codes).",
      "Reruns after each failure did not change the outcome.",
      "Guardrail blocks further automatic retries to avoid a retry storm.",
    ],
    analysisSteps: ["Pull the last 10 runs of the pipeline", "Compare error codes across failures", "Check retry history against the guardrail limit", "Decide whether automation is still safe"],
    remediationSteps: ["Stop the automatic retry loop", "Pause the pipeline schedule", "Escalate to the pipeline owner by email", "Wait for human investigation"],
    validation: ["Retry loop stopped — no further automatic runs scheduled", "Owner notified and incident marked ESCALATED"],
    solution: ["Do not rerun again. Review the last 4 failed runs and identify the common cause.", "Resume the schedule only after the cause is fixed."],
    regression: {
      scenario: "Four consecutive failures with no successful run in between",
      expectedBehavior: "Automatic retries stop and the incident is escalated to a human",
      expectedWorkflow: `${WF} → stop retry loop → email escalation`,
    },
  },
];

export const FAILURE_BY_KEY: Record<FailureKey, FailureTypeDef> = Object.fromEntries(FAILURE_TYPES.map((f) => [f.key, f])) as Record<FailureKey, FailureTypeDef>;

export function guardrailId(def: FailureTypeDef): string {
  return `GR-${String(def.index).padStart(3, "0")}`;
}
