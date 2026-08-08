import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseKey, signState, verifyState } from './crypto';

const KEY = randomBytes(32);

describe('crypto (tokens do Google)', () => {
  it('cifra e decifra de volta o mesmo texto', () => {
    const secret = 'ya29.refresh-token-super-secreto';
    const enc = encryptSecret(secret, KEY);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, KEY)).toBe(secret);
  });

  it('cada cifragem usa IV novo (textos cifrados diferentes)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('detecta adulteração (a tag GCM falha)', () => {
    const enc = encryptSecret('segredo', KEY);
    const [iv, tag, data] = enc.split('.');
    // Adultera um byte REAL do texto cifrado: decodifica, inverte o 1º byte e
    // recodifica. Trocar o último caractere do base64url não servia (às vezes só
    // mexe em bits de padding e vira no-op, deixando o teste instável).
    const raw = Buffer.from((data ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    raw[0] = raw[0]! ^ 0xff;
    const tamperedData = raw
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const tampered = [iv, tag, tamperedData].join('.');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('não decifra com a chave errada', () => {
    const enc = encryptSecret('segredo', KEY);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });

  it('parseKey aceita base64 e hex de 32 bytes e recusa tamanho errado', () => {
    expect(parseKey(KEY.toString('base64')).length).toBe(32);
    expect(parseKey(KEY.toString('hex')).length).toBe(32);
    expect(() => parseKey('curta')).toThrow();
  });
});

describe('state assinado (OAuth)', () => {
  it('assina e valida de volta o payload', () => {
    const payload = JSON.stringify({ u: 'user-1', t: 123 });
    const signed = signState(payload, KEY);
    expect(verifyState(signed, KEY)).toBe(payload);
  });

  it('rejeita state adulterado ou de chave errada', () => {
    const signed = signState('a', KEY);
    expect(verifyState(signed + 'x', KEY)).toBeNull();
    expect(verifyState(signed, randomBytes(32))).toBeNull();
  });
});
