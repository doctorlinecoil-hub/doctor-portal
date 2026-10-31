import Link from 'next/link';
import Icon from '@/components/Icon';
import LiveRefresh from '@/components/LiveRefresh';
import { DAYS, fmtDate, ilParts, todayIL, weekday } from '@/lib/dates';
import Reply from './Reply';
import Inbox, { type ThreadItem } from './Inbox';
import { BotToggle, DoneButton, ScrollBottom } from './ThreadTools';

export type WaMsg = { id: string; appointment_id: string | null; phone: string; name: string; direction: 'in' | 'out'; kind: string; body: string; status: string; error: string; seen_at: string | null; created_at: string; bot: boolean };
export type WaScreenProps = {
  list: ThreadItem[]; sel: ThreadItem | null; msgs: WaMsg[]; tags: Record<string, string>;
  upcoming: { id: string; starts_at: string; status: string; service_label: string | null }[];
  waiting: number; today: number; booked: number; connected: boolean; botOn: boolean;
  open: boolean; leftMs: number; clinic: { address: string; phone: string }; live?: boolean;
};

const TICK: Record<string, string> = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!', received: '' };
const dayHead = (d: string) => (d === todayIL() ? 'היום' : `יום ${DAYS[weekday(d)]} · ${fmtDate(d)}`);

/** The WhatsApp inbox (also used by the design preview). */
export default function WaScreen({ list, sel, msgs, tags, upcoming, waiting, today, booked, connected, botOn, open, leftMs, clinic, live = true }: WaScreenProps) {
  const label = (m: WaMsg) => tags[m.kind] || '';
  let lastDay = '';
  return (
    <div className="wa2">
      {live && <LiveRefresh every={12} />}
      <header className="wa2-top">
        <div className="wa2-title">
          <span className="wa2-logo"><Icon name="message" size={22} /></span>
          <div><h1>שיחות וואטסאפ</h1><small>{connected ? (botOn ? 'מחובר · העוזר הדיגיטלי עונה ומזמין תורים 24/7' : 'מחובר · העוזר הדיגיטלי כבוי') : 'עוד לא מחובר לוואטסאפ של מטא – השיחות יופיעו כאן אחרי החיבור'}</small></div>
        </div>
        <div className="wa2-kpis">
          <span className={waiting ? 'hot' : ''}><b>{waiting}</b><small>ממתינות למרפאה</small></span>
          <span><b>{today}</b><small>שיחות היום</small></span>
          <span><b>{booked}</b><small>תורים מהבוט השבוע</small></span>
        </div>
      </header>

      <div className={`wa2-body${sel ? ' has-sel' : ''}`}>
        <Inbox threads={list} selected={sel?.phone ?? ''} />

        <section className="wa2-chat" aria-label="שיחה">
          {!sel ? (
            <div className="wa2-empty">
              <span className="wa2-empty-ic"><Icon name="message" size={36} /></span>
              <h2>בחרו שיחה</h2>
              <p>כאן רואים כל מה שנשלח למטופלים ומה הם ענו. הבוט עונה לבד, ומתי שתרצו – עונים בעצמכם.</p>
            </div>
          ) : (
            <>
              <header className="wa2-chat-head">
                <Link href="/doctor/whatsapp" className="wa2-back" aria-label="חזרה לרשימה"><span aria-hidden>→</span></Link>
                <span className="wa-av">{(sel.name || '?').trim().slice(0, 1)}</span>
                <div className="wa2-who"><b>{sel.name || sel.local}</b><small dir="ltr">{sel.local}</small></div>
                <span className={`wa2-mode ${sel.human ? 'human' : 'bot'}`}>{sel.human ? '👤 המרפאה עונה' : '🤖 הבוט עונה'}</span>
              </header>
              <div className="wa2-msgs">
                {msgs.map((m) => {
                  const d = ilParts(m.created_at).date;
                  const sep = d !== lastDay ? (lastDay = d, <div key={`d-${m.id}`} className="wa2-day"><span>{dayHead(d)}</span></div>) : null;
                  return (
                    <div key={m.id} className="wa2-row">
                      {sep}
                      <div className={`wa2-b ${m.direction}${m.bot ? ' bot' : ''}${m.status === 'failed' ? ' failed' : ''}`}>
                        {m.direction === 'out' && <span className="wa2-tag">{label(m) ? `📋 ${label(m)} · אוטומטי` : m.bot ? '🤖 העוזר הדיגיטלי' : '👤 המרפאה'}</span>}
                        <p>{m.body}</p>
                        <span className="wa2-meta">{ilParts(m.created_at).time}{m.direction === 'out' && <em className={m.status === 'read' ? 'read' : m.status === 'failed' ? 'bad' : ''}>{TICK[m.status] ?? ''}</em>}</span>
                        {m.status === 'failed' && m.error && <span className="wa2-err">לא נשלח: {m.error}</span>}
                      </div>
                    </div>
                  );
                })}
                <ScrollBottom dep={`${sel.phone}:${msgs.length}`} />
              </div>
              <Reply phone={sel.phone} open={open} leftMin={Math.max(0, Math.floor(leftMs / 60000))} name={sel.name.split(' ')[0] || ''} clinic={clinic} />
            </>
          )}
        </section>

        {sel && (
          <aside className="wa2-side" aria-label="פרטי המטופל">
            <div className="wa2-card">
              <span className="wa-av big">{(sel.name || '?').trim().slice(0, 1)}</span>
              <b>{sel.name || 'ללא שם'}</b>
              <small dir="ltr">{sel.local}</small>
              <div className="wa2-acts">
                <a className="btn btn-sm" href={`tel:+${sel.phone}`}><Icon name="phone" size={14} />חיוג</a>
                {sel.caseId && <Link className="btn btn-sm" href={`/doctor/cases/${sel.caseId}`}><Icon name="folder" size={14} />לתיק</Link>}
              </div>
            </div>
            <div className="wa2-card">
              <h3>מי עונה בשיחה?</h3>
              <BotToggle phone={sel.phone} human={sel.human} disabled={!botOn} />
              <small>כשעונים בעצמכם, הבוט שותק בשיחה הזו ל־12 שעות.</small>
            </div>
            <div className="wa2-card">
              <h3>תורים קרובים</h3>
              {upcoming.length ? (
                <ul className="wa2-appts">
                  {upcoming.map((a) => { const q = ilParts(a.starts_at); return (
                    <li key={a.id}><Link href={`/doctor/cases/${a.id}`}><b>{`יום ${DAYS[weekday(q.date)]} ${fmtDate(q.date)} · ${q.time}`}</b><small>{a.service_label || 'תור'} · {a.status === 'pending' ? 'ממתין לאישור' : 'מאושר'}</small></Link></li>
                  ); })}
                </ul>
              ) : <p className="wa2-muted">אין תורים עתידיים למספר הזה.</p>}
            </div>
            {sel.waiting && <DoneButton phone={sel.phone} />}
          </aside>
        )}
      </div>
    </div>
  );
}
