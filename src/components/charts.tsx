/*
 * Small charts drawn as plain SVG on the server (no chart library, no client code).
 * Colors come from CSS variables, so they follow the light and dark themes.
 */

export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

type Pt = { label: string; value: number; value2?: number; title?: string };

/** An area/line trend with an optional second series (e.g. billed vs collected). */
export function AreaTrend({ points, height = 220, fmt = (n: number) => String(n), names }: {
  points: Pt[]; height?: number; fmt?: (n: number) => string; names?: [string, string?];
}) {
  const W = 720;
  const H = height;
  const padX = 8;
  const padTop = 18;
  const padBottom = 28;
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.value2 ?? 0)));
  const n = points.length;
  // RTL: the oldest point is on the right
  const x = (i: number) => W - padX - (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (H - padTop - padBottom) * (1 - v / max);
  const line = (k: 'value' | 'value2') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(p[k] ?? 0)).toFixed(1)}`).join(' ');
  const area = (k: 'value' | 'value2') => `${line(k)} L${x(n - 1).toFixed(1)},${H - padBottom} L${x(0).toFixed(1)},${H - padBottom} Z`;
  const has2 = points.some((p) => p.value2 != null);
  const grid = [0.25, 0.5, 0.75, 1];
  return (
    <figure className="ch-area">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={names?.filter(Boolean).join(' / ')}>
        <defs>
          <linearGradient id="ch-g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--c1)" stopOpacity=".28" /><stop offset="1" stopColor="var(--c1)" stopOpacity="0" /></linearGradient>
          <linearGradient id="ch-g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--c2)" stopOpacity=".22" /><stop offset="1" stopColor="var(--c2)" stopOpacity="0" /></linearGradient>
        </defs>
        {grid.map((g) => <line key={g} x1={padX} x2={W - padX} y1={y(max * g)} y2={y(max * g)} className="ch-grid" />)}
        <line x1={padX} x2={W - padX} y1={H - padBottom} y2={H - padBottom} className="ch-axis" />
        {has2 && <path d={area('value2')} fill="url(#ch-g2)" />}
        <path d={area('value')} fill="url(#ch-g1)" />
        {has2 && <path d={line('value2')} className="ch-line l2" />}
        <path d={line('value')} className="ch-line l1" />
        {points.map((p, i) => (
          <g key={p.label + i}>
            <circle cx={x(i)} cy={y(p.value)} r={3.5} className="ch-dot d1"><title>{p.title || `${p.label}: ${fmt(p.value)}`}</title></circle>
            {p.value2 != null && <circle cx={x(i)} cy={y(p.value2)} r={3} className="ch-dot d2"><title>{p.title || `${p.label}: ${fmt(p.value2)}`}</title></circle>}
          </g>
        ))}
      </svg>
      <div className="ch-xl" style={{ ['--n' as string]: n }}>
        {points.map((p, i) => <span key={p.label + i}>{p.label}</span>)}
      </div>
      <figcaption className="ch-y num">{fmt(max)}</figcaption>
    </figure>
  );
}

/** A donut with a legend; the center shows the total. */
export function Donut({ data, total, center, fmt = (n: number) => String(n) }: {
  data: { label: string; value: number }[]; total?: number; center?: string; fmt?: (n: number) => string;
}) {
  const items = data.filter((d) => d.value > 0);
  const sum = total ?? items.reduce((s, d) => s + d.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="ch-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={items.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}>
        <circle cx="70" cy="70" r={R} className="ch-ring" />
        {sum > 0 && items.map((d, i) => {
          const len = (d.value / sum) * C;
          const el = (
            <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth="18"
              strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)">
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="ch-dn">{center ?? fmt(sum)}</text>
        <text x="70" y="86" textAnchor="middle" className="ch-dl">סה״כ</text>
      </svg>
      <ul className="ch-legend">
        {items.length === 0 && <li className="hint">אין נתונים עדיין</li>}
        {items.map((d, i) => (
          <li key={d.label}>
            <i style={{ background: SERIES[i % SERIES.length] }} />
            <span>{d.label}</span>
            <b className="num">{fmt(d.value)}</b>
            <small className="num">{sum ? Math.round((d.value / sum) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars (rankings: referrers, services). */
export function HBars({ data, fmt = (n: number) => String(n), empty = 'אין נתונים עדיין' }: {
  data: { label: string; value: number; sub?: string }[]; fmt?: (n: number) => string; empty?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="hint">{empty}</p>;
  return (
    <ul className="ch-hbars">
      {data.map((d, i) => (
        <li key={d.label + i}>
          <div className="ch-hb-top"><span>{d.label}</span><b className="num">{fmt(d.value)}</b></div>
          <div className="ch-hb-track"><i style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES[i % SERIES.length] }} /></div>
          {d.sub && <small className="hint">{d.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

/** Tiny column chart for a dashboard card (e.g. bookings per day, next two weeks). */
export function Spark({ values, labels, today = -1 }: { values: number[]; labels?: string[]; today?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ch-spark" role="img" aria-label={values.map((v, i) => `${labels?.[i] ?? i}: ${v}`).join(', ')}>
      {values.map((v, i) => (
        <span key={i} className={i === today ? 'now' : ''} title={`${labels?.[i] ?? ''}: ${v}`}>
          <i style={{ height: `${v ? Math.max(8, (v / max) * 100) : 3}%` }} />
          {labels && <small>{labels[i]}</small>}
        </span>
      ))}
    </div>
  );
}

/** A KPI change versus the previous period. */
export function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  const good = invert ? !up : up;
  return <span className={`delta ${good ? 'good' : 'bad'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%<small> מול החודש הקודם</small></span>;
}
