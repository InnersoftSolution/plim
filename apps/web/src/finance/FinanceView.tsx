import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Expense } from '@plim/shared';
import { formatMoney } from './financeApi';
import { daysUntil } from './due';
import './financeview.css';

/**
 * "Visão financeira": a área analítica da tela de Movimentações.
 *
 * A régua aqui é uma só: cada widget responde a UMA pergunta do sócio. Se não
 * responde, não existe. Por isso o Plim entrega widgets prontos e a pessoa
 * escolhe quais quer acompanhar, em vez de montar um dashboard do zero (isso
 * seria transferir o trabalho de pensar para quem só quer saber como está o
 * caixa). Sem arrastar, sem redimensionar, sem configurar eixo.
 */

export type WidgetId =
  | 'fluxo'
  | 'proximos'
  | 'entradas-saidas'
  | 'categorias'
  | 'atrasos'
  | 'aportes'
  | 'pagamentos-socio';

/** Largura no grid de 12 colunas do desktop. */
type Span = 4 | 6 | 8;

export const WIDGET_CATALOG: {
  id: WidgetId;
  label: string;
  question: string;
  span: Span;
}[] = [
  /* A ordem daqui é a ordem na tela: os dois primeiros são a visão padrão, e
     "Onde gastamos" vem antes de "O que vem aí" porque é a pergunta que a
     pessoa faz primeiro ao abrir o financeiro. */
  { id: 'categorias', label: 'Gastos por categoria', question: 'Onde estamos gastando?', span: 6 },
  { id: 'proximos', label: 'Próximos pagamentos', question: 'O que está chegando?', span: 4 },
  { id: 'fluxo', label: 'Fluxo de caixa', question: 'Como nossa situação evoluiu?', span: 8 },
  { id: 'aportes', label: 'Aportes dos sócios', question: 'Quanto cada sócio colocou?', span: 6 },
  { id: 'entradas-saidas', label: 'Entradas e saídas', question: 'Quanto entrou e quanto saiu por mês?', span: 8 },
  { id: 'atrasos', label: 'Contas em atraso', question: 'Existe algo vencido?', span: 4 },
  { id: 'pagamentos-socio', label: 'Pagamentos por sócio', question: 'Quem está bancando as despesas?', span: 6 },
];

/**
 * Visão padrão: dois blocos, lado a lado, no alto da página. Um olha para trás
 * (para onde o dinheiro foi) e outro para a frente (o que vence). São as duas
 * perguntas que o sócio faz ao abrir a tela; o resto é aprofundamento e entra
 * por "Personalizar". Quatro blocos por padrão viravam uma parede de gráfico
 * antes da lista.
 */
const DEFAULT_VIEW: WidgetId[] = ['categorias', 'proximos'];

const storageKey = (companyId: string) => `plim.finview.${companyId}`;

/**
 * Escolha de widgets, guardada no navegador de quem usa (é preferência de
 * leitura, não dado da empresa: cada sócio olha o que precisa).
 */
export function useFinanceView(companyId: string) {
  const [enabled, setEnabled] = useState<WidgetId[]>(DEFAULT_VIEW);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(companyId));
      if (!raw) {
        setEnabled(DEFAULT_VIEW);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const validos = parsed.filter((id): id is WidgetId =>
          WIDGET_CATALOG.some((w) => w.id === id),
        );
        // Lista vazia (ou só com nomes que não existem mais) volta ao padrão:
        // a Visão financeira é o ponto de partida, e a pessoa acrescenta o
        // que quiser a partir dele. Área analítica em branco não ajuda
        // ninguém, só parece defeito.
        setEnabled(validos.length > 0 ? validos : DEFAULT_VIEW);
      }
    } catch {
      setEnabled(DEFAULT_VIEW);
    }
  }, [companyId]);

  const persist = useCallback(
    (next: WidgetId[]) => {
      setEnabled(next);
      try {
        localStorage.setItem(storageKey(companyId), JSON.stringify(next));
      } catch {
        // Navegador sem storage (aba anônima com restrição): a visão vale só
        // nesta sessão, e a tela continua funcionando.
      }
    },
    [companyId],
  );

  const toggle = useCallback(
    (id: WidgetId) => {
      if (enabled.includes(id)) {
        // O último bloco não sai: a área existe para responder alguma
        // pergunta. Quem não quer um bloco troca por outro, não zera a tela.
        if (enabled.length === 1) return;
        persist(enabled.filter((w) => w !== id));
        return;
      }
      // Mantém a ordem do catálogo: a composição do grid é do Plim.
      persist(WIDGET_CATALOG.filter((w) => w.id === id || enabled.includes(w.id)).map((w) => w.id));
    },
    [enabled, persist],
  );

  const reset = useCallback(() => persist(DEFAULT_VIEW), [persist]);

  const isOn = useCallback((id: WidgetId) => enabled.includes(id), [enabled]);
  const isDefault = enabled.length === DEFAULT_VIEW.length && DEFAULT_VIEW.every((d) => enabled.includes(d));

  return { enabled, isOn, toggle, reset, isDefault };
}

