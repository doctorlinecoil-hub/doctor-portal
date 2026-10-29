import Link from 'next/link';
import Icon from '@/components/Icon';
import { typeOf, type ReferralType, type Settings } from '@/lib/constants';
import { age, fmtDate } from '@/lib/dates';
import { LEGAL_DECLARATION, bodyBlocks } from '@/lib/letter';
import { isRich, sanitizeHtml, stripMarker } from '@/lib/richtext';

type Letter = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string };

const cssString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';

/** The official A4 letter, printed by the browser to PDF. */
export default function LetterPaper({ settings: s, letter, patient, backHref, draft, printButton }: {
  settings: Settings; letter: Letter; patient: { name: string; idNumber: string; dob: string | null };
  backHref: string; draft?: boolean; printButton: React.ReactNode;
}) {
  const ag = age(patient.dob);
  const footer = [s.lh_name, s.lh_address].filter(Boolean).join(' · ');
  const recipients = letter.recipient.split('|').map((x) => x.trim()).filter(Boolean);
  const titles = s.lh_titles.split('\n').filter(Boolean);
  return (
    <div className="letter-view">
      <style>{`
        @page { size: A4; margin: 16mm 18mm 18mm 18mm;
          @bottom-left { content: "עמוד " counter(page) " מתוך " counter(pages); font: 10px Arial, sans-serif; color: #555; }
          @bottom-right { content: ${cssString(footer)}; font: 10px Arial, sans-serif; color: #555; } }
        .letter-view { background: #E9EDF2; min-height: 100vh; padding: 0 0 40px; }
        .paper { width: 210mm; min-height: 297mm; margin: 16px auto 0; background: #fff; color: #111; padding: 16mm 18mm; box-shadow: 0 2px 14px rgba(0,0,0,.18);
          font-family: Arial, "Noto Sans Hebrew", "Segoe UI", sans-serif; font-size: 11pt; line-height: 1.6; direction: rtl; text-align: right; }
        .paper * { color: inherit; }
        .lt-head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #0B7A75; padding-bottom: 10px; margin-bottom: 16px; }
        .lt-name { font-size: 20pt; font-weight: 700; color: #0B4A46 !important; line-height: 1.2; }
        .lt-small { font-size: 9.5pt; color: #333 !important; line-height: 1.45; }
        .lt-contact { text-align: left; max-width: 75mm; }
        .lt-date { text-align: left; margin-bottom: 8px; }
        .lt-to { margin-bottom: 10px; }
        .lt-subj { font-weight: 700; margin: 4px 0 10px; }
        .lt-pt { display: flex; flex-wrap: wrap; gap: 2px 18px; background: #F1F5F4; border: 1px solid #D9E1DF; padding: 5px 9px; margin-bottom: 12px; font-size: 10.5pt; }
        .lt-h { font-weight: 700; margin: 10px 0 2px; break-after: avoid; }
        .lt-p { margin: 0 0 5px; }
        .lt-li { margin: 0 0 3px; padding-right: 14px; position: relative; }
        .lt-li::before { content: "•"; position: absolute; right: 2px; }
        .lt-decl { margin-top: 14px; padding: 7px 9px; border: 1px solid #999; font-size: 10pt; break-inside: avoid; }
        .lt-sign { margin-top: 20px; break-inside: avoid; }
        .paper .lt-rich span[style*="background-color: #FDECC8"], .paper .lt-rich span[style*="rgb(253, 236, 200)"] { background: transparent !important; }
        .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 16px 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        @media print {
          .letter-view { background: #fff; padding: 0; }
          .paper { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
        }
        @media (max-width: 820px) { .paper { width: auto; margin: 16px; padding: 18px; min-height: 0; } }
      `}</style>
      <div className="toolbar no-print">
        <Link href={backHref} className="btn btn-ghost"><Icon name="arrowLeft" />חזרה לתיק</Link>
        <div className="row">
          <span className="hint">בחלון ההדפסה בחרו ״שמירה כ־PDF״{draft ? ' · זו טיוטה' : ''}</span>
          {printButton}
        </div>
      </div>
      <article className="paper" aria-label={typeOf(letter.letter_type)?.label}>
        <header className="lt-head">
          <div>
            <div className="lt-name">{s.lh_name}</div>
            {titles.map((t) => <div className="lt-small" key={t}>{t}</div>)}
            {s.lh_licenses && <div className="lt-small">{s.lh_licenses}</div>}
          </div>
          <div className="lt-small lt-contact">
            {s.lh_address && <div>{s.lh_address}</div>}
            {s.lh_phone && <div>טל׳ {s.lh_phone}</div>}
            {s.lh_email && <div>{s.lh_email}</div>}
          </div>
        </header>
        <div className="lt-date">תאריך: {fmtDate(letter.letter_date)}</div>
        {recipients.length > 0 && (
          <div className="lt-to"><div>לכבוד</div>{recipients.map((r) => <div key={r}><b>{r}</b></div>)}</div>
        )}
        {letter.subject && <div className="lt-subj">הנדון: <u>{letter.subject}</u></div>}
        <div className="lt-pt">
          <span><b>שם:</b> {patient.name}</span>
          <span><b>ת.ז.:</b> {patient.idNumber}</span>
          {patient.dob && <span><b>תאריך לידה:</b> {fmtDate(patient.dob)}{ag != null ? ` (גיל ${ag})` : ''}</span>}
        </div>
        {isRich(letter.body)
          ? <div className="lt-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(stripMarker(letter.body)) }} />
          : bodyBlocks(letter.body).map((b, i) => <div key={i} className={`lt-${b.kind}`}>{b.text}</div>)}
        {letter.letter_type === 'legal' && <div className="lt-decl">{LEGAL_DECLARATION}</div>}
        <div className="lt-sign">
          <div>בכבוד רב,</div>
          <div style={{ fontWeight: 700, marginTop: 16 }}>{s.lh_name}</div>
          {titles[0] && <div className="lt-small">{titles[0]}</div>}
          {s.lh_licenses && <div className="lt-small">{s.lh_licenses}</div>}
          <div style={{ marginTop: 24 }}>חתימה וחותמת: ____________________</div>
        </div>
      </article>
    </div>
  );
}
