// lib/terminal-context.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  PaperResponse,
  ResearchResponse,
  ScanResponse,
  ScanSignal,
  SettingsResponse,
  StrategyRow,
} from "./dashboard-types";

interface TerminalData {
  research: ResearchResponse | null;
  scan: ScanResponse | null;
  paper: PaperResponse | null;
  settings: SettingsResponse | null;
  lastScan: number | null;
  refreshAll: () => void;
  reloadSettings: () => void;
  // Convenience selectors
  selectedStrategy: StrategyRow | null;
  signalFor: (sym: string) => ScanSignal | null;
  prices: Record<string, number | undefined>;
}

const Ctx = createContext<TerminalData | null>(null);

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [paper, setPaper] = useState<PaperResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [lastScan, setLastScan] = useState<number | null>(null);

  const loadResearch = useCallback(async () => {
    const d = await getJSON<ResearchResponse>("/api/research");
    if (d) setResearch(d);
  }, []);
  const loadScan = useCallback(async () => {
    const d = await getJSON<ScanResponse>("/api/scan");
    if (d) {
      setScan(d);
      setLastScan(Date.now());
    }
  }, []);
  const loadPaper = useCallback(async () => {
    const d = await getJSON<PaperResponse>("/api/paper");
    if (d) setPaper(d);
  }, []);
  const reloadSettings = useCallback(async () => {
    const d = await getJSON<SettingsResponse>("/api/settings");
    if (d) setSettings(d);
  }, []);

  const refreshAll = useCallback(() => {
    loadResearch();
    loadScan();
    loadPaper();
    reloadSettings();
  }, [loadResearch, loadScan, loadPaper, reloadSettings]);

  useEffect(() => {
    refreshAll();
    const s = setInterval(loadScan, 30_000);
    const p = setInterval(loadPaper, 60_000);
    return () => {
      clearInterval(s);
      clearInterval(p);
    };
  }, [refreshAll, loadScan, loadPaper]);

  const selectedStrategy =
    research?.strategies.find((s) => s.id === research.selectedStrategyId) ?? null;

  const signalFor = (sym: string): ScanSignal | null =>
    scan?.signals.find((s) => s.symbol === sym) ?? null;

  const prices: Record<string, number | undefined> = {
    BTCUSDT: signalFor("BTCUSDT")?.price,
    ETHUSDT: signalFor("ETHUSDT")?.price,
  };

  return (
    <Ctx.Provider
      value={{
        research,
        scan,
        paper,
        settings,
        lastScan,
        refreshAll,
        reloadSettings,
        selectedStrategy,
        signalFor,
        prices,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTerminal(): TerminalData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider");
  return ctx;
}
