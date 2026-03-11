"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const PwaContext = createContext(false);

function subscribeToDisplayMode(callback: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getDisplayModeSnapshot() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function getServerSnapshot() {
  return false;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const isStandalone = useSyncExternalStore(
    subscribeToDisplayMode,
    getDisplayModeSnapshot,
    getServerSnapshot
  );

  return <PwaContext value={isStandalone}>{children}</PwaContext>;
}

export function useIsPwa() {
  return useContext(PwaContext);
}
