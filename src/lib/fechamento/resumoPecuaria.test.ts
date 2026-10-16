/**
 * RESUMO-ATIVIDADE-01b — as regras da aba Pecuaria. O caso e' o PUR set/26 (os agregados medidos no proto em 16/10/2026,
 * remontados em pastos sinteticos: nenhum nome real).
 */
import { describe, it, expect } from 'vitest';
import { montarResumoDoMes, totalDaPecuariaDoCache, type CardDoResumo, type ItemDoResumo, type PastoDoResumo } from './resumoPorAtividade';
import {
  montarPorFase, naoOcupadaPorCadastro, colunasDeCabecas, rebanhoDoPeriodo, tomDaDiferenca, numerosRapidos,
  receitaDaFazendaNoDre, mesesDoAcumulado, linhasDoRebanho, type LinhaMovimentoCache, type ReceitaDoMes,
} from './resumoPecuaria';

const MES = '2026-09';
const pasto = (id: string, tipo: string, ha: number): PastoDoResumo => ({ id, nome: id, tipo_uso: tipo, area_produtiva_ha: ha, ativo: true });
const card = (id: string, pastoId: string, tipo: string, anoMes = MES): CardDoResumo => ({ id, pasto_id: pastoId, ano_mes: anoMes, status: 'fechado', tipo_uso_mes: tipo });

/* ocupada cria 2190 · recria 353,1 · engorda 129,8; vedado do mes pelo cadastro cria 458,6 · recria 39,3 · engorda 145,0 */
const PASTOS: PastoDoResumo[] = [
  pasto('pc', 'cria', 2190), pasto('pr', 'recria', 353.1), pasto('pe', 'engorda', 129.8),
  pasto('vc', 'cria', 458.6), pasto('vr', 'recria', 39.3), pasto('ve', 'engorda', 145.0),
  pasto('div', 'divergencia', 0),
];
const CARDS: CardDoResumo[] = [
  card('c1', 'pc', 'cria'), card('c2', 'pr', 'recria'), card('c3', 'pe', 'engorda'),
  card('c4', 'vc', 'vedado'), card('c5', 'vr', 'vedado'), card('c6', 've', 'vedado'), card('c7', 'div', 'divergencia'),
];
const ITENS: ItemDoResumo[] = [
  { fechamento_id: 'c1', quantidade: 4628, peso_medio_kg: 1347355 / 4628 },
  { fechamento_id: 'c2', quantidade: 620, peso_medio_kg: 184235 / 620 },
  { fechamento_id: 'c3', quantidade: 623, peso_medio_kg: 282115 / 623 },
  { fechamento_id: 'c7', quantidade: 1, peso_medio_kg: 300 },
];
const CACHE_MES = [{ ano: 2026, mes: 9, saldo_inicial: 5661, saldo_final: 5872, peso_total_final: 5872 * 297.4, producao_biologica: 0, dias_mes: 30 }];

function porFasePur() {
  const resumo = montarResumoDoMes({ anoMes: MES, pastos: PASTOS, cards: CARDS, itens: ITENS });
  const total = totalDaPecuariaDoCache(CACHE_MES, 3315.8);
  return montarPorFase({ anoMes: MES, pastos: PASTOS, cards: CARDS, resumo, total, areaPecuariaHa: 3315.8 });
}
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

