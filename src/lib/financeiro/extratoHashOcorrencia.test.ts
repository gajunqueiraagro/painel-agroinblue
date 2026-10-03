/**
 * PR-CONC-IMPORT-BANCO-01B — a identidade do movimento ganhou a OCORRÊNCIA, só da 2ª em diante.
 *
 * ⚠ OS HASHES DO FIXTURE SÃO REAIS (extratos vivos do Bradesco do Agnaldo, set/26, lidos do proto em 03/10): a 1ª
 *   ocorrência tem de dar EXATAMENTE o hash gravado — senão a reimportação de todo arquivo antigo viraria "movimento novo".
 * ⚠ O CASO QUE DERRUBOU O LOTE: dois "RENTAB.INVEST FACILCRED*" de 0,13 no mesmo dia, mesmo documento, no CSV de set/26.
 */
import { describe, it, expect } from 'vitest';
import { hashMovimento, hashesDoArquivo } from './extratoHash';

const CONTA = '186a093b-0204-4164-95e3-0dd247457ffa';
const REAIS = [
  { data: '2026-09-01', valor: 200000, descricao: 'TRANSF AUTORIZ ENTRE AGS', documento: '3520230',
    hash: 'c4c45670dafc443f0be97bc81e677e090661941db6df557e445ad56ab5b7018a' },
  { data: '2026-09-01', valor: 94595, descricao: 'TRANSF AUTORIZ ENTRE AGS', documento: '3520138',
    hash: '6f0068ad9bff0ca36c0729cf3df787b3664636b10502fe6512a1d5bea4f619d3' },
  { data: '2026-09-01', valor: -46.1, descricao: 'PIX ENVIADO', documento: '8213426',
    hash: '73722c664d92a9f2a8b713f7c4cf8ade5baf2662a7e4ccbff2c6d98f3dad63d3' },
];
const RENTAB = { data: '2026-09-29', valor: 0.13, descricao: 'RENTAB.INVEST FACILCRED*', documento: '3709291' };

describe('hash da ocorrência', () => {
  it('a 1ª ocorrência é o hash de sempre — igual ao gravado no banco (3 extratos reais)', async () => {
    for (const r of REAIS) {
      expect(await hashMovimento({ contaBancariaId: CONTA, dataISO: r.data, valor: r.valor, descricao: r.descricao, documento: r.documento }))
        .toBe(r.hash);
      expect(await hashMovimento({ contaBancariaId: CONTA, dataISO: r.data, valor: r.valor, descricao: r.descricao, documento: r.documento, ocorrencia: 1 }))
        .toBe(r.hash);
    }
    expect(await hashesDoArquivo(CONTA, REAIS)).toEqual(REAIS.map((r) => r.hash));
  });

  it('dois movimentos idênticos no mesmo arquivo: dois hashes diferentes, o 1º é o de sempre', async () => {
    const [a, b] = await hashesDoArquivo(CONTA, [RENTAB, RENTAB]);
    const sozinho = await hashMovimento({ contaBancariaId: CONTA, dataISO: RENTAB.data, valor: RENTAB.valor, descricao: RENTAB.descricao, documento: RENTAB.documento });
    expect(a).toBe(sozinho);
    expect(b).not.toBe(a);
  });

  it('três idênticos: três hashes diferentes', async () => {
    const hs = await hashesDoArquivo(CONTA, [RENTAB, RENTAB, RENTAB]);
    expect(new Set(hs).size).toBe(3);
  });

  it('a ocorrência é contada entre CONTEÚDO idêntico, na ordem do arquivo — outro movimento no meio não muda nada', async () => {
    const [a1, outro, a2] = await hashesDoArquivo(CONTA, [RENTAB, REAIS[2], RENTAB]);
    const [b1, b2] = await hashesDoArquivo(CONTA, [RENTAB, RENTAB]);
    expect([a1, a2]).toEqual([b1, b2]);
    expect(outro).toBe(REAIS[2].hash);
  });

  it('reimportar o mesmo arquivo dá os mesmos hashes (não duplica)', async () => {
    const arquivo = [RENTAB, ...REAIS, RENTAB];
    expect(await hashesDoArquivo(CONTA, arquivo)).toEqual(await hashesDoArquivo(CONTA, arquivo));
  });
});
