import { useId, useState, type InputHTMLAttributes } from 'react';
import './ui.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, type, ...rest }: InputProps) {
  const id = useId();
  const isPassword = type === 'password';
  const [reveal, setReveal] = useState(false);
  const effectiveType = isPassword && reveal ? 'text' : type;

  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <input
          className={isPassword ? 'field__input field__input--with-action' : 'field__input'}
          id={id}
          type={effectiveType}
          aria-invalid={!!error}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="field__reveal"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={reveal}
            tabIndex={-1}
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.92" />
      <path d="M6.06 6.06A13.2 13.2 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 4.06-.94" />
      <path d="m9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
