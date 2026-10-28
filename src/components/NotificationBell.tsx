'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { fmtStamp } from '@/lib/dates';
import Icon from './Icon';

type N = { id: number; kind: string; title: string; body: string; link: string; created_at: string; read_at: string | null };

const ICON: Record<string, string> = {
  new_request: 'inbox', approved: 'checkCircle', declined: 'x', cancelled: 'x', letter_ready: 'fileCheck', moved: 'calendar',
  new_document: 'upload', new_note: 'info', doc_request: 'flag', reschedule: 'calendar', reschedule_declined: 'x', booked_by_clinic: 'calendarPlus',
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
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function go(n: N) {
    setOpen(false);
    if (!n.read_at) {
      setList((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    if (n.link) router.push(n.link);
  }
  async function readAll() {
    const now = new Date().toISOString();
    setList((l) => l.map((x) => ({ ...x, read_at: x.read_at ?? now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }

  return (
    <div className={`bell${dark ? ' dark' : ''}`} ref={box}>
      <button type="button" className="bell-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={unread ? `${unread} התראות חדשות` : 'התראות'}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-n num">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="התראות">
          <div className="between"><b>התראות</b>{unread > 0 && <button type="button" className="link" onClick={readAll}>סימון הכל כנקרא</button>}</div>
          {list.length === 0 ? <p className="hint" style={{ padding: '18px 0', textAlign: 'center' }}>אין התראות עדיין</p> : (
            <ul>
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.read_at ? '' : 'unread'} onClick={() => go(n)}>
                    <span className="bell-ic"><Icon name={ICON[n.kind] ?? 'info'} /></span>
                    <span><b>{n.title}</b>{n.body && <span>{n.body}</span>}<small>{fmtStamp(n.created_at)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
