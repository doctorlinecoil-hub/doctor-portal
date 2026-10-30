'use client';
import { useState } from 'react';
import Icon from './Icon';

type Svc = { id: string; label: string; base_type: string; icon: string };
type Who = 'patient' | 'law' | 'insurer';
type Goal = 'court' | 'nii' | 'consult' | 'tests';

const WHO: [Who, string, string][] = [['patient', 'אני המטופל/ת או בן משפחה', 'user'], ['law', 'עורך דין / משרד', 'briefcase'], ['insurer', 'חברת ביטוח / מתווך', 'building']];
const GOAL: [Goal, string, string][] = [
  ['court', 'חוות דעת לבית משפט או לתביעה', 'scale'],
  ['nii', 'ועדה רפואית בביטוח הלאומי', 'shield'],
  ['consult', 'ייעוץ ובדיקה אצל מומחה', 'stethoscope'],
  ['tests', 'הפניה לבדיקות (MRI, CT, EMG)', 'activity'],
];
const TYPE: Record<Goal, string> = { court: 'legal', nii: 'nii', consult: 'summary', tests: 'referral' };
const WHY: Record<Goal, string> = {
  court: 'חוות דעת מומחה מנומקת, ערוכה לפי דרישות בית המשפט, חתומה ומוכנה להגשה.',
  nii: 'חוות דעת שמפרטת את הממצאים והליקויים לפי ספר המבחנים של הביטוח הלאומי.',
  consult: 'בדיקה נוירולוגית יסודית, עיון בכל המסמכים, וסיכום ביקור עם המלצות להמשך.',
  tests: 'הפניה מנומקת לבדיקות ההדמיה או החשמליות שצריך, כדי להשלים את התמונה.',
};

/** "Which service fits me?": two quick questions, then the right service and a booking link with it chosen. */
export default function ServiceQuiz({ services }: { services: Svc[] }) {
  const [who, setWho] = useState<Who | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const pick = goal ? services.find((s) => s.base_type === TYPE[goal]) ?? services[0] : null;
  const reset = () => { setWho(null); setGoal(null); };

  return (
    <div className="qz" aria-live="polite">
      <ol className="qz-steps" aria-hidden="true"><li className={who ? 'done' : 'on'}>1</li><li className={goal ? 'done' : who ? 'on' : ''}>2</li><li className={goal ? 'on' : ''}>3</li></ol>
      {!who && (
        <div className="qz-q">
          <b>מי פונה?</b>
          <div className="qz-opts">{WHO.map(([k, l, i]) => <button key={k} type="button" onClick={() => setWho(k)}><Icon name={i} />{l}</button>)}</div>
        </div>
      )}
      {who && !goal && (
        <div className="qz-q">
          <b>במה מדובר?</b>
          <div className="qz-opts">{GOAL.map(([k, l, i]) => <button key={k} type="button" onClick={() => setGoal(k)}><Icon name={i} />{l}</button>)}</div>
          <button type="button" className="qz-back" onClick={() => setWho(null)}>חזרה</button>
        </div>
      )}
      {who && goal && pick && (
        <div className="qz-res">
          <span className="qz-badge"><Icon name="sparkles" size={14} />מה שמתאים לכם</span>
          <h3>{pick.label}</h3>
          <p>{WHY[goal]}</p>
          <div className="qz-cta">
            <a className="btn btn-primary btn-lg" href={`/book?s=${pick.id}`}><Icon name="calendarPlus" />קביעת תור ל{pick.label}</a>
            {who !== 'patient' && <a className="btn btn-lg" href={`/register?k=${who === 'law' ? 'law' : 'company'}`}><Icon name="briefcase" />פתיחת חשבון למשרד</a>}
          </div>
          <button type="button" className="qz-back" onClick={reset}>להתחיל מחדש</button>
        </div>
      )}
    </div>
  );
}
