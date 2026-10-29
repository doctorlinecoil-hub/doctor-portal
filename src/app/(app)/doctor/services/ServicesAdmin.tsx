'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { TYPES, ils, type ReferralType } from '@/lib/constants';
import { SERVICE_ICONS, type Service } from '@/lib/services';
import Icon from '@/components/Icon';

type Draft = Omit<Service, 'id'> & { id?: string };
const NEW: Draft = { label: '', description: '', icon: 'file', base_type: 'summary', price: 0, active: true, sort: 0 };

/** Add, edit, reorder and hide referral types. Changes apply to new bookings; existing cases keep their name and price. */
export default function ServicesAdmin({ initial, preview }: { initial: Service[]; preview?: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (!edit || preview) return;
    const label = edit.label.trim();
    if (label.length < 2) return setMsg({ ok: false, text: 'כתבו שם לשירות.' });
    setBusy(true);
    const row = { label: label.slice(0, 80), description: edit.description.trim().slice(0, 200), icon: edit.icon, base_type: edit.base_type, price: Math.max(0, Number(edit.price) || 0), active: edit.active };
    const q = edit.id
      ? supabase.from('services').update(row).eq('id', edit.id).select('*').single()
      : supabase.from('services').insert({ ...row, sort: (list.at(-1)?.sort ?? 0) + 1 }).select('*').single();
    const { data, error } = await q;
    setBusy(false);
    if (error || !data) return setMsg({ ok: false, text: 'השמירה נכשלה.' });
    const s = { ...(data as Service), price: Number((data as Service).price) };
    setList(edit.id ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]);
    setEdit(null);
    setMsg({ ok: true, text: 'נשמר' });
    router.refresh();
  }
  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= list.length || preview) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const withSort = next.map((x, n) => ({ ...x, sort: n + 1 }));
    setList(withSort);
    await Promise.all([withSort[i], withSort[j]].map((x) => supabase.from('services').update({ sort: x.sort }).eq('id', x.id)));
  }
  async function toggle(s: Service) {
    if (preview) return;
    const { error } = await supabase.from('services').update({ active: !s.active }).eq('id', s.id);
    if (!error) setList(list.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
  }
  async function remove(s: Service) {
    if (preview || !confirm(`למחוק את ״${s.label}״? תיקים קיימים ישמרו את השם. אפשר גם רק להסתיר.`)) return;
    const { error } = await supabase.from('services').delete().eq('id', s.id);
    if (error) return setMsg({ ok: false, text: 'המחיקה נכשלה.' });
    setList(list.filter((x) => x.id !== s.id));
  }

  return (
    <div className={`svc-wrap${edit ? " editing" : ""}`}>
      <section className="panel">
        <div className="panel-head">
          <h2><Icon name="list" />השירותים שלכם</h2>
          <button type="button" className="btn btn-primary" onClick={() => { setEdit({ ...NEW }); setMsg(null); }}><Icon name="plus" />שירות חדש</button>
        </div>
        <ul className="svc-list">
          {list.map((s, i) => (
            <li key={s.id} className={s.active ? '' : 'off'}>
              <span className="opt-ic"><Icon name={s.icon || 'file'} /></span>
              <span className="svc-main">
                <b>{s.label}{!s.active && <span className="badge b-cancelled">מוסתר</span>}</b>
                <span>{s.description || '—'}</span>
                <small>סוג מסמך: {TYPES[s.base_type].label}</small>
              </span>
              <span className="svc-price">{s.price > 0 ? ils(s.price) : 'ללא מחיר'}</span>
              <span className="svc-act">
                <button type="button" className="icon-btn" aria-label="למעלה" title="למעלה" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="icon-btn" aria-label="למטה" title="למטה" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</button>
                <button type="button" className="btn btn-sm" onClick={() => { setEdit({ ...s }); setMsg(null); }}>עריכה</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(s)}>{s.active ? 'הסתרה' : 'הצגה'}</button>
                <button type="button" className="icon-btn" aria-label="מחיקה" title="מחיקה" onClick={() => remove(s)}><Icon name="trash" size={15} /></button>
              </span>
            </li>
          ))}
        </ul>
        {msg && !edit && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
      </section>

      {edit && (
        <section className="panel svc-edit">
          <div className="panel-head"><h2><Icon name={edit.id ? 'settings' : 'plus'} />{edit.id ? 'עריכת שירות' : 'שירות חדש'}</h2></div>
          <div className="grid-2">
            <label className="field"><span>שם השירות</span><input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="למשל: חוות דעת לחברת ביטוח" autoFocus /></label>
            <label className="field"><span>מחיר כולל מע״מ ₪</span><input inputMode="decimal" dir="ltr" value={String(edit.price)} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} /></label>
          </div>
          <label className="field"><span>תיאור קצר <small>מופיע מתחת לשם</small></span><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="למה זה מתאים, מה כולל" /></label>
          <label className="field"><span>סוג המסמך <small>קובע את מבנה המכתב והניסוח של ה־AI</small></span>
            <select value={edit.base_type} onChange={(e) => setEdit({ ...edit, base_type: e.target.value as ReferralType })}>
              {(Object.keys(TYPES) as ReferralType[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
            </select>
          </label>
          <div className="field"><span>אייקון</span>
            <div className="icon-pick">
              {SERVICE_ICONS.map((ic) => (
                <button key={ic} type="button" aria-pressed={edit.icon === ic} aria-label={ic} onClick={() => setEdit({ ...edit, icon: ic })}><Icon name={ic} /></button>
              ))}
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>מוצג למפנים</span></label>
          {msg && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}><Icon name="save" />{busy ? 'שומר…' : 'שמירה'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>ביטול</button>
          </div>
        </section>
      )}
    </div>
  );
}
