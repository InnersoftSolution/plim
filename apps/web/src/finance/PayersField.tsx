import type { CompanyMember } from '@plim/shared';
import { Select } from '../components/ui/Select';
import { formatMoney, maskMoneyBRL, maskedMoneyToCents } from './financeApi';
import './payersfield.css';

/**
 * Quem colocou dinheiro nesta movimentação.
 *
 * Duas situações diferentes que a tela antiga tratava como uma só:
 *  - uma pessoa pagou a conta inteira, e as outras devem a parte delas;
 *  - cada uma pagou a sua parte direto ao fornecedor, e não há dívida nenhuma.
 *
 * Pagar não é a mesma coisa que ser responsável pelo custo. Aqui só se declara
 * quem pagou; de quem é a despesa fica no bloco da divisão.
 * Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 */
export type Payers =
  | { mode: 'single'; memberId: string }
  | { mode: 'multi'; amounts: Record<string, string> };

/** Estado inicial: uma pessoa só, que é o caso comum. */
export function singlePayer(memberId: string): Payers {
  return { mode: 'single', memberId };
}

/** Soma do que foi informado (centavos). Campo vazio conta como zero. */
export function payersTotalCents(payers: Payers, amountCents: number | null): number {
  if (payers.mode === 'single') return amountCents ?? 0;
  return Object.values(payers.amounts).reduce((soma, v) => soma + (maskedMoneyToCents(v) ?? 0), 0);
}

/**
 * Converte para o que a API espera. No modo de uma pessoa não manda `payments`:
 * o backend entende que o pagador informado colocou o valor cheio.
 */
export function payersToPayload(payers: Payers, fallbackMemberId: string) {
  if (payers.mode === 'single') {
    return { paidByMemberId: payers.memberId || fallbackMemberId, payments: undefined };
  }
  const payments = Object.entries(payers.amounts)
    .map(([memberId, valor]) => ({ memberId, amountCents: maskedMoneyToCents(valor) ?? 0 }))
    .filter((p) => p.amountCents > 0);
  return {
    // Coluna antiga do banco ainda exige um pagador: vai o que pagou mais.
    paidByMemberId:
      payments.reduce(
        (maior, p) => (p.amountCents > maior.amountCents ? p : maior),
        { memberId: fallbackMemberId, amountCents: -1 },
      ).memberId || fallbackMemberId,
    payments,
  };
}

/** Mensagem de erro do bloco, ou string vazia quando está tudo certo. */
export function payersError(payers: Payers, amountCents: number | null): string {
  if (payers.mode === 'single') return payers.memberId ? '' : 'Escolha quem pagou.';
  const informado = payersTotalCents(payers, amountCents);
  if (informado <= 0) return 'Informe quanto cada pessoa pagou.';
  if (amountCents != null && informado > amountCents) {
    return 'A soma do que cada um pagou passou do valor da movimentação.';
  }
  return '';
}

