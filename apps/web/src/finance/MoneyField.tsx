import { Input } from '../components/ui/Input';
import { maskMoneyBRL, maskedMoneyToCents } from './financeApi';
import { extensoReais } from './moneyExtenso';
import './moneyfield.css';

/**
 * Campo de dinheiro do Plim. Um só, em todas as telas, por um motivo:
 * já aconteceu de uma despesa de R$ 3.200,00 entrar como R$ 3.200.000,00.
 *
 * A causa não foi conta errada, foi o campo ser ambíguo. Aqui o número é lido
 * como REAIS da esquerda para a direita ("3200" = R$ 3.200,00); no aplicativo
 * do banco ele é lido como CENTAVOS da direita para a esquerda ("3200" =
 * R$ 32,00). Quem alterna entre os dois erra a ordem de grandeza, e três
 * pontos a mais passam despercebidos.
 *
 * Por isso o campo confirma o valor por extenso enquanto a pessoa digita, e
 * avisa quando o valor entra numa faixa que quase nunca é uma despesa de
 * empresa em começo de vida. Ler "três milhões" é impossível de confundir com
 * "três mil".
 */

/** A partir daqui o valor deixa de ser rotina e ganha aviso, não só extenso. */
const FAIXA_DE_ATENCAO_CENTS = 100_000_00;

export function MoneyField({
  label = 'Valor (R$)',
  value,
  onChange,
  autoFocus,
  error,
}: {
  label?: string;
  /** Texto mascarado ("3.200,00"), o mesmo que o formulário guarda no estado. */
  value: string;
  onChange: (masked: string) => void;
  autoFocus?: boolean;
  error?: string;
}) {
  const cents = maskedMoneyToCents(value);
  const atencao = cents != null && cents >= FAIXA_DE_ATENCAO_CENTS;

  return (
    <div className="moneyfield">
      <Input
        label={label}
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(maskMoneyBRL(e.target.value))}
        autoFocus={autoFocus}
        error={error}
      />
      {cents != null && !error && (
        <p className={'moneyfield__echo' + (atencao ? ' is-warn' : '')}>
          {atencao && (
            <strong className="moneyfield__flag">Confira a ordem de grandeza: </strong>
          )}
          {extensoReais(cents)}
        </p>
      )}
    </div>
  );
}
