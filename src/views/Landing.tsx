import type { Settings } from '@/lib/constants';
import type { Service } from '@/lib/services';
import Icon from '@/components/Icon';
import CallbackForm from '@/components/CallbackForm';
import LandingFx from '@/components/LandingFx';
import ServiceQuiz from '@/components/ServiceQuiz';

/*
 * The clinic's public page, for marketing (and its two ad versions: lawyers, patients).
 * All facts come from the clinic's own settings (letterhead, CV, services). No prices on public pages:
 * the doctor sends the cost himself.
 */

const waze = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
const maps = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const intlPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('0') ? `972${d.slice(1)}` : d; };
const lines = (t: string) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

export type Audience = 'all' | 'lawyers' | 'patients';

/** Decorative neural network behind the hero (pure SVG, gently pulsing). */
function NeuralBg() {
  const pts: [number, number][] = [[80, 120], [210, 60], [330, 170], [470, 90], [560, 230], [690, 120], [820, 210], [940, 80], [1060, 190], [1180, 110], [150, 300], [400, 330], [620, 380], [880, 340], [1110, 330], [260, 470], [520, 520], [760, 500], [1000, 470], [1220, 440]];
  const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [0, 10], [10, 2], [2, 11], [11, 4], [4, 12], [12, 6], [6, 13], [13, 8], [8, 14], [14, 9], [10, 15], [15, 11], [11, 16], [16, 12], [12, 17], [17, 13], [13, 18], [18, 14], [14, 19], [3, 5], [1, 3]];
  return (
    <svg className="lp-neural" viewBox="0 0 1280 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g className="lp-neural-l">{links.map(([a, b], i) => <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} />)}</g>
      <g className="lp-neural-p">{pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 2.6 : 4} style={{ animationDelay: `${(i % 7) * 0.6}s` }} />)}</g>
    </svg>
  );
}

