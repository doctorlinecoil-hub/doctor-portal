'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { StatusBadge } from './Badges';
import { labelOf } from '@/lib/services';
import { fmtDate, fmtDay, ilParts } from '@/lib/dates';
import type { ApptRow } from '@/lib/types';

/*
 * The office's cases as a table. A click opens the case in a side window: the details, the doctor's letter
 * (preview and PDF), and every other referral of the same patient with its documents.
 * Only the office's own cases ever reach this component (the database decides).
 */

const idKey = (r: ApptRow) => (r.patient_id_number || '').replace(/\D/g, '').replace(/^0+/, '') || `name:${(r.patient_name || '').trim()}`;

export default function FirmCasesBrowser({ rows, all, initial }: { rows: ApptRow[]; all: ApptRow[]; initial?: string }) {
  const [openId, setOpenId] = useState<string | null>(initial && all.some((r) => r.id === initial) ? initial : null);
  const [view, setView] = useState<string | null>(null); // which letter is shown in the preview
  const open = all.find((r) => r.id === openId) ?? null;
  const history = useMemo(() => (open ? all.filter((r) => idKey(r) === idKey(open)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)) : []), [open, all]);
  const letters = history.filter((r) => r.status === 'done');
  const shown = view ?? (open?.status === 'done' ? open.id : letters[0]?.id ?? null);

  useEffect(() => {
    if (!openId) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [openId]);

  const pick = (id: string) => { setOpenId(id); setView(null); };
  const count = (r: ApptRow) => all.filter((x) => idKey(x) === idKey(r)).length;

  return (
    <>
      <div className="table-wrap">
        <table className="t fc-table">
          <thead><tr><th>מטופל</th><th>שירות</th><th>מועד</th><th>סטטוס</th><th>מסמך הרופא</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = ilParts(r.starts_at);
              const n = count(r);
              return (
                <tr key={r.id} className="fc-row" tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.id); } }} aria-label={`פתיחת התיק של ${r.patient_name || 'המטופל'}`}>
                  <td>
                    <div className="fc-pt">
                      <span className="fc-av">{(r.patient_name || '?').trim().slice(0, 1)}</span>
                      <div><b>{r.patient_name || 'ממתין לפרטים'}</b><small className="num">{r.patient_id_number ? `ת״ז ${r.patient_id_number}` : ''}{r.patient_id_number ? ' · ' : ''}תיק {r.case_no}{n > 1 ? ` · ${n} הפניות` : ''}</small></div>
                    </div>
                  </td>
                  <td>{labelOf(r)}{r.mode === 'phone' && <span className="mode-chip" style={{ marginInlineStart: 6 }}><Icon name="phone" size={12} />טלפוני</span>}</td>
                  <td className="num">{fmtDate(p.date)} <span className="muted">{p.time}</span></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.status === 'done'
                      ? <a className="btn btn-sm btn-ok" href={`/letters/${r.id}/print`} target="_blank" rel="noopener"><Icon name="download" size={15} />PDF</a>
                      : <span className="muted fc-wait">{r.status === 'cancelled' ? '—' : 'בהכנה'}</span>}
                  </td>
                  <td><span className="fc-open">פתיחה<Icon name="chevron" size={16} /></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fc-layer" role="presentation" onClick={() => setOpenId(null)}>
          <aside className="fc-drawer" role="dialog" aria-modal="true" aria-label={`התיק של ${open.patient_name || 'המטופל'}`} onClick={(e) => e.stopPropagation()}>
            <header className="fc-dh">
              <span className="fc-av lg">{(open.patient_name || '?').trim().slice(0, 1)}</span>
              <div>
                <h2>{open.patient_name || 'ממתין לפרטים'}</h2>
                <span className="muted num">{open.patient_id_number ? `ת״ז ${open.patient_id_number} · ` : ''}{history.length > 1 ? `${history.length} הפניות לרופא` : 'הפניה אחת'}</span>
              </div>
              <button type="button" className="fc-x" aria-label="סגירה" onClick={() => setOpenId(null)}><Icon name="x" /></button>
            </header>

            <div className="fc-body">
              <section className="fc-case">
                <div className="fc-case-top">
                  <b>{labelOf(open)}</b>
                  <StatusBadge status={open.status} />
                </div>
                <dl className="fc-kv">
                  <dt>מועד</dt><dd className="num">{fmtDay(ilParts(open.starts_at).date)} · {ilParts(open.starts_at).time}{open.mode === 'phone' ? ' · שיחה טלפונית' : ''}</dd>
                  <dt>מספר תיק</dt><dd className="num">{open.case_no}</dd>
                </dl>
                {open.status === 'pending' && <p className="fc-note"><Icon name="clock" size={15} />הבקשה ממתינה לאישור הרופא. אחרי האישור יישלח זימון במייל.</p>}
                {(open.status === 'booked' || open.status === 'draft') && <p className="fc-note"><Icon name="file" size={15} />המסמך של הרופא יופיע כאן מיד כשיהיה מוכן.</p>}
                <a className="btn btn-sm" href={`/firm/cases/${open.id}`}><Icon name="folder" size={15} />לתיק המלא: מסמכים, הערות ובקשות</a>
              </section>

              {letters.length > 0 && shown && (
                <section className="fc-letter">
                  <div className="fc-sec-h"><Icon name="fileCheck" size={17} /><b>המסמך של הרופא</b>
                    <a className="btn btn-sm btn-ok" href={`/letters/${shown}/print`} target="_blank" rel="noopener"><Icon name="download" size={15} />הורדת PDF</a>
                  </div>
                  <iframe title="המסמך של הרופא" src={`/letters/${shown}/print?embed=1`} loading="lazy" />
                </section>
              )}

              {history.length > 1 && (
                <section className="fc-hist">
                  <div className="fc-sec-h"><Icon name="list" size={17} /><b>כל ההפניות של המטופל</b></div>
                  <ul>
                    {history.map((h) => {
                      const hp = ilParts(h.starts_at);
                      return (
                        <li key={h.id} className={h.id === open.id ? 'on' : ''}>
                          <button type="button" onClick={() => { setOpenId(h.id); setView(h.status === 'done' ? h.id : null); }}>
                            <span className="num fc-hd">{fmtDate(hp.date)}</span>
                            <span className="fc-hl"><b>{labelOf(h)}</b><small className="num">תיק {h.case_no}</small></span>
                            <StatusBadge status={h.status} />
                          </button>
                          {h.status === 'done' && (
                            <span className="fc-hact">
                              <button type="button" className="btn btn-sm" onClick={() => { setOpenId(h.id); setView(h.id); }}><Icon name="eye" size={14} />צפייה</button>
                              <a className="btn btn-sm" href={`/letters/${h.id}/print`} target="_blank" rel="noopener"><Icon name="download" size={14} />PDF</a>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
