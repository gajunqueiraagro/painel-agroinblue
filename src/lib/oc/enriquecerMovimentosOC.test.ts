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

describe('o detalhe do abate — a porta que faltava', () => {
  /* ⚠ O ABATE DA OC NÃO ERA CANDIDATO. O critério do enriquecimento comercial é "sem valor
     e sem fornecedor"; o abate vindo de OC já tem os dois — o líquido é gravado no
     lançamento. O que faltava era o DETALHE (carcaça, preço da @, bônus), que mora em
     `zoo_operacao_abate`. Sem ele, a lista mostrava "—" em REND e P.@ e o modal abria com
     "Valor base R$ 0,00" numa operação de setecentos mil. */
  const abate = (over: Partial<NonNullable<EnriquecimentoOC['abate']>> = {}) => ({
    pesoCarcacaKg: 12260.8, precoArroba: 375,
    bonusPrecoce: 8409.85, bonusPrecoceFonte: 'reais',
    bonusQualidade: null, bonusQualidadeFonte: null,
    bonusListaTrace: null, bonusListaTraceFonte: null,
    descontoQualidade: null, descontoQualidadeFonte: null,
    outrosDescontos: null, outrosDescontosFonte: null,
    funrural: 614.24, funruralFonte: 'reais',
    valorLiquido: 314915.61, qtdLote: 41,
    ...over,
  });

  it('abate com valor e fornecedor JÁ preenchidos recebe o detalhe mesmo assim', () => {
    const l = mk({ id: 'ab1', tipo: 'abate' as Lancamento['tipo'], quantidade: 41,
      valorTotal: 314915.61, fornecedorId: 'frigorifico' });
    const mapa = new Map<string, EnriquecimentoOC>([['ab1', {
      fornecedorId: 'frigorifico', fornecedorNome: 'Minerva', valorLote: null, qtdLote: 41,
      criterio: null, abate: abate(),
    }]]);
    const out = aplicarEnriquecimentoOC([l], mapa);
    expect(out[0].pesoCarcacaKg).toBeCloseTo(12260.8, 2);
    expect(out[0].precoArroba).toBe(375);
    /* ⚠ E O COMERCIAL NÃO É TOCADO: o valor que já estava lá continua. */
    expect(out[0].valorTotal).toBe(314915.61);
    expect(out[0].fornecedorId).toBe('frigorifico');
  });

  it('movimento parcial do lote prorrateia a carcaça pela quantidade', () => {
    /* A carcaça gravada é o TOTAL do lote (41 cab); o movimento levou 20. */
    const l = mk({ id: 'ab2', tipo: 'abate' as Lancamento['tipo'], quantidade: 20, valorTotal: 1 });
    const mapa = new Map<string, EnriquecimentoOC>([['ab2', {
      fornecedorId: null, fornecedorNome: null, valorLote: null, qtdLote: 41,
      criterio: null, abate: abate(),
    }]]);
    const out = aplicarEnriquecimentoOC([l], mapa);
    expect(out[0].pesoCarcacaKg).toBeCloseTo(12260.8 * 20 / 41, 2);
  });

  it('sem detalhe de abate no mapa, o lançamento passa intacto', () => {
    const l = mk({ id: 'ab3', tipo: 'abate' as Lancamento['tipo'], quantidade: 41,
      valorTotal: 999, fornecedorId: 'f' });
    const mapa = new Map<string, EnriquecimentoOC>([['ab3', {
      fornecedorId: 'f', fornecedorNome: null, valorLote: null, qtdLote: null,
      criterio: null, abate: null,
    }]]);
    expect(aplicarEnriquecimentoOC([l], mapa)[0]).toBe(l);
  });
});
