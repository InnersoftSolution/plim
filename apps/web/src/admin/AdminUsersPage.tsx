import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminUserRow } from '@plim/shared';
import { adminRoleCatalog } from '@plim/shared';
import { adminApi } from './adminApi';

type Filter = 'all' | 'admins' | 'with-company' | 'without-company';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'admins', label: 'Administradores' },
  { id: 'with-company', label: 'Com empresa' },
  { id: 'without-company', label: 'Sem empresa' },
];

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}
function roleLabel(role: string | null): string | null {
  return adminRoleCatalog.find((r) => r.id === role)?.label ?? null;
}

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminApi.listUsers().then(setRows).catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'admins' && !r.adminRole) return false;
      if (filter === 'with-company' && r.companiesCount === 0) return false;
      if (filter === 'without-company' && r.companiesCount > 0) return false;
      if (q && !`${r.fullName ?? ''} ${r.email ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  if (error) return <p className="adm-error">Não consegui carregar os usuários. Tenta de novo.</p>;
  if (!rows) return <p className="adm-loading">carregando…</p>;

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1>Usuários</h1>
        <p>Contas de login cadastradas no Plim.</p>
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
        <p className="adm-empty">Nenhum usuário encontrado{search ? ` para “${search}”` : ''}.</p>
      ) : (
        <div className="adm-table adm-table--users" role="table" aria-label="Usuários">
          <div className="adm-table__head" role="row">
            <span>Usuário</span>
            <span>Cadastro</span>
            <span>Último acesso</span>
            <span>Empresas</span>
            <span>Papel admin</span>
          </div>
          {filtered.map((r) => (
            <Link key={r.id} to={`/admin/users/${r.id}`} className="adm-row" role="row">
              <span data-label="Usuário" className="adm-row__title">
                {r.fullName ?? '—'}
                {r.email && <small>{r.email}</small>}
              </span>
              <span data-label="Cadastro">{fmtDate(r.createdAt)}</span>
              <span data-label="Último acesso">{fmtDate(r.lastSignInAt)}</span>
              <span data-label="Empresas">{r.companiesCount}</span>
              <span data-label="Papel admin">
                {r.adminRole ? <span className="adm-status adm-status--plan">{roleLabel(r.adminRole)}</span> : '—'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
