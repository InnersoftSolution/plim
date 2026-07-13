import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { passwordSchema } from '@plim/shared';
import { AuthLayout } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../auth/AuthContext';

/**
 * Destino de quem entra por link de convite ou de recuperação de senha.
 * A pessoa já está logada (sessão criada pelo link); aqui ela define a
 * própria senha para conseguir voltar depois pelo login normal.
 */
export function SetPasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Senha inválida.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a senha.');
      setSaving(false);
    }
  }

  return (
    <AuthLayout
      title="Crie sua senha"
      subtitle="Você entrou por um link seguro. Defina uma senha para acessar o plim quando quiser."
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Input
          label="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres, com uma letra e um número."
          autoFocus
        />
        <Input
          label="Confirmar senha"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <Button type="submit" block disabled={saving || !password || !confirm}>
          {saving ? 'Salvando…' : 'Salvar senha e continuar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
