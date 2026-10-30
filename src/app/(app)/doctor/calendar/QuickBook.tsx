'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, dbError } from '@/lib/constants';
import type { Service } from '@/lib/services';
import { DAYS, fmtDate, ilParts, weekday } from '@/lib/dates';
import { afterBooking } from '../../firm/actions';
import Icon from '@/components/Icon';

type Firm = { id: string; name: string; kind: string };
type Known = { patient_name: string; patient_id_number: string; patient_phone: string | null; patient_email: string | null; patient_dob: string | null; starts_at: string; visits: number };
type Ctx = { firms: Firm[]; services: Service[]; minutes: number; phoneOk: boolean };

const QBContext = createContext<Ctx | null>(null);

/** The lists the booking window needs, given once for the whole calendar (not once per slot). */
export function QuickBookProvider({ children, ...v }: Ctx & { children: React.ReactNode }) {
  return <QBContext.Provider value={v}>{children}</QBContext.Provider>;
}
export const useQuickBook = () => useContext(QBContext) as Ctx | null;

const digits = (v: string) => v.replace(/\D/g, '');
const COLS = 'patient_name, patient_id_number, patient_phone, patient_email, patient_dob, starts_at';
const EMPTY = { name: '', id: '', phone: '', email: '', dob: '', notes: '' };

/** Earlier visits of a patient, newest first, folded into one record per person. */
function fold(rows: Omit<Known, 'visits'>[]): Known[] {
  const by = new Map<string, Known>();
  for (const r of rows) {
    const k = digits(r.patient_id_number || '').replace(/^0+/, '') || r.patient_name.trim();
    const cur = by.get(k);
    if (cur) { cur.visits++; cur.patient_phone ||= r.patient_phone; cur.patient_email ||= r.patient_email; cur.patient_dob ||= r.patient_dob; }
    else by.set(k, { ...r, visits: 1 });
  }
  return [...by.values()];
}

/**
 * Booking window opened from a free slot in the calendar: the time is already set. Pick an existing patient
 * (search by name, ID or phone) or type a new one, choose the service and where the visit happens, and book.
 * The slot can also be blocked from here.
 */
