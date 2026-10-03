/**
 * PR-CONC-IMPORT-BANCO-01B — a frase do resultado da gravação (D3) e a leitura do retorno de `fn_extrato_importar_arquivo`.
 * O comportamento do banco (atômico, dedupe pelos dois índices, sem cabeçalho quando nada entra) é provado em
 * `supabase/tests/conc_import_banco_01b_test.sql`; aqui, o que a tela escreve com o que ele devolve.
 */
import { describe, it, expect } from 'vitest';
import { lerRetornoImportacao, textoDoResultadoDaImportacao } from './importacaoExtratoResultado';

describe('a frase do resultado', () => {
  it('"já importado" SÓ quando nada entrou', () => {
    expect(textoDoResultadoDaImportacao(0, 110)).toBe('Extrato já importado anteriormente. Nenhuma movimentação nova foi encontrada.');
    expect(textoDoResultadoDaImportacao(1, 109)).not.toMatch(/já importado/);
  });
  it('metade nova: "N importados · M já existiam"', () => {
    expect(textoDoResultadoDaImportacao(55, 55)).toBe('55 importados · 55 já existiam');
    expect(textoDoResultadoDaImportacao(1, 1)).toBe('1 importado · 1 já existia');
  });
  it('tudo novo: só quantos entraram', () => {
    expect(textoDoResultadoDaImportacao(110, 0)).toBe('110 importados');
    expect(textoDoResultadoDaImportacao(2000, 0)).toBe('2.000 importados');
  });
});

describe('o retorno do banco, lido sem cast', () => {
  it('reimportação: 0 inseridos, nenhum cabeçalho, os pulados contados', () => {
    const r = lerRetornoImportacao({ ok: true, importacao_id: null, inseridos: 0, ids: [],
      pulados: [{ indice: 0, hash: 'a', motivo: 'hash' }, { indice: 1, hash: 'b', motivo: 'chave_natural' }] });
    expect(r).toEqual({ ok: true, frase: null, importacaoId: null, inseridos: 0, pulados: 2, ids: [] });
    expect(textoDoResultadoDaImportacao(r.inseridos, r.pulados)).toMatch(/já importado/);
  });
  it('dois idênticos entram os dois: dois ids, um por hash', () => {
    const r = lerRetornoImportacao({ ok: true, importacao_id: 'imp', inseridos: 2, pulados: [],
      ids: [{ hash: 'h', id: '1' }, { hash: 'h#2', id: '2' }] });
    expect(r.inseridos).toBe(2);
    expect(r.ids).toHaveLength(2);
  });
  it('recusa escrita pelo banco chega com a frase', () => {
    const r = lerRetornoImportacao({ ok: false, motivo: 'conta_de_outro_cliente', frase: 'A conta bancária selecionada não pertence ao cliente atual.' });
    expect(r.ok).toBe(false);
    expect(r.frase).toBe('A conta bancária selecionada não pertence ao cliente atual.');
  });
  it('forma inesperada vira o neutro, nunca exceção', () => {
    expect(lerRetornoImportacao(null).ok).toBe(false);
    expect(lerRetornoImportacao({ ok: true, ids: [{ hash: 1 }], pulados: 'x' })).toMatchObject({ ids: [], pulados: 0 });
  });
});
