import { Link } from 'react-router-dom';
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
    const seg = { row: r, dash, offset: C - acc };
    acc += dash;
    return seg;
  });

  const keyOf = (id: string | null) => id ?? '__none__';
  // Nada categorizado ainda: o card vira orientação (jornada guiada).
  const onlyUncategorized = rows.length === 1 && rows[0]!.id === null;
  const categorizedCount = rows.filter((r) => r.id != null).length;

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
              {arcs.map((a) => {
                const key = keyOf(a.row.id);
                return (
                  <circle
                    key={key}
                    className="gpc__arc"
                    cx="70"
                    cy="70"
                    r={R}
                    fill="none"
                    stroke={a.row.color}
                    strokeWidth="16"
                    strokeDasharray={`${a.dash} ${C - a.dash}`}
                    strokeDashoffset={a.offset}
                    onClick={() => onSelect(selected === key ? '' : key)}
                  >
                    {/* Tooltip nativo: nome, valor e % da fatia. */}
                    <title>
                      {`${a.row.name}: ${formatMoney(a.row.totalCents, currency)} (${Math.round(a.row.pct * 100)}% · ${a.row.count} mov.)`}
                    </title>
                  </circle>
                );
              })}
            </g>
            <text x="70" y="66" textAnchor="middle" className="gpc__chart-label">
              {categorizedCount}
            </text>
            <text x="70" y="82" textAnchor="middle" className="gpc__chart-sub">
              {categorizedCount === 1 ? 'categoria' : 'categorias'}
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
                    {/* Valor na cor da fatia: liga a lista ao gráfico de relance. */}
                    <strong data-financial style={{ color: r.color }}>
                      {formatMoney(r.totalCents, currency)}
                    </strong>
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
      {onlyUncategorized && (
        <p className="gpc__hint">
          Suas despesas ainda não têm categoria. Abra uma movimentação, toque em{' '}
          <strong>Editar movimentação</strong> e escolha a categoria para ver aqui para onde o
          dinheiro está indo. <Link to="/empresa/categorias">Gerenciar categorias</Link>
        </p>
      )}
    </section>
  );
}
