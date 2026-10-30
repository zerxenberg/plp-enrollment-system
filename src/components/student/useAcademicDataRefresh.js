"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh server-verified student data after another role changes grades,
 * academic evaluation, sections or Registrar enrollment confirmation.
 * Only refresh while visible; never infer eligibility from client state. */
export function useAcademicDataRefresh(enabled) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return undefined;
    let lastRefresh = Date.now();
    const refresh = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || now - lastRefresh < 30000) return;
      lastRefresh = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [enabled, router]);
}
