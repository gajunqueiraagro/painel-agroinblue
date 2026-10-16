/**
 * RESUMO-ATIVIDADE-01b — a aba Pecuária refeita (mock v3, aprovado 16/10/2026). PURO, sem React e sem banco.
 *
 * FONTES (as da 01a, nenhuma paralela):
 *   · fase, área ocupada, cabeças e peso por fase = o dono da 01a (`montarResumoDoMes`: card do mês + `fechamento_pasto_itens`);
 *   · coluna Pecuária = o cache (`totalDaPecuariaDoCache`, sem overlay) e a área pecuária do snapshot do mês;
 *   · ÁREA NÃO OCUPADA (vedado e reforma do MÊS) vai para a fase pela ATIVIDADE DO CADASTRO (`pastos.tipo_uso`); cadastro fora de
 *     cria/recria/engorda entra só na coluna Pecuária (`vedadaForaDasFases`);
 *   · Rebanho do mês = `zoot_mensal_cache` (realizado e meta) somado por mês; R$ = as linhas Abates e Venda Peso Vivo da fazenda em
 *     `fn_dre_pecuaria` (cenário realizado e meta, a MESMA fonte e base); "Venda Geral" (não é gado) fica fora.
 * Lotação = peso ÷ 450 ÷ área (`calcUA`). Efetiva = UA ÷ só a ocupada; global = UA ÷ (ocupada + não ocupada da fase). Nada é ajustado:
 * Σ fases × cache (cabeças e peso) sai escrito.
 */
import { calcUA } from '@/lib/calculos/zootecnicos';
import {
  atividadeNoMes, montarResumoDoMes, normalizarTipoUso, pastosDoMes, ROTULO_FASE,
  type CardDoResumo, type ItemDoResumo, type PastoDoResumo, type ResumoDoMes, type TotalDaPecuaria,
} from './resumoPorAtividade';

export type FaseOcupada = 'cria' | 'recria' | 'engorda';
export const FASES_OCUPADAS: ReadonlyArray<FaseOcupada> = ['cria', 'recria', 'engorda'];
const NAO_OCUPADA = new Set(['vedado', 'reforma_pecuaria']);
const KG_POR_ARROBA = 30;

export interface ColunaDaFase {
  cab: number; pesoTotalKg: number; pesoMedio: number | null; ocupadaHa: number; vedadaHa: number;
  pctVedado: number | null; efetiva: number | null; global: number | null; arrobasEstoque: number | null;
}

export interface PorFase {
  fases: Record<FaseOcupada, ColunaDaFase>;
  pecuaria: ColunaDaFase & { arrobasProduzidas: number | null; gmd: number | null };
  vedadaForaDasFases: number;
  divergenciaCab: { fases: number; cache: number } | null;
  divergenciaPeso: { fases: number; cache: number } | null;
}

const razao = (a: number, b: number) => (b > 0 ? a / b : null);

/** A área não ocupada do mês (vedado / reforma), atribuída à fase pela atividade do cadastro. */
export function naoOcupadaPorCadastro(anoMes: string, pastos: readonly PastoDoResumo[], cards: readonly CardDoResumo[]) {
  const cardDoPasto = new Map(cards.filter(c => c.ano_mes === anoMes).map(c => [c.pasto_id, c]));
  const porFase: Record<FaseOcupada, number> = { cria: 0, recria: 0, engorda: 0 };
  let fora = 0;
  for (const p of pastosDoMes(pastos, anoMes)) {
    if (!NAO_OCUPADA.has(atividadeNoMes(p, cardDoPasto.get(p.id)))) continue;
    const area = Number(p.area_produtiva_ha) || 0;
    const cad = normalizarTipoUso(p.tipo_uso);
    const fase = FASES_OCUPADAS.find(f => f === cad);
    if (fase) porFase[fase] += area; else fora += area;
  }
  return { porFase, fora };
}

