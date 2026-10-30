'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useSupabase } from '@/lib/supabase/browser';
import { typeOf, TYPES, type ReferralType } from '@/lib/constants';
import { age, fmtDate, fmtStamp, todayIL } from '@/lib/dates';
import { LEGAL_DECLARATION, PLACEHOLDER_RE, outlineFor, parseDraft } from '@/lib/letter';
import { bodyDraftText, bodyText, bodyToHtml, richBody, textToHtml } from '@/lib/richtext';
import { countPlaceholders } from '@/lib/sections';
import type { PaperInfo } from '@/components/PaperPreview';
import RichEditor, { type RichHandle } from '@/components/RichEditor';
import Icon from '@/components/Icon';
import Dictate from '@/components/Dictate';
import { approvePayment, sendLetter } from '../../actions';
import { PAY_METHODS, type PayMethod } from '@/lib/constants';
import TemplatePicker from './TemplatePicker';

export type LetterRow = {
  appointment_id: string;
  letter_type: ReferralType;
  recipient: string;
  subject: string;
  doc_title?: string;
  body: string;
  exam_notes: string;
  is_final: boolean;
  finalized_at: string | null;
  ai_draft_at?: string | null;
  letter_date?: string | null;
};

type Draft = { letter_type: ReferralType; recipient: string; subject: string; doc_title: string; body: string; exam_notes: string; letter_date: string };

const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/**
 * The letter, edited like a Word document directly on the clinic's letterhead.
 * Side panel: letter details, the doctor's findings, the AI draft and writing aids.
 */
