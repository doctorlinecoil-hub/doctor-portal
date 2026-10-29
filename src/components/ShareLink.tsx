'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

/** The booking link, ready to send: copy, WhatsApp, email. */
export default function ShareLink({ path, title, sub, compact }: { path: string; title: string; sub?: string; compact?: boolean }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(window.location.origin + path); }, [path]);
  const text = `שלום, לקביעת תור אצל ד״ר אלרן חנוך (בדיקה, חוות דעת או מכתב רפואי), אפשר למלא כאן את הפרטים ולבחור מועד:\n${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* older browsers */ } };
  const buttons = (
    <div className="row" style={{ gap: 6 }}>
      <button type="button" className="btn btn-sm" onClick={copy}><Icon name={copied ? 'check' : 'save'} />{copied ? 'הועתק' : 'העתקה'}</button>
      <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener"><Icon name="message" />וואטסאפ</a>
      <a className="btn btn-sm" href={`mailto:?subject=${encodeURIComponent('קביעת תור – ד״ר אלרן חנוך')}&body=${encodeURIComponent(text)}`}><Icon name="mail" />מייל</a>
      <a className="btn btn-sm btn-ghost" href={path} target="_blank" rel="noopener"><Icon name="externalLink" />פתיחה</a>
    </div>
  );
  if (compact) return <div className="share-compact"><span className="hint">{title}</span>{buttons}</div>;
  return (
    <section className="share-card">
      <span className="share-ic"><Icon name="calendarPlus" /></span>
      <div><b>{title}</b>{sub && <span>{sub}</span>}<code>{url}</code></div>
      {buttons}
    </section>
  );
}
