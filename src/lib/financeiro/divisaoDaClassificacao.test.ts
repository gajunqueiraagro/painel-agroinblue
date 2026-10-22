/**
 * FIN-CLASSIF-DIVIDIDA-01b/01c — as regras puras da tela da classificacao dividida. O molde e' o do mock (sintetico): 18 itens, R$ 9.583,00
 * = R$ 8.528,00 (itens 1–5) + R$ 1.055,00 (itens 6–18).
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
import {
  contasDasPartes, idDoLancamento, percentuaisDosItens, porContaDosItens, porQueNaoDivideOsItens, valorDividido, type ParteGravada,
} from './divisaoDaClassificacao';

const CENT = [154000, 100000, 388800, 120000, 90000, 20000, 3500, 4000, 10000, 11000, 3000, 4000, 4800, 3600, 10400, 10500, 2700, 18000];
const ITENS = CENT.map((liquidoCent, k) => ({ nItem: k + 1, liquidoCent }));
const MAPA = new Map(ITENS.map((i) => [i.nItem, i.nItem <= 5 ? 'inv' : 'man']));

describe('idDoLancamento — REGRA DO ID', () => {
  it('a parte 2+ ("id#2") abre o lancamento; o lancamento_id manda quando vem', () => {
    expect(idDoLancamento({ id: 'abc#2' })).toBe('abc');
    expect(idDoLancamento({ id: 'abc#13' })).toBe('abc');
    expect(idDoLancamento({ id: 'abc' })).toBe('abc');
    expect(idDoLancamento({ id: 'abc#2', lancamento_id: 'xyz' })).toBe('xyz');
  });
});

describe('porContaDosItens / porQueNaoDivideOsItens', () => {
  it('soma por conta na ordem do primeiro item: 8.528,00 (89,0%) + 1.055,00 (11,0%)', () => {
    const r = porContaDosItens(ITENS, MAPA);
    expect(r.map((c) => [c.planoContaId, c.liquidoCent, c.itens])).toEqual([['inv', 852800, 5], ['man', 105500, 13]]);
    expect(r[0].percentual.toFixed(1)).toBe('89.0');
    expect(r[1].percentual.toFixed(1)).toBe('11.0');
  });
  it('item sem conta impede, com a frase; todos na mesma conta tambem; dois ou mais: nada impede', () => {
    const sem = new Map(MAPA); sem.delete(7); sem.delete(9);
    expect(porQueNaoDivideOsItens(ITENS, sem)).toBe('Faltam 2 de 18 itens sem conta. Escolha a conta de cada item.');
    expect(porQueNaoDivideOsItens(ITENS, new Map(ITENS.map((i) => [i.nItem, 'inv'])))).toBe('Todos os itens estão na mesma conta: não há o que dividir.');
    expect(porQueNaoDivideOsItens(ITENS, MAPA)).toBeNull();
  });
  it('percentuais (o cadastro da compra parcelada): somam exatamente 100', () => {
    const p = percentuaisDosItens(porContaDosItens(ITENS, MAPA));
    expect(p.map((x) => x.plano_conta_id)).toEqual(['inv', 'man']);
    const soma = p.reduce((s, x) => s + ('percentual' in x ? x.percentual : 0), 0);
    expect(Math.round(soma * 1e6) / 1e6).toBe(100);
  });
  it('contasDasPartes: a conta de cada item como a divisao gravada deixou', () => {
    const parte = (plano: string, notaItens: number[]): ParteGravada => ({ ordem: 1, valor: 1, percentual: 50, plano_conta_id: plano, subcentro: null,
      centro_custo: null, escopo_negocio: null, origem: 'nota', itens: notaItens.length, notaItens });
    expect([...contasDasPartes([parte('inv', [1, 2]), parte('man', [3])])]).toEqual([[1, 'inv'], [2, 'inv'], [3, 'man']]);
  });
});

describe('valorDividido — a celula da lista (01c)', () => {
  it('filtro pega 1 de 2 partes: a parte, o total e o selo', () => {
    expect(valorDividido({ valor: -9583, valor_parte: 1055, partes_total: 2, partes_casadas: 1 })).toEqual({ parte: 1055, total: 9583, casadas: 1, partes: 2 });
  });
  it('sem filtro de conta (todas casam): sem parte — o valor cheio e o selo "dividido"', () => {
    expect(valorDividido({ valor: 9583, valor_parte: 9583, partes_total: 2, partes_casadas: 2 })).toEqual({ parte: null, total: 9583, casadas: 2, partes: 2 });
  });
  it('sem divisao: nada', () => {
    expect(valorDividido({ valor: 100 })).toBeNull();
    expect(valorDividido({ valor: 100, partes_total: 1 })).toBeNull();
  });
});
