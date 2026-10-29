// The letter body as sections (heading + text) for the editor, and back to plain text. Pure.

export type Section = { id: string; heading: string; text: string };

let n = 0;
const nid = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

const isHeading = (line: string) => {
  const l = line.trim();
  return l.length > 1 && l.length <= 70 && /[:：]$/.test(l) && !/^[-•]\s/.test(l);
};

export function toSections(body: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const raw of String(body || '').replace(/\r/g, '').split('\n')) {
    if (isHeading(raw)) {
      cur = { id: nid(), heading: raw.trim(), text: '' };
      out.push(cur);
    } else {
      if (!cur) { cur = { id: nid(), heading: '', text: '' }; out.push(cur); }
      cur.text += (cur.text ? '\n' : '') + raw;
    }
  }
  for (const s of out) s.text = s.text.replace(/^\n+|\n+$/g, '');
  return out.filter((s) => s.heading || s.text.trim());
}

export function fromSections(list: Section[]): string {
  return list
    .map((s) => {
      const h = s.heading.trim();
      const head = h ? (/[:：]$/.test(h) ? h : `${h}:`) : '';
      return [head, s.text.replace(/\s+$/g, '')].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

export const newSection = (heading = '', text = ''): Section => ({ id: nid(), heading, text });

export const PLACEHOLDER_ALL = /\[(להשלמת|לאישור|לבדיקת) הרופא[^\]]*\]/g;
export const countPlaceholders = (s: string) => (s.match(PLACEHOLDER_ALL) ?? []).length;
