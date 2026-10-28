'use client';
import { createContext, useContext, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const Ctx = createContext<{ url: string; anonKey: string } | null>(null);
let cached: { key: string; client: SupabaseClient } | null = null;

export function SupabaseProvider({ url, anonKey, children }: { url: string; anonKey: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ url, anonKey }), [url, anonKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupabase(): SupabaseClient {
  const cfg = useContext(Ctx);
  if (!cfg) throw new Error('SupabaseProvider missing');
  const key = cfg.url + cfg.anonKey;
  if (!cached || cached.key !== key) cached = { key, client: createBrowserClient(cfg.url, cfg.anonKey) };
  return cached.client;
}
