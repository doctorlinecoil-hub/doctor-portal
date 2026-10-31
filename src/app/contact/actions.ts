'use server';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { SETTINGS_DEFAULTS, notifyList, type Settings } from '@/lib/constants';
import { sendMail } from '@/lib/mail';
import { callbackStaffEmail } from '@/lib/emails';

/* "Call me back" from the public site. Runs with the service key, so everything is checked here. */

const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const KINDS: Record<string, string> = { law: 'משרד עורכי דין', broker: 'מתווך / חברה', patient: 'מטופל', other: 'אחר' };

export async function requestCallback(input: { name: string; phone: string; kind: string; note?: string; source?: string; website?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.website) return { ok: true }; // a bot filled the hidden field
  const name = clean(input.name, 120);
  const phone = clean(input.phone, 30);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return { ok: false, error: 'נא למלא שם.' };
  if (digits.length < 9 || digits.length > 13) return { ok: false, error: 'נא למלא מספר טלפון תקין.' };
  const kind = KINDS[input.kind] ?? KINDS.other;
  const note = clean(input.note, 600);
  const source = clean(input.source, 200);

  const db = createAdminClient();
  const h = await headers();
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim() || 'unknown';
  const who = createHash('sha256').update('ip:' + ip).digest('hex').slice(0, 32);
  // record first, then count (parallel requests can't slip past)
  await db.from('audit_log').insert({ user_id: null, action: 'callback', entity: 'callback', entity_id: null, details: { who } });
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'callback').gte('at', hourAgo).contains('details', { who }),
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'callback').gte('at', hourAgo),
  ]);
  if ((mine ?? 0) > 3 || (all ?? 0) > 40) return { ok: false, error: 'התקבלו הרבה פניות. נסו שוב מאוחר יותר או התקשרו אלינו.' };

  const { error } = await db.from('callbacks').insert({ name, phone, kind, note, source });
  if (error) return { ok: false, error: 'לא הצלחנו לשמור את הפנייה. נסו שוב או התקשרו אלינו.' };

  const { data: s0 } = await db.from('settings').select('*').eq('id', 1).single();
  const s = { ...SETTINGS_DEFAULTS, ...(s0 as Settings) } as Settings;
  const { data: staff } = await db.from('profiles').select('id, email').in('role', ['doctor', 'admin']).eq('active', true);
  if (staff?.length) {
    await db.from('notifications').insert(staff.map((p) => ({ user_id: p.id, kind: 'callback', title: `לחזור אל ${name}`, body: `${kind} · ${phone}${note ? ` · ${note}` : ''}`.slice(0, 500), link: '/doctor' })));
  }
  const to = notifyList(s).length ? notifyList(s) : (staff ?? []).map((p) => p.email as string);
  if (to.length) await sendMail(db, null, 'callback', { to, ...callbackStaffEmail(s, { name, phone, kind, note, source }) });
  return { ok: true };
}
