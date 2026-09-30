/**
 * PR-CONC-CRIAR-LOTE-LAYOUT-01 — o extrato é lido no charset que declara.
 *
 * ⚠ BYTES REAIS: "Compra com Cartão" em Latin-1 tem o `ã` como o byte 0xE3 — que em UTF-8 é o começo de uma sequência
 *   de 3 bytes, inválida aqui. Era esse byte que o `.text()` trocava por U+FFFD ("Cart�o", o print do BB).
 */
import { describe, it, expect } from 'vitest';
import { decodificarExtrato, charsetDeclarado } from './decodificarExtrato';
import { parseOFX } from './parseOFX';

/** Latin-1 byte a byte: cada caractere até U+00FF vira o byte do seu código. */
const latin1 = (s: string): ArrayBuffer => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
};
const utf8 = (s: string): ArrayBuffer => {
  const u = new TextEncoder().encode(s);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
};

const CABECALHO_BB = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\n\n';
const CORPO = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-31.80<FITID>202609011318000<MEMO>Compra com Cartão - 01/09 11:25 FRADELLI</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902<TRNAMT>-89.90<FITID>202609021990000<MEMO>Pagto Energia Elétrica - Prestação Consórcio</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('decodificarExtrato', () => {
  it('OFX do BB (CHARSET:1252) em bytes Latin-1: acento inteiro, nenhum U+FFFD', () => {
    const txt = decodificarExtrato(latin1(CABECALHO_BB + CORPO));
    expect(txt).toContain('Compra com Cartão - 01/09');
    expect(txt).toContain('Energia Elétrica - Prestação Consórcio');
    expect(txt).not.toContain('�');
    // e o parser entrega a descrição certa para o hash e para a tela
    expect(parseOFX(txt).map((m) => m.descricao)).toEqual([
      'Compra com Cartão - 01/09 11:25 FRADELLI', 'Pagto Energia Elétrica - Prestação Consórcio',
    ]);
  });

  it('o mesmo arquivo pelo caminho antigo (UTF-8 à força) é que dava "Cart\\uFFFDo" — a prova de que o teste mede', () => {
    expect(new TextDecoder('utf-8').decode(latin1(CABECALHO_BB + CORPO))).toContain('Cart�o');
  });

  it('a DECLARAÇÃO manda mesmo quando os bytes 1252 também formam UTF-8 válido ("Ã©" = C3 A9 = "é" em UTF-8)', () => {
    /* Sem olhar o CHARSET, o fallback "UTF-8 se válido" leria C3 A9 como "é" — e o texto do banco seria outro. */
    expect(decodificarExtrato(latin1('CHARSET:1252\n<MEMO>LOJA Ã©LITE'))).toContain('<MEMO>LOJA Ã©LITE');
  });

  it('ISO-8859-1 declarado: lido como 1252', () => {
    expect(decodificarExtrato(latin1('CHARSET:ISO-8859-1\n' + 'Transferência'))).toContain('Transferência');
  });

  it('UTF-8 declarado e válido: UTF-8', () => {
    expect(decodificarExtrato(utf8('ENCODING:UTF-8\nCHARSET:NONE\n<MEMO>Pedágio São José'))).toContain('Pedágio São José');
  });

  it('OFX 2.x (<?xml encoding="UTF-8"?>): UTF-8', () => {
    expect(decodificarExtrato(utf8('<?xml version="1.0" encoding="UTF-8"?>\n<MEMO>Água'))).toContain('<MEMO>Água');
  });

  it('declarado UTF-8, mas os bytes são Latin-1: 1252 (o arquivo mente; o substituto seria perda)', () => {
    const txt = decodificarExtrato(latin1('ENCODING:UTF-8\n<MEMO>Cobrança'));
    expect(txt).toContain('Cobrança');
    expect(txt).not.toContain('�');
  });

  it('nada declarado (CSV): UTF-8 se válido, senão 1252', () => {
    expect(decodificarExtrato(utf8('data;historico\n01/09;Crédito'))).toContain('Crédito');
    expect(decodificarExtrato(latin1('data;historico\n01/09;Crédito'))).toContain('Crédito');
  });
});

describe('charsetDeclarado', () => {
  it.each([
    ['CHARSET:1252', 'windows-1252'],
    ['ENCODING:USASCII\nCHARSET:1252', 'windows-1252'],
    ['CHARSET:ISO-8859-1', 'windows-1252'],
    ['ENCODING:UTF-8', 'utf-8'],
    ['<?xml version="1.0" encoding="utf-8"?>', 'utf-8'],
    ['ENCODING:USASCII\nCHARSET:NONE', null],
    ['data;historico', null],
  ])('%j → %s', (cab, esperado) => expect(charsetDeclarado(cab)).toBe(esperado));
});
