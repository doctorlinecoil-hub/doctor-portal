'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { resetTestData } from './actions';

const PHRASE = 'מחק הכל';

/** Danger zone: wipe all trial data with one (confirmed) click. */
export default function ResetData() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await resetTestData(text);
    if (r.ok) {
      setMsg({ ok: true, t: `המערכת אופסה: נמחקו ${r.cases ?? 0} תיקים ו־${r.referrers ?? 0} מפנים. התיק הבא יקבל את המספר 1001.` });
      setOpen(false);
      setText('');
      router.refresh();
    } else setMsg({ ok: false, t: r.error || 'האיפוס נכשל.' });
  });
  return (
    <section className="panel danger-zone">
      <div className="panel-head"><h2><Icon name="alert" />איפוס נתוני ניסיון</h2></div>
      <p className="muted">
        מוחק את כל התיקים, המטופלים, המסמכים והקבצים, המכתבים, המרשמים, התשלומים וההתראות, ואת כל המפנים והחשבונות שלהם.
        נשארים: החשבון שלך, ההגדרות, השירותים והמחירים, תבניות המכתבים והתרופות המועדפות. מספרי התיקים מתחילים שוב מ־1001.
        <b> אי אפשר לבטל את הפעולה.</b>
      </p>
      {!open ? (
        <div className="row"><button type="button" className="btn btn-danger" onClick={() => { setOpen(true); setMsg(null); }}><Icon name="trash" />איפוס המערכת</button></div>
      ) : (
        <div className="dz-confirm">
          <label className="field" htmlFor="dzText"><span>לאישור, הקלידו: <b>{PHRASE}</b></span>
            <input id="dzText" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder={PHRASE} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-danger" disabled={pending || text.trim() !== PHRASE} onClick={run}><Icon name="trash" />{pending ? 'מאפס…' : 'מחיקת כל נתוני הניסיון'}</button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { setOpen(false); setText(''); }}>ביטול</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.t}</p>}
    </section>
  );
}
