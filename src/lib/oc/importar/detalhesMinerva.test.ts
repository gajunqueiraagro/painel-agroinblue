/**
 * IMPORTAR-ABATE-01 — a leitura dos PDFs da Minerva para a importação, nos DOIS formatos reais que temos:
 *   - o lote 6 de out/26 (linhasLote6Real: classificação de 7 colunas, romaneio com Sisbov);
 *   - o SM-LT06 de 10/11/2026, unidade de José Bonifácio (linhasSmLt06Real, caso do Chat 11/11 16:28): classificação com "R$ Idade", a
 *     carcaça Trat.Frio SEM acabamento (desclassificada por cisticercose) e o romaneio SEM Sisbov.
 * Os números conferidos são os do papel. Diferenças entre documentos (NF 119.771,06 × acerto 119.771,07; NF de produtor de pauta) são
 * LIDAS como estão — a importação as mostra, nunca as ajusta.
 */
import { describe, it, expect } from 'vitest';
import { detalhesDoAcertoMinerva, detalhesDoRomaneioMinerva } from './detalhesMinerva';
import { lerPdfDoAbate } from '@/lib/oc/leitura/layoutsAbate';
import { ACERTO_LOTE6_REAL, ROMANEIO_LOTE6_REAL } from '@/lib/oc/leitura/__fixtures__/linhasLote6Real';
import {
  ACERTO_SM_LT06_REAL, CNPJ_MINERVA_JOSE_BONIFACIO, NF_SM_LT06_REAL, ROMANEIO_SM_LT06_REAL,
} from '@/lib/oc/leitura/__fixtures__/linhasSmLt06Real';

const soma = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) * 100) / 100;

describe('SM-LT06 (Minerva José Bonifácio) — o leitor reconhece a unidade', () => {
  const ler = (linhas: readonly string[], especie: 'nf_principal' | 'acerto' | 'romaneio') =>
    lerPdfDoAbate({ linhas: [...linhas], temTexto: true }, { especie, cnpjContraparte: CNPJ_MINERVA_JOSE_BONIFACIO });

  it('NF-e 45854: bruto 119.771,06, SENAR 239,54 e a NF de produtor 131 com o valor de PAUTA (65.841,00), como no papel', () => {
    const r = ler(NF_SM_LT06_REAL, 'nf_principal');
    expect(r.tipo).toBe('lido');
    if (r.tipo !== 'lido') return;
    expect(r.campos).toMatchObject({
      numero: '45854', emitenteCnpj: CNPJ_MINERVA_JOSE_BONIFACIO, bruto: 119771.06, cab: 17, pesoKg: 4834, senar: 239.54, dataAbate: '2026-11-10',
      nfsProdutor: [{ numero: '131', data: '2026-11-06', valor: 65841 }],
    });
  });

  it('acerto: OC 77562, bruto 119.771,07 (1 centavo acima da NF — lido como está), líquido 119.531,53, vencimento 12/11', () => {
    const r = ler(ACERTO_SM_LT06_REAL, 'acerto');
    expect(r.tipo).toBe('lido');
    if (r.tipo !== 'lido') return;
    expect(r.campos).toMatchObject({ ordemCompra: '77562', loteFrigorifico: '6', cab: 17, pesoKg: 4834, bruto: 119771.07, liquido: 119531.53, vencimento: '2026-11-12' });
  });

  it('romaneio: 17 cab, 4.834 kg, OP 399118', () => {
    const r = ler(ROMANEIO_SM_LT06_REAL, 'romaneio');
    expect(r.tipo).toBe('lido');
    if (r.tipo !== 'lido') return;
    expect(r.campos).toMatchObject({ loteFrigorifico: '6', op: '399118', cab: 17, pesoKg: 4834 });
  });
});

