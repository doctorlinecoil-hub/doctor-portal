import 'server-only';
import { typeOf, type ReferralType, type Settings } from './constants';
import { bodyBlocks } from './letter';
import { docCss, docHtml } from './letterDoc';
import { BANNER_DATA_URI, SIGNATURE_DATA_URI } from './brandAssets';
import { esc } from './emails';
import { isRich, sanitizeHtml, stripMarker } from './richtext';

/*
 * The final letter as a PDF file, for email attachments.
 * Uses headless Chromium (@sparticuz/chromium + puppeteer-core), the same engine that prints the letter page.
 * If Chromium can't start, returns null and the email carries a link to the letter instead.
 */

export type LetterDoc = { letter_type: ReferralType; recipient: string; subject: string; body: string; letter_date: string };
export type PatientDoc = { name: string; idNumber: string; dob: string | null };

export function letterHtml(s: Settings, l: LetterDoc, pt: PatientDoc, o: { title?: string; visitDate?: string | null; signed?: boolean; visits?: { date: string; label: string }[] } = {}) {
  const body = isRich(l.body)
    ? sanitizeHtml(stripMarker(l.body))
    : bodyBlocks(l.body).map((b) => (b.kind === 'h' ? `<h3>${esc(b.text)}</h3>` : b.kind === 'li' ? `<ul><li>${esc(b.text)}</li></ul>` : `<p>${esc(b.text)}</p>`)).join('\n');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@700&family=Noto+Sans+Hebrew:wght@400;700&display=block">
<style>* { box-sizing: border-box; } body { margin: 0; } ${docCss()}</style></head><body>
${docHtml({
    settings: s, title: o.title || typeOf(l.letter_type).label, baseType: l.letter_type, date: l.letter_date, visitDate: o.visitDate,
    recipient: l.recipient, subject: l.subject, patient: pt, bodyHtml: body,
    visits: o.visits, banner: BANNER_DATA_URI, signature: o.signed && s.sign_final ? SIGNATURE_DATA_URI : null,
  })}
</body></html>`;
}

export function letterFileName(l: LetterDoc, pt: PatientDoc) {
  return `${typeOf(l.letter_type).label} - ${pt.name}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
}

// One PDF at a time per server instance: two renders at once both unpack the browser and fail ("spawn ETXTBSY").
let queue: Promise<unknown> = Promise.resolve();
let exe: Promise<string> | null = null;

export function renderPdf(html: string, footer: string): Promise<Buffer | null> {
  const run = queue.then(() => renderOnce(html, footer).then(async (r) => r ?? (await new Promise((ok) => setTimeout(ok, 900)), renderOnce(html, footer))));
  queue = run.catch(() => null);
  return run;
}

async function renderOnce(html: string, footer: string): Promise<Buffer | null> {
  let browser: { close: () => Promise<void> } | null = null;
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    const local = process.env.CHROME_PATH; // for local development
    if (!local) exe ??= chromium.executablePath();
    const b = await puppeteer.launch({
      args: local ? [] : chromium.args,
      executablePath: local || (await exe!),
      headless: true,
    });
    browser = b;
    const page = await b.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25_000 });
    await page.evaluate(() => document.fonts.ready);
    const footerHtml = `<div style="width:100%;font:8px Arial,sans-serif;color:#777;padding:0 14mm;text-align:left;direction:rtl"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
    void footer;
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerHtml,
      margin: { top: '10mm', bottom: '12mm', left: '14mm', right: '14mm' },
    });
    return Buffer.from(pdf);
  } catch (e) {
    console.error('pdf failed', (e as Error).message);
    if (/ETXTBSY|ENOENT/.test((e as Error).message)) exe = null;
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
