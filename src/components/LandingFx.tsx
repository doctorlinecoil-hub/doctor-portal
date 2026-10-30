'use client';
import { useEffect } from 'react';

/* The landing page's motion: the header turns solid on scroll, sections fade in, numbers count up. */
export default function LandingFx() {
  useEffect(() => {
    const root = document.documentElement;
    const still = root.classList.contains('a11y-still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nav = document.querySelector('.lp-nav');
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const items = Array.from(document.querySelectorAll<HTMLElement>('.rv'));
    const counters = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
    const count = (el: HTMLElement) => {
      const to = Number(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || '';
      if (still) { el.textContent = `${to}${suffix}`; return; }
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        el.textContent = `${Math.round(to * (1 - Math.pow(1 - k, 3)))}${suffix}`;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (still || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      counters.forEach(count);
      return () => window.removeEventListener('scroll', onScroll);
    }
    root.classList.add('rv-on');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('in');
        if (el.dataset.count) count(el);
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(count);
        io.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
    counters.filter((c) => !c.closest('.rv')).forEach((c) => io.observe(c));
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); root.classList.remove('rv-on'); };
  }, []);
  return null;
}
