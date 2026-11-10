"use client";

import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useOps } from "@/ops/store";

function PageSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading">
      <div className="px-4 pt-7 sm:px-8">
        <div className="skeleton h-8 w-64 rounded-md" />
        <div className="skeleton mt-3 h-4 w-96 max-w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-36 rounded-xl border border-border" />
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // The demo data is generated in the browser so the 15-day window always ends on the viewer's current date.
  const { ready } = useOps();

  // One delegated pointer listener feeds the cursor-lit surfaces (--mx / --my), batched per frame.
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-spotlight]");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="grain bg-atmosphere flex h-dvh w-full overflow-hidden">
      <a href="#main" className="sr-only z-[80] rounded-md bg-surface px-3 py-2 text-sm text-text-primary focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          {ready ? children : <PageSkeleton />}
        </main>
      </div>
    </div>
  );
}
