import Link from 'next/link';
import Icon from './Icon';

export function PageHead({ title, sub, crumbs, children }: { title: React.ReactNode; sub?: React.ReactNode; crumbs?: { href: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && crumbs.length > 0 && (
          <nav className="crumbs" aria-label="מיקום">
            {crumbs.map((c) => (
              <span key={c.href} className="row" style={{ gap: 6 }}>
                <Link href={c.href}>{c.label}</Link>
                <Icon name="chevron" />
              </span>
            ))}
          </nav>
        )}
        {title ? <h1>{title}</h1> : null}
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Stat({ icon, label, value, tone }: { icon: string; label: string; value: React.ReactNode; tone?: 'info' | 'warn' | 'ok' | 'bad' | 'violet' }) {
  return (
    <div className="stat">
      <div className={`stat-ic ${tone ?? ''}`}><Icon name={icon} /></div>
      <div><span>{label}</span><b>{value}</b></div>
    </div>
  );
}

export function Empty({ icon = 'folder', children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function initials(name: string) {
  const parts = name.replace(/[״"׳']/g, '').split(/\s+/).filter(Boolean);
  if (parts[0] === 'דר' || parts[0] === 'ד') parts.shift();
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}