/** Moldura comum dos widgets: título, pergunta que ele responde e corpo. */
export function Widget({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id: WidgetId;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const span = WIDGET_CATALOG.find((w) => w.id === id)?.span ?? 6;
  return (
    <section className={`fw fw--${span}`} aria-label={title}>
      <div className="fw__head">
        <div className="fw__titles">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ────────────────────────────── fluxo de caixa ────────────────────────────── */

export interface FlowPoint {
  key: string;
  label: string;
  inCents: number;
  outCents: number;
}

/**
 * Evolução do saldo acumulado, em linha e área. Barras isoladas respondem
 * "quanto naquele mês"; a pergunta aqui é outra, é a trajetória: está subindo,
 * caindo, quando virou negativo, se recuperou.
 */
export function CashFlowWidget({ points }: { points: FlowPoint[] }) {
  const serie = (() => {
    let acc = 0;
    return points.map((p) => {
      acc += p.inCents - p.outCents;
      return { ...p, acc };
    });
  })();

  if (serie.length < 2) {
    return (
      <Widget id="fluxo" title="Fluxo de caixa" subtitle="Como o caixa evoluiu">
        <p className="fw__empty">
          Ainda não há meses suficientes para desenhar a evolução. Assim que houver movimentação em
          pelo menos dois meses, a linha aparece aqui.
        </p>
      </Widget>
    );
  }

  /* O desenho vive num quadrado 0..100 esticado para o tamanho real do card
     (preserveAspectRatio="none"): assim a linha ocupa a largura inteira e os
     rótulos do eixo, posicionados na mesma porcentagem, ficam sempre embaixo
     do ponto certo. O traço mantém a espessura por vector-effect. */
  const PAD = 8;
  const values = serie.map((p) => p.acc);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const span = maxV - minV || 1;
  const x = (i: number) => (serie.length === 1 ? 50 : (i / (serie.length - 1)) * 100);
  const y = (v: number) => PAD + (1 - (v - minV) / span) * (100 - PAD * 2);
  const zeroY = y(0);

  const linha = serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.acc).toFixed(2)}`).join(' ');
  const area = `${linha} L100,${zeroY.toFixed(2)} L0,${zeroY.toFixed(2)} Z`;
  const ultimo = serie[serie.length - 1]!;
  const anterior = serie[serie.length - 2]!;
  const variacao = ultimo.acc - anterior.acc;

  // Alternativa textual: quem usa leitor de tela recebe a mesma leitura.
  const descricao = `Saldo acumulado mês a mês: ${serie
    .map((p) => `${p.label} ${formatMoney(p.acc)}`)
    .join('; ')}.`;

  return (
    <Widget
      id="fluxo"
      title="Fluxo de caixa"
      subtitle={`Saldo acumulado nos últimos ${serie.length} meses`}
    >
      <div className="fw-flow">
        <div className="fw-flow__now">
          <span className={'fw-flow__val' + (ultimo.acc < 0 ? ' is-neg' : ultimo.acc > 0 ? ' is-pos' : '')} data-financial>
            {ultimo.acc < 0 ? '− ' : ''}
            {formatMoney(Math.abs(ultimo.acc))}
          </span>
          <span className="fw-flow__delta">
            {variacao === 0
              ? 'estável em relação ao mês anterior'
              : variacao > 0
                ? `subiu ${formatMoney(variacao)} desde ${anterior.label}`
                : `caiu ${formatMoney(-variacao)} desde ${anterior.label}`}
          </span>
        </div>
        <div className="fw-flow__plot">
          <svg
            className="fw-flow__svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={descricao}
          >
            <line className="fw-flow__zero" x1="0" x2="100" y1={zeroY} y2={zeroY} vectorEffect="non-scaling-stroke" />
            <path className={'fw-flow__area' + (ultimo.acc < 0 ? ' is-neg' : '')} d={area} />
            <path
              className={'fw-flow__line' + (ultimo.acc < 0 ? ' is-neg' : '')}
              d={linha}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Marcadores em HTML: dentro do SVG esticado eles virariam elipses. */}
          {serie.map((p, i) => (
            <span
              key={p.key}
              className={'fw-flow__pt' + (p.acc < 0 ? ' is-neg' : '')}
              style={{ left: `${x(i)}%`, top: `${y(p.acc)}%` }}
              title={`${p.label}: saldo acumulado ${formatMoney(p.acc)} (entrou ${formatMoney(p.inCents)}, saiu ${formatMoney(p.outCents)})`}
            />
          ))}
        </div>
        <div className="fw-flow__axis" aria-hidden="true">
          {serie.map((p, i) => (
            <span key={p.key} style={{ left: `${x(i)}%` }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </Widget>
  );
}

/* ─────────────────────── próximos pagamentos / atrasos ─────────────────────── */

/** Rótulo curto da data ("HOJE", "22 AGO"). */
function shortDate(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return 'HOJE';
  if (d === 1) return 'AMANHÃ';
  const [, m, day] = iso.split('-');
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  return `${day} ${meses[Number(m) - 1] ?? ''}`.trim();
}

/**
 * Uma linha de "o que está chegando". São duas naturezas diferentes de dívida
 * futura, e a pessoa precisa distinguir: `conta` já está registrada e tem
 * página própria; `previsto` ainda não existe como movimentação, é a próxima
 * cobrança de um custo recorrente. Sem o previsto o bloco mentia por omissão,
 * dizendo "nada a vencer" para quem sabe que paga o mesmo fornecedor todo mês.
 */
export type UpcomingItem =
  | { tipo: 'conta'; id: string; description: string; amountCents: number; dueDate: string | null; expense: Expense }
  | { tipo: 'previsto'; id: string; description: string; amountCents: number; dueDate: string };

export function UpcomingWidget({
  items,
  onOpen,
  onSeeAll,
  onOpenRecorrentes,
}: {
  /** Contas a vencer e cobranças previstas, da mais próxima para a mais distante. */
  items: UpcomingItem[];
  onOpen: (e: Expense) => void;
  onSeeAll: () => void;
  /** Previsto não tem página própria: leva para a lista de custos recorrentes. */
  onOpenRecorrentes: () => void;
}) {
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const mostrados = items.slice(0, 5);
  const temPrevisto = mostrados.some((i) => i.tipo === 'previsto');
  return (
    <Widget id="proximos" title="Próximos pagamentos" subtitle="O que está chegando">
      {mostrados.length === 0 ? (
        <p className="fw__empty">
          Nenhuma conta a vencer e nenhum custo recorrente com cobrança próxima.
        </p>
      ) : (
        <>
          <ul className="fw-next">
            {mostrados.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => (i.tipo === 'conta' ? onOpen(i.expense) : onOpenRecorrentes())}
                >
                  <span className="fw-next__when">{i.dueDate ? shortDate(i.dueDate) : 'SEM DATA'}</span>
                  {/* A etiqueta fica FORA do texto que trunca: dentro dele, um
                      nome comprido comia o "previsto" junto com o resto. */}
                  <span className="fw-next__what">{i.description}</span>
                  {i.tipo === 'previsto' && <span className="fw-next__tag">previsto</span>}
                  <span className="fw-next__v" data-financial>{formatMoney(i.amountCents)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="fw__foot">
            <span>
              Total previsto <b data-financial>{formatMoney(total)}</b>
            </span>
            {items.length > mostrados.length && (
              <button type="button" className="fw__link" onClick={onSeeAll}>
                Ver todos
              </button>
            )}
          </div>
          {temPrevisto && (
            <p className="fw__note">
              O que está marcado como previsto ainda não é uma conta registrada: é a próxima
              cobrança de um custo recorrente, na data que ele tem cadastrada.
            </p>
          )}
        </>
      )}
    </Widget>
  );
}

export function OverdueWidget({
  items,
  onOpen,
  onSeeAll,
}: {
  items: Expense[];
  onOpen: (e: Expense) => void;
  onSeeAll: () => void;
}) {
  const total = items.reduce((s, e) => s + e.amountCents, 0);
  if (items.length === 0) {
    return (
      <Widget id="atrasos" title="Contas em atraso">
        <p className="fw-clear">
          <span aria-hidden="true">✓</span> Nenhum pagamento em atraso
        </p>
      </Widget>
    );
  }
  return (
    <Widget id="atrasos" title="Contas em atraso" subtitle="Precisa de decisão agora">
      <div className="fw-late__sum">
        <span className="fw-late__v" data-financial>{formatMoney(total)}</span>
        <span className="fw-late__n">
          {items.length} {items.length === 1 ? 'pagamento' : 'pagamentos'} em atraso
        </span>
      </div>
      <ul className="fw-next fw-next--late">
        {items.slice(0, 4).map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e)}>
              <span className="fw-next__when">
                {e.dueDate ? `${-daysUntil(e.dueDate)}d` : '—'}
              </span>
              <span className="fw-next__what">{e.description}</span>
              <span className="fw-next__v" data-financial>{formatMoney(e.amountCents)}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <div className="fw__foot">
          <button type="button" className="fw__link" onClick={onSeeAll}>
            Ver todas as vencidas
          </button>
        </div>
      )}
    </Widget>
  );
}

/* ────────────────────────── sócios: aportes e pagamentos ────────────────────────── */

export interface PartnerRow {
  memberId: string;
  name: string;
  cents: number;
}

/** Barras de proporção reaproveitadas pelos dois widgets de sócio. */
function PartnerBars({ rows, total, tone }: { rows: PartnerRow[]; total: number; tone: 'aporte' | 'pago' }) {
  return (
    <div className="fw-bars">
      {rows.map((r) => (
        <div className="fw-bars__row" key={r.memberId}>
          <span className="fw-bars__name">{r.name}</span>
          <span className={`fw-bars__track fw-bars__track--${tone}`} aria-hidden="true">
            <i style={{ width: `${total > 0 ? Math.max(4, Math.round((r.cents / total) * 100)) : 0}%` }} />
          </span>
          <span className="fw-bars__v" data-financial>{formatMoney(r.cents)}</span>
        </div>
      ))}
    </div>
  );
}

export function ContributionsWidget({ rows, total }: { rows: PartnerRow[]; total: number }) {
  return (
    <Widget id="aportes" title="Aportes dos sócios" subtitle="Capital colocado desde o início">
      {rows.length === 0 ? (
        <p className="fw__empty">Nenhum aporte registrado ainda.</p>
      ) : (
        <>
          <PartnerBars rows={rows} total={total} tone="aporte" />
          <div className="fw__foot">
            <span>
              Total aportado <b data-financial>{formatMoney(total)}</b>
            </span>
            <Link className="fw__link" to="/acertos">
              Ver acertos entre sócios →
            </Link>
          </div>
        </>
      )}
    </Widget>
  );
}

export function PaidByWidget({ rows, total }: { rows: PartnerRow[]; total: number }) {
  return (
    <Widget id="pagamentos-socio" title="Pagamentos por sócio" subtitle="Quem bancou as despesas do período">
      {rows.length === 0 ? (
        <p className="fw__empty">Nenhuma despesa paga no período.</p>
      ) : (
        <>
          <PartnerBars rows={rows} total={total} tone="pago" />
          <p className="fw__note">
            Isto é despesa paga por cada sócio, não aporte. Quem pagou mais não recebe
            automaticamente a diferença: o acerto considera a participação de cada um e o que já
            foi quitado.
          </p>
        </>
      )}
    </Widget>
  );
}

/* ────────────────────────────── personalizar visão ────────────────────────────── */

export function CustomizeView({
  isOn,
  toggle,
  reset,
  isDefault,
  ligados,
  onClose,
}: {
  isOn: (id: WidgetId) => boolean;
  toggle: (id: WidgetId) => void;
  reset: () => void;
  isDefault: boolean;
  /** Quantos blocos estão ligados (o último não pode ser desmarcado). */
  ligados: number;
  onClose: () => void;
}) {
  return (
    <div className="fw-cust">
      <ul className="fw-cust__list">
        {WIDGET_CATALOG.map((w) => {
          const ultimo = isOn(w.id) && ligados === 1;
          return (
            <li key={w.id}>
              <label className={'fw-cust__item' + (ultimo ? ' is-locked' : '')}>
                <input
                  type="checkbox"
                  checked={isOn(w.id)}
                  disabled={ultimo}
                  onChange={() => toggle(w.id)}
                />
                <span>
                  <strong>{w.label}</strong>
                  <small>{ultimo ? 'Deixe ao menos um bloco na visão' : w.question}</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="fw-cust__acts">
        <button type="button" className="fw-cust__reset" onClick={reset} disabled={isDefault}>
          Restaurar visão padrão
        </button>
        <button type="button" className="fw-cust__done" onClick={onClose}>
          Concluído
        </button>
      </div>
    </div>
  );
}
