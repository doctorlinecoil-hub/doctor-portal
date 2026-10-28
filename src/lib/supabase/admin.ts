import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serviceRoleKey, supabaseConfig } from '@/lib/env';

// Full-access client. Use only on the server, after checking the caller is an admin.
export function createAdminClient() {
  const { url } = supabaseConfig();
  return createClient(url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
