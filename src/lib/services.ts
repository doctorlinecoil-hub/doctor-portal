import { typeOf, type ReferralType } from './constants';

/** A referral type the clinic defined ("מה צריך מהרופא?"). base_type decides the letter's structure. */
export type Service = {
  id: string; label: string; description: string; icon: string; base_type: ReferralType; price: number; active: boolean; sort: number;
  /** how long a visit takes, in minutes; empty = the clinic's default slot length */
  duration_minutes?: number | null;
};

export const SERVICE_COLS = 'id, label, description, icon, base_type, price, active, sort, duration_minutes';

/** The name of what was requested: the clinic's own service name when there is one. */
export const labelOf = (r: { referral_type?: ReferralType | null; service_label?: string | null }) => r.service_label || typeOf(r.referral_type).label;

export const SERVICE_ICONS = ['activity', 'stethoscope', 'building', 'scale', 'file', 'fileCheck', 'briefcase', 'shield', 'users', 'calendar', 'pill', 'sparkles', 'handshake', 'idcard'];
