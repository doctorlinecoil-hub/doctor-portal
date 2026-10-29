import 'server-only';
import type { Settings } from './constants';
import { age, fmtDate } from './dates';
import { esc } from './emails';
import { rxLine, type RxItem } from './rxTypes';

/** The prescription as an HTML page, for the PDF attachment. */
export function rxHtml(s: Settings, rx: { items: RxItem[]; notes: string; rx_date: string }, pt: { name: string; idNumber: string; dob: string | null }) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=block">
<style>* { box-sizing: border-box; }${rxCss()}</style></head><body>${rxBody(s, rx, pt)}</body></html>`;
}

/** The prescription's content (everything is escaped), shared by the PDF and the print page. */
export function rxBody(s: Settings, rx: { items: RxItem[]; notes: string; rx_date: string }, pt: { name: string; idNumber: string; dob: string | null }) {
  const ag = age(pt.dob);
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  const rows = rx.items.map((i, n) => `<tr><td class="n">${n + 1}</td><td><b>${esc(i.name)}</b>${i.form || i.strength ? `<div class="sub">${esc([i.form, i.strength].filter(Boolean).join(' · '))}</div>` : ''}${i.notes ? `<div class="sub">${esc(i.notes)}</div>` : ''}</td><td>${esc(rxLine(i))}</td><td>${esc(i.quantity || '')}</td></tr>`).join('');
  return `<header class="lt-head"><div><div class="lt-name">${esc(s.lh_name)}</div>${titles.map((t) => `<div class="lt-small">${esc(t)}</div>`).join('')}${s.lh_licenses ? `<div class="lt-small">${esc(s.lh_licenses)}</div>` : ''}</div>
<div class="lt-small lt-contact">${s.lh_address ? `<div>${esc(s.lh_address)}</div>` : ''}${s.lh_phone ? `<div>טל׳ ${esc(s.lh_phone)}</div>` : ''}${s.lh_email ? `<div>${esc(s.lh_email)}</div>` : ''}</div></header>
<div class="rx-top"><div class="rx-title"><span class="rx-mark">℞</span> מרשם</div><div>תאריך: ${esc(fmtDate(rx.rx_date))}</div></div>
<div class="lt-pt"><span><b>שם:</b> ${esc(pt.name)}</span><span><b>ת.ז.:</b> ${esc(pt.idNumber)}</span>${pt.dob ? `<span><b>תאריך לידה:</b> ${esc(fmtDate(pt.dob))}${ag != null ? ` (גיל ${ag})` : ''}</span>` : ''}</div>
<table class="rx"><thead><tr><th class="n">#</th><th>תרופה</th><th>מינון ואופן נטילה</th><th>כמות</th></tr></thead><tbody>${rows}</tbody></table>
${rx.notes ? `<div class="rx-notes"><b>הערות:</b> ${esc(rx.notes)}</div>` : ''}
<div class="lt-sign"><div style="font-weight:700">${esc(s.lh_name)}</div>${s.lh_licenses ? `<div class="lt-small">${esc(s.lh_licenses)}</div>` : ''}<div style="margin-top:22px">חתימה וחותמת: ____________________</div></div>`;
}

/** The prescription's styles. With a scope (the print page), every rule is limited to that element. */
export const rxCss = (scope = '') => {
  const root = scope || 'body';
  const pre = scope ? `${scope} ` : '';
  return `
  ${root} { margin: 0; font-family: "Noto Sans Hebrew", Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #111; direction: rtl; text-align: right; }
  ${pre}.lt-head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #0B7A75; padding-bottom: 10px; margin-bottom: 14px; }
  ${pre}.lt-name { font-size: 20pt; font-weight: 700; color: #0B4A46; line-height: 1.2; }
  ${pre}.lt-small { font-size: 9.5pt; color: #333; line-height: 1.45; }
  ${pre}.lt-contact { text-align: left; max-width: 75mm; }
  ${pre}.rx-top { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 10px; }
  ${pre}.rx-title { font-size: 16pt; font-weight: 700; color: #0B4A46; display: flex; align-items: center; gap: 8px; }
  ${pre}.rx-mark { font-size: 22pt; font-family: Georgia, serif; }
  ${pre}.lt-pt { display: flex; flex-wrap: wrap; gap: 2px 18px; background: #F1F5F4; border: 1px solid #D9E1DF; padding: 5px 9px; margin-bottom: 14px; font-size: 10.5pt; }
  ${pre}table.rx { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  ${pre}table.rx th { background: #F1F5F4; font-weight: 700; font-size: 10pt; text-align: right; }
  ${pre}table.rx th, ${pre}table.rx td { border: 1px solid #C8D1CF; padding: 6px 8px; vertical-align: top; }
  ${pre}table.rx td.n, ${pre}table.rx th.n { width: 28px; text-align: center; color: #555; }
  ${pre}table.rx .sub { font-size: 9.5pt; color: #444; }
  ${pre}table.rx tr { break-inside: avoid; }
  ${pre}.rx-notes { margin: 6px 0 12px; }
  ${pre}.lt-sign { margin-top: 26px; break-inside: avoid; }
`;
};

