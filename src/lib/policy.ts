import type { Settings } from './constants';
import { DAYS, changeDeadline, fmtDate, todayIL, weekday } from './dates';

/** The referrer's change policy for a confirmed appointment (the clinic itself is never limited). */
type P = Pick<Settings, 'allow_reschedule' | 'allow_cancel' | 'change_business_days' | 'cancel_days' | 'change_days_unit' | 'max_reschedules'>;

const unit = (s: P) => (s.change_days_unit === 'calendar' ? 'calendar' : 'business');

/** "5 ימי עסקים" / "3 ימים" / "יום עסקים אחד" */
export function daysLabel(n: number, u: 'business' | 'calendar') {
  if (u === 'calendar') return n === 1 ? 'יום אחד' : `${n} ימים`;
  return n === 1 ? 'יום עסקים אחד' : `${n} ימי עסקים`;
}

/** The last days to move / cancel this appointment, and whether they already passed. */
export function changeWindow(s: P, startsAt: string, moved = 0) {
  const u = unit(s);
  const today = todayIL();
  const moveBy = changeDeadline(startsAt, s.change_business_days ?? 5, u);
  const cancelBy = changeDeadline(startsAt, s.cancel_days ?? s.change_business_days ?? 5, u);
  const maxed = (s.max_reschedules ?? 0) > 0 && moved >= s.max_reschedules;
  return {
    canMove: s.allow_reschedule !== false && today <= moveBy && !maxed,
    canCancel: s.allow_cancel !== false && today <= cancelBy,
    moveBy, cancelBy, maxed,
  };
}

const dayAndDate = (d: string) => `יום ${DAYS[weekday(d)]} ${fmtDate(d)}`;

/** One sentence per rule, for the referrer's case page and the confirmation email. */
export function policyLines(s: P, startsAt?: string): string[] {
  const u = unit(s);
  const out: string[] = [];
  const rule = (on: boolean, verb: string, days: number, by?: string) => {
    if (!on) return `${verb} של תור שאושר נעשה מול המרפאה בלבד.`;
    if (!(days > 0)) return `${verb} אפשרי עד יום התור.`;
    return `${verb} אפשרי עד ${daysLabel(days, u)} לפני התור${by ? ` (עד ${dayAndDate(by)})` : ''}.`;
  };
  const w = startsAt ? changeWindow(s, startsAt) : null;
  const same = s.allow_reschedule !== false && s.allow_cancel !== false && (s.change_business_days ?? 5) === (s.cancel_days ?? 5);
  if (same) out.push(rule(true, 'שינוי מועד או ביטול', s.change_business_days ?? 5, w?.moveBy));
  else {
    out.push(rule(s.allow_reschedule !== false, 'שינוי מועד', s.change_business_days ?? 5, w?.moveBy));
    out.push(rule(s.allow_cancel !== false, 'ביטול', s.cancel_days ?? 5, w?.cancelBy));
  }
  if (s.allow_reschedule !== false && (s.max_reschedules ?? 0) > 0) out.push(s.max_reschedules === 1 ? 'אפשר לשנות את המועד פעם אחת.' : `אפשר לשנות את המועד עד ${s.max_reschedules} פעמים.`);
  return out;
}
