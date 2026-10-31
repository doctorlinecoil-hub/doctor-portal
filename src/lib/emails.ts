import 'server-only';
import { policyLines } from './policy';
import { ils, payLines, typeOf, type Settings } from './constants';
import { bringList, mapsLink, wazeLink, when, type ApptInfo, type ClinicInfo } from './messages';
import { appUrl } from './mail';
import { fmtDate } from './dates';
import type { ProofCheck } from './payCheck';

// Email templates. Table layout and inline styles so they look right in Gmail, Outlook and phones. RTL Hebrew.

const ACCENT = '#1B3A6B';
const INK = '#0F1B2A';
const MUTED = '#5B6878';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function clinicOf(s: Settings): ClinicInfo {
  return { name: s.lh_name, address: s.lh_address, phone: s.lh_phone, bring: s.bring_items ?? '', note: s.summons_note ?? '' };
}

function button(href: string, label: string, primary = true) {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 0 4px 8px;padding:11px 20px;border-radius:10px;font-weight:600;font-size:15px;text-decoration:none;${
    primary ? `background:${ACCENT};color:#ffffff;` : `background:#ffffff;color:${ACCENT};border:1px solid #B7C6E0;`
  }">${esc(label)}</a>`;
}

function layout(s: Settings, o: { preheader: string; title: string; body: string; footerNote?: string }) {
  const titles = (s.lh_titles || '').split('\n').filter(Boolean);
  // the official letterhead banner, from the site (shown by mail apps that load images; the text header otherwise)
  const base = appUrl();
  const banner = /^https:\/\//.test(base) && s.use_banner !== false ? `${base}/brand/letterhead.jpg` : '';
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F5;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;direction:rtl;text-align:right;font-family:Arial,'Segoe UI',Helvetica,sans-serif;color:${INK};box-shadow:0 2px 10px rgba(15,27,42,.06);">
<tr><td style="background-color:#0E1C38;border-bottom:3px solid #C9A43A;padding:0;">
  ${banner
    ? `<img src="${esc(banner)}" width="600" alt="${esc(s.lh_name)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">`
    : `<div style="padding:22px 28px"><div style="font-size:21px;font-weight:700;color:#ffffff;line-height:1.3">${esc(s.lh_name)}</div>${titles.map((t) => `<div style="font-size:13px;color:#B7D5D2;line-height:1.5">${esc(t)}</div>`).join('')}</div>`}
</td></tr>
<tr><td style="padding:26px 28px 8px;">
  <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:${INK}">${esc(o.title)}</h1>
  ${o.body}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E4E8EF;font-size:12.5px;color:${MUTED};line-height:1.6">
  ${[s.lh_name, s.lh_address, s.lh_phone && `טל׳ ${s.lh_phone}`].filter(Boolean).map(esc).join(' · ')}
  ${o.footerNote ? `<div style="margin-top:6px">${o.footerNote}</div>` : ''}
  <div style="margin-top:6px">ההודעה נשלחה אוטומטית ממערכת התורים של המרפאה. המידע בה רפואי וחסוי ומיועד לנמען בלבד.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function p(html: string) {
  return `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.65;color:${INK}">${html}</p>`;
}

function card(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F7F6;border:1px solid #CFE6E3;border-radius:12px;margin:6px 0 16px;">
${rows.map(([k, v]) => `<tr><td style="padding:9px 16px;font-size:13.5px;color:${MUTED};white-space:nowrap;vertical-align:top;width:110px">${esc(k)}</td><td style="padding:9px 16px 9px 4px;font-size:15px;font-weight:600;color:${INK}">${v}</td></tr>`).join('')}
</table>`;
}

function list(items: string[]) {
  return `<ul style="margin:0 0 14px;padding:0 20px 0 0;font-size:15px;line-height:1.7;color:${INK}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

const textOf = (lines: (string | false | null | undefined)[]) => lines.filter(Boolean).join('\n');

export type Rendered = { subject: string; html: string; text: string };

/** To the doctor: a referrer asked for an appointment. */
export function newRequestEmail(s: Settings, a: ApptInfo, link: string, needsApproval: boolean): Rendered {
  const w = when(a.startsAt);
  const subject = needsApproval ? `בקשה לתור חדש ממתינה לאישור · ${a.patientName}` : `תור חדש נקבע · ${a.patientName}`;
  const body =
    p(needsApproval ? `<b>${esc(a.firmName)}</b> ביקשו תור חדש. הבקשה ממתינה לאישור שלך.` : `<b>${esc(a.firmName)}</b> קבעו תור חדש.`) +
    card([['מטופל', esc(a.patientName)], ['מועד', esc(w.label)], ['סוג', esc((a.label || typeOf(a.type).label))], ['תיק', String(a.caseNo)]]) +
    p('המערכת סורקת עכשיו את המסמכים שצורפו ומכינה סיכום, לפני שתפתח את התיק.') +
    `<div style="margin:6px 0 10px">${button(link, needsApproval ? 'לאישור הבקשה' : 'פתיחת התיק')}</div>`;
  return {
    subject,
    html: layout(s, { preheader: `${a.patientName} · ${w.label}`, title: needsApproval ? 'בקשה לתור חדש' : 'תור חדש', body }),
    text: textOf([subject, `${a.firmName}`, `מטופל: ${a.patientName}`, `מועד: ${w.label}`, `סוג: ${(a.label || typeOf(a.type).label)}`, `לתיק: ${link}`]),
  };
}

/** The official summons, to the patient (if an email was given) and to the referrer. */
export function summonsEmail(s: Settings, a: ApptInfo, o: { forReferrer: boolean; patientHasEmail: boolean; link?: string; due?: number }): Rendered {
  const c = clinicOf(s);
  const w = when(a.startsAt);
  const bring = bringList(c);
  const ok = a.phone ? 'אושרה' : 'אושר';
  const subject = o.forReferrer
    ? `${a.phone ? 'השיחה אושרה' : 'התור אושר'} בהצלחה · ${a.patientName} · ${w.label}`
    : `${a.phone ? 'השיחה הטלפונית שלך אושרה' : 'התור שלך אושר'} · ${w.label} · ${s.lh_name}`;
  const what = a.phone ? 'השיחה הטלפונית' : 'התור';
  const intro = o.forReferrer
    ? `שמחים לעדכן: ${what} של <b>${esc(a.patientName)}</b> אצל ${esc(s.lh_name)} ${ok} בהצלחה.` +
      (o.patientHasEmail ? ' זימון מסודר נשלח גם למטופל.' : '<br><b>לא הוזן מייל של המטופל, לכן הזימון נשלח אליכם. נא להעביר אותו למטופל.</b>')
    : a.phone ? `שלום ${esc(a.patientName)},<br>שמחים לעדכן ש${what} שלך עם ${esc(s.lh_name)} ${ok}.` : `שלום ${esc(a.patientName)},<br>שמחים לעדכן ש${what} שלך אצל ${esc(s.lh_name)} ${ok}. נשמח לראות אותך.`;
  const okBanner = `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#ECF8F3;border:1px solid #BFE6D4;color:#11643F;font-size:16px;font-weight:700">✓ ${a.phone ? 'השיחה אושרה' : 'התור אושר'} בהצלחה</div>`;
  const body =
    okBanner + p(intro) +
    card([
      ['מועד', `<span style="font-size:17px">${esc(w.label)}</span>`],
      a.phone ? ['סוג הפגישה', `<b>שיחה טלפונית</b>`] : ['כתובת', esc(c.address || '—')],
      ...(a.phone ? ([['הרופא יתקשר אל', `<span dir="ltr">${esc(a.patientPhone || '—')}</span>`]] as [string, string][]) : []),
      ['סוג הביקור', esc((a.label || typeOf(a.type).label))],
      ...(o.forReferrer ? ([['מטופל', esc(a.patientName)], ['תיק', String(a.caseNo)]] as [string, string][]) : []),
    ]) +
    (a.phone ? p('בשעה שנקבעה הרופא יתקשר. נא להיות זמינים במקום שקט, עם המסמכים הרפואיים לידכם. אם המספר השתנה, עדכנו את המרפאה.')
      : (c.address ? `<div style="margin:0 0 14px">${button(wazeLink(c.address), 'ניווט ב־Waze')}${button(mapsLink(c.address), 'Google Maps', false)}</div>` : '') +
        (bring.length ? `<h2 style="margin:6px 0 6px;font-size:16px;color:${INK}">מה להביא</h2>` + list(bring) : '')) +
    (c.note && !a.phone ? p(esc(c.note).replace(/\n/g, '<br>')) : '') +
    (o.due && o.due > 0 ? payBlock(s, o.due, 'לתשלום לפני הביקור') + p('נא להעביר את התשלום לפני מועד הביקור. אחרי ההעברה אפשר להעלות את האישור לתיק או להשיב למייל הזה.') : '') +
    p(`מצורף קובץ <b>הוספה ליומן</b>. ${c.phone ? `לשאלות או לשינוי מועד: <span dir="ltr">${esc(c.phone)}</span>.` : ''}`) +
    (s.policy_in_summons !== false ? policyBlock(s, a.startsAt) : '') +
    (o.forReferrer && o.link ? `<div style="margin:6px 0 10px">${button(o.link, 'צפייה בתיק')}</div>` : '');
  return {
    subject,
    html: layout(s, { preheader: `${a.phone ? 'השיחה אושרה' : 'התור אושר'} · ${w.label}`, title: o.forReferrer ? (a.phone ? 'השיחה אושרה' : 'התור אושר') : (a.phone ? 'זימון לשיחה טלפונית' : 'זימון לתור'), body }),
    text: textOf([
      o.forReferrer ? `התור של ${a.patientName} אושר בהצלחה.${o.patientHasEmail ? ' הזימון נשלח גם למטופל.' : ' לא הוזן מייל של המטופל – נא להעביר לו את הזימון.'}` : `שלום ${a.patientName}, התור שלך אושר.`,
      `מועד: ${w.label}`, c.address && `כתובת: ${c.address}`, c.address && `ניווט: ${wazeLink(c.address)}`,
      bring.length ? `מה להביא: ${bring.join(', ')}` : '', c.note, o.due && o.due > 0 ? payText(s, o.due) : '', c.phone && `טלפון: ${c.phone}`,
    ]),
  };
}

/** The change and cancellation policy, in a quiet box under the confirmation. */
function policyBlock(s: Settings, startsAt: string) {
  const lines = policyLines(s, startsAt);
  if (!lines.length) return '';
  return `<div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:#F6F8FB;border:1px solid #E3E8EF;color:${MUTED};font-size:13.5px;line-height:1.6"><b style="color:${INK}">שינוי מועד וביטול</b><br>${lines.map(esc).join('<br>')}</div>`;
}

export type RemindWhen = 'tomorrow' | '3d' | '2h';
const WHEN_TEXT: Record<RemindWhen, string> = { tomorrow: 'מחר', '3d': 'בעוד 3 ימים', '2h': 'בעוד שעתיים' };

/** A reminder before the appointment: to the patient, the referrer, or the doctor. */
export function reminderEmail(s: Settings, a: ApptInfo, forReferrer: boolean | 'doctor', at: RemindWhen = 'tomorrow', o: { due?: number; link?: string } = {}): Rendered {
  const c = clinicOf(s);
  const w = when(a.startsAt);
  const soon = WHEN_TEXT[at];
  const doctor = forReferrer === 'doctor';
  const subject = doctor
    ? `תזכורת: ${a.phone ? 'שיחה טלפונית עם ' : ''}${a.patientName} ${soon} (${w.time}) · ${a.label || typeOf(a.type).label}`
    : `תזכורת: ${a.phone ? 'שיחה טלפונית' : 'תור'} ${soon} · ${w.label} · ${s.lh_name}`;
  const intro = doctor
    ? `תזכורת: התור של <b>${esc(a.patientName)}</b> ${soon}.`
    : forReferrer ? `תזכורת: התור של <b>${esc(a.patientName)}</b> ${soon}.` : `שלום ${esc(a.patientName)}, תזכורת לתור שלך ${soon}.`;
  const body =
    p(intro) +
    card([
      ['מועד', esc(w.label)],
      ...(a.phone ? ([['סוג הפגישה', '<b>שיחה טלפונית</b>'], [doctor ? 'להתקשר אל' : 'הרופא יתקשר אל', `<span dir="ltr">${esc(a.patientPhone || '—')}</span>`]] as [string, string][]) : []),
      ...(doctor ? ([['סוג', esc(a.label || typeOf(a.type).label)], ['מפנה', esc(a.firmName || '—')], ['תיק', String(a.caseNo)]] as [string, string][]) : a.phone ? [] : ([['כתובת', esc(c.address || '—')]] as [string, string][])),
    ]) +
    (!doctor && !a.phone && c.address ? `<div style="margin:0 0 14px">${button(wazeLink(c.address), 'ניווט ב־Waze')}${button(mapsLink(c.address), 'Google Maps', false)}</div>` : '') +
    (!doctor && !a.phone && bringList(c).length ? p(`נא להביא: ${esc(bringList(c).join(', '))}.`) : '') +
    (!doctor && o.due && o.due > 0 ? payBlock(s, o.due, 'יתרה לתשלום') : '') +
    (!doctor && c.phone ? p(`לשינוי מועד או לשאלות: <span dir="ltr">${esc(c.phone)}</span>.`) : '') +
    (o.link ? `<div style="margin:6px 0 10px">${button(o.link, doctor ? 'פתיחת התיק' : 'צפייה בתיק')}</div>` : '');
  return {
    subject,
    html: layout(s, { preheader: w.label, title: `תזכורת לתור ${soon}`, body }),
    text: textOf([subject, `מועד: ${w.label}`, !doctor && c.address && `כתובת: ${c.address}`, !doctor && c.address && wazeLink(c.address), o.link]),
  };
}

/** How to pay: the amount, then the bank details as a clean table (label | value), Bit, and the clinic's note. */
export function payBlock(s: Settings, amount: number, title = 'לתשלום'): string {
  const pl = payLines(s);
  const amountRow = amount > 0
    ? `<div style="margin:6px 0 10px;padding:14px 16px;border-radius:12px;background:${INK};color:#ffffff;display:block">
<span style="font-size:13px;opacity:.75">${esc(title)}</span><br><span style="font-size:24px;font-weight:700;letter-spacing:.3px">${esc(ils(amount))}</span></div>`
    : '';
  if (!pl.bank.length && !pl.bit) return amountRow;
  const row = (k: string, v: string, ltr = false) =>
    `<tr><td style="padding:10px 14px;border-top:1px solid #E3EAF0;font-size:13.5px;color:${MUTED};width:38%;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:10px 14px;border-top:1px solid #E3EAF0;font-size:16px;font-weight:700;color:${INK}"${ltr ? ' dir="ltr" align="right"' : ''}>${esc(v)}</td></tr>`;
  const bankRows = pl.bank.map((l) => {
    const i = l.indexOf(':');
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim();
    return row(k, v, /^[\d\s\-]+$/.test(v));
  }).join('');
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D5DEE7;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 12px">
<tr><td colspan="2" style="padding:10px 14px;background:#F4F7FA;font-size:14px;font-weight:700;color:${INK}">${pl.bank.length ? 'העברה בנקאית' : 'ביט / פייבוקס'}</td></tr>
${bankRows}${pl.bit ? row(pl.bank.length ? 'או בביט / פייבוקס' : 'מספר', pl.bit, true) : ''}
</table>`;
  return `<h2 style="margin:12px 0 6px;font-size:16px;color:${INK}">פרטי תשלום</h2>` + amountRow + table +
    (pl.note ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${MUTED}">${esc(pl.note).replace(/\n/g, '<br>')}</p>` : '');
}

const payText = (s: Settings, amount: number) => {
  const pl = payLines(s);
  return [amount > 0 ? `סכום לתשלום: ${ils(amount)}` : '', pl.bank.length ? `העברה בנקאית:\n${pl.bank.join('\n')}` : '', pl.bit ? `ביט / פייבוקס: ${pl.bit}` : '', pl.note].filter(Boolean).join('\n');
};

/** To a patient who booked by himself: the slot waits for the deposit. */
export function depositEmail(s: Settings, a: ApptInfo, amount: number, holdHours: number, link: string): Rendered {
  const w = when(a.startsAt);
  const subject = `כדי לשריין את התור: מקדמה של ${ils(amount)} · ${s.lh_name}`;
  const body =
    p(`שלום ${esc(a.patientName)},<br>קיבלנו את הבקשה לתור. <b>כדי שהתור יישמר, יש להעביר מקדמה של ${esc(ils(amount))} בתוך ${holdHours} שעות.</b>`) +
    card([['מועד מבוקש', esc(w.label)], ['סוג הביקור', esc(a.label || typeOf(a.type).label)], ['מספר תיק', String(a.caseNo)]]) +
    payBlock(s, amount, 'מקדמה') +
    p('אחרי ההעברה, העלו צילום של אישור ההעברה בקישור למטה (או השיבו למייל הזה עם הצילום). מיד כשהמקדמה תתקבל, הרופא יאשר את התור ויישלח אליכם זימון.') +
    `<div style="margin:6px 0 10px">${button(link, 'העלאת אישור העברה')}</div>` +
    p(`אם המקדמה לא תתקבל בתוך ${holdHours} שעות, הבקשה תבוטל והמועד ישוחרר.`);
  return { subject, html: layout(s, { preheader: `מקדמה ${ils(amount)} · ${w.label}`, title: 'נשאר רק להעביר מקדמה', body }), text: textOf([subject, `מועד: ${w.label}`, payText(s, amount), link]) };
}

export function depositExpiredEmail(s: Settings, a: ApptInfo, link: string): Rendered {
  const w = when(a.startsAt);
  const subject = `הבקשה לתור בוטלה (לא התקבלה מקדמה) · ${s.lh_name}`;
  const body = p(`שלום ${esc(a.patientName)},<br>הבקשה לתור (${esc(w.label)}) בוטלה, כי המקדמה לא התקבלה בזמן.`) + p('אפשר לקבוע תור חדש בכל עת:') + `<div style="margin:6px 0 10px">${button(link, 'קביעת תור חדש')}</div>`;
  return { subject, html: layout(s, { preheader: 'הבקשה בוטלה', title: 'הבקשה לתור בוטלה', body }), text: textOf([subject, link]) };
}

/* ---------- accounts ---------- */

export function signupReceivedEmail(s: Settings, name: string): Rendered {
  const subject = `קיבלנו את ההרשמה שלך · ${s.lh_name}`;
  const body = p(`שלום ${esc(name)},<br>תודה שנרשמת. ההרשמה הועברה לאישור המרפאה, ונעדכן אותך במייל ברגע שהחשבון יאושר.`) + p('בינתיים אפשר לקבוע תור גם בלי חשבון, דרך דף קביעת התור.') + `<div style="margin:6px 0 10px">${button(`${appUrl()}/book`, 'קביעת תור')}</div>`;
  return { subject, html: layout(s, { preheader: 'ההרשמה התקבלה', title: 'ההרשמה התקבלה', body }), text: textOf([subject, 'ההרשמה הועברה לאישור המרפאה.']) };
}

export function signupStaffEmail(s: Settings, r: { name: string; org: string; kind: string; email: string; phone: string }, link: string): Rendered {
  const subject = `הרשמה חדשה ממתינה לאישור · ${r.org || r.name}`;
  const body = p('נרשם חשבון חדש למערכת, והוא ממתין לאישור שלך.') +
    card([['סוג', esc(r.kind)], ...(r.org ? ([['שם', esc(r.org)]] as [string, string][]) : []), ['איש קשר', esc(r.name)], ['מייל', `<span dir="ltr">${esc(r.email)}</span>`], ['טלפון', `<span dir="ltr">${esc(r.phone)}</span>`]]) +
    `<div style="margin:6px 0 10px">${button(link, 'לאישור ההרשמה')}</div>`;
  return { subject, html: layout(s, { preheader: `${r.kind} · ${r.org || r.name}`, title: 'הרשמה חדשה', body }), text: textOf([subject, r.email, r.phone, link]) };
}

export function callbackStaffEmail(s: Settings, r: { name: string; phone: string; kind: string; note: string; source: string }): Rendered {
  const subject = `בקשה לחזרה טלפונית · ${r.name}`;
  const tel = r.phone.replace(/[^\d+]/g, '');
  const body = p('מישהו השאיר פרטים בדף האתר וביקש שיחזרו אליו.') +
    card([['שם', esc(r.name)], ['טלפון', `<a dir="ltr" href="tel:${esc(tel)}">${esc(r.phone)}</a>`], ['פונה בתור', esc(r.kind)], ...(r.note ? ([['הערה', esc(r.note)]] as [string, string][]) : []), ...(r.source ? ([['הגיע מ־', esc(r.source)]] as [string, string][]) : [])]) +
    `<div style="margin:6px 0 10px">${button(`tel:${tel}`, 'התקשרות')}</div>`;
  return { subject, html: layout(s, { preheader: `${r.kind} · ${r.phone}`, title: 'חזרה טלפונית', body }), text: textOf([subject, r.phone, r.kind, r.note, r.source]) };
}

export function accountApprovedEmail(s: Settings, name: string, email: string): Rendered {
  const link = `${appUrl()}/login`;
  const subject = `החשבון שלך אושר · ${s.lh_name}`;
  const body = p(`שלום ${esc(name)},<br>החשבון שלך במערכת של ${esc(s.lh_name)} אושר. אפשר להתחבר עם המייל והסיסמה שבחרת בהרשמה.`) +
    card([['מייל לכניסה', `<span dir="ltr">${esc(email)}</span>`]]) + `<div style="margin:6px 0 10px">${button(link, 'כניסה למערכת')}</div>` +
    p(`אפשר גם בלי סיסמה: <a href="${appUrl()}/login?code=1&email=${encodeURIComponent(email)}">כניסה עם קוד שנשלח למייל</a>.`);
  return { subject, html: layout(s, { preheader: 'אפשר להתחבר', title: 'החשבון אושר', body }), text: textOf([subject, `כניסה: ${link}`]) };
}

export function accountRejectedEmail(s: Settings, name: string, reason: string): Rendered {
  const subject = `ההרשמה לא אושרה · ${s.lh_name}`;
  const body = p(`שלום ${esc(name)},<br>ההרשמה שלך למערכת לא אושרה.`) + (reason ? card([['הסיבה', esc(reason)]]) : '') + (s.lh_phone ? p(`לפרטים: <span dir="ltr">${esc(s.lh_phone)}</span>`) : '');
  return { subject, html: layout(s, { preheader: 'ההרשמה לא אושרה', title: 'ההרשמה לא אושרה', body }), text: textOf([subject, reason]) };
}

export function tempPasswordEmail(s: Settings, name: string, password: string): Rendered {
  const link = `${appUrl()}/login`;
  const subject = `סיסמה זמנית לכניסה · ${s.lh_name}`;
  const body = p(`שלום ${esc(name)},<br>ביקשת סיסמה חדשה. זו הסיסמה הזמנית שלך:`) +
    `<div style="margin:6px 0 16px;padding:14px 18px;background:#F1F7F6;border:1px solid #CFE6E3;border-radius:12px;font-size:22px;font-weight:700;letter-spacing:.08em;text-align:center;direction:ltr;font-family:Consolas,Menlo,monospace">${esc(password)}</div>` +
    p('נכנסים עם המייל והסיסמה הזמנית, ומיד בוחרים סיסמה חדשה.') + `<div style="margin:6px 0 10px">${button(link, 'כניסה למערכת')}</div>` +
    p('<span style="color:#5B6878;font-size:13px">לא ביקשת סיסמה חדשה? אפשר להתעלם מההודעה, אבל הסיסמה הקודמת כבר לא פעילה: היכנסו עם הזמנית ובחרו חדשה.</span>');
  return { subject, html: layout(s, { preheader: 'סיסמה זמנית', title: 'סיסמה זמנית', body }), text: textOf([subject, `סיסמה זמנית: ${password}`, link]) };
}

export function resetLinkEmail(s: Settings, name: string, link: string): Rendered {
  const subject = `איפוס סיסמה · ${s.lh_name}`;
  const body = p(`שלום ${esc(name)},<br>התקבלה בקשה לאיפוס הסיסמה לחשבון שלך. לבחירת סיסמה חדשה:`) +
    `<div style="margin:6px 0 14px">${button(link, 'בחירת סיסמה חדשה')}</div>` +
    p('<span style="color:#5B6878;font-size:13px">הקישור תקף ל־30 דקות ולשימוש אחד. לא ביקשת? אפשר להתעלם מההודעה: הסיסמה הנוכחית נשארת בתוקף.</span>');
  return { subject, html: layout(s, { preheader: 'קישור לבחירת סיסמה חדשה', title: 'איפוס סיסמה', body }), text: textOf([subject, link, 'הקישור תקף ל־30 דקות.']) };
}

export function declinedEmail(s: Settings, a: ApptInfo, reason: string, link: string): Rendered {
  const w = when(a.startsAt);
  const subject = `הבקשה לתור לא אושרה · ${a.patientName}`;
  const body =
    p(`הבקשה לתור עבור <b>${esc(a.patientName)}</b> (${esc(w.label)}) לא אושרה.`) +
    (reason ? card([['הסיבה', esc(reason)]]) : '') +
    p('אפשר לבחור מועד אחר במערכת.') +
    `<div style="margin:6px 0 10px">${button(link, 'קביעת מועד אחר')}</div>`;
  return { subject, html: layout(s, { preheader: reason || w.label, title: 'הבקשה לא אושרה', body }), text: textOf([subject, reason && `הסיבה: ${reason}`, link]) };
}

export function docRequestEmail(s: Settings, a: ApptInfo, items: string[], note: string, link: string): Rendered {
  const subject = `הרופא מבקש השלמות לתיק ${a.caseNo} · ${a.patientName}`;
  const body =
    p(`כדי להכין את ${esc((a.label || typeOf(a.type).label))} עבור <b>${esc(a.patientName)}</b>, ${esc(s.lh_name)} מבקש:`) +
    (items.length ? list(items) : '') +
    (note ? p(esc(note).replace(/\n/g, '<br>')) : '') +
    p('אפשר להעלות את המסמכים ישירות לתיק במערכת.') +
    `<div style="margin:6px 0 10px">${button(link, 'העלאה לתיק')}</div>`;
  return { subject, html: layout(s, { preheader: items.join(', ') || note, title: 'בקשה להשלמת מסמכים', body }), text: textOf([subject, ...items.map((i) => `- ${i}`), note, link]) };
}

export function firmUpdateEmail(s: Settings, a: ApptInfo, what: { notes: number; files: number }, link: string): Rendered {
  const subject = `עדכון בתיק ${a.caseNo} · ${a.patientName}`;
  const parts = [what.files ? `${what.files} מסמכים חדשים` : '', what.notes ? 'הערה חדשה' : ''].filter(Boolean).join(' ו');
  const body = p(`<b>${esc(a.firmName)}</b> הוסיפו לתיק של ${esc(a.patientName)}: ${esc(parts)}.`) + `<div style="margin:6px 0 10px">${button(link, 'פתיחת התיק')}</div>`;
  return { subject, html: layout(s, { preheader: parts, title: 'עדכון בתיק', body }), text: textOf([subject, parts, link]) };
}

export function letterEmail(s: Settings, a: ApptInfo, o: { forReferrer: boolean; attached: boolean; link?: string }): Rendered {
  const label = (a.label || typeOf(a.type).label);
  const subject = `${label} · ${a.patientName} · תיק ${a.caseNo}`;
  const w = when(a.startsAt);
  const body =
    p(o.forReferrer ? `${esc(label)} עבור <b>${esc(a.patientName)}</b> מוכנה.` : `שלום ${esc(a.patientName)},<br>${esc(label)} שלך מוכנה.`) +
    card([
      ['מטופל/ת', esc(a.patientName)],
      ['סוג המסמך', esc(label)],
      ['תאריך הביקור', esc(fmtDate(w.date))],
      ['מספר תיק', String(a.caseNo)],
      ...(o.forReferrer && a.firmName ? [['מפנה', esc(a.firmName)] as [string, string]] : []),
    ]) +
    p(o.attached ? '<b>המסמך מצורף להודעה כקובץ PDF</b>, חתום ומוכן להגשה.' : 'אפשר לצפות במסמך ולהוריד אותו מתוך המערכת.') +
    (o.link ? `<div style="margin:6px 0 10px">${button(o.link, o.attached ? 'צפייה בתיק' : 'צפייה והורדה')}</div>` : '');
  return { subject, html: layout(s, { preheader: `${label} מוכנה`, title: `${label} מוכנה`, body }), text: textOf([subject, o.attached ? 'המסמך מצורף כ־PDF.' : '', o.link]) };
}

export function awaitingPaymentEmail(s: Settings, a: ApptInfo, due: number, link: string, payLink?: string): Rendered {
  const label = (a.label || typeOf(a.type).label);
  const subject = `${label} מוכנה וממתינה לתשלום · ${a.patientName} · תיק ${a.caseNo}`;
  const body =
    p(`שלום,<br>${esc(label)} עבור <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}) מוכנה.`) +
    payBlock(s, due, 'לתשלום') +
    proofBlock(payLink) +
    p('מיד כשהרופא יאשר את התשלום, המסמך יישלח אליכם למייל כקובץ PDF.') +
    `<div style="margin:6px 0 10px">${button(link, 'פרטי התיק', false)}</div>`;
  return { subject, html: layout(s, { preheader: 'המסמך מוכן וממתין לתשלום', title: 'המסמך מוכן', body }), text: textOf([subject, payText(s, due), payLink && `העלאת אישור העברה: ${payLink}`, 'אפשר גם להשיב למייל הזה עם צילום אישור ההעברה.', link]) };
}

/** How to send the transfer confirmation: a personal upload link, or a reply to the email. */
function proofBlock(payLink?: string) {
  return `<h2 style="margin:14px 0 6px;font-size:16px;color:${INK}">אחרי ההעברה</h2>` +
    p('שלחו לנו את צילום אישור ההעברה באחת משתי הדרכים:') +
    (payLink ? `<div style="margin:4px 0 8px">${button(payLink, 'העלאת אישור העברה')}</div>` : '') +
    p(`${payLink ? 'או ' : ''}פשוט השיבו למייל הזה וצרפו את צילום האישור.`);
}

/** A reminder from the clinic: the document is ready and waits for payment. */
export function paymentReminderEmail(s: Settings, a: ApptInfo, amount: number, link: string, payLink?: string): Rendered {
  const label = (a.label || typeOf(a.type).label);
  const subject = `תזכורת: ${label} מוכנה וממתינה לתשלום · ${a.patientName} · תיק ${a.caseNo}`;
  const body =
    p(`שלום,<br>${esc(label)} עבור <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}) מוכנה וממתינה לתשלום.`) +
    payBlock(s, amount, 'לתשלום') +
    proofBlock(payLink) +
    p('מיד כשהרופא יאשר את התשלום, המסמך יישלח אליכם למייל כקובץ PDF.') +
    `<div style="margin:6px 0 10px">${button(link, 'פרטי התיק', false)}</div>`;
  return { subject, html: layout(s, { preheader: 'תזכורת: המסמך ממתין לתשלום', title: 'תזכורת לתשלום', body }), text: textOf([subject, payText(s, amount), payLink && `העלאת אישור העברה: ${payLink}`, 'אפשר גם להשיב למייל הזה עם צילום אישור ההעברה.', link]) };
}

/** To the clinic: the payer sent a transfer confirmation (attached). */
/** The system's reading of a transfer confirmation, for the doctor. */
function checkBlock(c: ProofCheck) {
  const tone = c.verdict === 'ok' ? ['#ECF8F3', '#BFE6D4', '#11643F', '✓ נראה תקין'] : c.verdict === 'bad' ? ['#FEF3F2', '#F8C9C4', '#B42318', '✗ נראה לא תקין'] : ['#FFF8EB', '#F5DDB0', '#7A4B0B', '! כדאי לבדוק'];
  const rows: [string, string][] = [];
  if (c.amount != null) rows.push(['סכום', esc(ils(c.amount))]);
  if (c.date) rows.push(['תאריך', esc(fmtDate(c.date))]);
  if (c.payer) rows.push(['משלם', esc(c.payer)]);
  if (c.recipient || c.account) rows.push(['מוטב', esc([c.recipient, c.account].filter(Boolean).join(' · '))]);
  if (c.reference) rows.push(['אסמכתא', esc(c.reference)]);
  return `<div style="margin:0 0 14px;padding:12px 14px;border-radius:12px;background:${tone[0]};border:1px solid ${tone[1]};color:${tone[2]}">` +
    `<div style="font-weight:700;font-size:15px;margin-bottom:4px">בדיקת המערכת: ${tone[3]}</div>` +
    `<div style="font-size:14px">${esc(c.summary)}</div>` +
    (c.issues.length ? `<ul style="margin:6px 0 0;padding-inline-start:18px;font-size:13.5px">${c.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '') +
    `</div>` + (rows.length ? card(rows) : '');
}

export function paymentProofEmail(s: Settings, a: ApptInfo, link: string, reply?: { from: string; text: string }, check?: ProofCheck | null): Rendered {
  const subject = `התקבל אישור העברה · ${a.patientName} · תיק ${a.caseNo}`;
  const body = p(`התקבל צילום אישור העברה עבור <b>${esc(a.patientName)}</b> (תיק ${a.caseNo})${reply ? ` בתשובה למייל, מאת ${esc(reply.from)}` : ''}. הקובץ מצורף ונשמר בתיק.`) +
    (reply?.text ? `<div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:#F4F6FA;color:${INK};font-size:14px;white-space:pre-wrap">${esc(reply.text)}</div>` : '') +
    (check ? checkBlock(check) : '') +
    p('אחרי שבדקתם שהכסף התקבל, אשרו את התשלום, והמסמך יישלח אוטומטית כ־PDF. אם האסמכתא לא תקינה, אפשר לשלוח למשלם הודעה מאותו מסך.') +
    `<div style="margin:6px 0 10px">${button(link, 'לאישור התשלום')}</div>`;
  return { subject, html: layout(s, { preheader: 'אישור העברה התקבל', title: 'התקבל אישור העברה', body }), text: textOf([subject, reply?.text || '', link]) };
}

/** To the clinic: a reply to a payment email, without a file. */
export function paymentReplyEmail(s: Settings, a: ApptInfo, link: string, reply: { from: string; subject: string; text: string }): Rendered {
  const subject = `תשובה לבקשת התשלום · ${a.patientName} · תיק ${a.caseNo}`;
  const body = p(`התקבלה תשובה מ־${esc(reply.from)} לבקשת התשלום של <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}), בלי קובץ מצורף.`) +
    `<div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:#F4F6FA;color:${INK};font-size:14px;white-space:pre-wrap">${esc(reply.text || '(ללא טקסט)')}</div>` +
    p('אפשר להשיב ישירות למייל הזה, והתשובה תגיע לשולח.') +
    `<div style="margin:6px 0 10px">${button(link, 'לאישור תשלומים')}</div>`;
  return { subject, html: layout(s, { preheader: 'תשובה לבקשת התשלום', title: 'תשובה לבקשת התשלום', body }), text: textOf([subject, reply.text, link]) };
}

/** To whoever pays: the confirmation was not right or the money did not arrive, in the doctor's own words. */
export function paymentRejectedEmail(s: Settings, a: ApptInfo, message: string, due: number, link: string, payLink?: string): Rendered {
  const label = (a.label || typeOf(a.type).label);
  const subject = `בעניין התשלום · ${label} · ${a.patientName} · תיק ${a.caseNo}`;
  const body =
    p(`שלום,<br>בעניין התשלום עבור ${esc(label)} של <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}):`) +
    `<div style="margin:0 0 14px;padding:14px 16px;border-radius:12px;background:#FFF8EB;border:1px solid #F5DDB0;color:#7A4B0B;font-size:15px;white-space:pre-wrap">${esc(message)}</div>` +
    payBlock(s, due, 'לתשלום') +
    proofBlock(payLink) +
    p('מיד כשהרופא יאשר את התשלום, המסמך יישלח אליכם למייל כקובץ PDF.') +
    `<div style="margin:6px 0 10px">${button(link, 'פרטי התיק', false)}</div>`;
  return { subject, html: layout(s, { preheader: message.slice(0, 90), title: 'בעניין התשלום', body }), text: textOf([subject, message, payText(s, due), payLink && `העלאת אישור העברה: ${payLink}`, link]) };
}

export function rxEmail(s: Settings, patientName: string): Rendered {
  const subject = `מרשם · ${patientName} · ${s.lh_name}`;
  const body = p(`שלום ${esc(patientName)},<br>מצורף המרשם מ${esc(s.lh_name)} כקובץ PDF.`) + p('את המרשם יש להציג בבית המרקחת כשהוא חתום. בכל שאלה אפשר לפנות למרפאה.');
  return { subject, html: layout(s, { preheader: 'המרשם מצורף', title: 'מרשם', body }), text: textOf([subject, 'המרשם מצורף כ־PDF.']) };
}

/** To the admin: the daily backup of all the data. */
export function backupEmail(s: Settings, o: { date: string; counts: [string, number][]; files: number; filesMb: number; attached: boolean; link: string }): Rendered {
  const subject = `גיבוי יומי · ${s.lh_name} · ${fmtDate(o.date)}`;
  const body =
    p(`מצורף הגיבוי היומי של המערכת מ־${esc(fmtDate(o.date))}.`) +
    card(o.counts.map(([k, v]) => [esc(k), String(v)] as [string, string])) +
    p(o.attached
      ? '<b>הקבצים המצורפים:</b><br>• <b>תיקים.csv</b> – רשימת כל התיקים, נפתחת באקסל.<br>• <b>backup.json.gz</b> – כל הנתונים במלואם (תיקים, מכתבים, תשלומים, מפנים, הגדרות), לשחזור במקרה הצורך.'
      : 'הגיבוי המלא גדול מדי למייל, ולכן מצורפת רק רשימת התיקים. הנתונים המלאים שמורים במסד הנתונים.') +
    p(`המסמכים שהועלו (${o.files} קבצים, כ־${o.filesMb} MB) שמורים בנפרד באחסון המאובטח, ואינם מצורפים למייל.`) +
    p('<b>שמרו את המייל הזה.</b> הוא מכיל מידע רפואי אישי: אל תעבירו אותו הלאה.') +
    `<div style="margin:6px 0 10px">${button(o.link, 'כניסה למערכת', false)}</div>`;
  return { subject, html: layout(s, { preheader: 'הגיבוי היומי מצורף', title: 'גיבוי יומי', body }), text: textOf([subject, ...o.counts.map(([k, v]) => `${k}: ${v}`)]) };
}

export type DigestData = {
  date: string;
  today: { time: string; patient: string; service: string; referrer: string; phone: boolean; caseNo: number }[];
  pending: number; moves: number; waitingCount: number; waitingSum: number; proofs: number; link: string;
  seenToday?: number; newToday?: number; paidToday?: number;
};

/** The doctor's evening summary: tomorrow's schedule and what waits for him. */
export function dailyDigestEmail(s: Settings, d: DigestData): Rendered {
  const n = d.today.length;
  const subject = `סיכום יומי · מחר ${n ? `${n} ${n === 1 ? 'תור' : 'תורים'}` : 'אין תורים'} · ${fmtDate(d.date)}`;
  const tile = (v: string, l: string, warn = false) =>
    `<td style="width:25%;padding:4px"><div style="padding:12px 8px;border-radius:12px;background:${warn ? '#FFF8EB' : '#F6F8FB'};border:1px solid ${warn ? '#F5DDB0' : '#E3E8EF'};text-align:center"><div style="font-size:22px;font-weight:700;color:${warn ? '#7A4B0B' : ACCENT}">${v}</div><div style="font-size:12px;color:${MUTED}">${l}</div></div></td>`;
  const tiles = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>${
    tile(String(n), 'תורים מחר') + tile(String(d.pending), 'בקשות לאישור', d.pending > 0) + tile(String(d.waitingCount), 'ממתינים לתשלום', d.proofs > 0) + tile(d.waitingSum ? ils(d.waitingSum) : '0', 'יתרה לגבייה')}</tr></table>`;
  const rows = d.today.map((t) =>
    `<tr><td style="padding:10px 12px;border-bottom:1px solid #EEF1F5;font-weight:700;color:${ACCENT};white-space:nowrap;direction:ltr;text-align:right">${esc(t.time)}</td>` +
    `<td style="padding:10px 12px;border-bottom:1px solid #EEF1F5"><b style="color:${INK}">${esc(t.patient)}</b><br><span style="font-size:12.5px;color:${MUTED}">${esc(t.service)}${t.referrer ? ` · ${esc(t.referrer)}` : ''}${t.phone ? ' · שיחה טלפונית' : ''} · תיק ${t.caseNo}</span></td></tr>`).join('');
  const agenda = n
    ? `<h2 style="margin:4px 0 8px;font-size:16px;color:${INK}">לוח הזמנים למחר</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #E3E8EF;border-radius:12px;border-collapse:separate;overflow:hidden">${rows}</table>`
    : p('אין תורים מחר.');
  const todo = [
    d.pending ? `${d.pending} ${d.pending === 1 ? 'בקשת תור ממתינה' : 'בקשות תור ממתינות'} לאישור` : '',
    d.moves ? `${d.moves} ${d.moves === 1 ? 'בקשה' : 'בקשות'} לשינוי מועד` : '',
    d.proofs ? `${d.proofs} ${d.proofs === 1 ? 'אישור העברה ממתין' : 'אישורי העברה ממתינים'} לבדיקה שלך` : '',
  ].filter(Boolean);
  const day = [d.seenToday ? `${d.seenToday} ביקורים היום` : '', d.newToday ? `${d.newToday} תיקים חדשים` : '', d.paidToday ? `${d.paidToday} תשלומים נרשמו` : ''].filter(Boolean);
  const body = tiles + (day.length ? p(`<b>היום במרפאה:</b> ${day.map(esc).join(' · ')}`) : '') + agenda + (todo.length ? `<h2 style="margin:4px 0 8px;font-size:16px;color:${INK}">מחכה לך</h2>` + list(todo) : '') +
    `<div style="margin:10px 0">${button(d.link, 'כניסה ליומן')}</div>`;
  return {
    subject,
    html: layout(s, { preheader: n ? `מחר ${n} תורים, הראשון ב־${d.today[0].time}` : 'סיכום יומי', title: `סיכום יומי · מחר ${fmtDate(d.date)}`, body }),
    text: textOf([subject, ...d.today.map((t) => `${t.time} ${t.patient} · ${t.service}`), d.pending ? `בקשות לאישור: ${d.pending}` : '', d.waitingCount ? `ממתינים לתשלום: ${d.waitingCount}` : '', d.link]),
  };
}

/** To the doctor: a referrer cancelled an appointment (the attached calendar file removes it from the calendar). */
export function cancelledStaffEmail(s: Settings, a: ApptInfo, link: string, by: string): Rendered {
  const w = when(a.startsAt);
  const subject = `תור בוטל · ${a.patientName} · ${w.label}`;
  const body =
    `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#FDF0EE;border:1px solid #F8C9C4;color:#9B1C12;font-size:16px;font-weight:700">✕ התור בוטל</div>` +
    p(`<b>${esc(by)}</b> ביטלו את התור. השעה ביומן התפנתה, ואפשר לקבוע בה תור אחר.`) +
    card([['מטופל', esc(a.patientName)], ['מועד שבוטל', esc(w.label)], ['סוג', esc(a.label || typeOf(a.type).label)], ['תיק', String(a.caseNo)]]) +
    p('מצורף קובץ יומן: פתיחה שלו מסירה את התור מהיומן שלך.') +
    `<div style="margin:6px 0 10px">${button(link, 'פתיחת התיק')}</div>`;
  return { subject, html: layout(s, { preheader: `${a.patientName} · ${w.label}`, title: 'תור בוטל', body }), text: textOf([subject, `בוטל ע״י ${by}`, link]) };
}

/** To the doctor: a referrer asked to move an appointment. */
export function rescheduleStaffEmail(s: Settings, a: ApptInfo, link: string, by: string, requested: string, reason: string): Rendered {
  const from = when(a.startsAt), to = when(requested);
  const subject = `בקשה לשינוי מועד · ${a.patientName}`;
  const body =
    p(`<b>${esc(by)}</b> מבקשים להעביר את התור של <b>${esc(a.patientName)}</b> למועד אחר. הבקשה ממתינה לאישור שלך.`) +
    card([['המועד הנוכחי', esc(from.label)], ['המועד המבוקש', `<b>${esc(to.label)}</b>`], ...(reason ? ([['סיבה', esc(reason)]] as [string, string][]) : []), ['תיק', String(a.caseNo)]]) +
    `<div style="margin:6px 0 10px">${button(link, 'לאישור או דחייה')}</div>`;
  return { subject, html: layout(s, { preheader: `${from.label} ← ${to.label}`, title: 'בקשה לשינוי מועד', body }), text: textOf([subject, `${from.label} -> ${to.label}`, reason, link]) };
}

/** To the patient and the referrer: the clinic cancelled the appointment. */
export function cancelledByClinicEmail(s: Settings, a: ApptInfo, o: { forReferrer: boolean; link?: string }): Rendered {
  const w = when(a.startsAt);
  const c = clinicOf(s);
  const subject = `${a.phone ? 'השיחה' : 'התור'} בוטל · ${o.forReferrer ? `${a.patientName} · ` : ''}${w.label}`;
  const body =
    `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#FDF0EE;border:1px solid #F8C9C4;color:#9B1C12;font-size:16px;font-weight:700">✕ ${a.phone ? 'השיחה בוטלה' : 'התור בוטל'}</div>` +
    p(o.forReferrer ? `המרפאה ביטלה את ${a.phone ? 'השיחה' : 'התור'} של <b>${esc(a.patientName)}</b> אצל ${esc(s.lh_name)}.` : `שלום ${esc(a.patientName)},<br>${a.phone ? 'השיחה' : 'התור'} שלך אצל ${esc(s.lh_name)} בוטל.`) +
    card([['המועד שבוטל', esc(w.label)], ['סוג הביקור', esc(a.label || typeOf(a.type).label)], ...(o.forReferrer ? ([['תיק', String(a.caseNo)]] as [string, string][]) : [])]) +
    p(`לקביעת מועד חדש${c.phone ? ` אפשר להתקשר למרפאה: <span dir="ltr">${esc(c.phone)}</span>, או` : ''} לקבוע באתר.`) +
    p('מצורף קובץ יומן: פתיחה שלו מסירה את התור מהיומן.') +
    (o.link ? `<div style="margin:6px 0 10px">${button(o.link, 'קביעת מועד חדש')}</div>` : '');
  return { subject, html: layout(s, { preheader: w.label, title: a.phone ? 'השיחה בוטלה' : 'התור בוטל', body }), text: textOf([subject, w.label, c.phone ? `טלפון: ${c.phone}` : '']) };
}

/** To the patient and the referrer: the clinic moved the appointment to a new time. */
export function movedEmail(s: Settings, a: ApptInfo, oldStart: string, o: { forReferrer: boolean; link?: string }): Rendered {
  const w = when(a.startsAt), was = when(oldStart);
  const c = clinicOf(s);
  const what = a.phone ? 'השיחה' : 'התור';
  const subject = `עדכון מועד ${a.phone ? 'השיחה' : 'התור'} · ${o.forReferrer ? `${a.patientName} · ` : ''}${w.label}`;
  const body =
    `<div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#FFF7E6;border:1px solid #F5D9A0;color:#8A5300;font-size:16px;font-weight:700">↻ מועד ${what} עודכן</div>` +
    p(o.forReferrer ? `המרפאה העבירה את ${what} של <b>${esc(a.patientName)}</b> אצל ${esc(s.lh_name)} למועד חדש.` : `שלום ${esc(a.patientName)},<br>${what} שלך אצל ${esc(s.lh_name)} הועבר למועד חדש.`) +
    card([
      ['המועד החדש', `<b style="font-size:17px">${esc(w.label)}</b>`],
      ['במקום', `<span style="text-decoration:line-through;color:${MUTED}">${esc(was.label)}</span>`],
      a.phone ? ['סוג הפגישה', '<b>שיחה טלפונית</b>'] : ['כתובת', esc(c.address || '—')],
      ['סוג הביקור', esc(a.label || typeOf(a.type).label)],
      ...(o.forReferrer ? ([['תיק', String(a.caseNo)]] as [string, string][]) : []),
    ]) +
    (!a.phone && c.address ? `<div style="margin:0 0 14px">${button(wazeLink(c.address), 'ניווט ב־Waze')}${button(mapsLink(c.address), 'Google Maps', false)}</div>` : '') +
    p(`מצורף קובץ יומן מעודכן: פתיחה שלו מעבירה את ${what} ביומן למועד החדש.${c.phone ? ` אם המועד לא מתאים: <span dir="ltr">${esc(c.phone)}</span>.` : ''}`) +
    (o.forReferrer && o.link ? `<div style="margin:6px 0 10px">${button(o.link, 'צפייה בתיק')}</div>` : '');
  return { subject, html: layout(s, { preheader: `${was.label} ← ${w.label}`, title: `מועד ${what} עודכן`, body }), text: textOf([subject, `המועד החדש: ${w.label}`, `במקום: ${was.label}`, c.phone ? `טלפון: ${c.phone}` : '']) };
}

/** To the clinic: a patient on WhatsApp asked to talk to a person (the bot stepped aside). */
export function waHandoffEmail(s: Settings, o: { name: string; phone: string; text: string; link: string }): Rendered {
  const subject = `וואטסאפ: ${o.name || o.phone} מבקש/ת לדבר עם המרפאה`;
  const body =
    p(`<b>${esc(o.name || 'מטופל')}</b> (<span dir="ltr">${esc(o.phone)}</span>) ביקש/ה בוואטסאפ לדבר עם המרפאה. הבוט הפסיק לענות בשיחה הזו.`) +
    (o.text ? card([['ההודעה האחרונה', esc(o.text)]]) : '') +
    `<div style="margin:6px 0 10px">${button(o.link, 'לשיחה במערכת')}</div>`;
  return { subject, html: layout(s, { preheader: o.text || subject, title: 'פנייה בוואטסאפ', body }), text: textOf([subject, o.text, o.link]) };
}

/** A one-time sign-in code (and a one-click sign-in link). */
export function loginCodeEmail(s: Settings, name: string, code: string, link: string): Rendered {
  const subject = `קוד כניסה: ${code} · ${s.lh_name}`;
  const body = p(`שלום${name ? ` ${esc(name)}` : ''},<br>זה קוד הכניסה שלך למערכת:`) +
    `<div style="margin:6px 0 16px;padding:18px;border-radius:14px;background:#F4F6FA;border:1px solid #E3E8EF;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:${ACCENT};direction:ltr">${esc(code)}</div>` +
    p('אפשר להקליד את הקוד במסך הכניסה, או פשוט ללחוץ:') +
    `<div style="margin:6px 0 14px">${button(link, 'כניסה למערכת')}</div>` +
    p('<span style="color:#5B6878;font-size:13px">הקוד והקישור תקפים לשעה ולשימוש אחד. לא ביקשת? אפשר להתעלם מההודעה.</span>');
  return { subject, html: layout(s, { preheader: `קוד הכניסה שלך: ${code}`, title: 'כניסה למערכת', body }), text: textOf([subject, link]) };
}
