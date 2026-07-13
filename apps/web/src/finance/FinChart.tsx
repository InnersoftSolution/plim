import { formatMoney } from './financeApi';
import './finchart.css';

/**
 * Gráfico de barras mensal (CSS puro, sem lib).
 * - Modo FLUXO (inCents/outCents): entrou (azul) x saiu (vermelho) por mês.
 * - Modo simples (cents): uma série por mês (ex.: aportes).
 * Sempre com título, legenda e a fórmula explicada (jornada guiada). O bloco
 * educativo vira um "?" discreto no canto, que aparece no hover.
 */
export interface ChartPoint {
  key: string;
  label: string;
  /** Série única (ex.: aportes). */
  cents?: number;
  /** Fluxo: dinheiro que entrou no mês (receitas). */
  inCents?: number;
  /** Fluxo: dinheiro que saiu no mês (despesas pagas). */
  outCents?: number;
  /** A pagar do mês (contas em aberto), some no "saiu" como parte tracejada. */
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
  emptyText,
  helpText,
}: {
  points: ChartPoint[];
  currency: string | null;
  title: string;
  subtitle: string;
  /** Descrição do gráfico para leitores de tela (aria-label). */
  caption: string;
  /** Texto do estado vazio (quando não há valores). */
  emptyText: string;
  /** Explicação educativa mostrada no "?" do canto (hover). */
  helpText?: string;
}) {
  const flow = points.some((p) => p.inCents !== undefined || p.outCents !== undefined);
  const totalOf = (p: ChartPoint) =>
    flow
      ? Math.max(p.inCents ?? 0, (p.outCents ?? 0) + (p.pendingCents ?? 0))
      : (p.cents ?? 0) + (p.pendingCents ?? 0);
  const max = Math.max(...points.map(totalOf), 1);
  const allZero = points.every((p) => totalOf(p) === 0);
  const hasProjection = points.some((p) => p.projected);
  const hasPending = points.some((p) => (p.pendingCents ?? 0) > 0);
  const pct = (v: number) => Math.max(v > 0 ? 6 : 0, Math.round((v / max) * 100));

  return (
    <div className="fchart-card">
      <div className="fchart-head">
        <div>
          <h2 className="fchart-title">
            {title}
            {helpText && (
              <span className="fchart-help" tabIndex={0} role="img" aria-label={helpText}>
                ?<span className="fchart-help__pop">{helpText}</span>
              </span>
            )}
          </h2>
          <p className="fchart-subtitle">{subtitle}</p>
        </div>
        {!allZero && (
          <div className="fchart-legend" aria-hidden="true">
            {flow ? (
              <>
                <span className="fchart-legend__item">
                  <span className="fchart-legend__swatch fchart-legend__swatch--in" /> Entrou
                </span>
                <span className="fchart-legend__item">
                  <span className="fchart-legend__swatch fchart-legend__swatch--out" /> Saiu
                </span>
              </>
            ) : (
              <span className="fchart-legend__item">
                <span className="fchart-legend__swatch fchart-legend__swatch--real" /> Pago
              </span>
            )}
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
            const inC = p.inCents ?? 0;
            const outC = p.outCents ?? 0;
            const pend = p.pendingCents ?? 0;
            const single = p.cents ?? 0;
            return (
              <div className="fchart__col" key={p.key}>
                <div className="fchart__tip" role="tooltip">
                  <span className="fchart__tip-label">
                    {p.label}
                    {p.projected ? ' (projeção)' : ''}
                  </span>
                  {p.projected ? (
                    <span className="fchart__tip-row">
                      <i className="fchart__tip-dot fchart__tip-dot--proj" />
                      Gasto previsto {formatMoney(flow ? outC : single, currency)}
                    </span>
                  ) : flow ? (
                    <>
                      <span className="fchart__tip-row">
                        <i className="fchart__tip-dot fchart__tip-dot--in" />
                        Entrou {formatMoney(inC, currency)}
                      </span>
                      <span className="fchart__tip-row">
                        <i className="fchart__tip-dot fchart__tip-dot--out" />
                        Saiu {formatMoney(outC, currency)}
                      </span>
                      {pend > 0 && (
                        <span className="fchart__tip-row">
                          <i className="fchart__tip-dot fchart__tip-dot--pending" />A pagar{' '}
                          {formatMoney(pend, currency)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="fchart__tip-row">{formatMoney(single, currency)}</span>
                      {pend > 0 && (
                        <span className="fchart__tip-row">
                          <i className="fchart__tip-dot fchart__tip-dot--pending" />A pagar{' '}
                          {formatMoney(pend, currency)}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <span className={'fchart__value' + (p.current || p.projected ? ' is-strong' : '')}>
                  {p.projected ? compact(flow ? outC : single) : ''}
                </span>
                <div className={'fchart__track' + (flow && !p.projected ? ' fchart__track--flow' : '')}>
                  {p.projected ? (
                    <div className="fchart__bar fchart__bar--proj" style={{ height: `${pct(flow ? outC : single)}%` }} />
                  ) : flow ? (
                    <>
                      <div className="fchart__bar fchart__bar--in" style={{ height: `${pct(inC)}%` }} />
                      <div className="fchart__stack fchart__stack--out" style={{ height: `${pct(outC + pend)}%` }}>
                        {pend > 0 && (
                          <div
                            className="fchart__seg fchart__seg--pending"
                            style={{ height: `${outC + pend > 0 ? Math.round((pend / (outC + pend)) * 100) : 0}%` }}
                          />
                        )}
                        {outC > 0 && (
                          <div
                            className="fchart__seg fchart__seg--out"
                            style={{ height: `${outC + pend > 0 ? Math.round((outC / (outC + pend)) * 100) : 0}%` }}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="fchart__stack" style={{ height: `${pct(single + pend)}%` }}>
                      {pend > 0 && (
                        <div
                          className="fchart__seg fchart__seg--pending"
                          style={{ height: `${single + pend > 0 ? Math.round((pend / (single + pend)) * 100) : 0}%` }}
                        />
                      )}
                      {single > 0 && (
                        <div
                          className={'fchart__seg fchart__seg--paid' + (p.current ? ' is-current' : '')}
                          style={{ height: `${single + pend > 0 ? Math.round((single / (single + pend)) * 100) : 0}%` }}
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
    </div>
  );
}

/** R$ compacto pra caber em cima da barra (1,2 mil / 350). */
function compact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
