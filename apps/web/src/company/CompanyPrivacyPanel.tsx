import { useCallback, useEffect, useState } from 'react';
import type { Company, CompanyDeletionPreview } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { messageForError } from './companyApi';
import { downloadCompanyData, formatFullDate, privacyApi } from './privacyApi';
import './privacidade.css';

function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** Etapas da jornada. A pessoa vê o estrago antes de conseguir confirmar. */
type Step = 'impacto' | 'confirmacao' | 'agendado';

/**
 * Privacidade da empresa: baixar a cópia dos dados e pedir a exclusão.
 *
 * A exclusão não é um botão solto: é uma jornada de três telas (o que some →
 * confirmar digitando o nome → agendado). E não apaga na hora — agenda o
 * expurgo e deixa o pedido cancelável durante a carência, para que os outros
 * sócios enxerguem o aviso e tenham chance de reagir.
 *
 * Nenhuma regra mora aqui: prazo, permissão e contagens vêm do backend.
 */
export function CompanyPrivacyPanel({ company }: { company: Company }) {
  const [preview, setPreview] = useState<CompanyDeletionPreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('impacto');
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      setPreview(await privacyApi.getCompanyDeletion(company.id));
      setLoadError('');
    } catch (err) {
      setLoadError(messageForError(err));
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      await downloadCompanyData(company.id, company.name);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setDownloading(false);
    }
  }

  function openFlow() {
    setStep('impacto');
    setConfirmName('');
    setReason('');
    setError('');
    setOpen(true);
  }

  async function handleRequest() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await privacyApi.requestCompanyDeletion(company.id, {
          confirmName,
          reason: reason.trim() || null,
        }),
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
      setPreview(await privacyApi.cancelCompanyDeletion(company.id));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  const scheduled = preview?.deletion ?? null;
  const counts = preview?.counts;

  return (
    <section className="dash-panel priv-panel">
      <div className="dash-panel__head">
        <h2>Privacidade e exclusão</h2>
      </div>

      <p className="priv-intro">
        Os dados desta empresa são seus. Você pode baixar uma cópia completa quando quiser e pedir a
        exclusão definitiva a qualquer momento, como prevê a Lei Geral de Proteção de Dados.
      </p>

      {loadError && <div className="form-error" style={{ marginTop: 14 }}>{loadError}</div>}
      {error && !open && <div className="form-error" style={{ marginTop: 14 }}>{error}</div>}

      {scheduled ? (
        <div className="priv-alert" style={{ marginTop: 16 }}>
          <span className="priv-alert__icon" aria-hidden="true">
            <IconAlert />
          </span>
          <div className="priv-alert__body">
            <p className="priv-alert__title">Exclusão agendada</p>
            <p className="priv-alert__msg">
              {scheduled.requestedByName
                ? `${scheduled.requestedByName} pediu a exclusão de ${company.name}.`
                : `A exclusão de ${company.name} foi solicitada.`}{' '}
              Os dados serão apagados definitivamente em{' '}
              <strong>{formatFullDate(scheduled.scheduledFor)}</strong>
              {scheduled.daysLeft > 0
                ? `, daqui a ${scheduled.daysLeft} ${scheduled.daysLeft === 1 ? 'dia' : 'dias'}.`
                : '.'}{' '}
              Até lá dá para voltar atrás, e a empresa segue funcionando normalmente.
            </p>
            <div className="priv-alert__actions">
              {preview?.canDelete && (
                <Button variant="secondary" onClick={handleCancelDeletion} disabled={busy}>
                  {busy ? 'Cancelando…' : 'Cancelar exclusão'}
                </Button>
              )}
              <Button variant="ghost" onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Preparando…' : 'Baixar cópia dos dados'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="priv-rights">
          <div className="priv-right">
            <div className="priv-right__text">
              <p className="priv-right__title">Baixar uma cópia dos dados</p>
              <p className="priv-right__desc">
                Um arquivo com tudo o que o Plim guarda desta empresa: sócios, movimentações,
                rateios, custos recorrentes, contatos, atividades e agenda.
              </p>
            </div>
            <div className="priv-right__action">
              <Button variant="secondary" onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Preparando…' : 'Baixar dados'}
              </Button>
            </div>
          </div>

          <div className="priv-right">
            <div className="priv-right__text">
              <p className="priv-right__title">Excluir esta empresa</p>
              <p className="priv-right__desc">
                {preview?.canDelete === false
                  ? 'Só o dono da conta pode excluir a empresa. Fale com ele se for esse o caminho.'
                  : `Apaga a empresa e todo o histórico dela para todos os sócios. Você tem ${preview?.graceDays ?? 30} dias para desistir depois de pedir.`}
              </p>
            </div>
            <div className="priv-right__action">
              <button
                type="button"
                className="priv-danger-btn"
                onClick={openFlow}
                disabled={!preview || preview.canDelete === false}
              >
                Excluir empresa
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={open}
        wide
        title={step === 'agendado' ? 'Exclusão agendada' : `Excluir ${company.name}`}
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

          {step === 'impacto' && (
            <>
              <p className="priv-flow__lead">
                A exclusão apaga o histórico financeiro da sociedade inteira, não só a sua parte.
                Antes de seguir, veja o tamanho do que será destruído.
              </p>

              {counts && (
                <div className="priv-counts">
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.movements}</p>
                    <p className="priv-count__label">movimentações</p>
                  </div>
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.recurringCosts}</p>
                    <p className="priv-count__label">custos recorrentes</p>
                  </div>
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.members}</p>
                    <p className="priv-count__label">sócios</p>
                  </div>
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.contacts}</p>
                    <p className="priv-count__label">contatos</p>
                  </div>
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.activities}</p>
                    <p className="priv-count__label">atividades</p>
                  </div>
                  <div className="priv-count">
                    <p className="priv-count__value">{counts.events}</p>
                    <p className="priv-count__label">compromissos</p>
                  </div>
                </div>
              )}

              <div className="priv-facts">
                <div className="priv-fact priv-fact--warn">
                  <p className="priv-fact__title">Não tem como desfazer depois do prazo</p>
                  <p className="priv-fact__desc">
                    O pedido agenda a exclusão para daqui a {preview?.graceDays ?? 30} dias. Nesse
                    período você pode cancelar e nada se perde. Passado o prazo, os dados são
                    apagados de vez, sem cópia de segurança para restaurar.
                  </p>
                </div>
                <div className="priv-fact">
                  <p className="priv-fact__title">Os outros sócios continuam vendo a empresa</p>
                  <p className="priv-fact__desc">
                    Durante a carência a empresa segue funcionando e todos veem o aviso de que a
                    exclusão foi pedida. É proposital: ninguém deve descobrir que perdeu o histórico
                    depois que ele já sumiu.
                  </p>
                </div>
                <div className="priv-fact">
                  <p className="priv-fact__title">O que fica guardado</p>
                  <p className="priv-fact__desc">
                    Só o registro do próprio pedido: quem pediu, quando e quando foi atendido. É o
                    que comprova que o Plim cumpriu o seu direito de eliminação, e não contém os
                    dados da empresa.
                  </p>
                </div>
              </div>

              <div className="priv-actions">
                <Button onClick={() => setStep('confirmacao')}>Entendi, continuar</Button>
                <Button variant="secondary" onClick={handleDownload} disabled={downloading}>
                  {downloading ? 'Preparando…' : 'Baixar dados antes'}
                </Button>
              </div>
            </>
          )}

          {step === 'confirmacao' && (
            <>
              <p className="priv-flow__lead">
                Para confirmar, digite o nome da empresa exatamente como está escrito:{' '}
                <strong>{company.name}</strong>
              </p>

              <Input
                label="Nome da empresa"
                placeholder={company.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoFocus
              />

              <div className="field">
                <label className="field__label">Por que está excluindo? (opcional)</label>
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
                  disabled={busy || confirmName.trim().length === 0}
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
                Pronto. Os dados de <strong>{company.name}</strong> serão apagados definitivamente em{' '}
                <strong>{formatFullDate(scheduled.scheduledFor)}</strong>.
              </p>
              <div className="priv-facts">
                <div className="priv-fact">
                  <p className="priv-fact__title">Você tem {scheduled.daysLeft} dias para desistir</p>
                  <p className="priv-fact__desc">
                    O aviso fica visível em Configurações, com o botão de cancelar. Até a data
                    marcada, tudo continua no lugar.
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
