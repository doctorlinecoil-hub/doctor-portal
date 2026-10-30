import { type ReferralType, type Settings } from './constants';
import { age, fmtDate } from './dates';
import { LEGAL_DECLARATION } from './letter';

/*
 * One layout for every document the clinic produces (letters, opinions, prescriptions), on Dr. Hanoch's
 * official letterhead: the navy banner on top of every page, the details at the bottom of every page,
 * the title in the middle, and his signature on final documents.
 * Used by the print pages and by the PDF attachments, so what the doctor sees is exactly what is sent.
 * Everything that comes from users is escaped here; bodyHtml must already be sanitized.
 */

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type DocInput = {
  settings: Pick<Settings, 'lh_name' | 'lh_titles' | 'lh_licenses' | 'lh_address' | 'lh_phone' | 'lh_email' | 'lh_footer' | 'lh_cv' | 'use_banner' | 'cv_in_opinions'>;
  /** the document's heading, e.g. "סיכום ביקור" */
  title: string;
  baseType?: ReferralType | null;
  date: string;
  visitDate?: string | null;
  recipient?: string;
  subject?: string;
  patient: { name: string; idNumber: string; dob: string | null };
  bodyHtml: string;
  /** a URL or data: URI of the banner (null = the text letterhead) */
  banner: string | null;
  /** a data: URI of the signature, only on final documents */
  signature?: string | null;
  /** a line to sign by hand (prescriptions) */
  signLine?: boolean;
  /** dates of the patient's earlier visits: the document says it is a follow-up visit */
  visits?: string[];
  draft?: boolean;
};

export const isOpinion = (t?: ReferralType | null) => t === 'legal' || t === 'nii';

/** Lines ending with ":" are headings. */
export function cvHtml(cv: string) {
  return cv.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => (/[:：]$/.test(l) && l.length < 60 ? `<div class="cv-h">${esc(l)}</div>` : `<div class="cv-l">${esc(l)}</div>`)).join('');
}

export function docHtml(d: DocInput) {
  const s = d.settings;
  const ag = age(d.patient.dob);
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  const to = (d.recipient || '').split('|').map((x) => x.trim()).filter(Boolean);
  const opinion = isOpinion(d.baseType);

  const head = headHtml(s, d.banner);

  // a title the doctor typed wins over the default one
  const title = d.subject?.trim() || (opinion ? 'חוות דעת רפואית' : d.title);
  const intro = opinion
    ? `<p class="doc-intro">הנני מגיש בזאת את חוות דעתי הרפואית${d.visitDate ? ` לאחר בדיקתי ב־${esc(fmtDate(d.visitDate))}` : ''}.</p>${s.cv_in_opinions && s.lh_cv ? `<div class="doc-cv">${cvHtml(s.lh_cv)}</div>` : ''}`
    : '';

  return `
<table class="ldoc"><thead><tr><td><div class="doc-head">${head}</div></td></tr></thead>
<tbody><tr><td class="doc-main">
  ${d.draft ? '<div class="doc-draft">טיוטה</div>' : ''}
  <div class="cl-date">תאריך: ${esc(fmtDate(d.date))}</div>
  ${to.length ? `<div class="cl-to"><div>לכבוד</div>${to.map((r) => `<div><b>${esc(r)}</b></div>`).join('')}</div>` : ''}
  <h1 class="cl-title">${esc(title)}</h1>
  <div class="cl-ptw"><div class="cl-pt"><span><b>שם מלא:</b> ${esc(d.patient.name)}</span>${d.patient.idNumber ? `<span><b>ת.ז.:</b> ${esc(d.patient.idNumber)}</span>` : ''}${d.patient.dob ? `<span><b>תאריך לידה:</b> ${esc(fmtDate(d.patient.dob))}${ag != null ? ` (גיל ${ag})` : ''}</span>` : ''}</div>${d.visits?.length ? `<div class="cl-rv"><b>ביקור חוזר</b> · ${d.visits.length === 1 ? 'ביקור קודם' : 'ביקורים קודמים'} במרפאה: ${d.visits.map((x) => esc(fmtDate(x))).join(' · ')}</div>` : ''}</div>
  ${intro}
  <div class="doc-body">${d.bodyHtml}</div>
  ${d.baseType === 'legal' ? `<div class="doc-decl">${esc(LEGAL_DECLARATION)}</div>` : ''}
  <div class="of-sign">
    <div class="of-doc"><div class="of-regards">בברכה,</div><b>${esc(s.lh_name)}</b>${d.signature ? '' : `${titles[0] ? `<div>${esc(titles[0])}</div>` : ''}${s.lh_licenses ? `<div>${esc(s.lh_licenses)}</div>` : ''}`}</div>
    ${d.signature ? '<div class="of-signed">חתום דיגיטלית · החתימה והחותמת בתחתית כל עמוד</div>' : '<div class="of-stamp"><div class="of-sigspace"></div><div class="of-line">חתימה וחותמת הרופא</div></div>'}
  </div>
</td></tr></tbody>
<tfoot><tr><td><div class="doc-foot-space"></div></td></tr></tfoot></table>
${footHtml(s, d.signature)}`;
}

