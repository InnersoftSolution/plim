import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import './confirm.css';

interface ConfirmDialogProps {
  open: boolean;
  /** Título curto. Padrão: "Excluir?". */
  title?: string;
  /** Texto explicando o que será apagado (inclua o nome do item). */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = ação destrutiva (botão vermelho). Padrão true. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmação para ações irreversíveis. Toda exclusão passa por
 * aqui: nada é apagado no primeiro clique.
 */
export function ConfirmDialog({
  open,
  title = 'Excluir?',
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onCancel}>
      <div className="confirm">
        <p className="confirm__msg">{message}</p>
        <div className="confirm__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <button
            type="button"
            className={'confirm__btn' + (danger ? ' confirm__btn--danger' : '')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Excluindo…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
