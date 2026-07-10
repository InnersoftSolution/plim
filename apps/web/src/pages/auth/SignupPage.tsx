import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { signupSchema } from '@plim/shared';
import { useAuth } from '../../auth/AuthContext';
import { AuthError } from '../../auth/types';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordStrength } from '../../components/ui/PasswordStrength';
import { GoogleButton } from '../../components/GoogleButton';
import { validateForm } from '../../lib/forms';

export function SignupPage() {
  const { signup, loginWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');

    const result = validateForm(signupSchema, { fullName, email, password });
    const localErrors: Record<string, string> = result.errors ? { ...result.errors } : {};
    if (password && confirmPassword !== password) {
      localErrors.confirmPassword = 'As senhas não conferem';
    }
    if (!acceptedTerms) {
      localErrors.terms = 'É preciso aceitar os termos para continuar';
    }
    if (Object.keys(localErrors).length > 0 || result.errors) {
      setErrors(localErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await signup(result.data);
      setConfirmationSent(true);
    } catch (err) {
      if (err instanceof AuthError && err.code === 'EMAIL_ALREADY_REGISTERED') {
        setErrors({ email: err.message });
      } else {
        setFormError('Não foi possível criar a conta. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout title="Confira seu e-mail">
        <div className="auth-success">
          <div className="auth-success__icon">✓</div>
          <p>
            Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para ativar
            sua conta e começar.
          </p>
          <Link to="/login" className="auth-inline-link">
            Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar sua conta" subtitle="Tudo começa com um plim." backTo="/login">
      <GoogleButton label="Continuar com o Google" onClick={() => loginWithGoogle()} disabled={submitting} />
      <div className="auth-divider">ou com e-mail</div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="form-error">{formError}</div>}
        <Input
          label="Nome completo"
          name="fullName"
          autoComplete="name"
          placeholder="Como você se chama"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
        />
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
          autoComplete="new-password"
          placeholder="Crie uma senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={password ? undefined : 'Pelo menos 8 caracteres, com letras e números'}
        />
        <PasswordStrength value={password} />
        <Input
          label="Confirmar senha"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repita a senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />
        <label className="auth-terms">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            Li e aceito os <a href="#" className="auth-inline-link">termos de uso</a> e a{' '}
            <a href="#" className="auth-inline-link">política de privacidade</a>.
          </span>
        </label>
        {errors.terms && <span className="field__error" role="alert">{errors.terms}</span>}
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </Button>
      </form>
      <div className="auth-links">
        <span>
          Já tem conta? <Link to="/login">Entrar</Link>
        </span>
      </div>
    </AuthLayout>
  );
}