function headHtml(s: DocInput['settings'], banner: string | null) {
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  return banner && s.use_banner
    ? `<img class="doc-banner" src="${esc(banner)}" alt="${esc(s.lh_name)}">`
    : `<div class="doc-texthead"><div><div class="th-name">${esc(s.lh_name)}</div>${titles.map((t) => `<div class="th-small">${esc(t)}</div>`).join('')}</div><div class="th-small th-contact">${[s.lh_licenses, s.lh_address, s.lh_phone && `טל׳ ${s.lh_phone}`, s.lh_email].filter(Boolean).map((x) => `<div>${esc(String(x))}</div>`).join('')}</div></div>`;
}

function footHtml(s: DocInput['settings'], signature?: string | null) {
  const footer = (s.lh_footer || [s.lh_name, s.lh_licenses, s.lh_address, s.lh_phone].filter(Boolean).join('\n')).split('\n').filter(Boolean);
  const lines = `<div class="foot-lines">${footer.map((l, i) => `<div${i === 0 ? ' class="f1"' : ''}>${esc(l)}</div>`).join('')}</div>`;
  // signed documents carry the doctor's signature and stamp on every page
  return `<div class="doc-foot${signature ? ' signed' : ''}">${lines}${signature ? `<img class="foot-sig" src="${esc(signature)}" alt="חתימה וחותמת">` : ''}</div>`;
}

export type RxDocItem = { name: string; form?: string; strength?: string; dose: string; frequency: string; duration: string; quantity: string; notes?: string };

/**
 * A prescription laid out like an official prescription form: the letterhead, a numbered and dated header,
 * the patient's details in a box, the drugs one by one under ℞, a closing line (nothing can be added after it),
 * and the doctor's details with signature and stamp.
 */
export function rxDocHtml(d: {
  settings: DocInput['settings'];
  rxNo: number | string | null;
  date: string;
  patient: DocInput['patient'];
  items: RxDocItem[];
  notes: string;
  banner: string | null;
  signature?: string | null;
}) {
  const s = d.settings;
  const ag = age(d.patient.dob);
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  const no = d.rxNo == null || d.rxNo === '' ? 'יוקצה בשמירה' : String(d.rxNo);
  const items = d.items.map((i, n) => {
    const sig = [i.dose, i.frequency, i.duration && `למשך ${i.duration}`].filter(Boolean).join(' · ');
    return `<li class="rx-it"><div class="rx-it-n">${n + 1}</div><div class="rx-it-b">
      <div class="rx-it-name">${esc(i.name)}</div>
      ${i.form || i.strength ? `<div class="rx-it-form">${[i.strength && `<span class="rx-it-str">${esc(i.strength)}</span>`, i.form && esc(i.form)].filter(Boolean).join(' · ')}</div>` : ''}
      <div class="rx-it-sig"><span>אופן השימוש:</span> ${sig ? esc(sig) : '—'}</div>
      ${i.quantity ? `<div class="rx-it-q"><span>כמות לניפוק:</span> ${esc(i.quantity)}</div>` : ''}
      ${i.notes ? `<div class="rx-it-note">${esc(i.notes)}</div>` : ''}
    </div></li>`;
  }).join('');
  return `
<table class="ldoc"><thead><tr><td><div class="doc-head">${headHtml(s, d.banner)}</div></td></tr></thead>
<tbody><tr><td class="doc-main">
  <div class="rxo-top">
    <div><div class="rxo-title">מרשם רופא</div><div class="rxo-sub">Medical Prescription</div></div>
    <div class="rxo-meta"><div><span>מס׳ מרשם</span><b>${esc(no)}</b></div><div><span>תאריך</span><b>${esc(fmtDate(d.date))}</b></div></div>
  </div>
  <div class="rxo-pt">
    <div><span>שם המטופל/ת</span><b>${esc(d.patient.name) || '&nbsp;'}</b></div>
    <div><span>מס׳ זהות</span><b>${esc(d.patient.idNumber) || '&nbsp;'}</b></div>
    <div><span>תאריך לידה</span><b>${d.patient.dob ? esc(fmtDate(d.patient.dob)) : '&nbsp;'}</b></div>
    <div><span>גיל</span><b>${ag != null ? ag : '&nbsp;'}</b></div>
  </div>
  <div class="rxo-rx"><div class="rxo-sym">℞</div><ol class="rxo-list">${items || '<li class="rx-empty">—</li>'}</ol></div>
  <div class="rxo-end">— סוף המרשם · ${d.items.length} ${d.items.length === 1 ? 'פריט' : 'פריטים'} —</div>
  ${d.notes ? `<div class="rxo-notes"><b>הערות:</b> ${esc(d.notes)}</div>` : ''}
  <div class="rxo-sign">
    <div class="rxo-doc"><b>${esc(s.lh_name)}</b>${titles[0] ? `<div>${esc(titles[0])}</div>` : ''}${s.lh_licenses ? `<div>${esc(s.lh_licenses)}</div>` : ''}</div>
    <div class="rxo-stamp">${d.signature ? `<img class="doc-sig" src="${esc(d.signature)}" alt="חתימה">` : '<div class="rxo-sigspace"></div>'}<div class="rxo-line">חתימה וחותמת הרופא</div></div>
  </div>
</td></tr></tbody>
<tfoot><tr><td><div class="doc-foot-space"></div></td></tr></tfoot></table>
${footHtml(s)}`;
}

