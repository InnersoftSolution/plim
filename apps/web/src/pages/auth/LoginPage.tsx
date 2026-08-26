import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema } from '@plim/shared';
import { useAuth } from '../../auth/AuthContext';
import { useAuthBarrier } from '../../auth/useAuthBarrier';
import { AuthError } from '../../auth/types';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { GoogleButton } from '../../components/GoogleButton';
import { validateForm } from '../../lib/forms';
import { POST_AUTH_REDIRECT } from '../../routes';

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const barreira = useAuthBarrier();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (barreira.travado) return;
    setFormError('');
    const result = validateForm(loginSchema, { email, password });
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(result.data);
      barreira.limpar();
      navigate(POST_AUTH_REDIRECT);
    } catch (err) {
      // Só senha/e-mail errados alimentam a barreira. Erro de rede não é
      // tentativa: punir a pessoa pelo wi-fi dela seria injusto.
      if (err instanceof AuthError) barreira.registrarErro();
      setFormError(err instanceof AuthError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    try {
      await loginWithGoogle();
      navigate(POST_AUTH_REDIRECT);
    } catch {
      setFormError('Não foi possível entrar com o Google. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Que bom te ver" subtitle="Entre para continuar de onde parou.">
      <GoogleButton label="Entrar com o Google" onClick={handleGoogle} disabled={submitting} />
      <div className="auth-divider">ou com e-mail</div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {barreira.travado ? (
          <div className="form-error" role="status">
            Muitas tentativas seguidas. Aguarde {barreira.segundosRestantes}s para tentar de novo,
            ou use <Link to="/forgot-password">esqueci minha senha</Link>.
          </div>
        ) : (
          formError && <div className="form-error">{formError}</div>
        )}
        <Input
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Senha"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" block disabled={submitting || barreira.travado}>
          {barreira.travado
            ? `Aguarde ${barreira.segundosRestantes}s`
            : submitting
              ? 'Entrando…'
              : 'Entrar'}
        </Button>
      </form>
      <div className="auth-links">
        <Link to="/forgot-password">Esqueci minha senha</Link>
        <span>
          Ainda não tem conta? <Link to="/signup">Criar conta</Link>
        </span>
      </div>
    </AuthLayout>
  );
}
