import 'server-only';
import type { Settings } from './constants';
import { docCss, rxDocHtml } from './letterDoc';
import { BANNER_DATA_URI, SIGNATURE_DATA_URI } from './brandAssets';
import type { RxItem } from './rxTypes';

type Rx = { items: RxItem[]; notes: string; rx_date: string; rx_no?: number | null };
type Pt = { name: string; idNumber: string; dob: string | null };

/** The prescription as an HTML page, for the PDF attachment. */
export function rxHtml(s: Settings, rx: Rx, pt: Pt) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;600;700&display=block">
<style>* { box-sizing: border-box; } body { margin: 0; } ${docCss()}</style></head><body>${rxBody(s, rx, pt, BANNER_DATA_URI)}</body></html>`;
}

/** The official prescription form, shared by the PDF and the print page. Signed when "sign final documents" is on. */
export function rxBody(s: Settings, rx: Rx, pt: Pt, banner: string | null) {
  return rxDocHtml({ settings: s, rxNo: rx.rx_no ?? null, date: rx.rx_date, patient: pt, items: rx.items, notes: rx.notes, banner, signature: s.sign_final ? SIGNATURE_DATA_URI : null });
}
