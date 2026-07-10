import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { companyApi } from '../company/companyApi';

/**
 * Resolvedor da home (`/`): decide para onde mandar o usuário autenticado.
 *  - sem empresa  → /onboarding
 *  - empresa com onboarding incompleto → /onboarding (retoma)
 *  - empresa concluída → /dashboard
 * É um ponto único, então login e guarda concordam (sem corrida de rota).
 */
export function HomeRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    companyApi
      .listMyCompanies()
      .then((companies) => {
        if (!active) return;
        if (companies.length === 0) {
          setTarget('/onboarding');
          return;
        }
        const allCompleted = companies.every((c) => c.onboardingStatus === 'completed');
        setTarget(allCompleted ? '/dashboard' : '/onboarding');
      })
      .catch(() => {
        if (active) setTarget('/dashboard'); // fallback: deixa o dashboard tratar o erro
      });
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
