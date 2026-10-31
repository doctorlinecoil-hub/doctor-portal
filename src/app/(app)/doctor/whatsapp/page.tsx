import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import LiveRefresh from '@/components/LiveRefresh';
import Icon from '@/components/Icon';
import { fmtDate, ilParts, todayIL } from '@/lib/dates';
import { TEMPLATES, waEnabled } from '@/lib/whatsapp';
import Reply from './Reply';

export const dynamic = 'force-dynamic';

type Row = { id: string; appointment_id: string | null; phone: string; name: string; direction: 'in' | 'out'; kind: string; body: string; status: string; error: string; seen_at: string | null; created_at: string };
type Thread = { phone: string; name: string; last: Row; unread: number; caseId: string | null };

const local = (p: string) => (p.startsWith('972') ? `0${p.slice(3, 5)}-${p.slice(5)}` : p);
const stamp = (iso: string) => { const p = ilParts(iso); return p.date === todayIL() ? p.time : `${fmtDate(p.date)} ${p.time}`; };
const TICK: Record<string, string> = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠', received: '' };

/** Every WhatsApp conversation with patients: the automatic messages, their replies, and the doctor's answers. */
export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p = '' } = await searchParams;
  const { supabase } = await requireUser(['doctor', 'admin']);
  const { data } = await supabase.from('wa_messages').select('id, appointment_id, phone, name, direction, kind, body, status, error, seen_at, created_at').order('created_at', { ascending: false }).limit(2000);
  const rows = (data as Row[] | null) ?? [];
  const caseIds = [...new Set(rows.map((r) => r.appointment_id).filter(Boolean))] as string[];
  const { data: appts } = caseIds.length ? await supabase.from('appointments').select('id, patient_name').in('id', caseIds.slice(0, 500)) : { data: [] };
  const patient = new Map(((appts ?? []) as { id: string; patient_name: string }[]).map((a) => [a.id, a.patient_name]));

  const threads = new Map<string, Thread>();
  for (const r of rows) {
    const t = threads.get(r.phone) ?? { phone: r.phone, name: '', last: r, unread: 0, caseId: null };
    if (!t.name) t.name = (r.appointment_id && patient.get(r.appointment_id)) || r.name || '';
    if (!t.caseId && r.appointment_id) t.caseId = r.appointment_id;
    if (r.direction === 'in' && !r.seen_at) t.unread++;
    threads.set(r.phone, t);
  }
  const list = [...threads.values()];
  const sel = /^\d{8,15}$/.test(p) ? threads.get(p) ?? null : null;
  const msgs = sel ? rows.filter((r) => r.phone === sel.phone).reverse() : [];
  if (sel && sel.unread) {
    await supabase.from('wa_messages').update({ seen_at: new Date().toISOString() }).eq('phone', sel.phone).eq('direction', 'in').is('seen_at', null);
  }
  const lastIn = msgs.filter((m) => m.direction === 'in').at(-1);
  const open = !!lastIn && Date.now() - new Date(lastIn.created_at).getTime() < 24 * 3600_000;
  const label = (m: Row) => (m.kind in TEMPLATES ? TEMPLATES[m.kind as keyof typeof TEMPLATES].title : '');

  return (
    <div className={`wa${sel ? ' wa-has-sel' : ''}`}>
      <LiveRefresh every={15} />
      <aside className="wa-list" aria-label="שיחות">
        <header className="wa-list-head">
          <h1><Icon name="message" size={20} />שיחות וואטסאפ</h1>
          <small>{waEnabled() ? 'מחובר · ההודעות האוטומטיות והתשובות של המטופלים' : 'וואטסאפ עוד לא מחובר. אחרי החיבור כל השיחות יופיעו כאן.'}</small>
        </header>
        {list.length === 0 && <div className="wa-empty">עוד אין שיחות.</div>}
        <ul>
          {list.map((t) => (
            <li key={t.phone}>
              <Link href={`/doctor/whatsapp?p=${t.phone}`} className={`wa-th${sel?.phone === t.phone ? ' on' : ''}${t.unread ? ' unread' : ''}`}>
                <span className="wa-av">{(t.name || '?').trim().slice(0, 1)}</span>
                <span className="wa-th-m">
                  <b>{t.name || local(t.phone)}</b>
                  <small>{t.last.direction === 'out' ? '← ' : ''}{(label(t.last) || t.last.body).slice(0, 70)}</small>
                </span>
                <span className="wa-th-s"><small>{stamp(t.last.created_at)}</small>{t.unread > 0 && <i>{t.unread}</i>}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className="wa-chat" aria-label="שיחה">
        {!sel ? (
          <div className="wa-empty big"><Icon name="message" size={34} /><p>בחרו שיחה מהרשימה</p></div>
        ) : (
          <>
            <header className="wa-chat-head">
              <Link href="/doctor/whatsapp" className="wa-back" aria-label="חזרה לרשימה">→</Link>
              <span className="wa-av">{(sel.name || '?').trim().slice(0, 1)}</span>
              <div><b>{sel.name || local(sel.phone)}</b><small dir="ltr">{local(sel.phone)}</small></div>
              {sel.caseId && <Link href={`/doctor/cases/${sel.caseId}`} className="btn btn-sm">לתיק המטופל</Link>}
            </header>
            <div className="wa-msgs">
              {msgs.map((m) => (
                <div key={m.id} className={`wa-b ${m.direction}${m.status === 'failed' ? ' failed' : ''}`}>
                  {label(m) && <span className="wa-tag">{label(m)} · נשלח אוטומטית</span>}
                  <p>{m.body}</p>
                  <span className="wa-meta">{stamp(m.created_at)}{m.direction === 'out' && <em className={m.status === 'read' ? 'read' : ''}>{TICK[m.status] ?? ''}</em>}</span>
                  {m.status === 'failed' && m.error && <span className="wa-err">לא נשלח: {m.error}</span>}
                </div>
              ))}
            </div>
            <Reply phone={sel.phone} open={open} />
          </>
        )}
      </section>
    </div>
  );
}
