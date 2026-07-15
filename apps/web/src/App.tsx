import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage';
import { SetPasswordPage } from './pages/auth/SetPasswordPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { AcertosPage } from './pages/AcertosPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';
import { HomeRedirect } from './pages/HomeRedirect';
import { SelectCompanyPage } from './pages/SelectCompanyPage';
import { SociedadePage } from './pages/SociedadePage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ChecklistPage } from './pages/ChecklistPage';
import { CategoriasPage } from './pages/CategoriasPage';
import { ContatosPage } from './pages/ContatosPage';
import { ProfilePage } from './pages/ProfilePage';
import { AppShell } from './components/AppShell';
import { ActiveCompanyProvider } from './company/ActiveCompanyContext';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { AdminCompaniesPage } from './admin/AdminCompaniesPage';
import { AdminCompanyDetailPage } from './admin/AdminCompanyDetailPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminUserDetailPage } from './admin/AdminUserDetailPage';
import { POST_AUTH_REDIRECT } from './routes';

function AuthGate() {
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

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthGate />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthGate />;
  if (user) return <Navigate to={POST_AUTH_REDIRECT} replace />;
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
          <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/definir-senha" element={<RequireAuth><SetPasswordPage /></RequireAuth>} />
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route path="/selecionar-empresa" element={<RequireAuth><SelectCompanyPage /></RequireAuth>} />

          {/* Páginas autenticadas dentro do menu (AppShell) */}
          <Route element={<RequireAuth><ActiveCompanyProvider><AppShell /></ActiveCompanyProvider></RequireAuth>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/financeiro" element={<FinancePage />} />
            <Route path="/financeiro/:ano" element={<FinancePage />} />
            <Route path="/acertos" element={<AcertosPage />} />
            <Route path="/acertos/:ano" element={<AcertosPage />} />
            <Route path="/empresa/dados" element={<ConfiguracoesPage />} />
            <Route path="/configuracoes" element={<Navigate to="/empresa/dados" replace />} />
            <Route path="/socios" element={<SociedadePage />} />
            <Route path="/empresa/checklist" element={<ChecklistPage />} />
            <Route path="/empresa/categorias" element={<CategoriasPage />} />
            <Route path="/empresa/contatos" element={<ContatosPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/atividades" element={<ActivitiesPage />} />
          </Route>

          {/* Painel Administrativo interno — layout próprio; permissão validada na API */}
          <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="companies" element={<AdminCompaniesPage />} />
            <Route path="companies/:companyId" element={<AdminCompanyDetailPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
          </Route>

          <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
