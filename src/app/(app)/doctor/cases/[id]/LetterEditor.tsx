'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { TYPES, type ReferralType } from '@/lib/constants';
import { fmtStamp, todayIL } from '@/lib/dates';
import { PLACEHOLDER_RE, parseDraft } from '@/lib/letter';
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

export default function LetterEditor({
  appointmentId, defaultType, initial, docCount, cancelled, preview,
}: { appointmentId: string; defaultType: ReferralType; initial: LetterRow | null; docCount: number; cancelled: boolean; preview?: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [d, setD] = useState<Draft>({
    letter_type: initial?.letter_type ?? defaultType,
    recipient: initial?.recipient ?? '',
    subject: initial?.subject ?? '',
    body: initial?.body ?? '',
    exam_notes: initial?.exam_notes ?? '',
  });
  const [saveState, setSaveState] = useState(initial ? 'נשמר' : '');
  const [ai, setAi] = useState<{ running: boolean; text: string; note: string }>({ running: false, text: '', note: '' });
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
        setAi({ running: false, text: '', note: j.error || 'הניסוח נכשל. נסו שוב.' });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setAi((s) => ({ ...s, text, note: 'כותב…' }));
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
  return (
    <section className="panel" aria-label="המכתב">
      <div className="panel-head">
        <h2><Icon name="file" />המכתב</h2>
        <span className="save-state" aria-live="polite">{saveState === 'נשמר' && <Icon name="check" />}{saveState}</span>
      </div>
      {initial?.is_final && <div className="callout"><div><Icon name="checkCircle" />נשלחה גרסה סופית למפנה{initial.finalized_at ? ` · ${fmtStamp(initial.finalized_at)}` : ''}. שינויים כאן יגיעו אליו רק אחרי ״עדכון המכתב הסופי״.</div></div>}
      {cancelled && <div className="callout bad"><div><Icon name="x" />התור בוטל.</div></div>}
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
      <div className="field-tools"><Dictate onText={appendExam} label="הכתבת ממצאים" /></div>
      <label className="field" htmlFor="ltExam"><span>ממצאי הבדיקה שלי <small>ה־AI ישתמש בהם בטיוטה. אפשר בקיצור, בהקלדה או בהכתבה.</small></span>
        <textarea id="ltExam" rows={3} value={d.exam_notes} onChange={(e) => update({ exam_notes: e.target.value })} placeholder="לדוגמה: הליכה תקינה. כוח 5/5 בארבע הגפיים. ירידה בתחושה בדרמטום C6 משמאל. ספרלינג חיובי משמאל." />
      </label>
      <div className="editor-tools">
        <span className="ai-ic"><Icon name="sparkles" /></span>
        <p aria-live="polite">{ai.note || 'ה־AI קורא את המסמכים, את בקשת המפנה ואת הממצאים שלך, ומנסח טיוטה לפי סוג המכתב.'}</p>
        <button type="button" className="btn btn-primary" onClick={preview ? undefined : runAI} disabled={ai.running}>{ai.running ? 'מנסח…' : d.body ? 'ניסוח מחדש' : 'ניסוח טיוטה'}</button>
        {ai.running && <button type="button" className="btn" onClick={() => abort.current?.abort()}>עצירה</button>}
      </div>
      <label className="field" htmlFor="ltSubj"><span>הנדון</span>
        <input id="ltSubj" value={d.subject} onChange={(e) => update({ subject: e.target.value })} disabled={ai.running} />
      </label>
      <div className="field-tools">
        <TemplatePicker letterType={d.letter_type} onInsert={insertBody} selection={() => { const el = bodyRef.current; return el ? el.value.slice(el.selectionStart, el.selectionEnd) : ''; }} />
        <Dictate onText={insertBody} />
      </div>
      <label className="field" htmlFor="ltBody"><span>גוף המכתב <small>שורה קצרה שמסתיימת בנקודתיים = כותרת · שורה שמתחילה ב־״- ״ = סעיף</small></span>
        <textarea id="ltBody" ref={bodyRef} onSelect={(e) => { posRef.current = e.currentTarget.selectionEnd; }} rows={22} value={shownBody} readOnly={ai.running} onChange={(e) => update({ body: e.target.value })} placeholder="לחצו על ״ניסוח טיוטה״ או כתבו כאן…" />
      </label>
      <p className="hint">נייר המכתבים, פרטי המטופל, החתימה והתאריך נוספים לבד בהדפסה.</p>
      {finalState.msg && <p className={finalState.ok ? 'ok-msg' : 'err'} role="status">{finalState.msg}</p>}
      <div className="footer-actions">
        <button type="button" className="btn" onClick={preview ? undefined : previewLetter} disabled={ai.running}><Icon name="printer" />תצוגה והדפסה ל־PDF</button>
        <div className="row">
          {finalState.armed && <button type="button" className="btn btn-ghost" onClick={() => setFinalState({ armed: false, ok: false, msg: '' })}>ביטול</button>}
          <button type="button" className={`btn btn-ok${finalState.armed ? ' armed' : ''}`} onClick={preview ? undefined : finalize} disabled={ai.running || cancelled}>
            <Icon name="send" />{finalState.armed ? 'לחצו שוב לאישור השליחה' : initial?.is_final ? 'עדכון המכתב הסופי' : 'סימון כסופי ושליחה למפנה'}
          </button>
        </div>
      </div>
    </section>
  );
}