export function montarPorFase(entrada: {
  anoMes: string; pastos: readonly PastoDoResumo[]; cards: readonly CardDoResumo[]; resumo: ResumoDoMes;
  total: TotalDaPecuaria; areaPecuariaHa: number | null;
}): PorFase {
  const { resumo, total } = entrada;
  const nao = naoOcupadaPorCadastro(entrada.anoMes, entrada.pastos, entrada.cards);
  const coluna = (f: FaseOcupada): ColunaDaFase => {
    const parte = resumo.grupos.pecuaria.filhas.find(x => x.chave === f);
    const cab = parte?.cab ?? 0, kg = parte?.pesoTotalKg ?? 0, ocupadaHa = parte?.areaHa ?? 0, vedadaHa = nao.porFase[f];
    const pesoMedio = cab > 0 ? kg / cab : null;
    const ua = pesoMedio != null ? calcUA(cab, pesoMedio) : 0;
    return {
      cab, pesoTotalKg: kg, pesoMedio, ocupadaHa, vedadaHa,
      pctVedado: razao(vedadaHa * 100, ocupadaHa + vedadaHa),
      efetiva: cab > 0 ? razao(ua, ocupadaHa) : null, global: cab > 0 ? razao(ua, ocupadaHa + vedadaHa) : null,
      arrobasEstoque: cab > 0 ? kg / KG_POR_ARROBA : null,
    };
  };
  const fases: Record<FaseOcupada, ColunaDaFase> = { cria: coluna('cria'), recria: coluna('recria'), engorda: coluna('engorda') };
  const somaOcup = fases.cria.ocupadaHa + fases.recria.ocupadaHa + fases.engorda.ocupadaHa;
  const somaCab = fases.cria.cab + fases.recria.cab + fases.engorda.cab;
  const somaKg = fases.cria.pesoTotalKg + fases.recria.pesoTotalKg + fases.engorda.pesoTotalKg;
  const vedadaTotal = nao.porFase.cria + nao.porFase.recria + nao.porFase.engorda + nao.fora;
  const uaTotal = total.cab != null && total.pesoMedio != null ? calcUA(total.cab, total.pesoMedio) : null;
  return {
    fases,
    pecuaria: {
      cab: total.cab ?? 0, pesoTotalKg: total.pesoTotalKg ?? 0, pesoMedio: total.pesoMedio, ocupadaHa: somaOcup, vedadaHa: vedadaTotal,
      pctVedado: razao(vedadaTotal * 100, somaOcup + vedadaTotal),
      efetiva: uaTotal != null ? razao(uaTotal, somaOcup) : null,
      global: uaTotal != null && entrada.areaPecuariaHa ? razao(uaTotal, entrada.areaPecuariaHa) : null,
      arrobasEstoque: total.arrobasEstoque, arrobasProduzidas: total.arrobasProduzidas, gmd: total.gmd,
    },
    vedadaForaDasFases: nao.fora,
    divergenciaCab: total.cab != null && Math.round(total.cab) !== Math.round(somaCab) ? { fases: somaCab, cache: total.cab } : null,
    divergenciaPeso: total.pesoTotalKg != null && Math.abs(total.pesoTotalKg - somaKg) >= 0.5 ? { fases: somaKg, cache: total.pesoTotalKg } : null,
  };
}

