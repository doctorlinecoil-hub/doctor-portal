import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { PAY_METHODS, STATUS_STAFF, ils, type ApptStatus, type PayMethod } from '@/lib/constants';
import { fmtStamp } from '@/lib/dates';

export type LogRow = { id: number; user_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> | null; at: string; who?: string };

const ACTIONS: Record<string, string> = {
  book: 'קביעת תור', status: 'שינוי סטטוס', upload: 'העלאת מסמך', note: 'הערה בתיק', letter: 'טיוטת מכתב', finalize: 'מכתב סופי',
  view_case: 'צפייה בתיק', ai_draft: 'ניסוח AI', print_draft: 'הדפסת טיוטה', print_final: 'הורדת מכתב סופי', payment: 'רישום תשלום', payment_deleted: 'מחיקת תשלום',
};

function details(r: LogRow) {
  const d = r.details ?? {};
  if (r.action === 'status' && d.to) return `${STATUS_STAFF[d.from as ApptStatus] ?? d.from} ← ${STATUS_STAFF[d.to as ApptStatus] ?? d.to}`.replace('←', '→');
  if ((r.action === 'payment' || r.action === 'payment_deleted') && d.amount) return `${ils(d.amount as number)} · ${PAY_METHODS[d.method as PayMethod] ?? ''}`;
  return '';
}

export function LogView({ rows }: { rows: LogRow[] }) {
  return (
    <>
      <PageHead title="יומן פעולות" sub="300 הפעולות האחרונות: מי עשה מה ומתי" />
      <section className="panel flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>מתי</th><th>מי</th><th>פעולה</th><th>פרטים</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num muted">{fmtStamp(r.at)}</td>
                  <td>{r.who || <span className="muted">מערכת</span>}</td>
                  <td>{ACTIONS[r.action] || r.action}</td>
                  <td className="muted">{details(r)}</td>
                  <td>{(r.entity === 'appointment' || r.entity === 'letter') && r.entity_id ? <Link href={`/doctor/cases/${r.entity_id}`}>לתיק</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