export default function Landing({ s, services, audience = 'all' }: { s: Settings; services: Service[]; home?: string | null; audience?: Audience }) {
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
  const tel = s.lh_phone ? s.lh_phone.replace(/[^\d+]/g, '') : '';
  const wa = s.lh_phone ? `https://wa.me/${intlPhone(s.lh_phone)}` : '';
  const law = audience === 'lawyers';
  const pat = audience === 'patients';
  const hero = law
    ? { kicker: 'לעורכי דין, מתווכים וחברות ביטוח', tag: 'חוות דעת שעומדות בכל חקירה', lead: 'בדיקה יסודית, עיון בכל התיק הרפואי, ונימוק מקצועי ברור. קובעים תור לכל לקוח בלחיצה, ומקבלים מסמך חתום ומוכן להגשה ישירות למייל.', cta: { href: '/register?k=law', label: 'פתיחת חשבון למשרד', icon: 'briefcase' }, alt: { href: '/book', label: 'קביעת תור בלי חשבון' } }
    : pat
      ? { kicker: 'נוירוכירורג ילדים ומבוגרים', tag: 'מומחיות של עשרות שנים, ביחס אישי', lead: 'קובעים תור אונליין תוך שתי דקות, מעלים את המסמכים הרפואיים, ומקבלים זימון ותזכורות. אחרי הביקור המסמך החתום נשלח אליכם במייל.', cta: { href: '/book', label: 'קביעת תור עכשיו', icon: 'calendarPlus' }, alt: { href: '#callback', label: 'חזרו אליי' } }
      : { kicker: `${titles[0] || 'נוירוכירורגיה'} · חוות דעת רפואיות`, tag: 'נוירוכירורגיה ברמה הגבוהה ביותר', lead: 'חוות דעת רפואיות מנומקות לבית משפט ולביטוח הלאומי, ייעוץ, סיכומי ביקור והפניות. כל מסמך נכתב בקפידה, נחתם על נייר המכתבים הרשמי, ונשלח אליכם מסודר ומוכן להגשה.', cta: { href: '/book', label: 'קביעת תור עכשיו', icon: 'calendarPlus' }, alt: { href: '#finder', label: 'איזה שירות מתאים לי?' } };
  const marquee = [...expertise, ...services.map((v) => v.label)].filter(Boolean);

  const patientsSec = (
    <section className="lp-sec lp-alt rv" id="patients">
      <div className="lp-wrap lp-grid lp-grid-2 lp-split">
        <div>
          <span className="lp-kicker">למטופלים</span>
          <h2 className="lp-h">קובעים תור בעצמכם, תוך שתי דקות</h2>
          <p className="lp-sub">בוחרים מועד, מעלים את המסמכים הרפואיים, ומקבלים זימון ותזכורות. פרטי העלות נשלחים אליכם במייל מהמרפאה.</p>
          <div className="lp-cta"><a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור</a><a className="btn btn-lg" href="/register?k=patient">פתיחת חשבון מטופל</a></div>
        </div>
        <ul className="lp-checks">
          <li><Icon name="checkCircle" size={20} />בדיקה יסודית ושיחה מסודרת</li>
          <li><Icon name="checkCircle" size={20} />כל המסמכים במקום אחד, מאובטח</li>
          <li><Icon name="checkCircle" size={20} />תזכורת 3 ימים ושעתיים לפני הביקור</li>
          <li><Icon name="checkCircle" size={20} />אפשר גם שיחה טלפונית, בלי להגיע</li>
          <li><Icon name="checkCircle" size={20} />המסמך החתום נשלח אליכם במייל</li>
        </ul>
      </div>
    </section>
  );
  const lawyersSec = (
    <section className="lp-band" id="lawyers">
      <div className="lp-wrap lp-band-in rv">
        <div>
          <span className="lp-kicker light">למשרדי עורכי דין, מתווכים וחברות</span>
          <h2>שותף רפואי מקצועי לתיקים שלכם</h2>
          <p>מערכת אחת לכל התיקים: קובעים תור לכל לקוח בלחיצה, מעלים מסמכים, ומקבלים את חוות הדעת החתומה ישירות למייל.</p>
          <ul className="lp-band-list">
            <li><Icon name="calendarPlus" size={18} />תורים פנויים בזמן אמת, בלי טלפונים</li>
            <li><Icon name="sparkles" size={18} />המערכת קוראת את המסמכים וממלאת את הפרטים לבד</li>
            <li><Icon name="search" size={18} />חיפוש מהיר לפי שם או תעודת זהות, רק בתיקים שלכם</li>
            <li><Icon name="bell" size={18} />זימון, תזכורת 3 ימים ושעתיים לפני, ועדכון כשהמסמך מוכן</li>
          </ul>
          <div className="lp-cta">
            <a className="btn btn-primary btn-lg" href="/register?k=law"><Icon name="briefcase" />פתיחת חשבון למשרד</a>
            <a className="btn btn-lg lp-btn-light" href="/login">כניסה למשרדים רשומים</a>
          </div>
        </div>
        <div className="lp-band-card" aria-hidden="true">
          <div className="lp-mini-head"><span /><span /><span /><em>התיקים שלי</em></div>
          <div className="lp-mini-search"><Icon name="search" size={14} />חיפוש לפי שם או ת״ז</div>
          <div className="lp-mini-row"><b>חוות דעת לבית משפט</b><em className="ok">המסמך מוכן</em></div>
          <div className="lp-mini-row"><b>חוות דעת לביטוח לאומי</b><em>נקבע תור</em></div>
          <div className="lp-mini-row"><b>סיכום ביקור</b><em>בבדיקת הרופא</em></div>
          <div className="lp-mini-row"><b>הפניה לבדיקות</b><em className="ok">נשלח במייל</em></div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="lp">
      <LandingFx />
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="/" className="lp-brand"><img src="/brand/emblem.png" alt="" width={42} height={42} /><span><b>{s.lh_name}</b><small>{titles[0] || 'נוירוכירורג'}</small></span></a>
          <nav className="lp-links" aria-label="ניווט">
            <a href="#finder">איזה שירות?</a><a href="#services">שירותים</a><a href="#lawyers">לעורכי דין</a><a href="#about">אודות</a><a href="#contact">יצירת קשר</a>
          </nav>
          <div className="lp-nav-cta">
            {tel && <a className="lp-tel" href={`tel:${tel}`} dir="ltr"><Icon name="phone" size={16} />{s.lh_phone}</a>}
            <a className="lp-login" href="/login"><span className="lp-login-ic"><Icon name="user" size={16} /></span>אזור אישי</a>
            <a className="btn btn-primary" href="/book"><Icon name="calendarPlus" />קביעת תור</a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <NeuralBg />
          <div className="lp-hero-glow" aria-hidden="true" />
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-text">
              <span className="lp-eyebrow"><span className="lp-dot" />{hero.kicker}</span>
              <h1><span className="lp-h1-name">{s.lh_name}</span><span className="lp-h1-tag">{hero.tag}</span></h1>
              <p className="lp-lead">{hero.lead}</p>
              <div className="lp-cta">
                <a className="btn btn-primary btn-lg lp-shine" href={hero.cta.href}><Icon name={hero.cta.icon} />{hero.cta.label}</a>
                <a className="btn btn-lg lp-btn-light" href={hero.alt.href}>{hero.alt.label}</a>
              </div>
              {facts.length > 0 && (
                <ul className="lp-hero-trust">
                  {facts.slice(0, 3).map((f) => <li key={f}><Icon name="checkCircle" size={16} />{f}</li>)}
                </ul>
              )}
              <a className="lp-hero-login" href="/login">
                <span className="lp-login-ic"><Icon name="user" size={15} /></span>
                <span>כבר רשומים? <b>כניסה לאזור האישי</b></span>
                <Icon name="arrowLeft" size={15} />
              </a>
            </div>
            <div className="lp-portrait">
              <div className="lp-portrait-ring" aria-hidden="true" />
              <div className="lp-orbit" aria-hidden="true"><i /><i /><i /></div>
              <picture>
                <source srcSet="/brand/doctor.webp" type="image/webp" />
                <img src="/brand/doctor.png" alt={`${s.lh_name}, ${titles[0] || 'נוירוכירורג'}`} width={640} height={452} fetchPriority="high" />
              </picture>
              <div className="lp-name-card">
                <b>{s.lh_name}</b>
                <span>{titles[0] || 'נוירוכירורג'}</span>
              </div>
              {years >= 10 && <div className="lp-float lp-float-years"><b>{years}+</b><span>שנות מומחיות</span></div>}
              {s.lh_licenses && <div className="lp-float lp-float-lic"><Icon name="shield" size={15} />{s.lh_licenses}</div>}
            </div>
          </div>
        </section>

        <section className="lp-stats" aria-label="במספרים">
          <div className="lp-wrap lp-stats-in">
            {years >= 10 && <div><b data-count={years} data-suffix="+">{years}+</b><span>שנות מומחיות</span></div>}
            <div><b data-count={services.length || 4}>{services.length || 4}</b><span>סוגי שירות</span></div>
            <div><b>24/7</b><span>קביעת תור אונליין</span></div>
            <div><b data-count={2} data-suffix=" דק׳">2 דק׳</b><span>לקביעת תור</span></div>
          </div>
        </section>

        {marquee.length > 2 && (
          <div className="lp-marquee" aria-hidden="true">
            <div className="lp-marquee-track">
              {[...marquee, ...marquee].map((m, i) => <span key={i}><Icon name="sparkles" size={14} />{m}</span>)}
            </div>
          </div>
        )}

        {pat && patientsSec}

        <section className="lp-sec lp-finder rv" id="finder">
          <div className="lp-wrap lp-finder-in">
            <div>
              <span className="lp-kicker">מוצאים את השירות הנכון</span>
              <h2 className="lp-h">איזה שירות מתאים לכם?</h2>
              <p className="lp-sub">שתי שאלות קצרות, ותדעו בדיוק מה לבקש. משם ממשיכים ישר לקביעת התור, עם השירות כבר מסומן.</p>
              <ul className="lp-finder-pts">
                <li><Icon name="clock" size={17} />פחות מ־30 שניות</li>
                <li><Icon name="shield" size={17} />בלי להשאיר פרטים</li>
              </ul>
            </div>
            <ServiceQuiz services={services.map((v) => ({ id: v.id, label: v.label, base_type: v.base_type, icon: v.icon }))} />
          </div>
        </section>

        {expertise.length > 0 && (
          <section className="lp-sec rv" id="expertise">
            <div className="lp-wrap">
              <span className="lp-kicker">תחומי מומחיות</span>
              <h2 className="lp-h">ניסיון קליני רחב, עין משפטית מדויקת</h2>
              <p className="lp-sub">הידע הקליני של {first} עומד מאחורי כל חוות דעת: בדיקה יסודית, עיון בכל המסמכים, ונימוק מקצועי ברור.</p>
              <div className="lp-grid lp-grid-svc">
                {expertise.map((e, i) => (
                  <div key={e} className="lp-card lp-exp lp-tilt">
                    <span className="lp-ic"><Icon name={['activity', 'stethoscope', 'shield', 'sparkles'][i % 4]} /></span>
                    <b>{e}</b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="lp-sec lp-alt rv" id="services">
          <div className="lp-wrap">
            <span className="lp-kicker">שירותים</span>
            <h2 className="lp-h">מה אפשר לקבל</h2>
            <p className="lp-sub">כל מסמך נכתב על נייר המכתבים הרשמי, חתום ומוכן להגשה. פרטי העלות נשלחים במייל מהמרפאה.</p>
            <div className="lp-grid lp-grid-svc">
              {services.map((v) => (
                <a key={v.id} className="lp-card lp-svc lp-tilt" href={`/book?s=${v.id}`}>
                  <span className="lp-ic"><Icon name={v.icon || 'file'} /></span>
                  <b>{v.label}</b>
                  {v.description && <p>{v.description}</p>}
                  <span className="lp-more">לקביעת תור<Icon name="arrowLeft" size={15} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {!pat && lawyersSec}

        <section className="lp-sec rv" id="how">
          <div className="lp-wrap">
            <span className="lp-kicker">איך זה עובד</span>
            <h2 className="lp-h">ארבעה צעדים פשוטים</h2>
            <ol className="lp-steps lp-steps-line">
              <li><span className="lp-step-n">1</span><b>בוחרים שירות ומועד</b><p>היומן של המרפאה פתוח אונליין. בוחרים יום ושעה, במרפאה או בשיחה טלפונית.</p></li>
              <li><span className="lp-step-n">2</span><b>מצרפים מסמכים</b><p>הפניה, תוצאות בדיקות וכל מה שחשוב שהרופא יראה לפני הפגישה.</p></li>
              <li><span className="lp-step-n">3</span><b>אישור וזימון</b><p>הרופא מאשר, ונשלח זימון עם כתובת, ניווט ופרטי העלות.</p></li>
              <li><span className="lp-step-n">4</span><b>מקבלים את המסמך</b><p>אחרי הביקור המסמך החתום נשלח במייל כ־PDF, וזמין גם באזור האישי.</p></li>
            </ol>
          </div>
        </section>

        {!pat && patientsSec}

        {cv.length > 0 && (
          <section className="lp-sec rv" id="about">
            <div className="lp-wrap lp-about">
              <div className="lp-about-side">
                <img className="lp-about-photo" src="/brand/doctor.webp" alt="" width={140} height={140} loading="lazy" />
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

        <section className="lp-sec lp-portal rv" id="portal">
          <div className="lp-wrap">
            <span className="lp-kicker">אזור אישי</span>
            <h2 className="lp-h">כל התיקים והמסמכים, במקום אחד</h2>
            <p className="lp-sub">כניסה עם מייל וסיסמה. כל משתמש רואה רק את התיקים שלו.</p>
            <div className="lp-portal-grid">
              <div className="lp-portal-card">
                <span className="lp-ic"><Icon name="briefcase" /></span>
                <b>משרדי עורכי דין, מתווכים וחברות</b>
                <p>קביעת תורים ללקוחות, העלאת מסמכים, מעקב אחרי כל התיקים וחיפוש לפי שם או ת״ז.</p>
                <div className="lp-portal-act"><a className="btn btn-primary" href="/login"><Icon name="user" size={16} />כניסה</a><a className="btn" href="/register?k=law">פתיחת חשבון</a></div>
              </div>
              <div className="lp-portal-card">
                <span className="lp-ic"><Icon name="user" /></span>
                <b>מטופלים</b>
                <p>הזימונים, התזכורות והמסמכים החתומים שלכם, זמינים בכל רגע מכל מכשיר.</p>
                <div className="lp-portal-act"><a className="btn btn-primary" href="/login"><Icon name="user" size={16} />כניסה</a><a className="btn" href="/register?k=patient">פתיחת חשבון</a></div>
              </div>
              <div className="lp-portal-card lp-portal-safe">
                <span className="lp-ic"><Icon name="shield" /></span>
                <b>מאובטח ופרטי</b>
                <p>חיבור מוצפן, הרשאות לפי משתמש, ושמירה על סודיות רפואית בכל שלב.</p>
                <div className="lp-portal-act"><a className="lp-link-sm" href="/forgot">שכחתי סיסמה</a><a className="lp-link-sm" href="/privacy">מדיניות פרטיות</a></div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-callback rv" id="callback">
          <div className="lp-wrap lp-cb-in">
            <div>
              <span className="lp-kicker">{law ? 'למשרדים' : 'לא בטוחים מה מתאים לכם?'}</span>
              <h2 className="lp-h">{law ? 'רוצים לשמוע איך עובדים איתנו?' : 'השאירו פרטים ונחזור אליכם'}</h2>
              <p className="lp-sub">{law ? 'השאירו שם וטלפון, ונחזור אליכם עם כל הפרטים: סוגי חוות הדעת, זמנים ואופן העבודה עם המשרד.' : 'שם וטלפון, וזהו. נחזור אליכם, נבין במה מדובר ונמליץ על השירות המתאים.'}</p>
              {tel && <p className="lp-cb-or">או התקשרו עכשיו: <a href={`tel:${tel}`} dir="ltr">{s.lh_phone}</a>{wa && <> · <a href={wa} target="_blank" rel="noopener">וואטסאפ</a></>}</p>}
            </div>
            <div className="lp-cb-card"><CallbackForm defaultKind={law ? 'law' : 'patient'} /></div>
          </div>
        </section>

        <section className="lp-sec lp-alt rv" id="faq">
          <div className="lp-wrap lp-faq">
            <span className="lp-kicker">שאלות נפוצות</span>
            <h2 className="lp-h">כל מה שחשוב לדעת</h2>
            <details><summary>איך קובעים תור?</summary><p>דרך דף קביעת התור: בוחרים שירות ומועד, מצרפים מסמכים אם יש, ומאשרים פרטים. משרדים ומתווכים יכולים גם להירשם ולנהל את כל התיקים מחשבון אחד.</p></details>
            <details><summary>כמה זה עולה?</summary><p>העלות תלויה בסוג השירות ובהיקף התיק. אחרי קביעת התור המרפאה שולחת אליכם במייל את פרטי העלות ואופן התשלום.</p></details>
            <details><summary>אפשר שיחה טלפונית במקום להגיע?</summary><p>כן, לחלק מהשירותים. בזמן קביעת התור בוחרים ״שיחה טלפונית״, והרופא מתקשר אליכם במועד שנקבע.</p></details>
            {bring.length > 0 && <details><summary>מה להביא לביקור?</summary><ul>{bring.map((b) => <li key={b}>{b}</li>)}</ul></details>}
            <details><summary>איך מקבלים את המסמך?</summary><p>אחרי הביקור המסמך החתום נשלח במייל כקובץ PDF, למפנה ולמטופל, ומופיע גם באזור האישי להורדה.</p></details>
            <details><summary>אפשר לשנות או לבטל תור?</summary><p>כן. מתוך האזור האישי אפשר לבקש מועד אחר או לבטל{s.lh_phone ? `, ואפשר גם להתקשר: ${s.lh_phone}` : ''}.</p></details>
            <details><summary>האתר נגיש?</summary><p>כן. בכל עמוד יש כפתור נגישות להגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים ועצירת אנימציות. פרטים בהצהרת הנגישות.</p></details>
          </div>
        </section>

        <section className="lp-sec rv" id="contact">
          <div className="lp-wrap lp-contact">
            <div>
              <span className="lp-kicker">יצירת קשר</span>
              <h2 className="lp-h">נשמח לעמוד לרשותכם</h2>
              <ul className="lp-contact-list">
                {s.lh_address && <li><Icon name="navigation" />{s.lh_address}</li>}
                {s.lh_phone && <li><Icon name="phone" /><a href={`tel:${tel}`} dir="ltr">{s.lh_phone}</a></li>}
                {s.lh_email && <li><Icon name="mail" /><a href={`mailto:${s.lh_email}`} dir="ltr">{s.lh_email}</a></li>}
              </ul>
              <div className="lp-cta">
                {s.lh_address && <a className="btn" href={waze(s.lh_address)} target="_blank" rel="noopener"><Icon name="navigation" />Waze</a>}
                {s.lh_address && <a className="btn" href={maps(s.lh_address)} target="_blank" rel="noopener"><Icon name="externalLink" />Google Maps</a>}
                {wa && <a className="btn" href={wa} target="_blank" rel="noopener"><Icon name="message" />וואטסאפ</a>}
              </div>
            </div>
            <div className="lp-final">
              <b>מוכנים להתחיל?</b>
              <p>קביעת תור לוקחת פחות משתי דקות.</p>
              <a className="btn btn-primary btn-lg" href="/book"><Icon name="calendarPlus" />קביעת תור</a>
              <a className="lp-hero-login" href="/login"><span className="lp-login-ic"><Icon name="user" size={15} /></span><span>כבר רשומים? <b>כניסה לאזור האישי</b></span></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span className="lp-foot-brand"><img src="/brand/emblem.png" alt="" width={28} height={28} />© {year} {s.lh_name}{s.lh_licenses ? ` · ${s.lh_licenses}` : ''}</span>
          <nav aria-label="מידע משפטי"><a href="/login">אזור אישי</a><a href="/terms">תנאי שימוש</a><a href="/privacy">מדיניות פרטיות</a><a href="/accessibility">הצהרת נגישות</a></nav>
        </div>
      </footer>
      {wa && <a className="lp-wa no-print" href={wa} target="_blank" rel="noopener" aria-label="שליחת הודעה בוואטסאפ"><Icon name="message" size={26} /></a>}
      <nav className="lp-mbar" aria-label="פעולות מהירות">
        {tel && <a href={`tel:${tel}`}><Icon name="phone" />התקשרו</a>}
        {wa && <a href={wa} target="_blank" rel="noopener"><Icon name="message" />וואטסאפ</a>}
        <a href="/login"><Icon name="user" />אזור אישי</a>
        <a className="on" href={law ? '/register?k=law' : '/book'}><Icon name={law ? 'briefcase' : 'calendarPlus'} />{law ? 'פתיחת חשבון' : 'קביעת תור'}</a>
      </nav>
    </div>
  );
}
