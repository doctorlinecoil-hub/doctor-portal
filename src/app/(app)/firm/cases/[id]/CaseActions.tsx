'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import { dbError } from '@/lib/constants';
import { uploadCaseFiles } from '@/lib/upload';
import FilePicker from '@/components/FilePicker';
import Icon from '@/components/Icon';
import { afterCaseUpdate } from '../../actions';

export default function CaseActions({ appointmentId, firmId, canAdd, canCancel }: { appointmentId: string; firmId: string; canAdd: boolean; canCancel: boolean }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armed, setArmed] = useState(false);

  async function send() {
    if (!note.trim() && !files.length) return setMsg({ ok: false, text: 'כתבו הערה או צרפו מסמך.' });
    setBusy(true);
    setMsg(null);
    if (note.trim()) {
      const { error } = await supabase.from('case_notes').insert({ appointment_id: appointmentId, body: note.trim() });
      if (error) { setBusy(false); return setMsg({ ok: false, text: dbError(error) }); }
    }
    const failed = files.length ? await uploadCaseFiles(supabase, firmId, appointmentId, files) : [];
    await afterCaseUpdate(appointmentId, { notes: note.trim() ? 1 : 0, files: files.length - failed.length }).catch(() => undefined);
    setBusy(false);
    setNote('');
    setFiles([]);
    setMsg(failed.length ? { ok: false, text: `לא הועלו: ${failed.join(', ')}` } : { ok: true, text: 'התיק עודכן והרופא קיבל הודעה' });
    router.refresh();
  }

  async function cancel() {
    if (!armed) return setArmed(true);
    setBusy(true);
    const { error } = await supabase.rpc('cancel_appointment', { p_id: appointmentId });
    setBusy(false);
    setArmed(false);
    if (error) return setMsg({ ok: false, text: dbError(error) });
    router.refresh();
  }

  return (
    <>
      {canAdd && (
        <section className="panel">
          <div className="panel-head"><h2><Icon name="plus" />הוספה לתיק</h2></div>
          <label className="field" htmlFor="addNote"><span>הערה נוספת לרופא</span><textarea id="addNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <FilePicker files={files} onChange={setFiles} label="מסמכים נוספים" />
          {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}
          <div className="row"><button type="button" className="btn btn-primary" onClick={send} disabled={busy}><Icon name="send" />{busy ? 'שולח…' : 'שליחה לתיק'}</button></div>
        </section>
      )}
      {canCancel && (
        <section className="panel">
          <div className="panel-head"><h2><Icon name="x" />ביטול התור</h2></div>
          <p className="muted">התור יתפנה. המסמכים יישארו בתיק.</p>
          <div className="row">
            <button type="button" className={`btn btn-danger${armed ? ' armed' : ''}`} onClick={cancel} disabled={busy}>{armed ? 'לחצו שוב לאישור הביטול' : 'ביטול התור'}</button>
            {armed && <button type="button" className="link" onClick={() => setArmed(false)}>השארת התור</button>}
          </div>
        </section>
      )}
    </>
  );
}
