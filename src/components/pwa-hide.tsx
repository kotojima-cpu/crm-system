"use client";

import { useIsPwa } from "./pwa-context";

export function PwaHide({ children }: { children: React.ReactNode }) {
  const isPwa = useIsPwa();
  if (isPwa) return null;
  return <>{children}</>;
}