/** The document's styles. With a scope, every rule is limited to that element (the print pages). */
export function docCss(scope = '') {
  const p = scope ? `${scope} ` : '';
  const root = scope || 'body';
  return `
${root} { font-family: "Noto Sans Hebrew", Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #111; direction: rtl; text-align: right; }
${p}table.ldoc { width: 100%; border-collapse: collapse; }
${p}table.ldoc > thead td, ${p}table.ldoc > tfoot td, ${p}table.ldoc > tbody > tr > td { padding: 0; }
${p}.doc-head { padding-bottom: 6mm; }
${p}.doc-banner { display: block; width: 100%; height: auto; }
${p}.doc-texthead { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #112243; padding-bottom: 8px; }
${p}.th-name { font-size: 20pt; font-weight: 700; color: #112243; }
${p}.th-small { font-size: 9.5pt; color: #333; }
${p}.th-contact { text-align: left; }
${p}.doc-main { padding: 0 2mm; position: relative; }
${p}.doc-draft { position: absolute; top: 40%; inset-inline: 0; text-align: center; font-size: 90pt; color: rgba(17, 34, 67, .06); font-weight: 700; transform: rotate(-20deg); pointer-events: none; }
${p}.doc-date { text-align: left; margin-bottom: 4mm; }
${p}.doc-to { margin-bottom: 4mm; }
${p}.doc-title { text-align: center; font-size: 15pt; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; margin: 2mm 0 4mm; color: #111; }
${p}.doc-subj { font-weight: 700; margin: 0 0 3mm; }
${p}.doc-pt { display: flex; flex-wrap: wrap; gap: 2px 18px; border-top: 1px solid #C9A43A; border-bottom: 1px solid #C9A43A; padding: 4px 2px; margin-bottom: 5mm; font-size: 10.5pt; }
${p}.doc-intro { margin: 0 0 3mm; }
${p}.doc-cv { margin: 0 0 5mm; font-size: 10.5pt; }
${p}.doc-cv .cv-h { font-weight: 700; text-decoration: underline; margin: 3mm 0 1mm; }
${p}.doc-cv .cv-l { margin: 0 0 1px; }
${p}.doc-body h2 { font-size: 13.5pt; margin: 5mm 0 1.5mm; }
${p}.doc-body h3 { font-size: 11.5pt; margin: 4mm 0 1mm; text-decoration: underline; }
${p}.doc-body h4 { font-size: 11pt; margin: 3mm 0 1mm; }
${p}.doc-body p { margin: 0 0 2mm; }
${p}.doc-body ul, ${p}.doc-body ol { margin: 0 0 2mm; padding-right: 7mm; }
${p}.doc-body table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; }
${p}.doc-body td, ${p}.doc-body th { border: 1px solid #9AA4B5; padding: 4px 6px; vertical-align: top; }
${p}.doc-body th { background: #F1F3F8; }
${p}.doc-body blockquote { margin: 2mm 0; padding: 1mm 4mm; border-right: 3px solid #C9A43A; color: #333; }
${p}.doc-body hr { border: 0; border-top: 1px solid #9AA4B5; margin: 4mm 0; }
${p}.doc-body font[size="2"] { font-size: 9pt; } ${p}.doc-body font[size="4"] { font-size: 13pt; } ${p}.doc-body font[size="5"] { font-size: 16pt; }
${p}.doc-body span[style*="background-color: #FDECC8"], ${p}.doc-body span[style*="rgb(253, 236, 200)"] { background: transparent !important; }
${p}.doc-decl { margin-top: 5mm; padding: 3mm; border: 1px solid #9AA4B5; font-size: 10pt; break-inside: avoid; }
${p}.doc-sign { margin-top: 8mm; break-inside: avoid; }
${p}.doc-sig { display: block; width: 52mm; height: auto; margin-top: 2mm; }
${p}.doc-signname { margin-top: 6mm; font-size: 10.5pt; }
${p}.doc-signline { margin-top: 10mm; }
${p}.doc-foot-space { height: 30mm; }
${p}.doc-foot { font-size: 9pt; line-height: 1.45; color: #1d2433; border-top: 1px solid #C9A43A; padding-top: 2mm; text-align: right; display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; }
${p}.foot-sig { height: 22mm; width: auto; flex: none; }
${p}.of-signed { font-size: 8.5pt; color: #6b7385; align-self: flex-end; }
${p}.doc-foot .f1 { font-weight: 700; }
${p}table.rx { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
${p}table.rx th { background: #F1F3F8; font-weight: 700; font-size: 10pt; text-align: right; }
${p}table.rx th, ${p}table.rx td { border: 1px solid #B6BFCD; padding: 6px 8px; vertical-align: top; }
${p}table.rx td.n, ${p}table.rx th.n { width: 26px; text-align: center; color: #555; }
${p}table.rx .sub { font-size: 9.5pt; color: #444; }
${p}table.rx tr { break-inside: avoid; }
${p}.rxo-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #112243; padding-bottom: 2.5mm; margin-bottom: 4mm; }
${p}.rxo-title { font-size: 19pt; font-weight: 700; color: #112243; line-height: 1.1; }
${p}.rxo-sub { font-size: 9pt; color: #6b7385; letter-spacing: .08em; direction: ltr; text-align: right; }
${p}.rxo-meta { display: flex; gap: 6px; }
${p}.rxo-meta > div { border: 1px solid #112243; border-radius: 3px; padding: 1.5mm 3mm; text-align: center; min-width: 26mm; }
${p}.rxo-meta span, ${p}.rxo-pt span { display: block; font-size: 8.5pt; color: #5b6475; }
${p}.rxo-meta b { font-size: 11.5pt; letter-spacing: .03em; }
${p}.rxo-pt { display: grid; grid-template-columns: 2fr 1.4fr 1.2fr .6fr; border: 1px solid #9AA4B5; border-radius: 3px; margin-bottom: 5mm; }
${p}.rxo-pt > div { padding: 1.5mm 3mm; border-inline-start: 1px solid #D5DAE3; }
${p}.rxo-pt > div:first-child { border-inline-start: 0; }
${p}.rxo-pt b { font-size: 11pt; }
${p}.rxo-rx { display: flex; gap: 4mm; align-items: flex-start; }
${p}.rxo-sym { font-family: "Times New Roman", serif; font-size: 30pt; line-height: 1; color: #112243; font-weight: 700; margin-top: -1mm; }
${p}.rxo-list { list-style: none; margin: 0; padding: 0; flex: 1; }
${p}.rx-it { display: flex; gap: 3mm; padding: 2.5mm 0; border-bottom: 1px dashed #B6BFCD; break-inside: avoid; }
${p}.rx-it:last-child { border-bottom: 0; }
${p}.rx-it-n { width: 6mm; height: 6mm; border-radius: 50%; border: 1.5px solid #112243; color: #112243; font-weight: 700; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; flex: none; margin-top: .6mm; }
${p}.rx-it-b { flex: 1; }
${p}.rx-it-name { font-size: 12.5pt; font-weight: 700; }
${p}.rx-it-str { font-weight: 600; color: #333; direction: ltr; unicode-bidi: isolate; }
${p}.rx-it-form { font-size: 9.5pt; color: #555; }
${p}.rx-it-sig, ${p}.rx-it-q { font-size: 10.5pt; }
${p}.rx-it-sig span, ${p}.rx-it-q span { color: #5b6475; }
${p}.rx-it-note { font-size: 10pt; font-style: italic; color: #333; }
${p}.rxo-end { text-align: center; font-size: 9.5pt; color: #5b6475; margin: 3mm 0 3mm; letter-spacing: .02em; }
${p}.rxo-notes { border-top: 1px solid #D5DAE3; padding-top: 2mm; font-size: 10.5pt; }
${p}.rxo-sign { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; margin-top: 10mm; break-inside: avoid; }
${p}.rxo-doc { font-size: 10.5pt; line-height: 1.5; }
${p}.rxo-doc b { font-size: 12pt; }
${p}.rxo-stamp { text-align: center; min-width: 60mm; }
${p}.rxo-stamp .doc-sig { margin: 0 auto 1mm; width: 46mm; }
${p}.rxo-sigspace { height: 18mm; }
${p}.rxo-line { border-top: 1px solid #111; padding-top: 1mm; font-size: 9.5pt; }
${p}.of-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #0D1B2A; padding-bottom: 2.5mm; margin-bottom: 4mm; }
${p}.of-title { font-family: "Frank Ruhl Libre", "FreeSerif", "David", serif; font-size: 19pt; font-weight: 700; color: #0D1B2A; line-height: 1.15; }
${p}.of-meta { display: flex; gap: 6px; }
${p}.of-meta > div { border: 1px solid #0D1B2A; border-radius: 3px; padding: 1.2mm 3mm; text-align: center; min-width: 24mm; }
${p}.of-meta span, ${p}.of-pt span { display: block; font-size: 8.5pt; color: #5b6475; }
${p}.of-meta b { font-size: 11pt; letter-spacing: .02em; }
${p}.of-pt { display: grid; grid-template-columns: 2fr 1.4fr 1.2fr .6fr; border: 1px solid #9AA4B5; border-radius: 3px; margin-bottom: 4mm; background: #FAFBFC; }
${p}.of-pt > div { padding: 1.5mm 3mm; border-inline-start: 1px solid #D5DAE3; }
${p}.of-pt > div:first-child { border-inline-start: 0; }
${p}.of-pt b { font-size: 11pt; }
${p}.of-to { margin: 0 0 4mm; font-size: 10.5pt; }
${p}.of-to span { color: #5b6475; }
${p}.doc-body h3 { color: #0D1B2A; text-decoration: none !important; font-size: 11.5pt; border-bottom: 1px solid #D5DAE3; padding-bottom: 1mm; margin: 5mm 0 2mm; }
${p}.of-sign { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; margin-top: 5mm; }
${p}.of-doc { font-size: 10.5pt; line-height: 1.5; }
${p}.of-doc b { display: block; font-size: 12pt; margin-top: 1mm; }
${p}.of-stamp { text-align: center; min-width: 60mm; }
${p}.of-stamp .doc-sig { margin: 0 auto 1mm; width: 38mm; }
${p}.of-sigspace { height: 14mm; }
${p}.of-line { border-top: 1px solid #111; padding-top: 1mm; font-size: 9.5pt; color: #333; }
${p}.cl-date { text-align: left; font-size: 11pt; margin: 1mm 0 5mm; }
${p}.cl-to { margin: 0 0 5mm; line-height: 1.5; }
${p}.cl-title { text-align: center; font-family: "Frank Ruhl Libre", "FreeSerif", "David", serif; font-size: 18pt; font-weight: 700; color: #0D1B2A; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 6px; margin: 2mm 0 4mm; }
${p}.cl-ptw { padding-bottom: 3mm; margin-bottom: 5mm; border-bottom: 1px solid #C9CFD8; }
${p}.cl-pt { display: flex; justify-content: center; flex-wrap: wrap; gap: 2px 22px; font-size: 11pt; }
${p}.cl-rv { text-align: center; font-size: 10pt; color: #0B5F5B; margin-top: 1.5mm; }
${p}.cl-rv b { color: #0B5F5B; }
@media print {
  ${p}.doc-foot { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
}
`;
}
