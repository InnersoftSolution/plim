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
  /** Real: o que já foi pago no mês. */
  cents: number;
  /** A pagar: contas do mês ainda não quitadas (recorrentes, contas a pagar). */
  pendingCents?: number;
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
  const totalOf = (p: ChartPoint) => p.cents + (p.pendingCents ?? 0);
  const max = Math.max(...points.map(totalOf), 1);
  const allZero = points.every((p) => totalOf(p) === 0);
  const hasProjection = points.some((p) => p.projected);
  const hasPending = points.some((p) => (p.pendingCents ?? 0) > 0);

  return (
    <div className="fchart-card">
      <div className="fchart-head">
        <div>
          <h2 className="fchart-title">{title}</h2>
          <p className="fchart-subtitle">{subtitle}</p>
        </div>
        {(hasProjection || hasPending) && !allZero && (
          <div className="fchart-legend" aria-hidden="true">
            <span className="fchart-legend__item">
              <span className="fchart-legend__swatch fchart-legend__swatch--real" /> Pago
            </span>
            {hasPending && (
              <span className="fchart-legend__item">
                <span className="fchart-legend__swatch fchart-legend__swatch--pending" /> A pagar
              </span>
            )}
            {hasProjection && (
              <span className="fchart-legend__item">
                <span className="fchart-legend__swatch fchart-legend__swatch--proj" /> Projeção
              </span>
            )}
          </div>
        )}
      </div>

      {allZero ? (
        <p className="fchart__empty">{emptyText}</p>
      ) : (
        <div className="fchart" role="img" aria-label={caption}>
          {points.map((p) => {
            const paid = p.cents;
            const pending = p.pendingCents ?? 0;
            const total = paid + pending;
            const totalPct = Math.max(total > 0 ? 6 : 2, Math.round((total / max) * 100));
            const tip =
              pending > 0
                ? `${p.label}: ${formatMoney(paid, currency)} pago + ${formatMoney(pending, currency)} a pagar`
                : `${p.label}: ${formatMoney(paid, currency)}${p.projected ? ' (projeção)' : ''}`;
            return (
              <div className="fchart__col" key={p.key} title={tip}>
                <span className={'fchart__value' + (p.current || p.projected ? ' is-strong' : '')}>
                  {total > 0 ? compact(total) : ''}
                </span>
                <div className="fchart__track">
                  {p.projected ? (
                    <div className="fchart__bar fchart__bar--proj" style={{ height: `${totalPct}%` }} />
                  ) : (
                    <div className="fchart__stack" style={{ height: `${totalPct}%` }}>
                      {pending > 0 && (
                        <div
                          className="fchart__seg fchart__seg--pending"
                          style={{ height: `${total > 0 ? Math.round((pending / total) * 100) : 0}%` }}
                        />
                      )}
                      {paid > 0 && (
                        <div
                          className={'fchart__seg fchart__seg--paid' + (p.current ? ' is-current' : '')}
                          style={{ height: `${total > 0 ? Math.round((paid / total) * 100) : 0}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <span className={'fchart__label' + (p.current ? ' is-current' : '')}>
                  {p.label}
                  {p.projected ? '*' : ''}
                </span>
              </div>
            );
          })}
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
