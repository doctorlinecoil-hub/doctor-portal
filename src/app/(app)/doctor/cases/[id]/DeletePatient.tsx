'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { deletePatient } from '../../actions';

/** Delete this patient for good (all their cases), after typing the patient's name. */
export default function DeletePatient({ appointmentId, name, cases }: { appointmentId: string; name: string; cases: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn btn-sm btn-ghost dp-btn" onClick={() => setOpen(true)}><Icon name="trash" size={14} />מחיקת המטופל</button>;
  return (
    <div className="dp" role="dialog" aria-label="מחיקת מטופל">
      <b><Icon name="alert" size={16} />מחיקה לצמיתות של {name}</b>
      <p>{cases > 1 ? `יימחקו כל ${cases} התיקים של המטופל` : 'יימחק התיק'}: מסמכים, מכתבים, תשלומים וקבצים. אי אפשר לשחזר.</p>
      <label><span>לאישור, הקלידו את שם המטופל: <b>{name}</b></span><input value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
      {err && <small className="bad-t" role="alert">{err}</small>}
      <div className="row">
        <button type="button" className="btn btn-sm btn-danger" disabled={pending || !text.trim()} onClick={() => start(async () => {
          const r = await deletePatient(appointmentId, text);
          if (!r.ok) return setErr(r.error || 'המחיקה נכשלה');
          router.push('/doctor');
        })}><Icon name="trash" size={14} />{pending ? 'מוחק…' : 'מחיקה לצמיתות'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setOpen(false); setText(''); setErr(''); }}>ביטול</button>
      </div>
    </div>
  );
}
