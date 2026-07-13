import { useEffect, useMemo, useRef, useState } from 'react';
import './datefield.css';

/**
 * Seletor de data do Plim — substitui o <input type="date"> nativo (feio e
 * inconsistente entre navegadores) por um calendário próprio, coerente com o
 * app. Desktop: popover ancorado ao campo. Mobile: bottom sheet.
 *
 * Trabalha sempre com string "YYYY-MM-DD" em horário local (nunca `new
 * Date(iso)`, que interpreta como UTC e erra o dia).
 */
export interface DateFieldProps {
  label?: string;
  value: string; // YYYY-MM-DD ("" = vazio)
  onChange: (value: string) => void;
  /** Limites opcionais (YYYY-MM-DD). */
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Mostra o botão "Limpar" no rodapé do calendário. */
  clearable?: boolean;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parseISO(s: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}
function todayISO(): string {
  const n = new Date();
  return toISO(n.getFullYear(), n.getMonth(), n.getDate());
}
function formatLong(iso: string): string {
  const p = parseISO(iso);
  if (!p) return '';
  return `${p.d} de ${MONTHS[p.m]} de ${p.y}`;
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = 'Selecionar data',
  disabled,
  clearable,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseISO(value), [value]);
  const today = todayISO();

  // Mês em exibição: o da data escolhida (ou o de hoje).
  const [view, setView] = useState(() => {
    const base = selected ?? parseISO(today)!;
    return { y: base.y, m: base.m };
  });

  // Ao abrir, pula para o mês da data selecionada.
  useEffect(() => {
    if (open) {
      const base = selected ?? parseISO(today)!;
      setView({ y: base.y, m: base.m });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function isDisabled(iso: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }
  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      const y = v.y + Math.floor(m / 12);
      const mm = ((m % 12) + 12) % 12;
      return { y, m: mm };
    });
  }
  function pick(day: number) {
    const iso = toISO(view.y, view.m, day);
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  return (
    <div className="datefield" ref={ref}>
      <button
        type="button"
        className={'datefield__trigger' + (value ? '' : ' is-empty')}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}: ${value ? formatLong(value) : placeholder}` : undefined}
      >
        <span className="datefield__value">{value ? formatLong(value) : placeholder}</span>
        <CalendarIcon />
      </button>

      {open && (
        <>
          <div className="datefield__backdrop" onClick={() => setOpen(false)} />
          <div className="datefield__pop" role="dialog" aria-label={label ?? 'Selecionar data'}>
            <div className="datefield__head">
              <button
                type="button"
                className="datefield__nav"
                onClick={() => shiftMonth(-1)}
                aria-label="Mês anterior"
              >
                <ChevronIcon dir="left" />
              </button>
              <span className="datefield__month">
                {MONTHS[view.m]!.charAt(0).toUpperCase() + MONTHS[view.m]!.slice(1)} de {view.y}
              </span>
              <button
                type="button"
                className="datefield__nav"
                onClick={() => shiftMonth(1)}
                aria-label="Próximo mês"
              >
                <ChevronIcon dir="right" />
              </button>
            </div>

            <div className="datefield__weekdays" aria-hidden="true">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            <div className="datefield__grid">
              {cells.map((day, i) => {
                if (day === null) return <span key={`b${i}`} className="datefield__blank" />;
                const iso = toISO(view.y, view.m, day);
                const isSel = value === iso;
                const isToday = iso === today;
                const off = isDisabled(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    className={
                      'datefield__day' +
                      (isSel ? ' is-selected' : '') +
                      (isToday && !isSel ? ' is-today' : '')
                    }
                    onClick={() => pick(day)}
                    disabled={off}
                    aria-pressed={isSel}
                    aria-label={formatLong(iso)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="datefield__foot">
              {clearable && value && (
                <button
                  type="button"
                  className="datefield__link"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                className="datefield__link datefield__link--strong"
                onClick={() => {
                  if (!isDisabled(today)) {
                    onChange(today);
                    setOpen(false);
                  }
                }}
                disabled={isDisabled(today)}
              >
                Hoje
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}
