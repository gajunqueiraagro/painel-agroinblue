/**
 * FOLHA-NA-CAIXA-01 — o md5 de um arquivo NO NAVEGADOR (o Web Crypto não tem md5). O banco usa o md5 como CHAVE: do documento do contador
 * (o "já aplicado" e o desfazer da `fn_folha_recibos_aplicar`) e de cada pedaço. Puro, sem dependência; conferido contra o do Node no teste.
 */
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(entrada: ArrayBuffer | Uint8Array): string {
  const dados = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const n = dados.length;
  const total = (((n + 8) >>> 6) + 1) * 64;
  const msg = new Uint8Array(total);
  msg.set(dados);
  msg[n] = 0x80;
  const bits = n * 8;
  const v = new DataView(msg.buffer);
  v.setUint32(total - 8, bits >>> 0, true);
  v.setUint32(total - 4, Math.floor(bits / 2 ** 32) >>> 0, true);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let o = 0; o < total; o += 64) {
    for (let j = 0; j < 16; j++) M[j] = v.getUint32(o + j * 4, true);
    let A = a0; let B = b0; let C = c0; let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number; let g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const x = (A + F + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((w, i) => out.setUint32(i * 4, w, true));
  return Array.from(new Uint8Array(out.buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
