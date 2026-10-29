'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/browser';
import Icon from '@/components/Icon';
import Lookup from '@/components/Lookup';

export type DxRow = { id: number; code: string; name: string; is_primary: boolean; note: string };
type Hit = { code: string; name: string };

/** The case's diagnoses: ICD-10 search, suggestions from the AI brief, one marked as the main diagnosis. */
export default function DiagnosesPanel({ appointmentId, rows, suggestions, readOnly }: {
  appointmentId: string; rows: DxRow[]; suggestions: string[]; readOnly?: boolean;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [list, setList] = useState(rows);
  const [seed, setSeed] = useState('');
  const [err, setErr] = useState('');
  const has = (h: Hit) => list.some((x) => (h.code && x.code === h.code) || x.name.toLowerCase() === h.name.toLowerCase());

  async function add(h: Hit) {
    if (has(h)) return;
    setErr('');
    const { data, error } = await supabase.from('case_diagnoses')
      .insert({ appointment_id: appointmentId, code: h.code.slice(0, 12), name: h.name.slice(0, 300), is_primary: list.length === 0 })
      .select('id, code, name, is_primary, note').single();
    if (error || !data) return setErr('השמירה נכשלה.');
    setList([...list, data as DxRow]);
    router.refresh();
  }
  async function remove(id: number) {
    const { error } = await supabase.from('case_diagnoses').delete().eq('id', id);
    if (error) return setErr('המחיקה נכשלה.');
    setList(list.filter((x) => x.id !== id));
    router.refresh();
  }
  async function primary(id: number) {
    await supabase.from('case_diagnoses').update({ is_primary: false }).eq('appointment_id', appointmentId);
    await supabase.from('case_diagnoses').update({ is_primary: true }).eq('id', id);
    setList(list.map((x) => ({ ...x, is_primary: x.id === id })));
    router.refresh();
  }
  const open = suggestions.filter((s) => !list.some((x) => x.name.toLowerCase().includes(s.toLowerCase().slice(0, 12))));

  return (
    <section className="panel dx-panel">
      <div className="panel-head"><h2><Icon name="stethoscope" />אבחנות</h2><span className="hint">ICD-10</span></div>
      {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>עוד לא נרשמו אבחנות בתיק.</p> : (
        <ul className="dx-list">
          {[...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((d) => (
            <li key={d.id} className={d.is_primary ? 'is-main' : ''}>
              {d.code ? <span className="dx-code num">{d.code}</span> : <span className="dx-code free">—</span>}
              <span className="dx-name">{d.name}{d.is_primary && <small>אבחנה עיקרית</small>}</span>
              {!readOnly && (
                <span className="dx-act">
                  {!d.is_primary && <button type="button" className="icon-btn" title="סימון כאבחנה עיקרית" aria-label="סימון כאבחנה עיקרית" onClick={() => primary(d.id)}><Icon name="flag" size={15} /></button>}
                  <button type="button" className="icon-btn" title="הסרה" aria-label="הסרה" onClick={() => remove(d.id)}><Icon name="x" size={15} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <>
          <Lookup<Hit>
            key={seed}
            initial={seed}
            endpoint="/api/icd"
            icon="search"
            placeholder="חיפוש אבחנה באנגלית או לפי קוד (למשל: lumbar disc, M51)"
            render={(h) => <><span className="dx-code num">{h.code}</span><span>{h.name}</span></>}
            onPick={add}
            onFree={(t) => add({ code: '', name: t })}
            freeLabel="הוספה בלי קוד"
          />
          {open.length > 0 && (
            <div className="dx-suggest">
              <span className="hint"><Icon name="sparkles" size={13} />מהמסמכים בתיק · לחיצה מחפשת את הקוד</span>
              <div className="chips">
                {open.slice(0, 8).map((s) => <button key={s} type="button" className="chip" onClick={() => setSeed(s)}>{s}</button>)}
              </div>
            </div>
          )}
        </>
      )}
      {err && <p className="err">{err}</p>}
    </section>
  );
}