/* ── colunas 100% de CABEÇAS por fase, Ini..dez ──────────────────────────────────────────────── */
export interface ColunaDeCabecas { anoMes: string; semFechamento: boolean; total: number; partes: Array<{ chave: FaseOcupada; rotulo: string; valor: number; pct: number }> }
export function colunasDeCabecas(entrada: { meses: readonly string[]; pastos: readonly PastoDoResumo[]; cards: readonly CardDoResumo[]; itens: readonly ItemDoResumo[] }): ColunaDeCabecas[] {
  return entrada.meses.map(anoMes => {
    const doMes = entrada.cards.filter(c => c.ano_mes === anoMes);
    if (doMes.length === 0) return { anoMes, semFechamento: true, total: 0, partes: [] };
    const ids = new Set(doMes.map(c => c.id));
    const r = montarResumoDoMes({ anoMes, pastos: entrada.pastos, cards: doMes, itens: entrada.itens.filter(i => ids.has(i.fechamento_id)) });
    const partes = FASES_OCUPADAS.map(f => ({ chave: f, rotulo: ROTULO_FASE[f], valor: r.grupos.pecuaria.filhas.find(x => x.chave === f)?.cab ?? 0 }));
    const total = partes.reduce((s, p) => s + p.valor, 0);
    return { anoMes, semFechamento: false, total, partes: partes.map(p => ({ ...p, pct: total > 0 ? (p.valor / total) * 100 : 0 })) };
  });
}

/* ── Rebanho do mês (ou de um período): realizado × meta ──────────────────────────────────────── */
export interface LinhaMovimentoCache {
  ano_mes: string; cenario: string; saldo_inicial: number | null; saldo_final: number | null;
  cab_nascimento: number | null; cab_compra: number | null; cab_transf_entrada: number | null; cab_abate: number | null;
  cab_venda: number | null; cab_venda_pe: number | null; cab_consumo: number | null; cab_morte: number | null;
  cab_transf_saida: number | null; peso_venda: number | null; peso_venda_pe: number | null;
}
/** R$ do DRE da fazenda num mês: abate e venda de gado (Venda Peso Vivo), por cenário. */
export interface ReceitaDoMes { ano_mes: string; cenario: 'realizado' | 'meta'; abate: number; venda: number; foraVendaGeral: number }

export type ChaveMovimento = 'inicio' | 'nascimentos' | 'compras' | 'abate' | 'venda' | 'consumo' | 'mortes' | 'transfSaida' | 'fim';
export interface Movimento { inicio: number; nascimentos: number; compras: number; abate: number; venda: number; consumo: number; mortes: number; transfSaida: number; fim: number; pesoVendaKg: number }
export interface RebanhoDoPeriodo {
  meses: string[]; temCache: { realizado: boolean; meta: boolean };
  realizado: Movimento; meta: Movimento;
  rs: { realizado: { abate: number | null; venda: number | null }; meta: { abate: number | null; venda: number | null } };
  /** início + entradas − saídas − fim (≠ 0 = a conta do cache não fecha; nunca ajustado). */
  naoFecha: { realizado: number; meta: number };
  foraVendaGeral: number;
}

const n = (v: number | null | undefined) => Number(v) || 0;
const movimentoVazio = (): Movimento => ({ inicio: 0, nascimentos: 0, compras: 0, abate: 0, venda: 0, consumo: 0, mortes: 0, transfSaida: 0, fim: 0, pesoVendaKg: 0 });

