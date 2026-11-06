import { AlertCircle, AlertTriangle, Info, type LucideIcon } from "lucide-react";
import type { Severity } from "@/ops/types";
import { SEVERITY_STYLES } from "@/ops/styles";
import { cn } from "@/lib/utils";

const LOOK: Record<Severity, { icon: LucideIcon; box: string }> = {
  CRITICAL: { icon: AlertTriangle, box: "bg-danger-50 text-danger-600 ring-danger-500/25" },
  HIGH: { icon: AlertCircle, box: "bg-danger-50 text-danger-600 ring-danger-500/20" },
  MEDIUM: { icon: AlertCircle, box: "bg-warning-50 text-warning-600 ring-warning-500/20" },
  LOW: { icon: Info, box: "bg-neutral-50 text-neutral-600 ring-neutral-500/20" },
};

/** Severity as a small tinted box holding the icon and bold label together. */
export function SeverityLabel({ severity }: { severity: Severity }) {
  const { icon: Icon, box } = LOOK[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", box)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {SEVERITY_STYLES[severity].label}
    </span>
  );
}
