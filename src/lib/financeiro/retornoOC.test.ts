/**
 * OC-HOMOLOG-FIX-02 — o instantaneo da ida e volta da OC leva "Data por", "Mostrar sem caixa" e Cultura.
 * ⚠ O CASO QUE IMPORTA E' O DA TELA: Competencia + sem caixa ligado tem de voltar Competencia + sem caixa ligado,
 * e nao o padrao (Financeira, desligado) — era a diferenca entre 3 e 2 lancamentos no NJ.
 */
import { describe, it, expect } from 'vitest';
import type { DimensaoDataFinanceiro } from './filtrosBaseV2';
import { CHAVE_RETORNO_OC, chaveRetornoOC, chipsVindosDaOC, extrasDoRetornoOC, type ExtrasRetornoOC } from './retornoOC';

/** O que o FinanceiroV2Tab grava e le': JSON pelo sessionStorage. */
const idaEVolta = (o: object): unknown => {
  sessionStorage.setItem(CHAVE_RETORNO_OC, JSON.stringify(o));
  const raw = sessionStorage.getItem(CHAVE_RETORNO_OC);
  sessionStorage.removeItem(CHAVE_RETORNO_OC);
  return raw ? JSON.parse(raw) : null;
};

describe('extrasDoRetornoOC', () => {
  it('os tres campos atravessam a ida e volta, fora do padrao', () => {
    const extras: ExtrasRetornoOC = { dataPor: 'competencia', mostrarSemCaixa: true, culturaFiltro: 'cult-1' };
    const f = idaEVolta({ fazendaId: '__all__', produtoFiltro: 'Abate', mesesSelecionados: ['08'], ...extras });
    expect(extrasDoRetornoOC(f)).toEqual(extras);
  });

  it('o padrao tambem volta: desligar a chave e escolha que o instantaneo carrega', () => {
    const f = idaEVolta({ dataPor: 'financeira', mostrarSemCaixa: false, culturaFiltro: '__all__' });
    expect(extrasDoRetornoOC(f)).toEqual({ dataPor: 'financeira', mostrarSemCaixa: false, culturaFiltro: '__all__' });
  });

  it('instantaneo gravado antes deste PR (sem os campos) nao inventa nada', () => {
    expect(extrasDoRetornoOC(idaEVolta({ fazendaId: 'f1', produtoFiltro: 'Abate' }))).toEqual({});
  });

  it('valor de tipo errado fica de fora, campo a campo', () => {
    expect(extrasDoRetornoOC({ dataPor: 'semana', mostrarSemCaixa: 'true', culturaFiltro: 7 })).toEqual({});
    expect(extrasDoRetornoOC({ dataPor: 'pagamento', mostrarSemCaixa: 1 })).toEqual({ dataPor: 'pagamento' });
  });

  it('nada que nao seja objeto', () => {
    expect(extrasDoRetornoOC(null)).toEqual({});
    expect(extrasDoRetornoOC('competencia')).toEqual({});
    expect(extrasDoRetornoOC([{ dataPor: 'competencia' }])).toEqual({});
  });

  it('as quatro dimensoes sao aceitas', () => {
    const dimensoes: DimensaoDataFinanceiro[] = ['financeira', 'competencia', 'vencimento', 'pagamento'];
    for (const d of dimensoes) {
      expect(extrasDoRetornoOC({ dataPor: d }).dataPor).toBe(d);
    }
  });
});

describe('P94 — o instantaneo da OC e\' do cliente', () => {
  it('a chave leva o cliente: o do A nunca e\' o do B', () => {
    expect(chaveRetornoOC('cli-a')).toBe(`${CHAVE_RETORNO_OC}:cli-a`);
    expect(chaveRetornoOC('cli-a')).not.toBe(chaveRetornoOC('cli-b'));
  });
});

describe('P94 — chipsVindosDaOC', () => {
  it('o que a OC trouxe fora do padrao vira chip; o padrao nao', () => {
    expect(chipsVindosDaOC({ dataPor: 'competencia', mostrarSemCaixa: true }, { dataPor: 'competencia', mostrarSemCaixa: true }))
      .toEqual([{ campo: 'dataPor', texto: 'Vindo da OC: Data por = Competência' }, { campo: 'semCaixa', texto: 'Vindo da OC: Sem caixa = Mostrar' }]);
    expect(chipsVindosDaOC({ dataPor: 'financeira', mostrarSemCaixa: false }, { dataPor: 'financeira', mostrarSemCaixa: false })).toEqual([]);
  });
  it('trocou na barra: o chip sai', () => {
    expect(chipsVindosDaOC({ dataPor: 'competencia' }, { dataPor: 'vencimento', mostrarSemCaixa: false })).toEqual([]);
  });
});
