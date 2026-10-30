'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { dbError } from '@/lib/constants';
import { ilToUtc } from '@/lib/dates';
import Icon from '@/components/Icon';
import QuickBook, { useQuickBook } from './QuickBook';

/** A free slot: book an appointment there, or block it. */
export function FreeSlot({ iso, label, minutes }: { iso: string; label: string; minutes: number }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const quick = useQuickBook();
  const block = () => start(async () => {
    const end = new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
    const { error } = await supabase.from('time_blocks').insert({ starts_at: iso, ends_at: end, note: '' });
    if (error) alert(dbError(error));
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <button type="button" className="cal-free-btn" onClick={() => setOpen(!open)} aria-label={`קביעת תור · ${label}`} title={`קביעת תור · ${label}`} aria-expanded={open}><Icon name="plus" size={13} /><span className="num">{label.split(' ').pop()}</span></button>
      {open && quick && <QuickBook iso={iso} onClose={() => setOpen(false)} onBlock={block} blocking={busy} />}
      {open && !quick && (
        <div className="cal-pop" role="menu">
          <b>{label}</b>
          <Link className="btn btn-sm btn-primary" href={`/doctor/book?slot=${encodeURIComponent(iso)}`}><Icon name="calendarPlus" />קביעת תור</Link>
          <button type="button" className="btn btn-sm" onClick={block} disabled={busy}><Icon name="x" />חסימת המשבצת</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>סגירה</button>
        </div>
      )}
    </>
  );
}

export function RemoveBlock({ id }: { id: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button type="button" className="cal-unblock" disabled={busy} title="ביטול החסימה" aria-label="ביטול החסימה"
      onClick={() => start(async () => { const { error } = await supabase.from('time_blocks').delete().eq('id', id); if (error) alert(dbError(error)); router.refresh(); })}>×</button>
  );
}

/** Block a range: a few hours, a whole day, or a vacation. */
export function BlockForm({ today }: { today: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: today, to: today, allDay: true, start: '09:00', end: '12:00', note: '' });
  const [msg, setMsg] = useState('');
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    if (f.to < f.from) return setMsg('תאריך הסיום לפני תאריך ההתחלה.');
    const s = ilToUtc(f.from, f.allDay ? '00:00' : f.start);
    const e = f.allDay ? ilToUtc(f.to, '23:59') : ilToUtc(f.to, f.end);
    if (e <= s) return setMsg('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
    const { error } = await supabase.from('time_blocks').insert({ starts_at: s.toISOString(), ends_at: e.toISOString(), note: f.note.trim().slice(0, 200) });
    if (error) return setMsg(dbError(error));
    setMsg('');
    setOpen(false);
    router.refresh();
  });
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="x" />חסימת זמן (חופשה, ניתוח, כנס)</button>;
  return (
    <section className="panel block-form">
      <div className="panel-head"><h2><Icon name="x" />חסימת זמן</h2><button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>סגירה</button></div>
      <div className="grid-3">
        <label className="field"><span>מתאריך</span><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /></label>
        <label className="field"><span>עד תאריך</span><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="field"><span>סיבה <small>רק הצוות רואה</small></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="חופשה" /></label>
      </div>
      <label className="check"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />ימים שלמים</label>
      {!f.allDay && (
        <div className="grid-3">
          <label className="field"><span>משעה</span><input type="time" step={300} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="field"><span>עד שעה</span><input type="time" step={300} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
      )}
      {msg && <p className="err">{msg}</p>}
      <div className="row"><button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'חסימה'}</button>
        <span className="hint">מפנים לא יוכלו לקבוע תור בזמן הזה. תורים קיימים לא משתנים.</span></div>
    </section>
  );
}
