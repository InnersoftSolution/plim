import { Link } from 'react-router-dom';
import { formatMoney } from './financeApi';
import { Widget } from './FinanceView';
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
 * "Gastos por categoria" do período: barras horizontais, uma por categoria,
 * clicáveis para filtrar as movimentações. Só despesas pagas e confirmadas.
 *
 * Era um donut. Donut é bonito e péssimo para a pergunta que este bloco
 * responde: comparar categorias de tamanho parecido. Duas fatias de 42% e 38%
 * são indistinguíveis num anel e óbvias em barras alinhadas na mesma base.
 */
export function GastosPorCategoriaCard({
  rows,
  totalCents,
  selected,
  onSelect,
}: {
  rows: GastoCategoriaRow[];
  totalCents: number;
  /** filtro ativo: '' nenhum, '__none__' sem categoria, ou id. */
  selected: string;
  onSelect: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Widget id="categorias" title="Gastos por categoria">
        <p className="fw__empty">
          Sem despesas pagas no período. Categorize seus gastos ao registrar uma despesa para ver
          aqui onde o dinheiro está indo.
        </p>
      </Widget>
    );
  }

  const keyOf = (id: string | null) => id ?? '__none__';
  const maior = rows[0]?.totalCents ?? 1;
  // Nada categorizado ainda: o card vira orientação (jornada guiada).
  const onlyUncategorized = rows.length === 1 && rows[0]!.id === null;

  return (
    <Widget
      id="categorias"
      title="Gastos por categoria"
      subtitle="Onde o dinheiro está indo no período"
      action={
        <span className="gpc__total" data-financial>
          {formatMoney(totalCents)}
        </span>
      }
    >
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
                aria-pressed={active}
              >
                <span className="gpc__top">
                  <span className="gpc__name">{r.name}</span>
                  <span className="gpc__meta">
                    <strong data-financial>{formatMoney(r.totalCents)}</strong>
                    <small>
                      {Math.round(r.pct * 100)}%
                      <em className="gpc__count"> · {r.count} mov.</em>
                    </small>
                  </span>
                </span>
                {/* Proporcional à maior categoria: a diferença entre a primeira
                    e a segunda é o que a pessoa está tentando enxergar. */}
                <span className="gpc__track" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(3, Math.round((r.totalCents / maior) * 100))}%`,
                      background: r.color,
                    }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {onlyUncategorized && (
        <p className="gpc__hint">
          Suas despesas ainda não têm categoria. Abra uma movimentação, toque em{' '}
          <strong>Editar movimentação</strong> e escolha a categoria para ver aqui para onde o
          dinheiro está indo. <Link to="/empresa/categorias">Gerenciar categorias</Link>
        </p>
      )}
    </Widget>
  );
}
