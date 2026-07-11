import { useEffect, useState } from 'react';
import type { AdminDashboardStats } from '@plim/shared';
import { adminApi } from './adminApi';

/** Visão interna do Plim: acompanhamento de empresas, usuários e uso. */
export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    adminApi.dashboard().then(setStats).catch(() => setError(true));
  }, []);

  if (error) return <p className="adm-error">Não consegui carregar o dashboard. Tenta de novo.</p>;
  if (!stats) return <p className="adm-loading">carregando…</p>;

  const cards: Array<{ label: string; value: string; hint: string }> = [
    { label: 'Empresas cadastradas', value: String(stats.companiesTotal), hint: 'total no produto' },
    { label: 'Empresas ativas', value: String(stats.companiesActive), hint: 'onboarding concluído' },
    { label: 'Empresas incompletas', value: String(stats.companiesIncomplete), hint: 'onboarding pendente' },
    { label: 'Usuários cadastrados', value: String(stats.usersTotal), hint: 'contas de login' },
    { label: 'Movimentações registradas', value: String(stats.expensesTotal), hint: 'em todo o sistema' },
    { label: 'Atividades criadas', value: String(stats.activitiesTotal), hint: 'em todo o sistema' },
    { label: 'Plano vigente', value: 'Beta', hint: 'cobrança ainda não configurada' },
  ];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1>Dashboard</h1>
        <p>Visão interna do Plim para acompanhamento de empresas, usuários e uso do produto.</p>
      </header>
      <div className="adm-cards">
        {cards.map((c) => (
          <div key={c.label} className="adm-card">
            <span className="adm-card__label">{c.label}</span>
            <strong className="adm-card__value">{c.value}</strong>
            <span className="adm-card__hint">{c.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
