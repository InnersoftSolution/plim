import { useCallback, useEffect, useState } from 'react';
import type { CompanyMember, InheritanceMode, InheritancePreview } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { DateField } from '../components/ui/DateField';
import { Input } from '../components/ui/Input';
import { messageForError } from '../company/companyApi';
import { financeApi, formatMoney } from './financeApi';
import './heranca.css';

/**
 * "Esse sócio assume as despesas anteriores à entrada dele?"
 *
 * A pergunta é manual e a conta é automática: a pessoa escolhe o critério, vê
 * exatamente quanto o sócio novo passa a dever e para quem, e só então
 * confirma. Nenhuma jornada que mexe no dinheiro dos outros começa salvando.
 *
 * O que NÃO muda em nenhum caminho: quem pagou cada despesa. Isso é histórico
 * (RN1). Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 */
export function HerancaDialog({
  companyId,
  member,
  onClose,
  onApplied,
}: {
  companyId: string;
  member: CompanyMember;
  onClose: () => void;
  onApplied: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [since, setSince] = useState(hoje);
  const [mode, setMode] = useState<InheritanceMode>('none');
  const [percent, setPercent] = useState('');
  const [preview, setPreview] = useState<InheritancePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const percentNum = percent.trim() ? Number(percent.replace(',', '.')) : null;
  const percentInvalido =
    mode === 'percent' && (percentNum == null || Number.isNaN(percentNum) || percentNum <= 0 || percentNum > 100);

  const carregarPrevia = useCallback(async () => {
    if (percentInvalido) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setPreview(
        await financeApi.previewInheritance(companyId, {
          memberId: member.id,
          since,
          mode,
          percent: mode === 'percent' ? percentNum ?? undefined : undefined,
        }),
      );
    } catch (err) {
      setError(messageForError(err));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, member.id, since, mode, percentNum, percentInvalido]);

  useEffect(() => {
    void carregarPrevia();
  }, [carregarPrevia]);

  async function aplicar() {
    setSaving(true);
    setError('');
    try {
      await financeApi.applyInheritance(companyId, {
        memberId: member.id,
        since,
        mode,
        percent: mode === 'percent' ? percentNum ?? undefined : undefined,
      });
      setDone(true);
      onApplied();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="her">
        <p className="her__ok">
          {mode === 'none'
            ? `${member.fullName} não participa das despesas anteriores. Nada foi alterado.`
            : preview?.alreadyHadShare
              ? `Pronto. A divisão do passado foi refeita: ${member.fullName} passou a dever ${formatMoney(preview.totalCents)} a mais.`
              : `Pronto. ${member.fullName} passou a assumir ${formatMoney(preview?.totalCents ?? 0)} das despesas anteriores.`}
        </p>
        <Button block onClick={onClose}>
          Fechar
        </Button>
      </div>
    );
  }

  const nenhuma = preview != null && preview.expenseCount === 0;
  /** Há passado em jogo, mas o modo escolhido não muda nada: a divisão já
   *  está conforme a participação de hoje. Sem isto, o "Aplicar" prometia
   *  uma alteração que não existiria. */
  const semMudanca =
    preview != null && !nenhuma && mode !== 'none' && preview.totalCents === 0;
  /**
   * Dois casos na mesma tela: quem entrou do zero e quem já tinha parte mas
   * mudou de participação (20% → 33%). A conta é a mesma máquina; o que muda
   * é a história que a tela conta, senão "passa a assumir R$ 266" lê como se
   * fosse a parte inteira, e é só a diferença (Rafaelle, 9 set).
   */
  const ajuste = preview?.alreadyHadShare === true;

  return (
    <div className="her">
      <p className="her__intro">
        {ajuste ? (
          <>
            A participação de <strong>{member.fullName}</strong> mudou, mas as despesas anteriores
            continuam divididas com a participação antiga. Aqui você aplica a divisão nova a esse
            passado: ela passa a dever só a diferença. Quem pagou cada despesa não muda.
          </>
        ) : (
          <>
            Despesas registradas antes da entrada de <strong>{member.fullName}</strong> foram
            divididas sem ela. Você decide se ela assume uma parte desse passado. Quem pagou cada
            despesa não muda: o que muda é de quem é o custo.
          </>
        )}
      </p>

      <div className="field">
        <label className="field__label">{ajuste ? 'Despesas anteriores a' : 'A partir de quando ela é sócia'}</label>
        <DateField value={since} onChange={setSince} />
        <p className="her__hint">Só entram na conta as despesas anteriores a esta data.</p>
      </div>

      {nenhuma ? (
        <p className="her__vazio">
          Não há despesas anteriores a essa data. Nada a decidir por aqui.
        </p>
      ) : (
        <>
          <div className="her__opcoes" role="radiogroup" aria-label="Como tratar as despesas anteriores">
            <Opcao
              ativa={mode === 'none'}
              titulo="Não participa das despesas anteriores"
              texto="Ela começa do zero. É o padrão, e não altera nada do que já está registrado."
              onClick={() => setMode('none')}
            />
            <Opcao
              ativa={mode === 'equity'}
              titulo="Participa conforme a participação societária"
              texto={
                member.equityPercent == null
                  ? 'Defina a participação dela antes de usar esta opção.'
                  : ajuste
                    ? `As despesas anteriores são redivididas com os ${fmtPct(member.equityPercent)} de hoje. Ela passa a dever só a diferença.`
                    : `As despesas anteriores são redivididas incluindo ela, com os ${fmtPct(member.equityPercent)} dela.`
              }
              onClick={() => setMode('equity')}
            />
            <Opcao
              ativa={mode === 'percent'}
              titulo="Definir percentual à mão"
              texto="Ela assume um percentual combinado, e o resto continua dividido como estava."
              onClick={() => setMode('percent')}
            />
          </div>

          {mode === 'percent' && (
            <Input
              label="Percentual que ela assume (%)"
              inputMode="decimal"
              placeholder="Ex.: 10"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              error={percent.trim() && percentInvalido ? 'Informe um número entre 0 e 100.' : undefined}
            />
          )}

          {/* A conta, sempre visível antes de confirmar. */}
          <div className="her__previa">
            <h3 className="her__previa-titulo">O que vai acontecer</h3>
            {loading ? (
              <p className="her__hint">calculando…</p>
            ) : preview == null ? (
              <p className="her__hint">Preencha os campos para ver a conta.</p>
            ) : (
              <>
                <p className="her__linha">
                  <span>Despesas anteriores</span>
                  <strong data-financial>
                    {preview.expenseCount} · {formatMoney(preview.periodTotalCents)}
                  </strong>
                </p>
                <p className="her__linha her__linha--destaque">
                  <span>{member.fullName} passa a {ajuste ? 'dever a mais' : 'assumir'}</span>
                  <strong data-financial>{formatMoney(preview.totalCents)}</strong>
                </p>
                {preview.owedTo.length > 0 && (
                  <ul className="her__credores">
                    {preview.owedTo.map((c) => (
                      <li key={c.memberId}>
                        <span data-financial>{formatMoney(c.amountCents)}</span> para {c.fullName}
                      </li>
                    ))}
                  </ul>
                )}
                {mode !== 'none' && preview.totalCents > 0 && (
                  <p className="her__hint">
                    Vira acerto entre sócios, não pagamento de despesa: as despesas continuam pagas.
                  </p>
                )}
                {semMudanca && (
                  <p className="her__hint">
                    Nada a mudar: essas despesas já estão divididas conforme a participação de hoje.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="her__acoes">
        <Button
          block
          onClick={aplicar}
          disabled={saving || loading || nenhuma || percentInvalido || semMudanca}
        >
          {saving ? 'Aplicando…' : mode === 'none' ? 'Confirmar que não participa' : 'Aplicar'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Opcao({
  ativa,
  titulo,
  texto,
  onClick,
}: {
  ativa: boolean;
  titulo: string;
  texto: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      className={'her__opcao' + (ativa ? ' is-ativa' : '')}
      onClick={onClick}
    >
      <span className="her__opcao-titulo">{titulo}</span>
      <span className="her__opcao-texto">{texto}</span>
    </button>
  );
}

function fmtPct(v: number): string {
  return `${v.toString().replace('.', ',')}%`;
}
