'use client';
import { useMemo, useState } from 'react';
import { EMAIL_RE, ils } from '@/lib/constants';
import { DAYS, fmtDate, fmtDay, ilParts, weekday } from '@/lib/dates';
import type { DaySlots } from '@/lib/slots';
import type { Service } from '@/lib/services';
import { checkFile } from '@/lib/upload';
import Icon from '@/components/Icon';
import ServicePicker from '@/components/ServicePicker';
import { publicBook, publicConfirmUploads, publicDraft, publicFinish, publicUploadUrls } from './actions';

type Kind = 'law' | 'broker' | 'private';
const KINDS: { k: Kind; label: string; icon: string }[] = [
  { k: 'law', label: 'משרד עורכי דין', icon: 'scale' },
  { k: 'broker', label: 'מתווך / חברה', icon: 'briefcase' },
  { k: 'private', label: 'אני המטופל', icon: 'user' },
];

/** One page, top to bottom: what is needed, when, who refers, the patient, documents. Then one button. */
export default function PublicBooking({ open, clinic, services, slots, code, firm }: {
  open: boolean; clinic: { name: string; address: string; phone: string; needsApproval: boolean };
  services: Service[]; slots: DaySlots[]; code: string; firm: { name: string; kind: string } | null;
}) {
  const [svc, setSvc] = useState<Service | null>(services.length === 1 ? services[0] : null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const visible = useMemo(() => slots.map((d) => ({ ...d, times: d.times.filter((t) => !taken.has(t.iso)) })).filter((d) => d.times.length), [slots, taken]);
  const [day, setDay] = useState<string | null>(visible[0]?.date ?? null);
  const [slot, setSlot] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(firm ? (firm.kind === 'broker' ? 'broker' : 'law') : 'law');
  const [ref, setRef] = useState({ office: '', contact: '', phone: '', email: '' });
  const [pt, setPt] = useState({ name: '', idNumber: '', dob: '', phone: '', email: '' });
  const [payer, setPayer] = useState<'patient' | 'referrer'>('patient');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ caseNo: number; pending: boolean; docs: number; failed: number } | null>(null);
  const dayTimes = visible.find((d) => d.date === day)?.times ?? [];
  const chosen = slot ? ilParts(slot) : null;
  const self = !firm && kind === 'private';

  function addFiles(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) { const e = checkFile(f); if (e) bad.push(e); else ok.push(f); }
    setFileErr(bad.join(' · '));
    setFiles([...files, ...ok].slice(0, 20));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!svc) miss.push('מה צריך מהרופא');
    if (!slot) miss.push('מועד');
    if (!firm && !self) {
      if (ref.office.trim().length < 2) miss.push('שם המשרד');
      if (ref.contact.trim().length < 2) miss.push('איש קשר');
      if (ref.phone.replace(/\D/g, '').length < 9) miss.push('טלפון המפנה');
      if (!EMAIL_RE.test(ref.email.trim())) miss.push('מייל המפנה');
    }
    if (pt.name.trim().length < 2) miss.push('שם המטופל');
    if (pt.idNumber.replace(/\D/g, '').length < 5) miss.push('תעודת זהות');
    if (pt.phone.replace(/\D/g, '').length < 9) miss.push('טלפון המטופל');
    if (pt.email.trim() && !EMAIL_RE.test(pt.email.trim())) miss.push('מייל מטופל תקין');
    if (self && !pt.email.trim()) miss.push('מייל המטופל (לשם יישלח הזימון)');
    if (miss.length) { setErr('חסר: ' + miss.join(', ')); return; }
    setErr('');
    setBusy('שומר את התור…');
    const r = await publicBook({ code, serviceId: svc!.id, slot: slot!, referrer: { kind: firm ? (kind === 'private' ? 'law' : kind) : kind, ...ref }, patient: pt, payer, notes, website }).catch(() => ({ ok: false as const, error: 'אין חיבור. נסו שוב.' }));
    if (!r.ok) {
      setBusy('');
      setErr(r.error);
      if (r.error.includes('נתפס')) { setTaken(new Set([...taken, slot!])); setSlot(null); }
      return;
    }
    let docs = 0;
    let failed = 0;
    if (files.length) {
      setBusy(`מעלה ${files.length} מסמכים…`);
      const u = await publicUploadUrls(r.id, r.key, files.map((f) => ({ name: f.name, size: f.size, type: f.type }))).catch(() => null);
      if (u?.ok) {
        const okList: { path: string; name: string; size: number; type: string }[] = [];
        for (let i = 0; i < files.length; i++) {
          setBusy(`מעלה מסמך ${i + 1} מתוך ${files.length}…`);
          const body = new FormData();
          body.append('cacheControl', '3600');
          body.append('', files[i]);
          const res = await fetch(u.urls[i].url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
          if (res?.ok) okList.push({ path: u.urls[i].path, name: files[i].name, size: files[i].size, type: files[i].type });
          else failed++;
        }
        const c = await publicConfirmUploads(r.id, r.key, okList).catch(() => null);
        docs = c?.ok ? c.count : 0;
      } else failed = files.length;
    }
    setBusy('שולח לרופא…');
    await publicFinish(r.id, r.key).catch(() => undefined);
    publicDraft(r.id, r.key).catch(() => undefined);
    setBusy('');
    setDone({ caseNo: r.caseNo, pending: r.pending, docs, failed });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const Head = (
    <header className="pb-head">
      <img src="/brand/letterhead.jpg" alt={clinic.name} className="pb-banner" />
      <div className="pb-sub"><b>קביעת תור</b><span>{[clinic.address, clinic.phone && `טל׳ ${clinic.phone}`].filter(Boolean).join(' · ')}</span></div>
    </header>
  );

  if (!open) return <main className="pb">{Head}<section className="pb-card"><p className="muted">קביעת תור מקוונת סגורה כרגע. צרו קשר עם המרפאה{clinic.phone ? ` בטלפון ${clinic.phone}` : ''}.</p></section></main>;

  if (done) {
    const p = ilParts(slot!);
    return (
      <main className="pb">
        {Head}
        <section className="pb-card pb-done">
          <span className="pb-check"><Icon name="checkCircle" /></span>
          <h1>{done.pending ? 'הבקשה התקבלה' : 'התור נקבע'}</h1>
          <p className="pb-lead">{done.pending ? 'הרופא יאשר את המועד, ואז יישלח זימון במייל.' : 'הזימון נשלח במייל.'}</p>
          <dl className="kv">
            <dt>מספר תיק</dt><dd className="num">{done.caseNo}</dd>
            <dt>מטופל</dt><dd>{pt.name}</dd>
            <dt>מועד</dt><dd>{fmtDay(p.date)} · {fmtDate(p.date)} · {p.time}</dd>
            <dt>שירות</dt><dd>{svc?.label}</dd>
            <dt>מסמכים</dt><dd>{done.docs ? `${done.docs} מסמכים התקבלו` : 'לא צורפו'}{done.failed ? ` · ${done.failed} לא הועלו` : ''}</dd>
          </dl>
          {done.failed > 0 && <p className="err">חלק מהמסמכים לא הועלו. אפשר לשלוח אותם למרפאה במייל, עם מספר התיק.</p>}
          <button type="button" className="btn" onClick={() => { setDone(null); setSlot(null); setPt({ name: '', idNumber: '', dob: '', phone: '', email: '' }); setFiles([]); setNotes(''); }}><Icon name="plus" />תור נוסף</button>
        </section>
      </main>
    );
  }

  return (
    <main className="pb">
      {Head}
      <form className="pb-card" onSubmit={submit} noValidate>
        {firm && <div className="pb-firm"><Icon name="briefcase" />מפנה: <b>{firm.name}</b></div>}

        <section className="pb-step">
          <h2><span className="pb-n">1</span>מה צריך מהרופא?</h2>
          <ServicePicker services={services} value={svc?.id ?? null} onChange={setSvc} />
        </section>

        <section className="pb-step">
          <h2><span className="pb-n">2</span>בחירת מועד</h2>
          {visible.length === 0 ? <p className="muted">אין כרגע תורים פנויים. צרו קשר עם המרפאה{clinic.phone ? ` בטלפון ${clinic.phone}` : ''}.</p> : (
            <>
              <div className="dates" role="listbox" aria-label="ימים פנויים">
                {visible.map((d) => (
                  <button key={d.date} type="button" className="date" aria-pressed={day === d.date} onClick={() => { setDay(d.date); setSlot(null); }}>
                    <small>{DAYS[weekday(d.date)]}</small><b className="num">{+d.date.slice(8, 10)}</b><em>{d.times.length} פנויים</em>
                  </button>
                ))}
              </div>
              {day && <div className="hint">{fmtDay(day)} · {fmtDate(day)}</div>}
              <div className="times">
                {dayTimes.map((t) => <button key={t.iso} type="button" className="time" aria-pressed={slot === t.iso} onClick={() => setSlot(t.iso)}>{t.time}</button>)}
              </div>
            </>
          )}
        </section>

        {!firm && (
          <section className="pb-step">
            <h2><span className="pb-n">3</span>מי מפנה?</h2>
            <div className="seg">
              {KINDS.map((x) => <button key={x.k} type="button" aria-pressed={kind === x.k} onClick={() => setKind(x.k)}><Icon name={x.icon} />{x.label}</button>)}
            </div>
            {!self && (
              <div className="grid-2">
                <label className="field"><span>{kind === 'broker' ? 'שם החברה / המתווך' : 'שם המשרד'}</span><input value={ref.office} onChange={(e) => setRef({ ...ref, office: e.target.value })} autoComplete="organization" /></label>
                <label className="field"><span>איש קשר</span><input value={ref.contact} onChange={(e) => setRef({ ...ref, contact: e.target.value })} autoComplete="name" /></label>
                <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={ref.phone} onChange={(e) => setRef({ ...ref, phone: e.target.value })} autoComplete="tel" /></label>
                <label className="field"><span>מייל <small>לשם יישלחו הזימון והמכתב</small></span><input type="email" dir="ltr" value={ref.email} onChange={(e) => setRef({ ...ref, email: e.target.value })} autoComplete="email" /></label>
              </div>
            )}
          </section>
        )}

        <section className="pb-step">
          <h2><span className="pb-n">{firm ? 3 : 4}</span>פרטי המטופל</h2>
          <div className="grid-2">
            <label className="field"><span>שם מלא</span><input value={pt.name} onChange={(e) => setPt({ ...pt, name: e.target.value })} /></label>
            <label className="field"><span>תעודת זהות</span><input inputMode="numeric" dir="ltr" value={pt.idNumber} onChange={(e) => setPt({ ...pt, idNumber: e.target.value })} /></label>
            <label className="field"><span>תאריך לידה</span><input type="date" value={pt.dob} onChange={(e) => setPt({ ...pt, dob: e.target.value })} /></label>
            <label className="field"><span>טלפון</span><input type="tel" dir="ltr" value={pt.phone} onChange={(e) => setPt({ ...pt, phone: e.target.value })} /></label>
          </div>
          <label className="field"><span>מייל המטופל {self ? '' : <small>לא חובה · כך יקבל את הזימון ישירות</small>}</span><input type="email" dir="ltr" value={pt.email} onChange={(e) => setPt({ ...pt, email: e.target.value })} /></label>
          {!self && (
            <div className="field"><span>מי משלם לרופא</span>
              <div className="payer">
                <label><input type="radio" name="payer" checked={payer === 'patient'} onChange={() => setPayer('patient')} />המטופל</label>
                <label><input type="radio" name="payer" checked={payer === 'referrer'} onChange={() => setPayer('referrer')} />המפנה</label>
              </div>
            </div>
          )}
        </section>

        <section className="pb-step">
          <h2><span className="pb-n">{firm ? 4 : 5}</span>מסמכים והערות</h2>
          <label className="drop pb-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} hidden />
            <Icon name="upload" />
            <b>מסמכים רפואיים, כתב תביעה או הפניה</b>
            <span>גררו לכאן או לחצו לבחירה · PDF או תמונות · עד 25MB לקובץ</span>
          </label>
          {fileErr && <p className="err">{fileErr}</p>}
          {files.length > 0 && (
            <ul className="doc-chips">
              {files.map((f, i) => <li key={i}><Icon name="file" size={15} /><span>{f.name}</span><button type="button" className="icon-btn" aria-label={`הסרת ${f.name}`} onClick={() => setFiles(files.filter((_, n) => n !== i))}><Icon name="x" size={13} /></button></li>)}
            </ul>
          )}
          <label className="field"><span>מה חשוב שהרופא יידע <small>לא חובה</small></span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לדוגמה: תאונת עבודה מ־03.2025, מבקשים חוות דעת לגבי עמוד שדרה צווארי." /></label>
          <input className="pb-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" placeholder="website" />
        </section>

        <div className="pb-submit">
          <div className="pb-summary">
            {svc ? <b>{svc.label}</b> : <span className="muted">בחרו שירות</span>}
            {chosen && <span>{fmtDay(chosen.date)} · {fmtDate(chosen.date)} · {chosen.time}</span>}
            {svc && Number(svc.price) > 0 && <span className="price">{ils(Number(svc.price))}</span>}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={!!busy}>{busy || <><Icon name="check" />{clinic.needsApproval ? 'שליחת בקשה לתור' : 'קביעת התור'}</>}</button>
          <p className="hint">הפרטים נשמרים במערכת המאובטחת של המרפאה ומשמשים רק לטיפול בפנייה.</p>
        </div>
      </form>
    </main>
  );
}
