import { useId, type ReactNode } from 'react';
import './ui.css';

interface SelectOption {
  value: string;
  label: ReactNode;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  error?: string;
  hint?: string;
  /** Elemento extra à direita do rótulo (ex.: botão de ajuda ⓘ). */
  labelAccessory?: ReactNode;
}

/** Select nativo estilizado — reutilizável (onboarding, e futuras telas). */
export function Select({ label, value, onChange, options, placeholder, error, hint, labelAccessory }: SelectProps) {
  const id = useId();
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
        {labelAccessory}
      </label>
      <select
        id={id}
        className="field__select"
        value={value}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
