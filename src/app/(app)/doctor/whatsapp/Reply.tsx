'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { replyWhatsapp } from './actions';

/** The clinic's reply: free text within 24 hours of the patient's last message, with quick answers. */
export default function Reply({ phone, open, leftMin, name, clinic }: { phone: string; open: boolean; leftMin: number; name: string; clinic: { address: string; phone: string } }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hi = name ? `שלום ${name}, ` : 'שלום, ';
  const QUICK = [
    ['תודה, קיבלנו', `${hi}תודה על ההודעה, קיבלנו ונחזור אליך בהקדם.`],
    ['נחזור בהקדם', `${hi}הצוות בודק את הנושא ונעדכן אותך עוד היום.`],
    ...(clinic.address ? [['כתובת', `הכתובת שלנו: ${clinic.address}\nניווט: https://waze.com/ul?q=${encodeURIComponent(clinic.address)}&navigate=yes`]] : []),
    ['להביא מסמכים', `${hi}נא להביא לתור תעודה מזהה וכל מסמך רפואי רלוונטי (סיכומי ביקור, בדיקות, הדמיות).`],
    ['קביעת תור', 'לקביעת תור אפשר לכתוב כאן "תור", או בקישור: https://doctorline.co.il/book'],
  ] as [string, string][];
  if (!open) {
    return <div className="wa2-closed"><Icon name="clock" size={16} /><span>עברו 24 שעות מההודעה האחרונה של המטופל, ולכן וואטסאפ מאפשר לענות רק אחרי שיכתוב שוב. הודעות מוכנות (זימון, תזכורת, עדכון) ממשיכות לצאת אוטומטית.{clinic.phone ? ` אפשר גם להתקשר.` : ''}</span></div>;
  }
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    const r = await replyWhatsapp(phone, text).catch(() => ({ ok: false, error: 'השליחה נכשלה' }));
    setBusy(false);
    if (!r.ok) return setErr(r.error || 'השליחה נכשלה');
    setText('');
    router.refresh();
  };
  const h = Math.floor(leftMin / 60), m = leftMin % 60;
  return (
    <div className="wa2-reply">
      <div className="wa2-quick">
        {QUICK.map(([l, t]) => <button key={l} type="button" onClick={() => setText(t)}>{l}</button>)}
        <span className="wa2-window" title="וואטסאפ מאפשר לענות בטקסט חופשי עד 24 שעות מההודעה האחרונה של המטופל"><Icon name="clock" size={13} />{h > 0 ? `${h} ש׳ ${m} ד׳` : `${m} ד׳`} לענות</span>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="wa2-reply-row">
        <textarea rows={2} value={text} placeholder="כתיבת תשובה… (Enter לשליחה, Shift+Enter לשורה חדשה)" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="wa2-send" onClick={send} disabled={busy || !text.trim()} aria-label="שליחה"><Icon name="send" size={18} /></button>
      </div>
    </div>
  );
}
