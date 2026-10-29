'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * A search box with live suggestions from one of the clinic's lookup services
 * (the Ministry of Health drug registry, or the ICD-10 diagnoses list).
 */
export default function Lookup<T>({ endpoint, placeholder, render, onPick, onFree, freeLabel, hint, icon = 'search', autoFocus, initial = '' }: {
  endpoint: string; placeholder: string; render: (x: T) => React.ReactNode; onPick: (x: T) => void;
  /** use the typed text as is */
  onFree?: (text: string) => void; freeLabel?: string; hint?: string; icon?: string; autoFocus?: boolean; initial?: string;
}) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const box = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setErr(''); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (n !== seq.current) return;
        setHits((j.hits as T[]) ?? []);
        setErr(j.error || '');
        setAt(-1);
      } catch {
        if (n === seq.current) setErr('החיפוש לא זמין כרגע.');
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q, endpoint]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (x: T) => { onPick(x); setQ(''); setHits([]); setOpen(false); };
  const free = () => { if (onFree && q.trim()) { onFree(q.trim()); setQ(''); setHits([]); setOpen(false); } };

  return (
    <div className="lookup" ref={box}>
      <div className="lookup-input">
        <Icon name={icon} size={17} />
        <input
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(at + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(at - 1, -1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (at >= 0 && hits[at]) pick(hits[at]); else free(); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-autocomplete="list"
        />
        {busy && <span className="lookup-spin" aria-hidden="true" />}
      </div>
      {hint && !q && <p className="hint" style={{ margin: '4px 2px 0' }}>{hint}</p>}
      {open && q.trim().length >= 2 && (hits.length > 0 || err || onFree) && (
        <ul className="lookup-list" role="listbox">
          {hits.map((x, i) => (
            <li key={i} role="option" aria-selected={i === at}>
              <button type="button" className={i === at ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)}>{render(x)}</button>
            </li>
          ))}
          {err && <li className="lookup-err">{err}</li>}
          {!busy && !hits.length && !err && <li className="lookup-err">לא נמצאו תוצאות.</li>}
          {onFree && (
            <li><button type="button" className="lookup-free" onMouseDown={(e) => e.preventDefault()} onClick={free}><Icon name="plus" size={15} />{freeLabel || 'הוספה כפי שנכתב'}: <b>{q.trim()}</b></button></li>
          )}
        </ul>
      )}
    </div>
  );
}
