import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cifragem simétrica para segredos guardados no banco (tokens do Google).
 * AES-256-GCM: confidencialidade + integridade (a tag detecta adulteração).
 * A chave vem de env (CALENDAR_TOKEN_KEY), 32 bytes em base64 ou hex, e NUNCA
 * sai do backend. Formato do texto cifrado: "iv.tag.dados" (todos em base64url).
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

/** Lê a chave de 32 bytes de uma string base64 (44 chars) ou hex (64 chars). */
export function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  } else {
    key = Buffer.from(trimmed, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(
      'CALENDAR_TOKEN_KEY inválida: precisa de 32 bytes (base64 de 44 caracteres ou hex de 64).',
    );
  }
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [b64url(iv), b64url(tag), b64url(data)].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Texto cifrado em formato inválido.');
  const [iv, tag, data] = parts.map(fromB64url) as [Buffer, Buffer, Buffer];
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Assinatura HMAC-SHA256 para o parâmetro `state` do OAuth. Não é segredo, mas
 * precisa ser inviolável: o callback confia no user_id que vem no state, então
 * ele é assinado com a mesma chave e verificado em tempo constante.
 */
export function signState(payload: string, key: Buffer): string {
  const sig = createHmac('sha256', key).update(payload).digest();
  return `${b64url(Buffer.from(payload, 'utf8'))}.${b64url(sig)}`;
}

export function verifyState(signed: string, key: Buffer): string | null {
  const parts = signed.split('.');
  if (parts.length !== 2) return null;
  const payload = fromB64url(parts[0]!).toString('utf8');
  const expected = createHmac('sha256', key).update(payload).digest();
  const given = fromB64url(parts[1]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return payload;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
