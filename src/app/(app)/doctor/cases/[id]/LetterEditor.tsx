'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { TYPES, type ReferralType } from '@/lib/constants';
import { fmtStamp, todayIL } from '@/lib/dates';
import { PLACEHOLDER_RE, outlineFor, parseDraft } from '@/lib/letter';
import { countPlaceholders, fromSections, newSection, toSections, type Section } from '@/lib/sections';
import PaperPreview, { type PaperInfo } from '@/components/PaperPreview';
import Icon from '@/components/Icon';
import { sendLetter } from '../../actions';
import Dictate from '@/components/Dictate';
import TemplatePicker from './TemplatePicker';

export type LetterRow = {
  appointment_id: string;
  letter_type: ReferralType;
  recipient: string;
  subject: string;
  body: string;
  exam_notes: string;
  is_final: boolean;
  finalized_at: string | null;
};

type Draft = { letter_type: ReferralType; recipient: string; subject: string; body: string; exam_notes: string };

/** Removes an error line that older versions wrote into the letter when the AI failed. */
const cleanBody = (b?: string | null) => String(b ?? '').replace(/\n*\[הניסוח נעצר בגלל תקלה\. נסו שוב\.\]\s*/g, '').trim();

/** A textarea that grows with its text. */
function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 2, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} />;
}

