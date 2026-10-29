import type { Settings } from '@/lib/constants';
import { ils } from '@/lib/constants';
import type { Service } from '@/lib/services';
import Icon from '@/components/Icon';

/*
 * The clinic's public page: who the doctor is, what he does, who it is for, how it works,
 * and the ways in (book an appointment, sign up, sign in). Content comes from the settings and the services.
 */

const waze = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
const maps = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const intlPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('0') ? `972${d.slice(1)}` : d; };

export default function Landing({ s, services }: { s: Settings; services: Service[] }) {
  const titles = (s.lh_titles || '').split('\n').map((t) => t.trim()).filter(Boolean);
  const cv = (s.lh_cv || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const facts = cv.filter((l) => !/[:：]$/.test(l)).slice(0, 3);
  const bring = (s.bring_items || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const year = new Date().getFullYear();

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="/" className="lp-brand"><img src="/brand/emblem.png" alt="" width={40} height={40} /><span><b>{s.lh_name}</b><small>{titles[0] || 'נוירוכירורג'}</small></span></a>
          <nav className="lp-links" aria-label="ניווט">
            <a href="#services">שירותים</a><a href="#how">איך זה עובד</a><a href="#about">על הרופא</a><a href="#faq">שאלות</a><a href="#contact">יצירת קשר</a>
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
            <span className="lp-eyebrow"><Icon name="stethoscope" size={16} />{titles[0] || 'נוירוכירורגיה'}</span>
            <h1>חוות דעת רפואיות מקצועיות,<br />מדויקות ומנומקות</h1>
            <p className="lp-lead">{s.lh_name} מעניק חוות דעת לבית משפט ולביטוח הלאומי, סיכומי ביקור והפניות לבדיקות, למשרדי עורכי דין, למתווכים, לחברות ולמטופלים פרטיים.</p>
            <div className="lp-cta">
              <a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור עכשיו</a>
              <a className="btn btn-lg lp-btn-light" href="/register"><Icon name="briefcase" />הרשמה למשרדים ולמטופלים</a>
            </div>
            {facts.length > 0 && <ul className="lp-facts">{facts.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>}
          </div>
          <div className="lp-hero-card" aria-hidden="true">
            <img src="/brand/letterhead.jpg" alt="" className="lp-hero-banner" />
            <div className="lp-hero-steps">
              <div><span>1</span>בוחרים שירות ומועד</div>
              <div><span>2</span>מעלים מסמכים, והמערכת קוראת אותם</div>
              <div><span>3</span>מקבלים זימון ותזכורות במייל</div>
              <div><span>4</span>המסמך החתום מגיע כ־PDF</div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="services">
        <div className="lp-wrap">
          <h2 className="lp-h">השירותים</h2>
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

      <section className="lp-sec lp-alt" id="who">
        <div className="lp-wrap">
          <h2 className="lp-h">למי זה מתאים</h2>
          <div className="lp-grid lp-grid-3">
            <div className="lp-card">
              <span className="lp-ic"><Icon name="scale" /></span>
              <b>משרדי עורכי דין</b>
              <ul className="lp-list"><li>תור לכל לקוח שאתם מפנים, בלחיצה</li><li>חוות דעת לבית משפט ולביטוח לאומי</li><li>מעקב אחרי כל התיקים במקום אחד</li><li>המסמך החתום נשלח אליכם במייל</li></ul>
              <a className="btn" href="/register?k=law">הרשמה למשרד</a>
            </div>
            <div className="lp-card">
              <span className="lp-ic"><Icon name="handshake" /></span>
              <b>מתווכים, מיצוי זכויות וחברות</b>
              <ul className="lp-list"><li>קישור אישי לקביעת תורים</li><li>העלאת מסמכים מאובטחת</li><li>זימונים ותזכורות אוטומטיים</li><li>פרטי תשלום ברורים לכל תיק</li></ul>
              <a className="btn" href="/register?k=broker">הרשמה לעסק</a>
            </div>
            <div className="lp-card">
              <span className="lp-ic"><Icon name="user" /></span>
              <b>מטופלים</b>
              <ul className="lp-list"><li>קביעת תור אונליין, בלי טלפונים</li><li>{s.deposit_amount > 0 ? `שריון התור במקדמה של ${ils(s.deposit_amount)}` : 'אישור תור מהיר'}</li><li>תזכורת 3 ימים ושעתיים לפני</li><li>המסמכים נשלחים אליכם במייל</li></ul>
              <a className="btn" href="/book">קביעת תור</a>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap">
          <h2 className="lp-h">איך זה עובד</h2>
          <ol className="lp-steps">
            <li><span className="lp-step-n">1</span><b>בוחרים שירות ומועד</b><p>היומן של המרפאה פתוח אונליין. בוחרים יום ושעה פנויים.</p></li>
            <li><span className="lp-step-n">2</span><b>מעלים מסמכים</b><p>המערכת קוראת את המסמכים וממלאת את הפרטים לבד. רק בודקים ומאשרים.</p></li>
            <li><span className="lp-step-n">3</span><b>אישור וזימון</b><p>הרופא מאשר את התור, ונשלח זימון עם כתובת, ניווט ופרטי תשלום.</p></li>
            <li><span className="lp-step-n">4</span><b>מקבלים את המסמך</b><p>אחרי הביקור המסמך החתום נשלח במייל כ־PDF, וזמין גם במערכת.</p></li>
          </ol>
        </div>
      </section>

      <section className="lp-sec lp-alt">
        <div className="lp-wrap lp-grid lp-grid-4 lp-why">
          <div><Icon name="sparkles" /><b>קריאה חכמה של מסמכים</b><p>הפרטים נקראים מהמסמכים ונבדקים מול המטופל, כדי שלא יהיו טעויות.</p></div>
          <div><Icon name="fileCheck" /><b>מסמכים רשמיים</b><p>על נייר המכתבים של הרופא, חתומים ומסודרים, להורדה כ־PDF.</p></div>
          <div><Icon name="bell" /><b>זימונים ותזכורות</b><p>במייל, למטופל ולמפנה: עם האישור, 3 ימים לפני ושעתיים לפני.</p></div>
          <div><Icon name="shield" /><b>פרטיות ואבטחה</b><p>כל משרד רואה רק את התיקים שלו. המידע הרפואי מוצפן ונשמר בצורה מאובטחת.</p></div>
        </div>
      </section>

      {cv.length > 0 && (
        <section className="lp-sec" id="about">
          <div className="lp-wrap lp-about">
            <div className="lp-about-side">
              <img src="/brand/emblem.png" alt="" width={96} height={96} />
              <h2 className="lp-h">{s.lh_name}</h2>
              {titles.map((t) => <p key={t} className="lp-sub">{t}</p>)}
              {s.lh_licenses && <p className="hint">{s.lh_licenses}</p>}
            </div>
            <div className="lp-cv">
              {cv.slice(0, 40).map((l, i) => (/[:：]$/.test(l) && l.length < 60 ? <h3 key={i}>{l.replace(/[:：]$/, '')}</h3> : <p key={i}>{l}</p>))}
            </div>
          </div>
        </section>
      )}

      <section className="lp-sec lp-alt" id="faq">
        <div className="lp-wrap lp-faq">
          <h2 className="lp-h">שאלות נפוצות</h2>
          <details><summary>איך קובעים תור?</summary><p>דרך דף קביעת התור: בוחרים שירות ומועד, מעלים מסמכים ומאשרים פרטים. משרדים ומתווכים יכולים גם להירשם ולנהל את כל התיקים מחשבון אחד.</p></details>
          {s.deposit_amount > 0 && <details><summary>למה צריך מקדמה?</summary><p>מטופל שקובע תור בעצמו מעביר מקדמה של {ils(s.deposit_amount)} בהעברה בנקאית או בביט, ומעלה צילום של האישור. המקדמה משריינת את המועד, והיא חלק מהמחיר.</p></details>}
          <details><summary>מי משלם על חוות הדעת?</summary><p>בדרך כלל המטופל משלם ישירות לרופא. כשמשרד מפנה, אפשר לסמן שהמשרד הוא המשלם. פרטי התשלום מופיעים בזימון ובתיק.</p></details>
          {bring.length > 0 && <details><summary>מה להביא לביקור?</summary><ul>{bring.map((b) => <li key={b}>{b}</li>)}</ul></details>}
          <details><summary>איך מקבלים את המסמך?</summary><p>אחרי הביקור המסמך החתום נשלח במייל כקובץ PDF, למפנה ולמטופל, ומופיע גם במערכת להורדה.</p></details>
          <details><summary>אפשר לשנות או לבטל תור?</summary><p>כן. מתוך המערכת אפשר לבקש מועד אחר או לבטל{s.lh_phone ? `, ואפשר גם להתקשר: ${s.lh_phone}` : ''}.</p></details>
          <details><summary>שכחתי סיסמה, מה עושים?</summary><p>בדף הכניסה לוחצים ״שכחתי סיסמה״, ומקבלים במייל סיסמה זמנית. נכנסים איתה ובוחרים סיסמה חדשה.</p></details>
        </div>
      </section>

      <section className="lp-sec" id="contact">
        <div className="lp-wrap lp-contact">
          <div>
            <h2 className="lp-h">יצירת קשר</h2>
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
          <span>© {year} {s.lh_name}</span>
          <nav aria-label="מידע משפטי"><a href="/terms">תנאי שימוש</a><a href="/privacy">מדיניות פרטיות</a><a href="/accessibility">הצהרת נגישות</a></nav>
        </div>
      </footer>
    </div>
  );
}
