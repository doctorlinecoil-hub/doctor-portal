'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { markDone, setBotMode } from './actions';

/** Who answers: the assistant, or the clinic by hand. */
export function BotToggle({ phone, human, disabled }: { phone: string; human: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (mode: 'bot' | 'human') => { setBusy(true); await setBotMode(phone, mode).catch(() => undefined); setBusy(false); router.refresh(); };
  return (
    <div className="wa2-seg" role="radiogroup" aria-label="מי עונה">
      <button type="button" role="radio" aria-checked={!human} className={!human ? 'on' : ''} disabled={busy || disabled} onClick={() => set('bot')}>🤖 הבוט</button>
      <button type="button" role="radio" aria-checked={human} className={human ? 'on' : ''} disabled={busy} onClick={() => set('human')}>👤 אני עונה</button>
    </div>
  );
}

/** The conversation was handled: it leaves the "waiting" list. */
export function DoneButton({ phone }: { phone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn-ok wa2-done" disabled={busy} onClick={async () => { setBusy(true); await markDone(phone).catch(() => undefined); setBusy(false); router.refresh(); }}>
      <Icon name="checkCircle" size={16} />{busy ? 'מסמן…' : 'סימון כטופל'}
    </button>
  );
}

/** Keeps the conversation scrolled to the newest message. */
export function ScrollBottom({ dep }: { dep: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [dep]);
  return <span ref={ref} aria-hidden />;
}
