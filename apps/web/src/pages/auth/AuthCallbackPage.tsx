import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { useAuth } from '../../auth/AuthContext';

/**
 * Destino dos links de e-mail (convite de sócio, redefinir senha, Google).
 * O client do Supabase lê o token do fragmento da URL e cria a sessão sozinho;
 * esta página só espera a sessão aparecer e manda a pessoa para o lugar certo:
 *  - convite ou recuperação de senha → /definir-senha (criar a própria senha)
 *  - demais casos → home (que decide entre onboarding e dashboard)
 */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // O tipo do link vem no fragmento (#...&type=invite) e o Supabase o consome
  // ao criar a sessão. Capturamos UMA vez, na primeira renderização.
  const [hashParams] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const linkType = hashParams.get('type');
  const hasError = params.has('error') || hashParams.has('error');

  useEffect(() => {
    if (loading || hasError || !user) return;
    const needsPassword = linkType === 'invite' || linkType === 'recovery';
    navigate(needsPassword ? '/definir-senha' : '/', { replace: true });
  }, [user, loading, hasError, linkType, navigate]);

  // Sem sessão depois de um tempo razoável: orienta em vez de girar pra sempre.
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, []);

  const failed = hasError || (timedOut && !user);

  return (
    <AuthLayout title={failed ? 'Algo deu errado' : 'Conectando…'}>
      <div className="auth-success">
        <p>
          {failed
            ? 'Não foi possível concluir o acesso. O link pode ter expirado. Tente entrar de novo ou peça um novo convite.'
            : 'Estamos finalizando seu acesso com segurança.'}
        </p>
        {failed && (
          <Link to="/login" className="auth-inline-link">
            Ir para o login
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
