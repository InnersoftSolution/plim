/**
 * Valor em centavos → por extenso, em português.
 *
 * Existe por um motivo concreto: o campo de valor lê o que a pessoa digita como
 * REAIS ("3200" = R$ 3.200,00), enquanto os apps de banco leem como CENTAVOS
 * (lá "3200" = R$ 32,00). Quem tem o hábito do banco digita dígitos demais e
 * cadastra milhões sem perceber, e "R$ 3.200.000,00" e "R$ 3.200,00" são
 * parecidos demais para o olho pegar a diferença.
 *
 * Por extenso não tem como confundir: "três milhões e duzentos mil reais" e
 * "três mil e duzentos reais" são frases diferentes.
 */

const UNIDADES = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
];
const DEZENAS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta',
  'oitenta', 'noventa',
];
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

/** 0 a 999 por extenso. */
function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]!);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]!);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!);
    }
  }
  return partes.join(' e ');
}

const ESCALAS: [number, string, string][] = [
  [1_000_000_000, 'bilhão', 'bilhões'],
  [1_000_000, 'milhão', 'milhões'],
  [1_000, 'mil', 'mil'],
];

/** Número inteiro por extenso (até bilhões). */
function inteiroExtenso(n: number): string {
  if (n === 0) return 'zero';
  const partes: string[] = [];
  let resto = n;
  for (const [valor, singular, plural] of ESCALAS) {
    const quantos = Math.floor(resto / valor);
    if (quantos > 0) {
      // "mil" não leva "um" na frente: mil reais, não um mil reais.
      const prefixo = valor === 1_000 && quantos === 1 ? '' : `${inteiroExtenso(quantos)} `;
      partes.push(`${prefixo}${quantos === 1 ? singular : plural}`.trim());
      resto %= valor;
    }
  }
  if (resto > 0) partes.push(ate999(resto));
  // "e" antes da última parte só quando ela é pequena ou redonda, como se fala:
  // "três mil e duzentos", mas "três mil duzentos e cinquenta e quatro".
  if (partes.length < 2) return partes.join('');
  const ultima = partes[partes.length - 1]!;
  const inicio = partes.slice(0, -1).join(', ');
  const juntaComE = resto === 0 || resto < 100 || resto % 100 === 0;
  return `${inicio}${juntaComE ? ' e ' : ' '}${ultima}`;
}

/**
 * "três mil e duzentos reais e cinquenta centavos".
 * Devolve string vazia para valor nulo ou zero, para a interface não mostrar
 * nada enquanto o campo está vazio.
 */
export function extensoReais(cents: number | null): string {
  if (cents == null || cents <= 0) return '';
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partes: string[] = [];
  if (reais > 0) partes.push(`${inteiroExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  if (centavos > 0) {
    partes.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return partes.join(' e ');
}
