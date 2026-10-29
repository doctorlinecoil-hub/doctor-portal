import 'server-only';
import { typeOf, type ReferralType, type Settings } from './constants';
import { age, fmtDate } from './dates';
import { LEGAL_DECLARATION, bodyBlocks } from './letter';
import { esc } from './emails';
import { isRich, sanitizeHtml, stripMarker } from './richtext';

/*
 * The final letter as a PDF file, for email attachments.
 * Uses headless Chromium (@sparticuz/chromium + puppeteer-core), the same engine that prints the letter page.
 * If Chromium can't start, returns null and the email carries a link to the letter instead.
 */

export type LetterDoc = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string };
export type PatientDoc = { name: string; idNumber: string; dob: string | null };

export function letterHtml(s: Settings, l: LetterDoc, pt: PatientDoc) {
  const ag = age(pt.dob);
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  const recipients = l.recipient.split('|').map((x) => x.trim()).filter(Boolean);
  const blocks = isRich(l.body)
    ? `<div class="lt-rich">${sanitizeHtml(stripMarker(l.body))}</div>`
    : bodyBlocks(l.body).map((b) => `<div class="lt-${b.kind}">${esc(b.text)}</div>`).join('\n');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=block">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans Hebrew", Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #111; direction: rtl; text-align: right; }
  .lt-head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #0B7A75; padding-bottom: 10px; margin-bottom: 16px; }
  .lt-name { font-size: 20pt; font-weight: 700; color: #0B4A46; line-height: 1.2; }
  .lt-small { font-size: 9.5pt; color: #333; line-height: 1.45; }
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
  .lt-rich h2 { font-size: 14pt; margin: 12px 0 4px; } .lt-rich h3 { font-size: 11.5pt; margin: 10px 0 2px; } .lt-rich h4 { font-size: 11pt; margin: 8px 0 2px; font-weight: 600; }
  .lt-rich p { margin: 0 0 6px; } .lt-rich ul, .lt-rich ol { margin: 0 0 6px; padding-right: 22px; } .lt-rich li { margin: 0 0 2px; }
  .lt-rich table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; } .lt-rich td, .lt-rich th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
  .lt-rich blockquote { margin: 6px 0; padding: 4px 12px; border-right: 3px solid #0B7A75; color: #333; } .lt-rich hr { border: 0; border-top: 1px solid #999; margin: 10px 0; }
  .lt-rich font[size="2"] { font-size: 9pt; } .lt-rich font[size="4"] { font-size: 13pt; } .lt-rich font[size="5"] { font-size: 16pt; }
</style></head><body>
<header class="lt-head">
  <div>
    <div class="lt-name">${esc(s.lh_name)}</div>
    ${titles.map((t) => `<div class="lt-small">${esc(t)}</div>`).join('')}
    ${s.lh_licenses ? `<div class="lt-small">${esc(s.lh_licenses)}</div>` : ''}
  </div>
  <div class="lt-small lt-contact">
    ${s.lh_address ? `<div>${esc(s.lh_address)}</div>` : ''}
    ${s.lh_phone ? `<div>טל׳ ${esc(s.lh_phone)}</div>` : ''}
    ${s.lh_email ? `<div>${esc(s.lh_email)}</div>` : ''}
  </div>
</header>
<div class="lt-date">תאריך: ${esc(fmtDate(l.letter_date))}</div>
${recipients.length ? `<div class="lt-to"><div>לכבוד</div>${recipients.map((r) => `<div><b>${esc(r)}</b></div>`).join('')}</div>` : ''}
${l.subject ? `<div class="lt-subj">הנדון: <u>${esc(l.subject)}</u></div>` : ''}
<div class="lt-pt">
  <span><b>שם:</b> ${esc(pt.name)}</span>
  <span><b>ת.ז.:</b> ${esc(pt.idNumber)}</span>
  ${pt.dob ? `<span><b>תאריך לידה:</b> ${esc(fmtDate(pt.dob))}${ag != null ? ` (גיל ${ag})` : ''}</span>` : ''}
</div>
${blocks}
${l.letter_type === 'legal' ? `<div class="lt-decl">${esc(LEGAL_DECLARATION)}</div>` : ''}
<div class="lt-sign">
  <div>בכבוד רב,</div>
  <div style="font-weight:700;margin-top:16px">${esc(s.lh_name)}</div>
  ${titles[0] ? `<div class="lt-small">${esc(titles[0])}</div>` : ''}
  ${s.lh_licenses ? `<div class="lt-small">${esc(s.lh_licenses)}</div>` : ''}
</div>
</body></html>`;
}

export function letterFileName(l: LetterDoc, pt: PatientDoc) {
  return `${typeOf(l.letter_type).label} - ${pt.name}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
}

export async function renderPdf(html: string, footer: string): Promise<Buffer | null> {
  let browser: { close: () => Promise<void> } | null = null;
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    const local = process.env.CHROME_PATH; // for local development
    const b = await puppeteer.launch({
      args: local ? [] : chromium.args,
      executablePath: local || (await chromium.executablePath()),
      headless: true,
    });
    browser = b;
    const page = await b.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25_000 });
    await page.evaluate(() => document.fonts.ready);
    const footerHtml = `<div style="width:100%;font:9px Arial,sans-serif;color:#555;padding:0 18mm;display:flex;justify-content:space-between;direction:rtl">
      <span>${esc(footer)}</span><span>עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span></div>`;
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerHtml,
      margin: { top: '16mm', bottom: '18mm', left: '18mm', right: '18mm' },
    });
    return Buffer.from(pdf);
  } catch (e) {
    console.error('pdf failed', (e as Error).message);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
