'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { replyWhatsapp } from './actions';

export default function Reply({ phone, open }: { phone: string; open: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return <div className="wa-closed"><Icon name="clock" size={15} />עברו 24 שעות מההודעה האחרונה של המטופל, ולכן אפשר לענות רק אחרי שהוא יכתוב שוב. הודעות מוכנות (זימון, תזכורת, עדכון) ממשיכות לצאת אוטומטית.</div>;
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    const r = await replyWhatsapp(phone, text).catch(() => ({ ok: false, error: 'השליחה נכשלה' }));
    setBusy(false);
    if (!r.ok) return setErr(r.error || 'השליחה נכשלה');
    setText('');
    router.refresh();
  };
  return (
    <div className="wa-reply">
      {err && <div className="err">{err}</div>}
      <div className="wa-reply-row">
        <textarea rows={2} value={text} placeholder="כתיבת תשובה…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !text.trim()} aria-label="שליחה"><Icon name="send" size={16} />{busy ? 'שולח…' : 'שליחה'}</button>
      </div>
    </div>
  );
}
