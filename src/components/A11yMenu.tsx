'use client';
import { useEffect, useState } from 'react';

/*
 * Accessibility menu (every page): text size, high contrast, highlighted links, a plain font,
 * stopped animations and grayscale. The choice is kept in this browser.
 */

type Prefs = { size: 0 | 1 | 2; contrast: boolean; links: boolean; plain: boolean; still: boolean; gray: boolean };
const EMPTY: Prefs = { size: 0, contrast: false, links: false, plain: false, still: false, gray: false };
const KEY = 'a11y-prefs';

function apply(p: Prefs) {
  const h = document.documentElement;
  h.dataset.a11ySize = String(p.size);
  h.classList.toggle('a11y-contrast', p.contrast);
  h.classList.toggle('a11y-links', p.links);
  h.classList.toggle('a11y-plain', p.plain);
  h.classList.toggle('a11y-still', p.still);
  h.classList.toggle('a11y-gray', p.gray);
}

export default function A11yMenu() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Prefs>(EMPTY);
  const [framed, setFramed] = useState(false);

  useEffect(() => {
    try { setFramed(window.self !== window.top); } catch { setFramed(true); }
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { setP({ ...EMPTY, ...v }); apply({ ...EMPTY, ...v }); } } catch { /* storage blocked */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const set = (n: Partial<Prefs>) => {
    const v = { ...p, ...n };
    setP(v);
    apply(v);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
  };
  const toggle = (k: keyof Omit<Prefs, 'size'>, label: string) => (
    <button type="button" role="switch" aria-checked={p[k]} className={p[k] ? 'on' : ''} onClick={() => set({ [k]: !p[k] } as Partial<Prefs>)}>{label}</button>
  );

  if (framed) return null; // inside the letter preview frame
  return (
    <div className="a11y no-print">
      <button type="button" className="a11y-btn" aria-expanded={open} aria-controls="a11y-panel" aria-label="תפריט נגישות" title="נגישות" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="4.2" r="2.2" /><path d="M4 7.6c2.6.8 5.3 1.2 8 1.2s5.4-.4 8-1.2l.5 1.9c-2.2.7-4.4 1.1-6.6 1.3v3.4l2.2 7.3-1.9.6L12 15.6l-2.2 6.5-1.9-.6 2.2-7.3v-3.4c-2.2-.2-4.4-.6-6.6-1.3Z" /></svg>
      </button>
      {open && (
        <div id="a11y-panel" className="a11y-panel" role="dialog" aria-label="הגדרות נגישות">
          <div className="a11y-head"><b>נגישות</b><button type="button" className="a11y-x" aria-label="סגירה" onClick={() => setOpen(false)}>×</button></div>
          <div className="a11y-size" role="group" aria-label="גודל טקסט">
            <span>גודל טקסט</span>
            {(['רגיל', 'גדול', 'גדול מאוד'] as const).map((l, i) => (
              <button key={l} type="button" aria-pressed={p.size === i} className={p.size === i ? 'on' : ''} onClick={() => set({ size: i as 0 | 1 | 2 })} style={{ fontSize: 13 + i * 2 }}>א</button>
            ))}
          </div>
          <div className="a11y-grid">
            {toggle('contrast', 'ניגודיות גבוהה')}
            {toggle('links', 'הדגשת קישורים')}
            {toggle('plain', 'גופן קריא')}
            {toggle('still', 'עצירת אנימציות')}
            {toggle('gray', 'גווני אפור')}
            <button type="button" onClick={() => set(EMPTY)}>איפוס</button>
          </div>
          <a className="a11y-link" href="/accessibility">הצהרת נגישות</a>
        </div>
      )}
    </div>
  );
}
