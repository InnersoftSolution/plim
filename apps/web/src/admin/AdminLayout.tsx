import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';
import { useAdminMe } from './useAdminMe';
import './admin.css';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/companies', label: 'Empresas', end: false },
  { to: '/admin/users', label: 'Usuários', end: false },
];

const SOON = ['Planos', 'Parceiros', 'Suporte'];

/**
 * Casca do Painel Administrativo — visual próprio, separado do app comum.
 * Guard: consulta /admin/me; usuário comum é redirecionado para o app.
 * (Cortesia de UX — a segurança real é o 403 da API em toda rota /admin.)
 */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const { loading, role } = useAdminMe();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (loading) {
    return <main className="adm-gate">verificando acesso…</main>;
  }
  if (!role) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className={'adm' + (menuOpen ? ' adm--menu-open' : '')}>
      <header className="adm-mobilebar">
        <button className="adm-burger" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <Logo height={20} />
        <span className="adm-badge">ADMIN</span>
      </header>

      {menuOpen && <div className="adm-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className="adm-sidebar">
        <div className="adm-sidebar__head">
          <Logo height={22} />
          <span className="adm-badge">ADMIN</span>
        </div>
        <p className="adm-sidebar__hint">Painel interno do Plim: empresas, usuários e uso do produto.</p>
        <nav className="adm-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'adm-nav__item' + (isActive ? ' is-active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
          {SOON.map((label) => (
            <span key={label} className="adm-nav__item adm-nav__item--soon">
              {label} <em>em breve</em>
            </span>
          ))}
        </nav>
        <div className="adm-foot">
          <NavLink to="/dashboard" className="adm-foot__back">← Voltar ao app</NavLink>
          <span className="adm-foot__user">{user?.email}</span>
          <button className="adm-foot__logout" onClick={() => logout()}>Sair</button>
        </div>
      </aside>

      <main className="adm-content">
        <Outlet />
      </main>
    </div>
  );
}
