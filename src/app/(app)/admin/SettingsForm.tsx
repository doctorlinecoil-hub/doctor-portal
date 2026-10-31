'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import Icon from '@/components/Icon';
import { SETTINGS_DEFAULTS, payLines, type Settings, type WeekDay } from '@/lib/constants';
import { DAYS, dayNum, fmtDate, fromDayNum, todayIL, weekday } from '@/lib/dates';
import { policyLines } from '@/lib/policy';
import { digestNow, saveSettings } from './actions';

/* ---------- small building blocks ---------- */

function Toggle({ on, set, title, desc, id }: { on: boolean; set: (v: boolean) => void; title: string; desc?: React.ReactNode; id: string }) {
  return (
    <label className="st-row st-toggle" htmlFor={id}>
      <span className="st-txt"><b>{title}</b>{desc && <small>{desc}</small>}</span>
      <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="st-switch" aria-hidden="true" />
    </label>
  );
}

function Row({ title, desc, children, htmlFor }: { title: string; desc?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="st-row">
      <label className="st-txt" htmlFor={htmlFor}><b>{title}</b>{desc && <small>{desc}</small>}</label>
      <div className="st-ctl">{children}</div>
    </div>
  );
}

function Stepper({ value, set, min, max, unit, id }: { value: number; set: (n: number) => void; min: number; max: number; unit: string; id: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n || 0)));
  return (
    <div className="st-step">
      <button type="button" aria-label="פחות" onClick={() => set(clamp(value - 1))} disabled={value <= min}><Icon name="minus" size={14} /></button>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => set(clamp(+e.target.value))} />
      <button type="button" aria-label="יותר" onClick={() => set(clamp(value + 1))} disabled={value >= max}><Icon name="plus" size={14} /></button>
      <span>{unit}</span>
    </div>
  );
}

function Seg<T extends string | number>({ value, set, options, label }: { value: T; set: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)}>{l}</button>
      ))}
    </div>
  );
}

function Section({ id, icon, title, sub, children, tone }: { id: string; icon: string; title: string; sub?: string; children: React.ReactNode; tone?: string }) {
  return (
    <section className={`st-sec${tone ? ` ${tone}` : ''}`} id={id} aria-labelledby={`${id}-h`}>
      <header className="st-sec-head">
        <span className="st-ic"><Icon name={icon} /></span>
        <div><h2 id={`${id}-h`}>{title}</h2>{sub && <p>{sub}</p>}</div>
      </header>
      <div className="st-body">{children}</div>
    </section>
  );
}

const NAV: [string, string, string][] = [
  ['hours', 'calendar', 'יומן'],
  ['policy', 'refresh', 'שינויים וביטולים'],
  ['booking', 'calendarPlus', 'תורים וזימונים'],
  ['auto', 'bolt', 'אוטומציות'],
  ['pay', 'wallet', 'תשלומים'],
  ['docs', 'file', 'מסמכים'],
  ['security', 'shield', 'אבטחה'],
];

/** An example appointment for the policy preview: Thursday 10:00, about two weeks ahead. */
function exampleStart() {
  let d = fromDayNum(dayNum(todayIL()) + 14);
  while (weekday(d) !== 4) d = fromDayNum(dayNum(d) + 1);
  return { iso: new Date(`${d}T10:00:00+02:00`).toISOString(), date: d };
}

