/** FAZENDA-CADASTRO-01 · F1b — a regra do cadastro: histórico legível da trilha, "em uso desde", ponto da sede, UF e o "mudou?" do Salvar. */
import { describe, expect, it } from 'vitest';
import { camposQueMudaram, ehUf, emUsoDesde, historicoDoCadastro, mesAnoBR, oQueMudou, pontoDaSede } from './cadastroDaFazenda';

describe('FAZENDA-CADASTRO-01 · cadastro da fazenda', () => {
  it('histórico: o resumo do banco quando há; senão campo a campo com nome por extenso; colunas sem tela não aparecem; mais novo primeiro', () => {
    const nomes = new Map([['u1', 'Consultor Exemplo']]);
    const h = historicoDoCadastro([
      { created_at: '2026-02-10T10:00:00Z', usuario_id: null, via: 'sistema:notas', acao: 'editou', resumo: 'IE vazia → 28', dados_anteriores: null, dados_novos: null },
      { created_at: '2026-08-22T14:00:00Z', usuario_id: 'u1', acao: 'editou', resumo: null,
        dados_anteriores: { area_total_ha: 260, area_produtiva_ha: 1, updated_at: 'a', car: null },
        dados_novos: { area_total_ha: 264.08, area_produtiva_ha: 2, updated_at: 'b', car: 'MS-1' } },
    ], nomes);
    expect(h).toEqual([
      { quando: '22/08/2026', quem: 'Consultor Exemplo', oQue: 'Área da matrícula: 260,00 ha → 264,08 ha · CAR: vazio → MS-1' },
      { quando: '10/02/2026', quem: 'sistema · notas', oQue: 'IE vazia → 28' },
    ]);
    expect(oQueMudou({ created_at: 'x', usuario_id: null, acao: 'criou', resumo: null, dados_anteriores: null, dados_novos: {} })).toBe('Cadastro criado');
    expect(oQueMudou({ created_at: 'x', usuario_id: null, acao: 'editou', resumo: '', dados_anteriores: { area_pecuaria_ha: 1 }, dados_novos: { area_pecuaria_ha: 2 } }))
      .toBe('Ajuste interno (sem campo da tela)');
  });

  it('em uso desde: a partida do rebanho; sem ela o início mais antigo dos pastos; sem nada "—"', () => {
    expect(emUsoDesde('2024-01', ['2023-05-01'])).toBe('2024-01');
    expect(emUsoDesde(null, [null, '2025-03-01', '2023-07-15'])).toBe('2023-07');
    expect(mesAnoBR(emUsoDesde(null, [null]))).toBe('—');
    expect(mesAnoBR('2024-01')).toBe('01/2024');
  });

  it('sede: só Point vira "lat · long"; UF: só as 27; Salvar: só o campo que mudou', () => {
    expect(pontoDaSede({ type: 'Point', coordinates: [-54.84371, -18.92412] })?.texto).toBe('-18,9241 · -54,8437');
    expect([pontoDaSede({ type: 'Polygon', coordinates: [-54.8, -18.9] }), pontoDaSede(null), pontoDaSede({ type: 'Point', coordinates: ['x', 1] })]).toEqual([null, null, null]);
    expect([ehUf('ms'), ehUf(' SP '), ehUf('Mato Grosso do Sul'), ehUf('')]).toEqual([true, true, false, false]);
    expect(camposQueMudaram({ car: '', ccir: null, nirf: '1' }, { car: '', ccir: '', nirf: '2' })).toEqual(['nirf']);
  });
});
