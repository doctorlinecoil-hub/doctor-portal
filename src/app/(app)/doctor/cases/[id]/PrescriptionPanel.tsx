'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { fmtDate, fmtStamp } from '@/lib/dates';
import { DURATIONS, FREQUENCIES, cleanItems, rxLine, type RxItem, type RxRow } from '@/lib/rxTypes';
import { docCss, rxDocHtml, type DocInput } from '@/lib/letterDoc';
import { todayIL } from '@/lib/dates';
import Icon from '@/components/Icon';
import Lookup from '@/components/Lookup';
import { sendPrescription } from '../../actions';

export type FavRow = { id: number; name: string; reg_number: string; form: string; strength: string; dose: string; frequency: string; duration: string; quantity: string; notes: string };
type Hit = { reg: string; name: string };
type Info = { reg: string; nameHe: string; nameEn: string; formHe: string; strength: string; basket: boolean };

const EMPTY: Omit<RxItem, 'name'> = { reg: '', form: '', strength: '', dose: '', frequency: '', duration: '', quantity: '', notes: '' };

/** Prescriptions: drug search in the Ministry of Health registry, the doctor's own drug list, print, email, renew. */
export default function PrescriptionPanel({ appointmentId, rows, past, favorites, patientEmail, readOnly, paper, initialItems }: {
  initialItems?: RxItem[];
  paper?: { settings: DocInput['settings']; patient: DocInput['patient'] };
  appointmentId: string; rows: RxRow[]; past: (RxRow & { case_no: number })[]; favorites: FavRow[]; patientEmail: string; readOnly?: boolean;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [items, setItems] = useState<RxItem[]>(initialItems ?? []);
  const [notes, setNotes] = useState('');
  const [favs, setFavs] = useState(favorites);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState('');
  const editing = items.length > 0;
  const addFree = () => setItems((l) => [...l, { ...EMPTY, name: '' }]);

  async function fromRegistry(h: Hit) {
    setLoading(h.name);
    let info: Info | null = null;
    try {
      const r = await fetch(`/api/drugs?reg=${encodeURIComponent(h.reg)}`);
      if (r.ok) info = (await r.json()).drug as Info;
    } catch { /* the name alone is enough */ }
    setLoading('');
    setItems((l) => [...l, { ...EMPTY, name: h.name, reg: h.reg, form: info?.formHe || '', strength: info?.strength || '' }]);
  }
  const fromFav = (f: FavRow) => setItems((l) => [...l, { name: f.name, reg: f.reg_number, form: f.form, strength: f.strength, dose: f.dose, frequency: f.frequency, duration: f.duration, quantity: f.quantity, notes: f.notes }]);
  const set = (i: number, patch: Partial<RxItem>) => setItems((l) => l.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setItems((l) => { const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });

  async function saveFav(i: RxItem) {
    if (favs.some((f) => f.name === i.name && f.dose === i.dose)) return;
    const { data, error } = await supabase.from('drug_favorites').insert({
      name: i.name, reg_number: i.reg || '', form: i.form || '', strength: i.strength || '', dose: i.dose, frequency: i.frequency, duration: i.duration, quantity: i.quantity, notes: i.notes || '',
    }).select('*').single();
    if (!error && data) setFavs([...favs, data as FavRow]);
  }
  async function dropFav(id: number) {
    if (!confirm('להסיר מהרשימה הקבועה?')) return;
    await supabase.from('drug_favorites').delete().eq('id', id);
    setFavs(favs.filter((f) => f.id !== id));
  }

  async function save(andPrint: boolean) {
    const clean = cleanItems(items);
    if (!clean.length) return setErr('הוסיפו לפחות תרופה אחת.');
    if (clean.length < items.length && !confirm('יש שורה בלי שם תרופה, והיא לא תישמר. להמשיך?')) return;
    const missing = clean.find((i) => !i.dose && !i.frequency);
    if (missing && !confirm(`ל־${missing.name} לא נכתב מינון. לשמור בכל זאת?`)) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.from('prescriptions').insert({ appointment_id: appointmentId, items: clean, notes: notes.trim().slice(0, 2000) }).select('id').single();
    setBusy(false);
    if (error || !data) return setErr('השמירה נכשלה.');
    setItems([]);
    setNotes('');
    if (andPrint) window.open(`/rx/${data.id}/print`, '_blank', 'noopener');
    router.refresh();
  }

  return (
    <section className="panel rx-panel">
      <div className="panel-head">
        <h2><Icon name="pill" />מרשם תרופות</h2>
        <span className="hint">חיפוש במאגר התרופות של משרד הבריאות</span>
      </div>

      {!readOnly && (
        <div className="rx-editor">
          <Lookup<Hit>
            endpoint="/api/drugs"
            icon="pill"
            placeholder="שם תרופה בעברית או באנגלית (למשל: אקמול, Arcoxia)"
            render={(h) => <span>{h.name}</span>}
            onPick={fromRegistry}
            onFree={(t) => setItems((l) => [...l, { ...EMPTY, name: t }])}
            freeLabel="הוספה כתרופה ידנית"
          />
          <button type="button" className="btn btn-sm rx-add-free" onClick={addFree}><Icon name="plus" size={15} />תרופה שלא במאגר (כתיבה חופשית)</button>
          {loading && <p className="hint">טוען את פרטי {loading}…</p>}
          {favs.length > 0 && (
            <div className="rx-favs">
              <span className="hint"><Icon name="flag" size={13} />התרופות שלי · לחיצה מוסיפה עם המינון הקבוע</span>
              <div className="chips">
                {favs.map((f) => (
                  <span key={f.id} className="chip fav">
                    <button type="button" onClick={() => fromFav(f)} title={[f.dose, f.frequency, f.duration].filter(Boolean).join(' · ')}>{f.name}{f.dose && <small>{f.dose}</small>}</button>
                    <button type="button" className="chip-x" aria-label={`הסרת ${f.name} מהרשימה`} onClick={() => dropFav(f.id)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {editing && (
            <div className="rx-compose">
            <div className="rx-items">
              {items.map((it, i) => (
                <div key={i} className="rx-item">
                  <div className="rx-item-head">
                    <span className="rx-n num">{i + 1}</span>
                    <div className="rx-item-name">
                      <input className="rx-name-input" value={it.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="שם התרופה" aria-label="שם התרופה" autoFocus={!it.name} />
                      {it.reg ? (it.form || it.strength) && <small>{[it.form, it.strength].filter(Boolean).join(' · ')}</small> : null}
                    </div>
                    <div className="rx-item-act">
                      <button type="button" className="icon-btn" title="שמירה ברשימה הקבועה" aria-label="שמירה ברשימה הקבועה" onClick={() => saveFav(it)}><Icon name="flag" size={15} /></button>
                      <button type="button" className="icon-btn" title="למעלה" aria-label="למעלה" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="icon-btn" title="הסרה" aria-label="הסרה" onClick={() => setItems(items.filter((_, n) => n !== i))}><Icon name="x" size={15} /></button>
                    </div>
                  </div>
                  <div className="rx-fields">
                    <label className="field"><span>מינון</span><input value={it.dose} onChange={(e) => set(i, { dose: e.target.value })} placeholder="1 טבליה / 500 מ״ג" /></label>
                    <label className="field"><span>תדירות</span><input list="rx-freq" value={it.frequency} onChange={(e) => set(i, { frequency: e.target.value })} placeholder="פעמיים ביום" /></label>
                    <label className="field"><span>משך</span><input list="rx-dur" value={it.duration} onChange={(e) => set(i, { duration: e.target.value })} placeholder="7 ימים" /></label>
                    <label className="field"><span>כמות</span><input value={it.quantity} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="1 אריזה" /></label>
                  </div>
                  {!it.reg && (
                    <div className="rx-fields rx-fields-2">
                      <label className="field"><span>חוזק <small>לא חובה</small></span><input dir="auto" value={it.strength || ''} onChange={(e) => set(i, { strength: e.target.value })} placeholder="500 mg" /></label>
                      <label className="field"><span>צורת מתן <small>לא חובה</small></span><input value={it.form || ''} onChange={(e) => set(i, { form: e.target.value })} placeholder="טבליות / משחה / טיפות" /></label>
                    </div>
                  )}
                  <label className="field"><span>הוראות נוספות <small>לא חובה</small></span><input value={it.notes || ''} onChange={(e) => set(i, { notes: e.target.value })} placeholder="אחרי האוכל, לא לשלב עם…" /></label>
                </div>
              ))}
              <datalist id="rx-freq">{FREQUENCIES.map((f) => <option key={f} value={f} />)}</datalist>
              <datalist id="rx-dur">{DURATIONS.map((f) => <option key={f} value={f} />)}</datalist>
              <button type="button" className="btn btn-ghost btn-sm rx-add-more" onClick={addFree}><Icon name="plus" size={15} />הוספת תרופה נוספת</button>
              <label className="field"><span>הערות למרשם <small>לא חובה</small></span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              {err && <p className="err">{err}</p>}
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}><Icon name="printer" />שמירה והדפסה</button>
                <button type="button" className="btn" disabled={busy} onClick={() => save(false)}><Icon name="save" />שמירה</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setItems([]); setNotes(''); }}>ביטול</button>
              </div>
            </div>
            {paper && (
              <div className="rx-live" aria-label="תצוגה מקדימה של המרשם">
                <span className="eyebrow"><Icon name="eye" size={13} />כך המרשם יודפס</span>
                <div className="rx-sheet-wrap">
                  <style>{docCss('.rx-sheet')}</style>
                  <div className="rx-sheet" dangerouslySetInnerHTML={{ __html: rxDocHtml({ settings: paper.settings, rxNo: null, date: todayIL(), patient: paper.patient, items: cleanItems(items), notes, banner: '/brand/letterhead.jpg' }) }} />
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rx-history">
          <span className="eyebrow">מרשמים בתיק</span>
          {rows.map((r) => <RxCard key={r.id} r={r} caseId={appointmentId} patientEmail={patientEmail} onRenew={readOnly ? undefined : () => { setItems(r.items.map((x) => ({ ...EMPTY, ...x }))); setNotes(r.notes); }} />)}
        </div>
      )}
      {past.length > 0 && !readOnly && (
        <div className="rx-history">
          <span className="eyebrow">מרשמים קודמים של המטופל</span>
          {past.map((r) => <RxCard key={r.id} r={r} caseId={appointmentId} sub={`תיק ${r.case_no}`} onRenew={() => { setItems(r.items.map((x) => ({ ...EMPTY, ...x }))); setNotes(r.notes); }} />)}
        </div>
      )}
      <p className="hint rx-legal"><Icon name="info" size={13} />מרשם מודפס עם חתימה וחותמת. הוא לא נשלח לבית המרקחת דיגיטלית, ולא מיועד לתרופות שדורשות טופס מיוחד.</p>
    </section>
  );
}

function RxCard({ r, caseId, patientEmail, onRenew, sub }: { r: RxRow; caseId: string; patientEmail?: string; onRenew?: () => void; sub?: string }) {
  const router = useRouter();
  const [mail, setMail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="rx-card">
      <div className="rx-card-head">
        <b>{r.rx_no ? `מרשם ${r.rx_no} · ` : ''}{fmtDate(r.rx_date)}</b>
        {sub && <span className="hint">{sub}</span>}
        {r.sent_at && <span className="badge b-done">נשלח במייל · {fmtStamp(r.sent_at)}</span>}
      </div>
      <ul>{r.items.map((i, n) => <li key={n}><b>{i.name}</b>{rxLine(i) && <span> · {rxLine(i)}</span>}</li>)}</ul>
      <div className="row" style={{ gap: 6 }}>
        <a className="btn btn-sm" href={`/rx/${r.id}/print`} target="_blank" rel="noopener"><Icon name="printer" />הדפסה</a>
        {patientEmail !== undefined && mail === null && <button type="button" className="btn btn-sm" onClick={() => setMail(patientEmail)}><Icon name="mail" />שליחה במייל</button>}
        {onRenew && <button type="button" className="btn btn-sm" onClick={onRenew}><Icon name="refresh" />חידוש מרשם</button>}
      </div>
      {mail !== null && (
        <form className="forward" onSubmit={(e) => { e.preventDefault(); start(async () => { const x = await sendPrescription(r.id, caseId, mail); setMsg({ ok: x.ok, text: x.ok ? x.info || 'נשלח' : x.error || 'השליחה נכשלה' }); if (x.ok) { setMail(null); router.refresh(); } }); }}>
          <input type="email" dir="ltr" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="מייל המטופל" aria-label="כתובת מייל" />
          <button className="btn btn-sm btn-primary" disabled={busy || !mail.trim()}><Icon name="send" />{busy ? 'שולח…' : 'שליחה'}</button>
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'}>{msg.text}</p>}
    </div>
  );
}
