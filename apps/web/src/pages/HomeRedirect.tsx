import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { companyApi, meApi } from '../company/companyApi';
import { readStoredActiveCompany } from '../company/ActiveCompanyContext';

/**
 * Resolvedor da home (`/`): decide para onde mandar o usuário autenticado.
 *  - sem empresa            → /onboarding (cria a primeira)
 *  - uma empresa            → /dashboard
 *  - várias, com uma lembrada → /dashboard (abre na última usada)
 *  - várias, sem escolha    → /selecionar-empresa
 * É um ponto único, então login e guarda concordam (sem corrida de rota).
 */
export function HomeRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const companies = await companyApi.listMyCompanies();
        if (!active) return;
        if (companies.length === 0) {
          setTarget('/onboarding');
          return;
        }
        if (companies.length === 1) {
          setTarget('/dashboard');
          return;
        }
        // Mais de uma: se há uma empresa lembrada, abre nela; senão, deixa escolher.
        const me = await meApi.get().catch(() => null);
        if (!active) return;
        const remembered = me?.lastActiveCompanyId ?? readStoredActiveCompany();
        const known = remembered && companies.some((c) => c.id === remembered);
        setTarget(known ? '/dashboard' : '/selecionar-empresa');
      } catch {
        if (active) setTarget('/dashboard'); // fallback: deixa o dashboard tratar o erro
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!target) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-subtle)',
          fontSize: 14,
        }}
      >
        carregando…
      </main>
    );
  }
  return <Navigate to={target} replace />;
}
