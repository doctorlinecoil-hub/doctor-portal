'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import ShareLink from '@/components/ShareLink';
import { KindBadge } from '@/components/Badges';
import { KIND, type ReferrerKind } from '@/lib/constants';
import { addUser, createFirm, resetPassword, resetTwoStep, setFirmActive, setFirmPrices, setUserActive, updateFirm } from '../actions';

export type FirmRow = { id: string; name: string; kind: ReferrerKind; tax_id: string; contact_name: string; phone: string; email: string; active: boolean; book_code?: string | null };
export type UserRow = { id: string; role: 'admin' | 'doctor' | 'firm'; firm_id: string | null; full_name: string; email: string; must_change_password: boolean; active: boolean };
export type SvcRow = { id: string; label: string; price: number; active: boolean };
type R = { ok: boolean; error?: string; email?: string; password?: string; info?: string };

const ROLE = { admin: 'מנהל', doctor: 'רופא', firm: 'מפנה' } as const;
const EMPTY_FIRM = { name: '', kind: 'law' as ReferrerKind, taxId: '', contactName: '', phone: '', firmEmail: '', userName: '', userEmail: '' };

function Credentials({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const msg = `שלום, זו הגישה שלך למערכת התורים של המרפאה:\n${typeof window !== 'undefined' ? window.location.origin : ''}\nאימייל: ${email}\nסיסמה זמנית: ${password}\nבכניסה הראשונה המערכת תבקש לבחור סיסמה חדשה.`;
  return (
    <section className="panel" style={{ borderColor: 'var(--accent)' }} role="status">
      <div className="panel-head"><h2><Icon name="key" />פרטי הכניסה נוצרו</h2></div>
      <p>שלחו את ההודעה הזו לאדם, למשל בוואטסאפ. הסיסמה מוצגת עכשיו בלבד.</p>
      <pre className="cred">{msg}</pre>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(msg); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'הועתק' : 'העתקת ההודעה'}</button>
        <button type="button" className="btn" onClick={onClose}>סגירה</button>
      </div>
    </section>
  );
}

