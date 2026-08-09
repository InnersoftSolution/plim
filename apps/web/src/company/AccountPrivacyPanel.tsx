import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ACCOUNT_DELETION_CONFIRM_TEXT,
  type AccountDeletionBlocker,
  type AccountDeletionPreview,
  type CompanyMember,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { companyApi, messageForError } from './companyApi';
import { formatFullDate, privacyApi } from './privacyApi';
import './privacidade.css';

type Step = 'impacto' | 'confirmacao' | 'agendado';

/**
 * Privacidade da conta: encerrar o acesso da pessoa ao Plim.
 *
 * Uma conta não é uma empresa. Enquanto a pessoa for dona de uma empresa com
 * outros sócios, a exclusão fica travada: quem decide apagar o histórico dos
 * outros não pode ser uma pessoa só. Cada pendência aparece com a saída ao
 * lado (transferir a titularidade ou excluir aquela empresa antes).
 *
 * Quem manda no bloqueio é o backend; aqui só mostramos o que ele responde.
 */
export function AccountPrivacyPanel() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('impacto');
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transferOf, setTransferOf] = useState<AccountDeletionBlocker | null>(null);

  const load = useCallback(async () => {
    try {
      setPreview(await privacyApi.getAccountDeletion());
      setLoadError('');
    } catch (err) {
      setLoadError(messageForError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openFlow() {
    setStep('impacto');
    setConfirmText('');
    setReason('');
    setError('');
    setOpen(true);
  }

  async function handleRequest() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await privacyApi.requestAccountDeletion({ confirmText, reason: reason.trim() || null }),
      );
      setStep('agendado');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelDeletion() {
    setBusy(true);
    setError('');
    try {
      setPreview(await privacyApi.cancelAccountDeletion());
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  const scheduled = preview?.deletion ?? null;
  const blockers = preview?.blockers ?? [];
  const podeExcluir = blockers.length === 0;

  return (
    <section className="dash-panel priv-panel">
      <div className="dash-panel__head">
        <h2>Privacidade e exclusão da conta</h2>
      </div>

      <p className="priv-intro">
        Você pode encerrar seu acesso ao Plim quando quiser. Se você for o dono de alguma empresa com
        outros sócios, primeiro é preciso passar a titularidade adiante: os dados daquela sociedade
        não são só seus.
      </p>

      {loadError && <div className="form-error" style={{ marginTop: 14 }}>{loadError}</div>}
      {error && !open && <div className="form-error" style={{ marginTop: 14 }}>{error}</div>}

      {scheduled ? (
        <div className="priv-alert" style={{ marginTop: 16 }}>
          <span className="priv-alert__icon" aria-hidden="true">
            <IconAlert />
          </span>
          <div className="priv-alert__body">
            <p className="priv-alert__title">Sua conta será excluída</p>
            <p className="priv-alert__msg">
              O acesso será encerrado em <strong>{formatFullDate(scheduled.scheduledFor)}</strong>
              {scheduled.daysLeft > 0
                ? `, daqui a ${scheduled.daysLeft} ${scheduled.daysLeft === 1 ? 'dia' : 'dias'}.`
                : '.'}{' '}
              Até lá você pode voltar atrás e continuar usando o Plim normalmente.
            </p>
            <div className="priv-alert__actions">
              <Button variant="secondary" onClick={handleCancelDeletion} disabled={busy}>
                {busy ? 'Cancelando…' : 'Cancelar exclusão'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {blockers.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {blockers.map((b) => (
                <div className="priv-blocker" key={b.companyId}>
                  <div className="priv-right__text">
                    <p className="priv-right__title">{b.companyName}</p>
                    <p className="priv-right__desc">
                      Você é o dono da conta e há mais {b.otherMembers}{' '}
                      {b.otherMembers === 1 ? 'sócio' : 'sócios'} nesta empresa. Passe a titularidade
                      para alguém ou exclua a empresa antes de encerrar seu acesso.
                    </p>
                  </div>
                  <div className="priv-right__action">
                    <Button variant="secondary" onClick={() => setTransferOf(b)}>
                      Transferir titularidade
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="priv-rights">
            <div className="priv-right">
              <div className="priv-right__text">
                <p className="priv-right__title">Excluir minha conta</p>
                <p className="priv-right__desc">
                  {podeExcluir
                    ? `Encerra seu acesso ao Plim. Você tem ${preview?.graceDays ?? 30} dias para desistir depois de pedir.`
                    : 'Resolva as pendências acima para liberar a exclusão.'}
                </p>
              </div>
              <div className="priv-right__action">
                <button
                  type="button"
                  className="priv-danger-btn"
                  onClick={openFlow}
                  disabled={!preview || !podeExcluir}
                >
                  Excluir conta
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {transferOf && (
        <TransferOwnershipModal
          blocker={transferOf}
          onClose={() => setTransferOf(null)}
          onDone={async () => {
            setTransferOf(null);
            await load();
          }}
        />
      )}

      <Modal
        open={open}
        wide
        title={step === 'agendado' ? 'Exclusão agendada' : 'Excluir minha conta'}
        subtitle={
          step === 'impacto'
            ? 'Veja o que acontece antes de decidir.'
            : step === 'confirmacao'
              ? 'Última confirmação.'
              : undefined
        }
        onClose={() => setOpen(false)}
      >
        <div className="priv-flow">
          {error && <div className="form-error">{error}</div>}

          {step === 'impacto' && preview && (
            <>
              <p className="priv-flow__lead">
                Encerrar a conta apaga seu acesso e seus dados pessoais do Plim. O que acontece com
                as empresas depende do seu papel em cada uma.
              </p>

              <div className="priv-facts">
                {preview.companiesToDelete.length > 0 && (
                  <div className="priv-fact priv-fact--warn">
                    <p className="priv-fact__title">
                      {preview.companiesToDelete.length === 1
                        ? 'Esta empresa será apagada junto'
                        : 'Estas empresas serão apagadas junto'}
                    </p>
                    <p className="priv-fact__desc">
                      Você é a única pessoa nelas, então ninguém mais poderia acessar esses dados.
                    </p>
                    <ul className="priv-list">
                      {preview.companiesToDelete.map((c) => (
                        <li key={c.id}>{c.name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.companiesToLeave.length > 0 && (
                  <div className="priv-fact">
                    <p className="priv-fact__title">
                      {preview.companiesToLeave.length === 1
                        ? 'Esta empresa continua de pé'
                        : 'Estas empresas continuam de pé'}
                    </p>
                    <p className="priv-fact__desc">
                      Você é sócio, não dono da conta. Elas seguem com os outros sócios e você apenas
                      deixa de ter acesso.
                    </p>
                    <ul className="priv-list">
                      {preview.companiesToLeave.map((c) => (
                        <li key={c.id}>{c.name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="priv-fact">
                  <p className="priv-fact__title">Baixe seus dados antes</p>
                  <p className="priv-fact__desc">
                    Depois do prazo não há como recuperar. A cópia de cada empresa fica em
                    Configurações, no botão "Baixar dados".
                  </p>
                </div>

                <div className="priv-fact">
                  <p className="priv-fact__title">O que fica guardado</p>
                  <p className="priv-fact__desc">
                    Só o registro do pedido: quem pediu, quando e quando foi atendido. É o que
                    comprova que o Plim cumpriu o seu direito de eliminação. Também podem ser
                    mantidos, apenas pelo prazo legal, dados que a lei obriga a conservar.
                  </p>
                </div>
              </div>

              <div className="priv-actions">
                <Button onClick={() => setStep('confirmacao')}>Entendi, continuar</Button>
                <Button variant="secondary" onClick={() => navigate('/empresa/dados')}>
                  Baixar dados antes
                </Button>
              </div>
            </>
          )}

          {step === 'confirmacao' && (
            <>
              <p className="priv-flow__lead">
                Para confirmar, digite <strong>{ACCOUNT_DELETION_CONFIRM_TEXT}</strong> no campo
                abaixo.
              </p>

              <Input
                label="Confirmação"
                placeholder={ACCOUNT_DELETION_CONFIRM_TEXT}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
              />

              <div className="field">
                <label className="field__label">Por que está saindo? (opcional)</label>
                <textarea
                  className="field__input rc-textarea"
                  placeholder="Ajuda a gente a entender o que não funcionou."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
              </div>

              <div className="priv-actions">
                <button
                  type="button"
                  className="priv-danger-btn"
                  onClick={handleRequest}
                  disabled={busy || confirmText.trim().length === 0}
                >
                  {busy ? 'Agendando…' : 'Agendar exclusão'}
                </button>
                <Button variant="secondary" onClick={() => setStep('impacto')} disabled={busy}>
                  Voltar
                </Button>
              </div>
            </>
          )}

          {step === 'agendado' && scheduled && (
            <>
              <p className="priv-flow__lead">
                Pronto. Sua conta será encerrada em{' '}
                <strong>{formatFullDate(scheduled.scheduledFor)}</strong>. Você continua usando o
                Plim normalmente até lá.
              </p>
              <div className="priv-facts">
                <div className="priv-fact">
                  <p className="priv-fact__title">{scheduled.daysLeft} dias para desistir</p>
                  <p className="priv-fact__desc">
                    O aviso fica aqui no seu perfil, com o botão de cancelar.
                  </p>
                </div>
              </div>
              <div className="priv-actions">
                <Button onClick={() => setOpen(false)}>Fechar</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

/**
 * Passa a titularidade da empresa para outro sócio. Só aparecem sócios que já
 * entraram no Plim: quem nunca aceitou o convite não conseguiria administrar.
 */
function TransferOwnershipModal({
  blocker,
  onClose,
  onDone,
}: {
  blocker: AccountDeletionBlocker;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await companyApi.listMembers(blocker.companyId);
        if (active) setMembers(list);
      } catch (err) {
        if (active) setError(messageForError(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [blocker.companyId]);

  const elegiveis = (members ?? []).filter((m) => m.role !== 'account_owner' && m.userId != null);

  async function handleTransfer() {
    setBusy(true);
    setError('');
    try {
      await privacyApi.transferOwnership(blocker.companyId, memberId);
      await onDone();
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Transferir titularidade"
      subtitle={blocker.companyName}
      onClose={busy ? () => {} : onClose}
    >
      <div className="priv-flow">
        {error && <div className="form-error">{error}</div>}

        <p className="priv-flow__lead">
          Quem receber a titularidade passa a ser o dono da conta de{' '}
          <strong>{blocker.companyName}</strong>: poderá convidar e remover sócios e decidir sobre a
          empresa. Você continua como sócio, com sua participação intacta.
        </p>

        {members && elegiveis.length === 0 ? (
          <div className="priv-fact priv-fact--warn">
            <p className="priv-fact__title">Nenhum sócio pode assumir ainda</p>
            <p className="priv-fact__desc">
              Só quem já entrou no Plim consegue administrar a empresa. Reenvie o convite na tela de
              Sócios e tente de novo quando a pessoa aceitar.
            </p>
          </div>
        ) : (
          <Select
            label="Quem passa a ser o dono da conta"
            value={memberId}
            onChange={setMemberId}
            placeholder={members ? 'Selecione um sócio' : 'Carregando…'}
            options={elegiveis.map((m) => ({ value: m.id, label: m.fullName }))}
          />
        )}

        <div className="priv-actions">
          <Button onClick={handleTransfer} disabled={busy || !memberId}>
            {busy ? 'Transferindo…' : 'Transferir'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
