'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { typeOf, TYPES, type ReferralType } from '@/lib/constants';
import Icon from '@/components/Icon';
import Dictate from '@/components/Dictate';

export type Tpl = { id: string; title: string; body: string; letter_type: ReferralType | null };
const EMPTY = { id: '', title: '', body: '', letter_type: '' as ReferralType | '' };

export default function TemplatesAdmin({ list, preview }: { list: Tpl[]; preview?: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    if (preview) return;
    if (!f.title.trim() || !f.body.trim()) return setMsg({ ok: false, text: 'מלאו שם ותוכן.' });
    const row = { title: f.title.trim().slice(0, 120), body: f.body.trim().slice(0, 20000), letter_type: f.letter_type || null };
    const { error } = f.id ? await supabase.from('letter_templates').update(row).eq('id', f.id) : await supabase.from('letter_templates').insert(row);
    setMsg(error ? { ok: false, text: 'השמירה נכשלה.' } : { ok: true, text: 'נשמר' });
    if (!error) { setF(EMPTY); router.refresh(); }
  });
  const remove = (id: string) => start(async () => {
    if (preview || !window.confirm('למחוק את התבנית?')) return;
    await supabase.from('letter_templates').delete().eq('id', id);
    router.refresh();
  });
  return (
    <div className="cols">
      <section className="panel">
        <div className="panel-head"><h2><Icon name={f.id ? 'file' : 'plus'} />{f.id ? 'עריכת תבנית' : 'תבנית חדשה'}</h2>{f.id && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setF(EMPTY)}>ביטול</button>}</div>
        <label className="field"><span>שם</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="בדיקה גופנית תקינה – ברך" /></label>
        <label className="field"><span>לאיזה סוג מכתב <small>ריק = לכל הסוגים</small></span>
          <select value={f.letter_type} onChange={(e) => setF({ ...f, letter_type: e.target.value as ReferralType | '' })}>
            <option value="">כל הסוגים</option>
            {(Object.keys(TYPES) as ReferralType[]).map((k) => <option key={k} value={k}>{typeOf(k).label}</option>)}
          </select>
        </label>
        <div className="field-tools"><Dictate onText={(t) => setF((x) => ({ ...x, body: x.body ? `${x.body} ${t}` : t }))} /></div>
        <label className="field"><span>תוכן <small>אפשר לכתוב [להשלמת הרופא: ...] במקומות שמשתנים</small></span>
          <textarea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        {msg && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
        <div className="row"><button type="button" className="btn btn-primary" onClick={save} disabled={busy}><Icon name="save" />שמירה</button></div>
      </section>
      <section className="panel flush">
        <div className="panel-head"><h2><Icon name="template" />התבניות שלי</h2><span className="hint">{list.length}</span></div>
        <div className="list">
          {list.map((t) => (
            <div key={t.id} className="item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <span className="item-main"><b>{t.title}</b><span className="item-meta">{t.letter_type ? typeOf(t.letter_type).label : 'כל הסוגים'} · {t.body.slice(0, 90)}{t.body.length > 90 ? '…' : ''}</span></span>
              <span className="row" style={{ gap: 4 }}>
                <button type="button" className="btn btn-sm" onClick={() => setF({ id: t.id, title: t.title, body: t.body, letter_type: t.letter_type ?? '' })}>עריכה</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(t.id)} aria-label={`מחיקת ${t.title}`}><Icon name="trash" /></button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
