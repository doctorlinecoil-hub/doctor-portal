'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { EMAIL_RE, PAYERS, TYPES, dbError, ils, type Payer, type ReferralType } from '@/lib/constants';
import { fmtDate, fmtDay, ilParts } from '@/lib/dates';
import { uploadCaseFiles } from '@/lib/upload';
import type { Extracted } from '@/lib/extract';
import FilePicker from '@/components/FilePicker';
import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';
import { afterDetails, extractFromDocs } from '../../../actions';
import { Stepper } from '../../../book/SlotBooking';

type C = {
  id: string; caseNo: number; startsAt: string; status: string; type: ReferralType | null;
  name: string; idNumber: string; dob: string; phone: string; email: string; payer: Payer; notes: string; submittedBy: string;
  detailsAt: string | null; extract: Extracted | null;
};
type Doc = { id: string; file_name: string; size_bytes: number; created_at: string };
type Field = 'name' | 'idNumber' | 'dob' | 'phone' | 'email';
const FROM: Record<Field, keyof Extracted> = { name: 'name', idNumber: 'id_number', dob: 'dob', phone: 'phone', email: 'email' };

export default function DetailsWizard({ c, firmId, docs: initialDocs, prices, preview }: {
  c: C; firmId: string; docs: Doc[]; prices: Record<ReferralType, number>; preview?: boolean;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [scan, setScan] = useState<'idle' | 'running' | 'done' | 'error'>(c.extract ? 'done' : 'idle');
  const [scanMsg, setScanMsg] = useState('');
  const [ext, setExt] = useState<Extracted | null>(c.extract);
  const [ai, setAi] = useState<Set<string>>(new Set(preview && c.extract ? ['name', 'idNumber', 'dob', 'phone', 'type', 'notes'] : []));
  const [f, setF] = useState({ name: c.name, idNumber: c.idNumber, dob: c.dob, phone: c.phone, email: c.email, notes: c.notes, submittedBy: c.submittedBy });
  const [type, setType] = useState<ReferralType | null>(c.type);
  const [payer, setPayer] = useState<Payer>(c.payer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  // the latest form values, for filling in after an async scan
  const fRef = useRef(f);
  fRef.current = f;
  const when = ilParts(c.startsAt);

  /** fills the empty fields from the scan, and marks what the AI filled */
  function apply(x: Extracted) {
    setExt(x);
    const filled = new Set<string>();
    const cur = fRef.current;
    const next = { ...cur };
    (Object.keys(FROM) as Field[]).forEach((k) => {
      const v = String(x[FROM[k]] || '');
      if (v && !cur[k].trim()) { next[k] = v; filled.add(k); }
    });
    const req = [x.request, x.event && `האירוע: ${x.event}${x.event_date ? ` (${x.event_date})` : ''}`].filter(Boolean).join('\n');
    if (req && !cur.notes.trim()) { next.notes = req; filled.add('notes'); }
    setF(next);
    if (x.suggested_type && !type) { setType(x.suggested_type as ReferralType); filled.add('type'); }
    setAi(filled);
  }

  async function runScan() {
    if (preview) return;
    setScan('running');
    setScanMsg('');
    const r = await extractFromDocs(c.id).catch(() => ({ ok: false as const, error: 'הסריקה נכשלה. אפשר למלא ידנית.' }));
    if (r.ok) {
      apply(r.data);
      setScan('done');
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } else {
      setScan('error');
      setScanMsg(r.error);
    }
  }

  async function upload() {
    if (!files.length || preview) return;
    setProgress(0);
    const failed = await uploadCaseFiles(supabase, firmId, c.id, files, (d, t) => setProgress(d / t));
    const ok = files.filter((x) => !failed.includes(x.name));
    setDocs((d) => [...d, ...ok.map((x) => ({ id: crypto.randomUUID(), file_name: x.name, size_bytes: x.size, created_at: new Date().toISOString() }))]);
    setFiles([]);
    setProgress(null);
    if (failed.length) setScanMsg(`לא הועלו: ${failed.join(', ')}`);
    if (ok.length) await runScan();
  }

  // a scan that never ran (or a page reload) — run it once when there are documents but no result
  useEffect(() => {
    if (!preview && !c.extract && !c.detailsAt && initialDocs.length && scan === 'idle') runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (ai.has(k)) setAi(new Set([...ai].filter((x) => x !== k)));
  };
  const emailOk = !f.email.trim() || EMAIL_RE.test(f.email.trim());
  const ready = !!type && f.name.trim().length >= 2 && f.idNumber.trim().length >= 5 && f.phone.trim().length >= 7 && emailOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!type) miss.push('סיבת ההפניה');
    if (f.name.trim().length < 2) miss.push('שם המטופל');
    if (f.idNumber.trim().length < 5) miss.push('תעודת זהות');
    if (f.phone.trim().length < 7) miss.push('טלפון');
    if (!emailOk) miss.push('מייל תקין (או להשאיר ריק)');
    if (miss.length) return setErr('חסר: ' + miss.join(', '));
    if (preview) return setErr('זו תצוגה מקדימה.');
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('complete_case_details', {
      p_id: c.id, p_type: type, p_name: f.name.trim(), p_id_number: f.idNumber.trim(), p_dob: f.dob || null, p_phone: f.phone.trim(),
      p_email: f.email.trim(), p_payer: payer, p_notes: f.notes.trim(), p_submitted_by: f.submittedBy.trim(),
    });
    if (error) { setErr(dbError(error)); setBusy(false); return; }
    if (data) {
      // the first draft of the letter is written separately, in its own request
      fetch('/api/autodraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }), keepalive: true }).catch(() => undefined);
    }
    await afterDetails(c.id, !!data).catch(() => undefined);
    setBusy(false);
    if (c.detailsAt) { router.push(`/firm/cases/${c.id}`); router.refresh(); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) {
    return (
      <>
        <PageHead title="התיק נשלח לרופא" sub={`תיק ${c.caseNo} · ${f.name.trim()}`} />
        <Stepper at={4} />
        <section className="panel success-card" style={{ maxWidth: 720 }}>
          <div className="success-mark"><Icon name="checkCircle" /></div>
          <h2 style={{ margin: 0 }}>הכול מוכן</h2>
          <dl className="kv">
            <dt>מועד</dt><dd>{fmtDay(when.date)} · {fmtDate(when.date)} · {when.time}{c.status === 'pending' ? ' · ממתין לאישור הרופא' : ''}</dd>
            <dt>סיבת ההפניה</dt><dd>{type ? TYPES[type].label : ''}</dd>
            <dt>מסמכים</dt><dd>{docs.length ? `${docs.length} קבצים` : 'ללא'}</dd>
            <dt>זימון</dt><dd>{f.email.trim() ? `יישלח למטופל (${f.email.trim()}) ואליכם` : 'יישלח אליכם במייל. נא להעביר למטופל.'}</dd>
          </dl>
          <div className="callout"><div><Icon name="sparkles" />הרופא מקבל את התיק עם סיכום של המסמכים וטיוטת מכתב מוכנה. כשהמכתב ייחתם, הוא יישלח אליכם במייל.</div></div>
          <div className="row">
            <Link className="btn btn-primary" href={`/firm/cases/${c.id}`}><Icon name="folder" />מעבר לתיק</Link>
            <Link className="btn" href="/firm/book"><Icon name="plus" />תור נוסף</Link>
          </div>
        </section>
      </>
    );
  }

  const tag = (k: string) => ai.has(k) && <span className="ai-tag"><Icon name="sparkles" size={12} />זוהה מהמסמכים</span>;

  return (
    <>
      <PageHead
        title={c.detailsAt ? 'עדכון פרטי התיק' : 'מסמכים ופרטי המטופל'}
        sub={`תיק ${c.caseNo} · התור נשמר ל${fmtDay(when.date)} ${fmtDate(when.date)} בשעה ${when.time}`}
        crumbs={[{ href: '/firm/cases', label: 'התיקים שלי' }]}
      />
      <Stepper at={ready && docs.length ? 3 : 2} />

      <div className="details-grid">
        <div className="stack">
          {/* ---------- stage 2: documents and the AI scan ---------- */}
          <section className="panel">
            <div className="panel-head">
              <h2><Icon name="upload" />מסמכים</h2>
              {docs.length > 0 && <span className="hint">{docs.length} קבצים בתיק</span>}
            </div>
            <p className="muted" style={{ margin: 0 }}>העלו את המסמכים הרפואיים, כתב התביעה או ההפניה. המערכת תקרא מהם את פרטי המטופל ואת הבקשה, ותמלא את הטופס בשבילכם.</p>
            {docs.length > 0 && (
              <ul className="doc-chips">
                {docs.map((d) => <li key={d.id}><Icon name="file" size={15} /><span>{d.file_name}</span><small>{(d.size_bytes / 1048576).toFixed(1)}MB</small></li>)}
              </ul>
            )}
            <FilePicker files={files} onChange={setFiles} label={docs.length ? 'מסמכים נוספים' : 'גררו לכאן את מסמכי התיק'} />
            {progress != null && <div className="progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            <div className="row" style={{ gap: 8 }}>
              {files.length > 0 && (
                <button type="button" className="btn btn-primary" onClick={upload} disabled={progress != null || scan === 'running'}>
                  <Icon name="sparkles" />{progress != null ? `מעלה ${Math.round(progress * 100)}%` : `העלאה וסריקה (${files.length})`}
                </button>
              )}
              {!files.length && docs.length > 0 && scan !== 'running' && (
                <button type="button" className="btn" onClick={runScan}><Icon name="refresh" />{scan === 'done' ? 'סריקה מחדש' : 'סריקת המסמכים'}</button>
              )}
            </div>

            {scan === 'running' && (
              <div className="scan-live" role="status">
                <span className="scan-orb" aria-hidden="true"><Icon name="sparkles" /></span>
                <div><b>קוראים את המסמכים…</b><small>מחפשים שם, תעודת זהות, תאריך לידה, טלפון ומה מבקשים מהרופא. זה לוקח עד דקה.</small></div>
                <div className="scan-bars" aria-hidden="true"><i /><i /><i /></div>
              </div>
            )}
            {scan === 'done' && ext && (
              <div className="scan-result">
                <Icon name="checkCircle" />
                <div>
                  <b>הסריקה הושלמה</b>
                  <small>{ext.name ? `נמצאו פרטים של ${ext.name}. ` : ''}בדקו את הפרטים למטה ותקנו אם צריך.</small>
                  {ext.warning && <small className="warn-t"><Icon name="alert" size={13} />{ext.warning}</small>}
                </div>
              </div>
            )}
            {scan === 'error' && <p className="field-help err"><Icon name="alert" size={15} />{scanMsg} אפשר להמשיך ולמלא ידנית.</p>}
            {scan !== 'error' && scanMsg && <p className="field-help err">{scanMsg}</p>}
          </section>

          {/* ---------- stage 3: confirm the details ---------- */}
          <form ref={formRef} className="panel" onSubmit={submit} noValidate>
            <div className="panel-head"><h2><Icon name="user" />פרטי המטופל</h2>{ai.size > 0 && <span className="ai-tag big"><Icon name="sparkles" size={13} />מולא מהמסמכים</span>}</div>
            <div className="grid-2">
              <label className={`field${ai.has('name') ? ' from-ai' : ''}`} htmlFor="pName"><span>שם מלא {tag('name')}</span><input id="pName" autoComplete="off" value={f.name} onChange={set('name')} /></label>
              <label className={`field${ai.has('idNumber') ? ' from-ai' : ''}`} htmlFor="pId"><span>תעודת זהות {tag('idNumber')}</span><input id="pId" inputMode="numeric" dir="ltr" value={f.idNumber} onChange={set('idNumber')} /></label>
              <label className={`field${ai.has('dob') ? ' from-ai' : ''}`} htmlFor="pDob"><span>תאריך לידה {tag('dob')}</span><input id="pDob" type="date" value={f.dob} onChange={set('dob')} /></label>
              <label className={`field${ai.has('phone') ? ' from-ai' : ''}`} htmlFor="pPhone"><span>טלפון המטופל {tag('phone')}</span><input id="pPhone" type="tel" dir="ltr" value={f.phone} onChange={set('phone')} /></label>
            </div>
            <label className={`field${ai.has('email') ? ' from-ai' : ''}`} htmlFor="pEmail"><span>מייל המטופל <small>לא חובה · כך יקבל זימון ואת המכתב</small> {tag('email')}</span>
              <input id="pEmail" type="email" dir="ltr" value={f.email} onChange={set('email')} aria-invalid={!emailOk} placeholder="name@example.com" />
            </label>

            <div className="form-sec">
              <h3><Icon name="flag" />סיבת ההפניה {tag('type')}</h3>
              <div className="options">
                {(Object.keys(TYPES) as ReferralType[]).map((k) => (
                  <button key={k} type="button" className="opt" aria-pressed={type === k} onClick={() => { setType(k); setAi(new Set([...ai].filter((x) => x !== 'type'))); }}>
                    <span className="opt-ic"><Icon name={TYPES[k].icon} /></span>
                    <span><b>{TYPES[k].label}</b><span>{TYPES[k].desc}</span>{Number(prices?.[k]) > 0 && <span className="price">{ils(prices[k])}</span>}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-sec">
              <h3><Icon name="info" />פרטים נוספים</h3>
              <div className="grid-2">
                <label className="field" htmlFor="by"><span>מי מעלה את התיק <small>שם איש הקשר אצלכם</small></span><input id="by" value={f.submittedBy} onChange={set('submittedBy')} /></label>
                <div className="field"><span>מי משלם</span>
                  <div className="payer">
                    {(['referrer', 'patient'] as Payer[]).map((p) => (
                      <label key={p}><input type="radio" name="payer" checked={payer === p} onChange={() => setPayer(p)} />{p === 'referrer' ? `אנחנו (${PAYERS.referrer})` : PAYERS.patient}</label>
                    ))}
                  </div>
                </div>
              </div>
              <label className={`field${ai.has('notes') ? ' from-ai' : ''}`} htmlFor="notes"><span>הערות לרופא <small>לא חובה · מה חשוב שהרופא יידע</small> {tag('notes')}</span>
                <textarea id="notes" rows={4} value={f.notes} onChange={set('notes')} placeholder="לדוגמה: מבקשים להתייחס לקשר הסיבתי לתאונה ולנכות התפקודית." />
              </label>
            </div>

            {err && <p className="err" role="alert">{err}</p>}
            <div className="form-foot">
              <span className="hint">{docs.length ? `${docs.length} מסמכים יועברו לרופא` : 'אפשר לשלוח גם בלי מסמכים ולהוסיף אחר כך'}</span>
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || scan === 'running'}>
                {busy ? 'שולח…' : <><Icon name="send" />{c.detailsAt ? 'שמירת הפרטים' : 'שליחת התיק לרופא'}</>}
              </button>
            </div>
          </form>
        </div>

        <aside className="panel summary-card">
          <div className="panel-head"><h2><Icon name="receipt" />סיכום</h2></div>
          <div>
            <div className="sum-row"><span>תיק</span><b className="num">{c.caseNo}</b></div>
            <div className="sum-row"><span>מועד</span><b>{fmtDay(when.date)} · {when.time}</b></div>
            <div className="sum-row"><span>מטופל</span><b>{f.name.trim() || '—'}</b></div>
            <div className="sum-row"><span>סיבה</span><b>{type ? TYPES[type].label : '—'}</b></div>
            <div className="sum-row"><span>מסמכים</span><b>{docs.length || '—'}</b></div>
            {type && Number(prices?.[type]) > 0 && <div className="sum-row"><span>מחיר (כולל מע״מ)</span><b className="money">{ils(prices[type])}</b></div>}
          </div>
          <ol className="how">
            <li><b>מעלים מסמכים</b><span>PDF או תמונות</span></li>
            <li><b>המערכת ממלאת</b><span>פרטי המטופל והבקשה</span></li>
            <li><b>בודקים ושולחים</b><span>הרופא מקבל טיוטה מוכנה</span></li>
          </ol>
        </aside>
      </div>
    </>
  );
}
