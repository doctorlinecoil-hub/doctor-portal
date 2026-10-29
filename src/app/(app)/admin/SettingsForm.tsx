'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { SETTINGS_DEFAULTS, type Settings, type WeekDay } from '@/lib/constants';
import { DAYS, fmtDate } from '@/lib/dates';
import { saveSettings } from './actions';

export default function SettingsForm({ initial, morning, mail, cron, preview }: { initial: Settings; morning: boolean; mail: boolean; cron: boolean; preview?: boolean }) {
  const [s, setS] = useState<Settings>({ ...SETTINGS_DEFAULTS, ...initial, prices: Object.assign({ referral: 0, summary: 0, nii: 0, legal: 0 }, initial.prices) });
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
            <div className="callout"><div><Icon name="receipt" />סוגי השירות והמחירים מוגדרים במסך נפרד: שמות, תיאורים, מחירים ושירותים חדשים.</div><a className="btn" href="/doctor/services">סוגי שירות ומחירים</a></div>
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
            <div className="panel-head"><h2><Icon name="mail" />אישור תורים, זימונים ומיילים</h2></div>
            <label className="check"><input type="checkbox" checked={s.require_approval} onChange={(e) => setS({ ...s, require_approval: e.target.checked })} />
              <span>תור ממפנה נכנס כבקשה וממתין לאישור הרופא<small>אחרי האישור נשלח זימון במייל למפנה ולמטופל. בלי סימון: התור נקבע מיד והזימון נשלח מיד.</small></span></label>
            <label className="field" htmlFor="notify"><span>מייל לקבלת התראות על בקשות חדשות <small>ריק = המייל של הרופא במערכת</small></span>
              <input id="notify" type="email" dir="ltr" value={s.notify_email} onChange={text('notify_email')} placeholder="doctor@example.com" /></label>
            <label className="field" htmlFor="bring"><span>מה להביא לביקור <small>שורה לכל פריט. מופיע בזימון ובתזכורת.</small></span>
              <textarea id="bring" rows={4} value={s.bring_items} onChange={text('bring_items')} /></label>
            <label className="field" htmlFor="snote"><span>הערה בזימון <small>למשל: חניה, קומה, איך מגיעים</small></span>
              <textarea id="snote" rows={2} value={s.summons_note} onChange={text('summons_note')} placeholder="חניון ציבורי בבניין. עולים במעליות המזרחיות לקומה 23." /></label>
            <label className="check"><input type="checkbox" checked={s.reminders_on} onChange={(e) => setS({ ...s, reminders_on: e.target.checked })} />
              <span>תזכורת אוטומטית במייל יום לפני התור<small>{cron ? 'נשלחת כל יום בסביבות 17:00–18:00.' : 'כדי שזה יעבוד צריך להגדיר CRON_SECRET בהגדרות Vercel.'}</small></span></label>
            <label className="check"><input type="checkbox" checked={s.email_letters} onChange={(e) => setS({ ...s, email_letters: e.target.checked })} />
              <span>שליחת המכתב הסופי במייל כ־PDF<small>למפנה, ולמטופל אם הוזן מייל. אם המכתב נפתח רק אחרי תשלום, הוא יישלח אחרי שהתשלום יירשם.</small></span></label>
            <div className={`callout ${mail ? '' : 'info'}`}>
              <div><Icon name="mail" />{mail ? 'שליחת מיילים מחוברת.' : 'שליחת מיילים עוד לא הוגדרה (RESEND_API_KEY ו־MAIL_FROM בהגדרות Vercel). עד אז אפשר לשלוח זימונים בכפתורי הוואטסאפ שבתיק.'}</div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2><Icon name="sparkles" />סריקת AI</h2></div>
            <label className="check"><input type="checkbox" checked={s.auto_intake} onChange={(e) => setS({ ...s, auto_intake: e.target.checked })} />
              <span>סריקה אוטומטית של כל פנייה חדשה<small>ה־AI קורא את המסמכים ומכין לרופא סיכום, ציר זמן, דגלים אדומים ורשימת מסמכים חסרים. נסרק שוב כשהמפנה מוסיף מסמכים.</small></span></label>
            <label className="check"><input type="checkbox" checked={s.auto_draft} onChange={(e) => setS({ ...s, auto_draft: e.target.checked })} />
              <span>טיוטת מכתב אוטומטית<small>כשהמפנה משלים תיק, ה־AI כותב טיוטה ראשונה של המכתב מהמסמכים. הרופא עורך, משלים את ממצאי הבדיקה ושולח.</small></span></label>
          </section>

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
            {!s.require_staff_mfa && <div className="callout warn"><div><Icon name="alert" />האימות הדו־שלבי כבוי. במערכת יש מסמכים רפואיים ומספרי ת״ז, ולכן מומלץ להפעיל אותו: סיסמה שדולפת לבדה תספיק כדי להיכנס.</div></div>}
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
