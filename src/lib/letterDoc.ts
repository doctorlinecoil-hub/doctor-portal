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
  const footer = (s.lh_footer || [s.lh_name, s.lh_licenses, s.lh_address, s.lh_phone].filter(Boolean).join('\n')).split('\n').filter(Boolean);

  const head = d.banner && s.use_banner
    ? `<img class="doc-banner" src="${esc(d.banner)}" alt="${esc(s.lh_name)}">`
    : `<div class="doc-texthead"><div><div class="th-name">${esc(s.lh_name)}</div>${titles.map((t) => `<div class="th-small">${esc(t)}</div>`).join('')}</div><div class="th-small th-contact">${[s.lh_licenses, s.lh_address, s.lh_phone && `טל׳ ${s.lh_phone}`, s.lh_email].filter(Boolean).map((x) => `<div>${esc(String(x))}</div>`).join('')}</div></div>`;

  const title = opinion ? `חוות דעת רפואית${to[0] ? ` עבור ${to[0]}` : ''}` : d.title;
  const intro = opinion
    ? `<p class="doc-intro">הנני מגיש בזאת את חוות דעתי הרפואית${d.visitDate ? ` לאחר בדיקתי ב־${esc(fmtDate(d.visitDate))}` : ''}.</p>${s.cv_in_opinions && s.lh_cv ? `<div class="doc-cv">${cvHtml(s.lh_cv)}</div>` : ''}`
    : '';

  return `
<table class="ldoc"><thead><tr><td><div class="doc-head">${head}</div></td></tr></thead>
<tbody><tr><td class="doc-main">
  ${d.draft ? '<div class="doc-draft">טיוטה</div>' : ''}
  <div class="doc-date">תאריך: ${esc(fmtDate(d.date))}</div>
  ${to.length ? `<div class="doc-to"><div>לכבוד</div>${to.map((r) => `<div><b>${esc(r)}</b></div>`).join('')}</div>` : ''}
  <h1 class="doc-title">${esc(title)}</h1>
  ${d.subject ? `<div class="doc-subj">הנדון: <u>${esc(d.subject)}</u></div>` : ''}
  <div class="doc-pt"><span><b>שם:</b> ${esc(d.patient.name)}</span><span><b>ת.ז.:</b> ${esc(d.patient.idNumber)}</span>${d.patient.dob ? `<span><b>תאריך לידה:</b> ${esc(fmtDate(d.patient.dob))}${ag != null ? ` (גיל ${ag})` : ''}</span>` : ''}</div>
  ${intro}
  <div class="doc-body">${d.bodyHtml}</div>
  ${d.baseType === 'legal' ? `<div class="doc-decl">${esc(LEGAL_DECLARATION)}</div>` : ''}
  <div class="doc-sign">
    <div>בכבוד רב,</div>
    ${d.signature ? `<img class="doc-sig" src="${esc(d.signature)}" alt="חתימה">` : `<div class="doc-signname"><b>${esc(s.lh_name)}</b>${titles[0] ? `<div>${esc(titles[0])}</div>` : ''}${s.lh_licenses ? `<div>${esc(s.lh_licenses)}</div>` : ''}</div>`}
    ${d.signLine ? '<div class="doc-signline">חתימה וחותמת הרופא: ______________________</div>' : ''}
  </div>
</td></tr></tbody>
<tfoot><tr><td><div class="doc-foot-space"></div></td></tr></tfoot></table>
<div class="doc-foot">${footer.map((l, i) => `<div${i === 0 ? ' class="f1"' : ''}>${esc(l)}</div>`).join('')}</div>`;
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
${p}.doc-foot { font-size: 9pt; line-height: 1.45; color: #1d2433; border-top: 1px solid #C9A43A; padding-top: 2mm; text-align: right; }
${p}.doc-foot .f1 { font-weight: 700; }
${p}table.rx { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
${p}table.rx th { background: #F1F3F8; font-weight: 700; font-size: 10pt; text-align: right; }
${p}table.rx th, ${p}table.rx td { border: 1px solid #B6BFCD; padding: 6px 8px; vertical-align: top; }
${p}table.rx td.n, ${p}table.rx th.n { width: 26px; text-align: center; color: #555; }
${p}table.rx .sub { font-size: 9.5pt; color: #444; }
${p}table.rx tr { break-inside: avoid; }
@media print {
  ${p}.doc-foot { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
}
`;
}
