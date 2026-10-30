import Link from 'next/link';
import Icon from '@/components/Icon';
import { typeOf, type ReferralType, type Settings } from '@/lib/constants';
import { bodyBlocks } from '@/lib/letter';
import { docCss, docHtml } from '@/lib/letterDoc';
import { isRich, sanitizeHtml, stripMarker } from '@/lib/richtext';

type Letter = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string };

const escT = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The official A4 document on Dr. Hanoch's letterhead, printed by the browser (or saved as PDF). */
export default function LetterPaper({ settings: s, letter, patient, backHref, draft, printButton, title, visitDate, signature, embed, visits }: {
  settings: Settings; letter: Letter; patient: { name: string; idNumber: string; dob: string | null };
  backHref: string; draft?: boolean; printButton: React.ReactNode; title?: string; visitDate?: string | null; signature?: string | null; embed?: boolean; visits?: string[];
}) {
  const body = isRich(letter.body)
    ? sanitizeHtml(stripMarker(letter.body))
    : bodyBlocks(letter.body).map((b) => (b.kind === 'h' ? `<h3>${escT(b.text)}</h3>` : b.kind === 'li' ? `<ul><li>${escT(b.text)}</li></ul>` : `<p>${escT(b.text)}</p>`)).join('');
  const html = docHtml({
    settings: s, title: title || typeOf(letter.letter_type).label, baseType: letter.letter_type, date: letter.letter_date, visitDate,
    recipient: letter.recipient, subject: letter.subject, patient, bodyHtml: body, banner: '/brand/letterhead.jpg', signature, draft, visits,
  });
  return <PaperFrame backHref={backHref} printButton={printButton} hint={draft ? 'זו טיוטה' : ''} html={html} embed={embed} />;
}

/** The screen around a printable document: toolbar, grey desk, the A4 sheet. */
export function PaperFrame({ backHref, printButton, hint, html, embed }: { backHref: string; printButton: React.ReactNode; hint?: string; html: string; embed?: boolean }) {
  return (
    <div className="letter-view">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@700&display=swap');
        @page { size: A4; margin: 10mm 14mm 10mm 14mm; }
        ${docCss('.paper')}
        .letter-view { background: #E6E9EF; min-height: 100vh; padding: 0 0 40px; }
        ${embed ? '.letter-view { padding: 0 0 16px; } .paper { margin-top: 12px !important; }' : ''}
        .paper { width: 210mm; min-height: 297mm; margin: 16px auto 0; background: #fff; padding: 10mm 14mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); display: flex; flex-direction: column; }
        .paper table.ldoc { flex: 1; }
        .paper table.ldoc > tbody > tr { height: 100%; } .paper table.ldoc > thead > tr, .paper table.ldoc > tfoot > tr { height: 1px; } .paper table.ldoc td { vertical-align: top; }
        .paper .doc-foot-space { height: 4mm; }
        .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px 16px 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        @media print {
          .letter-view { background: #fff; padding: 0; }
          .paper { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; display: block; }
          .paper .doc-foot-space { height: 30mm; }
        }
        @media (max-width: 820px) { .paper { width: auto; margin: 16px; padding: 14px; min-height: 0; } }
      `}</style>
      {!embed && <div className="toolbar no-print">
        <Link href={backHref} className="btn btn-ghost"><Icon name="arrowLeft" />חזרה לתיק</Link>
        <div className="row">
          <span className="hint">בחלון ההדפסה בחרו ״שמירה כ־PDF״{hint ? ` · ${hint}` : ''}</span>
          {printButton}
        </div>
      </div>}
      <article className="paper" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
