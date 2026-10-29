import type { Settings } from '@/lib/constants';
import { ils } from '@/lib/constants';
import type { Service } from '@/lib/services';
import Icon from '@/components/Icon';

/*
 * The clinic's public page, for marketing: who the doctor is, his expertise, what he provides, for whom,
 * and the ways in (book, sign up, sign in). All facts come from the clinic's own settings (letterhead, CV, services).
 */

const waze = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
const maps = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const intlPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('0') ? `972${d.slice(1)}` : d; };
const lines = (t: string) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

export default function Landing({ s, services }: { s: Settings; services: Service[]; home?: string | null }) {
  const titles = lines(s.lh_titles);
  const cv = lines(s.lh_cv);
  const facts = cv.filter((l) => !/[:：]$/.test(l)).slice(0, 4);
  const bring = lines(s.bring_items);
  const year = new Date().getFullYear();
  // years as a specialist, from the CV ("מומחה ... משנת 1992")
  const since = Number((cv.join(' ').match(/מומח[^.\n]{0,60}?(19\d\d|20\d\d)/) || [])[1]) || 0;
  const years = since ? year - since : 0;
  // expertise: the doctor's own titles and the letterhead lines that describe his fields
  const norm = (t: string) => t.replace(/[^\p{L}]/gu, '');
  const expertise: string[] = [];
  for (const l of [...titles, ...lines(s.lh_footer).filter((x) => /מומח|מנהל|נוירו|ניתוח/.test(x) && !/רישיון|כתובת/.test(x))]) {
    const n = norm(l);
    if (n && !expertise.some((e) => { const m = norm(e); return m.includes(n.slice(0, 14)) || n.includes(m.slice(0, 14)); })) expertise.push(l);
  }
  expertise.splice(4);
  const first = s.lh_name.replace(/^ד[״"]ר\s*/, '');

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="/" className="lp-brand"><img src="/brand/emblem.png" alt="" width={42} height={42} /><span><b>{s.lh_name}</b><small>{titles[0] || 'נוירוכירורג'}</small></span></a>
          <nav className="lp-links" aria-label="ניווט">
            <a href="#expertise">תחומי מומחיות</a><a href="#services">שירותים</a><a href="#lawyers">לעורכי דין</a><a href="#about">אודות</a><a href="#contact">יצירת קשר</a>
          </nav>
          <div className="lp-nav-cta">
            <a className="btn btn-ghost" href="/login">כניסה</a>
            <a className="btn btn-primary" href="/book"><Icon name="calendarPlus" />קביעת תור</a>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-text">
            <span className="lp-eyebrow"><Icon name="stethoscope" size={16} />{titles[0] || 'נוירוכירורגיה'} · חוות דעת רפואיות</span>
            <h1>{s.lh_name}</h1>
            <p className="lp-hero-sub">{years >= 10 ? `${years} שנות מומחיות בנוירוכירורגיה` : 'מומחה בנוירוכירורגיה'}, בשירות מטופלים, משרדי עורכי דין וחברות.</p>
            <p className="lp-lead">חוות דעת רפואיות מנומקות לבית משפט ולביטוח הלאומי, סיכומי ביקור והפניות. כל מסמך נכתב בקפידה, נחתם על נייר המכתבים הרשמי, ונשלח אליכם מסודר ומוכן להגשה.</p>
            <div className="lp-cta">
              <a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור עכשיו</a>
              <a className="btn btn-lg lp-btn-light" href="/register"><Icon name="briefcase" />הרשמה למשרדים ולמטופלים</a>
            </div>
            <p className="lp-hero-login">כבר רשומים? <a href="/login">כניסה למערכת</a></p>
          </div>
          <aside className="lp-profile" aria-label={`על ${s.lh_name}`}>
            <div className="lp-profile-top">
              <img src="/brand/emblem.png" alt="" width={84} height={84} />
              <div><b>{s.lh_name}</b>{titles.slice(0, 2).map((t) => <span key={t}>{t}</span>)}</div>
            </div>
            {facts.length > 0 && <ul className="lp-profile-facts">{facts.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>}
            {s.lh_licenses && <div className="lp-profile-lic"><Icon name="shield" size={15} />{s.lh_licenses}</div>}
          </aside>
        </div>
      </section>

      <section className="lp-stats" aria-label="במספרים">
        <div className="lp-wrap lp-stats-in">
          {years >= 10 && <div><b>{years}+</b><span>שנות מומחיות</span></div>}
          <div><b>{services.length || 4}</b><span>סוגי שירות</span></div>
          <div><b>24/7</b><span>קביעת תור אונליין</span></div>
          <div><b>PDF</b><span>מסמך חתום במייל</span></div>
        </div>
      </section>

      {expertise.length > 0 && (
        <section className="lp-sec" id="expertise">
          <div className="lp-wrap">
            <span className="lp-kicker">תחומי מומחיות</span>
            <h2 className="lp-h">ניסיון קליני רחב, עין משפטית מדויקת</h2>
            <p className="lp-sub">הידע הקליני של {first} עומד מאחורי כל חוות דעת: בדיקה יסודית, עיון בכל המסמכים, ונימוק מקצועי ברור.</p>
            <div className="lp-grid lp-grid-4">
              {expertise.map((e, i) => (
                <div key={e} className="lp-card lp-exp">
                  <span className="lp-ic"><Icon name={['activity', 'stethoscope', 'shield', 'sparkles'][i % 4]} /></span>
                  <b>{e}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="lp-sec lp-alt" id="services">
        <div className="lp-wrap">
          <span className="lp-kicker">שירותים</span>
          <h2 className="lp-h">מה אפשר לקבל</h2>
          <p className="lp-sub">כל מסמך נכתב על נייר המכתבים הרשמי, חתום ומוכן להגשה.</p>
          <div className="lp-grid lp-grid-4">
            {services.map((v) => (
              <a key={v.id} className="lp-card lp-svc" href="/book">
                <span className="lp-ic"><Icon name={v.icon || 'file'} /></span>
                <b>{v.label}</b>
                {v.description && <p>{v.description}</p>}
                <span className="lp-more">לקביעת תור<Icon name="arrowLeft" size={15} /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-band" id="lawyers">
        <div className="lp-wrap lp-band-in">
          <div>
            <span className="lp-kicker light">למשרדי עורכי דין, מתווכים וחברות</span>
            <h2>שותף רפואי מקצועי לתיקים שלכם</h2>
            <p>מערכת אחת לכל התיקים: קובעים תור לכל לקוח בלחיצה, מעלים מסמכים, ומקבלים את חוות הדעת החתומה ישירות למייל.</p>
            <ul className="lp-band-list">
              <li><Icon name="calendarPlus" size={18} />תורים פנויים בזמן אמת, בלי טלפונים</li>
              <li><Icon name="sparkles" size={18} />המערכת קוראת את המסמכים וממלאת את הפרטים לבד</li>
              <li><Icon name="folder" size={18} />מעקב אחרי כל התיקים, הזימונים והתשלומים</li>
              <li><Icon name="bell" size={18} />זימון, תזכורת 3 ימים ושעתיים לפני, ועדכון כשהמסמך מוכן</li>
            </ul>
            <div className="lp-cta">
              <a className="btn btn-primary btn-lg" href="/register?k=law"><Icon name="briefcase" />פתיחת חשבון למשרד</a>
              <a className="btn btn-lg lp-btn-light" href="/book">קביעת תור בלי חשבון</a>
            </div>
          </div>
          <div className="lp-band-card" aria-hidden="true">
            <div className="lp-mini-head"><span /><span /><span /></div>
            <div className="lp-mini-row"><b>חוות דעת לבית משפט</b><em className="ok">המסמך מוכן</em></div>
            <div className="lp-mini-row"><b>חוות דעת לביטוח לאומי</b><em>נקבע תור</em></div>
            <div className="lp-mini-row"><b>סיכום ביקור</b><em>בבדיקת הרופא</em></div>
            <div className="lp-mini-row"><b>הפניה לבדיקות</b><em className="ok">נשלח במייל</em></div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap">
          <span className="lp-kicker">איך זה עובד</span>
          <h2 className="lp-h">ארבעה צעדים פשוטים</h2>
          <ol className="lp-steps">
            <li><span className="lp-step-n">1</span><b>בוחרים שירות ומועד</b><p>היומן של המרפאה פתוח אונליין. בוחרים יום ושעה פנויים.</p></li>
            <li><span className="lp-step-n">2</span><b>מעלים מסמכים</b><p>המערכת קוראת את המסמכים וממלאת את הפרטים. רק בודקים ומאשרים.</p></li>
            <li><span className="lp-step-n">3</span><b>אישור וזימון</b><p>הרופא מאשר, ונשלח זימון עם כתובת, ניווט ופרטי תשלום.</p></li>
            <li><span className="lp-step-n">4</span><b>מקבלים את המסמך</b><p>אחרי הביקור המסמך החתום נשלח במייל כ־PDF, וזמין גם במערכת.</p></li>
          </ol>
        </div>
      </section>

      <section className="lp-sec lp-alt" id="patients">
        <div className="lp-wrap lp-grid lp-grid-2 lp-split">
          <div>
            <span className="lp-kicker">למטופלים</span>
            <h2 className="lp-h">קובעים תור בעצמכם, תוך שתי דקות</h2>
            <p className="lp-sub">בוחרים מועד, מעלים את המסמכים הרפואיים, ומקבלים זימון ותזכורות במייל.{s.deposit_amount > 0 ? ` התור נשמר עם מקדמה של ${ils(s.deposit_amount)} בהעברה או בביט.` : ''}</p>
            <div className="lp-cta"><a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור</a><a className="btn btn-lg" href="/register?k=patient">פתיחת חשבון מטופל</a></div>
          </div>
          <ul className="lp-checks">
            <li><Icon name="checkCircle" size={20} />בדיקה יסודית ושיחה מסודרת</li>
            <li><Icon name="checkCircle" size={20} />כל המסמכים במקום אחד, מאובטח</li>
            <li><Icon name="checkCircle" size={20} />תזכורת 3 ימים ושעתיים לפני הביקור</li>
            <li><Icon name="checkCircle" size={20} />המסמך החתום נשלח אליכם במייל</li>
          </ul>
        </div>
      </section>

      {cv.length > 0 && (
        <section className="lp-sec" id="about">
          <div className="lp-wrap lp-about">
            <div className="lp-about-side">
              <span className="lp-kicker">אודות</span>
              <h2 className="lp-h">{s.lh_name}</h2>
              {titles.map((t) => <p key={t} className="lp-sub">{t}</p>)}
              {s.lh_licenses && <p className="hint">{s.lh_licenses}</p>}
              <a className="btn" href="/book" style={{ marginTop: 12, alignSelf: 'flex-start' }}><Icon name="calendarPlus" />קביעת תור</a>
            </div>
            <div className="lp-cv">
              {cv.slice(0, 40).map((l, i) => (/[:：]$/.test(l) && l.length < 60 ? <h3 key={i}>{l.replace(/[:：]$/, '')}</h3> : <p key={i}>{l}</p>))}
            </div>
          </div>
        </section>
      )}

      <section className="lp-sec lp-alt" id="faq">
        <div className="lp-wrap lp-faq">
          <span className="lp-kicker">שאלות נפוצות</span>
          <h2 className="lp-h">כל מה שחשוב לדעת</h2>
          <details><summary>איך קובעים תור?</summary><p>דרך דף קביעת התור: בוחרים שירות ומועד, מעלים מסמכים ומאשרים פרטים. משרדים ומתווכים יכולים גם להירשם ולנהל את כל התיקים מחשבון אחד.</p></details>
          {s.deposit_amount > 0 && <details><summary>למה צריך מקדמה?</summary><p>מטופל שקובע תור בעצמו מעביר מקדמה של {ils(s.deposit_amount)} בהעברה בנקאית או בביט, ומעלה צילום של האישור. המקדמה משריינת את המועד, והיא חלק מהמחיר.</p></details>}
          <details><summary>מי משלם על חוות הדעת?</summary><p>בדרך כלל המטופל משלם ישירות לרופא. כשמשרד מפנה, אפשר לסמן שהמשרד הוא המשלם. פרטי התשלום מופיעים בזימון ובתיק.</p></details>
          {bring.length > 0 && <details><summary>מה להביא לביקור?</summary><ul>{bring.map((b) => <li key={b}>{b}</li>)}</ul></details>}
          <details><summary>איך מקבלים את המסמך?</summary><p>אחרי הביקור המסמך החתום נשלח במייל כקובץ PDF, למפנה ולמטופל, ומופיע גם במערכת להורדה.</p></details>
          <details><summary>אפשר לשנות או לבטל תור?</summary><p>כן. מתוך המערכת אפשר לבקש מועד אחר או לבטל{s.lh_phone ? `, ואפשר גם להתקשר: ${s.lh_phone}` : ''}.</p></details>
          <details><summary>שכחתי סיסמה, מה עושים?</summary><p>בדף הכניסה לוחצים ״שכחתי סיסמה״, ומקבלים במייל קישור אישי לבחירת סיסמה חדשה.</p></details>
        </div>
      </section>

      <section className="lp-sec" id="contact">
        <div className="lp-wrap lp-contact">
          <div>
            <span className="lp-kicker">יצירת קשר</span>
            <h2 className="lp-h">נשמח לעמוד לרשותכם</h2>
            <ul className="lp-contact-list">
              {s.lh_address && <li><Icon name="navigation" />{s.lh_address}</li>}
              {s.lh_phone && <li><Icon name="phone" /><a href={`tel:${s.lh_phone.replace(/[^\d+]/g, '')}`} dir="ltr">{s.lh_phone}</a></li>}
              {s.lh_email && <li><Icon name="mail" /><a href={`mailto:${s.lh_email}`} dir="ltr">{s.lh_email}</a></li>}
            </ul>
            <div className="lp-cta">
              {s.lh_address && <a className="btn" href={waze(s.lh_address)} target="_blank" rel="noopener"><Icon name="navigation" />Waze</a>}
              {s.lh_address && <a className="btn" href={maps(s.lh_address)} target="_blank" rel="noopener"><Icon name="externalLink" />Google Maps</a>}
              {s.lh_phone && <a className="btn" href={`https://wa.me/${intlPhone(s.lh_phone)}`} target="_blank" rel="noopener"><Icon name="message" />וואטסאפ</a>}
            </div>
          </div>
          <div className="lp-final">
            <b>מוכנים להתחיל?</b>
            <p>קביעת תור לוקחת פחות משתי דקות.</p>
            <a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור</a>
            <a className="lp-link" href="/login">כבר רשומים? כניסה למערכת</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span>© {year} {s.lh_name}{s.lh_licenses ? ` · ${s.lh_licenses}` : ''}</span>
          <nav aria-label="מידע משפטי"><a href="/terms">תנאי שימוש</a><a href="/privacy">מדיניות פרטיות</a><a href="/accessibility">הצהרת נגישות</a></nav>
        </div>
      </footer>
      <a className="lp-fab btn btn-primary" href="/book"><Icon name="calendarPlus" />קביעת תור</a>
    </div>
  );
}
