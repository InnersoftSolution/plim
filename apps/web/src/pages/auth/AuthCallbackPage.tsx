import { useSearchParams, Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';

/**
 * Destino do redirect OAuth (Google). Quando o Supabase entrar,
 * esta página troca o código por sessão. Use ?error=provider para testar falha.
 */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const hasError = params.has('error');

  return (
    <AuthLayout title={hasError ? 'Algo deu errado' : 'Conectando…'}>
      <div className="auth-success">
        <p>
          {hasError
            ? 'Não foi possível concluir o login com o provedor. Tente novamente.'
            : 'Estamos finalizando seu login com segurança.'}
        </p>
        <Link to="/login" className="auth-inline-link">
          Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  );
}