describe('por fase · PUR set/26', () => {
  it('peso medio por fase (o dono da 01a) e a coluna Pecuaria do cache', () => {
    const p = porFasePur();
    expect(r1(p.fases.cria.pesoMedio)).toBe(291.1);
    expect(r1(p.fases.recria.pesoMedio)).toBe(297.2);
    expect(r1(p.fases.engorda.pesoMedio)).toBe(452.8);
    expect(r1(p.pecuaria.pesoMedio)).toBe(297.4);
  });

  it('lotacao efetiva (so ocupada) e global (ocupada + nao ocupada do cadastro)', () => {
    const p = porFasePur();
    expect([p.fases.cria, p.fases.recria, p.fases.engorda, p.pecuaria].map(c => r2(c.efetiva))).toEqual([1.37, 1.16, 4.83, 1.45]);
    expect([p.fases.cria, p.fases.recria, p.fases.engorda, p.pecuaria].map(c => r2(c.global))).toEqual([1.13, 1.04, 2.28, 1.17]);
  });

  it('% vedado e o vedado por cadastro', () => {
    const p = porFasePur();
    expect([p.fases.cria, p.fases.recria, p.fases.engorda, p.pecuaria].map(c => r1(c.pctVedado))).toEqual([17.3, 10.0, 52.8, 19.4]);
    expect(r1(p.fases.cria.vedadaHa)).toBe(458.6);
    expect(r1(p.fases.recria.vedadaHa)).toBe(39.3);
    expect(r1(p.fases.engorda.vedadaHa)).toBe(145.0);
    expect(r1(p.pecuaria.vedadaHa)).toBe(642.9);
    expect(r1(p.pecuaria.ocupadaHa)).toBe(2672.9);
  });

  it('as duas divergencias saem escritas, nunca ajustadas', () => {
    const p = porFasePur();
    expect(p.divergenciaCab).toEqual({ fases: 5871, cache: 5872 });
    expect(r1((p.divergenciaPeso?.fases ?? 0) / 1000)).toBe(1813.7);
    expect(r1((p.divergenciaPeso?.cache ?? 0) / 1000)).toBe(1746.3);
  });

  it('cadastro fora das fases: o vedado vai so para a coluna Pecuaria', () => {
    const pastos = [...PASTOS, pasto('vx', 'reforma_pecuaria', 20)];
    const cards = [...CARDS, card('c8', 'vx', 'vedado')];
    const nao = naoOcupadaPorCadastro(MES, pastos, cards);
    expect(nao.fora).toBe(20);
    const resumo = montarResumoDoMes({ anoMes: MES, pastos, cards, itens: ITENS });
    const p = montarPorFase({ anoMes: MES, pastos, cards, resumo, total: totalDaPecuariaDoCache(CACHE_MES, 3335.8), areaPecuariaHa: 3335.8 });
    expect(p.vedadaForaDasFases).toBe(20);
    expect(r1(p.fases.cria.vedadaHa)).toBe(458.6);
    expect(r1(p.pecuaria.vedadaHa)).toBe(662.9);
  });

  it('colunas de cabecas: mes sem card = sem fechamento; mes com card = % das tres fases', () => {
    const col = colunasDeCabecas({ meses: ['2026-09', '2026-10'], pastos: PASTOS, cards: CARDS, itens: ITENS });
    expect(col[1].semFechamento).toBe(true);
    expect(col[0].total).toBe(5871);
    expect(r1(col[0].partes[0].pct)).toBe(78.8);
  });
});

/* ── Rebanho do mes ── */
const mov = (anoMes: string, cenario: string, o: Partial<LinhaMovimentoCache>): LinhaMovimentoCache => ({
  ano_mes: anoMes, cenario, saldo_inicial: 0, saldo_final: 0, cab_nascimento: 0, cab_compra: 0, cab_transf_entrada: 0, cab_abate: 0,
  cab_venda: 0, cab_venda_pe: 0, cab_consumo: 0, cab_morte: 0, cab_transf_saida: 0, peso_venda: 0, peso_venda_pe: 0, ...o,
});
/* duas categorias por cenario: o mes e' a soma */
const CACHE_SET: LinhaMovimentoCache[] = [
  mov(MES, 'realizado', { saldo_inicial: 3000, saldo_final: 3359, cab_nascimento: 432, cab_abate: 72, cab_morte: 1 }),
  mov(MES, 'realizado', { saldo_inicial: 2661, saldo_final: 2513, cab_venda: 141, cab_consumo: 1, cab_morte: 6, peso_venda: 37961.2 }),
  mov(MES, 'meta', { saldo_inicial: 3000, saldo_final: 3188, cab_nascimento: 280, cab_abate: 90, cab_morte: 2 }),
  mov(MES, 'meta', { saldo_inicial: 2459, saldo_final: 2435, cab_consumo: 2, cab_morte: 22 }),
];
const RECEITAS: ReceitaDoMes[] = [
  { ano_mes: MES, cenario: 'realizado', abate: 415242.10, venda: 335031.00, foraVendaGeral: 5000 },
  { ano_mes: MES, cenario: 'meta', abate: 488217.60, venda: 0, foraVendaGeral: 0 },
];

