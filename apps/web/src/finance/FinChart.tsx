import { formatMoney } from './financeApi';
import './finchart.css';

/**
 * Gráfico de barras mensal (CSS puro, sem lib). Mostra meses passados, o mês
 * atual em destaque e a projeção à frente (barra tracejada) — sempre com título,
 * legenda e a fórmula explicada (princípio da jornada guiada).
 */
export interface ChartPoint {
  key: string;
  label: string;
  cents: number;
  current?: boolean;
  projected?: boolean;
}

export function FinChart({
  points,
  currency,
  title,
  subtitle,
  caption,
  note,
  emptyText,
}: {
  points: ChartPoint[];
  currency: string | null;
  title: string;
  subtitle: string;
  /** Fórmula explicada, abaixo do gráfico. */
  caption: string;
  /** Aviso cauteloso opcional (poucos dados / só um tipo). */
  note?: string;
  /** Texto do estado vazio (quando não há valores). */
  emptyText: string;
}) {
  const max = Math.max(...points.map((p) => p.cents), 1);
  const allZero = points.every((p) => p.cents === 0);
  const hasProjection = points.some((p) => p.projected);

  return (
    <div className="fchart-card">
      <div className="fchart-head">
        <div>
          <h2 className="fchart-title">{title}</h2>
          <p className="fchart-subtitle">{subtitle}</p>
        </div>
        {hasProjection && !allZero && (
          <div className="fchart-legend" aria-hidden="true">
            <span className="fchart-legend__item">
              <span className="fchart-legend__swatch fchart-legend__swatch--real" /> Real
            </span>
            <span className="fchart-legend__item">
              <span className="fchart-legend__swatch fchart-legend__swatch--proj" /> Projeção
            </span>
          </div>
        )}
      </div>

      {allZero ? (
        <p className="fchart__empty">{emptyText}</p>
      ) : (
        <div className="fchart" role="img" aria-label={caption}>
          {points.map((p) => (
            <div
              className="fchart__col"
              key={p.key}
              title={`${p.label}: ${formatMoney(p.cents, currency)}${p.projected ? ' (projeção)' : ''}`}
            >
              <span className={'fchart__value' + (p.current || p.projected ? ' is-strong' : '')}>
                {p.cents > 0 ? compact(p.cents) : ''}
              </span>
              <div className="fchart__track">
                <div
                  className={
                    'fchart__bar' +
                    (p.current ? ' fchart__bar--current' : '') +
                    (p.projected ? ' fchart__bar--proj' : '')
                  }
                  style={{ height: `${Math.max(p.cents > 0 ? 6 : 2, Math.round((p.cents / max) * 100))}%` }}
                />
              </div>
              <span className={'fchart__label' + (p.current ? ' is-current' : '')}>
                {p.label}
                {p.projected ? '*' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {!allZero && <p className="fchart__caption">{caption}</p>}
      {!allZero && note && <p className="fchart__note">{note}</p>}
    </div>
  );
}

/** R$ compacto pra caber em cima da barra (1,2 mil / 350). */
function compact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
