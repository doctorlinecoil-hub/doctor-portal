// Texts for summons, reminders and letters: shared by the emails and the WhatsApp buttons. Pure (server or client).
import { TYPES, type ReferralType } from './constants';
import { DAYS, fmtDate, ilParts, weekday } from './dates';

export type ApptInfo = {
  caseNo: number;
  startsAt: string;
  minutes: number;
  type: ReferralType;
  patientName: string;
  firmName: string;
};

export type ClinicInfo = {
  name: string;
  address: string;
  phone: string;
  bring: string;
  note: string;
};

/** Israeli phone → WhatsApp number (972…). */
export function waPhone(phone: string) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

export const waLink = (phone: string | null, text: string) => `https://wa.me/${phone ? waPhone(phone) : ''}?text=${encodeURIComponent(text)}`;
export const wazeLink = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
export const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function when(iso: string) {
  const p = ilParts(iso);
  return { date: p.date, time: p.time, day: DAYS[weekday(p.date)], label: `יום ${DAYS[weekday(p.date)]}, ${fmtDate(p.date)} בשעה ${p.time}` };
}

export const bringList = (c: ClinicInfo) => c.bring.split('\n').map((s) => s.trim()).filter(Boolean);

export function summonsText(a: ApptInfo, c: ClinicInfo) {
  const w = when(a.startsAt);
  const bring = bringList(c);
  return [
    `שלום ${a.patientName},`,
    `נקבע לך תור אצל ${c.name}.`,
    '',
    `📅 ${w.label}`,
    c.address ? `📍 ${c.address}` : '',
    c.address ? `ניווט: ${wazeLink(c.address)}` : '',
    `סוג הביקור: ${TYPES[a.type].label}`,
    bring.length ? `\nמה להביא:\n${bring.map((b) => `• ${b}`).join('\n')}` : '',
    c.note ? `\n${c.note}` : '',
    c.phone ? `\nלשאלות או לשינוי מועד: ${c.phone}` : '',
  ].filter((l) => l !== '').join('\n');
}

export function reminderText(a: ApptInfo, c: ClinicInfo) {
  const w = when(a.startsAt);
  return [
    `תזכורת: מחר, ${w.label}, תור אצל ${c.name}.`,
    c.address ? `📍 ${c.address}\nניווט: ${wazeLink(c.address)}` : '',
    bringList(c).length ? `נא להביא: ${bringList(c).join(', ')}.` : '',
    c.phone ? `לשאלות: ${c.phone}` : '',
  ].filter(Boolean).join('\n');
}

export function letterReadyText(a: ApptInfo, c: ClinicInfo) {
  return `שלום, ${TYPES[a.type].label} עבור ${a.patientName} (תיק ${a.caseNo}) מוכנה במערכת של ${c.name}. אפשר להוריד אותה מתוך התיק.`;
}

/** A calendar invite (.ics) for the appointment. */
export function icsFile(a: ApptInfo, c: ClinicInfo, uid: string) {
  const start = new Date(a.startsAt);
  const end = new Date(start.getTime() + a.minutes * 60000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const fold = (line: string) => {
    // RFC 5545: lines up to 75 octets
    const out: string[] = [];
    let cur = '';
    for (const ch of line) {
      if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
    }
    out.push(cur);
    return out.join('\r\n');
  };
  const desc = [`${TYPES[a.type].label} · תיק ${a.caseNo}`, bringList(c).length ? `מה להביא: ${bringList(c).join(', ')}` : '', c.phone ? `טלפון המרפאה: ${c.phone}` : ''].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//doctor-portal//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`תור אצל ${c.name} – ${a.patientName}`)}`,
    c.address ? `LOCATION:${esc(c.address)}` : '',
    `DESCRIPTION:${esc(desc)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc('תזכורת לתור')}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
