/* Ícones SVG do dashboard (herdam currentColor). Sem emojis no sistema. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...base}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconCoin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.8h3.2a1.8 1.8 0 0 1 0 3.6H9.5" transform="translate(0 -1)" />
    </svg>
  );
}

export function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M20 9v6h-4a3 3 0 0 1 0-6h4Z" />
    </svg>
  );
}

export function IconRepeat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...base}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M17.5 13.6A6.5 6.5 0 0 1 21.5 20" />
    </svg>
  );
}

export function IconReceipt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...base}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...base}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...base}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
      <path d="M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10" />
      <path d="M3 21h18" />
      <path d="M8 8h2M8 12h2M8 16h2" />
    </svg>
  );
}
