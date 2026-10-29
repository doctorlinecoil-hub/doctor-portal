'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMAIL_RE, ils } from '@/lib/constants';
import { DAYS, fmtDay, ilParts, weekday } from '@/lib/dates';
import type { DaySlots } from '@/lib/slots';
import type { Service } from '@/lib/services';
import type { Extracted } from '@/lib/extract';
import { checkFile } from '@/lib/upload';
import Icon from '@/components/Icon';
import ServicePicker from '@/components/ServicePicker';
import DepositBox, { type PayInfo } from '@/components/DepositBox';
import { depositProofDone, depositProofUrl, publicBook, publicDraft, publicFinish, publicScan, publicUploadStart } from './actions';

type Kind = 'law' | 'broker' | 'private';
type Up = { token: string; files: { path: string; name: string; type: string }[] };
const KINDS: { k: Kind; label: string; icon: string }[] = [
  { k: 'law', label: 'משרד עורכי דין', icon: 'scale' },
  { k: 'broker', label: 'מתווך / חברה', icon: 'briefcase' },
  { k: 'private', label: 'אני המטופל', icon: 'user' },
];
const STEPS = ['שירות', 'מועד', 'מסמכים', 'אישור פרטים'];
const EMPTY_PT = { name: '', idNumber: '', dob: '', phone: '', email: '' };

/**
 * The public booking page, one step at a time:
 * 1. what is needed  2. date and time  3. documents (read automatically)  4. check the details found, emails, send.
 */
