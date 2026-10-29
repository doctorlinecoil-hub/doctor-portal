'use client';
import Icon from './Icon';

export type Mode = 'clinic' | 'phone';

/** Visit at the clinic, or a phone call from the doctor. */
export default function ModePicker({ value, onChange, phone }: { value: Mode; onChange: (m: Mode) => void; phone?: string }) {
  return (
    <div className="mode-pick" role="radiogroup" aria-label="סוג הפגישה">
      <button type="button" role="radio" aria-checked={value === 'clinic'} className="mode-opt" onClick={() => onChange('clinic')}>
        <span className="mode-ic"><Icon name="building" /></span>
        <span><b>פגישה במרפאה</b><small>בדיקה פרונטלית אצל הרופא</small></span>
      </button>
      <button type="button" role="radio" aria-checked={value === 'phone'} className="mode-opt" onClick={() => onChange('phone')}>
        <span className="mode-ic"><Icon name="phone" /></span>
        <span><b>שיחה טלפונית</b><small>{phone ? `הרופא יתקשר אל ${phone}` : 'הרופא מתקשר בשעה שנקבעה'}</small></span>
      </button>
    </div>
  );
}