export default function LetterEditor({
  appointmentId, defaultType, initial, docCount, cancelled, preview, paper, diagnoses = [], sendTo = [], payment,
}: { payment?: { needed: boolean; due: number; paidInFull: boolean }; sendTo?: string[]; diagnoses?: { code: string; name: string; primary: boolean }[]; appointmentId: string; defaultType: ReferralType | null; initial: LetterRow | null; docCount: number; cancelled: boolean; preview?: boolean; paper: PaperInfo }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [startHtml] = useState(() => bodyToHtml(cleanBody(initial?.body)));
  const [d, setD] = useState<Draft>({
    letter_type: initial?.letter_type ?? defaultType ?? 'summary',
    recipient: initial?.recipient ?? '',
    subject: initial?.subject ?? '',
    doc_title: initial?.doc_title ?? '',
    body: startHtml ? richBody(startHtml) : '',
    exam_notes: initial?.exam_notes ?? '',
    // the document keeps the date it was written on; editing it later doesn't change it (only the doctor, in "פרטים")
    letter_date: initial?.letter_date || todayIL(),
  });
  const [html, setHtml] = useState(startHtml);
  const [saveState, setSaveState] = useState(initial ? 'נשמר' : '');
  const [ai, setAi] = useState<{ running: boolean; text: string; note: string; bad?: boolean; label?: string }>({ running: false, text: '', note: '' });
  const [opts, setOpts] = useState<{ instructions: string; length: 'short' | 'normal' | 'long'; withHistory: boolean }>({ instructions: '', length: 'normal', withHistory: false });
  const [undo, setUndo] = useState<{ html: string; recipient: string; subject: string; label: string }[]>([]);
  // on a phone the studio shows one pane at a time
  const [pane, setPane] = useState<'letter' | 'side'>('letter');
  const [side, setSide] = useState<'ai' | 'exam' | 'details' | 'tools'>('ai');
  const [toolsOpen, setToolsOpen] = useState(true);
  // writing in full screen: only the letter and its tools
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('wm', focus);
    if (!focus) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.review-wrap')) setFocus(false); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); document.documentElement.classList.remove('wm'); };
  }, [focus]);
  const [finalState, setFinalState] = useState<{ armed: boolean; msg: string; ok: boolean }>({ armed: false, msg: '', ok: false });
  const [review, setReview] = useState<number | null>(null);
  // before sending: the doctor must say whether it was paid (and how much and how) or is free
  const [pay, setPay] = useState<{ choice: '' | 'paid' | 'free' | 'request'; amount: string; method: PayMethod }>({ choice: '', amount: payment?.due ? String(payment.due) : '', method: 'transfer' });
  const payNeeded = !!payment?.needed && !initial?.is_final;
  const payReady = !payNeeded || pay.choice === 'free' || pay.choice === 'request' || (pay.choice === 'paid' && (payment?.paidInFull || Number(pay.amount) > 0));
  const latest = useRef(d);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const abort = useRef<AbortController | null>(null);
  const editor = useRef<RichHandle | null>(null);

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
  const onBody = (h: string) => { setHtml(h); update({ body: richBody(h) }); };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); save(); abort.current?.abort(); };
  }, [save]);

  const appendExam = (text: string) => {
    const cur = latest.current.exam_notes;
    update({ exam_notes: cur ? `${cur}${cur.endsWith('\n') ? '' : ' '}${text}` : text });
  };

  /** keeps the letter as it is, so an AI change can be undone */
  function snapshot(label: string) {
    if (!label) return;
    setUndo((u) => [{ html, recipient: latest.current.recipient, subject: latest.current.subject, label }, ...u].slice(0, 6));
  }
  function undoAI() {
    const [last, ...rest] = undo;
    if (!last) return;
    setUndo(rest);
    update({ recipient: last.recipient, subject: last.subject });
    onBody(last.html);
    editor.current?.setHtml(last.html);
    setAi({ running: false, text: '', note: 'הוחזרה הגרסה הקודמת.' });
  }

  const REFINES: { key: 'polish' | 'shorten' | 'expand' | 'proof' | 'simple'; label: string; icon: string; busy: string }[] = [
    { key: 'polish', label: 'שדרוג ניסוח', icon: 'sparkles', busy: 'משדרג את הניסוח' },
    { key: 'proof', label: 'הגהה ותיקון', icon: 'check', busy: 'מגיה ומתקן' },
    { key: 'shorten', label: 'קיצור', icon: 'minus', busy: 'מקצר' },
    { key: 'expand', label: 'הרחבה ונימוק', icon: 'plus', busy: 'מרחיב ומנמק' },
    { key: 'simple', label: 'שפה פשוטה למטופל', icon: 'user', busy: 'מפשט את השפה' },
  ];

  /** Improves the letter that is already written, without starting over. */
  async function refine(action: 'polish' | 'shorten' | 'expand' | 'proof' | 'simple' | 'custom') {
    if (ai.running) return;
    const bodyNow = bodyDraftText(latest.current.body).trim();
    if (!bodyNow) return setAi({ running: false, text: '', note: 'אין עדיין טקסט לשפר. התחילו ב״ניסוח טיוטה״.', bad: true });
    if (action === 'custom' && !opts.instructions.trim()) return setAi({ running: false, text: '', note: 'כתבו בתיבה מה לשנות.', bad: true });
    await save();
    const label = action === 'custom' ? 'מבצע את ההנחיות' : REFINES.find((r) => r.key === action)?.busy || 'משפר';
    snapshot('לפני ' + (action === 'custom' ? 'ההנחיות' : REFINES.find((r) => r.key === action)?.label || 'השיפור'));
    setPane('letter');
    const ctl = new AbortController();
    abort.current = ctl;
    setAi({ running: true, label, text: '', note: `${label}…` });
    let text = '';
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, action, letterType: latest.current.letter_type, body: bodyNow, instructions: action === 'custom' || action === 'polish' ? opts.instructions : '' }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setUndo((u) => u.slice(1));
        return setAi({ running: false, text: '', note: j.error || 'השיפור נכשל. נסו שוב.', bad: true });
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
        setUndo((u) => u.slice(1));
        return setAi({ running: false, text: '', note: err, bad: true });
      }
      const next = textToHtml(parseDraft(good).body);
      onBody(next);
      editor.current?.setHtml(next);
      await save();
      setAi({ running: false, text: '', note: 'עודכן. לא אהבתם? ״ביטול השינוי״ מחזיר את הגרסה הקודמת.' });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      setUndo((u) => u.slice(1));
      setAi({ running: false, text: '', note: aborted ? 'נעצר. המכתב לא שונה.' : 'השיפור נכשל. בדקו את החיבור ונסו שוב.', bad: !aborted });
    } finally {
      abort.current = null;
    }
  }

  // opened from "new document" with a few words for the AI: write the draft right away
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || preview) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('ai') !== '1') return;
    autoRan.current = true;
    sp.delete('ai');
    window.history.replaceState(null, '', window.location.pathname + (sp.toString() ? `?${sp}` : '') + window.location.hash);
    if (!bodyText(latest.current.body).trim() && latest.current.exam_notes.trim()) void runAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAI() {
    if (ai.running) return;
    await save();
    snapshot(bodyText(latest.current.body).trim() ? 'הטיוטה הקודמת' : '');
    setPane('letter');
    const ctl = new AbortController();
    abort.current = ctl;
    const before = latest.current;
    setAi({ running: true, label: 'מנסח טיוטה מלאה', text: '', note: docCount ? `קורא ${docCount} מסמכים ומנסח… בדרך כלל דקה עד שתיים` : 'מנסח…' });
    let text = '';
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, letterType: before.letter_type, exam: before.exam_notes, instructions: opts.instructions, length: opts.length, withHistory: opts.withHistory }),
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
        if (good.trim()) onBody(textToHtml(parseDraft(good).body));
        setAi({ running: false, text: '', note: err, bad: true });
        return;
      }
      const r = parseDraft(text);
      update({ recipient: r.recipient || before.recipient });
      onBody(textToHtml(r.body));
      await save();
      setAi({
        running: false, text: '',
        note: r.note ? `שימו לב: ${r.note}` : before.exam_notes.trim() ? 'המסמך מוכן. עברו עליו ושנו רק אם צריך.' : 'המסמך מוכן. סעיף הבדיקה נכתב לפי התיעוד הרפואי, כי עוד לא נרשמו ממצאי בדיקה. עברו עליו ושנו רק אם צריך.',
        bad: !!r.note,
      });
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      if (text) onBody(textToHtml(parseDraft(text.split('\u0000ERR:')[0]).body));
      setAi({ running: false, text: '', note: aborted ? 'נעצר.' : 'הניסוח נכשל. בדקו את החיבור ונסו שוב.', bad: !aborted });
    } finally {
      abort.current = null;
    }
  }

  async function printLetter() {
    const w = window.open('', '_blank');
    await save();
    const url = `/letters/${appointmentId}/print?v=draft`;
    if (w) w.location.href = url;
    else window.location.href = url;
  }

  async function finalize(confirmed = false) {
    const cur = latest.current;
    const txt = bodyText(cur.body);
    if (!txt.trim()) return setFinalState({ armed: false, ok: false, msg: 'המכתב ריק.' });
    if (PLACEHOLDER_RE.test(txt)) return setFinalState({ armed: false, ok: false, msg: 'יש במכתב סימונים להשלמה (מסומנים בצהוב). השלימו ומחקו אותם לפני השליחה.' });
    // first: the exact document, as it will be sent, in a preview window
    if (!confirmed) { await save(); setReview(Date.now()); return; }
    if (payNeeded && pay.choice !== 'request') {
      if (!payReady) return;
      const amount = Number(pay.amount);
      const r = await approvePayment(appointmentId, pay.choice === 'paid' && !payment?.paidInFull && amount > 0 ? { amount, method: pay.method, paidOn: todayIL() } : null, { deliver: false });
      if (!r.ok) return setFinalState({ armed: false, ok: false, msg: r.error || 'אישור התשלום נכשל.' });
    }
    setReview(null);
    const { error } = await supabase.from('letters').update({
      is_final: true, finalized_at: new Date().toISOString(), letter_date: cur.letter_date || todayIL(),
      final_letter_type: cur.letter_type, final_recipient: cur.recipient, final_subject: cur.subject, final_doc_title: cur.doc_title, final_body: cur.body,
    }).eq('appointment_id', appointmentId);
    if (error) return setFinalState({ armed: false, ok: false, msg: 'השליחה נכשלה. נסו שוב.' });
    setFinalState({ armed: false, ok: true, msg: 'המכתב סומן כסופי. שולח…' });
    const r = initial?.is_final ? null : await sendLetter(appointmentId).catch(() => null);
    setFinalState({ armed: false, ok: true, msg: r?.ok ? `המכתב זמין למפנה. ${r.info || ''}` : `המכתב זמין למפנה בתיק.${r?.error ? ` המייל לא נשלח: ${r.error}` : ''}` });
    router.refresh();
  }

  const placeholders = countPlaceholders(bodyText(d.body));
  const hasBody = !!bodyText(d.body).trim();
  const titles = paper.lh_titles.split('\n').filter(Boolean);
  const to = d.recipient.split('|').map((x) => x.trim()).filter(Boolean);
  const ag = age(paper.patient.dob);

  const opinion = d.letter_type === 'legal' || d.letter_type === 'nii';
  const footLines = (paper.lh_footer || '').split('\n').filter(Boolean);
  const defaultTitle = opinion ? 'חוות דעת רפואית' : ((paper.title && (!paper.titleType || paper.titleType === d.letter_type) ? paper.title : '') || typeOf(d.letter_type).label);
  const header = (
    <div className="page-top" contentEditable={false}>
      {paper.use_banner !== false
        ? <img className="pg-banner" src="/brand/letterhead.jpg" alt={paper.lh_name} />
        : (
          <header className="lt-head">
            <div>
              <div className="lt-name">{paper.lh_name}</div>
              {titles.map((t) => <div className="lt-small" key={t}>{t}</div>)}
              {paper.lh_licenses && <div className="lt-small">{paper.lh_licenses}</div>}
            </div>
            <div className="lt-small lt-contact">
              {paper.lh_address && <div>{paper.lh_address}</div>}
              {paper.lh_phone && <div>טל׳ {paper.lh_phone}</div>}
              {paper.lh_email && <div>{paper.lh_email}</div>}
            </div>
          </header>
        )}
      <div className="cl-date">תאריך: <span className="num">{fmtDate(d.letter_date)}</span></div>
      {to.length > 0 ? <div className="cl-to"><div>לכבוד</div>{to.map((r) => <div key={r}><b>{r}</b></div>)}</div> : <div className="cl-to ghost">לכבוד — לא חובה, ממלאים ב״פרטים״</div>}
      <div className="cl-title">{d.doc_title.trim() || defaultTitle}</div>
      <div className="cl-pt">
        <span><b>שם מלא:</b> {paper.patient.name}</span>
        {paper.patient.idNumber && <span><b>ת.ז.:</b> <span className="num">{paper.patient.idNumber}</span></span>}
        {paper.patient.dob && <span><b>תאריך לידה:</b> <span className="num">{fmtDate(paper.patient.dob)}</span>{ag != null ? ` (גיל ${ag})` : ''}</span>}
      </div>
      {paper.visits && paper.visits.length > 0 && (
        <div className="cl-rv"><b>ביקור חוזר</b> {new Set(paper.visits.map((v) => v.date)).size === 1 ? 'מתאריך' : '· ביקורים קודמים מתאריכים'} {[...new Set(paper.visits.map((v) => v.date))].map((x, i) => <span key={x}>{i > 0 && ', '}<bdi className="num">{fmtDate(x)}</bdi></span>)}</div>
      )}
      {opinion && (
        <div className="pg-intro">
          <p>הנני מגיש בזאת את חוות דעתי הרפואית{paper.visitDate ? ` לאחר בדיקתי ב־${fmtDate(paper.visitDate)}` : ''}.</p>
          {paper.cv_in_opinions !== false && paper.lh_cv && (
            <details className="pg-cv">
              <summary>פרטי השכלתי ותפקידי · מתווסף אוטומטית לחוות הדעת <small>(עריכה בהגדרות)</small></summary>
              {paper.lh_cv.split('\n').filter(Boolean).map((l, i) => <div key={i} className={/[:：]$/.test(l.trim()) ? 'cv-h' : 'cv-l'}>{l}</div>)}
            </details>
          )}
        </div>
      )}
    </div>
  );
  const footer = (
    <div className="page-bottom" contentEditable={false}>
      {d.letter_type === 'legal' && <div className="lt-decl">{LEGAL_DECLARATION}</div>}
      <div className="of-sign">
        <div className="of-doc"><div>בברכה,</div><b>{paper.lh_name}</b>{titles[0] && <div>{titles[0]}</div>}{paper.lh_licenses && <div>{paper.lh_licenses}</div>}</div>
        <div className="of-stamp">{paper.sign_final !== false ? <div className="pg-sigbox"><Icon name="checkCircle" size={14} />החתימה והחותמת יופיעו בתחתית כל עמוד בגרסה הסופית</div> : <div className="of-sigspace" />}<div className="of-line">חתימה וחותמת הרופא</div></div>
      </div>
      {footLines.length > 0 && <div className="pg-foot">{footLines.map((l, i) => <div key={i} className={i === 0 ? 'f1' : ''}>{l}</div>)}</div>}
    </div>
  );

  const SIDE = [['ai', 'AI', 'sparkles'], ['exam', 'ממצאים', 'stethoscope'], ['details', 'פרטים', 'settings'], ['tools', 'כלים', 'template']] as const;
  return (
    <section className={`studio${focus ? ' focus' : ''}`} data-pane={pane} aria-label="המכתב">
      <div className="studio-head">
        <div className="studio-title">
          <span className="studio-ic"><Icon name="file" /></span>
          <div><h2>{typeOf(d.letter_type).label}</h2><span className="hint">{initial?.is_final ? `נשלח${initial.finalized_at ? ` · ${fmtStamp(initial.finalized_at)}` : ''}` : 'טיוטה'}</span></div>
        </div>
        <span className="save-state" aria-live="polite">{saveState === 'נשמר' && <Icon name="check" />}{saveState}</span>
        <button type="button" className="btn btn-sm btn-ghost studio-focus" onClick={() => setFocus(!focus)} aria-pressed={focus}><Icon name={focus ? 'x' : 'externalLink'} size={15} />{focus ? 'יציאה ממסך מלא' : 'מסך מלא'}</button>
      </div>
      {initial?.is_final && <div className="callout"><div><Icon name="checkCircle" />נשלחה גרסה סופית. שינויים יגיעו למפנה רק אחרי ״עדכון המכתב הסופי״.</div></div>}
      {cancelled && <div className="callout bad"><div><Icon name="x" />התור בוטל.</div></div>}

      <nav className="studio-panes" aria-label="מעבר בין חלקי העורך">
        <button type="button" aria-pressed={pane === 'letter'} onClick={() => setPane('letter')}><Icon name="file" size={16} />המכתב</button>
        {SIDE.map(([k, l, ic]) => (
          <button key={k} type="button" aria-pressed={pane === 'side' && side === k} onClick={() => { setSide(k); setPane('side'); }}><Icon name={ic} size={16} />{l}{k === 'ai' && ai.running && <span className="ais-live" />}</button>
        ))}
      </nav>

      <div className="studio-grid2">
        <div className="studio-main">
          {ai.running ? (
            <div className="rich"><div className="desk"><div className="page">{header}<div className="ai-live-tag"><span className="ais-dots"><i /><i /><i /></span>{ai.label || 'כותב'}…</div><pre className="ai-stream" aria-live="polite">{ai.text || 'מתחיל לכתוב…'}</pre>{footer}</div></div></div>
          ) : (
            <RichEditor
              ref={editor}
              html={html}
              onChange={onBody}
              readOnly={cancelled}
              placeholder="כתבו כאן את המכתב, או תנו ל״סטודיו AI״ לנסח אותו…"
              header={header}
              footer={footer}
              extraTools={<Dictate onText={(t) => editor.current?.insertText(t + ' ')} label="הכתבה" />}
            />
          )}
        </div>

        <aside className="studio-side">
          <div className={`sp sp-top${side === 'ai' ? ' sp-ai' : ''}${ai.bad && side === 'ai' ? ' bad' : ''}`}>
            <nav className="sp-tabs" aria-label="כלי העורך">
              {SIDE.map(([k, l, ic]) => (
                <button key={k} type="button" aria-pressed={toolsOpen && side === k} onClick={() => { if (toolsOpen && side === k) setToolsOpen(false); else { setSide(k); setToolsOpen(true); } }}><Icon name={ic} size={15} />{l}{k === 'ai' && ai.running && <span className="ais-live" />}{k === 'exam' && d.exam_notes.trim() && <span className="sp-dot" />}</button>
              ))}
              <button type="button" className="sp-fold" onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen}><Icon name="chevron" size={15} className={toolsOpen ? 'up' : 'down'} />{toolsOpen ? 'הסתרה' : 'הצגה'}</button>
            </nav>
            <div className={`sp-body${toolsOpen ? '' : ' folded'}`}>
            {side === 'ai' && (<>
            <label className="ais-ins" htmlFor="aiIns">
              <span className="ais-lbl">מה לכתוב או להדגיש? <small>לא חובה · אפשר להכתיב</small><Dictate onText={(t) => setOpts((o) => ({ ...o, instructions: o.instructions ? `${o.instructions} ${t}` : t }))} label="הכתבה" /></span>
              <AutoText id="aiIns" minRows={3} value={opts.instructions} onChange={(e) => setOpts({ ...opts, instructions: e.target.value })} disabled={ai.running}
                placeholder="למשל: להדגיש קשר סיבתי לתאונה, נכות 10% לפי סעיף 37(7)(ב), לסיים בהמלצה לפיזיותרפיה" />
            </label>
            {paper.prevLetters && paper.prevLetters.length > 0 && (
              <label className="ais-hist">
                <input type="checkbox" checked={opts.withHistory} onChange={(e) => setOpts({ ...opts, withHistory: e.target.checked })} disabled={ai.running} />
                <span><b>לשלב את הרקע מהביקור הקודם</b><small>{paper.prevLetters.map((p) => `${p.label} · ${fmtDate(p.date)}`).join(' | ')}</small></span>
              </label>
            )}
            <div className="ais-row">
            <div className="ais-len" role="radiogroup" aria-label="אורך">
              {([['short', 'תמציתי'], ['normal', 'רגיל'], ['long', 'מפורט']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={opts.length === k} className={opts.length === k ? 'on' : ''} onClick={() => setOpts({ ...opts, length: k })} disabled={ai.running}>{l}</button>
              ))}
            </div>
            <button type="button" className="btn btn-primary ais-go" onClick={preview ? undefined : runAI} disabled={ai.running || cancelled}>
              <Icon name="sparkles" />{ai.running && ai.label === 'מנסח טיוטה מלאה' ? 'מנסח…' : hasBody ? 'ניסוח מחדש מהתיק' : 'ניסוח טיוטה מלאה'}
            </button>
            </div>
            {hasBody && (
              <div className="ais-refine">
                <span className="ais-sub">שיפור הטיוטה הקיימת</span>
                <div className="ais-chips">
                  {REFINES.map((r) => (
                    <button key={r.key} type="button" onClick={preview ? undefined : () => refine(r.key)} disabled={ai.running || cancelled}><Icon name={r.icon} size={14} />{r.label}</button>
                  ))}
                  {opts.instructions.trim() && <button type="button" className="hot" onClick={preview ? undefined : () => refine('custom')} disabled={ai.running || cancelled}><Icon name="send" size={14} />ביצוע ההנחיות שכתבתי</button>}
                </div>
              </div>
            )}
            <p className={`ais-note ${ai.bad ? 'err' : 'hint'}`} aria-live="polite">{ai.running && <span className="ais-dots"><i /><i /><i /></span>}{ai.note || `ה־AI קורא ${docCount ? `${docCount} מסמכים` : 'את התיק'}, את הבקשה ואת הממצאים, וכותב מסמך מלא לפי סוג המכתב.`}</p>
            <div className="row" style={{ gap: 8 }}>
              {ai.running && <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}><Icon name="x" size={14} />עצירה</button>}
              {!ai.running && undo.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={undoAI}><Icon name="undo" size={14} />ביטול השינוי ({undo[0].label})</button>}
            </div>
            </>)}
            {side === 'exam' && (<>
            <div className="sp-h"><b>ממצאי הבדיקה</b><Dictate onText={appendExam} label="הכתבה" /></div>
            <AutoText id="ltExam" minRows={5} value={d.exam_notes} onChange={(e) => update({ exam_notes: e.target.value })} aria-label="ממצאי הבדיקה"
              placeholder="לדוגמה: הליכה תקינה. כוח 5/5 בארבע הגפיים. ירידה בתחושה בדרמטום C6 משמאל." />
            <span className="hint">כותבים בקיצור או מכתיבים. ה־AI ישלב את זה בניסוח מלא.</span>
            </>)}
            {side === 'details' && (<>
            <label className="field" htmlFor="ltType"><span>סוג המכתב</span>
              <select id="ltType" value={d.letter_type} onChange={(e) => update({ letter_type: e.target.value as ReferralType })}>
                {(Object.keys(TYPES) as ReferralType[]).map((k) => <option key={k} value={k}>{typeOf(k).label}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="ltTitle"><span>כותרת המסמך <small>ריק = כותרת לפי סוג המכתב</small></span>
              <input id="ltTitle" value={d.doc_title} onChange={(e) => update({ doc_title: e.target.value })} placeholder={defaultTitle} disabled={ai.running} />
            </label>
            <label className="field" htmlFor="ltDate"><span>תאריך המסמך <small>נשאר קבוע גם כשעורכים את המסמך שוב</small></span>
              <span className="lt-date">
                <input id="ltDate" type="date" value={d.letter_date} max={todayIL()} onChange={(e) => e.target.value && update({ letter_date: e.target.value })} disabled={ai.running} />
                {d.letter_date !== todayIL() && <button type="button" className="btn btn-sm" onClick={() => update({ letter_date: todayIL() })} disabled={ai.running}>עדכון להיום</button>}
              </span>
            </label>
            <label className="field" htmlFor="ltTo"><span>לכבוד <small>כמה שורות? הפרידו ב־ |</small></span>
              <input id="ltTo" value={d.recipient} onChange={(e) => update({ recipient: e.target.value })} placeholder="המוסד לביטוח לאומי | סניף חדרה" disabled={ai.running} />
            </label>
            </>)}
            {side === 'tools' && (<>
            <div className="tool-list">
              {(paper.prevLetters ?? []).map((p) => (
                <button key={p.date + p.label} type="button" className="btn" disabled={ai.running || cancelled}
                  onClick={() => editor.current?.insertHtml(textToHtml(`רקע מביקור קודם (${fmtDate(p.date)}):\n${p.text}`))}><Icon name="clock" />הוספת המסמך מהביקור ב־{fmtDate(p.date)}</button>
              ))}
              <button type="button" className="btn" onClick={() => editor.current?.insertHtml(textToHtml(outlineFor(d.letter_type)))} disabled={ai.running || cancelled}><Icon name="list" />מבנה מוכן לפי סוג המכתב</button>
              <TemplatePicker letterType={d.letter_type} onInsert={(t) => editor.current?.insertHtml(textToHtml(t))} selection={() => editor.current?.selectedText() ?? ''} />
              {diagnoses.length > 0 && (
                <button type="button" className="btn" disabled={ai.running || cancelled} onClick={() => editor.current?.insertHtml(
                  `<h3>אבחנות:</h3><ul>${[...diagnoses].sort((a, b) => Number(b.primary) - Number(a.primary)).map((x) => `<li>${x.code ? `${escHtml(x.code)} · ` : ''}${escHtml(x.name)}</li>`).join('')}</ul>`,
                )}><Icon name="stethoscope" />הכנסת האבחנות ({diagnoses.length})</button>
              )}
              {placeholders > 0 && <button type="button" className="btn btn-warn" onClick={() => editor.current?.focusNextPlaceholder()}><Icon name="flag" />{placeholders} סימונים להשלמה · מעבר לבא</button>}
            </div>
            </>)}
            </div>
          </div>
        </aside>
      </div>

      <div className="studio-actions">
        <div className="row" style={{ gap: 8 }}>
          {placeholders > 0 ? <span className="badge b-draft">{placeholders} סימונים להשלמה</span> : hasBody ? <span className="badge b-done">מוכן לשליחה</span> : <span className="hint">המכתב ריק</span>}
          {finalState.msg && <span className={finalState.ok ? 'ok-msg' : 'err'} role="status">{finalState.msg}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={preview ? undefined : printLetter} disabled={ai.running}><Icon name="printer" />הדפסה / PDF</button>
          {finalState.armed && <button type="button" className="btn btn-ghost" onClick={() => setFinalState({ armed: false, ok: false, msg: '' })}>ביטול</button>}
          <button type="button" className={`btn btn-ok${finalState.armed ? ' armed' : ''}`} onClick={preview ? undefined : () => finalize()} disabled={ai.running || cancelled}>
            <Icon name="eye" />{initial?.is_final ? 'תצוגה ועדכון המכתב הסופי' : 'תצוגה לפני שליחה'}
          </button>
        </div>
      </div>
      {review && createPortal(
        <div className="review-wrap" role="dialog" aria-modal="true" aria-label="תצוגה לפני שליחה">
          <div className="review-scrim" onClick={() => setReview(null)} />
          <div className="review">
            <div className="review-doc">
              <iframe title="המסמך כפי שיישלח" src={`/letters/${appointmentId}/print?v=preview&embed=1&t=${review}`} />
            </div>
            <aside className="review-side">
              <div className="review-h"><Icon name="eye" /><div><b>בדיקה אחרונה לפני שליחה</b><small>כך בדיוק המסמך יודפס וישלח</small></div><button type="button" className="fc-x" aria-label="סגירה" onClick={() => setReview(null)}><Icon name="x" /></button></div>
              <ul className="review-checks">
                <li><Icon name="checkCircle" size={16} /><span>{typeOf(d.letter_type).label}{paper.title ? ` · ${paper.title}` : ''}</span></li>
                <li><Icon name="checkCircle" size={16} /><span>לכבוד: {d.recipient ? d.recipient.split('|').join(', ') : <em>ללא נמען</em>}</span></li>
                <li><Icon name="checkCircle" size={16} /><span>{paper.sign_final !== false ? 'עם החתימה והחותמת שלך' : 'בלי חתימה דיגיטלית'}</span></li>
              </ul>
              {!initial?.is_final && (
                <div className="review-to">
                  <span className="eyebrow">יישלח במייל אל</span>
                  {sendTo.length ? sendTo.map((x) => <div key={x}><Icon name="mail" size={14} />{x}</div>) : <div className="hint">המכתב יהיה זמין בתיק</div>}
                </div>
              )}
              {payNeeded && (
                <div className={`rv-pay${payReady ? ' ok' : ''}`}>
                  <span className="eyebrow">תשלום · חובה לבחור לפני שליחה</span>
                  <div className="rv-pay-ch" role="radiogroup" aria-label="תשלום">
                    <button type="button" role="radio" aria-checked={pay.choice === 'paid'} className={pay.choice === 'paid' ? 'on' : ''} onClick={() => setPay({ ...pay, choice: 'paid' })}><Icon name="wallet" size={16} />שולם</button>
                    <button type="button" role="radio" aria-checked={pay.choice === 'free'} className={pay.choice === 'free' ? 'on' : ''} onClick={() => setPay({ ...pay, choice: 'free' })}><Icon name="check" size={16} />ללא תשלום</button>
                    <button type="button" role="radio" aria-checked={pay.choice === 'request'} className={`wide${pay.choice === 'request' ? ' on' : ''}`} onClick={() => setPay({ ...pay, choice: 'request' })}><Icon name="clock" size={16} />בקשת תשלום · שליחה אחרי אישור</button>
                  </div>
                  {pay.choice === 'paid' && (payment?.paidInFull
                    ? <p className="hint">התשלום כבר נרשם במלואו בתיק.</p>
                    : <>
                      <label className="field"><span>כמה התקבל (₪)</span><input inputMode="decimal" dir="ltr" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></label>
                      <div className="pp-methods" role="radiogroup" aria-label="אמצעי תשלום">
                        {(['transfer', 'bit', 'card', 'cash', 'check', 'other'] as PayMethod[]).map((m) => (
                          <button key={m} type="button" role="radio" aria-checked={pay.method === m} className={pay.method === m ? 'on' : ''} onClick={() => setPay({ ...pay, method: m })}>{PAY_METHODS[m]}</button>
                        ))}
                      </div>
                    </>)}
                  {pay.choice === 'free' && <p className="hint">המסמך יישלח בלי חיוב.</p>}
                  {pay.choice === 'request' && <p className="hint">המסמך נחתם ונשמר. נשלחת בקשת תשלום, והמסמך יישלח אוטומטית ברגע שתאשר את התשלום ב״אישור תשלומים״.</p>}
                </div>
              )}
              <div className="review-actions">
                <button type="button" className="btn btn-ok btn-lg" disabled={!payReady} onClick={() => finalize(true)}><Icon name="send" />{initial?.is_final ? 'אישור ועדכון' : !payReady ? 'בחרו קודם: שולם, ללא תשלום או בקשת תשלום' : pay.choice === 'request' && payNeeded ? 'חתימה ושליחת בקשת תשלום' : 'אישור, חתימה ושליחה'}</button>
                <a className="btn" href={`/letters/${appointmentId}/print?v=preview`} target="_blank" rel="noopener"><Icon name="printer" />פתיחה להדפסה</a>
                <button type="button" className="btn btn-ghost" onClick={() => setReview(null)}>חזרה לעריכה</button>
              </div>
            </aside>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
