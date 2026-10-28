import { TYPES, type ReferralType } from './constants';
import { dayNum, ilParts } from './dates';

export type RepAppt = { id: string; case_no: number; starts_at: string; status: string; referral_type: ReferralType; price: number; payer: string; firm_id: string; firm_name: string; patient_name: string };
export type RepPay = { appointment_id: string; amount: number; paid_on: string; method: string };
export type RepLetter = { appointment_id: string; finalized_at: string | null };

export type Report = {
  months: { key: string; label: string; cases: number; billed: number; collected: number }[];
  firms: { id: string; name: string; cases: number; billed: number; paid: number; balance: number }[];
  types: { type: ReferralType; label: string; cases: number; billed: number }[];
  kpi: { casesMonth: number; collectedMonth: number; outstanding: number; avgDaysToLetter: number | null; openLetters: number };
};

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

/** Pure aggregation, so it can be tested and reused. */
export function buildReport(appts: RepAppt[], pays: RepPay[], letters: RepLetter[], today: string): Report {
  const live = appts.filter((a) => a.status !== 'cancelled');
  const paidBy = new Map<string, number>();
  for (const p of pays) paidBy.set(p.appointment_id, (paidBy.get(p.appointment_id) ?? 0) + Number(p.amount));
  const keys: string[] = [];
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  for (let i = 0; i < 12; i++) { keys.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
  const months = keys.map((key) => ({ key, label: `${MONTHS[+key.slice(5) - 1]} ${key.slice(2, 4)}`, cases: 0, billed: 0, collected: 0 }));
  const mi = new Map(months.map((x, i) => [x.key, i]));
  for (const a of live) {
    const k = ilParts(a.starts_at).date.slice(0, 7);
    const i = mi.get(k);
    if (i != null) { months[i].cases++; months[i].billed += Number(a.price); }
  }
  for (const p of pays) { const i = mi.get(p.paid_on.slice(0, 7)); if (i != null) months[i].collected += Number(p.amount); }

  const fm = new Map<string, Report['firms'][number]>();
  for (const a of live) {
    const f = fm.get(a.firm_id) ?? { id: a.firm_id, name: a.firm_name, cases: 0, billed: 0, paid: 0, balance: 0 };
    f.cases++; f.billed += Number(a.price); f.paid += paidBy.get(a.id) ?? 0;
    fm.set(a.firm_id, f);
  }
  const firms = [...fm.values()].map((f) => ({ ...f, balance: Math.max(0, f.billed - f.paid) })).sort((a, b) => b.billed - a.billed);
  const types = (Object.keys(TYPES) as ReferralType[]).map((t) => ({
    type: t, label: TYPES[t].label,
    cases: live.filter((a) => a.referral_type === t).length,
    billed: live.filter((a) => a.referral_type === t).reduce((s, a) => s + Number(a.price), 0),
  }));
  const fin = new Map(letters.filter((l) => l.finalized_at).map((l) => [l.appointment_id, l.finalized_at!]));
  const gaps = live.filter((a) => fin.has(a.id)).map((a) => Math.max(0, dayNum(ilParts(fin.get(a.id)!).date) - dayNum(ilParts(a.starts_at).date)));
  const cur = today.slice(0, 7);
  return {
    months, firms, types,
    kpi: {
      casesMonth: months[months.length - 1].cases,
      collectedMonth: pays.filter((p) => p.paid_on.slice(0, 7) === cur).reduce((s, p) => s + Number(p.amount), 0),
      outstanding: firms.reduce((s, f) => s + f.balance, 0),
      avgDaysToLetter: gaps.length ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10 : null,
      openLetters: live.filter((a) => (a.status === 'booked' || a.status === 'draft') && new Date(a.starts_at) < new Date()).length,
    },
  };
}

/** CSV that Excel opens correctly in Hebrew (UTF-8 with BOM). */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
