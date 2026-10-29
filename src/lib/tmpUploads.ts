import 'server-only';
import { createAdminClient } from './supabase/admin';
import { BUCKET } from './constants';

/** Temporary uploads nobody booked with (older than a day). Called by the daily job. */
export async function cleanupTmpUploads() {
  const db = createAdminClient();
  const { data: dirs } = await db.storage.from(BUCKET).list('tmp', { limit: 500 });
  const old = Date.now() - 86_400_000;
  let removed = 0;
  for (const d of dirs ?? []) {
    const { data: files } = await db.storage.from(BUCKET).list(`tmp/${d.name}`, { limit: 100 });
    const stale = (files ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() < old).map((f) => `tmp/${d.name}/${f.name}`);
    if (stale.length) { await db.storage.from(BUCKET).remove(stale); removed += stale.length; }
  }
  return removed;
}
