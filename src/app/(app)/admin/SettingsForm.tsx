'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { TYPES, type ReferralType, type Settings, type WeekDay } from '@/lib/constants';
import { DAYS, fmtDate } from '@/lib/dates';
import { saveSettings } from './actions';

export default function SettingsForm({ initial, morning, preview }: { initial: Settings; morning: boolean; preview?: boolean }) {
  const [s, setS] = useState<Settings>({ ...initial, prices: Object.assign({ referral: 0, summary: 0, nii: 0, legal: 0 }, initial.prices) });
  const [newBlock, setNewBlock] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const day = (i: number): WeekDay => s.weekly[String(i)] ?? { on: false, from: '09:00', to: '13:00' };
  const setDay = (i: number, patch: Partial<WeekDay>) => setS({ ...s, weekly: { ...s.weekly, [String(i)]: { ...day(i), ...patch } } });
  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });

  async function save() {
    if (preview) return setMsg({ ok: false, text: 'זו תצוגה מקדימה. במערכת האמיתית ההגדרות נשמרות.' });
    setBusy(true);
    setMsg(null);
    const r = await saveSettings(s);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'ההגדרות נשמרו' } : { ok: false, text: r.error || 'השמירה נכשלה' });
  }

  return (
    <div className="stack">
      <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))' }}>
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2><Icon name="calendar" />זמני קבלה</h2></div>
            <p className="muted">מכאן נבנים התורים הפנויים שהמפנים רואים. תורים שכבר נקבעו לא משתנים.</p>
            <div className="sched">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div className="srow" key={i}>
                  <label className="check" htmlFor={`d${i}`}><input id={`d${i}`} type="checkbox" checked={day(i).on} onChange={(e) => setDay(i, { on: e.target.checked })} />יום {DAYS[i]}</label>
                  <input type="time" step={300} value={day(i).from} onChange={(e) => setDay(i, { from: e.target.value })} aria-label={`יום ${DAYS[i]} משעה`} disabled={!day(i).on} />
                  <span className="muted">עד</span>
                  <input type="time" step={300} value={day(i).to} onChange={(e) => setDay(i, { to: e.target.value })} aria-label={`יום ${DAYS[i]} עד שעה`} disabled={!day(i).on} />
                </div>
              ))}
            </div>
            <div className="grid-2">
              <label className="field" htmlFor="slot"><span>אורך תור</span>
                <select id="slot" value={s.slot_minutes} onChange={(e) => setS({ ...s, slot_minutes: +e.target.value })}>
                  {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} דקות</option>)}
                </select>
              </label>
              <label className="field" htmlFor="horizon"><span>כמה ימים קדימה</span><input id="horizon" type="number" min={1} max={180} value={s.horizon_days} onChange={(e) => setS({ ...s, horizon_days: +e.target.value })} /></label>
              <label className="field" htmlFor="notice"><span>התראה מינימלית (שעות)</span><input id="notice" type="number" min={0} max={336} value={s.notice_hours} onChange={(e) => setS({ ...s, notice_hours: +e.target.value })} /></label>
              <label className="field" htmlFor="maxOpen"><span>מקסימום תורים פתוחים למפנה</span><input id="maxOpen" type="number" min={1} max={500} value={s.max_open_per_firm} onChange={(e) => setS({ ...s, max_open_per_firm: +e.target.value })} /></label>
            </div>
            <div className="stack-sm">
              <span className="field"><span>ימים חסומים (חופשה, כנס)</span></span>
              <div className="row">
                <input id="blk" type="date" style={{ maxWidth: 200 }} value={newBlock} onChange={(e) => setNewBlock(e.target.value)} aria-label="תאריך לחסימה" />
                <button type="button" className="btn" onClick={() => { if (newBlock && !s.blocked_dates.includes(newBlock)) setS({ ...s, blocked_dates: [...s.blocked_dates, newBlock].sort() }); setNewBlock(''); }}><Icon name="plus" />הוספה</button>
              </div>
              <div className="chips">
                {s.blocked_dates.length === 0 && <span className="muted">אין</span>}
                {s.blocked_dates.map((d) => (
                  <span className="xchip" key={d}>{fmtDate(d)}<button type="button" aria-label={`הסרת ${fmtDate(d)}`} onClick={() => setS({ ...s, blocked_dates: s.blocked_dates.filter((x) => x !== d) })}>×</button></span>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Icon name="wallet" />מחירים ותשלום</h2></div>
            <p className="muted">מחיר ברירת מחדל לכל סוג תיק, כולל מע״מ. אפשר לשנות מחיר בכל תיק בנפרד.</p>
            <div className="grid-2">
              {(Object.keys(TYPES) as ReferralType[]).map((k) => (
                <label className="field" htmlFor={`price-${k}`} key={k}><span>{TYPES[k].label} ₪</span>
                  <input id={`price-${k}`} inputMode="decimal" dir="ltr" value={String(s.prices[k] ?? 0)} onChange={(e) => setS({ ...s, prices: { ...s.prices, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } })} />
                </label>
              ))}
            </div>
            <label className="check"><input type="checkbox" checked={s.letter_requires_payment} onChange={(e) => setS({ ...s, letter_requires_payment: e.target.checked })} />
              <span>המכתב הסופי נפתח למפנה רק אחרי תשלום מלא<small>עד אז המפנה רואה שהמכתב מוכן וממתין לתשלום</small></span></label>
            <label className="field" htmlFor="invItem"><span>תיאור השירות בחשבונית</span><input id="invItem" value={s.invoice_item} onChange={text('invoice_item')} /></label>
            <div className={`callout ${morning ? '' : 'info'}`}>
              <div><Icon name="receipt" />{morning ? 'מחובר למורנינג. אפשר להפיק חשבונית מס / קבלה מתוך כל תיק.' : 'החיבור למורנינג לא הוגדר. אפשר לרשום מספר קבלה ידנית, או להוסיף מפתחות API של מורנינג בהגדרות השרת.'}</div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2><Icon name="file" />נייר מכתבים</h2></div>
            <p className="muted">מופיע בראש כל מכתב ובחתימה.</p>
            <label className="field" htmlFor="lhName"><span>שם</span><input id="lhName" value={s.lh_name} onChange={text('lh_name')} /></label>
            <label className="field" htmlFor="lhTitles"><span>תארים <small>שורה לכל תואר</small></span><textarea id="lhTitles" rows={2} value={s.lh_titles} onChange={text('lh_titles')} /></label>
            <label className="field" htmlFor="lhLic"><span>מספרי רישיון</span><input id="lhLic" value={s.lh_licenses} onChange={text('lh_licenses')} /></label>
            <label className="field" htmlFor="lhAddr"><span>כתובת המרפאה</span><input id="lhAddr" value={s.lh_address} onChange={text('lh_address')} /></label>
            <div className="grid-2">
              <label className="field" htmlFor="lhPhone"><span>טלפון</span><input id="lhPhone" dir="ltr" value={s.lh_phone} onChange={text('lh_phone')} /></label>
              <label className="field" htmlFor="lhEmail"><span>אימייל</span><input id="lhEmail" dir="ltr" value={s.lh_email} onChange={text('lh_email')} /></label>
            </div>
            <label className="field" htmlFor="lhEdu"><span>השכלה וניסיון <small>נכנס לחוות דעת משפטית</small></span><textarea id="lhEdu" rows={4} value={s.lh_education} onChange={text('lh_education')} /></label>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Icon name="shield" />אבטחה</h2></div>
            <label className="check"><input type="checkbox" checked={s.require_staff_mfa} onChange={(e) => setS({ ...s, require_staff_mfa: e.target.checked })} />
              <span>אימות דו־שלבי חובה לרופא ולמנהל<small>מומלץ להשאיר מסומן. בכניסה מקלידים גם קוד מאפליקציה בטלפון.</small></span></label>
          </section>
        </div>
      </div>
      <div className="row" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0' }}>
        <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={busy}><Icon name="save" />{busy ? 'שומר…' : 'שמירת ההגדרות'}</button>
        {msg && <span className={msg.ok ? 'ok-msg' : 'err'} role="status">{msg.text}</span>}
      </div>
    </div>
  );
}
