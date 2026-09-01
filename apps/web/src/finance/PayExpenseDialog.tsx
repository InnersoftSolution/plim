import { useEffect, useState } from 'react';
import type { CompanyMember, Expense } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { financeApi, formatMoney } from './financeApi';
import { EMPRESA_PAGOU } from './PayersField';
import { todayIso } from './due';

/**
 * "Como esta conta foi paga?" — o diálogo que transforma uma conta em aberto em
 * gasto de verdade. Pagar não é trocar um status: a resposta decide se o
 * dinheiro sai do caixa da empresa (e ninguém deve nada) ou do bolso de um
 * sócio (e vira acerto entre os sócios).
 *
 * Vive fora da FinancePage porque a Home abre o mesmo diálogo ao clicar numa
 * linha "ainda não paga" (Rafaelle, 1 set): a pergunta é a mesma nos dois
 * lugares, e duplicá-la seria deixar duas versões da mesma regra.
 */
export function PayExpenseDialog({
  companyId,
  expense,
  members,
  /** true = a conta veio de um custo recorrente que sai do caixa da empresa. */
  fromCompanyCash,
  onClose,
  onPaid,
}: {
  companyId: string;
  /** Conta a pagar em questão. Null fecha o diálogo. */
  expense: Expense | null;
  members: CompanyMember[];
  fromCompanyCash?: boolean;
  onClose: () => void;
  onPaid: () => void | Promise<void>;
}) {
  const [who, setWho] = useState('');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Ao abrir, o padrão já é a resposta mais provável: a empresa paga quando o
  // custo é dela; senão, o pagador previsto na conta.
  useEffect(() => {
    if (!expense) return;
    setWho(fromCompanyCash ? EMPRESA_PAGOU : expense.paidByMemberId);
    setDate(todayIso());
    setError('');
  }, [expense, fromCompanyCash]);

  async function confirm() {
    if (!expense) return;
    setBusy(true);
    setError('');
    try {
      const empresaPagou = who === EMPRESA_PAGOU;
      await financeApi.payExpense(
        companyId,
        expense.id,
        date,
        empresaPagou ? undefined : who,
        empresaPagou,
      );
      onClose();
      await onPaid();
    } catch {
      setError('Não deu para registrar o pagamento agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={expense != null}
      title="Registrar pagamento"
      subtitle={expense ? `${expense.description} · ${formatMoney(expense.amountCents)}` : undefined}
      onClose={onClose}
    >
      {expense && (
        <div className="fin2-paydialog">
          <Select
            label="Quem pagou esta despesa?"
            value={who}
            onChange={setWho}
            options={[
              {
                value: EMPRESA_PAGOU,
                label: 'A empresa pagou',
                hint: 'saiu do caixa: ninguém fica devendo',
              },
              ...members.map((m) => ({
                value: m.id,
                label: m.fullName,
                // Quando o custo sai do caixa, o sócio gravado é só registro:
                // rotulá-lo de "previsto" empurraria a escolha errada.
                hint:
                  m.id === expense.paidByMemberId && !fromCompanyCash
                    ? 'pagador previsto'
                    : undefined,
              })),
            ]}
          />
          <label className="field">
            <span className="field__label">Data do pagamento</span>
            <input
              className="field__input"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(ev) => setDate(ev.target.value)}
            />
          </label>
          <p className="fin2-paydialog__hint">
            {who === EMPRESA_PAGOU
              ? 'Conta paga pelo caixa da empresa: o valor sai do caixa e nenhum sócio fica devendo nada.'
              : 'Quem pagou entra no acerto entre os sócios: as partes dos outros passam a ser devidas a essa pessoa.'}
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="fin2-paydialog__acts">
            <Button onClick={() => void confirm()} disabled={busy || !date}>
              {busy ? 'Registrando…' : 'Registrar pagamento'}
            </Button>
            <button type="button" className="fin2-ghostbtn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
