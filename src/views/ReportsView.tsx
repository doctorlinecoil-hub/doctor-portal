import Icon from '@/components/Icon';
import { PageHead, Stat } from '@/components/ui';
import { ils } from '@/lib/constants';
import type { Report } from '@/lib/reports';

export function ReportsView({ report: r }: { report: Report }) {
  const max = Math.max(1, ...r.months.map((m) => Math.max(m.billed, m.collected)));
  return (
    <>
      <PageHead title="דוחות והכנסות" sub="12 החודשים האחרונים. הסכומים כוללים מע״מ.">
        <a className="btn" href="/api/export?what=cases"><Icon name="download" />תיקים לאקסל</a>
        <a className="btn" href="/api/export?what=payments"><Icon name="download" />תשלומים לאקסל</a>
      </PageHead>
      <div className="stats">
        <Stat icon="calendar" label="תיקים החודש" value={r.kpi.casesMonth} tone="info" />
        <Stat icon="wallet" label="נגבה החודש" value={ils(r.kpi.collectedMonth)} tone="ok" />
        <Stat icon="receipt" label="יתרות פתוחות" value={ils(r.kpi.outstanding)} tone="bad" href="/admin/payments" />
        <Stat icon="clock" label="ממוצע מביקור למכתב" value={r.kpi.avgDaysToLetter == null ? '—' : `${r.kpi.avgDaysToLetter} ימים`} tone="violet" sub={r.kpi.openLetters ? `${r.kpi.openLetters} מכתבים פתוחים` : undefined} />
      </div>
      <section className="panel">
        <div className="panel-head"><h2><Icon name="chart" />לפי חודש</h2><span className="hint"><i className="lg billed" /> חויב · <i className="lg collected" /> נגבה</span></div>
        <div className="bars" role="img" aria-label="חיוב וגבייה לפי חודש">
          {r.months.map((m) => (
            <div className="bar-col" key={m.key} title={`${m.label}: ${m.cases} תיקים · חויב ${ils(m.billed)} · נגבה ${ils(m.collected)}`}>
              <div className="bar-pair">
                <i className="bar billed" style={{ height: `${(m.billed / max) * 100}%` }} />
                <i className="bar collected" style={{ height: `${(m.collected / max) * 100}%` }} />
              </div>
              <span className="bar-lbl">{m.label}</span>
              <span className="bar-n num">{m.cases}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="briefcase" />לפי מפנה</h2></div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>מפנה</th><th>תיקים</th><th>חויב</th><th>שולם</th><th>יתרה</th></tr></thead>
            <tbody>{r.firms.map((f) => <tr key={f.id}><td>{f.name}</td><td className="num">{f.cases}</td><td className="num">{ils(f.billed)}</td><td className="num">{ils(f.paid)}</td><td className={`num${f.balance ? ' bad-t' : ''}`}>{ils(f.balance)}</td></tr>)}</tbody>
          </table></div>
        </section>
        <section className="panel flush">
          <div className="panel-head"><h2><Icon name="file" />לפי סוג</h2></div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>סוג</th><th>תיקים</th><th>חויב</th></tr></thead>
            <tbody>{r.types.map((t) => <tr key={t.type}><td>{t.label}</td><td className="num">{t.cases}</td><td className="num">{ils(t.billed)}</td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
