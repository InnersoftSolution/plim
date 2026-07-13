import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { businessStageCatalog, type Company } from '@plim/shared';
import { companyApi, meApi, messageForError } from '../company/companyApi';
import { rememberActiveCompany } from '../company/ActiveCompanyContext';
import { CompanyAvatar } from '../company/CompanySwitcher';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import './selectcompany.css';

interface CompanyCard {
  company: Company;
  memberCount: number;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cards: CompanyCard[]; canCreate: boolean };

/**
 * Tela de seleção de empresa (multiempresa): quem participa de mais de uma
 * empresa escolhe aqui em qual quer trabalhar. Cada empresa tem dados próprios.
 */
export function SelectCompanyPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [companies, me] = await Promise.all([companyApi.listMyCompanies(), meApi.get()]);
      if (companies.length === 0) {
        navigate('/onboarding', { replace: true });
        return;
      }
      const counts = await Promise.all(
        companies.map((c) => companyApi.listMembers(c.id).then((m) => m.length).catch(() => 0)),
      );
      const cards = companies.map((company, i) => ({ company, memberCount: counts[i] ?? 0 }));
      setState({ status: 'ready', cards, canCreate: me.canCreateMultipleCompanies });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function access(id: string) {
    setEnteringId(id);
    await rememberActiveCompany(id);
    navigate('/dashboard');
  }

  if (state.status === 'loading') {
    return (
      <main className="selco">
        <p className="selco__muted">carregando suas empresas…</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="selco">
        <p className="selco__muted">{state.message}</p>
        <Button variant="secondary" onClick={load}>
          Tentar de novo
        </Button>
      </main>
    );
  }

  const { cards, canCreate } = state;

  return (
    <main className="selco">
      <span className="selco__brand" aria-hidden="true">
        <Logo height={28} />
      </span>
      <div className="selco__head">
        <h1>Escolha uma empresa</h1>
        <p>
          Você participa de mais de uma empresa no Plim. Selecione em qual deseja trabalhar agora.
          Cada empresa tem seus próprios sócios, movimentações, acertos, atividades e checklist.
        </p>
      </div>

      <div className="selco__grid">
        {cards.map(({ company, memberCount }) => {
          const stage = businessStageCatalog.find((s) => s.id === company.businessStage)?.label;
          return (
            <div className="selco-card" key={company.id}>
              <div className="selco-card__top">
                <CompanyAvatar company={company} size={44} />
                <div className="selco-card__id">
                  <span className="selco-card__name">
                    {company.name}
                    {company.isNameTemporary && <em className="selco-card__prov"> (provisório)</em>}
                  </span>
                  {company.description && (
                    <span className="selco-card__desc">{company.description}</span>
                  )}
                </div>
              </div>
              <div className="selco-card__meta">
                {stage && <span className="selco-chip">{stage}</span>}
                <span className="selco-chip">
                  {memberCount} {memberCount === 1 ? 'sócio' : 'sócios'}
                </span>
                {company.currencyCode && <span className="selco-chip">{company.currencyCode}</span>}
              </div>
              <Button block onClick={() => access(company.id)} disabled={enteringId !== null}>
                {enteringId === company.id ? 'Entrando…' : 'Acessar'}
              </Button>
            </div>
          );
        })}

        {canCreate && (
          <button
            type="button"
            className="selco-card selco-card--new"
            onClick={() => navigate('/onboarding?nova=1')}
            disabled={enteringId !== null}
          >
            <span className="selco-card__plus" aria-hidden="true">
              +
            </span>
            <span className="selco-card__name">Criar nova empresa</span>
            <span className="selco-card__desc">Um novo espaço, com dados totalmente separados.</span>
          </button>
        )}
      </div>
    </main>
  );
}
