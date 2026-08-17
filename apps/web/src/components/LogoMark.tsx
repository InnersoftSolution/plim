/**
 * Símbolo do plim (sem o wordmark): o ponto que assenta e o arco que ressoa.
 * Branding Book v1.0, página "Símbolo". Usado onde não cabe a marca inteira,
 * como o menu lateral recolhido e o favicon.
 */
interface LogoMarkProps {
  size?: number;
  color?: string;
}

export function LogoMark({ size = 28, color = '#7C4FE0' }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      /* recorte justo ao desenho (o arco nasce deslocado no viewBox original),
         para o símbolo ficar opticamente centrado na caixa */
      viewBox="2 8 41 41"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="plim.work"
    >
      <circle cx="22" cy="28" r="9" fill={color} />
      <circle
        cx="22"
        cy="28"
        r="17"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeDasharray="36 71"
        transform="rotate(-80 22 28)"
      />
    </svg>
  );
}