export default function PublicBooking({ open, clinic, services, slots, code, firm, demo }: {
  open: boolean; clinic: { name: string; address: string; phone: string; needsApproval: boolean };
  services: Service[]; slots: DaySlots[]; code: string; firm: { name: string; kind: string } | null;
  /** the design previews only: open on a given step */
  demo?: { step: number; ext?: Extracted; scanning?: boolean };
}) {
  const [step, setStep] = useState(demo?.step ?? (services.length === 1 ? 2 : 1));
  const [svc, setSvc] = useState<Service | null>(demo ? services[0] : services.length === 1 ? services[0] : null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const visible = useMemo(() => slots.map((d) => ({ ...d, times: d.times.filter((t) => !taken.has(t.iso)) })).filter((d) => d.times.length), [slots, taken]);
  const [day, setDay] = useState<string | null>(visible[0]?.date ?? null);
  const [slot, setSlot] = useState<string | null>(demo && demo.step > 2 ? slots[0]?.times[1]?.iso ?? null : null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState('');
  const [over, setOver] = useState(false);
  const [up, setUp] = useState<Up | null>(null);
  const [upFor, setUpFor] = useState<File[]>([]);
  const [scan, setScan] = useState<{ phase: 'idle' | 'upload' | 'read' | 'done' | 'manual'; text: string; n?: number }>(demo?.scanning ? { phase: 'read', text: 'קוראים את המסמכים ומחפשים את הפרטים…' } : demo?.ext ? { phase: 'done', text: '' } : { phase: 'idle', text: '' });
  const [ext, setExt] = useState<Extracted | null>(demo?.ext ?? null);

  const [kind, setKind] = useState<Kind>(firm ? (firm.kind === 'broker' ? 'broker' : 'law') : 'law');
  const [ref, setRef] = useState(demo?.ext ? { office: demo.ext.referrer_office || '', contact: demo.ext.referrer_contact || '', phone: demo.ext.referrer_phone || '', email: demo.ext.referrer_email || '' } : { office: '', contact: '', phone: '', email: '' });
  const [pt, setPt] = useState(demo?.ext ? { name: demo.ext.name, idNumber: demo.ext.id_number, dob: demo.ext.dob, phone: demo.ext.phone, email: demo.ext.email } : EMPTY_PT);
  const [extra, setExtra] = useState<string[]>(demo?.ext ? ['secretary@cohen-law.co.il'] : []);
  const [payer, setPayer] = useState<'patient' | 'referrer'>('patient');
  const [notes, setNotes] = useState(demo?.ext?.request || '');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ caseNo: number; pending: boolean; docs: number; id: string; key: string; deposit: number; holdHours: number; pay: PayInfo } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const dayTimes = visible.find((d) => d.date === day)?.times ?? [];
  const chosen = slot ? ilParts(slot) : null;
  const self = !firm && kind === 'private';
  const sure = new Set(ext?.sure ?? []);

  useEffect(() => { top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [step, done]);

  function go(n: number) { setErr(''); setStep(n); }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) { const e = checkFile(f); if (e) bad.push(e); else ok.push(f); }
    setFileErr(bad.join(' · '));
    setFiles([...files, ...ok].slice(0, 20));
  }

  /** Uploads the chosen files once (again only if the list changed). */
  async function upload(): Promise<Up | null> {
    if (!files.length) return null;
    if (up && upFor.length === files.length && upFor.every((f, i) => f === files[i])) return up;
    setScan({ phase: 'upload', text: `מעלה ${files.length === 1 ? 'את המסמך' : `${files.length} מסמכים`}…` });
    const r = await publicUploadStart(files.map((f) => ({ name: f.name, size: f.size, type: f.type })), website).catch(() => null);
    if (!r?.ok) { setScan({ phase: 'idle', text: '' }); setErr(r?.error || 'אין חיבור. נסו שוב.'); return null; }
    const okList: Up['files'] = [];
    for (let i = 0; i < files.length; i++) {
      setScan({ phase: 'upload', text: `מעלה מסמך ${i + 1} מתוך ${files.length}…`, n: Math.round(((i + 0.5) / files.length) * 100) });
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', files[i]);
      const res = await fetch(r.urls[i].url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
      if (res?.ok) okList.push({ path: r.urls[i].path, name: files[i].name, type: files[i].type });
    }
    if (okList.length < files.length) setFileErr(`${files.length - okList.length} מסמכים לא הועלו. אפשר לנסות שוב או להמשיך בלעדיהם.`);
    const u = { token: r.token, files: okList };
    setUp(u);
    setUpFor(files);
    return u;
  }

  function apply(x: Extracted) {
    setPt((p) => ({ name: x.name || p.name, idNumber: x.id_number || p.idNumber, dob: x.dob || p.dob, phone: x.phone || p.phone, email: x.email || p.email }));
    if (!firm) {
      if (x.referrer_kind) setKind(x.referrer_kind);
      setRef((r) => ({ office: x.referrer_office || r.office, contact: x.referrer_contact || r.contact, phone: x.referrer_phone || r.phone, email: x.referrer_email || r.email }));
    }
    const note = [x.request, x.event && `האירוע: ${x.event}${x.event_date ? ` (${x.event_date})` : ''}`].filter(Boolean).join('\n');
    if (note) setNotes((n) => n || note);
  }

  async function scanDocs() {
    setErr('');
    const u = await upload();
    if (!u) return;
    if (!u.files.length) { setScan({ phase: 'manual', text: 'המסמכים לא הועלו. מלאו את הפרטים ידנית.' }); go(4); return; }
    setScan({ phase: 'read', text: 'קוראים את המסמכים ומחפשים את הפרטים…' });
    const r = await publicScan(u.token, u.files).catch(() => null);
    if (r?.ok) {
      setExt(r.data);
      apply(r.data);
      setScan({ phase: 'done', text: '' });
    } else {
      setScan({ phase: 'manual', text: r?.error || 'לא הצלחנו לקרוא את המסמכים. מלאו את הפרטים ידנית.' });
    }
    go(4);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!svc) miss.push('שירות');
    if (!slot) miss.push('מועד');
    if (!firm && !self) {
      if (ref.office.trim().length < 2) miss.push(kind === 'broker' ? 'שם החברה' : 'שם המשרד');
      if (ref.contact.trim().length < 2) miss.push('איש קשר');
      if (ref.phone.replace(/\D/g, '').length < 9) miss.push('טלפון המפנה');
      if (!EMAIL_RE.test(ref.email.trim())) miss.push('מייל המפנה');
    }
    if (pt.name.trim().length < 2) miss.push('שם המטופל');
    if (pt.idNumber.replace(/\D/g, '').length < 5) miss.push('תעודת זהות');
    if (pt.phone.replace(/\D/g, '').length < 9) miss.push('טלפון המטופל');
    if (pt.email.trim() && !EMAIL_RE.test(pt.email.trim())) miss.push('מייל מטופל תקין');
    if (self && !pt.email.trim()) miss.push('מייל המטופל');
    const extras = extra.map((x) => x.trim()).filter(Boolean);
    if (extras.some((x) => !EMAIL_RE.test(x))) miss.push('מייל נוסף תקין');
    if (miss.length) { setErr('חסר: ' + miss.join(', ')); return; }
    setErr('');
    // documents added after the scan (or without one) are uploaded now
    const u = files.length ? await upload() : null;
    setBusy('שולח את הבקשה…');
    const r = await publicBook({
      code, serviceId: svc!.id, slot: slot!, referrer: { kind: firm ? (kind === 'private' ? 'law' : kind) : kind, ...ref },
      patient: pt, payer, notes, website, extraEmails: extras, upload: u ?? undefined, extract: ext,
    }).catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    setScan((s) => (s.phase === 'upload' ? { phase: 'idle', text: '' } : s));
    if (!r.ok) {
      setBusy('');
      setErr(r.error);
      if (r.error.includes('נתפס')) { setTaken(new Set([...taken, slot!])); setSlot(null); go(2); setErr('המועד שבחרתם נתפס הרגע. בחרו מועד אחר — הפרטים שמילאתם נשמרו.'); }
      return;
    }
    await publicFinish(r.id, r.key).catch(() => undefined);
    publicDraft(r.id, r.key).catch(() => undefined);
    setBusy('');
    setDone({ caseNo: r.caseNo, pending: r.pending, docs: r.docs, id: r.id, key: r.key, deposit: r.deposit, holdHours: r.holdHours, pay: r.pay });
  }

  function reset() {
    setDone(null); setSlot(null); setPt(EMPTY_PT); setFiles([]); setUp(null); setUpFor([]); setExt(null); setNotes(''); setExtra([]);
    setScan({ phase: 'idle', text: '' }); setStep(services.length === 1 ? 2 : 1);
    if (!firm) setRef({ office: '', contact: '', phone: '', email: '' });
  }

  const Head = (
    <header className="pb-head">
      <img src="/brand/letterhead.jpg" alt={clinic.name} className="pb-banner" />
      <div className="pb-sub"><b>קביעת תור</b><span>{[clinic.address, clinic.phone && `טל׳ ${clinic.phone}`].filter(Boolean).join(' · ')}</span></div>
    </header>
  );

  if (!open) return <main className="pb"><div ref={top} />{Head}<section className="pb-card"><p className="muted">קביעת תור מקוונת סגורה כרגע. צרו קשר עם המרפאה{clinic.phone ? ` בטלפון ${clinic.phone}` : ''}.</p></section></main>;

  if (done) {
    const p = ilParts(slot!);
    const to = [!self && ref.email, pt.email, ...extra].filter(Boolean) as string[];
    return (
      <main className="pb">
        <div ref={top} />
        {Head}
        <section className="pb-card pb-done">
          <span className="pb-check"><Icon name={done.deposit > 0 ? 'wallet' : 'checkCircle'} /></span>
          <h1>{done.deposit > 0 ? 'נשאר רק להעביר מקדמה' : done.pending ? 'הבקשה נשלחה לרופא' : 'התור נקבע'}</h1>
          <p className="pb-lead">{done.deposit > 0
            ? 'המועד שמור עבורכם. כדי שהרופא יאשר את התור, העבירו את המקדמה והעלו צילום של אישור ההעברה. פרטי התשלום נשלחו גם למייל.'
            : done.pending ? 'ברגע שהרופא יאשר, יישלח אישור זימון במייל.' : 'אישור הזימון נשלח במייל.'}{to.length && !done.deposit ? ` המכתבים של הרופא יישלחו לאותן כתובות.` : ''}</p>
          {done.deposit > 0 && (
            <DepositBox amount={done.deposit} title="מקדמה לשריון התור" pay={done.pay} holdHours={done.holdHours}
              upload={async (f) => {
                const u = await depositProofUrl(done.id, done.key, { name: f.name, size: f.size, type: f.type });
                if (!u.ok) return { ok: false, error: u.error };
                const body = new FormData();
                body.append('cacheControl', '3600');
                body.append('', f);
                const res = await fetch(u.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
                if (!res?.ok) return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' };
                return depositProofDone(done.id, done.key, { path: u.path, name: f.name, type: f.type });
              }} />
          )}
          <dl className="kv">
            <dt>מספר תיק</dt><dd className="num">{done.caseNo}</dd>
            <dt>מטופל</dt><dd>{pt.name}</dd>
            <dt>מועד</dt><dd>{fmtDay(p.date)} · {p.time}</dd>
            <dt>שירות</dt><dd>{svc?.label}</dd>
            <dt>מסמכים</dt><dd>{done.docs ? `${done.docs} מסמכים צורפו לתיק` : 'לא צורפו'}</dd>
            {to.length > 0 && <><dt>עדכונים יישלחו אל</dt><dd dir="ltr" className="pb-mails">{to.join(', ')}</dd></>}
          </dl>
          <button type="button" className="btn btn-primary" onClick={reset}><Icon name="plus" />קביעת תור למטופל נוסף</button>
        </section>
      </main>
    );
  }

  const field = (label: string, key: keyof typeof EMPTY_PT, extraProps: { type?: string; inputMode?: 'numeric'; dir?: string; autoComplete?: string; placeholder?: string } = {}, extKey?: string) => (
    <label className="field">
      <span>{label}{ext && extKey && sure.has(extKey) && pt[key] ? <em className="pb-found"><Icon name="sparkles" size={12} />מהמסמכים</em> : null}</span>
      <input value={pt[key]} onChange={(e) => setPt({ ...pt, [key]: e.target.value })} {...extraProps} />
    </label>
  );

  return (
    <main className="pb">
      <div ref={top} />
      {Head}

      <nav className="pbw-steps" aria-label="שלבים">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const can = n < step || (n === 2 && !!svc) || (n === 3 && !!svc && !!slot) || (n === 4 && !!svc && !!slot && scan.phase !== 'idle');
          return (
            <button key={s} type="button" className={`pbw-step${n === step ? ' on' : ''}${n < step ? ' past' : ''}`} disabled={!can || !!busy || scan.phase === 'upload' || scan.phase === 'read'} onClick={() => go(n)} aria-current={n === step ? 'step' : undefined}>
              <span className="pbw-dot">{n < step ? <Icon name="check" size={14} /> : n}</span><span className="pbw-label">{s}</span>
            </button>
          );
        })}
      </nav>

      {(svc || chosen) && step > 1 && (
        <div className="pbw-sum">
          {firm && <span><Icon name="briefcase" size={15} />{firm.name}</span>}
          {svc && <span><Icon name="stethoscope" size={15} />{svc.label}{Number(svc.price) > 0 ? ` · ${ils(Number(svc.price))}` : ''}</span>}
          {chosen && step > 2 && <span><Icon name="calendar" size={15} />{fmtDay(chosen.date)} · {chosen.time}</span>}
        </div>
      )}

      <section className="pb-card pbw-card">
        {step === 1 && (
          <div className="pbw-pane">
            <h1 className="pbw-h">במה הרופא יכול לעזור?</h1>
            <p className="pbw-lead">בחרו את סוג השירות. בשלב הבא בוחרים מועד.</p>
            <ServicePicker services={services} value={svc?.id ?? null} onChange={(s) => { setSvc(s); setTimeout(() => go(2), 180); }} />
          </div>
        )}

        {step === 2 && (
          <div className="pbw-pane">
            <h1 className="pbw-h">מתי נוח לכם?</h1>
            <p className="pbw-lead">בחרו יום ושעה. השעות המוצגות פנויות כרגע.</p>
            {err && <p className="err" role="alert">{err}</p>}
            {visible.length === 0 ? <p className="muted">אין כרגע תורים פנויים. צרו קשר עם המרפאה{clinic.phone ? ` בטלפון ${clinic.phone}` : ''}.</p> : (
              <>
                <div className="dates" role="listbox" aria-label="ימים פנויים">
                  {visible.map((d) => (
                    <button key={d.date} type="button" className="date" aria-pressed={day === d.date} onClick={() => { setDay(d.date); setSlot(null); }}>
                      <small>{DAYS[weekday(d.date)]}</small><b className="num">{+d.date.slice(8, 10)}</b><em>{d.times.length} פנויים</em>
                    </button>
                  ))}
                </div>
                {day && <div className="pbw-dayname">{fmtDay(day)}</div>}
                <div className="times">
                  {dayTimes.map((t) => <button key={t.iso} type="button" className="time" aria-pressed={slot === t.iso} onClick={() => { setSlot(t.iso); setTimeout(() => go(3), 180); }}>{t.time}</button>)}
                </div>
              </>
            )}
            <div className="pbw-nav"><button type="button" className="btn btn-ghost" onClick={() => go(1)}><Icon name="arrowLeft" size={15} className="flip" />חזרה</button></div>
          </div>
        )}

        {step === 3 && (
          <div className="pbw-pane">
            <h1 className="pbw-h">העלאת מסמכים</h1>
            <p className="pbw-lead">צרפו את המסמכים הרפואיים, כתב התביעה או ההפניה. <b>המערכת תקרא אותם ותמלא את הפרטים בשבילכם</b> — נשאר רק לבדוק ולאשר.</p>
            {scan.phase === 'upload' || scan.phase === 'read' ? (
              <div className="pbw-scan" role="status" aria-live="polite">
                <div className={`pbw-scan-doc${scan.phase === 'read' ? ' reading' : ''}`}><span /><span /><span /><span /><i /></div>
                <b>{scan.text}</b>
                {scan.phase === 'upload' && <div className="pbw-bar"><div style={{ width: `${scan.n ?? 5}%` }} /></div>}
                {scan.phase === 'read' && <span className="muted">זה לוקח בדרך כלל חצי דקה עד דקה. אל תסגרו את הדף.</span>}
              </div>
            ) : (
              <>
                <label className={`drop pb-drop pbw-drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
                  <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} hidden />
                  <Icon name="upload" />
                  <b>{files.length ? 'הוספת מסמכים נוספים' : 'גררו לכאן קבצים, או לחצו לבחירה'}</b>
                  <span>PDF או תמונות (גם צילום מהטלפון) · עד 25MB לקובץ</span>
                </label>
                {fileErr && <p className="err">{fileErr}</p>}
                {files.length > 0 && (
                  <ul className="doc-chips">
                    {files.map((f, i) => <li key={i}><Icon name="file" size={15} /><span>{f.name}</span><button type="button" className="icon-btn" aria-label={`הסרת ${f.name}`} onClick={() => setFiles(files.filter((_, n) => n !== i))}><Icon name="x" size={13} /></button></li>)}
                  </ul>
                )}
                {err && <p className="err" role="alert">{err}</p>}
                <div className="pbw-nav">
                  <button type="button" className="btn btn-ghost" onClick={() => go(2)}><Icon name="arrowLeft" size={15} className="flip" />חזרה</button>
                  <span className="spacer" />
                  <button type="button" className="btn btn-link" onClick={() => { setScan({ phase: 'manual', text: '' }); go(4); }}>{files.length ? 'המשך בלי סריקה' : 'אין לי מסמכים כרגע'}</button>
                  <button type="button" className="btn btn-primary btn-lg" disabled={!files.length} onClick={scanDocs}><Icon name="sparkles" />סריקה והמשך</button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <form className="pbw-pane" onSubmit={submit} noValidate>
            <h1 className="pbw-h">בדיקת הפרטים</h1>
            {scan.phase === 'done' ? (
              <div className="pbw-note ok"><Icon name="sparkles" /><div><b>מילאנו את הפרטים מתוך המסמכים.</b> בדקו שהכל נכון ותקנו אם צריך.{ext?.warning ? <div className="pbw-warn">{ext.warning}</div> : null}</div></div>
            ) : scan.text ? (
              <div className="pbw-note"><Icon name="info" /><div>{scan.text}</div></div>
            ) : <p className="pbw-lead">מלאו את פרטי המטופל ואת הכתובות לעדכונים.</p>}

            <fieldset className="pbw-group">
              <legend><Icon name="user" size={16} />המטופל</legend>
              <div className="grid-2">
                {field('שם מלא', 'name', { autoComplete: 'off' }, 'name')}
                {field('תעודת זהות', 'idNumber', { inputMode: 'numeric', dir: 'ltr' }, 'id_number')}
                {field('תאריך לידה', 'dob', { type: 'date' }, 'dob')}
                {field('טלפון', 'phone', { type: 'tel', dir: 'ltr' }, 'phone')}
              </div>
            </fieldset>

            {!firm && (
              <fieldset className="pbw-group">
                <legend><Icon name="briefcase" size={16} />מי מפנה?</legend>
                <div className="seg">
                  {KINDS.map((x) => <button key={x.k} type="button" aria-pressed={kind === x.k} onClick={() => setKind(x.k)}><Icon name={x.icon} />{x.label}</button>)}
                </div>
                {!self && (
                  <div className="grid-2">
                    <label className="field"><span>{kind === 'broker' ? 'שם החברה / המתווך' : 'שם המשרד'}{ext?.referrer_office && ref.office === ext.referrer_office ? <em className="pb-found"><Icon name="sparkles" size={12} />מהמסמכים</em> : null}</span><input value={ref.office} onChange={(e) => setRef({ ...ref, office: e.target.value })} autoComplete="organization" /></label>
                    <label className="field"><span>איש קשר</span><input value={ref.contact} onChange={(e) => setRef({ ...ref, contact: e.target.value })} autoComplete="name" /></label>
                    <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={ref.phone} onChange={(e) => setRef({ ...ref, phone: e.target.value })} autoComplete="tel" /></label>
                  </div>
                )}
              </fieldset>
            )}

            <fieldset className="pbw-group pbw-mail">
              <legend><Icon name="mail" size={16} />לאן לשלוח את אישור הזימון והמכתבים?</legend>
              <p className="hint">כל הכתובות כאן יקבלו את אישור התור, תזכורת יום לפני, ואת המכתבים שהרופא יכתוב.</p>
              {!firm && !self && (
                <label className="field"><span>מייל המפנה <small>חובה</small></span><input type="email" dir="ltr" value={ref.email} onChange={(e) => setRef({ ...ref, email: e.target.value })} autoComplete="email" placeholder="office@example.co.il" /></label>
              )}
              {field(self ? 'המייל שלך' : 'מייל המטופל', 'email', { type: 'email', dir: 'ltr', placeholder: self ? '' : 'לא חובה' }, 'email')}
              {extra.map((x, i) => (
                <div key={i} className="pbw-extra">
                  <label className="field"><span>מייל נוסף</span><input type="email" dir="ltr" value={x} autoFocus={!x} onChange={(e) => setExtra(extra.map((y, n) => (n === i ? e.target.value : y)))} placeholder="name@example.com" /></label>
                  <button type="button" className="icon-btn" aria-label="הסרת המייל" onClick={() => setExtra(extra.filter((_, n) => n !== i))}><Icon name="x" size={15} /></button>
                </div>
              ))}
              {extra.length < 3 && <button type="button" className="btn btn-sm pbw-add" onClick={() => setExtra([...extra, ''])}><Icon name="plus" size={15} />הוספת מייל נוסף</button>}
            </fieldset>

            <fieldset className="pbw-group">
              <legend><Icon name="list" size={16} />עוד כמה דברים</legend>
              {!self && (
                <div className="field"><span>מי משלם לרופא?</span>
                  <div className="payer">
                    <label><input type="radio" name="payer" checked={payer === 'patient'} onChange={() => setPayer('patient')} />המטופל</label>
                    <label><input type="radio" name="payer" checked={payer === 'referrer'} onChange={() => setPayer('referrer')} />המפנה</label>
                  </div>
                </div>
              )}
              <label className="field"><span>מה חשוב שהרופא יידע <small>לא חובה</small></span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לדוגמה: תאונת עבודה מ־03.2025, מבקשים חוות דעת לגבי עמוד שדרה צווארי." /></label>
              <div className="pbw-files">
                <Icon name="file" size={15} />
                <span>{files.length ? `${files.length} מסמכים מצורפים` : 'לא צורפו מסמכים'}</span>
                <label className="btn btn-sm btn-ghost">
                  <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  <Icon name="plus" size={14} />הוספה
                </label>
              </div>
              <input className="pb-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" placeholder="website" />
            </fieldset>

            {err && <p className="err" role="alert">{err}</p>}
            <div className="pbw-nav pbw-final">
              <button type="button" className="btn btn-ghost" onClick={() => go(3)} disabled={!!busy}><Icon name="arrowLeft" size={15} className="flip" />חזרה</button>
              <span className="spacer" />
              <button className="btn btn-primary btn-lg" type="submit" disabled={!!busy}>{busy || <><Icon name="send" />{clinic.needsApproval ? 'שליחה לאישור הרופא' : 'קביעת התור'}</>}</button>
            </div>
            <p className="hint pbw-privacy"><Icon name="shield" size={13} />הפרטים והמסמכים נשמרים במערכת המאובטחת של המרפאה ומשמשים רק לטיפול בפנייה.</p>
          </form>
        )}
      </section>
    </main>
  );
}
