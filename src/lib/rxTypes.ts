/** One line of a prescription. */
export type RxItem = {
  name: string; reg?: string; form?: string; strength?: string;
  dose: string; frequency: string; duration: string; quantity: string; notes?: string;
};
export type RxRow = { id: string; appointment_id: string; items: RxItem[]; notes: string; rx_date: string; created_at: string; sent_at: string | null };

export const FREQUENCIES = ['פעם ביום', 'פעמיים ביום', '3 פעמים ביום', '4 פעמים ביום', 'כל 8 שעות', 'כל 12 שעות', 'לפני השינה', 'בבוקר', 'לפי הצורך', 'פעם בשבוע'];
export const DURATIONS = ['3 ימים', '5 ימים', '7 ימים', '10 ימים', '14 ימים', 'חודש', '3 חודשים', 'טיפול קבוע'];

/** Cleans what the browser sends: only known fields, bounded lengths, at most 30 lines. */
export function cleanItems(raw: unknown): RxItem[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  return raw.slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { name: s(o.name, 200), reg: s(o.reg, 40), form: s(o.form, 120), strength: s(o.strength, 200), dose: s(o.dose, 120), frequency: s(o.frequency, 120), duration: s(o.duration, 120), quantity: s(o.quantity, 120), notes: s(o.notes, 300) };
  }).filter((i) => i.name);
}

export const rxLine = (i: RxItem) => [i.dose, i.frequency, i.duration && `למשך ${i.duration}`].filter(Boolean).join(' · ');
