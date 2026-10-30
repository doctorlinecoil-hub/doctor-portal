import { typeOf, type ReferralType } from '@/lib/constants';
import { age, fmtDate } from '@/lib/dates';
import { LEGAL_DECLARATION, bodyBlocks } from '@/lib/letter';

export type PaperInfo = {
  lh_name: string; lh_titles: string; lh_licenses: string; lh_address: string; lh_phone: string; lh_email: string;
  lh_footer?: string; lh_cv?: string; use_banner?: boolean; cv_in_opinions?: boolean; sign_final?: boolean;
  /** the clinic's name for the service (the document's title) */
  title?: string; titleType?: string | null; visitDate?: string | null; visits?: string[]; prevLetters?: { date: string; label: string; text: string }[];
  patient: { name: string; idNumber: string; dob: string | null };
};

/** Splits a line into text and highlighted "[להשלמת הרופא…]" markers. */
function marks(text: string) {
  const parts = text.split(/(\[(?:להשלמת|לאישור|לבדיקת) הרופא[^\]]*\])/g);
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

/** A live A4 preview of the letter on the clinic's letterhead (same layout as the printed letter). */
export default function PaperPreview({ info, type, recipient, body, date, onPick }: {
  info: PaperInfo; type: ReferralType; recipient: string; subject: string; body: string; date: string;
  onPick?: (heading: string) => void;
}) {
  const titles = info.lh_titles.split('\n').filter(Boolean);
  const to = recipient.split('|').map((x) => x.trim()).filter(Boolean);
  const ag = age(info.patient.dob);
  const blocks = bodyBlocks(body);
  return (
    <article className="sheet" aria-label={`תצוגה מקדימה: ${typeOf(type).label}`}>
      <header className="lt-head">
        <div>
          <div className="lt-name">{info.lh_name}</div>
          {titles.map((t) => <div className="lt-small" key={t}>{t}</div>)}
          {info.lh_licenses && <div className="lt-small">{info.lh_licenses}</div>}
        </div>
        <div className="lt-small lt-contact">
          {info.lh_address && <div>{info.lh_address}</div>}
          {info.lh_phone && <div>טל׳ {info.lh_phone}</div>}
          {info.lh_email && <div>{info.lh_email}</div>}
        </div>
      </header>
      <div className="lt-date">תאריך: {fmtDate(date)}</div>
      {to.length > 0 && <div className="lt-to"><div>לכבוד</div>{to.map((r) => <div key={r}><b>{r}</b></div>)}</div>}
      <div className="lt-pt">
        <span><b>שם:</b> {info.patient.name}</span>
        <span><b>ת.ז.:</b> {info.patient.idNumber}</span>
        {info.patient.dob && <span><b>תאריך לידה:</b> {fmtDate(info.patient.dob)}{ag != null ? ` (גיל ${ag})` : ''}</span>}
      </div>
      {blocks.length === 0 ? <p className="sheet-empty">כאן יופיע המכתב תוך כדי כתיבה.</p> : blocks.map((b, i) => (
        b.kind === 'h'
          ? <div key={i} className={`lt-h${onPick ? ' pick' : ''}`} onClick={onPick ? () => onPick(b.text) : undefined}>{b.text}</div>
          : <div key={i} className={`lt-${b.kind}`}>{marks(b.text)}</div>
      ))}
      {type === 'legal' && <div className="lt-decl">{LEGAL_DECLARATION}</div>}
      <div className="lt-sign">
        <div>בכבוד רב,</div>
        <div style={{ fontWeight: 700, marginTop: 12 }}>{info.lh_name}</div>
        {titles[0] && <div className="lt-small">{titles[0]}</div>}
        {info.lh_licenses && <div className="lt-small">{info.lh_licenses}</div>}
      </div>
    </article>
  );
}
