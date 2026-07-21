"use client";

import { useEffect } from "react";

// Registers the app-shell service worker so the UI works offline (production
// only — in dev the SW would fight Turbopack's live reload).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing (private mode, unsupported) is non-fatal.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
