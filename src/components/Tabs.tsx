'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

export type Tab = { key: string; label: string; icon: string; badge?: string | number | null; content: React.ReactNode };

/** Steps of work on one case, as tabs. The open tab is kept in the address (#letter), so a refresh stays on it. */
export default function Tabs({ tabs, initial }: { tabs: Tab[]; initial: string }) {
  const [cur, setCur] = useState(initial);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h && tabs.some((t) => t.key === h)) setCur(h);
  }, [tabs]);
  const pick = (k: string) => {
    setCur(k);
    history.replaceState(null, '', `#${k}`);
  };
  return (
    <div className="ctabs">
      <nav className="ctabs-bar" role="tablist" aria-label="שלבי העבודה בתיק">
        {tabs.map((t, i) => (
          <button key={t.key} type="button" role="tab" aria-selected={cur === t.key} className="ctab" onClick={() => pick(t.key)}>
            <span className="ctab-n num">{i + 1}</span>
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {t.badge != null && t.badge !== '' && t.badge !== 0 && <span className="ctab-badge">{t.badge}</span>}
          </button>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={cur !== t.key} className="ctab-panel">{t.content}</div>
      ))}
    </div>
  );
}