describe('detalhes do acerto Minerva', () => {
  it('SM-LT06: 3 faixas (a Trat.Frio a 247); a soma das faixas dá 119.771,06 = a NF — o centavo a mais é do TOTAL impresso no acerto', () => {
    const d = detalhesDoAcertoMinerva(ACERTO_SM_LT06_REAL);
    expect(d?.faixas.map(f => [f.cab, f.kg, f.precoArroba, f.total])).toEqual([[6, 1718, 385, 44095.33], [10, 2748, 380, 69616], [1, 368, 247, 6059.73]]);
    expect(soma(d?.faixas.map(f => f.total) ?? [])).toBe(119771.06);
    expect(d?.despesas).toEqual([{ tipo: 'senar', descricao: 'SENAR (0,2%)', valor: 239.54 }]);
    expect(d?.funruralPelaFolha).toBe(true);
  });

  it('SM-LT06: a classificação com "R$ Idade" e a carcaça Trat.Frio SEM acabamento (nulo, nunca o preço no lugar dele)', () => {
    const d = detalhesDoAcertoMinerva(ACERTO_SM_LT06_REAL);
    expect(d?.classificacao).toEqual([
      { cab: 1, maturidade: '2 Dentes', acabamento: 'Escassa', precoArroba: 380 },
      { cab: 5, maturidade: '4 Dentes', acabamento: 'Escassa', precoArroba: 380 },
      { cab: 4, maturidade: '6 Dentes', acabamento: 'Escassa', precoArroba: 380 },
      { cab: 6, maturidade: '8 Dentes', acabamento: 'Escassa', precoArroba: 380 },
      { cab: 1, maturidade: '8 Dentes', acabamento: null, precoArroba: 247 },
    ]);
    expect(d?.desclassificacao).toEqual([{ classificacao: 'Trat.Frio', motivo: 'CISTICERCOSE', carcaca: '461 A/B' }]);
  });

  it('lote 6 antigo (7 colunas): segue igual — 2 faixas, 7 linhas de classificação, a 1ª Mediana a 376,09', () => {
    const d = detalhesDoAcertoMinerva(ACERTO_LOTE6_REAL);
    expect(d?.faixas).toHaveLength(2);
    expect(d?.classificacao).toHaveLength(7);
    expect(d?.classificacao[0]).toEqual({ cab: 1, maturidade: '4 Dentes', acabamento: 'Mediana', precoArroba: 376.09 });
    expect(soma(d?.classificacao.map(c => c.cab) ?? [])).toBe(27);
    expect(d?.desclassificacao).toEqual([]);
  });
});

describe('detalhes do romaneio Minerva', () => {
  it('SM-LT06 (sem Sisbov; Trat.Frio sem acabamento): 17 animais, 4.834 kg, dentição 1/5/4/7 — a mesma do acerto', () => {
    const r = detalhesDoRomaneioMinerva(ROMANEIO_SM_LT06_REAL);
    expect(r?.animais).toHaveLength(17);
    expect(soma(r?.animais.map(a => a.pesoKg) ?? [])).toBe(4834);
    expect(r?.animais.every(a => a.sisbov === null)).toBe(true);
    expect(r?.animais[0]).toEqual({ seq: 461, pesoKg: 368, acabamento: null, denticao: '8 Dentes', sisbov: null });
    expect(r?.porDenticao.map(d => [d.denticao, d.cab])).toEqual([['2 Dentes', 1], ['4 Dentes', 5], ['6 Dentes', 4], ['8 Dentes', 7]]);
    expect(r?.porAcabamento).toEqual([{ acabamento: 'Escassa', cab: 16 }, { acabamento: null, cab: 1 }]);
  });

  it('lote 6 antigo (com Sisbov): segue igual — 27 animais, dentição 1/12/14, acabamento 16/7/4', () => {
    const r = detalhesDoRomaneioMinerva(ROMANEIO_LOTE6_REAL);
    expect(r?.animais).toHaveLength(27);
    expect(r?.porDenticao.map(d => d.cab)).toEqual([1, 12, 14]);
    expect(r?.porAcabamento).toEqual([{ acabamento: 'Mediana', cab: 16 }, { acabamento: 'Uniforme', cab: 7 }, { acabamento: 'Escassa', cab: 4 }]);
  });
});
