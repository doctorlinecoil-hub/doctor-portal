import Icon from '@/components/Icon';
import { PageHead } from '@/components/ui';
import { AreaTrend, Delta, Donut, HBars } from '@/components/charts';
import { ils } from '@/lib/constants';
import type { Report } from '@/lib/reports';

const short = (n: number) => (n >= 10000 ? `₪${Math.round(n / 1000)}K` : ils(n));

function Kpi({ icon, tone, label, value, delta, sub, href }: { icon: string; tone: string; label: string; value: string | number; delta?: React.ReactNode; sub?: string; href?: string }) {
  const body = (
    <>
      <span className={`stat-ic ${tone}`}><Icon name={icon} /></span>
      <div>
        <span>{label}</span>
        <b>{value}</b>
        {delta}
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </>
  );
  return href ? <a className="stat stat-link kpi" href={href}>{body}</a> : <div className="stat kpi">{body}</div>;
}

export function ReportsView({ report: r }: { report: Report }) {
  const k = r.kpi;
  return (
    <>
      <PageHead title="דוחות והכנסות" sub="12 החודשים האחרונים · הסכומים כוללים מע״מ">
        <a className="btn" href="/api/export?what=cases"><Icon name="download" />תיקים לאקסל</a>
        <a className="btn" href="/api/export?what=payments"><Icon name="download" />תשלומים לאקסל</a>
      </PageHead>

      <div className="stats">
        <Kpi icon="calendar" tone="info" label="תיקים החודש" value={k.casesMonth} delta={<Delta now={k.casesMonth} before={k.casesPrev} />} />
        <Kpi icon="receipt" tone="violet" label="חויב החודש" value={ils(k.billedMonth)} delta={<Delta now={k.billedMonth} before={k.billedPrev} />} />
        <Kpi icon="wallet" tone="ok" label="נגבה החודש" value={ils(k.collectedMonth)} delta={<Delta now={k.collectedMonth} before={k.collectedPrev} />} />
        <Kpi icon="alert" tone="bad" label="יתרות פתוחות" value={ils(k.outstanding)} href="/admin/payments" sub="לחצו לפירוט ולרישום תשלום" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2><Icon name="chart" />הכנסות לפי חודש</h2>
          <span className="ch-keys"><i className="k1" />חויב <i className="k2" />נגבה</span>
        </div>
        <AreaTrend
          points={r.months.map((m) => ({ label: m.label, value: m.billed, value2: m.collected, title: `${m.label}: ${m.cases} תיקים · חויב ${ils(m.billed)} · נגבה ${ils(m.collected)}` }))}
          fmt={short}
          names={['חויב', 'נגבה']}
        />
      </section>

      <div className="ch-grid3">
        <section className="panel">
          <div className="panel-head"><h2><Icon name="file" />תיקים לפי שירות</h2></div>
          <Donut data={r.services.map((s) => ({ label: s.label, value: s.cases }))} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2><Icon name="activity" />מצב התיקים</h2></div>
          <Donut data={r.statuses.map((s) => ({ label: s.label, value: s.value }))} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2><Icon name="stethoscope" />מדדים</h2></div>
          <ul className="mini-kpis">
            <li><span>ממוצע לתיק</span><b className="num">{ils(k.avgTicket)}</b></li>
            <li><span>ממוצע מביקור למכתב</span><b className="num">{k.avgDaysToLetter == null ? '—' : `${k.avgDaysToLetter} ימים`}</b></li>
            <li><span>מכתבים פתוחים</span><b className="num">{k.openLetters}</b></li>
            <li><span>פגישות במרפאה / טלפוניות</span><b className="num">{r.modes.clinic} / {r.modes.phone}</b></li>
            <li><span>שיעור ביטולים</span><b className="num">{r.cancelRate}%</b></li>
          </ul>
        </section>
      </div>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section className="panel">
          <div className="panel-head"><h2><Icon name="briefcase" />המפנים המובילים</h2><span className="hint">לפי סכום חיוב</span></div>
          <HBars data={r.firms.slice(0, 8).map((f) => ({ label: f.name || 'ללא שם', value: f.billed, sub: `${f.cases} תיקים · שולם ${ils(f.paid)}${f.balance ? ` · יתרה ${ils(f.balance)}` : ''}` }))} fmt={ils} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2><Icon name="receipt" />הכנסות לפי שירות</h2></div>
          <HBars data={r.services.map((s) => ({ label: s.label, value: s.billed, sub: `${s.cases} תיקים` }))} fmt={ils} />
        </section>
      </div>

      <section className="panel flush">
        <div className="panel-head"><h2><Icon name="list" />פירוט לפי מפנה</h2></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>מפנה</th><th>תיקים</th><th>חויב</th><th>שולם</th><th>יתרה</th></tr></thead>
          <tbody>{r.firms.map((f) => <tr key={f.id}><td>{f.name}</td><td className="num">{f.cases}</td><td className="num">{ils(f.billed)}</td><td className="num">{ils(f.paid)}</td><td className={`num${f.balance ? ' bad-t' : ''}`}>{ils(f.balance)}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