function FirmFields({ v, set, idp }: { v: typeof EMPTY_FIRM; set: (v: typeof EMPTY_FIRM) => void; idp: string }) {
  return (
    <div className="grid-2">
      <label className="field" htmlFor={`${idp}Kind`}><span>סוג מפנה</span>
        <select id={`${idp}Kind`} value={v.kind} onChange={(e) => set({ ...v, kind: e.target.value as ReferrerKind })}>
          <option value="law">{KIND.law}</option><option value="broker">{KIND.broker}</option><option value="private">{KIND.private} (מטופל, חברת ביטוח, אחר)</option>
        </select>
      </label>
      <label className="field" htmlFor={`${idp}Name`}><span>{v.kind === 'broker' ? 'שם המתווך / העסק' : v.kind === 'private' ? 'שם' : 'שם המשרד'}</span><input id={`${idp}Name`} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Tax`}><span>ח.פ / ע.מ / ת.ז <small>לחשבוניות</small></span><input id={`${idp}Tax`} dir="ltr" inputMode="numeric" value={v.taxId} onChange={(e) => setTax(e.target.value)} /></label>
      <label className="field" htmlFor={`${idp}Contact`}><span>איש קשר</span><input id={`${idp}Contact`} value={v.contactName} onChange={(e) => set({ ...v, contactName: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Phone`}><span>טלפון</span><input id={`${idp}Phone`} dir="ltr" value={v.phone} onChange={(e) => set({ ...v, phone: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Email`}><span>אימייל המשרד <small>חשבוניות, זימונים ומכתבים. המשתמשים מקבלים גם הם במייל שלהם.</small></span><input id={`${idp}Email`} dir="ltr" value={v.firmEmail} onChange={(e) => set({ ...v, firmEmail: e.target.value })} /></label>
    </div>
  );
  function setTax(t: string) { set({ ...v, taxId: t.replace(/[^\d]/g, '') }); }
}

/** The referrer's own prices. Empty = the regular list price. */
function PriceList({ firmId, services, initial, run, busy }: { firmId: string; services: SvcRow[]; initial: Record<string, number>; run: (fn: () => Promise<R>) => void; busy: boolean }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(services.map((x) => [x.id, initial[x.id] != null ? String(initial[x.id]) : ''])));
  const list = services.filter((x) => x.active || initial[x.id] != null);
  const changed = list.some((x) => (v[x.id] ?? '') !== (initial[x.id] != null ? String(initial[x.id]) : ''));
  const custom = list.filter((x) => (v[x.id] ?? '').trim() !== '').length;
  return (
    <div className="ua-prices">
      <div className="ua-prices-h"><b>מחירון אישי</b><span className="hint">{custom ? `${custom} מחירים מיוחדים · השאר לפי המחירון הרגיל` : 'כרגע לפי המחירון הרגיל. כתבו מחיר כדי לסגור מחיר אחר עם המפנה.'}</span></div>
      <ul>
        {list.map((x) => {
          const val = v[x.id] ?? '';
          const n = Number(val);
          const diff = val.trim() !== '' && Number.isFinite(n) ? n - x.price : 0;
          return (
            <li key={x.id} className={val.trim() ? 'set' : ''}>
              <span className="ua-svc">{x.label}{!x.active && <small> · לא פעיל</small>}</span>
              <span className="ua-list num">רגיל {x.price ? `₪${x.price.toLocaleString('he-IL')}` : '—'}</span>
              <span className="ua-in"><i>₪</i><input inputMode="decimal" dir="ltr" value={val} placeholder={x.price ? String(x.price) : '0'} aria-label={`מחיר ל${x.label}`} onChange={(e) => setV({ ...v, [x.id]: e.target.value.replace(/[^\d.]/g, '') })} /></span>
              <span className={`ua-diff num${diff < 0 ? ' down' : diff > 0 ? ' up' : ''}`}>{diff ? `${diff > 0 ? '+' : '−'}₪${Math.abs(diff).toLocaleString('he-IL')}` : ''}</span>
            </li>
          );
        })}
      </ul>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed} onClick={() => run(() => setFirmPrices(firmId, list.map((x) => ({ serviceId: x.id, price: (v[x.id] ?? '').trim() === '' ? null : Number(v[x.id]) }))))}><Icon name="save" size={15} />שמירת המחירון</button>
        {custom > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setV(Object.fromEntries(list.map((x) => [x.id, ''])))}>חזרה למחירון הרגיל</button>}
      </div>
    </div>
  );
}

export default function UsersAdmin({ firms, users, me, preview, services = [], prices = {} }: { firms: FirmRow[]; users: UserRow[]; me: string; preview?: boolean; services?: SvcRow[]; prices?: Record<string, Record<string, number>> }) {
  const [tab, setTab] = useState<'firms' | 'staff'>('firms');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ id: string; part: 'prices' | 'users' | 'edit' } | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState(EMPTY_FIRM);
  const [nu, setNu] = useState<{ firmId: string; role: 'firm' | 'doctor' | 'admin'; name: string; email: string }>({ firmId: '', role: 'firm', name: '', email: '' });
  const [edit, setEdit] = useState<{ id: string; v: typeof EMPTY_FIRM } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function run(fn: () => Promise<R>, after?: () => void) {
    if (preview) return setMsg({ ok: false, text: 'זו תצוגה מקדימה. במערכת האמיתית הפעולה נשמרת.' });
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setArmed(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error || 'הפעולה נכשלה' });
    if (r.password && r.email) setCreds({ email: r.email, password: r.password });
    else setMsg({ ok: true, text: r.info || 'נשמר' });
    after?.();
  }
  const confirmThen = (key: string, fn: () => void) => () => { if (armed !== key) return setArmed(key); fn(); };

  const userRow = (u: UserRow) => (
    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
      <td><div className="cell-main"><b>{u.full_name}</b><span className="ltr" style={{ textAlign: 'right' }}>{u.email}</span></div></td>
      <td>{ROLE[u.role]}{u.must_change_password && <div className="hint">עוד לא נכנס</div>}{!u.active && <div className="err" style={{ fontSize: 13 }}>חסום</div>}</td>
      <td>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`btn btn-sm${armed === 'pw' + u.id ? ' armed' : ''}`} disabled={busy} onClick={confirmThen('pw' + u.id, () => run(() => resetPassword(u.id)))}>{armed === 'pw' + u.id ? 'לאשר?' : 'סיסמה חדשה'}</button>
          {u.role !== 'firm' && <button type="button" className={`btn btn-sm${armed === 'mfa' + u.id ? ' armed' : ''}`} disabled={busy} onClick={confirmThen('mfa' + u.id, () => run(() => resetTwoStep(u.id)))}>{armed === 'mfa' + u.id ? 'לאשר?' : 'איפוס אימות'}</button>}
          {u.id !== me && <button type="button" className={`btn btn-sm btn-danger${armed === 'act' + u.id ? ' armed' : ''}`} disabled={busy} onClick={confirmThen('act' + u.id, () => run(() => setUserActive(u.id, !u.active)))}>{armed === 'act' + u.id ? 'לאשר?' : u.active ? 'חסימה' : 'שחרור'}</button>}
        </div>
      </td>
    </tr>
  );

  const staff = users.filter((u) => u.role !== 'firm');
  return (
    <div className="stack">
      {creds && <Credentials email={creds.email} password={creds.password} onClose={() => setCreds(null)} />}
      {msg && <p className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</p>}

      <div className="ua-bar">
        <nav className="ua-tabs" aria-label="מפנים או צוות">
          <button type="button" aria-pressed={tab === 'firms'} onClick={() => setTab('firms')}><Icon name="briefcase" size={16} />מפנים <span className="num">{firms.length}</span></button>
          <button type="button" aria-pressed={tab === 'staff'} onClick={() => setTab('staff')}><Icon name="stethoscope" size={16} />צוות ומשתמשים</button>
        </nav>
        {tab === 'firms' && (
          <>
            <label className="ua-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מפנה" aria-label="חיפוש מפנה" /></label>
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(!showNew)}><Icon name="plus" />מפנה חדש</button>
          </>
        )}
      </div>

      {tab === 'firms' && showNew && (
        <section className="panel">
          <div className="panel-head"><h2><Icon name="briefcase" />מפנה חדש: משרד עורכי דין או מתווך</h2></div>
          <FirmFields v={nf} set={setNf} idp="nf" />
          <h3>המשתמש הראשון</h3>
          <div className="grid-2">
            <label className="field" htmlFor="nfUser"><span>שם מלא</span><input id="nfUser" value={nf.userName} onChange={(e) => setNf({ ...nf, userName: e.target.value })} /></label>
            <label className="field" htmlFor="nfUserEmail"><span>אימייל לכניסה</span><input id="nfUserEmail" type="email" dir="ltr" value={nf.userEmail} onChange={(e) => setNf({ ...nf, userEmail: e.target.value })} /></label>
          </div>
          <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => createFirm(nf), () => { setNf(EMPTY_FIRM); setShowNew(false); })}><Icon name="check" />יצירת מפנה ומשתמש</button></div>
        </section>
      )}

      {tab === 'staff' && (
        <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))' }}>
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="stethoscope" />צוות המרפאה</h2></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>שם</th><th>תפקיד</th><th>פעולות</th></tr></thead><tbody>{staff.map(userRow)}</tbody></table></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2><Icon name="user" />הוספת משתמש</h2></div>
          <div className="grid-2">
            <label className="field" htmlFor="nuRole"><span>תפקיד</span>
              <select id="nuRole" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as typeof nu.role })}>
                <option value="firm">משתמש אצל מפנה</option><option value="doctor">רופא</option><option value="admin">מנהל</option>
              </select>
            </label>
            {nu.role === 'firm' && (
              <label className="field" htmlFor="nuFirm"><span>מפנה</span>
                <select id="nuFirm" value={nu.firmId} onChange={(e) => setNu({ ...nu, firmId: e.target.value })}>
                  <option value="">בחרו</option>
                  {firms.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            <label className="field" htmlFor="nuName"><span>שם מלא</span><input id="nuName" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></label>
            <label className="field" htmlFor="nuEmail"><span>אימייל לכניסה</span><input id="nuEmail" type="email" dir="ltr" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></label>
          </div>
          <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => addUser({ ...nu, firmId: nu.firmId || null }), () => setNu({ ...nu, name: '', email: '' }))}><Icon name="plus" />יצירת משתמש</button></div>
        </section>
      </div>

      )}

      {tab === 'firms' && (
        <div className="ua-grid">
          {firms.filter((f) => !q.trim() || [f.name, f.contact_name, f.email, f.phone].join(' ').includes(q.trim())).map((f) => {
            const list = users.filter((u) => u.firm_id === f.id);
            const fp = prices[f.id] ?? {};
            const nPrices = Object.keys(fp).length;
            const part = open?.id === f.id ? open.part : null;
            const toggle = (p: 'prices' | 'users' | 'edit') => {
              if (part === p) return setOpen(null);
              setOpen({ id: f.id, part: p });
              if (p === 'edit') setEdit({ id: f.id, v: { name: f.name, kind: f.kind, taxId: f.tax_id, contactName: f.contact_name, phone: f.phone, firmEmail: f.email, userName: '', userEmail: '' } });
            };
            return (
              <article key={f.id} className={`ua-firm${f.active ? '' : ' off'}${part ? ' open' : ''}`}>
                <header>
                  <span className="fc-av">{f.name.trim().slice(0, 1)}</span>
                  <div className="ua-firm-m">
                    <div className="row" style={{ gap: 6 }}><b>{f.name}</b><KindBadge kind={f.kind} />{!f.active && <span className="badge b-cancelled">מושבת</span>}</div>
                    <small>{[f.contact_name, f.phone, f.email].filter(Boolean).join(' · ') || 'אין פרטי קשר'}</small>
                  </div>
                </header>
                <div className="ua-chips">
                  <button type="button" aria-pressed={part === 'prices'} onClick={() => toggle('prices')}><Icon name="receipt" size={14} />מחירון{nPrices > 0 && <span className="ua-n">{nPrices}</span>}</button>
                  <button type="button" aria-pressed={part === 'users'} onClick={() => toggle('users')}><Icon name="users" size={14} />משתמשים <span className="ua-n">{list.length}</span></button>
                  <button type="button" aria-pressed={part === 'edit'} onClick={() => toggle('edit')}><Icon name="settings" size={14} />פרטים</button>
                  <button type="button" className={`danger${armed === 'firm' + f.id ? ' armed' : ''}`} disabled={busy} onClick={confirmThen('firm' + f.id, () => run(() => setFirmActive(f.id, !f.active)))}>{armed === 'firm' + f.id ? 'לאשר?' : f.active ? 'השבתה' : 'הפעלה'}</button>
                </div>
                {part === 'prices' && <PriceList firmId={f.id} services={services} initial={fp} run={(fn) => run(fn)} busy={busy} />}
                {part === 'users' && (
                  <div className="ua-users">
                    {f.active && f.book_code && f.kind !== 'private' && <ShareLink compact path={`/book?r=${f.book_code}`} title="קישור אישי לקביעת תור:" />}
                    {list.length ? <div className="table-wrap"><table className="t"><thead><tr><th>שם</th><th>תפקיד</th><th>פעולות</th></tr></thead><tbody>{list.map(userRow)}</tbody></table></div>
                      : <p className="muted">אין משתמשים. מוסיפים בלשונית ״צוות ומשתמשים״.</p>}
                  </div>
                )}
                {part === 'edit' && edit?.id === f.id && (
                  <div className="ua-edit">
                    <FirmFields v={edit.v} set={(v) => setEdit({ id: f.id, v })} idp={`e${f.id.slice(0, 4)}`} />
                    <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => updateFirm(f.id, edit.v), () => { setEdit(null); setOpen(null); })}><Icon name="save" size={15} />שמירה</button></div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
