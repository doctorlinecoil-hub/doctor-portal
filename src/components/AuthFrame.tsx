import Icon from './Icon';

export default function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-brand">
        <a href="/" className="row" style={{ gap: 12, color: 'inherit', textDecoration: 'none' }}>
          <span className="logo"><img src="/brand/emblem.png" alt="" width={40} height={40} /></span>
          <div><b style={{ color: '#fff', fontFamily: 'var(--f-head)', fontSize: 17 }}>ד״ר אלרן חנוך</b><div style={{ fontSize: 13 }}>נוירוכירורגיה · חוות דעת רפואיות</div></div>
        </a>
        <div>
          <h1>תורים, תיקים ומכתבים רפואיים במקום אחד</h1>
          <p>מערכת מאובטחת למשרדי עורכי דין, למתווכים, לחברות ולמטופלים.</p>
        </div>
        <div className="auth-points">
          <div><Icon name="calendarPlus" />קביעת תור מיידית לפי היומן של המרפאה</div>
          <div><Icon name="upload" />העברת מסמכים רפואיים בצורה מאובטחת</div>
          <div><Icon name="fileCheck" />מכתבים וחוות דעת חתומים, להורדה כ־PDF</div>
          <div><Icon name="shield" />כל מפנה רואה רק את התיקים שלו</div>
        </div>
        <div className="auth-foot hint" style={{ color: '#7F91A5' }}><a href="/" style={{ color: 'inherit' }}>לדף הבית</a> · <a href="/privacy" style={{ color: 'inherit' }}>פרטיות</a> · <a href="/terms" style={{ color: 'inherit' }}>תנאי שימוש</a></div>
      </section>
      <section className="auth-form">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}
