import { requireUser } from '@/lib/auth';
import { ilParts, todayIL } from '@/lib/dates';
import { TEMPLATES, waEnabled, waPhone } from '@/lib/whatsapp';
import type { ThreadItem } from './Inbox';
import WaScreen from './WaScreen';

export const dynamic = 'force-dynamic';

type Msg = { id: string; appointment_id: string | null; phone: string; name: string; direction: 'in' | 'out'; kind: string; body: string; status: string; error: string; seen_at: string | null; created_at: string; bot: boolean };
type Ses = { phone: string; mode: 'bot' | 'human'; human_until: string | null; done_at: string | null; step: string };

const local = (p: string) => (p.startsWith('972') ? `0${p.slice(3, 5)}-${p.slice(5)}` : p);

/** WhatsApp: every conversation with patients – the assistant's answers, the automatic messages, and the clinic's replies. */
export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p = '' } = await searchParams;
  const { supabase, settings } = await requireUser(['doctor', 'admin']);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data }, { data: ses }, { count: booked }] = await Promise.all([
    supabase.from('wa_messages').select('id, appointment_id, phone, name, direction, kind, body, status, error, seen_at, created_at, bot').order('created_at', { ascending: false }).limit(3000),
    supabase.from('wa_sessions').select('phone, mode, human_until, done_at, step'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('source', 'whatsapp').gte('created_at', weekAgo),
  ]);
  const rows = (data as Msg[] | null) ?? [];
  const sessions = new Map(((ses as Ses[] | null) ?? []).map((x) => [x.phone, x]));
  const caseIds = [...new Set(rows.map((r) => r.appointment_id).filter(Boolean))] as string[];
  const { data: appts } = caseIds.length ? await supabase.from('appointments').select('id, patient_name').in('id', caseIds.slice(0, 500)) : { data: [] };
  const patient = new Map(((appts ?? []) as { id: string; patient_name: string }[]).map((a) => [a.id, a.patient_name]));
  const humanNow = (x?: Ses) => !!x && x.mode === 'human' && (!x.human_until || new Date(x.human_until).getTime() > Date.now());

  const threads = new Map<string, ThreadItem>();
  for (const r of rows) {
    let t = threads.get(r.phone);
    if (!t) {
      const se = sessions.get(r.phone);
      t = { phone: r.phone, local: local(r.phone), name: '', last: { body: r.kind in TEMPLATES ? TEMPLATES[r.kind as keyof typeof TEMPLATES].title : r.body, at: r.created_at, out: r.direction === 'out', bot: r.bot }, unread: 0, caseId: null, human: humanNow(se), waiting: false };
      threads.set(r.phone, t);
    }
    if (!t.name) t.name = (r.appointment_id && patient.get(r.appointment_id)) || r.name || '';
    if (!t.caseId && r.appointment_id) t.caseId = r.appointment_id;
    if (r.direction === 'in' && !r.seen_at) t.unread++;
  }
  for (const t of threads.values()) {
    const se = sessions.get(t.phone);
    // waiting for the clinic: asked for a person, or wrote and nobody answered by hand yet
    t.waiting = t.human || (t.unread > 0 && !(se?.done_at && new Date(se.done_at).getTime() > new Date(t.last.at).getTime()) && !t.last.out);
  }
  const list = [...threads.values()];
  const sel = /^\d{8,15}$/.test(p) ? threads.get(p) ?? null : null;
  const msgs = sel ? rows.filter((r) => r.phone === sel.phone).reverse() : [];
  if (sel && sel.unread) {
    await supabase.from('wa_messages').update({ seen_at: new Date().toISOString() }).eq('phone', sel.phone).eq('direction', 'in').is('seen_at', null);
  }
  const lastIn = msgs.filter((m) => m.direction === 'in').at(-1);
  const leftMs = lastIn ? 24 * 3600_000 - (Date.now() - new Date(lastIn.created_at).getTime()) : 0;
  const open = leftMs > 0;

  // the patient's upcoming appointments (by phone), for the side panel
  let upcoming: { id: string; starts_at: string; status: string; service_label: string | null }[] = [];
  if (sel) {
    const { data: up } = await supabase.from('appointments').select('id, starts_at, status, service_label, patient_phone')
      .in('status', ['pending', 'booked']).gt('starts_at', new Date().toISOString()).not('patient_phone', 'is', null).order('starts_at').limit(400);
    upcoming = ((up ?? []) as (typeof upcoming[number] & { patient_phone: string })[]).filter((a) => waPhone(a.patient_phone) === sel.phone).slice(0, 4);
  }
  const waiting = list.filter((t) => t.waiting).length;
  const today = list.filter((t) => ilParts(t.last.at).date === todayIL()).length;
  const botOn = waEnabled() && settings.whatsapp_on !== false && settings.whatsapp_bot !== false;

  return (
    <WaScreen list={list} sel={sel} msgs={msgs} upcoming={upcoming} waiting={waiting} today={today} booked={booked ?? 0}
      tags={Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.title]))}
      connected={waEnabled()} botOn={botOn} open={open} leftMs={leftMs}
      clinic={{ address: settings.lh_address || '', phone: settings.lh_phone || '' }} />
  );
}
