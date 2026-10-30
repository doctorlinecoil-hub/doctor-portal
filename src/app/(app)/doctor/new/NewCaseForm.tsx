'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, dbError } from '@/lib/constants';
import type { Service } from '@/lib/services';
import ServicePicker from '@/components/ServicePicker';
import { fmtDate, ilParts, ilToUtc } from '@/lib/dates';
import Icon from '@/components/Icon';

type Firm = { id: string; name: string; kind: string };
type Known = { patient_name: string; patient_id_number: string; patient_phone: string | null; patient_email: string | null; patient_dob: string | null; starts_at: string; visits: number };

const digits = (v: string) => v.replace(/\D/g, '');

/**
 * A letter or a prescription for a patient, any day, without a slot: pick what to write, who it is for,
 * and go straight to the document. A few words for the AI are enough for a full, polished draft.
 * A returning patient is recognised by ID number or name and the details fill in by themselves.
 */
export default function NewCaseForm({ firms, services, initial, preview }: {
  firms: Firm[]; services: Service[]; preview?: boolean;
  initial: { firm: string; name: string; id: string; dob: string; phone: string; email: string; what: 'letter' | 'rx'; date: string; time: string };
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [f, setF] = useState({ ...initial, brief: '' });
  const [svc, setSvc] = useState<Service | null>(services.find((x) => x.base_type === 'summary') ?? services[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [known, setKnown] = useState<Known | null>(null);
  const [hits, setHits] = useState<Known[]>([]);
  const lookup = useRef(0);
  const [mode, setMode] = useState<'existing' | 'new'>(initial.name || initial.id ? 'new' : 'existing');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Known[]>([]);
  const [searching, setSearching] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const emailOk = !f.email.trim() || EMAIL_RE.test(f.email.trim());
  const isRx = f.what === 'rx';
  // the doctor's own patients: no referrer to choose
  const firmId = initial.firm || firms.find((x) => x.kind === 'private')?.id || firms[0]?.id || '';

  /** Earlier visits of a patient, newest first, folded into one record. */
  const fold = (rows: Omit<Known, 'visits'>[]): Known[] => {
    const by = new Map<string, Known>();
    for (const r of rows) {
      const k = digits(r.patient_id_number || '').replace(/^0+/, '') || r.patient_name.trim();
      const cur = by.get(k);
      if (cur) { cur.visits++; cur.patient_phone ||= r.patient_phone; cur.patient_email ||= r.patient_email; cur.patient_dob ||= r.patient_dob; }
      else by.set(k, { ...r, visits: 1 });
    }
    return [...by.values()];
  };
  const COLS = 'patient_name, patient_id_number, patient_phone, patient_email, patient_dob, starts_at';

  // ID number typed in full: recognise a returning patient
  useEffect(() => {
    const id = digits(f.id);
    if (preview || id.length < 5) { if (known && digits(known.patient_id_number) !== id) setKnown(null); return; }
    const n = ++lookup.current;
    const t = setTimeout(async () => {
      const ids = [...new Set([id, id.padStart(9, '0'), id.replace(/^0+/, '')])];
      const { data } = await supabase.from('appointments').select(COLS).in('patient_id_number', ids).order('starts_at', { ascending: false }).limit(50);
      if (n !== lookup.current) return;
      const k = fold((data as Omit<Known, 'visits'>[] | null) ?? [])[0] ?? null;
      setKnown(k);
      if (k) fill(k, false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);

  // existing patient: search by name, ID or phone (recent patients when empty)
  useEffect(() => {
    if (preview || mode !== 'existing' || known) return;
    const term = q.trim().replace(/[%_,()]/g, '');
    const num = digits(term);
    setSearching(true);
    const t = setTimeout(async () => {
      let req = supabase.from('appointments').select(COLS).neq('patient_name', '').order('starts_at', { ascending: false }).limit(60);
      if (term.length >= 2) req = num.length >= 3 && num.length === term.replace(/[\s-]/g, '').length
        ? req.or(`patient_id_number.ilike.%${num}%,patient_phone.ilike.%${num}%`)
        : req.ilike('patient_name', `%${term}%`);
      else if (term) { setSearching(false); return; }
      const { data } = await req;
      setFound(fold((data as Omit<Known, 'visits'>[] | null) ?? []).slice(0, term ? 8 : 6));
      setSearching(false);
    }, term ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, known]);

  // name typed: suggest patients who were here before
  useEffect(() => {
    const q = f.name.trim();
    if (preview || q.length < 2 || known) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('appointments').select(COLS).ilike('patient_name', `%${q.replace(/[%_,()]/g, '')}%`).order('starts_at', { ascending: false }).limit(40);
      setHits(fold((data as Omit<Known, 'visits'>[] | null) ?? []).slice(0, 5));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.name, known]);

  function fill(k: Known, all = true) {
    setF((cur) => ({
      ...cur,
      name: all || !cur.name.trim() ? k.patient_name : cur.name,
      id: all ? k.patient_id_number || cur.id : cur.id,
      phone: cur.phone.trim() ? cur.phone : k.patient_phone || '',
      email: cur.email.trim() ? cur.email : k.patient_email || '',
      dob: cur.dob || k.patient_dob || '',
    }));
    setKnown(k);
    setHits([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!firmId) miss.push('הגדרת ״פניות ישירות״');
    if (!svc) miss.push('סוג המסמך');
    if (f.name.trim().length < 2) miss.push('שם המטופל');
    if (digits(f.id).length < 5) miss.push('תעודת זהות');
    if (!emailOk) miss.push('מייל תקין');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    if (preview) return setErr('תצוגה מקדימה.');
    setBusy(true);
    setErr('');
    const now = ilParts(new Date());
    const { data, error } = await supabase.from('appointments').insert({
      firm_id: firmId, walk_in: true, starts_at: ilToUtc(now.date, now.time.slice(0, 5)).toISOString(), service_id: svc!.id, referral_type: svc!.base_type,
      payer: 'patient',
      patient_name: f.name.trim(), patient_id_number: f.id.trim(), patient_dob: f.dob || null, patient_phone: f.phone.trim(),
      patient_email: f.email.trim().toLowerCase(), notes: '',
    }).select('id').single();
    if (error || !data) { setBusy(false); return setErr(dbError(error)); }
    const brief = f.brief.trim();
    if (!isRx && brief) {
      // the few words become the doctor's findings; the letter page writes the draft from them right away
      await supabase.from('letters').upsert({ appointment_id: data.id, letter_type: svc!.base_type, recipient: '', subject: '', body: '', exam_notes: brief.slice(0, 20000) }, { onConflict: 'appointment_id' });
    }
    router.push(`/doctor/cases/${data.id}${!isRx && brief ? '?ai=1' : ''}#${f.what}`);
  }

  return (
    <form className="nd" onSubmit={submit} noValidate>
      <section className="nd-hero">
        <div>
          <span className="nd-kicker"><Icon name="sparkles" size={14} />מסמך או מרשם · בכל יום, בלי תור</span>
          <h1>מה מכינים?</h1>
          <p>בוחרים, ממלאים שם ות״ז, ונכנסים ישר לכתיבה. מטופל שכבר היה כאן מזוהה לבד.</p>
        </div>
        <div className="nd-pick" role="radiogroup" aria-label="סוג המסמך">
          <button type="button" role="radio" aria-checked={!isRx} className={!isRx ? 'on' : ''} onClick={() => setF({ ...f, what: 'letter' })}>
            <span className="nd-pic"><Icon name="file" size={26} /></span>
            <b>מסמך / מכתב</b><small>סיכום ביקור, חוות דעת, אישור</small>
            <span className="nd-tick"><Icon name="check" size={14} /></span>
          </button>
          <button type="button" role="radio" aria-checked={isRx} className={isRx ? 'on' : ''} onClick={() => setF({ ...f, what: 'rx' })}>
            <span className="nd-pic rx"><Icon name="pill" size={26} /></span>
            <b>מרשם תרופות</b><small>חיפוש תרופה, הדפסה ושליחה</small>
            <span className="nd-tick"><Icon name="check" size={14} /></span>
          </button>
        </div>
      </section>

      <div className="nd-grid">
        <div className="nd-main">
          <section className="nd-card">
            <div className="nd-h"><span className="nd-step">1</span><h2>למי?</h2>
              <div className="nd-who" role="radiogroup" aria-label="מטופל קיים או חדש">
                <button type="button" role="radio" aria-checked={mode === 'existing'} className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}><Icon name="users" size={15} />מטופל קיים</button>
                <button type="button" role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => { setMode('new'); }}><Icon name="plus" size={15} />מטופל חדש</button>
              </div>
            </div>

            {mode === 'existing' && (known ? (
              <div className="nd-picked">
                <span className="fc-av lg">{known.patient_name.trim().slice(0, 1)}</span>
                <div className="nd-picked-m">
                  <b>{f.name || known.patient_name}</b>
                  <small className="num">{f.id ? `ת״ז ${f.id}` : ''}{f.phone ? ` · ${f.phone}` : ''}</small>
                  <span className="nd-known"><Icon name="checkCircle" size={13} />{known.visits === 1 ? 'ביקור קודם אחד' : `${known.visits} ביקורים`} · אחרון {fmtDate(ilParts(known.starts_at).date)}</span>
                </div>
                <div className="nd-picked-a">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('new')}><Icon name="settings" size={14} />עריכת פרטים</button>
                  <button type="button" className="btn btn-sm" onClick={() => { setKnown(null); setF({ ...f, name: '', id: '', phone: '', email: '', dob: '' }); setQ(''); }}><Icon name="refresh" size={14} />החלפה</button>
                </div>
              </div>
            ) : (
              <div className="nd-find">
                <label className="nd-search">
                  <Icon name="search" size={18} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, ת״ז או טלפון" autoFocus aria-label="חיפוש מטופל קיים" autoComplete="off" />
                </label>
                <span className="nd-find-h">{q.trim() ? (found.length ? 'תוצאות' : '') : 'מטופלים אחרונים'}</span>
                {found.length > 0 ? (
                  <ul className="nd-results">
                    {found.map((h) => (
                      <li key={h.patient_id_number + h.patient_name}>
                        <button type="button" onClick={() => fill(h)}>
                          <span className="fc-av">{h.patient_name.trim().slice(0, 1)}</span>
                          <span className="nd-r-m"><b>{h.patient_name}</b><small className="num">{h.patient_id_number ? `ת״ז ${h.patient_id_number}` : 'ללא ת״ז'}{h.patient_phone ? ` · ${h.patient_phone}` : ''}</small></span>
                          <span className="nd-r-v">{h.visits === 1 ? 'ביקור אחד' : `${h.visits} ביקורים`}<small className="num">{fmtDate(ilParts(h.starts_at).date)}</small></span>
                          <Icon name="chevron" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : q.trim().length >= 2 && !searching ? (
                  <div className="nd-none">לא מצאנו מטופל כזה. <button type="button" className="link" onClick={() => { setMode('new'); setF({ ...f, ...(/^\d+$/.test(q.trim()) ? { id: q.trim() } : { name: q.trim() }) }); }}>הוספה כמטופל חדש</button></div>
                ) : null}
              </div>
            ))}

            {mode === 'new' && (
              <div className="grid-2">
              <label className="field nd-name"><span>שם מלא</span>
                <input value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); if (known && e.target.value.trim() !== known.patient_name.trim()) setKnown(null); }} autoFocus={!f.name} placeholder="שם המטופל" autoComplete="off" />
                {hits.length > 0 && (
                  <ul className="nd-hits" role="listbox" aria-label="מטופלים שהיו כאן">
                    {hits.map((h) => (
                      <li key={h.patient_id_number + h.patient_name}>
                        <button type="button" onClick={() => fill(h)}>
                          <span className="fc-av">{h.patient_name.trim().slice(0, 1)}</span>
                          <span><b>{h.patient_name}</b><small className="num">{h.patient_id_number ? `ת״ז ${h.patient_id_number} · ` : ''}{h.visits === 1 ? 'ביקור אחד' : `${h.visits} ביקורים`}</small></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
              <label className="field"><span>תעודת זהות</span><input inputMode="numeric" dir="ltr" value={f.id} onChange={set('id')} placeholder="000000000" /></label>
              <label className="field"><span>טלפון <small>לא חובה</small></span><input type="tel" dir="ltr" value={f.phone} onChange={set('phone')} placeholder="050-0000000" /></label>
              <label className="field"><span>מייל <small>לא חובה · לשליחה</small></span><input type="email" dir="ltr" value={f.email} onChange={set('email')} aria-invalid={!emailOk} placeholder="name@example.com" /></label>
              </div>
            )}
          </section>

          {!isRx && (
            <>
              <section className="nd-card">
                <div className="nd-h"><span className="nd-step">2</span><h2>איזה מסמך?</h2></div>
                <ServicePicker services={services} value={svc?.id ?? null} onChange={setSvc} compact />
              </section>
              <section className="nd-card nd-ai">
                <div className="nd-h"><span className="nd-step ai"><Icon name="sparkles" size={16} /></span><h2>כמה מילים ל־AI</h2><small className="hint">לא חובה</small></div>
                <textarea rows={3} value={f.brief} onChange={set('brief')} maxLength={4000}
                  placeholder="למשל: כאבי גב תחתון 3 חודשים, MRI ללא ממצא משמעותי, בדיקה נוירולוגית תקינה. ממליץ פיזיותרפיה ומעקב בעוד חודש." />
                <p className="hint">ה־AI יכתוב מזה מסמך מלא, מנוסח ומרשים, ואתם עוברים ומאשרים.</p>
              </section>
            </>
          )}
        </div>

        <aside className="nd-side">
          <div className="nd-sum">
            <span className={`nd-sum-ic${isRx ? ' rx' : ''}`}><Icon name={isRx ? 'pill' : 'file'} size={22} /></span>
            <b>{isRx ? 'מרשם תרופות' : svc?.label || 'מסמך'}</b>
            <dl>
              <dt>מטופל</dt><dd>{f.name.trim() || '—'}</dd>
              <dt>ת״ז</dt><dd className="num">{f.id.trim() || '—'}</dd>
              {known && <><dt>היסטוריה</dt><dd>{known.visits === 1 ? 'ביקור קודם אחד' : `${known.visits} ביקורים קודמים`}</dd></>}
            </dl>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn btn-primary btn-lg nd-go" disabled={busy}>
              {busy ? 'פותח…' : isRx ? <><Icon name="pill" />לכתיבת המרשם</> : f.brief.trim() ? <><Icon name="sparkles" />ניסוח עם AI ופתיחה</> : <><Icon name="marker" />לכתיבת המסמך</>}
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}