export function PayersField({
  members,
  label,
  payers,
  onChange,
  amountCents,
}: {
  members: CompanyMember[];
  label: string;
  payers: Payers;
  onChange: (p: Payers) => void;
  /** Valor da movimentação, para conferir a soma. Nulo enquanto não digitado. */
  amountCents: number | null;
}) {
  const informado = payersTotalCents(payers, amountCents);
  const falta = amountCents != null ? amountCents - informado : 0;
  /** Ninguém preencheu nada ainda: é estado inicial, não erro. */
  const vazio = payers.mode === 'multi' && informado === 0;

  function trocarModo(mode: Payers['mode']) {
    if (mode === payers.mode) return;
    if (mode === 'single') {
      // Volta para quem pagou mais, para não perder o que já foi digitado.
      const maior = Object.entries(payers.mode === 'multi' ? payers.amounts : {}).sort(
        (a, b) => (maskedMoneyToCents(b[1]) ?? 0) - (maskedMoneyToCents(a[1]) ?? 0),
      )[0];
      onChange(singlePayer(maior?.[0] ?? members[0]?.id ?? ''));
      return;
    }
    // Abre em branco de propósito. Pré-preencher alguém com o valor cheio
    // parecia atalho, mas quem digitava a segunda pessoa acabava somando em
    // cima do total e estourando o valor sem entender por quê.
    onChange({ mode: 'multi', amounts: {} });
  }

  return (
    <div className="payers">
      <div className="field">
        <label className="field__label">{label}</label>
        <div className="fin-split">
          <button
            type="button"
            className={'fin-split__opt' + (payers.mode === 'single' ? ' fin-split__opt--active' : '')}
            onClick={() => trocarModo('single')}
          >
            Uma pessoa
          </button>
          <button
            type="button"
            className={'fin-split__opt' + (payers.mode === 'multi' ? ' fin-split__opt--active' : '')}
            onClick={() => trocarModo('multi')}
          >
            Mais de uma
          </button>
        </div>
      </div>

      {payers.mode === 'single' ? (
        <Select
          label="Quem colocou o dinheiro"
          value={payers.memberId}
          onChange={(v) => onChange(singlePayer(v))}
          options={members.map((m) => ({ value: m.id, label: m.fullName }))}
        />
      ) : (
        <div className="payers__list">
          <p className="payers__hint">
            Informe quanto cada pessoa colocou. Quem não pagou nada é só deixar em branco.
          </p>
          {members.map((m) => (
            // O nome do sócio É o rótulo do campo: repetir "Quanto fulano
            // pagou" acima de cada caixa só encheria a tela de texto.
            <label className="payers__row" key={m.id}>
              <span className="payers__name">{m.fullName}</span>
              <input
                className={
                  'field__input payers__input' +
                  // Só quem tem valor entra em vermelho: campo em branco não
                  // causou o estouro, e pintar tudo esconde onde corrigir.
                  (falta < 0 && (maskedMoneyToCents(payers.amounts[m.id] ?? '') ?? 0) > 0
                    ? ' payers__input--erro'
                    : '')
                }
                inputMode="decimal"
                placeholder="0,00"
                value={payers.amounts[m.id] ?? ''}
                onChange={(e) =>
                  onChange({
                    mode: 'multi',
                    amounts: { ...payers.amounts, [m.id]: maskMoneyBRL(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          {/* A conferência é o coração do bloco: sem ela a pessoa só descobre
              que errou ao tentar avançar. Cada estado tem título e explicação,
              porque "acima do valor" sozinho não diz o que fazer. */}
          {amountCents != null && (
            <div
              className={
                'payers__soma' +
                (vazio ? '' : falta === 0 ? ' is-ok' : falta < 0 ? ' is-erro' : ' is-parcial')
              }
              role={falta < 0 ? 'alert' : undefined}
            >
              <span className="payers__soma-icone" aria-hidden="true">
                {!vazio && falta === 0 ? <IconeOk /> : <IconeAtencao />}
              </span>
              <span className="payers__soma-texto">
                <strong className="payers__soma-titulo">
                  {/* Nada informado ainda não é erro, é começo: aviso âmbar
                      aqui repreenderia a pessoa antes de ela digitar. */}
                  {vazio
                    ? `A informar: ${formatMoney(amountCents)}`
                    : falta === 0
                      ? 'Fecha com o valor da movimentação'
                      : falta > 0
                        ? `Faltam ${formatMoney(falta)}`
                        : `Passou ${formatMoney(-falta)}`}
                </strong>
                <span className="payers__soma-detalhe">
                  {vazio
                    ? 'Preencha o que cada pessoa colocou até fechar esse valor.'
                    : falta === 0
                      ? `Somando ${formatMoney(informado)}.`
                      : falta > 0
                        ? `Somando ${formatMoney(informado)} de ${formatMoney(amountCents)}. O que faltar fica como conta em aberto com o fornecedor.`
                        : `Somando ${formatMoney(informado)}, e a movimentação é de ${formatMoney(amountCents)}. Reveja os valores acima.`}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Ícones inline: dois traços simples, sem dependência externa e sem virar
   texto quando o CSS não carrega. */
function IconeOk() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconeAtencao() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
