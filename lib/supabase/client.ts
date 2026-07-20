"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

let cached: SupabaseClient | null = null;

/** Browser Supabase client, or null when account features are not configured. */
export function getSupabaseBrowser(): SupabaseClient | null {
  const config = supabasePublicConfig();
  if (!config) return null;
  if (!cached) {
    cached = createBrowserClient(config.url, config.anonKey);
  }
  return cached;
}
