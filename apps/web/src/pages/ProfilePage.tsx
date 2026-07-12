import { useState } from 'react';
import { passwordSchema } from '@plim/shared';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import './dashboard.css';

/**
 * Meu perfil: dados pessoais (nome) e troca de senha. O e-mail vem do provedor
 * de autenticacao e nao e alterado por aqui. A senha e trocada direto no
 * Supabase Auth (sessao valida), nunca passa pela nossa API.
 */
export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return <p className="dash-muted">Carregando perfil...</p>;

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Meu perfil</h1>
        <p className="dash-page__subtitle">Seus dados pessoais e acesso à conta.</p>
      </div>

      <PersonalDataPanel />
      <PasswordPanel />
    </div>
  );
}

function PersonalDataPanel() {
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user?.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const dirty = name.trim() !== (user?.fullName ?? '').trim();
  const valid = name.trim().length >= 2;

  async function handleSave() {
    setError('');
    setOk(false);
    if (!valid) {
      setError('Informe seu nome (pelo menos 2 letras).');
      return;
    }
    setSaving(true);
    try {
      await updateName(name.trim());
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Dados pessoais</h2>
      </div>
      {error && <div className="form-error">{error}</div>}
      {ok && <div className="form-ok">Nome atualizado.</div>}
      <div className="prof-fields">
        <Input
          label="Nome"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setOk(false);
          }}
          placeholder="Seu nome"
        />
        <Input label="E-mail" value={user?.email ?? ''} disabled hint="O e-mail não pode ser alterado por aqui." />
      </div>
      <div className="prof-actions">
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </section>
  );
}

function PasswordPanel() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  async function handleSave() {
    setError('');
    setOk(false);
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
      setOk(true);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Senha</h2>
      </div>
      <p className="dash-panel__hint">Use pelo menos 8 caracteres, com uma letra e um número.</p>
      {error && <div className="form-error">{error}</div>}
      {ok && <div className="form-ok">Senha alterada com sucesso.</div>}
      <div className="prof-fields">
        <Input
          label="Nova senha"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setOk(false);
          }}
          autoComplete="new-password"
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="prof-actions">
        <Button onClick={handleSave} disabled={saving || !password || !confirm}>
          {saving ? 'Alterando...' : 'Alterar senha'}
        </Button>
      </div>
    </section>
  );
}
