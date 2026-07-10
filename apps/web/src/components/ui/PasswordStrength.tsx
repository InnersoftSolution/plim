import './ui.css';

interface PasswordStrengthProps {
  value: string;
}

interface Strength {
  /** Quantos segmentos preencher (1–4). */
  level: 1 | 2 | 3 | 4;
  label: string;
  className: string;
}

/**
 * Força só para feedback visual no front. A regra mínima de verdade
 * (≥8, letras e números) é validada pelo schema/back, não aqui.
 */
function evaluate(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { level: 1, label: 'Fraca', className: 'pw--weak' };
  if (score === 2) return { level: 2, label: 'Média', className: 'pw--fair' };
  if (score === 3) return { level: 3, label: 'Boa', className: 'pw--good' };
  return { level: 4, label: 'Forte', className: 'pw--strong' };
}

export function PasswordStrength({ value }: PasswordStrengthProps) {
  if (!value) return null;
  const { level, label, className } = evaluate(value);

  return (
    <div className={`pw-strength ${className}`} aria-live="polite">
      <div className="pw-strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={'pw-strength__bar' + (i <= level ? ' pw-strength__bar--on' : '')} />
        ))}
      </div>
      <span className="pw-strength__label">
        Força: <strong>{label}</strong>
      </span>
    </div>
  );
}