describe('rebanho do mes · realizado x meta', () => {
  it('a conta fecha nos dois cenarios (5.661 → 5.872; 5.459 → 5.623)', () => {
    const r = rebanhoDoPeriodo([MES], CACHE_SET, RECEITAS);
    expect(r.realizado).toMatchObject({ inicio: 5661, nascimentos: 432, abate: 72, venda: 141, consumo: 1, mortes: 7, fim: 5872 });
    expect(r.meta).toMatchObject({ inicio: 5459, nascimentos: 280, abate: 90, venda: 0, consumo: 2, mortes: 24, fim: 5623 });
    expect(r.naoFecha).toEqual({ realizado: 0, meta: 0 });
    expect(r.rs.realizado).toEqual({ abate: 415242.10, venda: 335031.00 });
    expect(r.rs.meta).toEqual({ abate: 488217.60, venda: 0 });
    expect(r.foraVendaGeral).toBe(5000);
  });

  it('a conta que nao fecha sai dita (nao ajustada)', () => {
    const r = rebanhoDoPeriodo([MES], [...CACHE_SET, mov(MES, 'realizado', { saldo_final: 3 })], RECEITAS);
    expect(r.naoFecha.realizado).toBe(-3);
  });

  it('numeros rapidos', () => {
    const n = numerosRapidos(rebanhoDoPeriodo([MES], CACHE_SET, RECEITAS));
    expect(r2(n.rsArrobaVenda)).toBe(264.77);
    expect(r2(n.rsCabAbate)).toBe(5767.25);
    expect(r2(n.rsCabVenda)).toBe(2376.11);
    expect(r2(n.mortalidade)).toBe(0.12);
    expect(r1(n.desfrute)).toBe(3.8);
    expect(r1(n.nascimentosXMeta)).toBe(54.3);
  });

  it('"—" sem fonte: sem DRE, sem peso de venda, sem meta', () => {
    const semMeta = CACHE_SET.filter(l => l.cenario === 'realizado').map(l => ({ ...l, peso_venda: 0 }));
    const n = numerosRapidos(rebanhoDoPeriodo([MES], semMeta, []));
    expect(n.rsCabAbate).toBeNull();
    expect(n.rsCabVenda).toBeNull();
    expect(n.rsArrobaVenda).toBeNull();
    expect(n.nascimentosXMeta).toBeNull();
    const comDre = numerosRapidos(rebanhoDoPeriodo([MES], semMeta, RECEITAS));
    expect(comDre.rsArrobaVenda).toBeNull();
    expect(comDre.rsCabVenda).not.toBeNull();
  });

  it('cor da diferenca pelo efeito', () => {
    expect(tomDaDiferenca('nascimentos', 152)).toBe('bom');
    expect(tomDaDiferenca('fim', 249)).toBe('bom');
    expect(tomDaDiferenca('mortes', -17)).toBe('bom');
    expect(tomDaDiferenca('mortes', 3)).toBe('ruim');
    expect(tomDaDiferenca('abate', -18)).toBe('ruim');
    expect(tomDaDiferenca('venda', -5)).toBe('ruim');
    expect(tomDaDiferenca('consumo', -1)).toBe('neutro');
    expect(tomDaDiferenca('nascimentos', 0)).toBe('neutro');
  });
});

