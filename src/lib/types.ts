import type { ApptStatus, Payer, PayMethod, ReferralType, ReferrerKind } from './constants';

export type ApptRow = {
  id: string;
  case_no: number;
  starts_at: string;
  ends_at?: string;
  referral_type: ReferralType;
  patient_name: string;
  status: ApptStatus;
  payer: Payer;
  price: number;
  paid: number;
  patient_id_number?: string;
  firm_name?: string;
  firm_kind?: ReferrerKind;
  details_at?: string | null;
  service_label?: string;
  mode?: 'clinic' | 'phone';
  payment_ok_at?: string | null;
};

export type FirmInfo = { id: string; name: string; kind: ReferrerKind; contact_name: string; phone: string; email: string; tax_id: string };

export type CaseDetail = {
  id: string;
  case_no: number;
  starts_at: string;
  referral_type: ReferralType;
  patient_name: string;
  patient_id_number: string;
  patient_dob: string | null;
  patient_phone: string;
  notes: string;
  status: ApptStatus;
  payer: Payer;
  price: number;
  patient_email?: string;
  decline_reason?: string;
  confirmed_at?: string | null;
  reminder_sent_at?: string | null;
  letter_sent_at?: string | null;
  details_at?: string | null;
  submitted_by?: string;
  walk_in?: boolean;
  service_label?: string;
  service_id?: string | null;
  firm: FirmInfo;
  mode?: 'clinic' | 'phone';
};

export type NoteRow = { id: string; body: string; created_at: string; kind?: 'note' | 'request'; resolved_at?: string | null };
export type DocRow = { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string; url?: string | null };
export type PaymentRow = {
  id?: string;
  amount: number;
  method: PayMethod;
  paid_on: string;
  receipt_no: string;
  receipt_url: string;
  note?: string;
  invoice_error?: string;
};

/** May the office see and download the doctor's document? (the doctor approved the payment, or it was paid in full) */
export const released = (r: { payment_ok_at?: string | null; price: number; paid: number }, gate: boolean) =>
  !gate || !!r.payment_ok_at || (Number(r.price) > 0 && Number(r.paid) + 0.001 >= Number(r.price));

/** Joins appointments with paid totals. */
export function withPaid<T extends { id: string; price: number | string }>(rows: T[], totals: { appointment_id: string; paid: number | string }[] | null) {
  const m = new Map((totals ?? []).map((t) => [t.appointment_id, Number(t.paid)]));
  return rows.map((r) => ({ ...r, price: Number(r.price), paid: m.get(r.id) ?? 0 }));
}
