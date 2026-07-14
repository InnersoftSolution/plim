import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminUserDetail } from '@plim/shared';
import { adminRoleCatalog } from '@plim/shared';
import { adminApi } from './adminApi';

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (!userId) return;
    adminApi.userDetail(userId).then(setDetail).catch(() => setError(true));
  }, [userId]);

  async function handleReset() {
    if (!userId || resetState === 'sending') return;
    setResetState('sending');
    try {
      await adminApi.sendPasswordReset(userId);
      setResetState('sent');
    } catch {
      setResetState('error');
    }
  }

  if (error) return <p className="adm-error">Usuário não encontrado.</p>;
  if (!detail) return <p className="adm-loading">carregando…</p>;

  const roleLabel = adminRoleCatalog.find((r) => r.id === detail.adminRole)?.label ?? null;

  return (
    <div className="adm-page">
      <Link to="/admin/users" className="adm-backlink">← Usuários</Link>
      <header className="adm-page__head">
        <h1>{detail.fullName ?? detail.email ?? 'Usuário'}</h1>
        <p>
          {detail.email}
          {roleLabel && <span className="adm-status adm-status--plan" style={{ marginLeft: 8 }}>{roleLabel}</span>}
        </p>
      </header>

      <section className="adm-section">
        <h2>Conta</h2>
        <dl className="adm-facts">
          <div><dt>Cadastro</dt><dd>{fmtDate(detail.createdAt)}</dd></div>
          <div><dt>Último acesso</dt><dd>{fmtDate(detail.lastSignInAt)}</dd></div>
          <div><dt>Senha</dt><dd>gerenciada pelo provedor de autenticação, nunca visível</dd></div>
        </dl>
      </section>

      <section className="adm-section">
        <h2>Empresas ({detail.memberships.length})</h2>
        {detail.memberships.length === 0 ? (
          <p className="adm-empty">Não participa de nenhuma empresa.</p>
        ) : (
          <div className="adm-table adm-table--memberships">
            <div className="adm-table__head">
              <span>Empresa</span>
              <span>Papel</span>
              <span>Função</span>
            </div>
            {detail.memberships.map((m) => (
              <Link key={m.companyId} to={`/admin/companies/${m.companyId}`} className="adm-row">
                <span data-label="Empresa" className="adm-row__title">
                  {m.companyName}
                  {m.isAccountOwner && <span className="adm-status adm-status--plan">responsável</span>}
                </span>
                <span data-label="Papel">{m.role}</span>
                <span data-label="Função">{m.functionalRole ?? '—'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="adm-section">
        <h2>Suporte de acesso</h2>
        <p className="adm-section__hint">O usuário receberá um link por e-mail para criar uma nova senha.</p>
        <button className="adm-action" onClick={handleReset} disabled={resetState === 'sending' || resetState === 'sent'}>
          {resetState === 'sending' ? 'Enviando…' : resetState === 'sent' ? 'Link enviado ✓' : 'Enviar link de redefinição de senha'}
        </button>
        {resetState === 'error' && <p className="adm-error">Não consegui enviar. Tenta de novo.</p>}
      </section>
    </div>
  );
}
