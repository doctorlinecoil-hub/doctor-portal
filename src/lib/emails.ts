import 'server-only';
import { typeOf, type Settings } from './constants';
import { bringList, mapsLink, wazeLink, when, type ApptInfo, type ClinicInfo } from './messages';
import { appUrl } from './mail';

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
export function summonsEmail(s: Settings, a: ApptInfo, o: { forReferrer: boolean; patientHasEmail: boolean; link?: string }): Rendered {
  const c = clinicOf(s);
  const w = when(a.startsAt);
  const bring = bringList(c);
  const subject = `זימון לתור · ${w.label} · ${s.lh_name}`;
  const intro = o.forReferrer
    ? o.patientHasEmail
      ? `התור של <b>${esc(a.patientName)}</b> אושר. הזימון נשלח גם למטופל.`
      : `התור של <b>${esc(a.patientName)}</b> אושר. <b>לא הוזן מייל של המטופל, לכן הזימון נשלח אליכם. נא להעביר אותו למטופל.</b>`
    : `שלום ${esc(a.patientName)},<br>נקבע לך תור אצל ${esc(s.lh_name)}.`;
  const body =
    p(intro) +
    card([
      ['מועד', `<span style="font-size:17px">${esc(w.label)}</span>`],
      ['כתובת', esc(c.address || '—')],
      ['סוג הביקור', esc((a.label || typeOf(a.type).label))],
      ...(o.forReferrer ? ([['מטופל', esc(a.patientName)], ['תיק', String(a.caseNo)]] as [string, string][]) : []),
    ]) +
    (c.address ? `<div style="margin:0 0 14px">${button(wazeLink(c.address), 'ניווט ב־Waze')}${button(mapsLink(c.address), 'Google Maps', false)}</div>` : '') +
    (bring.length ? `<h2 style="margin:6px 0 6px;font-size:16px;color:${INK}">מה להביא</h2>` + list(bring) : '') +
    (c.note ? p(esc(c.note).replace(/\n/g, '<br>')) : '') +
    p(`מצורף קובץ <b>הוספה ליומן</b>. ${c.phone ? `לשאלות או לשינוי מועד: <span dir="ltr">${esc(c.phone)}</span>.` : ''}`) +
    (o.forReferrer && o.link ? `<div style="margin:6px 0 10px">${button(o.link, 'צפייה בתיק')}</div>` : '');
  return {
    subject,
    html: layout(s, { preheader: `${w.label} · ${c.address}`, title: 'זימון לתור', body }),
    text: textOf([
      o.forReferrer ? `התור של ${a.patientName} אושר.${o.patientHasEmail ? '' : ' לא הוזן מייל של המטופל – נא להעביר לו את הזימון.'}` : `שלום ${a.patientName},`,
      `מועד: ${w.label}`, c.address && `כתובת: ${c.address}`, c.address && `ניווט: ${wazeLink(c.address)}`,
      bring.length ? `מה להביא: ${bring.join(', ')}` : '', c.note, c.phone && `טלפון: ${c.phone}`,
    ]),
  };
}

export function reminderEmail(s: Settings, a: ApptInfo, forReferrer: boolean): Rendered {
  const c = clinicOf(s);
  const w = when(a.startsAt);
  const subject = `תזכורת: תור מחר בשעה ${w.time} · ${s.lh_name}`;
  const body =
    p(forReferrer ? `תזכורת: מחר התור של <b>${esc(a.patientName)}</b>.` : `שלום ${esc(a.patientName)}, תזכורת לתור שלך מחר.`) +
    card([['מועד', esc(w.label)], ['כתובת', esc(c.address || '—')]]) +
    (c.address ? `<div style="margin:0 0 14px">${button(wazeLink(c.address), 'ניווט ב־Waze')}</div>` : '') +
    (bringList(c).length ? p(`נא להביא: ${esc(bringList(c).join(', '))}.`) : '');
  return {
    subject,
    html: layout(s, { preheader: w.label, title: 'תזכורת לתור מחר', body }),
    text: textOf([subject, `מועד: ${w.label}`, c.address && `כתובת: ${c.address}`, c.address && wazeLink(c.address)]),
  };
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
  const subject = `${label} · ${a.patientName} · ${s.lh_name}`;
  const body =
    p(o.forReferrer ? `${esc(label)} עבור <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}) מוכנה.` : `שלום ${esc(a.patientName)},<br>${esc(label)} שלך מוכנה.`) +
    p(o.attached ? 'המסמך מצורף להודעה כקובץ PDF.' : 'אפשר לצפות במסמך ולהוריד אותו מתוך המערכת.') +
    (o.link ? `<div style="margin:6px 0 10px">${button(o.link, o.attached ? 'צפייה בתיק' : 'צפייה והורדה')}</div>` : '');
  return { subject, html: layout(s, { preheader: `${label} מוכנה`, title: `${label} מוכנה`, body }), text: textOf([subject, o.attached ? 'המסמך מצורף כ־PDF.' : '', o.link]) };
}

export function awaitingPaymentEmail(s: Settings, a: ApptInfo, balance: string, link: string): Rendered {
  const label = (a.label || typeOf(a.type).label);
  const subject = `${label} מוכנה וממתינה לתשלום · ${a.patientName}`;
  const body =
    p(`${esc(label)} עבור <b>${esc(a.patientName)}</b> (תיק ${a.caseNo}) מוכנה.`) +
    card([['יתרה לתשלום', esc(balance)]]) +
    p('המסמך יישלח אליכם אוטומטית מיד אחרי שהתשלום יירשם.') +
    `<div style="margin:6px 0 10px">${button(link, 'פרטי התיק')}</div>`;
  return { subject, html: layout(s, { preheader: `יתרה: ${balance}`, title: 'המסמך מוכן', body }), text: textOf([subject, `יתרה: ${balance}`, link]) };
}

export function rxEmail(s: Settings, patientName: string): Rendered {
  const subject = `מרשם · ${patientName} · ${s.lh_name}`;
  const body = p(`שלום ${esc(patientName)},<br>מצורף המרשם מ${esc(s.lh_name)} כקובץ PDF.`) + p('את המרשם יש להציג בבית המרקחת כשהוא חתום. בכל שאלה אפשר לפנות למרפאה.');
  return { subject, html: layout(s, { preheader: 'המרשם מצורף', title: 'מרשם', body }), text: textOf([subject, 'המרשם מצורף כ־PDF.']) };
}
