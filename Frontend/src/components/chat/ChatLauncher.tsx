"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { AGENTS } from "@/config/agentConfig";

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const genieName = AGENTS.genie.name;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? `Close Genie (${genieName})` : `Open Genie (${genieName})`}
        aria-expanded={open}
        className="fixed bottom-5 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-[0_10px_34px_-8px_rgb(168_23_28/0.7)] ring-1 ring-inset ring-white/20 transition-transform duration-200 hover:scale-105 active:scale-95 sm:right-6"
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
        {!open && <span className="absolute right-1 top-1 size-2 rounded-full bg-success-500 ring-2 ring-accent-500" />}
      </button>

      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}
