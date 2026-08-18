import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './ui.css';
import './select.css';

/**
 * Seleção do Plim.
 *
 * Era um <select> nativo estilizado: a caixa era nossa, mas a lista que abria
 * era a do sistema operacional, com fonte, cores e cantos do macOS ou do
 * Android no meio de uma tela que é toda do Plim. Aqui a lista também é
 * nossa, e por isso o teclado precisa ser reimplementado à mão: setas andam,
 * Enter e espaço escolhem, Esc fecha e devolve o foco ao botão, Tab sai sem
 * escolher. Sem isso, trocar o nativo seria trocar acessibilidade por
 * estética, o que não vale.
 *
 * A API é a mesma de antes (label, placeholder, error, hint, labelAccessory),
 * então as telas que já usavam continuam iguais.
 */

interface SelectOption {
  value: string;
  label: ReactNode;
  /** Linha secundária dentro da opção (ex.: contagem, explicação curta). */
  hint?: string;
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
  /**
   * 'field' (padrão) = campo de formulário, com rótulo visível.
   * 'pill' = controle compacto da própria tela (ano, período), sem rótulo.
   */
  variant?: 'field' | 'pill';
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  labelAccessory,
  variant = 'field',
}: SelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Lado e altura da lista, calculados na abertura. */
  const [pos, setPos] = useState<{ up: boolean; max: number }>({ up: false, max: 300 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Placeholder é a primeira opção, com valor vazio.
  const lista: SelectOption[] =
    placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : [...options];
  const selecionado = lista.find((o) => o.value === value);
  const textoBotao = selecionado?.label ?? placeholder ?? '';
  const vazio = value === '' && placeholder !== undefined;

  // Clique fora fecha: lista aberta não pode ficar flutuando pela tela.
  useEffect(() => {
    if (!open) return;
    const fora = (ev: PointerEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [open]);

  // Abriu: decide o lado e a altura pelo espaço que sobra, e leva o foco para
  // a lista. Sem isso, um campo perto do rodapé abre uma lista cortada pela
  // borda da tela, justamente no celular.
  useEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const abaixo = window.innerHeight - r.bottom - 12;
      const acima = r.top - 12;
      const paraCima = abaixo < 200 && acima > abaixo;
      setPos({ up: paraCima, max: Math.max(150, Math.min(300, paraCima ? acima : abaixo)) });
    }
    setActive(Math.max(0, lista.findIndex((o) => o.value === value)));
    listRef.current?.focus();
    // lista é recriada a cada render; o gatilho é abrir, não a identidade dela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  function escolher(v: string) {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  }

  function teclas(ev: React.KeyboardEvent) {
    if (ev.key === 'Escape' || ev.key === 'Tab') {
      setOpen(false);
      if (ev.key === 'Escape') btnRef.current?.focus();
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const passo = ev.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + passo + lista.length) % lista.length);
      return;
    }
    if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      setActive(ev.key === 'Home' ? 0 : lista.length - 1);
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const opt = lista[active];
      if (opt) escolher(opt.value);
    }
  }

  const controle = (
    <div className={`sel sel--${variant}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={btnRef}
        className={'sel__btn' + (vazio ? ' is-placeholder' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={!!error}
        {...(variant === 'pill' ? { 'aria-label': label } : { 'aria-labelledby': `${id}-lab ${id}` })}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="sel__value">{textoBotao}</span>
        <svg className="sel__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          className={'sel__list' + (pos.up ? ' sel__list--up' : '')}
          style={{ maxHeight: pos.max }}
          ref={listRef}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={teclas}
        >
          {lista.map((o, i) => {
            const escolhido = o.value === value;
            return (
              <li
                key={o.value || '__placeholder__'}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={escolhido}
                className={
                  'sel__opt' + (escolhido ? ' is-on' : '') + (i === active ? ' is-active' : '')
                }
                onPointerEnter={() => setActive(i)}
                onClick={() => escolher(o.value)}
              >
                <span className="sel__check" aria-hidden="true">
                  {escolhido && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="sel__txt">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (variant === 'pill') return controle;

  return (
    <div className={error ? 'field field--error' : 'field'}>
      <span className="field__label" id={`${id}-lab`}>
        {label}
        {labelAccessory}
      </span>
      {controle}
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
