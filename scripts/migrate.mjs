// Applies supabase/migrations/*.sql once each. Runs before every build.
// Skips quietly when no database URL is configured.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  console.log('[migrate] no database URL found, skipping migrations');
  process.exit(0);
}

const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
const ssl = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString, ssl });
const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

try {
  await client.connect();
  await client.query('create schema if not exists app_private');
  await client.query('create table if not exists app_private.migrations (name text primary key, applied_at timestamptz not null default now())');
  const { rows } = await client.query('select name from app_private.migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into app_private.migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }
  console.log('[migrate] database is up to date');
  await scheduleTick(client);
} catch (e) {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

/*
 * The database calls the site every 10 minutes (reminders 3 days and 2 hours before, expired deposit holds).
 * Uses Supabase's pg_cron and pg_net. Never fails the build: without them, the daily Vercel Cron still runs.
 */
async function scheduleTick(db) {
  const base = (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return console.log('[migrate] no public URL, skipping the scheduler');
  try {
    await db.query("update app_private.cron_target set url = $1 where id = 1", [base]);
    await db.query('create extension if not exists pg_net with schema extensions');
    await db.query('create extension if not exists pg_cron with schema pg_catalog');
    await db.query(`select cron.schedule('portal-tick', '*/10 * * * *', $job$
      select net.http_get(
        url := t.url || '/api/cron/tick',
        headers := jsonb_build_object('x-cron-key', t.key),
        timeout_milliseconds := 120000
      ) from app_private.cron_target t where t.id = 1 and t.url like 'https://%'
    $job$)`);
    console.log('[migrate] scheduler: every 10 minutes ->', base);
  } catch (e) {
    console.log('[migrate] scheduler not set up:', e.message);
  }
}
