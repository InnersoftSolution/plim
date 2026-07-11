import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminCompanyRow } from '@plim/shared';
import { adminApi } from './adminApi';

type Filter = 'all' | 'completed' | 'incomplete';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'completed', label: 'Onboarding completo' },
  { id: 'incomplete', label: 'Onboarding incompleto' },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function AdminCompaniesPage() {
  const [rows, setRows] = useState<AdminCompanyRow[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminApi.listCompanies().then(setRows).catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'completed' && r.onboardingStatus !== 'completed') return false;
      if (filter === 'incomplete' && r.onboardingStatus === 'completed') return false;
      if (q) {
        const haystack = `${r.name} ${r.ownerName ?? ''} ${r.ownerEmail ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  if (error) return <p className="adm-error">Não consegui carregar as empresas. Tenta de novo.</p>;
  if (!rows) return <p className="adm-loading">carregando…</p>;

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1>Empresas</h1>
        <p>Todas as empresas cadastradas no Plim.</p>
      </header>

      <div className="adm-toolbar">
        <input
          className="adm-search"
          type="search"
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="adm-chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={'adm-chip' + (filter === f.id ? ' is-active' : '')}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="adm-empty">Nenhuma empresa encontrada{search ? ` para “${search}”` : ''}.</p>
      ) : (
        <div className="adm-table" role="table" aria-label="Empresas">
          <div className="adm-table__head" role="row">
            <span>Empresa</span>
            <span>Responsável</span>
            <span>Onboarding</span>
            <span>Sócios</span>
            <span>Movim.</span>
            <span>Plano</span>
            <span>Criada em</span>
          </div>
          {filtered.map((r) => (
            <Link key={r.id} to={`/admin/companies/${r.id}`} className="adm-row" role="row">
              <span data-label="Empresa" className="adm-row__title">{r.name}</span>
              <span data-label="Responsável">
                {r.ownerName ?? '—'}
                {r.ownerEmail && <small>{r.ownerEmail}</small>}
              </span>
              <span data-label="Onboarding">
                <span className={'adm-status ' + (r.onboardingStatus === 'completed' ? 'adm-status--ok' : 'adm-status--warn')}>
                  {r.onboardingStatus === 'completed' ? 'completo' : 'incompleto'}
                </span>
              </span>
              <span data-label="Sócios">{r.membersCount}</span>
              <span data-label="Movimentações">{r.expensesCount}</span>
              <span data-label="Plano"><span className="adm-status adm-status--plan">Beta</span></span>
              <span data-label="Criada em">{fmtDate(r.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
