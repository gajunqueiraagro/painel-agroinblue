import { describe, it, expect } from 'vitest';
import { aplicarEnriquecimentoOC, type EnriquecimentoOC } from './enriquecerMovimentosOC';
import type { Lancamento } from '@/types/cattle';

// Fábrica mínima de Lancamento para os testes (só os campos usados pelo enriquecimento).
const mk = (over: Partial<Lancamento>): Lancamento => ({
  id: 'x', tipo: 'compra', quantidade: 7, categoria: 'garrotes' as Lancamento['categoria'],
  data: '2026-06-20', fazendaId: 'f1',
  ...over,
} as Lancamento);

describe('aplicarEnriquecimentoOC — enriquecimento de leitura de movimentos OC', () => {
  it('LEGADO não-OC (fora do mapa) → intacto', () => {
    const legado = mk({ id: 'leg1', valorTotal: 450000, fornecedorId: 'forn-legado' });
    const out = aplicarEnriquecimentoOC([legado], new Map());
    expect(out[0]).toBe(legado);   // mesma referência: não tocado
  });

  it('LEGADO com dados já preenchidos, mesmo presente no mapa → NÃO sobrescreve', () => {
    const l = mk({ id: 'leg2', valorTotal: 100000, fornecedorId: 'forn-x' });
    const mapa = new Map<string, EnriquecimentoOC>([['leg2', {
      fornecedorId: 'contraparte', fornecedorNome: 'Outro', valorLote: 27062.5, qtdLote: 7, criterio: 'total',
    }]]);
    const out = aplicarEnriquecimentoOC([l], mapa);
    expect(out[0].valorTotal).toBe(100000);
    expect(out[0].fornecedorId).toBe('forn-x');
  });

  it('OC c472c062 (7 garrotes, sem peso) → fornecedor Carlinhos/Silvana e valor 27.062,50; sem R$/@', () => {
    const oc = mk({ id: 'c472c062', quantidade: 7, valorTotal: 0 });
    const mapa = new Map<string, EnriquecimentoOC>([['c472c062', {
      fornecedorId: '4b02d562', fornecedorNome: 'Carlinhos (Silvana)', valorLote: 27062.5, qtdLote: 7, criterio: 'total',
    }]]);
    const [r] = aplicarEnriquecimentoOC([oc], mapa);
    expect(r.fornecedorId).toBe('4b02d562');
    expect(r.fornecedorNomeSnapshot).toBe('Carlinhos (Silvana)');
    expect(r.valorTotal).toBeCloseTo(27062.5, 2);
    expect(r.precoArroba == null || r.precoArroba === 0).toBe(true);   // sem peso → sem R$/@
  });

  it('OC com peso físico → calcula R$/@ (precoArroba = valor / arrobas)', () => {
    // Compra: arrobas = (pesoMedioKg / 30) × qtd = (300/30) × 7 = 70 @  (peso vivo, divisor 30)
    const oc = mk({ id: 'ocpeso', quantidade: 7, valorTotal: 0, pesoMedioKg: 300 });
    const mapa = new Map<string, EnriquecimentoOC>([['ocpeso', {
      fornecedorId: 'c', fornecedorNome: 'Forn', valorLote: 27062.5, qtdLote: 7, criterio: 'total',
    }]]);
    const [r] = aplicarEnriquecimentoOC([oc], mapa);
    expect(r.valorTotal).toBeCloseTo(27062.5, 2);
    expect(r.precoArroba).toBeCloseTo(27062.5 / 70, 2);
  });

  it('PRORRATEIO: lote com 14 cab e movimento de 7 → metade do valor', () => {
    const oc = mk({ id: 'ocprop', quantidade: 7, valorTotal: 0 });
    const mapa = new Map<string, EnriquecimentoOC>([['ocprop', {
      fornecedorId: 'c', fornecedorNome: 'Forn', valorLote: 27062.5, qtdLote: 14, criterio: 'total',
    }]]);
    const [r] = aplicarEnriquecimentoOC([oc], mapa);
    expect(r.valorTotal).toBeCloseTo(27062.5 * (7 / 14), 2);   // 13.531,25
  });

  it('critério ≠ total → não fabrica valor (evita interpretar valor_informado como total)', () => {
    const oc = mk({ id: 'occrit', quantidade: 7, valorTotal: 0 });
    const mapa = new Map<string, EnriquecimentoOC>([['occrit', {
      fornecedorId: 'c', fornecedorNome: 'Forn', valorLote: 100, qtdLote: 7, criterio: 'cabeca',
    }]]);
    const [r] = aplicarEnriquecimentoOC([oc], mapa);
    expect(r.valorTotal == null || r.valorTotal === 0).toBe(true);
    expect(r.fornecedorId).toBe('c');   // fornecedor ainda enriquecido
  });
});
