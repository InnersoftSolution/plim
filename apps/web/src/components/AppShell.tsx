import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAdminMe } from '../admin/useAdminMe';
import { CompanySwitcher } from '../company/CompanySwitcher';
import { LogoWhite } from './LogoWhite';
import { Button } from './ui/Button';
import './appshell.css';

interface NavLeaf {
  to: string;
  label: string;
  icon: ReactNode;
}
interface NavGroup {
  label: string;
  icon: ReactNode;
  children: { to: string; label: string }[];
}
type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Home', icon: <IconGrid /> },
  {
    label: 'Empresa',
    icon: <IconBuilding />,
    children: [
      { to: '/empresa/dados', label: 'Dados da empresa' },
      { to: '/socios', label: 'Sócios' },
      { to: '/empresa/categorias', label: 'Categorias' },
      { to: '/empresa/contatos', label: 'Contatos' },
      { to: '/empresa/checklist', label: 'Checklist da empresa' },
    ],
  },
  { to: '/agenda', label: 'Agenda', icon: <IconCalendar /> },
  { to: '/financeiro', label: 'Movimentações', icon: <IconWallet /> },
  { to: '/acertos', label: 'Acertos', icon: <IconSwap /> },
  { to: '/atividades', label: 'Atividades', icon: <IconChecklist /> },
];

/** Casca do app autenticado: menu lateral + conteúdo (via <Outlet/>). */
export function AppShell() {
  const { user, logout } = useAuth();
  const { role: adminRole } = useAdminMe();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  // Fecha o drawer ao trocar de rota (mobile).
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className={'shell' + (menuOpen ? ' shell--menu-open' : '')}>
      {/* barra superior — só aparece no mobile */}
      <header className="shell-mobilebar">
        <button className="shell-burger" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
        <LogoWhite height={24} />
      </header>

      {menuOpen && <div className="shell-backdrop" onClick={closeMenu} />}

      <aside className="shell-sidebar">
        <div className="shell-sidebar__head">
          <div className="shell-brand">
            <LogoWhite height={38} />
          </div>
          <button className="shell-close" aria-label="Fechar menu" onClick={closeMenu}>
            <IconClose />
          </button>
        </div>
        <CompanySwitcher onNavigate={closeMenu} />
        <nav className="shell-nav">
          {NAV.map((entry) =>
            isGroup(entry) ? (
              <NavGroupItem key={entry.label} group={entry} onNavigate={closeMenu} />
            ) : (
              <NavLink
                key={entry.to}
                to={entry.to}
                onClick={closeMenu}
                className={({ isActive }) => 'shell-nav__item' + (isActive ? ' is-active' : '')}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <div className="shell-foot">
          {adminRole && (
            <NavLink to="/admin" className="shell-foot__admin" onClick={closeMenu}>
              Painel admin
            </NavLink>
          )}
          <NavLink
            to="/perfil"
            className={({ isActive }) => 'shell-foot__profile' + (isActive ? ' is-active' : '')}
            onClick={closeMenu}
          >
            <IconUser />
            <span className="shell-foot__user">{user?.email}</span>
          </NavLink>
          <Button variant="ghost" onClick={() => logout()}>
            Sair
          </Button>
        </div>
      </aside>
      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}

function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const location = useLocation();
  const hasActiveChild = group.children.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div className="shell-nav__group">
      <button
        type="button"
        className={'shell-nav__item shell-nav__item--group' + (hasActiveChild ? ' is-active' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {group.icon}
        <span>{group.label}</span>
        <IconChevron className={'shell-nav__chev' + (open ? ' is-open' : '')} />
      </button>
      {open && (
        <div className="shell-subnav">
          {group.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              onClick={onNavigate}
              className={({ isActive }) => 'shell-subnav__item' + (isActive ? ' is-active' : '')}
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ícones (SVG inline, herdam currentColor) ── */
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11" />
      <path d="M3 21h18" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M20 9v6h-4a3 3 0 0 1 0-6h4Z" />
    </svg>
  );
}
function IconSwap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H7" />
    </svg>
  );
}
/** Ícone do menu Agenda. */
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconChecklist() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 7 2 2 4-4" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8M13 12h8M13 18h8" />
    </svg>
  );
}
function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
