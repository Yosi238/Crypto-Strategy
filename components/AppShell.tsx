// components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { TerminalProvider } from "@/lib/terminal-context";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <TerminalProvider>
      <div className="app-grid">
        <Sidebar />
        <div className="flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-5 md:p-6 max-w-[1500px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </TerminalProvider>
  );
}
