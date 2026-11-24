/**
 * FORN-CRIAR-DA-NOTA-ERRO — o código do sistema emissor ("1 - ") sai do nome do emitente na LEITURA (XML e DANFE). O XML é o da NF
 * 39.814 na forma (xNome "1 - … LTDA", xFant sem o código), com nome e CNPJ SINTÉTICOS (dado de cliente não entra no repositório).
 */
import { describe, it, expect } from 'vitest';
import { semCodigoDoEmissor } from './nomeDoEmitente';
import { lerNFe } from './lerNFe';
import { montarNFe, utf8 } from './__fixtures__/notas';

describe('semCodigoDoEmissor', () => {
  it.each([
    ['1 - SPEED SINTETICO LTDA', 'SPEED SINTETICO LTDA'],
    ['12 -  AGRO SINTETICA LTDA', 'AGRO SINTETICA LTDA'],
    ['  3 - X', 'X'],
  ])('tira o código: %s', (antes, depois) => expect(semCodigoDoEmissor(antes)).toBe(depois));
  it.each([
    '3M DO BRASIL LTDA', '1-2-3 COMERCIO LTDA', '2001 VIDROS LTDA', 'AUTO POSTO 1 - CENTRO', '12345 - CODIGO GRANDE LTDA', '1 -',
  ])('não mexe: %s', (nome) => expect(semCodigoDoEmissor(nome)).toBe(nome.trim()));
});

describe('a leitura do XML (a forma da NF 39.814)', () => {
  it('o emitente sai sem o "1 - "; a fantasia fica como veio', () => {
    const r = lerNFe(utf8(montarNFe({ nomeEmitente: '1 - PNEUS SINTETICOS LTDA' })));
    if (r.ok === false) throw new Error(r.frase);
    expect(r.nota.emitente.nome).toBe('PNEUS SINTETICOS LTDA');
  });
});
