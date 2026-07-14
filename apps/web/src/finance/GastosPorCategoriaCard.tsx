import { formatMoney } from './financeApi';
import './gastosCategoria.css';

export interface GastoCategoriaRow {
  /** id da categoria; null = "Sem categoria". */
  id: string | null;
  name: string;
  color: string;
  totalCents: number;
  count: number;
  /** fração do total (0..1). */
  pct: number;
}

/**
 * "Gastos por categoria" do período: donut + lista. Cada linha é clicável para
 * filtrar as movimentações daquela categoria. Só despesas pagas e confirmadas.
 */
export function GastosPorCategoriaCard({
  rows,
  totalCents,
  currency,
  selected,
  onSelect,
}: {
  rows: GastoCategoriaRow[];
  totalCents: number;
  currency: string | null;
  /** filtro ativo: '' nenhum, '__none__' sem categoria, ou id. */
  selected: string;
  onSelect: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <section className="gpc">
        <div className="gpc__head">
          <h2>Gastos por categoria</h2>
        </div>
        <p className="gpc__empty">
          Sem despesas pagas no período. Categorize seus gastos ao registrar uma despesa para ver aqui
          onde o dinheiro está indo.
        </p>
      </section>
    );
  }

  // Arcos do donut (stroke-dasharray). Circunferência do círculo de r=54.
  const R = 54;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = rows.map((r) => {
    const dash = r.pct * C;
    const seg = { color: r.color, dash, offset: C - acc };
    acc += dash;
    return seg;
  });

  const keyOf = (id: string | null) => id ?? '__none__';

  return (
    <section className="gpc">
      <div className="gpc__head">
        <h2>Gastos por categoria</h2>
        <span className="gpc__total" data-financial>
          {formatMoney(totalCents, currency)}
        </span>
      </div>
      <div className="gpc__body">
        <div className="gpc__chart" aria-hidden="true">
          <svg viewBox="0 0 140 140" width="140" height="140">
            <g transform="rotate(-90 70 70)">
              <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-border-default)" strokeWidth="16" />
              {arcs.map((a, i) => (
                <circle
                  key={i}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth="16"
                  strokeDasharray={`${a.dash} ${C - a.dash}`}
                  strokeDashoffset={a.offset}
                />
              ))}
            </g>
            <text x="70" y="66" textAnchor="middle" className="gpc__chart-label">
              {rows.length}
            </text>
            <text x="70" y="82" textAnchor="middle" className="gpc__chart-sub">
              {rows.length === 1 ? 'categoria' : 'categorias'}
            </text>
          </svg>
        </div>
        <ul className="gpc__list">
          {rows.map((r) => {
            const key = keyOf(r.id);
            const active = selected === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={'gpc__row' + (active ? ' gpc__row--active' : '')}
                  onClick={() => onSelect(active ? '' : key)}
                >
                  <span className="gpc__dot" style={{ background: r.color }} aria-hidden="true" />
                  <span className="gpc__name">{r.name}</span>
                  <span className="gpc__meta">
                    <strong data-financial>{formatMoney(r.totalCents, currency)}</strong>
                    <small>
                      {Math.round(r.pct * 100)}% · {r.count} mov.
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
