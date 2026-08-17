/**
 * Wordmark plim.work em Papel (#F7F5F2) com o ponto violeta, para fundos
 * escuros (Tinta). Branding Book v1.0 (ago 2026): reaproveita a Logo nova
 * trocando só a cor das letras. Não recriar à mão.
 */
import { Logo } from './Logo';

interface LogoWhiteProps {
  height?: number;
}

export function LogoWhite({ height = 28 }: LogoWhiteProps) {
  return <Logo height={height} color="#F7F5F2" />;
}
