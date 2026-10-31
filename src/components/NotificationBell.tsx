'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { fmtStamp } from '@/lib/dates';
import Icon from './Icon';

type N = { id: number; kind: string; title: string; body: string; link: string; created_at: string; read_at: string | null };

const ICON: Record<string, string> = {
  new_request: 'inbox', approved: 'checkCircle', declined: 'x', cancelled: 'x', letter_ready: 'fileCheck', moved: 'calendar',
  new_document: 'upload', new_note: 'info', doc_request: 'flag', reschedule: 'calendar', reschedule_declined: 'x', booked_by_clinic: 'calendarPlus',
  payment_proof: 'wallet', deposit_proof: 'wallet', payment_reply: 'mail',
};

/** In-app notifications: new requests, approvals, documents, letters. Refreshes every 45 seconds. */
export default function NotificationBell({ dark, on }: { dark?: boolean; on: 'desktop' | 'mobile' }) {
  // two places in the layout (side bar / top bar); only the visible one runs
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)');
    const set = () => setVisible(on === 'mobile' ? mq.matches : !mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, [on]);
  return visible ? <Bell dark={dark} /> : null;
}

function Bell({ dark }: { dark?: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [list, setList] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const box = useRef<HTMLDivElement | null>(null);
  const unread = list.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('id, kind, title, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(30);
    if (data) setList(data as N[]);
  }, [supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 45_000);
    const f = () => load();
    window.addEventListener('focus', f);
    return () => { clearInterval(t); window.removeEventListener('focus', f); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open]);

  async function go(n: N) {
    setOpen(false);
    if (!n.read_at) {
      setList((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    const to = target(n);
    if (to) router.push(to);
  }
  async function readAll() {
    const now = new Date().toISOString();
    setList((l) => l.map((x) => ({ ...x, read_at: x.read_at ?? now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }

  const shown = filter === 'unread' ? list.filter((n) => !n.read_at) : list;
  const groups: { label: string; items: N[] }[] = [];
  for (const n of shown) {
    const label = dayLabel(n.created_at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(n); else groups.push({ label, items: [n] });
  }

  return (
    <div className={`bell${dark ? ' dark' : ''}`} ref={box}>
      <button type="button" className="bell-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={unread ? `${unread} התראות חדשות` : 'התראות'}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-n num">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && createPortal(
        <div className="ndrawer-wrap">
          <div className="ndrawer-scrim" onClick={() => setOpen(false)} />
          <aside className="ndrawer" role="dialog" aria-modal="true" aria-label="התראות">
            <header className="ndrawer-head">
              <div className="ndrawer-title">
                <span className="ndrawer-badge"><Icon name="bell" /></span>
                <div><b>התראות</b><small>{unread ? `${unread} חדשות` : 'הכל נקרא'}</small></div>
              </div>
              <button type="button" className="ndrawer-x" onClick={() => setOpen(false)} aria-label="סגירה"><Icon name="x" /></button>
            </header>
            <div className="ndrawer-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>הכל <span className="num">{list.length}</span></button>
              <button type="button" role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'on' : ''} onClick={() => setFilter('unread')}>לא נקראו <span className="num">{unread}</span></button>
            </div>
            <div className="ndrawer-body">
              {shown.length === 0 ? (
                <div className="ndrawer-empty"><span><Icon name="checkCircle" /></span><b>{filter === 'unread' ? 'אין התראות חדשות' : 'אין התראות עדיין'}</b><small>כאן יופיעו בקשות חדשות, מסמכים שהועלו ומכתבים מוכנים.</small></div>
              ) : groups.map((g) => (
                <section key={g.label} className="ngroup">
                  <h4>{g.label}</h4>
                  <ul>
                    {g.items.map((n) => (
                      <li key={n.id}>
                        <button type="button" className={`nitem k-${tone(n.kind)}${n.read_at ? '' : ' unread'}`} onClick={() => go(n)}>
                          <span className="nitem-ic"><Icon name={ICON[n.kind] ?? 'info'} /></span>
                          <span className="nitem-main">
                            <b>{n.title}</b>
                            {n.body && <span>{n.body}</span>}
                            <small>{fmtStamp(n.created_at)}</small>
                          </span>
                          {!n.read_at && <span className="nitem-dot" aria-label="חדש" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {unread > 0 && <footer className="ndrawer-foot"><button type="button" className="btn btn-sm" onClick={readAll}><Icon name="check" />סימון הכל כנקרא</button></footer>}
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}

function tone(kind: string) {
  if (['declined', 'cancelled', 'reschedule_declined'].includes(kind)) return 'bad';
  if (['approved', 'letter_ready'].includes(kind)) return 'ok';
  if (['doc_request', 'new_request'].includes(kind)) return 'warn';
  return 'info';
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  if (key(d) === key(today)) return 'היום';
  if (key(d) === key(y)) return 'אתמול';
  return 'מוקדם יותר';
}

/**
 * Where a notification leads. A referrer lands on the case window in "my cases" (status, document, download),
 * or on the full case page when something has to be added; the doctor lands on the screen that acts on it.
 */
function target(n: N): string {
  const m = /^\/(firm|doctor)\/cases\/([0-9a-f-]{36})/i.exec(n.link || '');
  if (!m) return n.link || '';
  const [, who, id] = m;
  if (who === 'firm') {
    if (n.kind === 'doc_request') return `/firm/cases/${id}`;
    return `/firm/cases?open=${id}`;
  }
  if (n.kind === 'payment_proof' || n.kind === 'deposit_proof') return n.kind === 'payment_proof' ? '/doctor/payments' : `/doctor#approvals`;
  if (n.kind === 'new_request' || n.kind === 'reschedule') return `/doctor/cases/${id}`;
  return n.link;
}
