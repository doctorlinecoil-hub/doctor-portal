'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { typeOf, type ReferralType } from '@/lib/constants';
import { fmtStamp } from '@/lib/dates';
import { fuzzyDate, type IntakeRow } from '@/lib/intakeTypes';
import { requestDocuments, rescanCase } from '../../actions';

function Ring({ value }: { value: number }) {
  const tone = value >= 80 ? 'ok' : value >= 50 ? 'warn' : 'bad';
  return (
    <div className={`ring ${tone}`} style={{ ['--v' as string]: value }} role="img" aria-label={`שלמות התיק ${value}%`}>
      <span className="num">{value}%</span>
    </div>
  );
}

export default function IntakePanel({ appointmentId, intake, docCount, requestedType, cancelled, preview }: {
  appointmentId: string; intake: IntakeRow | null; docCount: number; requestedType: ReferralType; cancelled: boolean; preview?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const running = intake?.status === 'queued' || intake?.status === 'running';

  // while the scan runs, refresh the page every few seconds to show the result as soon as it's ready
  useEffect(() => {
    if (!running || preview) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router, preview]);

  const rescan = () => start(async () => {
    if (preview) return;
    const r = await rescanCase(appointmentId);
    setMsg(r.ok ? null : { ok: false, text: r.error || 'לא הצלחנו להתחיל סריקה' });
    router.refresh();
  });

  const d = intake?.status === 'done' ? intake.data : null;

  const ask = () => start(async () => {
    if (preview || !d) return setMsg({ ok: false, text: 'זו תצוגה מקדימה.' });
    const items = d.missing.filter((_, i) => pick.has(i)).map((m) => m.item);
    const r = await requestDocuments(appointmentId, items, note);
    setMsg(r.ok ? { ok: true, text: r.info || 'נשלח' } : { ok: false, text: r.error || 'השליחה נכשלה' });
    if (r.ok) { setPick(new Set()); setNote(''); setAsking(false); router.refresh(); }
  });

  return (
    <section className="panel ai-panel" aria-label="סריקת AI של התיק">
      <div className="panel-head">
        <h2><span className="ai-badge"><Icon name="sparkles" /></span>סריקת התיק</h2>
        <div className="row" style={{ gap: 8 }}>
          {intake?.finished_at && !running && <span className="hint">{fmtStamp(intake.finished_at)} · {intake.doc_count} מסמכים</span>}
          {!cancelled && (
            <button type="button" className="btn btn-sm" onClick={rescan} disabled={pending || running}>
              <Icon name="refresh" />{intake ? 'סריקה מחדש' : 'סריקה'}
            </button>
          )}
        </div>
      </div>

      {!intake && (
        <div className="ai-empty">
          <Icon name="scan" />
          <div><b>התיק עוד לא נסרק</b><p className="muted">ה־AI יקרא את {docCount ? `${docCount} המסמכים` : 'הבקשה'} ויכין סיכום, ציר זמן, דגלים אדומים ורשימת מסמכים חסרים.</p></div>
        </div>
      )}

      {running && (
        <div className="ai-scanning" aria-live="polite">
          <div className="scan-visual"><span /><span /><span /></div>
          <div><b>קורא את המסמכים ומכין סיכום…</b><p className="muted">{docCount ? `${docCount} מסמכים` : 'הבקשה'} · בדרך כלל דקה עד שתיים. אפשר להמשיך לעבוד, התוצאה תופיע כאן לבד.</p></div>
        </div>
      )}

      {intake?.status === 'error' && (
        <div className="callout bad"><div><Icon name="alert" />הסריקה נכשלה: {intake.error || 'תקלה'}</div></div>
      )}

      {d && (
        <div className="stack">
          <div className="ai-summary">
            <Ring value={d.readiness} />
            <div className="stack-sm" style={{ minWidth: 0 }}>
              <span className="eyebrow">סיכום</span>
              <p className="ai-lead">{d.summary}</p>
            </div>
          </div>

          {d.type_note && d.suggested_type && d.suggested_type !== requestedType && (
            <div className="callout warn"><div><Icon name="alert" />המפנה ביקש {typeOf(requestedType).label}, אבל לפי הבקשה מתאים יותר {typeOf(d.suggested_type).label}. {d.type_note}</div></div>
          )}

          <div className="ai-grid">
            <div className="ai-box">
              <span className="eyebrow"><Icon name="briefcase" size={14} />מה מבקשים</span>
              <p><b>{d.request.goal || '—'}</b></p>
              {d.request.recipient && <p className="hint">נמען: {d.request.recipient}</p>}
              {(d.request.event || d.request.event_date) && <p className="hint">האירוע: {[fuzzyDate(d.request.event_date), d.request.event].filter(Boolean).join(' · ')}</p>}
              {d.request.questions.length > 0 && (
                <ol className="ai-q">{d.request.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
              )}
            </div>
            <div className="ai-box">
              <span className="eyebrow"><Icon name="flag" size={14} />לתשומת לבך</span>
              {d.red_flags.length === 0 && d.patient_check.length === 0 ? <p className="muted">לא נמצאו דגלים.</p> : (
                <ul className="flags">
                  {d.patient_check.map((p, i) => <li key={`p${i}`} className="high"><b>אי־התאמה ב{p.item}:</b> {p.detail}</li>)}
                  {d.red_flags.map((f, i) => <li key={i} className={f.level}>{f.text}</li>)}
                </ul>
              )}
            </div>
          </div>

          {d.missing.length > 0 && (
            <div className="ai-box missing">
              <div className="between">
                <span className="eyebrow"><Icon name="inbox" size={14} />חסר בתיק ({d.missing.length})</span>
                {!cancelled && !asking && <button type="button" className="btn btn-sm btn-soft" onClick={() => { setAsking(true); setPick(new Set(d.missing.map((_, i) => i))); }}><Icon name="send" />בקשה מהמפנה</button>}
              </div>
              <ul className="miss">
                {d.missing.map((m, i) => (
                  <li key={i}>
                    {asking ? (
                      <label className="check"><input type="checkbox" checked={pick.has(i)} onChange={(e) => { const n = new Set(pick); if (e.target.checked) n.add(i); else n.delete(i); setPick(n); }} />
                        <span>{m.item}<small>{m.why}</small></span></label>
                    ) : <span><b>{m.item}</b> <span className="muted">· {m.why}</span></span>}
                  </li>
                ))}
              </ul>
              {asking && (
                <div className="stack-sm">
                  <label className="field" htmlFor="askNote"><span>הערה למפנה <small>לא חובה</small></span><textarea id="askNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                  <div className="row">
                    <button type="button" className="btn btn-primary" onClick={ask} disabled={pending || (!pick.size && !note.trim())}><Icon name="send" />{pending ? 'שולח…' : `שליחה למפנה (${pick.size})`}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>ביטול</button>
                  </div>
                  <p className="hint">הבקשה תופיע אצל המפנה בתיק ותישלח אליו במייל.</p>
                </div>
              )}
            </div>
          )}
          {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}

          {d.timeline.length > 0 && (
            <details className="ai-sec" open>
              <summary><Icon name="timeline" />ציר זמן רפואי <span className="count">{d.timeline.length}</span></summary>
              <ol className="tl">
                {d.timeline.map((t, i) => (
                  <li key={i}>
                    <span className="tl-date num">{fuzzyDate(t.date) || '—'}</span>
                    <div><b>{t.title}</b>{t.detail && <p>{t.detail}</p>}{t.source && <span className="src">{t.source}</span>}</div>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {(d.diagnoses.length > 0 || d.imaging.length > 0) && (
            <details className="ai-sec">
              <summary><Icon name="activity" />אבחנות ובדיקות <span className="count">{d.diagnoses.length + d.imaging.length}</span></summary>
              {d.diagnoses.length > 0 && <div className="chips" style={{ marginBottom: 10 }}>{d.diagnoses.map((x, i) => <span className="dx" key={i} title={x.source}>{x.name}{x.date && <small>{fuzzyDate(x.date)}</small>}</span>)}</div>}
              {d.imaging.length > 0 && (
                <div className="table-wrap"><table className="t compact"><thead><tr><th>תאריך</th><th>בדיקה</th><th>ממצא</th></tr></thead>
                  <tbody>{d.imaging.map((x, i) => <tr key={i}><td className="num">{fuzzyDate(x.date)}</td><td><b style={{ fontWeight: 500 }}>{x.test}</b></td><td>{x.finding}<div className="src">{x.source}</div></td></tr>)}</tbody></table></div>
              )}
            </details>
          )}

          {(d.medications.length > 0 || d.treatments.length > 0 || d.function_work) && (
            <details className="ai-sec">
              <summary><Icon name="pill" />טיפולים, תרופות ותפקוד</summary>
              {d.treatments.length > 0 && <><span className="eyebrow">טיפולים</span><ul className="plain">{d.treatments.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {d.medications.length > 0 && <><span className="eyebrow">תרופות</span><div className="chips">{d.medications.map((x, i) => <span className="dx" key={i}>{x}</span>)}</div></>}
              {d.function_work && <><span className="eyebrow">תפקוד ועבודה</span><p>{d.function_work}</p></>}
            </details>
          )}

          {d.exam_focus.length > 0 && (
            <details className="ai-sec" open>
              <summary><Icon name="stethoscope" />מה לבדוק בביקור <span className="count">{d.exam_focus.length}</span></summary>
              <ul className="checklist">{d.exam_focus.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </details>
          )}

          {d.documents.length > 0 && (
            <details className="ai-sec">
              <summary><Icon name="file" />המסמכים שנקראו <span className="count">{d.documents.length}</span></summary>
              <ul className="docs-read">{d.documents.map((x, i) => <li key={i}><b>{x.kind || x.file}</b> <span className="muted num">{fuzzyDate(x.date)}</span><p>{x.gist}</p><span className="src">{x.file}</span></li>)}</ul>
            </details>
          )}
          <p className="hint">הסיכום הוכן אוטומטית ומשמש עזר בלבד. המקור הקובע הוא המסמכים עצמם.</p>
        </div>
      )}
    </section>
  );
}