describe('acumulado (lista de meses)', () => {
  const tres: LinhaMovimentoCache[] = [
    mov('2026-07', 'realizado', { saldo_inicial: 100, saldo_final: 110, cab_nascimento: 12, cab_morte: 2 }),
    mov('2026-08', 'realizado', { saldo_inicial: 110, saldo_final: 105, cab_venda: 5 }),
    mov('2026-09', 'realizado', { saldo_inicial: 105, saldo_final: 104, cab_abate: 1 }),
  ];
  it('civil jan..set e safra jul..set', () => {
    expect(mesesDoAcumulado('2026-09', 'civil')).toHaveLength(9);
    expect(mesesDoAcumulado('2026-09', 'civil')[0]).toBe('2026-01');
    expect(mesesDoAcumulado('2026-09', 'safra')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(mesesDoAcumulado('2026-03', 'safra')[0]).toBe('2025-07');
    expect(mesesDoAcumulado('2026-03', 'safra')).toHaveLength(9);
  });
  it('inicio do 1o mes, movimentos somados, fim do ultimo; a conta fecha', () => {
    const calendarios: Array<'civil' | 'safra'> = ['civil', 'safra'];
    for (const cal of calendarios) {
      const r = rebanhoDoPeriodo(mesesDoAcumulado('2026-09', cal), tres, []);
      expect(r.realizado).toMatchObject({ inicio: 100, nascimentos: 12, venda: 5, abate: 1, mortes: 2, fim: 104 });
      expect(r.naoFecha.realizado).toBe(0);
    }
  });
});

describe('R$ do DRE da fazenda', () => {
  it('Abates e Venda Peso Vivo; Venda Geral fica fora; outra fazenda nao entra', () => {
    const dre = { fazendas: [
      { fazenda_id: 'f1', linhas: { centros: [
        { bloco: 'venda', centro: 'Abates', valor: 415242.10 }, { bloco: 'venda', centro: 'Venda Peso Vivo', valor: 335031 },
        { bloco: 'venda', centro: 'Venda Geral', valor: 5000 }, { bloco: 'custo', centro: 'Abates', valor: 9 },
      ] } },
      { fazenda_id: 'f2', linhas: { centros: [{ bloco: 'venda', centro: 'Abates', valor: 1 }] } },
    ] };
    expect(receitaDaFazendaNoDre(dre, 'f1', MES, 'realizado')).toEqual({ ano_mes: MES, cenario: 'realizado', abate: 415242.10, venda: 335031, foraVendaGeral: 5000 });
    expect(receitaDaFazendaNoDre(dre, 'f9', MES, 'meta')).toEqual({ ano_mes: MES, cenario: 'meta', abate: 0, venda: 0, foraVendaGeral: 0 });
    expect(receitaDaFazendaNoDre(null, 'f1', MES, 'meta')).toBeNull();
  });
});

describe('linhas do rebanho', () => {
  it('diferenca, cor e R$ prontos; transf. saida so com valor', () => {
    const l = linhasDoRebanho(rebanhoDoPeriodo([MES], CACHE_SET, RECEITAS));
    expect(l.map(x => x.chave)).not.toContain('transfSaida');
    const fim = l.find(x => x.chave === 'fim');
    expect(fim).toMatchObject({ realizado: 5872, meta: 5623, dif: 249, tom: 'bom', rsRealizado: 750273.10, rsMeta: 488217.60 });
    expect(l.find(x => x.chave === 'abate')).toMatchObject({ dif: -18, tom: 'ruim', rsDif: 415242.10 - 488217.60, rsTom: 'ruim' });
    expect(l.find(x => x.chave === 'nascimentos')?.temRs).toBe(false);
    const comSaida = linhasDoRebanho(rebanhoDoPeriodo([MES], [...CACHE_SET, mov(MES, 'realizado', { cab_transf_saida: 4 })], RECEITAS));
    expect(comSaida.map(x => x.chave)).toContain('transfSaida');
  });
  it('sem cache da meta: coluna meta e diferenca "—"', () => {
    const l = linhasDoRebanho(rebanhoDoPeriodo([MES], CACHE_SET.filter(x => x.cenario === 'realizado'), []));
    expect(l[0]).toMatchObject({ meta: null, dif: null, tom: 'neutro', rsRealizado: null });
  });
});
