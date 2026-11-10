import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { SidebarNav } from "./SidebarNav";

export function SidebarFooter() {
  return (
    <div className="p-3">
      <div data-spotlight className="rounded-xl border border-border bg-tint-1 p-3">
        <p className="flex items-center gap-2 text-[11px] font-medium text-text-secondary">
          <span className="relative flex size-2">
            <span className="animate-ping-ring absolute inset-0 rounded-full bg-success-500" />
            <span className="relative size-2 rounded-full bg-success-500" />
          </span>
          All agents online
        </p>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-text-tertiary">
          Production · Unity Catalog
          <br />
          Investigation · SLA · DQ
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("hidden w-[248px] shrink-0 flex-col border-r border-border bg-navy-950 lg:flex", className)}>
      <div className="flex h-16 items-center gap-3 px-5">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-text-primary">Sentinel</p>
          <p className="text-[10px] font-medium tracking-wide text-text-tertiary">AI-powered pipeline operations</p>
        </div>
      </div>
      <SidebarNav />
      <SidebarFooter />
    </aside>
  );
}
