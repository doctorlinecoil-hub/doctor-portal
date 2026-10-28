'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/browser';
import { TYPES, type ReferralType } from '@/lib/constants';
import Icon from '@/components/Icon';

type Tpl = { id: string; title: string; body: string; letter_type: ReferralType | null };

/** The doctor's saved paragraphs: insert one at the cursor, or save the selected text as a new one. */
export default function TemplatePicker({ letterType, onInsert, selection }: { letterType: ReferralType; onInsert: (text: string) => void; selection: () => string }) {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Tpl[] | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('letter_templates').select('id, title, body, letter_type').order('title');
    setList((data as Tpl[] | null) ?? []);
  }
  async function toggle() {
    if (!open && !list) await load();
    setOpen(!open);
  }
  async function saveSelection() {
    const text = selection().trim();
    if (!text) return setMsg('סמנו קודם טקסט בגוף המכתב.');
    const title = window.prompt('שם לתבנית:', text.split('\n')[0].slice(0, 60));
    if (!title?.trim()) return;
    const { error } = await supabase.from('letter_templates').insert({ title: title.trim().slice(0, 120), body: text.slice(0, 20000), letter_type: null });
    setMsg(error ? 'השמירה נכשלה.' : 'התבנית נשמרה.');
    await load();
  }
  const shown = (list ?? [])
    .filter((t) => !t.letter_type || t.letter_type === letterType)
    .filter((t) => !q || t.title.includes(q) || t.body.includes(q));

  return (
    <span className="tpl">
      <button type="button" className="btn btn-sm" onClick={toggle} aria-expanded={open}><Icon name="template" />תבניות</button>
      {open && (
        <div className="tpl-pop" role="dialog" aria-label="תבניות">
          <div className="row" style={{ gap: 6 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש תבנית" aria-label="חיפוש תבנית" />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} aria-label="סגירה"><Icon name="x" /></button>
          </div>
          <div className="tpl-list">
            {list === null ? <p className="hint">טוען…</p> : shown.length === 0 ? <p className="hint">אין תבניות.</p> : shown.map((t) => (
              <button key={t.id} type="button" className="tpl-item" onClick={() => { onInsert(t.body); setOpen(false); }}>
                <b>{t.title}</b>{t.letter_type && <small>{TYPES[t.letter_type].label}</small>}
                <span>{t.body.slice(0, 110)}{t.body.length > 110 ? '…' : ''}</span>
              </button>
            ))}
          </div>
          <div className="between">
            <button type="button" className="btn btn-sm btn-soft" onClick={saveSelection}><Icon name="save" />שמירת הטקסט המסומן כתבנית</button>
            <Link href="/doctor/templates" className="hint">ניהול תבניות</Link>
          </div>
          {msg && <p className="hint">{msg}</p>}
        </div>
      )}
    </span>
  );
}
