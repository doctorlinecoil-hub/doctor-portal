export const TZ = 'Asia/Jerusalem';
export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Israel wall-clock date (YYYY-MM-DD) and time (HH:MM) for an instant. */
export function ilParts(d: Date | string | number) {
  const parts = fmt.formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

export const dayNum = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const fromDayNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
export const weekday = (date: string) => new Date(dayNum(date) * 86400000).getUTCDay();
export const hm2min = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
export const min2hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Converts Israel wall-clock date+time to a UTC instant (handles summer time). */
export function ilToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target - 2 * 3600 * 1000;
  for (let i = 0; i < 3; i++) {
    const p = ilParts(guess);
    const seen = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), +p.time.slice(0, 2), +p.time.slice(3, 5));
    const diff = seen - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export function todayIL() {
  return ilParts(new Date()).date;
}

export function fmtDate(date: string | null | undefined) {
  if (!date) return '';
  return `${+date.slice(8, 10)}.${+date.slice(5, 7)}.${date.slice(0, 4)}`;
}
export const fmtShort = (date: string) => `${+date.slice(8, 10)}.${+date.slice(5, 7)}`;

export function fmtDay(date: string) {
  const n = dayNum(date) - dayNum(todayIL());
  const pre = n === 0 ? 'היום' : n === 1 ? 'מחר' : `יום ${DAYS[weekday(date)]}`;
  return `${pre}, ${fmtShort(date)}`;
}

export function fmtStamp(iso: string | null | undefined) {
  if (!iso) return '';
  const p = ilParts(iso);
  return `${fmtShort(p.date)} ${p.time}`;
}

export function age(dob: string | null | undefined) {
  if (!dob) return null;
  const t = todayIL();
  let a = +t.slice(0, 4) - +dob.slice(0, 4);
  if (t.slice(5) < dob.slice(5)) a--;
  return a;
}
