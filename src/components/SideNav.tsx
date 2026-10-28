'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import type { NavItem } from './AppShell';

export default function SideNav({ items, active }: { items: NavItem[]; active?: string }) {
  const path = usePathname();
  const current = active ?? items
    .filter((l) => path === l.href || path.startsWith(l.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