export default function LetterEditor({
  appointmentId, defaultType, initial, docCount, cancelled, preview, paper,
}: { appointmentId: string; defaultType: ReferralType; initial: LetterRow | null; docCount: number; cancelled: boolean; preview?: boolean; paper: PaperInfo }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [d, setD] = useState<Draft>({
    letter_type: initial?.letter_type ?? defaultType,
    recipient: initial?.recipient ?? '',
    subject: initial?.subject ?? '',
    body: cleanBody(initial?.body),
    exam_notes: initial?.exam_notes ?? '',
  });
  const [saveState, setSaveState] = useState(initial ? 'נשמר' : '');
  const [ai, setAi] = useState<{ running: boolean; text: string; note: string; bad?: boolean }>({ running: false, text: '', note: '' });
  const [finalState, setFinalState] = useState<{ armed: boolean; msg: string; ok: boolean }>({ armed: false, msg: '', ok: false });
  const latest = useRef(d);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const abort = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  /** inserts text at the cursor in the letter body (or at the end) */
  const posRef = useRef<number | null>(null);
  const insertBody = (text: string) => {
    const cur = latest.current.body;
    const pos = Math.min(posRef.current ?? cur.length, cur.length);
    const before = cur.slice(0, pos);
    const after = cur.slice(pos);
    const sep = before && !before.endsWith('\n') ? '\n' : '';
    const tail = after && !after.startsWith('\n') ? '\n' : '';
    posRef.current = (before + sep + text + tail).length;
    update({ body: before + sep + text + tail + after });
  };
  const appendExam = (text: string) => {
    const cur = latest.current.exam_notes;
    update({ exam_notes: cur ? `${cur}${cur.endsWith('\n') ? '' : ' '}${text}` : text });
  };

  // ---- the body as sections (the default editing mode) ----
  const [mode, setMode] = useState<'sections' | 'text'>('sections');
  const [secs, setSecs] = useState<Section[]>(() => toSections(cleanBody(initial?.body)));
  const lastBody = useRef(cleanBody(initial?.body));
  const focusId = useRef<string | null>(null);
  const setSections = (next: Section[]) => {
    setSecs(next);
    const body = fromSections(next);
    lastBody.current = body;
    update({ body });
  };
  useEffect(() => {
    // the body changed from outside the sections (AI draft, free-text mode, template): rebuild them
    if (d.body !== lastBody.current) { lastBody.current = d.body; setSecs(toSections(d.body)); }
  }, [d.body]);
  const patchSec = (id: string, patch: Partial<Section>) => setSections(secs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const moveSec = (id: string, dir: -1 | 1) => {
    const i = secs.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= secs.length) return;
    const next = [...secs];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };
  const removeSec = (id: string) => {
    const x = secs.find((y) => y.id === id);
    if (x?.text.trim() && !window.confirm(`למחוק את הסעיף "${x.heading || 'ללא כותרת'}"?`)) return;
    setSections(secs.filter((y) => y.id !== id));
  };
  const focusSec = (id: string, select?: RegExp) => {
    const el = document.getElementById(`sec-${id}`) as HTMLTextAreaElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    if (select) { const m = select.exec(el.value); if (m) el.setSelectionRange(m.index, m.index + m[0].length); }
  };
  /** inserts text into the section being edited (or adds sections when the text has headings) */
  const insertSections = (text: string) => {
    const parsed = toSections(text);
    const at = secs.findIndex((x) => x.id === focusId.current);
    if (parsed.some((p) => p.heading)) {
      const next = [...secs];
      next.splice(at >= 0 ? at + 1 : next.length, 0, ...parsed);
      return setSections(next);
    }
    if (at >= 0) {
      const cur = secs[at];
      return patchSec(cur.id, { text: cur.text ? `${cur.text}${cur.text.endsWith('\n') ? '' : ' '}${text}` : text });
    }
    setSections([...secs, newSection('', text)]);
  };
  const insertAny = (text: string) => (mode === 'sections' ? insertSections(text) : insertBody(text));
  const standard = toSections(outlineFor(d.letter_type)).map((x) => x.heading);
  const missing = standard.filter((h) => !secs.some((x) => x.heading.replace(/[:：]$/, '') === h.replace(/[:：]$/, '')));
  const applyOutline = () => {
    if (!secs.length) return setSections(toSections(outlineFor(d.letter_type)));
    setSections([...secs, ...missing.map((h) => newSection(h, ''))]);
  };
  const placeholders = countPlaceholders(d.body);
  const nextPlaceholder = () => {
    const x = secs.find((y) => countPlaceholders(y.text) > 0);
    if (mode === 'sections' && x) return focusSec(x.id, /\[(להשלמת|לאישור|לבדיקת) הרופא[^\]]*\]/);
    const el = bodyRef.current;
    if (el) { const m = /\[(להשלמת|לאישור|לבדיקת) הרופא[^\]]*\]/.exec(el.value); el.focus(); if (m) el.setSelectionRange(m.index, m.index + m[0].length); }
  };

  const save = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (preview || !dirty.current) return chain.current;
    dirty.current = false;
    const row = { appointment_id: appointmentId, ...latest.current };
    chain.current = chain.current.then(async () => {
      setSaveState('שומר…');
      const { error } = await supabase.from('letters').upsert(row, { onConflict: 'appointment_id' });
      if (error) { dirty.current = true; setSaveState('השמירה נכשלה. בדקו את החיבור.'); }
      else setSaveState('נשמר');
    });
    return chain.current;
  }, [appointmentId, supabase, preview]);

  const update = (patch: Partial<Draft>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setD(next);
    dirty.current = true;
    setSaveState('שינויים לא שמורים');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); save(); abort.current?.abort(); };
  }, [save]);

  async function runAI() {
    if (ai.running) return;
    await save();
    const ctl = new AbortController();
    abort.current = ctl;
    const before = latest.current;
    setAi({ running: true, text: '', note: docCount ? `קורא ${docCount} מסמכים וחושב… זה יכול לקחת דקה או שתיים` : 'חושב…' });
    let text = '';
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, letterType: before.letter_type, exam: before.exam_notes }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setAi({ running: false, text: '', note: j.error || 'הניסוח נכשל. נסו שוב.', bad: true });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setAi((s) => ({ ...s, text: text.split('\u0000ERR:')[0], note: 'כותב…' }));
      }
      const [good, err] = text.split('\u0000ERR:');
      if (err !== undefined) {
        // the AI failed: keep whatever was written so far, and say why
        if (good.trim()) { const p = parseDraft(good); update({ body: p.body }); await save(); }
        setAi({ running: false, text: '', note: err, bad: true });
        return;
      }
      const r = parseDraft(text);
      update({ recipient: r.recipient || before.recipient, subject: r.subject || before.subject, body: r.body });
      await save();
      setAi({ running: false, text: '', note: 'הטיוטה מוכנה. עברו עליה, תקנו והשלימו את מה שמסומן בסוגריים מרובעים.' });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      if (text) { const r = parseDraft(text); update({ body: r.body }); }
      setAi({ running: false, text: '', note: aborted ? 'נעצר.' : 'הניסוח נכשל. בדקו את החיבור ונסו שוב.' });
    } finally {
      abort.current = null;
    }
  }

  async function previewLetter() {
    const w = window.open('', '_blank');
    await save();
    const url = `/letters/${appointmentId}/print?v=draft`;
    if (w) w.location.href = url;
    else window.location.href = url;
  }

  async function finalize() {
    const cur = latest.current;
    if (!cur.body.trim()) return setFinalState({ armed: false, ok: false, msg: 'המכתב ריק.' });
    if (PLACEHOLDER_RE.test(cur.body)) return setFinalState({ armed: false, ok: false, msg: 'יש במכתב סימונים בסוגריים מרובעים (להשלמת, לאישור או לבדיקת הרופא). טפלו בהם ומחקו את הסימון לפני השליחה.' });
    if (!finalState.armed) return setFinalState({ armed: true, ok: false, msg: '' });
    await save();
    const { error } = await supabase.from('letters').update({
      is_final: true, finalized_at: new Date().toISOString(), letter_date: todayIL(),
      final_letter_type: cur.letter_type, final_recipient: cur.recipient, final_subject: cur.subject, final_body: cur.body,
    }).eq('appointment_id', appointmentId);
    if (error) return setFinalState({ armed: false, ok: false, msg: 'השליחה נכשלה. נסו שוב.' });
    setFinalState({ armed: false, ok: true, msg: 'המכתב סומן כסופי. שולח במייל…' });
    // a first final version goes out by email (PDF); an update to an existing final version is re-sent from "זימונים והודעות"
    const r = initial?.is_final ? null : await sendLetter(appointmentId).catch(() => null);
    setFinalState({ armed: false, ok: true, msg: r?.ok ? `המכתב זמין למפנה בתיק. ${r.info || ''}` : `המכתב זמין למפנה בתיק.${r?.error ? ` המייל לא נשלח: ${r.error}` : ''}` });
    router.refresh();
  }

  const shownBody = ai.running ? ai.text : d.body;
  const steps = [
    { label: 'ממצאים', done: !!d.exam_notes.trim() },
    { label: 'טיוטה', done: !!d.body.trim() },
    { label: 'השלמות', done: !!d.body.trim() && placeholders === 0 },
    { label: 'סופי', done: !!initial?.is_final },
  ];
  return (
    <section className="studio" aria-label="המכתב">
      <div className="studio-head">
        <div className="studio-title">
          <span className="studio-ic"><Icon name="file" /></span>
          <div><h2>{TYPES[d.letter_type].label}</h2><span className="hint">{initial?.is_final ? `נשלח למפנה${initial.finalized_at ? ` · ${fmtStamp(initial.finalized_at)}` : ''}` : 'טיוטה'}</span></div>
        </div>
        <ol className="steps" aria-label="התקדמות">
          {steps.map((x, i) => <li key={x.label} className={x.done ? 'done' : ''}><span className="num">{x.done ? <Icon name="check" size={12} /> : i + 1}</span>{x.label}</li>)}
        </ol>
        <span className="save-state" aria-live="polite">{saveState === 'נשמר' && <Icon name="check" />}{saveState}</span>
      </div>
      {initial?.is_final && <div className="callout"><div><Icon name="checkCircle" />נשלחה גרסה סופית למפנה. שינויים כאן יגיעו אליו רק אחרי ״עדכון המכתב הסופי״.</div></div>}
      {cancelled && <div className="callout bad"><div><Icon name="x" />התור בוטל.</div></div>}

      <div className="studio-grid">
        <div className="studio-edit">
          <div className="card">
            <div className="card-h"><Icon name="settings" />פרטי המכתב</div>
            <div className="grid-2">
              <label className="field" htmlFor="ltType"><span>סוג המכתב</span>
                <select id="ltType" value={d.letter_type} onChange={(e) => update({ letter_type: e.target.value as ReferralType })}>
                  {(Object.keys(TYPES) as ReferralType[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="ltTo"><span>לכבוד <small>כמה שורות? הפרידו ב־ |</small></span>
                <input id="ltTo" value={d.recipient} onChange={(e) => update({ recipient: e.target.value })} placeholder="המוסד לביטוח לאומי | סניף חדרה" disabled={ai.running} />
              </label>
            </div>
            <label className="field" htmlFor="ltSubj"><span>הנדון</span>
              <input id="ltSubj" value={d.subject} onChange={(e) => update({ subject: e.target.value })} disabled={ai.running} placeholder="חוות דעת רפואית – נכות מעבודה" />
            </label>
          </div>

          <div className="card">
            <div className="card-h between"><span><Icon name="stethoscope" />ממצאי הבדיקה שלי</span><Dictate onText={appendExam} label="הכתבה" /></div>
            <AutoText id="ltExam" minRows={3} value={d.exam_notes} onChange={(e) => update({ exam_notes: e.target.value })} aria-label="ממצאי הבדיקה"
              placeholder="לדוגמה: הליכה תקינה. כוח 5/5 בארבע הגפיים. ירידה בתחושה בדרמטום C6 משמאל. ספרלינג חיובי משמאל." />
            <span className="hint">ה־AI ישלב אותם בטיוטה. אפשר בקיצור.</span>
          </div>

          <div className={`ai-bar${ai.running ? ' run' : ''}${ai.bad ? ' bad' : ''}`}>
            <span className="ai-badge"><Icon name="sparkles" /></span>
            <p aria-live="polite">{ai.note || `ה־AI קורא ${docCount ? `${docCount} מסמכים` : 'את התיק'}, את הבקשה ואת הממצאים שלך, ומנסח טיוטה מלאה לפי סוג המכתב.`}</p>
            <button type="button" className="btn btn-primary" onClick={preview ? undefined : runAI} disabled={ai.running}><Icon name="sparkles" />{ai.running ? 'מנסח…' : d.body ? 'ניסוח מחדש' : 'ניסוח טיוטה'}</button>
            {ai.running && <button type="button" className="btn" onClick={() => abort.current?.abort()}>עצירה</button>}
          </div>

          <div className="card">
            <div className="card-h between">
              <span><Icon name="list" />גוף המכתב</span>
              <span className="row" style={{ gap: 6 }}>
                <span className="seg" role="tablist" aria-label="מצב עריכה">
                  <button type="button" aria-pressed={mode === 'sections'} onClick={() => setMode('sections')}>לפי סעיפים</button>
                  <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>טקסט חופשי</button>
                </span>
              </span>
            </div>
            <div className="body-tools">
              <button type="button" className="btn btn-sm" onClick={applyOutline} disabled={ai.running || (secs.length > 0 && missing.length === 0)} title="כותרות הסעיפים לפי סוג המכתב">
                <Icon name="list" />{secs.length ? `הוספת סעיפים חסרים${missing.length ? ` (${missing.length})` : ''}` : 'מבנה מוכן'}
              </button>
              <TemplatePicker letterType={d.letter_type} onInsert={insertAny} selection={() => {
                const el = (mode === 'text' ? bodyRef.current : (document.activeElement as HTMLTextAreaElement | null));
                return el && 'selectionStart' in el ? el.value.slice(el.selectionStart, el.selectionEnd) : '';
              }} />
              <Dictate onText={insertAny} />
              {placeholders > 0 && <button type="button" className="btn btn-sm btn-warn" onClick={nextPlaceholder}><Icon name="flag" />{placeholders} להשלמה · לבא</button>}
            </div>

            {ai.running ? (
              <pre className="ai-stream" aria-live="polite">{shownBody || 'מתחיל לכתוב…'}</pre>
            ) : mode === 'text' ? (
              <>
                <textarea id="ltBody" ref={bodyRef} onSelect={(e) => { posRef.current = e.currentTarget.selectionEnd; }} rows={22} value={d.body} onChange={(e) => update({ body: e.target.value })} placeholder="לחצו על ״ניסוח טיוטה״ או כתבו כאן…" aria-label="גוף המכתב" />
                <span className="hint">שורה קצרה שמסתיימת בנקודתיים = כותרת · שורה שמתחילה ב־״- ״ = סעיף ברשימה</span>
              </>
            ) : secs.length === 0 ? (
              <div className="sec-empty">
                <Icon name="file" />
                <b>המכתב עוד ריק</b>
                <span className="muted">אפשר לנסח עם ה־AI, להתחיל ממבנה מוכן לפי סוג המכתב, או לכתוב סעיף ראשון.</span>
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary" onClick={preview ? undefined : runAI}><Icon name="sparkles" />ניסוח טיוטה</button>
                  <button type="button" className="btn" onClick={applyOutline}><Icon name="list" />מבנה מוכן</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setSections([newSection('', '')])}><Icon name="plus" />סעיף ריק</button>
                </div>
              </div>
            ) : (
              <ol className="secs">
                {secs.map((x, i) => {
                  const ph = countPlaceholders(x.text) + countPlaceholders(x.heading);
                  return (
                    <li key={x.id} className={`sec${ph ? ' warn' : ''}`}>
                      <div className="sec-h">
                        <span className="sec-n num">{i + 1}</span>
                        <input value={x.heading.replace(/[:：]$/, '')} onChange={(e) => patchSec(x.id, { heading: e.target.value ? `${e.target.value}:` : '' })} placeholder="כותרת הסעיף (לא חובה)" aria-label={`כותרת סעיף ${i + 1}`} />
                        {ph > 0 && <span className="badge b-draft">{ph} להשלמה</span>}
                        <span className="sec-tools">
                          <button type="button" onClick={() => moveSec(x.id, -1)} disabled={i === 0} aria-label="העברה למעלה" title="למעלה">▲</button>
                          <button type="button" onClick={() => moveSec(x.id, 1)} disabled={i === secs.length - 1} aria-label="העברה למטה" title="למטה">▼</button>
                          <button type="button" onClick={() => removeSec(x.id)} aria-label="מחיקת הסעיף" title="מחיקה"><Icon name="trash" size={14} /></button>
                        </span>
                      </div>
                      <AutoText id={`sec-${x.id}`} minRows={2} value={x.text} onFocus={() => { focusId.current = x.id; }}
                        onChange={(e) => patchSec(x.id, { text: e.target.value })} aria-label={x.heading || `סעיף ${i + 1}`}
                        placeholder="כתבו כאן… (שורה שמתחילה ב־״- ״ = פריט ברשימה)" />
                    </li>
                  );
                })}
              </ol>
            )}
            {mode === 'sections' && secs.length > 0 && !ai.running && (
              <div className="sec-add">
                <select aria-label="הוספת סעיף" value="" onChange={(e) => { if (e.target.value === '__free') setSections([...secs, newSection('', '')]); else if (e.target.value) setSections([...secs, newSection(e.target.value, '')]); }}>
                  <option value="">+ הוספת סעיף…</option>
                  {missing.map((h) => <option key={h} value={h}>{h.replace(/[:：]$/, '')}</option>)}
                  <option value="__free">סעיף חופשי</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <aside className="studio-paper" aria-label="תצוגה מקדימה">
          <div className="paper-bar"><span><Icon name="file" />תצוגה חיה על נייר המכתבים</span><span className="hint">לחיצה על כותרת = מעבר לסעיף</span></div>
          <div className="paper-frame">
            <PaperPreview info={paper} type={d.letter_type} recipient={d.recipient} subject={d.subject} body={shownBody} date={todayIL()}
              onPick={(h) => { const x = secs.find((y) => y.heading.trim() === h.trim()); if (x) { setMode('sections'); setTimeout(() => focusSec(x.id), 50); } }} />
          </div>
        </aside>
      </div>

      <div className="studio-actions">
        <div className="row" style={{ gap: 8 }}>
          {placeholders > 0
            ? <span className="badge b-draft">{placeholders} סימונים להשלמה לפני שליחה</span>
            : d.body.trim() ? <span className="badge b-done">מוכן לשליחה</span> : null}
          {finalState.msg && <span className={finalState.ok ? 'ok-msg' : 'err'} role="status">{finalState.msg}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={preview ? undefined : previewLetter} disabled={ai.running}><Icon name="printer" />הדפסה / PDF</button>
          {finalState.armed && <button type="button" className="btn btn-ghost" onClick={() => setFinalState({ armed: false, ok: false, msg: '' })}>ביטול</button>}
          <button type="button" className={`btn btn-ok${finalState.armed ? ' armed' : ''}`} onClick={preview ? undefined : finalize} disabled={ai.running || cancelled}>
            <Icon name="send" />{finalState.armed ? 'לחצו שוב לאישור השליחה' : initial?.is_final ? 'עדכון המכתב הסופי' : 'סימון כסופי ושליחה'}
          </button>
        </div>
      </div>
    </section>
  );
}
