import 'server-only';
import { gzipSync } from 'node:zlib';
import { createAdminClient } from './supabase/admin';
import { SETTINGS_DEFAULTS, type Settings, notifyList } from './constants';
import { appUrl, sendMail } from './mail';
import { backupEmail } from './emails';
import { ilParts, todayIL } from './dates';

/*
 * Daily backup to the clinic admin by email: every table as one compressed JSON file (to restore from),
 * plus a readable list of all the cases (CSV, opens in Excel). Uploaded files stay in storage (only counted).
 */

const TABLES: [string, string][] = [
  ['appointments', '*'], ['letters', '*'], ['payments', '*'], ['firms', '*'], ['firm_prices', '*'],
  ['profiles', 'id, role, firm_id, full_name, email, active, created_at'], ['case_notes', '*'], ['documents', '*'],
  ['prescriptions', '*'], ['case_diagnoses', '*'], ['reschedule_requests', '*'], ['time_blocks', '*'],
  ['services', '*'], ['letter_templates', '*'], ['drug_favorites', '*'], ['settings', '*'],
];
const LABELS: Record<string, string> = {
  appointments: 'תיקים', letters: 'מכתבים', payments: 'תשלומים', firms: 'מפנים', profiles: 'משתמשים',
  documents: 'מסמכים שהועלו', prescriptions: 'מרשמים',
};
const MAX_ATTACH = 20 * 1024 * 1024;

const csvCell = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function all(db: ReturnType<typeof createAdminClient>, table: string, cols: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) break;
    out.push(...((data as unknown as Record<string, unknown>[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Sends the backup (once a day unless forced). Returns a short status line. */
export async function sendBackup(opts: { force?: boolean } = {}): Promise<{ ok: boolean; info: string }> {
  const db = createAdminClient();
  const today = todayIL();
  const kind = `backup_${today}`;
  if (!opts.force) {
    const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('kind', kind).eq('status', 'sent');
    if ((count ?? 0) > 0) return { ok: true, info: 'כבר נשלח היום' };
  }
  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  const { data: admins } = await db.from('profiles').select('email').eq('role', 'admin').eq('active', true);
  // the system admin, and the doctor's notification addresses (so a copy of everything is always in his mailbox)
  const to = [...new Set([...((admins as { email: string }[] | null) ?? []).map((a) => a.email), ...notifyList(s)].filter(Boolean).map((e) => e.toLowerCase()))];
  if (!to.length) return { ok: false, info: 'אין כתובת מייל לגיבוי' };

  const data: Record<string, Record<string, unknown>[]> = {};
  for (const [t, cols] of TABLES) data[t] = await all(db, t, cols);
  const firmName = new Map(data.firms.map((f) => [f.id, f.name]));
  const paid = new Map<string, number>();
  for (const p of data.payments) paid.set(String(p.appointment_id), (paid.get(String(p.appointment_id)) ?? 0) + Number(p.amount || 0));

  const head = ['מספר תיק', 'תאריך', 'שעה', 'מטופל', 'ת.ז.', 'טלפון', 'מייל', 'מפנה', 'שירות', 'סטטוס', 'מחיר', 'שולם', 'מסמך נשלח'];
  const rows = [...data.appointments].sort((a, b) => Number(a.case_no) - Number(b.case_no)).map((a) => {
    const p = ilParts(String(a.starts_at));
    return [a.case_no, p.date, p.time, a.patient_name, a.patient_id_number, a.patient_phone, a.patient_email, firmName.get(a.firm_id) ?? '', a.service_label || a.referral_type, a.status, a.price, paid.get(String(a.id)) ?? 0, a.letter_sent_at ? 'כן' : ''];
  });
  const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const gz = gzipSync(Buffer.from(JSON.stringify({ created_at: new Date().toISOString(), app: 'doctor-portal', tables: data })), { level: 9 });
  const attached = gz.length <= MAX_ATTACH;
  const filesBytes = data.documents.reduce((x, d) => x + Number(d.size_bytes || 0), 0);
  const counts = Object.entries(LABELS).map(([t, l]) => [l, data[t]?.length ?? 0] as [string, number]);

  const r = await sendMail(db, null, kind, {
    to,
    ...backupEmail(s, { date: today, counts, files: data.documents.length, filesMb: Math.round(filesBytes / 1048576), attached, link: `${appUrl()}/doctor` }),
    attachments: [
      { filename: `תיקים-${today}.csv`, content: Buffer.from(csv, 'utf8'), contentType: 'text/csv; charset=utf-8' },
      ...(attached ? [{ filename: `backup-${today}.json.gz`, content: gz, contentType: 'application/gzip' }] : []),
    ],
  });
  return r.ok ? { ok: true, info: `הגיבוי נשלח ל־${to.join(', ')}` } : { ok: false, info: r.error || 'השליחה נכשלה' };
}
