import { Link } from 'react-router-dom';
import { useActiveCompany } from './ActiveCompanyContext';
import { formatFullDate } from './privacyApi';
import './privacidade.css';

/**
 * Faixa de aviso quando a empresa ativa está com exclusão agendada.
 *
 * Fica no topo de todas as telas de propósito: quem pediu foi uma pessoa só,
 * mas quem perde o histórico são todos os sócios. Esconder a empresa durante a
 * carência seria pior, porque os outros descobririam o sumiço sem ter tido
 * chance de reagir.
 */
export function DeletionBanner() {
  const { company } = useActiveCompany();
  if (!company.deletionScheduledFor) return null;

  const dias = Math.max(
    0,
    Math.ceil((new Date(company.deletionScheduledFor).getTime() - Date.now()) / 86_400_000),
  );

  return (
    <div className="priv-banner" role="status">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <span>
        <strong>{company.name}</strong> será excluída em{' '}
        {formatFullDate(company.deletionScheduledFor)}
        {dias > 0 && ` (${dias} ${dias === 1 ? 'dia' : 'dias'})`}. Todos os dados serão apagados.
      </span>
      <Link to="/empresa/dados" className="priv-banner__link">
        Ver detalhes
      </Link>
    </div>
  );
}
