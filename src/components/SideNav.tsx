'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import type { NavItem } from './AppShell';

export default function SideNav({ items, all, active }: { items: NavItem[]; all?: string[]; active?: string }) {
  const path = usePathname();
  // the best match across the whole menu (so /admin/reports doesn't also light up /admin)
  const current = active ?? (all ?? items.map((l) => l.href))
    .filter((h) => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="side-nav">
      {items.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined}
          onClick={() => { const t = document.getElementById('nav-toggle') as HTMLInputElement | null; if (t) t.checked = false; }}>
          <Icon name={l.icon} />{l.label}
        </Link>
      ))}
    </nav>
  );
}
