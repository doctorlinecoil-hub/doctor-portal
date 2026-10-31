'use client';
import { useMemo, useState } from 'react';
import Icon from './Icon';

export type PayCard = { id: string; node: React.ReactNode; proof: boolean; days: number; search: string };
type F = 'all' | 'proof' | 'none' | 'old';

/** The waiting payments with quick filters and a search; the cards themselves are rendered on the server. */
export default function PayBoard({ cards }: { cards: PayCard[] }) {
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const counts = useMemo(() => ({
    all: cards.length,
    proof: cards.filter((c) => c.proof).length,
    none: cards.filter((c) => !c.proof).length,
    old: cards.filter((c) => c.days >= 14).length,
  }), [cards]);
  const term = q.trim().toLowerCase();
  const shown = cards.filter((c) => (f === 'all' || (f === 'proof' ? c.proof : f === 'none' ? !c.proof : c.days >= 14)) && (!term || c.search.includes(term)));
  const tabs: [F, string, string][] = [['all', 'הכל', 'list'], ['proof', 'אסמכתא לבדיקה', 'fileCheck'], ['none', 'בלי אסמכתא', 'clock'], ['old', 'מעל שבועיים', 'alert']];
  return (
    <div className="pq">
      <div className="pq-bar">
        <div className="pq-tabs" role="tablist" aria-label="סינון">
          {tabs.map(([k, l, ic]) => (
            <button key={k} type="button" role="tab" aria-selected={f === k} className={`${f === k ? 'on' : ''}${k === 'proof' && counts.proof ? ' hot' : ''}`} onClick={() => setF(k)} disabled={k !== 'all' && !counts[k]}>
              <Icon name={ic} size={14} />{l}<span className="num">{counts[k]}</span>
            </button>
          ))}
        </div>
        <label className="pq-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מטופל, מפנה או תיק" aria-label="חיפוש" /></label>
      </div>
      {shown.length ? <div className="pp-grid">{shown.map((c) => <div key={c.id} className="pq-cell">{c.node}</div>)}</div>
        : <div className="pp-card"><div className="pp-zero"><Icon name="search" size={20} />אין תוצאות לסינון הזה.</div></div>}
    </div>
  );
}