export default function QuickBook({ iso, onClose, onBlock, blocking }: { iso: string; onClose: () => void; onBlock: () => void; blocking: boolean }) {
  const ctx = useQuickBook();
  const supabase = useSupabase();
  const router = useRouter();
  const firms = ctx?.firms ?? [];
  const services = ctx?.services ?? [];
  const privateFirm = firms.find((x) => x.kind === 'private')?.id ?? firms[0]?.id ?? '';
  const [who, setWho] = useState<'existing' | 'new'>('existing');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Known[]>([]);
  const [searching, setSearching] = useState(false);
  const [known, setKnown] = useState<Known | null>(null);
  const [f, setF] = useState(EMPTY);
  const [svc, setSvc] = useState<string>(services.find((s) => s.base_type === 'summary')?.id ?? services[0]?.id ?? '');
  const [mode, setMode] = useState<'clinic' | 'phone'>('clinic');
  const [firmId, setFirmId] = useState(privateFirm);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  const lookup = useRef(0);
  const first = useRef<HTMLInputElement | null>(null);

  const p = ilParts(iso);
  const end = ilParts(new Date(new Date(iso).getTime() + (ctx?.minutes || 30) * 60000));
  const service = services.find((s) => s.id === svc) ?? null;
  const firm = firms.find((x) => x.id === firmId);
  const emailOk = !f.email.trim() || EMAIL_RE.test(f.email.trim());
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  // Escape closes; the page behind doesn't scroll
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', key);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus once, without scrolling anything behind the window
    const t = setTimeout(() => first.current?.focus({ preventScroll: true }), 60);
    return () => { clearTimeout(t); document.removeEventListener('keydown', key); document.body.style.overflow = o; };
  }, []);

  // existing patient: search by name, ID or phone (recent patients when empty)
  useEffect(() => {
    if (who !== 'existing' || known) return;
    const term = q.trim().replace(/[%_,()]/g, '');
    const num = digits(term);
    if (term.length === 1) return;
    setSearching(true);
    const n = ++lookup.current;
    const t = setTimeout(async () => {
      let req = supabase.from('appointments').select(COLS).neq('patient_name', '').order('starts_at', { ascending: false }).limit(60);
      if (term.length >= 2) req = num.length >= 3 && num.length === term.replace(/[\s-]/g, '').length
        ? req.or(`patient_id_number.ilike.%${num}%,patient_phone.ilike.%${num}%`)
        : req.ilike('patient_name', `%${term}%`);
      const { data } = await req;
      if (n !== lookup.current) return;
      setFound(fold((data as Omit<Known, 'visits'>[] | null) ?? []).slice(0, term ? 6 : 5));
      setSearching(false);
    }, term ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, who, known, supabase]);

  // new patient: a full ID number of someone who was here before fills in the details
  useEffect(() => {
    const id = digits(f.id);
    if (who !== 'new' || id.length < 5) return;
    const n = ++lookup.current;
    const t = setTimeout(async () => {
      const ids = [...new Set([id, id.padStart(9, '0'), id.replace(/^0+/, '')])];
      const { data } = await supabase.from('appointments').select(COLS).in('patient_id_number', ids).order('starts_at', { ascending: false }).limit(50);
      if (n !== lookup.current) return;
      const k = fold((data as Omit<Known, 'visits'>[] | null) ?? [])[0];
      if (k) pick(k);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, who]);

  function pick(k: Known) {
    setKnown(k);
    setF((c) => ({ ...c, name: k.patient_name, id: k.patient_id_number || c.id, phone: c.phone.trim() || k.patient_phone || '', email: c.email.trim() || k.patient_email || '', dob: c.dob || k.patient_dob || '' }));
  }
  function unpick() {
    setKnown(null);
    setF(EMPTY);
    setQ('');
  }

  async function book() {
    const miss: string[] = [];
    if (!service) miss.push('סוג הביקור');
    if (!firmId) miss.push('מפנה');
    if (f.name.trim().length < 2) miss.push('שם המטופל');
    if (digits(f.id).length < 5) miss.push('תעודת זהות');
    if (f.phone.trim().length < 7) miss.push('טלפון');
    if (!emailOk) miss.push('מייל תקין (או להשאיר ריק)');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.from('appointments').insert({
      firm_id: firmId, starts_at: iso, service_id: service!.id, referral_type: service!.base_type, payer: firm?.kind === 'private' ? 'patient' : 'referrer', mode,
      patient_name: f.name.trim(), patient_id_number: f.id.trim(), patient_dob: f.dob || null, patient_phone: f.phone.trim(),
      patient_email: f.email.trim().toLowerCase(), notes: f.notes.trim(),
    }).select('id').single();
    if (error || !data) {
      setBusy(false);
      return setErr(error?.code === '23505' || error?.code === '23P01' ? 'המשבצת נתפסה בינתיים. סגרו ובחרו שעה אחרת.' : dbError(error));
    }
    // the summons email and the AI scan, as with any booking
    await afterBooking(data.id).catch(() => undefined);
    setBusy(false);
    setDone({ id: data.id, name: f.name.trim() });
    router.refresh();
  }

  const ready = f.name.trim().length >= 2 && digits(f.id).length >= 5 && f.phone.trim().length >= 7 && !!service;

  return createPortal(
    <div className="qb-layer" role="presentation" onClick={() => !busy && onClose()}>
      <div className="qb" role="dialog" aria-modal="true" aria-label="קביעת תור" onClick={(e) => e.stopPropagation()}>
        <header className="qb-head">
          <div className="qb-when">
            <span className="qb-k"><Icon name="calendarPlus" size={14} />קביעת תור</span>
            <b className="num">{p.time}<small>–{end.time}</small></b>
            <span>יום {DAYS[weekday(p.date)]} · <span className="num">{fmtDate(p.date)}</span></span>
          </div>
          <button type="button" className="qb-x" onClick={onClose} aria-label="סגירה" disabled={busy}><Icon name="x" /></button>
        </header>

        {done ? (
          <div className="qb-done">
            <span className="qb-ok"><Icon name="check" size={30} /></span>
            <h3>התור נקבע</h3>
            <p>{done.name} · יום {DAYS[weekday(p.date)]} {fmtDate(p.date)} בשעה <span className="num">{p.time}</span></p>
            <small>{f.email.trim() ? 'זימון נשלח למטופל במייל.' : 'אין מייל למטופל. אפשר לשלוח זימון בוואטסאפ מתוך התיק.'}</small>
            <div className="qb-done-a">
              <Link className="btn btn-primary" href={`/doctor/cases/${done.id}`}><Icon name="file" />לתיק</Link>
              <button type="button" className="btn" onClick={onClose}>סגירה</button>
            </div>
          </div>
        ) : (<>
          <div className="qb-body">
            <section className="qb-sec">
              <div className="qb-sh">
                <h3>המטופל</h3>
                {!known && (
                  <div className="qb-seg" role="radiogroup" aria-label="מטופל קיים או חדש">
                    <button type="button" role="radio" aria-checked={who === 'existing'} onClick={() => { setWho('existing'); setErr(''); }}>קיים</button>
                    <button type="button" role="radio" aria-checked={who === 'new'} onClick={() => { setWho('new'); setErr(''); }}>חדש</button>
                  </div>
                )}
              </div>

              {known ? (
                <div className="qb-picked">
                  <span className="qb-av">{known.patient_name.trim().slice(0, 1)}</span>
                  <span className="qb-pm">
                    <b>{known.patient_name}</b>
                    <small className="num">{known.patient_id_number ? `ת״ז ${known.patient_id_number}` : ''}{known.patient_phone ? ` · ${known.patient_phone}` : ''}</small>
                    <em><Icon name="clock" size={12} />{known.visits === 1 ? 'ביקור קודם אחד' : `${known.visits} ביקורים קודמים`} · אחרון {fmtDate(ilParts(known.starts_at).date)}</em>
                  </span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={unpick}>החלפה</button>
                </div>
              ) : who === 'existing' ? (
                <div className="qb-search">
                  <label className="qb-in">
                    <Icon name="search" size={16} />
                    <input ref={first} value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם, ת״ז או טלפון" aria-label="חיפוש מטופל" />
                  </label>
                  <div className="qb-list" aria-busy={searching}>
                    {!q.trim() && found.length > 0 && <span className="qb-cap">מטופלים אחרונים</span>}
                    {found.map((k) => (
                      <button type="button" key={k.patient_id_number + k.patient_name} onClick={() => pick(k)}>
                        <span className="qb-av sm">{k.patient_name.trim().slice(0, 1)}</span>
                        <span className="qb-pm"><b>{k.patient_name}</b><small className="num">{k.patient_id_number ? `ת״ז ${k.patient_id_number} · ` : ''}{k.visits === 1 ? 'ביקור אחד' : `${k.visits} ביקורים`}</small></span>
                        <Icon name="chevron" size={14} className="flip" />
                      </button>
                    ))}
                    {!searching && q.trim().length >= 2 && found.length === 0 && (
                      <div className="qb-none">לא נמצא מטופל. <button type="button" className="link" onClick={() => { setWho('new'); setF({ ...EMPTY, ...(digits(q).length >= 5 ? { id: digits(q) } : { name: q.trim() }) }); }}>הוספה כמטופל חדש</button></div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="qb-grid">
                  <label className="field"><span>שם מלא</span><input ref={first} value={f.name} onChange={set('name')} autoComplete="off" /></label>
                  <label className="field"><span>תעודת זהות</span><input value={f.id} onChange={set('id')} inputMode="numeric" className="num" autoComplete="off" /></label>
                  <label className="field"><span>טלפון</span><input value={f.phone} onChange={set('phone')} inputMode="tel" type="tel" className="num" /></label>
                  <label className="field"><span>מייל <small>לזימון</small></span><input value={f.email} onChange={set('email')} type="email" dir="ltr" aria-invalid={!emailOk} /></label>
                </div>
              )}
              {known && (
                <div className="qb-grid">
                  <label className="field"><span>טלפון</span><input value={f.phone} onChange={set('phone')} inputMode="tel" type="tel" className="num" /></label>
                  <label className="field"><span>מייל <small>לזימון</small></span><input value={f.email} onChange={set('email')} type="email" dir="ltr" aria-invalid={!emailOk} /></label>
                </div>
              )}
            </section>

            <section className="qb-sec">
              <div className="qb-sh"><h3>הביקור</h3></div>
              <div className="qb-chips" role="radiogroup" aria-label="סוג הביקור">
                {services.map((s) => (
                  <button type="button" key={s.id} role="radio" aria-checked={svc === s.id} onClick={() => setSvc(s.id)}><Icon name={s.icon || 'file'} size={15} />{s.label}</button>
                ))}
              </div>
              <div className="qb-row">
                <div className="qb-seg wide" role="radiogroup" aria-label="סוג הפגישה">
                  <button type="button" role="radio" aria-checked={mode === 'clinic'} onClick={() => setMode('clinic')}><Icon name="building" size={15} />במרפאה</button>
                  {ctx?.phoneOk !== false && <button type="button" role="radio" aria-checked={mode === 'phone'} onClick={() => setMode('phone')}><Icon name="phone" size={15} />טלפוני</button>}
                </div>
                <label className="qb-firm">
                  <span>מפנה</span>
                  <select value={firmId} onChange={(e) => setFirmId(e.target.value)}>
                    {firms.map((x) => <option key={x.id} value={x.id}>{x.kind === 'private' ? 'פנייה ישירה (פרטי)' : x.name}</option>)}
                  </select>
                </label>
              </div>
              {!more ? (
                <button type="button" className="qb-more" onClick={() => setMore(true)}><Icon name="plus" size={14} />הערה{who === 'new' && !known ? ' ותאריך לידה' : ''}</button>
              ) : (
                <div className="qb-grid">
                  {!known && <label className="field"><span>תאריך לידה</span><input type="date" value={f.dob} onChange={set('dob')} /></label>}
                  <label className="field qb-full"><span>הערה <small>לצוות בלבד</small></span><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="למשל: כאבי גב תחתון, הביא צילום" /></label>
                </div>
              )}
            </section>
          </div>

          <footer className="qb-foot">
            {err && <p className="err" role="alert">{err}</p>}
            <div className="qb-fa">
              <button type="button" className="btn btn-primary qb-go" onClick={book} disabled={busy || !ready}>
                {busy ? 'קובע…' : <><Icon name="check" />קביעת התור · <span className="num">{p.time}</span></>}
              </button>
              <button type="button" className="btn btn-ghost qb-block" onClick={onBlock} disabled={busy || blocking}><Icon name="x" />{blocking ? 'חוסם…' : 'חסימת המשבצת'}</button>
            </div>
          </footer>
        </>)}
      </div>
    </div>,
    document.body,
  );
}
