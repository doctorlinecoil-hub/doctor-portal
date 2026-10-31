'use client';
import { useState, useTransition } from 'react';
import Icon from '@/components/Icon';
import { fmtDate, todayIL, dayNum } from '@/lib/dates';
import { saveInfraNotes } from '../actions';

export type Svc = { key: string; icon: string; name: string; what: string; status: 'ok' | 'warn' | 'bad' | 'off'; live: string; links: { label: string; href: string }[] };
type Note = { plan?: string; renews?: string; account?: string; cost?: string; note?: string };
const LABEL = { ok: 'תקין', warn: 'לבדוק', bad: 'דורש טיפול', off: 'לא בשימוש' };

export default function SystemMap({ services, notes: initial }: { services: Svc[]; notes: Record<string, Note> }) {
  const [notes, setNotes] = useState<Record<string, Note>>(initial);
  const [edit, setEdit] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const today = dayNum(todayIL());
  const upcoming = services.map((s) => ({ s, n: notes[s.key] })).filter((x) => x.n?.renews).sort((a, b) => a.n!.renews!.localeCompare(b.n!.renews!));
  const counts = { bad: services.filter((s) => s.status === 'bad').length, warn: services.filter((s) => s.status === 'warn').length };
  const set = (k: string, patch: Note) => setNotes({ ...notes, [k]: { ...notes[k], ...patch } });
  const save = () => start(async () => { const r = await saveInfraNotes(notes); setMsg(r.ok ? 'נשמר' : r.error || 'השמירה נכשלה'); if (r.ok) setEdit(null); });

  return (
    <div className="sm">
      <div className={`sm-sum ${counts.bad ? 'bad' : counts.warn ? 'warn' : 'ok'}`}>
        <Icon name={counts.bad ? 'alert' : 'checkCircle'} size={22} />
        <div><b>{counts.bad ? `${counts.bad} שירותים דורשים טיפול` : counts.warn ? `הכול עובד · ${counts.warn} לבדיקה` : 'כל השירותים תקינים'}</b>
          <small>הבדיקה רצה בכל פתיחה של הדף. לא שומרים כאן סיסמאות – רק איפה ומתי.</small></div>
      </div>

      {upcoming.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2><Icon name="calendar" />חידושים קרובים</h2></div>
          <ul className="sm-ren">
            {upcoming.map(({ s, n }) => {
              const d = dayNum(n!.renews!) - today;
              return <li key={s.key} className={d < 0 ? 'bad' : d <= 30 ? 'warn' : ''}><b>{s.name}</b><span>{fmtDate(n!.renews!)}</span><em>{d < 0 ? `עבר לפני ${-d} ימים` : d === 0 ? 'היום' : `בעוד ${d} ימים`}</em>{n!.cost && <small>{n!.cost}</small>}</li>;
            })}
          </ul>
        </section>
      )}

      <div className="sm-grid">
        {services.map((s) => {
          const n = notes[s.key] || {};
          return (
            <article key={s.key} className={`sm-card ${s.status}`}>
              <header>
                <span className="sm-ic"><Icon name={s.icon} /></span>
                <div><h3>{s.name}</h3><p>{s.what}</p></div>
                <span className={`sm-st ${s.status}`}><i />{LABEL[s.status]}</span>
              </header>
              <div className="sm-live"><Icon name="activity" size={14} />{s.live}</div>
              {edit === s.key ? (
                <div className="sm-form">
                  <label><span>מסלול / מנוי</span><input value={n.plan || ''} onChange={(e) => set(s.key, { plan: e.target.value })} placeholder="למשל: Pro חודשי, חיוב אוטומטי" /></label>
                  <label><span>תאריך חידוש</span><input type="date" value={n.renews || ''} onChange={(e) => set(s.key, { renews: e.target.value })} /></label>
                  <label><span>עלות</span><input value={n.cost || ''} onChange={(e) => set(s.key, { cost: e.target.value })} placeholder="למשל: 20$ לחודש" /></label>
                  <label><span>חשבון (מייל הכניסה)</span><input dir="ltr" value={n.account || ''} onChange={(e) => set(s.key, { account: e.target.value })} placeholder="name@gmail.com" /></label>
                  <label className="wide"><span>הערה</span><input value={n.note || ''} onChange={(e) => set(s.key, { note: e.target.value })} placeholder="לא לשמור כאן סיסמאות" /></label>
                  <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}><Icon name="save" size={14} />{pending ? 'שומר…' : 'שמירה'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>ביטול</button>{msg && <small className="muted">{msg}</small>}</div>
                </div>
              ) : (
                <dl className="sm-notes">
                  {n.plan && <><dt>מנוי</dt><dd>{n.plan}</dd></>}
                  {n.renews && <><dt>חידוש</dt><dd>{fmtDate(n.renews)}</dd></>}
                  {n.cost && <><dt>עלות</dt><dd>{n.cost}</dd></>}
                  {n.account && <><dt>חשבון</dt><dd dir="ltr">{n.account}</dd></>}
                  {n.note && <><dt>הערה</dt><dd>{n.note}</dd></>}
                </dl>
              )}
              <footer>
                {s.links.map((l) => <a key={l.href} className="btn btn-sm" href={l.href} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" size={13} />{l.label}</a>)}
                {edit !== s.key && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEdit(s.key); setMsg(''); }}><Icon name="settings" size={13} />פרטי מנוי</button>}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
