import 'server-only';
import type { Settings } from './constants';
import { docCss, docHtml } from './letterDoc';
import { BANNER_DATA_URI } from './brandAssets';
import { rxTable, type RxItem } from './rxTypes';

/** The prescription as an HTML page, for the PDF attachment. */
export function rxHtml(s: Settings, rx: { items: RxItem[]; notes: string; rx_date: string }, pt: { name: string; idNumber: string; dob: string | null }) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&display=block">
<style>* { box-sizing: border-box; } body { margin: 0; } ${docCss()}</style></head><body>${rxBody(s, rx, pt, BANNER_DATA_URI)}</body></html>`;
}

/** The prescription on the letterhead, shared by the PDF and the print page. Signed by hand. */
export function rxBody(s: Settings, rx: { items: RxItem[]; notes: string; rx_date: string }, pt: { name: string; idNumber: string; dob: string | null }, banner: string | null) {
  return docHtml({ settings: s, title: 'מרשם', date: rx.rx_date, patient: pt, bodyHtml: rxTable(rx), banner, signLine: true });
}