/** Início = início do 1º mês com cache; movimentos somados; fim = fim do último mês com cache. Vale para um mês e para o acumulado (civil ou safra). */
export function rebanhoDoPeriodo(meses: readonly string[], cache: readonly LinhaMovimentoCache[], receitas: readonly ReceitaDoMes[]): RebanhoDoPeriodo {
  const ord = [...meses].sort();
  const conta = (cen: string) => {
    const m = movimentoVazio();
    const linhas = cache.filter(l => l.cenario === cen && ord.includes(l.ano_mes));
    /* o 1o e o ultimo mes COM cache no cenario (mes do periodo sem cache nao vira inicio zero) */
    const comDado = ord.filter(am => linhas.some(l => l.ano_mes === am));
    const primeiro = comDado[0], ultimo = comDado[comDado.length - 1];
    for (const l of linhas) {
      if (l.ano_mes === primeiro) m.inicio += n(l.saldo_inicial);
      if (l.ano_mes === ultimo) m.fim += n(l.saldo_final);
      m.nascimentos += n(l.cab_nascimento); m.compras += n(l.cab_compra) + n(l.cab_transf_entrada);
      m.abate += n(l.cab_abate); m.venda += n(l.cab_venda) + n(l.cab_venda_pe); m.consumo += n(l.cab_consumo);
      m.mortes += n(l.cab_morte); m.transfSaida += n(l.cab_transf_saida); m.pesoVendaKg += n(l.peso_venda) + n(l.peso_venda_pe);
    }
    return { m, tem: linhas.length > 0 };
  };
  const r = conta('realizado'), mt = conta('meta');
  const rs = (cen: 'realizado' | 'meta') => {
    const rr = receitas.filter(x => x.cenario === cen && ord.includes(x.ano_mes));
    if (rr.length === 0) return { abate: null, venda: null };
    return { abate: rr.reduce((s, x) => s + x.abate, 0), venda: rr.reduce((s, x) => s + x.venda, 0) };
  };
  const fecha = (m: Movimento) => m.inicio + m.nascimentos + m.compras - m.abate - m.venda - m.consumo - m.mortes - m.transfSaida - m.fim;
  return {
    meses: ord, temCache: { realizado: r.tem, meta: mt.tem }, realizado: r.m, meta: mt.m,
    rs: { realizado: rs('realizado'), meta: rs('meta') },
    naoFecha: { realizado: fecha(r.m), meta: fecha(mt.m) },
    foraVendaGeral: receitas.filter(x => x.cenario === 'realizado' && ord.includes(x.ano_mes)).reduce((s, x) => s + x.foraVendaGeral, 0),
  };
}

/** A cor da diferença pelo EFEITO: mais nascimento / fim e menos morte = bom; menos abate / venda = ruim; consumo neutro. */
export type TomDaDif = 'bom' | 'ruim' | 'neutro';
export function tomDaDiferenca(chave: ChaveMovimento, dif: number): TomDaDif {
  if (dif === 0 || chave === 'consumo' || chave === 'inicio' || chave === 'compras' || chave === 'transfSaida') return 'neutro';
  if (chave === 'mortes') return dif < 0 ? 'bom' : 'ruim';
  return dif > 0 ? 'bom' : 'ruim';
}

export interface NumerosRapidos {
  mortalidade: number | null; desfrute: number | null; rsCabAbate: number | null; rsCabVenda: number | null;
  rsArrobaVenda: number | null; nascimentosXMeta: number | null;
}
export function numerosRapidos(p: RebanhoDoPeriodo): NumerosRapidos {
  const r = p.realizado;
  return {
    mortalidade: r.inicio > 0 ? (r.mortes / r.inicio) * 100 : null,
    desfrute: r.inicio > 0 ? ((r.abate + r.venda) / r.inicio) * 100 : null,
    rsCabAbate: p.rs.realizado.abate != null && r.abate > 0 ? p.rs.realizado.abate / r.abate : null,
    rsCabVenda: p.rs.realizado.venda != null && r.venda > 0 ? p.rs.realizado.venda / r.venda : null,
    rsArrobaVenda: p.rs.realizado.venda != null && r.pesoVendaKg > 0 ? p.rs.realizado.venda / (r.pesoVendaKg / KG_POR_ARROBA) : null,
    nascimentosXMeta: p.temCache.meta && p.meta.nascimentos > 0 ? (r.nascimentos / p.meta.nascimentos - 1) * 100 : null,
  };
}

/** As linhas `fazendas[]` de `fn_dre_pecuaria` -> R$ de abate e venda de gado da fazenda (sem cast; peça torta = nada). */
export function receitaDaFazendaNoDre(dre: unknown, fazendaId: string, anoMes: string, cenario: 'realizado' | 'meta'): ReceitaDoMes | null {
  const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!ehObj(dre) || !Array.isArray(dre.fazendas)) return null;
  const faz = dre.fazendas.find(f => ehObj(f) && f.fazenda_id === fazendaId);
  const out: ReceitaDoMes = { ano_mes: anoMes, cenario, abate: 0, venda: 0, foraVendaGeral: 0 };
  if (!ehObj(faz) || !ehObj(faz.linhas) || !Array.isArray(faz.linhas.centros)) return out;
  for (const c of faz.linhas.centros) {
    if (!ehObj(c) || c.bloco !== 'venda') continue;
    const v = Number(c.valor) || 0;
    if (c.centro === 'Abates') out.abate += v;
    else if (c.centro === 'Venda Peso Vivo') out.venda += v;
    else out.foraVendaGeral += v;
  }
  return out;
}

