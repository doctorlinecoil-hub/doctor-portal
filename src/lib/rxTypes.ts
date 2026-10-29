/** One line of a prescription. */
export type RxItem = {
  name: string; reg?: string; form?: string; strength?: string;
  dose: string; frequency: string; duration: string; quantity: string; notes?: string;
};
export type RxRow = { id: string; appointment_id: string; items: RxItem[]; notes: string; rx_date: string; rx_no?: number | null; created_at: string; sent_at: string | null };

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

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The prescription's table, as HTML (everything is escaped). Shared by the print page, the PDF and the live preview. */
export function rxTable(rx: { items: RxItem[]; notes: string }) {
  const rows = rx.items.map((i, n) => `<tr><td class="n">${n + 1}</td><td><b>${esc(i.name)}</b>${i.form || i.strength ? `<div class="sub">${esc([i.form, i.strength].filter(Boolean).join(' · '))}</div>` : ''}${i.notes ? `<div class="sub">${esc(i.notes)}</div>` : ''}</td><td>${esc(rxLine(i))}</td><td>${esc(i.quantity || '')}</td></tr>`).join('');
  return `<table class="rx"><thead><tr><th class="n">#</th><th>תרופה</th><th>מינון ואופן נטילה</th><th>כמות</th></tr></thead><tbody>${rows}</tbody></table>${rx.notes ? `<p><b>הערות:</b> ${esc(rx.notes)}</p>` : ''}`;
}
