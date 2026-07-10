import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import './auth.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, backTo, children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <Link to="/login" className="auth-brand" aria-label="plim.work">
        <Logo height={34} />
      </Link>
      <section className="auth-card" aria-label={title}>
        {backTo && (
          <Link to={backTo} className="auth-back">
            <span aria-hidden="true">←</span> Voltar
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}
