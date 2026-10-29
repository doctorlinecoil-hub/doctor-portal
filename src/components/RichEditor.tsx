'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Icon from './Icon';
import { sanitizeHtml, textToHtml } from '@/lib/richtext';

export type RichHandle = {
  insertHtml: (html: string) => void;
  insertText: (text: string) => void;
  setHtml: (html: string) => void;
  focusNextPlaceholder: () => boolean;
  selectedText: () => string;
};

const COLORS = ['#111111', '#112243', '#1F5FB8', '#B42318', '#9A6200', '#6941C6'];
const MARKS = ['#FFF3B0', '#D7F5E9', '#DCE8FB', 'transparent'];

/** A Word-like editor: formatting, lists, alignment, tables. Stores sanitized HTML. */
const RichEditor = forwardRef<RichHandle, {
  html: string; onChange: (html: string) => void; readOnly?: boolean; placeholder?: string; extraTools?: React.ReactNode;
  /** printed parts around the editable body (letterhead, signature) */
  header?: React.ReactNode; footer?: React.ReactNode;
}>(function RichEditor({ html, onChange, readOnly, placeholder, extraTools, header, footer }, ref) {
  const el = useRef<HTMLDivElement | null>(null);
  const range = useRef<Range | null>(null);
  const lastHtml = useRef('');
  const [state, setState] = useState<Record<string, boolean | string>>({});
  const [pop, setPop] = useState<'' | 'color' | 'mark' | 'table'>('');

  // set the content only when it changes from outside (AI draft, template), never while typing
  useEffect(() => {
    if (!el.current) return;
    if (html !== lastHtml.current) {
      el.current.innerHTML = html;
      lastHtml.current = html;
    }
  }, [html]);

  useEffect(() => {
    try { document.execCommand('styleWithCSS', false, 'true'); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browsers */ }
    const onSel = () => {
      const sel = document.getSelection();
      if (!sel || !el.current || !sel.rangeCount || !el.current.contains(sel.anchorNode)) return;
      range.current = sel.getRangeAt(0).cloneRange();
      const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
      let block = '';
      try { block = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch { /* ignore */ }
      setState({ bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), ul: q('insertUnorderedList'), ol: q('insertOrderedList'),
        right: q('justifyRight'), center: q('justifyCenter'), left: q('justifyLeft'), full: q('justifyFull'), block });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const emit = () => {
    if (!el.current) return;
    const h = el.current.innerHTML;
    lastHtml.current = h;
    onChange(h);
  };
  const restore = () => {
    if (!el.current) return;
    el.current.focus();
    const sel = document.getSelection();
    if (range.current && sel) { sel.removeAllRanges(); sel.addRange(range.current); }
    else if (sel) { const r = document.createRange(); r.selectNodeContents(el.current); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  };
  const cmd = (c: string, v?: string) => { restore(); document.execCommand(c, false, v); emit(); };
  const insertHtml = (h: string) => { restore(); document.execCommand('insertHTML', false, sanitizeHtml(h)); emit(); };

  useImperativeHandle(ref, () => ({
    insertHtml,
    insertText: (t: string) => { restore(); document.execCommand('insertText', false, t); emit(); },
    setHtml: (h: string) => { if (el.current) { el.current.innerHTML = h; lastHtml.current = h; onChange(h); } },
    focusNextPlaceholder: () => {
      if (!el.current) return false;
      const walker = document.createTreeWalker(el.current, NodeFilter.SHOW_TEXT);
      const re = /\[(להשלמת|לאישור|לבדיקת) הרופא[^\]]*\]/;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const m = re.exec(n.textContent || '');
        if (m) {
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          const sel = document.getSelection();
          el.current.focus();
          sel?.removeAllRanges();
          sel?.addRange(r);
          (n.parentElement as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
      }
      return false;
    },
    selectedText: () => document.getSelection()?.toString() ?? '',
  }));

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const h = e.clipboardData.getData('text/html');
    const t = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, h ? sanitizeHtml(h.replace(/<\/?(html|body|head|meta|o:p|xml)[^>]*>/gi, '')) : textToHtml(t));
    emit();
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); cmd(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'); }
    }
    if (e.key === 'Tab') { e.preventDefault(); cmd(e.shiftKey ? 'outdent' : 'indent'); }
  };

  const B = ({ c, v, on, icon, label, text }: { c: string; v?: string; on?: boolean; icon?: string; label: string; text?: string }) => (
    <button type="button" className={`tb${on ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={!!on}
      onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c, v)} disabled={readOnly}>
      {icon ? <Icon name={icon} size={17} /> : <span className="tb-t">{text}</span>}
    </button>
  );
  const blockVal = String(state.block || '').replace(/[<>]/g, '');

  return (
    <div className={`rich${readOnly ? ' ro' : ''}`}>
      <div className="ribbon" role="toolbar" aria-label="עיצוב המכתב">
        <div className="tb-group">
          <B c="undo" icon="undo" label="ביטול (Ctrl+Z)" />
          <B c="redo" icon="redo" label="שחזור (Ctrl+Y)" />
        </div>
        <div className="tb-group">
          <select className="tb-select" aria-label="סגנון" value={['h2', 'h3', 'h4', 'blockquote'].includes(blockVal) ? blockVal : 'p'} disabled={readOnly}
            onMouseDown={() => restore()} onChange={(e) => cmd('formatBlock', `<${e.target.value}>`)}>
            <option value="p">טקסט רגיל</option>
            <option value="h2">כותרת ראשית</option>
            <option value="h3">כותרת סעיף</option>
            <option value="h4">כותרת משנה</option>
            <option value="blockquote">ציטוט</option>
          </select>
          <select className="tb-select" aria-label="גודל" defaultValue="" disabled={readOnly} onChange={(e) => { if (e.target.value) cmd('fontSize', e.target.value); e.target.value = ''; }}>
            <option value="">גודל</option>
            <option value="2">קטן</option>
            <option value="3">רגיל</option>
            <option value="4">גדול</option>
            <option value="5">גדול מאוד</option>
          </select>
        </div>
        <div className="tb-group">
          <B c="bold" on={!!state.bold} label="הדגשה (Ctrl+B)" text="B" />
          <B c="italic" on={!!state.italic} label="נטוי (Ctrl+I)" text="I" />
          <B c="underline" on={!!state.underline} label="קו תחתון (Ctrl+U)" text="U" />
          <B c="strikeThrough" on={!!state.strike} label="קו חוצה" text="S" />
          <span className="tb-wrap">
            <button type="button" className="tb" title="צבע טקסט" aria-label="צבע טקסט" onMouseDown={(e) => e.preventDefault()} onClick={() => setPop(pop === 'color' ? '' : 'color')} disabled={readOnly}><span className="tb-t" style={{ borderBottom: '3px solid #B42318' }}>A</span></button>
            {pop === 'color' && <span className="tb-pop">{COLORS.map((c) => <button type="button" key={c} className="swatch" style={{ background: c }} aria-label={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { cmd('foreColor', c); setPop(''); }} />)}</span>}
          </span>
          <span className="tb-wrap">
            <button type="button" className="tb" title="סימון בצבע" aria-label="סימון בצבע" onMouseDown={(e) => e.preventDefault()} onClick={() => setPop(pop === 'mark' ? '' : 'mark')} disabled={readOnly}><Icon name="marker" size={17} /></button>
            {pop === 'mark' && <span className="tb-pop">{MARKS.map((c) => <button type="button" key={c} className="swatch" style={{ background: c === 'transparent' ? '#fff' : c }} aria-label={c === 'transparent' ? 'ללא סימון' : c} onMouseDown={(e) => e.preventDefault()} onClick={() => { cmd('hiliteColor', c); setPop(''); }}>{c === 'transparent' ? '×' : ''}</button>)}</span>}
          </span>
        </div>
        <div className="tb-group">
          <B c="justifyRight" on={!!state.right} icon="alignRight" label="יישור לימין" />
          <B c="justifyCenter" on={!!state.center} icon="alignCenter" label="מרכוז" />
          <B c="justifyLeft" on={!!state.left} icon="alignLeft" label="יישור לשמאל" />
          <B c="justifyFull" on={!!state.full} icon="alignJustify" label="יישור לשני הצדדים" />
        </div>
        <div className="tb-group">
          <B c="insertUnorderedList" on={!!state.ul} icon="listBullet" label="תבליטים" />
          <B c="insertOrderedList" on={!!state.ol} icon="listNumber" label="מספור" />
          <B c="outdent" icon="outdent" label="הקטנת הזחה" />
          <B c="indent" icon="indent" label="הגדלת הזחה" />
        </div>
        <div className="tb-group">
          <span className="tb-wrap">
            <button type="button" className="tb" title="טבלה" aria-label="הוספת טבלה" onMouseDown={(e) => e.preventDefault()} onClick={() => setPop(pop === 'table' ? '' : 'table')} disabled={readOnly}><Icon name="table" size={17} /></button>
            {pop === 'table' && (
              <span className="tb-pop col">
                {[[2, 2], [3, 2], [3, 3], [4, 3]].map(([c, r]) => (
                  <button type="button" key={`${c}${r}`} className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                    const row = `<tr>${'<td>&nbsp;</td>'.repeat(c)}</tr>`;
                    insertHtml(`<table><tbody>${row.repeat(r)}</tbody></table><p><br></p>`);
                    setPop('');
                  }}>{c} עמודות × {r} שורות</button>
                ))}
              </span>
            )}
          </span>
          <B c="insertHorizontalRule" icon="minus" label="קו מפריד" />
          <B c="removeFormat" icon="eraser" label="ניקוי עיצוב" />
        </div>
        {extraTools && <div className="tb-group tb-extra">{extraTools}</div>}
      </div>
      <div className="desk">
      <div className="page">
      {header}
      <div
        ref={el}
        className="rich-body lt-rich"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="גוף המכתב"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onKeyDown={onKey}
        dir="rtl"
      />
      {footer}
      </div>
      </div>
    </div>
  );
});

export default RichEditor;
