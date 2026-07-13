import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Company } from '@plim/shared';
import { useActiveCompany } from './ActiveCompanyContext';
import './companyswitcher.css';

/** Iniciais da empresa quando não há logo (mesma regra do onboarding). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Avatar da empresa: logo (se houver) ou iniciais num quadrado. */
export function CompanyAvatar({ company, size = 30 }: { company: Company; size?: number }) {
  const style = { width: size, height: size, borderRadius: Math.round(size / 4) };
  if (company.logoUrl) {
    return (
      <img className="cav" style={style} src={company.logoUrl} alt="" aria-hidden="true" />
    );
  }
  return (
    <span className="cav cav--initials" style={{ ...style, fontSize: Math.round(size / 2.6) }} aria-hidden="true">
      {initials(company.name)}
    </span>
  );
}

/**
 * Seletor de empresa ativa (topo da sidebar). Mostra a empresa em que o usuário
 * está trabalhando; se ele tiver mais de uma (ou puder criar), abre um menu para
 * trocar, criar nova ou ver todas. Com uma empresa só e sem permissão, vira só um
 * rótulo (sem menu), sem poluir a interface.
 */
export function CompanySwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { company, companies, canCreateMultipleCompanies, switchCompany } = useActiveCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasMenu = companies.length > 1 || canCreateMultipleCompanies;

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  async function pick(id: string) {
    if (id !== company.id) await switchCompany(id);
    close();
    navigate('/dashboard');
  }

  return (
    <div className="csw" ref={ref}>
      <button
        type="button"
        className={'csw__btn' + (hasMenu ? '' : ' csw__btn--static')}
        onClick={() => hasMenu && setOpen((v) => !v)}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? open : undefined}
        disabled={!hasMenu}
      >
        <CompanyAvatar company={company} />
        <span className="csw__text">
          <span className="csw__eyebrow">Empresa ativa</span>
          <span className="csw__name">{company.name}</span>
        </span>
        {hasMenu && <IconChevron className={'csw__chev' + (open ? ' is-open' : '')} />}
      </button>

      {open && hasMenu && (
        <div className="csw__menu" role="menu">
          {companies.length > 1 && (
            <>
              <span className="csw__label">Suas empresas</span>
              {companies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  className={'csw__item' + (c.id === company.id ? ' is-active' : '')}
                  onClick={() => pick(c.id)}
                >
                  <CompanyAvatar company={c} size={26} />
                  <span className="csw__item-name">{c.name}</span>
                  {c.id === company.id && <IconCheck />}
                </button>
              ))}
              <div className="csw__sep" />
            </>
          )}
          {canCreateMultipleCompanies && (
            <button
              type="button"
              role="menuitem"
              className="csw__action"
              onClick={() => {
                close();
                navigate('/onboarding?nova=1');
              }}
            >
              <IconPlus />
              <span>Criar nova empresa</span>
            </button>
          )}
          {companies.length > 1 && (
            <button
              type="button"
              role="menuitem"
              className="csw__action"
              onClick={() => {
                close();
                navigate('/selecionar-empresa');
              }}
            >
              <IconGrid />
              <span>Ver todas as empresas</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="csw__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
