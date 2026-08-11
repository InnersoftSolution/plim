import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CompanyMember, Expense } from '@plim/shared';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { MovementEditForm } from './MovementEditForm';
import { financeApi } from './financeApi';
import './movementdetail.css';

/**
 * Edição em página, no mesmo endereço da movimentação + /editar.
 *
 * O formulário é o mesmo de antes; o que muda é onde ele vive. Meia jornada em
 * página e meia em modal confunde: o voltar do navegador faz coisas diferentes
 * dependendo de onde a pessoa está, e no celular o modal empilhado sobre a
 * página vira rolagem dentro de rolagem.
 */
export function MovementEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useActiveCompany();

  const [movement, setMovement] = useState<Expense | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      try {
        const [mov, mem] = await Promise.all([
          financeApi.getMovement(company.id, id),
          companyApi.listMembers(company.id),
        ]);
        if (!active) return;
        setMovement(mov);
        setMembers(mem);
      } catch (err) {
        if (active) setError(messageForError(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [company.id, id]);

  const voltar = () => navigate(`/financeiro/movimentacao/${id}`);

  if (loading) return <p className="dash-muted">carregando movimentação…</p>;

  return (
    <div className="movp">
      <Link to={`/financeiro/movimentacao/${id}`} className="movp-back">
        ← Voltar para a movimentação
      </Link>
      <header className="movp-head">
        <h1 className="movp-title">Editar movimentação</h1>
      </header>

      {error && <div className="form-error">{error}</div>}

      {movement && (
        <section className="movp-card">
          <MovementEditForm
            company={company}
            members={members}
            expense={movement}
            // Salvou: volta para o detalhe, que já mostra o resultado da edição
            // (inclusive os acertos reajustados).
            onSaved={voltar}
            onClose={voltar}
          />
        </section>
      )}
    </div>
  );
}
