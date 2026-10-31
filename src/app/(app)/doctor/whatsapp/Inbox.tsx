'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';

export type ThreadItem = { phone: string; local: string; name: string; last: { body: string; at: string; out: boolean; bot: boolean }; unread: number; caseId: string | null; human: boolean; waiting: boolean };

const TZ = 'Asia/Jerusalem';
const stamp = (iso: string) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return day === today ? new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d) : new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' }).format(d);
};

const FILTERS = [['all', 'הכול'], ['wait', 'ממתינות'], ['unread', 'לא נקראו'], ['bot', 'הבוט מטפל']] as const;

/** The conversation list: search by name or number, and quick filters. */
export default function Inbox({ threads, selected }: { threads: ThreadItem[]; selected: string }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number][0]>('all');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return threads.filter((t) => {
      if (f === 'wait' && !t.waiting) return false;
      if (f === 'unread' && !t.unread) return false;
      if (f === 'bot' && (t.human || t.waiting)) return false;
      if (!term) return true;
      return t.name.toLowerCase().includes(term) || (digits.length >= 3 && (t.phone.includes(digits) || t.local.replace(/\D/g, '').includes(digits)));
    });
  }, [threads, q, f]);
  const count = (k: string) => (k === 'wait' ? threads.filter((t) => t.waiting).length : k === 'unread' ? threads.filter((t) => t.unread).length : 0);
  return (
    <aside className="wa2-list" aria-label="שיחות">
      <div className="wa2-search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מספר" aria-label="חיפוש שיחה" />
      </div>
      <div className="wa2-filters" role="tablist">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>
            {l}{count(k) > 0 && <i>{count(k)}</i>}
          </button>
        ))}
      </div>
      <ul>
        {shown.length === 0 && <li className="wa2-none">{threads.length ? 'אין שיחות שמתאימות לסינון' : 'עוד אין שיחות'}</li>}
        {shown.map((t) => (
          <li key={t.phone}>
            <Link href={`/doctor/whatsapp?p=${t.phone}`} className={`wa2-th${selected === t.phone ? ' on' : ''}${t.unread ? ' unread' : ''}`}>
              <span className="wa-av">{(t.name || '?').trim().slice(0, 1)}{t.waiting && <em className="wa2-dot" aria-label="ממתין" />}</span>
              <span className="wa2-th-m">
                <b>{t.name || t.local}</b>
                <small>{t.last.out ? (t.last.bot ? '🤖 ' : '✓ ') : ''}{t.last.body.replace(/\s+/g, ' ').slice(0, 80)}</small>
              </span>
              <span className="wa2-th-s">
                <small>{stamp(t.last.at)}</small>
                {t.unread > 0 ? <i>{t.unread}</i> : t.human ? <span className="wa2-chip">👤</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
