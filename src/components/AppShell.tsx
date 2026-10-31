import Link from 'next/link';
import type { Role } from '@/lib/constants';
import Icon from './Icon';
import SideNav from './SideNav';
import LogoutButton from './LogoutButton';
import NotificationBell from './NotificationBell';

export type NavItem = { href: string; label: string; icon: string };

export function navFor(role: Role): { title: string; items: NavItem[] }[] {
  if (role === 'firm') {
    return [{ title: 'פורטל מפנים', items: [
      { href: '/firm', label: 'דשבורד', icon: 'chart' },
      { href: '/firm/book', label: 'זימון חדש', icon: 'calendarPlus' },
      { href: '/firm/cases', label: 'התיקים שלי', icon: 'folder' },
    ] }];
  }
  const doctor = { title: 'מרפאה', items: [
    { href: '/doctor', label: 'דשבורד ויומן', icon: 'home' },
    { href: '/doctor/new', label: 'מסמך / מרשם חדש', icon: 'plus' },
    { href: '/doctor/services', label: 'סוגי שירות ומחירים', icon: 'receipt' },
    { href: '/doctor/payments', label: 'אישור תשלומים', icon: 'wallet' },
    { href: '/doctor/whatsapp', label: 'שיחות וואטסאפ', icon: 'message' },
    { href: '/admin/reports', label: 'דוחות וגבייה', icon: 'chart' },
  ] };
  if (role === 'doctor') return [doctor];
  return [doctor, { title: 'ניהול', items: [
    { href: '/admin/users', label: 'מפנים ומשתמשים', icon: 'users' },
    { href: '/admin', label: 'הגדרות', icon: 'settings' },
    { href: '/admin/system', label: 'מפת המערכת', icon: 'activity' },
  ] }];
}

const ROLE_LABEL: Record<Role, string> = { admin: 'מנהל מערכת', doctor: 'רופא', firm: 'מפנה' };

export default function AppShell({ role, userName, orgName, clinicName, active, children }: {
  role: Role; userName: string; orgName?: string; clinicName: string; active?: string; children: React.ReactNode;
}) {
  const groups = navFor(role);
  const brand = (
    <Link href="/" className="side-brand">
      <span className="logo logo-img"><img src="/brand/emblem.png" alt="" width={40} height={40} /></span>
      <span><b>{clinicName}</b><span>{role === 'firm' ? 'פורטל מפנים' : 'מערכת המרפאה'}</span></span>
    </Link>
  );
  return (
    <div className="app">
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-label="פתיחת תפריט" />
      <aside className="side no-print" aria-label="תפריט ראשי">
        <div className="side-top">{brand}<NotificationBell dark on="desktop" /></div>
        {role !== 'firm' && (
          <form action="/doctor/search" role="search" className="side-search">
            <Icon name="search" /><input name="q" placeholder="חיפוש מטופל, ת״ז, תיק" aria-label="חיפוש" />
          </form>
        )}
        {groups.map((g) => (
          <div key={g.title} className="stack-sm">
            <div className="side-label">{g.title}</div>
            <SideNav items={g.items} all={groups.flatMap((x) => x.items.map((i) => i.href))} active={active} />
          </div>
        ))}
        <div className="side-foot">
          <a href="/?view=public" target="_blank" rel="noopener" className="side-public"><Icon name="externalLink" size={15} />{role === 'firm' ? 'דף הבית של המרפאה' : 'צפייה בדף הנחיתה'}</a>
          <div className="me">
            <span className="avatar"><Icon name="user" /></span>
            <span><b>{userName}</b><span>{orgName || ROLE_LABEL[role]}</span></span>
          </div>
          <div className="side-actions">
            <Link href="/auth/set-password"><Icon name="key" />סיסמה</Link>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <label htmlFor="nav-toggle" className="scrim" aria-hidden="true" />
      <div className="main">
        <header className="topbar no-print">
          {brand}
          <div className="row" style={{ gap: 4 }}>
            <NotificationBell on="mobile" />
            <label htmlFor="nav-toggle" className="menu-btn" aria-label="תפריט"><Icon name="menu" /></label>
          </div>
        </header>
        <main className="content" id="main">{children}</main>
      </div>
    </div>
  );
}
