import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ghostInverse';
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', block = false, children, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, block ? 'btn--block' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
