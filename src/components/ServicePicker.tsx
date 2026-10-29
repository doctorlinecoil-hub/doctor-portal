import { ils } from '@/lib/constants';
import type { Service } from '@/lib/services';
import Icon from './Icon';

/** "What do you need from the doctor?": the clinic's own list of services, with prices. */
export default function ServicePicker({ services, value, onChange, suggested, compact }: {
  services: Service[]; value: string | null; onChange: (s: Service) => void; suggested?: string | null; compact?: boolean;
}) {
  if (!services.length) return <p className="muted">עוד לא הוגדרו סוגי שירות. אפשר להגדיר אותם בהגדרות ← סוגי שירות.</p>;
  return (
    <div className={`options${compact ? ' compact' : ''}`}>
      {services.map((s) => (
        <button key={s.id} type="button" className="opt" aria-pressed={value === s.id} onClick={() => onChange(s)}>
          <span className="opt-ic"><Icon name={s.icon || 'file'} /></span>
          <span>
            <b>{s.label}</b>
            {!compact && s.description && <span>{s.description}</span>}
            {Number(s.price) > 0 && <span className="price">{ils(Number(s.price))}</span>}
            {suggested === s.id && value !== s.id && <span className="ai-tag" style={{ marginInlineStart: 0, marginTop: 4 }}><Icon name="sparkles" size={12} />מתאים לפי המסמכים</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
