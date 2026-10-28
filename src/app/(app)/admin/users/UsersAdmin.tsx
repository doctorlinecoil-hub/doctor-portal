'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { KindBadge } from '@/components/Badges';
import { KIND, type ReferrerKind } from '@/lib/constants';
import { addUser, createFirm, resetPassword, resetTwoStep, setFirmActive, setUserActive, updateFirm } from '../actions';

export type FirmRow = { id: string; name: string; kind: ReferrerKind; tax_id: string; contact_name: string; phone: string; email: string; active: boolean };
export type UserRow = { id: string; role: 'admin' | 'doctor' | 'firm'; firm_id: string | null; full_name: string; email: string; must_change_password: boolean; active: boolean };
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
          <option value="law">{KIND.law}</option><option value="broker">{KIND.broker}</option>
        </select>
      </label>
      <label className="field" htmlFor={`${idp}Name`}><span>{v.kind === 'broker' ? 'שם המתווך / העסק' : 'שם המשרד'}</span><input id={`${idp}Name`} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Tax`}><span>ח.פ / ע.מ / ת.ז <small>לחשבוניות</small></span><input id={`${idp}Tax`} dir="ltr" inputMode="numeric" value={v.taxId} onChange={(e) => setTax(e.target.value)} /></label>
      <label className="field" htmlFor={`${idp}Contact`}><span>איש קשר</span><input id={`${idp}Contact`} value={v.contactName} onChange={(e) => set({ ...v, contactName: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Phone`}><span>טלפון</span><input id={`${idp}Phone`} dir="ltr" value={v.phone} onChange={(e) => set({ ...v, phone: e.target.value })} /></label>
      <label className="field" htmlFor={`${idp}Email`}><span>אימייל לחשבוניות</span><input id={`${idp}Email`} dir="ltr" value={v.firmEmail} onChange={(e) => set({ ...v, firmEmail: e.target.value })} /></label>
    </div>
  );
  function setTax(t: string) { set({ ...v, taxId: t.replace(/[^\d]/g, '') }); }
}

export default function UsersAdmin({ firms, users, me, preview }: { firms: FirmRow[]; users: UserRow[]; me: string; preview?: boolean }) {
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

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(!showNew)}><Icon name="plus" />מפנה חדש</button>
      </div>

      {showNew && (
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

      <h2>מפנים ({firms.length})</h2>
      {firms.map((f) => {
        const list = users.filter((u) => u.firm_id === f.id);
        const editing = edit?.id === f.id;
        return (
          <section className="panel flush" key={f.id} style={{ opacity: f.active ? 1 : 0.6 }}>
            <div className="panel-head">
              <div className="stack-sm" style={{ gap: 4 }}>
                <div className="row"><h2>{f.name}</h2><KindBadge kind={f.kind} />{!f.active && <span className="badge b-cancelled">מושבת</span>}</div>
                <span className="hint">{[f.tax_id && `ח.פ ${f.tax_id}`, f.contact_name, f.phone, f.email].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => setEdit(editing ? null : { id: f.id, v: { name: f.name, kind: f.kind, taxId: f.tax_id, contactName: f.contact_name, phone: f.phone, firmEmail: f.email, userName: '', userEmail: '' } })}>{editing ? 'סגירה' : 'עריכה'}</button>
                <button type="button" className={`btn btn-sm btn-danger${armed === 'firm' + f.id ? ' armed' : ''}`} disabled={busy} onClick={confirmThen('firm' + f.id, () => run(() => setFirmActive(f.id, !f.active)))}>{armed === 'firm' + f.id ? 'לאשר?' : f.active ? 'השבתה' : 'הפעלה'}</button>
              </div>
            </div>
            {editing && edit && (
              <div className="stack" style={{ padding: 20, borderBottom: '1px solid var(--line)' }}>
                <FirmFields v={edit.v} set={(v) => setEdit({ id: f.id, v })} idp={`e${f.id.slice(0, 4)}`} />
                <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => updateFirm(f.id, edit.v), () => setEdit(null))}><Icon name="save" />שמירה</button></div>
              </div>
            )}
            {list.length ? <div className="table-wrap"><table className="t"><thead><tr><th>שם</th><th>תפקיד</th><th>פעולות</th></tr></thead><tbody>{list.map(userRow)}</tbody></table></div>
              : <p className="muted" style={{ padding: 20 }}>אין משתמשים</p>}
          </section>
        );
      })}
    </div>
  );
}
