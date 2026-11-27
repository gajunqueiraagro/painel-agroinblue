/** FOLHA-NA-CAIXA-01 — o md5 do navegador é o MESMO do Node (o banco compara as duas chaves). */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { md5 } from './md5';

const doNode = (b: Uint8Array) => createHash('md5').update(b).digest('hex');
const texto = (s: string) => new TextEncoder().encode(s);

describe('md5', () => {
  it('os vetores do RFC 1321', () => {
    expect(md5(texto(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5(texto('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5(texto('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });
  it('igual ao do Node em todos os tamanhos da borda do bloco (55, 56, 63, 64, 65…) e num arquivo de 1 MB', () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
      expect(md5(b)).toBe(doNode(b));
    }
    const grande = Uint8Array.from({ length: 1 << 20 }, (_, i) => (i * 131 + (i >>> 8)) & 255);
    expect(md5(grande.buffer)).toBe(doNode(grande));
  });
});
