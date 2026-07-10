import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@plim/shared';
import { useAuth } from '../../auth/AuthContext';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { validateForm } from '../../lib/forms';

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateForm(forgotPasswordSchema, { email });
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await requestPasswordReset(result.data.email);
    } finally {
      // Resposta sempre genérica — não revelamos se o e-mail existe.
      setSent(true);
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Verifique seu e-mail">
        <div className="auth-success">
          <div className="auth-success__icon">✓</div>
          <p>
            Se existir uma conta para <strong>{email}</strong>, você vai receber um link para
            redefinir a senha em instantes.
          </p>
          <Link to="/login" className="auth-inline-link">
            Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueceu a senha?"
      subtitle="Sem problema — informe seu e-mail e enviaremos um link para criar uma nova."
      backTo="/login"
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar link de redefinição'}
        </Button>
      </form>
      <div className="auth-links">
        <Link to="/login">Voltar para o login</Link>
      </div>
    </AuthLayout>
  );
}
