import Icon from '@/components/Icon';

export type SetupItem = { key: string; ok: boolean; title: string; why: string; how: string[] };

/** What is still missing for everything to work: shown to the admin on the dashboard until it's all set. */
export function SetupStatus({ items }: { items: SetupItem[] }) {
  const todo = items.filter((i) => !i.ok);
  if (!todo.length) return null;
  return (
    <section className="panel setup">
      <div className="panel-head"><h2><Icon name="alert" />כדי שהכל יעבוד: {todo.length === 1 ? 'נשאר דבר אחד' : `נשארו ${todo.length} דברים`}</h2>
        <span className="hint">{items.length - todo.length} מתוך {items.length} מוכנים</span></div>
      <ol className="setup-list">
        {todo.map((i) => (
          <li key={i.key}>
            <b>{i.title}</b>
            <span className="muted">{i.why}</span>
            <details><summary>איך מסדרים</summary><ol>{i.how.map((h) => <li key={h}>{h}</li>)}</ol></details>
          </li>
        ))}
      </ol>
    </section>
  );
}
