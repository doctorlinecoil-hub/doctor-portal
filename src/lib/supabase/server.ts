import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseConfig();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a server component: the middleware refreshes cookies instead
        }
      },
    },
  });
}
