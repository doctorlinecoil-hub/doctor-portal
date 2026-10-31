'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a page current without reloading: refreshes the server data every few seconds while the tab is visible,
 * and right away when the user comes back to the tab. Skips a beat while someone is typing or a window is open.
 */
export default function LiveRefresh({ every = 20 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
      return typing || !!document.querySelector('.qb-layer, .fc-layer, [role="dialog"][aria-modal="true"]');
    };
    const tick = () => { if (document.visibilityState === 'visible' && !busy()) router.refresh(); };
    const id = setInterval(tick, Math.max(10, every) * 1000);
    const back = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [router, every]);
  return null;
}
