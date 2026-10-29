// Rich letters (Word-like editing). The body is stored as HTML with a marker; older letters are plain text.
// Everything that renders a letter (editor, print page, PDF) goes through sanitizeHtml, so only safe formatting survives.

export const RICH = '<!--rich-->';

export const isRich = (body: string | null | undefined) => String(body ?? '').startsWith(RICH);
export const richBody = (html: string) => RICH + html;
export const stripMarker = (body: string) => (isRich(body) ? body.slice(RICH.length) : body);

const escOnly = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** escapes, and marks "[להשלמת הרופא…]" in yellow so the doctor sees what to complete */
const esc = (s: string) => escOnly(s).replace(/\[(להשלמת|לאישור|לבדיקת) הרופא[^\]]*\]/g, (m) => `<span style="background-color: #FDECC8">${m}</span>`);

/** Plain text (AI drafts, templates, older letters) → HTML. "Heading:" lines become headings, "- " lines become lists. */
export function textToHtml(text: string) {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`); list = []; } };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-•]\s+/.test(line)) { list.push(esc(line.replace(/^[-•]\s+/, ''))); continue; }
    flush();
    if (line.length <= 70 && /[:：]$/.test(line)) out.push(`<h3>${esc(line)}</h3>`);
    else out.push(`<p>${esc(line)}</p>`);
  }
  flush();
  return out.join('');
}

/** Any stored body → safe HTML. */
export function bodyToHtml(body: string | null | undefined) {
  const b = String(body ?? '');
  return isRich(b) ? sanitizeHtml(stripMarker(b)) : textToHtml(b);
}

/** HTML → plain text (for checks like "are there [להשלמת הרופא] markers left"). */
export function htmlToText(html: string) {
  return String(html || '')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of any stored body (rich or plain). */
export const bodyText = (body: string | null | undefined) => (isRich(body) ? htmlToText(stripMarker(String(body))) : String(body ?? ''));

const TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'span', 'div', 'blockquote', 'font', 'sub', 'sup']);
const VOID = new Set(['br', 'hr']);
const STYLE_PROPS = new Set(['text-align', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'padding-right', 'padding-left', 'margin-right', 'margin-left', 'width', 'direction']);
const SAFE_VALUE = /^[#(),.%\w\s-]{1,60}$/;

function cleanStyle(style: string) {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (STYLE_PROPS.has(prop) && SAFE_VALUE.test(val) && !/url|expression|javascript/i.test(val)) out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

/** Allow-list sanitizer: known formatting tags, a few style properties, nothing executable. */
export function sanitizeHtml(html: string) {
  let s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|select|button|form|input)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!TAGS.has(t)) return '';
    if (m.startsWith('</')) return VOID.has(t) ? '' : `</${t}>`;
    const keep: string[] = [];
    const style = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    if (style) { const c = cleanStyle(style[2] ?? style[3] ?? ''); if (c) keep.push(`style="${c.replace(/"/g, '')}"`); }
    const align = /\balign\s*=\s*["']?(right|left|center|justify)["']?/i.exec(attrs);
    if (align) keep.push(`style="text-align: ${align[1].toLowerCase()}"`);
    if (t === 'font') {
      const size = /\bsize\s*=\s*["']?([1-7])["']?/i.exec(attrs);
      const color = /\bcolor\s*=\s*["']?(#[0-9a-f]{3,8}|[a-z]{3,20})["']?/i.exec(attrs);
      if (size) keep.push(`size="${size[1]}"`);
      if (color) keep.push(`color="${color[1]}"`);
    }
    if (t === 'td' || t === 'th') {
      const span = /\bcolspan\s*=\s*["']?(\d{1,2})["']?/i.exec(attrs);
      if (span) keep.push(`colspan="${span[1]}"`);
    }
    return `<${t}${keep.length ? ' ' + keep.join(' ') : ''}${VOID.has(t) ? ' /' : ''}>`;
  });
  return s;
}
