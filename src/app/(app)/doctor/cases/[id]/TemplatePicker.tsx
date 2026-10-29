'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/browser';
import { typeOf, type ReferralType } from '@/lib/constants';
import Icon from '@/components/Icon';

type Tpl = { id: string; title: string; body: string; letter_type: ReferralType | null };

/** The doctor's saved paragraphs: a window with search, the list, and the full text before inserting it. */
export default function TemplatePicker({ letterType, onInsert, selection, demo }: { letterType: ReferralType; onInsert: (text: string) => void; selection: () => string; demo?: Tpl[] }) {
  const supabase = useSupabase();
  const [open, setOpen] = useState(!!demo);
  const [list, setList] = useState<Tpl[] | null>(demo ?? null);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [cur, setCur] = useState<Tpl | null>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('letter_templates').select('id, title, body, letter_type').order('title');
    setList((data as Tpl[] | null) ?? []);
  }
  async function show() {
    setMsg('');
    setOpen(true);
    if (!list) await load();
  }
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  async function saveSelection() {
    const text = selection().trim();
    if (!text) return setMsg('סמנו קודם טקסט בגוף המכתב, ואז לחצו כאן.');
    const title = window.prompt('שם לתבנית:', text.split('\n')[0].slice(0, 60));
    if (!title?.trim()) return;
    const { error } = await supabase.from('letter_templates').insert({ title: title.trim().slice(0, 120), body: text.slice(0, 20000), letter_type: null });
    setMsg(error ? 'השמירה נכשלה.' : 'התבנית נשמרה.');
    await load();
  }

  const shown = (list ?? [])
    .filter((t) => all || !t.letter_type || t.letter_type === letterType)
    .filter((t) => !q || t.title.includes(q) || t.body.includes(q));
  const sel = cur && shown.some((t) => t.id === cur.id) ? cur : shown[0] ?? null;

  return (
    <>
      <button type="button" className="btn" onClick={show}><Icon name="template" />תבניות</button>
      {open && (demo || typeof document !== 'undefined') && (demo ? (x: React.ReactNode) => x : (x: React.ReactNode) => createPortal(x, document.body))(
        <div className="tplm-wrap" role="dialog" aria-modal="true" aria-label="תבניות">
          <div className="tplm-scrim" onClick={() => setOpen(false)} />
          <div className="tplm">
            <header className="tplm-head">
              <div className="tplm-title"><span className="tplm-ic"><Icon name="template" /></span><div><b>תבניות</b><small>בחרו תבנית, בדקו את הטקסט והכניסו אותו למכתב במקום הסמן</small></div></div>
              <button type="button" className="ndrawer-x" onClick={() => setOpen(false)} aria-label="סגירה"><Icon name="x" /></button>
            </header>
            <div className="tplm-bar">
              <div className="lookup-input"><Icon name="search" size={17} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מילה מהטקסט" aria-label="חיפוש תבנית" /></div>
              <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>כל הסוגים</span></label>
            </div>
            <div className="tplm-body">
              <div className="tplm-list">
                {list === null ? <p className="hint" style={{ padding: 12 }}>טוען…</p> : shown.length === 0 ? (
                  <div className="ndrawer-empty" style={{ padding: '36px 12px' }}><span><Icon name="template" /></span><b>אין תבניות{q ? ' שמתאימות לחיפוש' : ''}</b><small>אפשר ליצור במסך ״תבניות למכתבים״, או לסמן טקסט במכתב ולשמור אותו.</small></div>
                ) : shown.map((t) => (
                  <button key={t.id} type="button" className={`tplm-item${sel?.id === t.id ? ' on' : ''}`} onClick={() => setCur(t)} onDoubleClick={() => { onInsert(t.body); setOpen(false); }}>
                    <b>{t.title}</b>
                    <small>{t.letter_type ? typeOf(t.letter_type).label : 'לכל סוגי המכתבים'}</small>
                  </button>
                ))}
              </div>
              <div className="tplm-preview">
                {sel ? (
                  <>
                    <div className="tplm-pv-head"><b>{sel.title}</b>{sel.letter_type && <span className="badge b-type">{typeOf(sel.letter_type).label}</span>}</div>
                    <div className="tplm-text">{sel.body}</div>
                  </>
                ) : <p className="hint">בחרו תבנית מהרשימה כדי לראות אותה כאן.</p>}
              </div>
            </div>
            <footer className="tplm-foot">
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={saveSelection}><Icon name="save" />שמירת הטקסט המסומן כתבנית</button>
                <Link href="/doctor/templates" className="btn btn-ghost btn-sm"><Icon name="settings" />ניהול תבניות</Link>
              </div>
              {msg && <span className="hint">{msg}</span>}
              <button type="button" className="btn btn-primary" disabled={!sel} onClick={() => { if (sel) { onInsert(sel.body); setOpen(false); } }}><Icon name="plus" />הכנסה למכתב</button>
            </footer>
          </div>
        </div>,
      )}
    </>
  );
}
