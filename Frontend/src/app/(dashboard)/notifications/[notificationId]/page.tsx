"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { toneStyle } from "@/lib/constants";
import { FAILURE_BY_KEY } from "@/ops/failureTypes";
import { useOps } from "@/ops/store";
import { formatDateTime } from "@/lib/utils";

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-text-primary">{children}</p>
    </div>
  );
}

export default function NotificationDetailPage() {
  const params = useParams<{ notificationId: string }>();
  const router = useRouter();
  const { notifications } = useOps();
  const n = notifications.find((x) => x.id === decodeURIComponent(params.notificationId));

  if (!n) {
    return (
      <EmptyState
        title="Notification not found"
        description="No email or escalation matches this ID."
        className="py-24"
        action={
          <button onClick={() => router.push("/notifications")} className="text-xs font-medium text-accent-600 hover:text-accent-700">
            Back to notifications
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={<span className="font-mono text-lg">{n.id}</span>}
        breadcrumbs={[{ label: "Notifications", href: "/notifications" }, { label: n.id }]}
        badge={<StatusBadge style={n.kind === "Escalation" ? toneStyle("Escalation", "warning") : toneStyle("Email", "info")} size="md" />}
        actions={
          <button
            onClick={() => router.push("/notifications")}
            className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted"
          >
            <ArrowLeft className="size-3.5" />
            All notifications
          </button>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:px-8 sm:pb-10 sm:pt-6">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Kv label="Incident">
              <Link href={`/incidents/${n.incidentId}`} className="font-mono text-xs text-accent-600 hover:underline">
                {n.incidentId}
              </Link>
            </Kv>
            <Kv label="Pipeline">{n.pipeline}</Kv>
            <Kv label="Failure type">{FAILURE_BY_KEY[n.failureKey].label}</Kv>
            <Kv label="To">
              {n.recipient.name} &lt;{n.recipient.email}&gt;
            </Kv>
            <Kv label="Cc">{n.cc.join(", ")}</Kv>
            <Kv label="Sent">
              {formatDateTime(n.sentAt)} UTC · {n.sentBy}
            </Kv>
          </div>
        </div>

        <Card>
          <CardHeader title="Subject" />
          <CardBody>
            <p className="text-sm font-medium text-text-primary">{n.subject}</p>
            <p className="mt-3 text-[11px] font-medium text-text-tertiary">Reason</p>
            <p className="mt-1 text-sm text-text-secondary">{n.reason}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Resolution" description="What the recipient is asked to do." />
          <CardBody>
            <ul className="space-y-2">
              {n.resolution.map((r, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-text-primary">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" />
                  {r}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Email content" />
          <CardBody>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-subtle p-4 font-sans text-sm leading-relaxed text-text-secondary">
              {n.body.split("\n").map((line, i) => {
                // Under the "Incident: INC-…" line: a "View incident" placeholder link (not clickable yet).
                const isIncidentLine = /^Incident: INC-[A-Z0-9]+$/.test(line);
                return (
                  <span key={i}>
                    {line}
                    {isIncidentLine && (
                      <>
                        {"\n"}
                        <span className="cursor-default text-text-tertiary underline underline-offset-2">View incident</span>
                      </>
                    )}
                    {"\n"}
                  </span>
                );
              })}
            </pre>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