/** Mês a mês do período (para o acumulado): civil = jan..mês; safra = jul..mês (ou do jul do ano anterior). */
export function mesesDoAcumulado(anoMes: string, calendario: 'civil' | 'safra'): string[] {
  const a = Number(anoMes.slice(0, 4)), m = Number(anoMes.slice(5, 7));
  const ini = calendario === 'civil' ? { a, m: 1 } : m >= 7 ? { a, m: 7 } : { a: a - 1, m: 7 };
  const out: string[] = [];
  for (let y = ini.a, mm = ini.m; y < a || (y === a && mm <= m); mm === 12 ? (y++, mm = 1) : mm++) out.push(`${y}-${String(mm).padStart(2, '0')}`);
  return out;
}

/* ── As linhas da tabela "Rebanho do mês", prontas (a tela so' desenha) ─────────────────────────── */
export interface LinhaDoRebanho {
  chave: ChaveMovimento; rotulo: string;
  realizado: number | null; meta: number | null; dif: number | null; tom: TomDaDif;
  rsRealizado: number | null; rsMeta: number | null; rsDif: number | null; rsTom: TomDaDif;
  /** a linha leva R$ (abate, venda e o fim); nas outras o R$ e' "—" */
  temRs: boolean;
}
const ROTULO_MOVIMENTO: Record<ChaveMovimento, string> = {
  inicio: 'Início do mês', nascimentos: '+ Nascimentos', compras: '+ Compras / transf.', abate: '− Abate', venda: '− Venda',
  consumo: '− Consumo', mortes: '− Mortes', transfSaida: '− Transf. saída', fim: '= Fim do mês',
};
export function linhasDoRebanho(p: RebanhoDoPeriodo, rotuloInicio = 'Início do mês', rotuloFim = '= Fim do mês'): LinhaDoRebanho[] {
  const ordem: ChaveMovimento[] = ['inicio', 'nascimentos', 'compras', 'abate', 'venda', 'consumo', 'mortes', 'transfSaida', 'fim'];
  const rsDe = (cen: 'realizado' | 'meta', k: ChaveMovimento): number | null => {
    const r = p.rs[cen];
    if (k === 'abate') return r.abate;
    if (k === 'venda') return r.venda;
    if (k === 'fim') return r.abate != null && r.venda != null ? r.abate + r.venda : null;
    return null;
  };
  return ordem
    .filter(k => k !== 'transfSaida' || p.realizado.transfSaida !== 0 || p.meta.transfSaida !== 0)
    .map(k => {
      const real = p.temCache.realizado ? p.realizado[k] : null, meta = p.temCache.meta ? p.meta[k] : null;
      const dif = real != null && meta != null ? real - meta : null;
      const rr = rsDe('realizado', k), rm = rsDe('meta', k);
      const rsDif = rr != null && rm != null ? rr - rm : null;
      /* R$: a mais e' bom (abate, venda, o fim) */
      const rsTom: TomDaDif = rsDif == null || rsDif === 0 ? 'neutro' : rsDif > 0 ? 'bom' : 'ruim';
      return {
        chave: k, rotulo: k === 'inicio' ? rotuloInicio : k === 'fim' ? rotuloFim : ROTULO_MOVIMENTO[k],
        realizado: real, meta, dif, tom: dif == null ? 'neutro' : tomDaDiferenca(k, dif),
        rsRealizado: rr, rsMeta: rm, rsDif, rsTom, temRs: k === 'abate' || k === 'venda' || k === 'fim',
      };
    });
}