export default function SettingsForm({ initial, morning, mail, preview, sms = '' }: { initial: Settings; morning: boolean; mail: boolean; cron?: boolean; preview?: boolean; sms?: '' | 'sms' | 'whatsapp' }) {
  const start = useMemo(() => ({ ...SETTINGS_DEFAULTS, ...initial, prices: Object.assign({ referral: 0, summary: 0, nii: 0, legal: 0 }, initial.prices) }) as Settings, [initial]);
  const [s, setS] = useState<Settings>(start);
  const [saved, setSaved] = useState(() => JSON.stringify(start));
  const [range, setRange] = useState({ from: '', to: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [digestBusy, runDigest] = useTransition();
  const [digestMsg, setDigestMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const dirty = JSON.stringify(s) !== saved;

  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const day = (i: number): WeekDay => s.weekly[String(i)] ?? { on: false, from: '09:00', to: '13:00' };
  const setDay = (i: number, patch: Partial<WeekDay>) => setS({ ...s, weekly: { ...s.weekly, [String(i)]: { ...day(i), ...patch } } });

  // leaving with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  async function save() {
    if (preview) return setMsg({ ok: false, text: 'זו תצוגה מקדימה. במערכת האמיתית ההגדרות נשמרות.' });
    setBusy(true);
    setMsg(null);
    const r = await saveSettings(s);
    setBusy(false);
    if (r.ok) setSaved(JSON.stringify(s));
    setMsg(r.ok ? { ok: true, text: 'ההגדרות נשמרו' } : { ok: false, text: r.error || 'השמירה נכשלה' });
  }

  function addRange() {
    const from = range.from;
    const to = range.to && range.to >= from ? range.to : from;
    if (!from) return;
    const days: string[] = [];
    for (let n = dayNum(from); n <= dayNum(to) && days.length < 92; n++) days.push(fromDayNum(n));
    setS({ ...s, blocked_dates: [...new Set([...s.blocked_dates, ...days])].sort() });
    setRange({ from: '', to: '' });
  }
  const today = todayIL();
  const upcomingBlocks = s.blocked_dates.filter((d) => d >= today);
  const pastBlocks = s.blocked_dates.length - upcomingBlocks.length;

  const ex = useMemo(exampleStart, []);
  const policy = policyLines(s, ex.iso);
  const pay = payLines(s);
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((i) => day(i).on).length;

  const status: { ok: boolean; label: string; href: string }[] = [
    { ok: mail, label: mail ? 'מיילים מחוברים' : 'מיילים לא מחוברים', href: '#auto' },
    { ok: s.require_staff_mfa, label: s.require_staff_mfa ? 'אימות דו־שלבי פעיל' : 'אימות דו־שלבי כבוי', href: '#security' },
    { ok: pay.bank.length > 0 || !!pay.bit, label: pay.bank.length || pay.bit ? 'פרטי תשלום מלאים' : 'חסרים פרטי תשלום', href: '#pay' },
    { ok: s.reminders_on, label: s.reminders_on ? 'תזכורות פעילות' : 'תזכורות כבויות', href: '#auto' },
  ];

  return (
    <div className="st">
      <div className="st-hero">
        <div className="st-hero-t">
          <span className="st-hero-ic"><Icon name="settings" /></span>
          <div>
            <h1>הגדרות המרפאה</h1>
            <p>{openDays} ימי קבלה בשבוע · תור כל {s.slot_minutes} דקות · פתוח {s.horizon_days} יום קדימה</p>
          </div>
        </div>
        <div className="st-status">
          {status.map((x) => (
            <a key={x.label} href={x.href} className={x.ok ? 'ok' : 'warn'}><Icon name={x.ok ? 'checkCircle' : 'alert'} size={15} />{x.label}</a>
          ))}
        </div>
      </div>

      <nav className="st-nav" aria-label="קטגוריות">
        {NAV.map(([id, ic, l]) => <a key={id} href={`#${id}`}><Icon name={ic} size={15} />{l}</a>)}
        <a href="#maintenance"><Icon name="key" size={15} />גיבוי ותחזוקה</a>
      </nav>

      <Section id="hours" icon="calendar" title="יומן וזמני קבלה" sub="מכאן נבנים התורים הפנויים שהמפנים רואים. תורים שכבר נקבעו לא משתנים.">
        <div className="st-week">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div className={`st-day${day(i).on ? ' on' : ''}`} key={i}>
              <label className="st-day-n" htmlFor={`d${i}`}>
                <input id={`d${i}`} type="checkbox" checked={day(i).on} onChange={(e) => setDay(i, { on: e.target.checked })} />
                <span>{DAYS[i]}</span>
              </label>
              {day(i).on ? (
                <div className="st-day-t">
                  <input type="time" step={300} value={day(i).from} onChange={(e) => setDay(i, { from: e.target.value })} aria-label={`יום ${DAYS[i]} משעה`} />
                  <span>–</span>
                  <input type="time" step={300} value={day(i).to} onChange={(e) => setDay(i, { to: e.target.value })} aria-label={`יום ${DAYS[i]} עד שעה`} />
                </div>
              ) : <span className="st-day-off">סגור</span>}
            </div>
          ))}
        </div>
        <Row title="מרווח בין תורים ביומן" desc="משך כל טיפול נקבע במסך סוגי השירות" htmlFor="slot">
          <Seg label="מרווח" value={s.slot_minutes} set={set('slot_minutes')} options={[[15, '15 דק׳'], [20, '20'], [30, '30'], [45, '45'], [60, '60']]} />
        </Row>
        <Row title="כמה זמן קדימה אפשר לקבוע" htmlFor="horizon"><Stepper id="horizon" value={s.horizon_days} set={set('horizon_days')} min={1} max={180} unit="ימים" /></Row>
        <Row title="הזמנה מוקדמת מינימלית" desc="תור לא ייקבע אם נשאר פחות מזה עד המועד" htmlFor="notice"><Stepper id="notice" value={s.notice_hours} set={set('notice_hours')} min={0} max={336} unit="שעות" /></Row>
        <Row title="מקסימום תורים פתוחים למפנה" htmlFor="maxOpen"><Stepper id="maxOpen" value={s.max_open_per_firm} set={set('max_open_per_firm')} min={1} max={500} unit="תורים" /></Row>
        <div className="st-block">
          <div className="st-txt"><b>ימים חסומים</b><small>חופשה, כנס, מילואים. אפשר לחסום יום אחד או טווח שלם.</small></div>
          <div className="st-range">
            <label><span>מתאריך</span><input type="date" min={today} value={range.from} onChange={(e) => setRange({ from: e.target.value, to: range.to && range.to < e.target.value ? '' : range.to })} /></label>
            <label><span>עד תאריך <small>לא חובה</small></span><input type="date" min={range.from || today} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
            <button type="button" className="btn" onClick={addRange} disabled={!range.from}><Icon name="plus" />חסימה</button>
          </div>
          <div className="chips">
            {upcomingBlocks.length === 0 && <span className="muted">אין ימים חסומים בהמשך</span>}
            {upcomingBlocks.map((d) => (
              <span className="xchip" key={d}>{DAYS[weekday(d)]} {fmtDate(d)}<button type="button" aria-label={`הסרת ${fmtDate(d)}`} onClick={() => setS({ ...s, blocked_dates: s.blocked_dates.filter((x) => x !== d) })}>×</button></span>
            ))}
            {pastBlocks > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setS({ ...s, blocked_dates: upcomingBlocks })}>ניקוי {pastBlocks} תאריכים שעברו</button>}
          </div>
        </div>
      </Section>

      <Section id="policy" icon="refresh" title="מדיניות שינויים וביטולים" sub="מה מפנה יכול לעשות בעצמו אחרי שהתור אושר. את המרפאה הכללים לא מגבילים, ובקשה שעוד לא אושרה תמיד אפשר לבטל.">
        <div className="st-policy">
          <div className="st-policy-form">
            <Toggle id="allowMove" on={s.allow_reschedule} set={set('allow_reschedule')} title="המפנה יכול לבקש שינוי מועד" desc="הבקשה מגיעה אליך לאישור, והמועד לא משתנה עד שתאשר." />
            {s.allow_reschedule && (
              <>
                <Row title="שינוי מועד עד" htmlFor="moveDays"><Stepper id="moveDays" value={s.change_business_days} set={set('change_business_days')} min={0} max={60} unit="ימים לפני התור" /></Row>
                <Row title="מספר שינויי מועד לתור">
                  <Seg label="מספר שינויים" value={s.max_reschedules} set={set('max_reschedules')} options={[[0, 'ללא הגבלה'], [1, '1'], [2, '2'], [3, '3']]} />
                </Row>
              </>
            )}
            <Toggle id="allowCancel" on={s.allow_cancel} set={set('allow_cancel')} title="המפנה יכול לבטל תור שאושר" desc="ביטול משחרר את השעה ביומן מיד, ותקבל התראה." />
            {s.allow_cancel && <Row title="ביטול עד" htmlFor="cancelDays"><Stepper id="cancelDays" value={s.cancel_days} set={set('cancel_days')} min={0} max={60} unit="ימים לפני התור" /></Row>}
            {(s.allow_reschedule || s.allow_cancel) && (
              <Row title="איך סופרים את הימים">
                <Seg label="סוג הימים" value={s.change_days_unit} set={set('change_days_unit')} options={[['business', 'ימי עסקים (א׳–ה׳)'], ['calendar', 'ימים קלנדריים']]} />
              </Row>
            )}
            <Toggle id="polSummons" on={s.policy_in_summons} set={set('policy_in_summons')} title="להציג את המדיניות במייל אישור התור" desc="כך המפנה והמטופל יודעים מראש עד מתי אפשר לשנות." />
          </div>
          <aside className="st-policy-prev" aria-live="polite">
            <span className="st-prev-k"><Icon name="eye" size={14} />כך זה ייראה למפנה</span>
            <div className="st-prev-appt"><Icon name="calendar" size={16} /><span>תור לדוגמה: <b>יום {DAYS[weekday(ex.date)]} {fmtDate(ex.date)} · 10:00</b></span></div>
            <ul>{policy.map((l) => <li key={l}>{l}</li>)}</ul>
            <small>אחרי המועד האחרון הכפתורים נעלמים, והמפנה מתבקש לפנות למרפאה{s.lh_phone ? ` (${s.lh_phone})` : ''}.</small>
          </aside>
        </div>
      </Section>

      <Section id="booking" icon="calendarPlus" title="תורים, זימונים והרשמה">
        <Toggle id="pub" on={s.public_booking} set={set('public_booking')} title="דף ציבורי לקביעת תור" desc="קישור אחד (/book) לעורכי דין, מתווכים ומטופלים. כל מפנה מקבל גם קישור אישי." />
        <Toggle id="phoneAp" on={s.phone_appointments} set={set('phone_appointments')} title="אפשר לקבוע גם שיחה טלפונית" desc="בקביעה בוחרים ״פגישה במרפאה״ או ״שיחה טלפונית״." />
        <Toggle id="approval" on={s.require_approval} set={set('require_approval')} title="כל תור ממפנה ממתין לאישור שלך" desc="הזימון נשלח רק אחרי שאישרת. בלי זה, התור נקבע מיד." />
        <Toggle id="reg" on={s.open_registration} set={set('open_registration')} title="הרשמה עצמית למערכת" desc="מפנים נרשמים לבד (/register), וכל חשבון חדש ממתין לאישור שלך." />
        <Row title="מייל להתראות על בקשות חדשות" desc="ריק = המייל של הרופא במערכת" htmlFor="notify">
          <input id="notify" type="email" dir="ltr" value={s.notify_email} onChange={text('notify_email')} placeholder="doctor@example.com" />
        </Row>
        <label className="st-field" htmlFor="bring"><b>מה להביא לביקור</b><small>שורה לכל פריט. מופיע בזימון ובתזכורת.</small>
          <textarea id="bring" rows={4} value={s.bring_items} onChange={text('bring_items')} /></label>
        <label className="st-field" htmlFor="snote"><b>הערה בזימון</b><small>חניה, קומה, איך מגיעים</small>
          <textarea id="snote" rows={2} value={s.summons_note} onChange={text('summons_note')} placeholder="חניון ציבורי בבניין. עולים במעליות המזרחיות לקומה 23." /></label>
      </Section>

      <Section id="auto" icon="bolt" title="אוטומציות" sub="מה המערכת עושה לבד, כדי שלא תצטרך לזכור.">
        {!mail && <div className="callout info"><div><Icon name="mail" />שליחת מיילים עוד לא הוגדרה (RESEND_API_KEY ו־MAIL_FROM ב־Vercel). עד אז האוטומציות במייל לא יוצאות.</div></div>}
        <Toggle id="digest" on={s.daily_digest} set={set('daily_digest')} title="סיכום בוקר במייל (07:00)" desc="התורים של היום, בקשות שמחכות לאישור, אישורי העברה לבדיקה וכמה כסף ממתין לגבייה." />
        {s.daily_digest && (
          <div className="st-inline">
            <button type="button" className="btn btn-sm" disabled={digestBusy || preview} onClick={() => runDigest(async () => {
              const r = await digestNow();
              setDigestMsg({ ok: r.ok, t: r.ok ? r.info || 'נשלח' : r.error || 'השליחה נכשלה' });
            })}><Icon name="send" size={14} />{digestBusy ? 'שולח…' : 'שליחת סיכום לדוגמה עכשיו'}</button>
            {digestMsg && <small className={digestMsg.ok ? 'ok-t' : 'bad-t'} role="status">{digestMsg.t}</small>}
          </div>
        )}
        <Row title="תזכורת תשלום אוטומטית" desc="כשמסמך מוכן ועוד לא שולם. עד 3 תזכורות לתיק, ולא כשאישור העברה ממתין לבדיקה שלך.">
          <Seg label="תדירות" value={s.auto_pay_reminder_days} set={set('auto_pay_reminder_days')} options={[[0, 'כבוי'], [3, 'כל 3 ימים'], [7, 'כל שבוע'], [14, 'כל שבועיים']]} />
        </Row>
        <Toggle id="rem" on={s.reminders_on} set={set('reminders_on')} title="תזכורות לפני תור: 3 ימים ושעתיים לפני" desc="במייל למטופל, למפנה ולך." />
        <Toggle id="sms" on={s.sms_reminders} set={set('sms_reminders')} title={`תזכורת גם ב${sms === 'whatsapp' ? 'וואטסאפ' : 'SMS'} למטופל`} desc={sms ? 'מחובר. נשלחת באותם מועדים.' : 'דורש חיבור Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM ב־Vercel). עד אז נשלח רק מייל.'} />
        <Toggle id="emailLetters" on={s.email_letters} set={set('email_letters')} title="שליחת המסמך הסופי במייל כ־PDF" desc="למפנה, ולמטופל אם יש מייל. כשהמסמך נפתח רק אחרי תשלום, הוא נשלח אחרי אישור התשלום." />
        <Toggle id="intake" on={s.auto_intake} set={set('auto_intake')} title="סריקת AI לכל פנייה חדשה" desc="סיכום, ציר זמן, דגלים אדומים ומסמכים חסרים. נסרק שוב כשמגיעים מסמכים." />
        <Toggle id="draft" on={s.auto_draft} set={set('auto_draft')} title="טיוטת מסמך אוטומטית" desc="כשהמפנה משלים תיק, ה־AI כותב טיוטה ראשונה מהמסמכים. אתה עורך ומשלים את הבדיקה." />
      </Section>

      <Section id="pay" icon="wallet" title="תשלומים">
        <Toggle id="gate" on={s.letter_requires_payment} set={set('letter_requires_payment')} title="המסמך נפתח למפנה רק אחרי תשלום" desc="עד אז המפנה רואה שהמסמך מוכן וממתין לתשלום. תמיד אפשר לשחרר ידנית בלי תשלום." />
        <label className="st-field" htmlFor="bank"><b>פרטי חשבון להעברה</b><small>שורה לכל פרט. נשלחים בכל בקשת תשלום ותזכורת, ומופיעים בדף העלאת האסמכתא.</small>
          <textarea id="bank" rows={4} value={s.bank_details} onChange={text('bank_details')} placeholder={'בנק: לאומי (10)\nסניף: 806\nחשבון: 123456\nעל שם: ד״ר אלרן חנוך'} /></label>
        {pay.bank.length > 0 && (
          <div className="st-bank-prev" aria-label="כך זה יופיע במייל">
            {pay.bank.map((l) => { const [k, ...v] = l.split(':'); return <div key={l}><span>{k}</span><b dir="ltr">{v.join(':').trim()}</b></div>; })}
          </div>
        )}
        <div className="st-grid2">
          <label className="st-field" htmlFor="bit"><b>ביט / פייבוקס</b><small>לא חובה</small><input id="bit" dir="ltr" value={s.bit_phone} onChange={text('bit_phone')} placeholder="050-0000000" /></label>
          <label className="st-field" htmlFor="invItem"><b>תיאור השירות בחשבונית</b><small>&nbsp;</small><input id="invItem" value={s.invoice_item} onChange={text('invoice_item')} /></label>
        </div>
        <label className="st-field" htmlFor="payNote"><b>הערה לתשלום</b><small>לא חובה</small><input id="payNote" value={s.pay_note} onChange={text('pay_note')} placeholder="נא לציין בהעברה את מספר התיק" /></label>
        <div className="st-links">
          <a className="st-link" href="/doctor/services"><Icon name="receipt" /><span><b>סוגי שירות ומחירים</b><small>שמות, מחירים ומשך כל טיפול ביומן</small></span><Icon name="chevron" size={16} /></a>
          <a className="st-link" href="/doctor/payments"><Icon name="wallet" /><span><b>אישור תשלומים</b><small>מסמכים שממתינים לתשלום ואסמכתאות</small></span><Icon name="chevron" size={16} /></a>
        </div>
        <div className={`callout ${morning ? '' : 'info'}`}><div><Icon name="receipt" />{morning ? 'מחובר למורנינג: אפשר להפיק חשבונית מס / קבלה מתוך כל תיק.' : 'מורנינג לא מחובר. אפשר לרשום מספר קבלה ידנית בכל תשלום.'}</div></div>
      </Section>

      <Section id="docs" icon="file" title="מסמכים ונייר מכתבים" sub="כל מסמך שהמערכת מפיקה יוצא על נייר המכתבים הרשמי, עם החתימה והחותמת.">
        <div className="lh-preview"><img src="/brand/letterhead.jpg" alt="נייר המכתבים" /></div>
        <Toggle id="banner" on={s.use_banner} set={set('use_banner')} title="כותרת רשמית (הבאנר) בראש כל עמוד" desc="בלי זה תופיע כותרת טקסט פשוטה." />
        <Toggle id="signFinal" on={s.sign_final} set={set('sign_final')} title="חתימה וחותמת על מסמכים סופיים" desc="רק על מסמך שסימנת כסופי." />
        <Toggle id="cv" on={s.cv_in_opinions} set={set('cv_in_opinions')} title="קורות חיים בתחילת כל חוות דעת" desc="״פרטי השכלתי ותפקידי״, כמו בתבנית חוות הדעת." />
        <label className="st-field" htmlFor="lhFoot"><b>שורות בתחתית כל עמוד</b><small>שם, רישיונות, התמחות, כתובת</small><textarea id="lhFoot" rows={4} value={s.lh_footer} onChange={text('lh_footer')} /></label>
        <details className="st-more">
          <summary>קורות חיים לחוות דעת</summary>
          <label className="st-field" htmlFor="lhCv"><small>שורה שנגמרת בנקודתיים = כותרת</small><textarea id="lhCv" rows={10} value={s.lh_cv} onChange={text('lh_cv')} /></label>
        </details>
        <details className="st-more">
          <summary>שם, תארים ופרטי קשר</summary>
          <label className="st-field" htmlFor="lhName"><b>שם</b><input id="lhName" value={s.lh_name} onChange={text('lh_name')} /></label>
          <label className="st-field" htmlFor="lhTitles"><b>תארים</b><small>שורה לכל תואר</small><textarea id="lhTitles" rows={2} value={s.lh_titles} onChange={text('lh_titles')} /></label>
          <label className="st-field" htmlFor="lhLic"><b>מספרי רישיון</b><input id="lhLic" value={s.lh_licenses} onChange={text('lh_licenses')} /></label>
          <label className="st-field" htmlFor="lhAddr"><b>כתובת המרפאה</b><input id="lhAddr" value={s.lh_address} onChange={text('lh_address')} /></label>
          <div className="st-grid2">
            <label className="st-field" htmlFor="lhPhone"><b>טלפון</b><input id="lhPhone" dir="ltr" value={s.lh_phone} onChange={text('lh_phone')} /></label>
            <label className="st-field" htmlFor="lhEmail"><b>אימייל</b><input id="lhEmail" dir="ltr" value={s.lh_email} onChange={text('lh_email')} /></label>
          </div>
          <label className="st-field" htmlFor="lhEdu"><b>השכלה בקצרה</b><small>ל־AI, כשלא משתמשים בקורות החיים המלאים</small><textarea id="lhEdu" rows={3} value={s.lh_education} onChange={text('lh_education')} /></label>
        </details>
        <a className="st-link" href="/doctor/templates"><Icon name="template" /><span><b>פסקאות מוכנות למסמכים</b><small>טקסט שחוזר (בדיקה תקינה, המלצות), שנכנס למסמך בלחיצה מתוך העורך</small></span><Icon name="chevron" size={16} /></a>
      </Section>

      <Section id="security" icon="shield" title="אבטחה">
        <Toggle id="mfa" on={s.require_staff_mfa} set={set('require_staff_mfa')} title="אימות דו־שלבי חובה לרופא ולמנהל" desc="בכניסה מקלידים גם קוד מאפליקציה בטלפון. מומלץ מאוד." />
        {!s.require_staff_mfa && <div className="callout warn"><div><Icon name="alert" />האימות הדו־שלבי כבוי. במערכת יש מסמכים רפואיים ומספרי ת״ז: סיסמה שדולפת לבדה תספיק כדי להיכנס.</div></div>}
      </Section>

      <div className={`st-save${dirty ? ' dirty' : ''}`}>
        <span className="st-save-t">
          {msg ? <span className={msg.ok ? 'ok-t' : 'bad-t'} role="status">{msg.text}</span>
            : dirty ? <><i aria-hidden="true" />יש שינויים שעוד לא נשמרו</> : <><Icon name="checkCircle" size={15} />כל השינויים שמורים</>}
        </span>
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setS(JSON.parse(saved)); setMsg(null); }}>ביטול שינויים</button>}
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || (!dirty && !preview)}><Icon name="save" />{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </div>
  );
}
