/** Utilidades de documento e endereço (BR). Puras — usadas no back (validação) e no front (máscara). */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Valida CNPJ (14 dígitos + dígitos verificadores). Ignora pontuação. */
export function isValidCnpj(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // rejeita 000…, 111…, etc.

  const digit = (base: string): number => {
    const len = base.length;
    let sum = 0;
    let pos = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(base[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const d1 = digit(c.slice(0, 12));
  const d2 = digit(c.slice(0, 12) + d1);
  return c.slice(12) === `${d1}${d2}`;
}

/** Formata dígitos → 00.000.000/0000-00. Se incompleto, devolve o que der. */
export function formatCnpj(value: string): string {
  const c = onlyDigits(value).slice(0, 14);
  let out = c.slice(0, 2);
  if (c.length > 2) out += '.' + c.slice(2, 5);
  if (c.length > 5) out += '.' + c.slice(5, 8);
  if (c.length > 8) out += '/' + c.slice(8, 12);
  if (c.length > 12) out += '-' + c.slice(12, 14);
  return out;
}

/** Formata dígitos → 00000-000 (CEP). */
export function formatCep(value: string): string {
  const c = onlyDigits(value).slice(0, 8);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Formata telefone BR: (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular). */
export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
