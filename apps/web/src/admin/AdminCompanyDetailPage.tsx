import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminCompanyDetail } from '@plim/shared';
import { adminApi } from './adminApi';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function dash(v: string | null | undefined): string {
  return v && v.trim() !== '' ? v : '—';
}

export function AdminCompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    adminApi.companyDetail(companyId).then(setDetail).catch(() => setError(true));
  }, [companyId]);

  if (error) return <p className="adm-error">Empresa não encontrada.</p>;
  if (!detail) return <p className="adm-loading">carregando…</p>;

  return (
    <div className="adm-page">
      <Link to="/admin/companies" className="adm-backlink">← Empresas</Link>
      <header className="adm-page__head">
        <h1>{detail.name}</h1>
        <p>
          Criada em {fmtDate(detail.createdAt)} ·{' '}
          <span className={'adm-status ' + (detail.onboardingStatus === 'completed' ? 'adm-status--ok' : 'adm-status--warn')}>
            onboarding {detail.onboardingStatus === 'completed' ? 'completo' : 'incompleto'}
          </span>
        </p>
      </header>

      <section className="adm-section">
        <h2>Dados principais</h2>
        <dl className="adm-facts">
          <div><dt>Descrição</dt><dd>{dash(detail.description)}</dd></div>
          <div><dt>País</dt><dd>{dash(detail.countryCode)}</dd></div>
          <div><dt>Região/Cidade</dt><dd>{dash([detail.region, detail.city].filter(Boolean).join(' / ') || null)}</dd></div>
          <div><dt>Moeda</dt><dd>{dash(detail.currencyCode)}</dd></div>
          <div><dt>Estágio</dt><dd>{dash(detail.businessStage)}</dd></div>
          <div><dt>Registro (CNPJ)</dt><dd>{dash(detail.registrationNumber)}</dd></div>
          <div><dt>Natureza jurídica</dt><dd>{dash(detail.legalStructure)}</dd></div>
        </dl>
      </section>

      <section className="adm-section">
        <h2>Responsável pela conta</h2>
        {detail.owner ? (
          <dl className="adm-facts">
            <div><dt>Nome</dt><dd>{detail.owner.fullName}</dd></div>
            <div><dt>E-mail</dt><dd>{dash(detail.owner.email)}</dd></div>
          </dl>
        ) : (
          <p className="adm-empty">Sem responsável identificado.</p>
        )}
      </section>

      <section className="adm-section">
        <h2>Sócios e membros ({detail.members.length})</h2>
        <div className="adm-table adm-table--members">
          <div className="adm-table__head">
            <span>Nome</span>
            <span>E-mail</span>
            <span>Papel</span>
            <span>Participação</span>
            <span>Status</span>
          </div>
          {detail.members.map((m) => (
            <div key={m.id} className="adm-row adm-row--static">
              <span data-label="Nome" className="adm-row__title">
                {m.fullName}
                {m.role === 'account_owner' && <span className="adm-status adm-status--plan">responsável</span>}
              </span>
              <span data-label="E-mail">{dash(m.email)}</span>
              <span data-label="Papel">{dash(m.functionalRole)}</span>
              <span data-label="Participação">{m.equityPercent === null ? '—' : `${m.equityPercent}%`}</span>
              <span data-label="Status">{m.status} · {m.invitationStatus}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="adm-section">
        <h2>Uso da empresa</h2>
        <div className="adm-cards adm-cards--mini">
          <div className="adm-card"><span className="adm-card__label">Movimentações</span><strong className="adm-card__value">{detail.usage.expensesCount}</strong></div>
          <div className="adm-card"><span className="adm-card__label">Custos recorrentes</span><strong className="adm-card__value">{detail.usage.recurringCount}</strong></div>
          <div className="adm-card"><span className="adm-card__label">Atividades</span><strong className="adm-card__value">{detail.usage.activitiesCount}</strong></div>
          <div className="adm-card"><span className="adm-card__label">Atividades atrasadas</span><strong className="adm-card__value">{detail.usage.activitiesOverdue}</strong></div>
        </div>
      </section>

      <section className="adm-section">
        <h2>Plano e cobrança</h2>
        <dl className="adm-facts">
          <div><dt>Plano atual</dt><dd><span className="adm-status adm-status--plan">Beta</span></dd></div>
          <div><dt>Cobrança</dt><dd>ainda não configurada</dd></div>
        </dl>
      </section>
    </div>
  );
}
