/**
 * useMovimentacoesAgregadas — agregação client-side dos 9 cards de movimentação
 * da tela Rebanho/Visão Geral (Fase 3 do Marco "9 Cards de Movimentação").
 *
 * Reúsa useLancamentos × 3 chamadas (realizado ano corrente, realizado ano-1,
 * cenário meta). Saldo inicial anual vem do mesmo useLancamentos.saldosIniciais.
 *
 * Toda a agregação está dentro de um único useMemo com deps explícitas para
 * evitar recálculo a cada render (troca de lente, fazenda, etc).
 *
 * Decisões fixadas com Gabriel:
 *   - Compra suporta lente preco_arroba via Σ valor / Σ arrobas (calcArrobasSafe
 *     trata compra como peso vivo/30 — confirmado em economicos.ts L59).
 *   - META mortes/sem-lançamento = 0 (não null). Card mostra 0, linha META no
 *     gráfico zera no mês correspondente.
 *   - Desfrute (lente cab) = calcDesfrute(totalDesfrutado, saldoInicialAno) × 100.
 *     Mortes NÃO entram em desfrute (TIPOS_DESFRUTE_GLOBAL = ['abate','venda','consumo']).
 *   - Soma de Entradas = nascimentos + compras (briefing literal; sem transferência).
 *   - Soma de Saídas   = vendas + abates + consumos + mortes (sem transferência saída).
 *   - Desfrute valor_total = Σ valor de abate+venda. Consumo sem valor (=0)
 *     entra como termo zero naturalmente, sem ramo especial.
 */

import { useMemo } from 'react';
import { useLancamentos } from '@/hooks/useLancamentos';
import { calcArrobasSafe, calcValorTotal, calcDesfrute } from '@/lib/calculos/economicos';
import type { Lancamento } from '@/types/cattle';

export type Lente = 'cab' | 'arroba_total' | 'arroba_media' | 'preco_arroba' | 'valor_total';

export type TipoMov =
  | 'nascimentos' | 'compras' | 'soma_entradas'
  | 'vendas' | 'abates' | 'consumos' | 'mortes' | 'soma_saidas' | 'desfrute';

export type PorLente = Record<Lente, number | null>;

export type SeriesJanDez = {
  /** 13 posições: [0]=Dez ano anterior (sempre 0 nesta versão), [1..12]=Jan..Dez. */
  real: number[];
  anoAnt: number[];
  meta: number[];
};

export type CardData = {
  /** Valor agregado no período corrente (mês ou Jan→mês conforme viewMode). */
  mesAtual: PorLente;
  /** Valor agregado no período do MÊS anterior (mesmo ano). */
  mesAnt: PorLente;
  /** Valor agregado no período do mesmo mês do ANO anterior. */
  mesAnoAnt: PorLente;
  /** Valor agregado META no período corrente. */
  meta: PorLente;
  /** Série Jan-Dez pré-calculada para cada lente — valor de CADA mês.
   *  Modal usa em viewMode='mes' (barras). */
  seriesJanDez: Record<Lente, SeriesJanDez>;
  /** Série Jan-Dez ACUMULADA por mês: cada ponto [m] = agregado para os
   *  meses [1..m]. Para taxas/médias (preco_arroba, arroba_media, desfrute cab)
   *  usa Σ numerador / Σ denominador — NÃO média de médias. Modal usa em
   *  viewMode='periodo' (linha crescente). */
  seriesAcumulada: Record<Lente, SeriesJanDez>;
};

export type MovimentacoesAgregadas = {
  loading: boolean;
  porTipo: Record<TipoMov, CardData>;
};

interface Args {
  ano: number;
  mes: number; // 1..12
  viewMode: 'mes' | 'periodo';
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TIPOS_LANC_DE_MOV: Record<TipoMov, Lancamento['tipo'][]> = {
  nascimentos:   ['nascimento'],
  compras:       ['compra'],
  soma_entradas: ['nascimento', 'compra'],
  vendas:        ['venda'],
  abates:        ['abate'],
  consumos:      ['consumo'],
  mortes:        ['morte'],
  soma_saidas:   ['venda', 'abate', 'consumo', 'morte'],
  desfrute:      ['abate', 'venda', 'consumo'], // TIPOS_DESFRUTE_GLOBAL — cab/@/valor incluem consumo
};

/**
 * Sub-conjunto de desfrute usado apenas na lente preco_arroba: abates + vendas.
 * Consumo é excluído porque não gera receita — média ponderada de R$/@ só
 * faz sentido com tipos que têm valor associado.
 */
const TIPOS_DESFRUTE_RECEITA: Lancamento['tipo'][] = ['abate', 'venda'];

const LENTES_APLICAVEIS: Record<TipoMov, ReadonlySet<Lente>> = {
  nascimentos:   new Set(['cab']),
  compras:       new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total']),
  soma_entradas: new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total']),
  vendas:        new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total']),
  abates:        new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total']),
  consumos:      new Set(['cab', 'arroba_total', 'arroba_media']),
  mortes:        new Set(['cab', 'arroba_total', 'arroba_media']),
  soma_saidas:   new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total']),
  desfrute:      new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total']),
};

const TIPOS_TODOS: TipoMov[] = [
  'nascimentos', 'compras', 'soma_entradas',
  'vendas', 'abates', 'consumos', 'mortes', 'soma_saidas', 'desfrute',
];

const LENTES_TODAS: Lente[] = ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'];

// ─── HELPERS DE AGREGAÇÃO ────────────────────────────────────────────────────

type Agreg = { cab: number; arrobas: number; valor: number };

function emptyAgreg(): Agreg {
  return { cab: 0, arrobas: 0, valor: 0 };
}

/** Agrega lançamentos em Record<mes, Record<tipoLanc, Agreg>>. */
function agregarPorMesPorTipo(lancs: Lancamento[]): Record<number, Record<string, Agreg>> {
  const result: Record<number, Record<string, Agreg>> = {};
  for (const l of lancs) {
    if (!l.data) continue;
    const m = parseInt(l.data.slice(5, 7), 10);
    if (isNaN(m) || m < 1 || m > 12) continue;
    if (!result[m]) result[m] = {};
    if (!result[m][l.tipo]) result[m][l.tipo] = emptyAgreg();
    const slot = result[m][l.tipo];
    slot.cab += Number(l.quantidade) || 0;
    slot.arrobas += calcArrobasSafe(l);
    slot.valor += calcValorTotal(l);
  }
  return result;
}

/** Soma agregados de um conjunto de meses × conjunto de tipos. */
function somarAgreg(
  porMesPorTipo: Record<number, Record<string, Agreg>>,
  tipos: string[],
  meses: number[],
): Agreg {
  const out = emptyAgreg();
  for (const m of meses) {
    const slot = porMesPorTipo[m];
    if (!slot) continue;
    for (const t of tipos) {
      const a = slot[t];
      if (a) {
        out.cab += a.cab;
        out.arrobas += a.arrobas;
        out.valor += a.valor;
      }
    }
  }
  return out;
}

/**
 * Deriva valor de um card num Agreg dado uma lente.
 *
 * agregReceita: sub-agreg só de abate+venda — usado APENAS quando tipo='desfrute'
 * e lente='preco_arroba'. Consumo é excluído porque não gera receita (média
 * ponderada de R$/@ só faz sentido com tipos que têm valor associado).
 */
function valorPorLente(
  tipo: TipoMov,
  lente: Lente,
  agreg: Agreg,
  saldoInicialAno: number,
  agregReceita?: Agreg,
): number | null {
  if (!LENTES_APLICAVEIS[tipo].has(lente)) return null;
  switch (lente) {
    case 'cab':
      if (tipo === 'desfrute') return calcDesfrute(agreg.cab, saldoInicialAno);
      return agreg.cab;
    case 'arroba_total':
      return agreg.arrobas;
    case 'arroba_media':
      return agreg.cab > 0 ? agreg.arrobas / agreg.cab : null;
    case 'preco_arroba': {
      // Desfrute usa sub-agreg só de receita (abate+venda); demais cards usam
      // a agregação padrão. Null se denominador <=0 (não zero — evita exibir
      // R$ 0,00 enganoso).
      const base = (tipo === 'desfrute' && agregReceita) ? agregReceita : agreg;
      if (base.arrobas <= 0 || base.valor <= 0) return null;
      return base.valor / base.arrobas;
    }
    case 'valor_total':
      return agreg.valor;
  }
}

function mesesDoModo(mes: number, viewMode: 'mes' | 'periodo'): number[] {
  if (viewMode === 'periodo') return Array.from({ length: mes }, (_, i) => i + 1);
  return [mes];
}

interface SaldoInicialLike { ano: number; quantidade: number }

function calcularSaldoInicialAno(saldos: SaldoInicialLike[], ano: number): number {
  let total = 0;
  for (const s of saldos) {
    if (s.ano === ano) total += Number(s.quantidade) || 0;
  }
  return total;
}

// ─── HOOK ────────────────────────────────────────────────────────────────────

export function useMovimentacoesAgregadas({ ano, mes, viewMode }: Args): MovimentacoesAgregadas {
  // 3 useLancamentos com queryKeys distintos (TanStack Query cacheia separado).
  const corr   = useLancamentos({ cenario: 'realizado', ano });
  const anoAnt = useLancamentos({ cenario: 'realizado', ano: ano - 1 });
  const meta   = useLancamentos({ cenario: 'meta',      ano });

  const loading = !!(corr.loading || anoAnt.loading || meta.loading);

  const lancCorr = corr.lancamentos ?? [];
  const lancAnoAnt = anoAnt.lancamentos ?? [];
  const lancMeta = meta.lancamentos ?? [];
  const saldosCorr = corr.saldosIniciais ?? [];
  const saldosAnoAnt = anoAnt.saldosIniciais ?? [];

  const porTipo = useMemo<Record<TipoMov, CardData>>(() => {
    const agCorr   = agregarPorMesPorTipo(lancCorr);
    const agAnoAnt = agregarPorMesPorTipo(lancAnoAnt);
    const agMeta   = agregarPorMesPorTipo(lancMeta);

    const saldoInicialAnoCorr = calcularSaldoInicialAno(saldosCorr, ano);
    const saldoInicialAnoAnt  = calcularSaldoInicialAno(saldosAnoAnt, ano - 1);
    // META usa o mesmo saldo inicial do realizado — Gabriel planeja sobre o rebanho atual.
    const saldoInicialMeta    = saldoInicialAnoCorr;

    const mesesPeriodo   = mesesDoModo(mes, viewMode);
    const mesAntNum      = mes > 1 ? mes - 1 : null;
    const mesesPeriodoAnt = mesAntNum ? mesesDoModo(mesAntNum, viewMode) : [];

    const porLente = (
      tipo: TipoMov,
      a: Agreg,
      saldoInicial: number,
      aReceita?: Agreg,
    ): PorLente => {
      const out = {} as PorLente;
      for (const l of LENTES_TODAS) out[l] = valorPorLente(tipo, l, a, saldoInicial, aReceita);
      return out;
    };

    const result = {} as Record<TipoMov, CardData>;

    for (const tipo of TIPOS_TODOS) {
      const tiposLanc = TIPOS_LANC_DE_MOV[tipo];

      // Valores pontuais por estado.
      const aMesAtual  = somarAgreg(agCorr,   tiposLanc, mesesPeriodo);
      const aMesAnt    = mesAntNum ? somarAgreg(agCorr, tiposLanc, mesesPeriodoAnt) : emptyAgreg();
      const aMesAnoAnt = somarAgreg(agAnoAnt, tiposLanc, mesesPeriodo);
      const aMeta      = somarAgreg(agMeta,   tiposLanc, mesesPeriodo);

      // Para Desfrute na lente preco_arroba: sub-agreg só com abate+venda
      // (consumo excluído porque não gera receita).
      let aRecMesAtual: Agreg | undefined;
      let aRecMesAnt:   Agreg | undefined;
      let aRecMesAnoAnt: Agreg | undefined;
      let aRecMeta:     Agreg | undefined;
      if (tipo === 'desfrute') {
        aRecMesAtual   = somarAgreg(agCorr,   TIPOS_DESFRUTE_RECEITA, mesesPeriodo);
        aRecMesAnt     = mesAntNum ? somarAgreg(agCorr, TIPOS_DESFRUTE_RECEITA, mesesPeriodoAnt) : emptyAgreg();
        aRecMesAnoAnt  = somarAgreg(agAnoAnt, TIPOS_DESFRUTE_RECEITA, mesesPeriodo);
        aRecMeta       = somarAgreg(agMeta,   TIPOS_DESFRUTE_RECEITA, mesesPeriodo);
      }

      // Séries Jan-Dez por lente.
      //   seriesJanDez[lente]   = valor isolado de CADA mês m (gráfico "Por mês" = barras)
      //   seriesAcumulada[lente] = agregado Jan→m para CADA m — taxas/médias usam
      //     Σ numerador / Σ denominador, reaproveitando valorPorLente com Agreg acumulado
      //     (NÃO é média de médias). Gráfico "Acumulado" = linha crescente.
      const seriesJanDez   = {} as Record<Lente, SeriesJanDez>;
      const seriesAcumulada = {} as Record<Lente, SeriesJanDez>;
      for (const lente of LENTES_TODAS) {
        const real:    number[] = [0]; // [0] = Dez ano-1 (placeholder zero)
        const anoAntS: number[] = [0];
        const metaS:   number[] = [0];
        const realAcum:    number[] = [0];
        const anoAntAcum:  number[] = [0];
        const metaAcum:    number[] = [0];
        for (let m = 1; m <= 12; m++) {
          // ── Mês isolado [m] ──
          const aR = somarAgreg(agCorr,   tiposLanc, [m]);
          const aA = somarAgreg(agAnoAnt, tiposLanc, [m]);
          const aM = somarAgreg(agMeta,   tiposLanc, [m]);
          let aRec_R: Agreg | undefined;
          let aRec_A: Agreg | undefined;
          let aRec_M: Agreg | undefined;
          if (tipo === 'desfrute' && lente === 'preco_arroba') {
            aRec_R = somarAgreg(agCorr,   TIPOS_DESFRUTE_RECEITA, [m]);
            aRec_A = somarAgreg(agAnoAnt, TIPOS_DESFRUTE_RECEITA, [m]);
            aRec_M = somarAgreg(agMeta,   TIPOS_DESFRUTE_RECEITA, [m]);
          }
          real.push(   valorPorLente(tipo, lente, aR, saldoInicialAnoCorr, aRec_R) ?? 0);
          anoAntS.push(valorPorLente(tipo, lente, aA, saldoInicialAnoAnt,  aRec_A) ?? 0);
          metaS.push(  valorPorLente(tipo, lente, aM, saldoInicialMeta,    aRec_M) ?? 0);

          // ── Acumulado Jan→m: sempre via Σ raw + valorPorLente (taxa/média correta) ──
          const mesesAteM = Array.from({ length: m }, (_, i) => i + 1);
          const aR_acum = somarAgreg(agCorr,   tiposLanc, mesesAteM);
          const aA_acum = somarAgreg(agAnoAnt, tiposLanc, mesesAteM);
          const aM_acum = somarAgreg(agMeta,   tiposLanc, mesesAteM);
          let aRec_R_acum: Agreg | undefined;
          let aRec_A_acum: Agreg | undefined;
          let aRec_M_acum: Agreg | undefined;
          if (tipo === 'desfrute' && lente === 'preco_arroba') {
            aRec_R_acum = somarAgreg(agCorr,   TIPOS_DESFRUTE_RECEITA, mesesAteM);
            aRec_A_acum = somarAgreg(agAnoAnt, TIPOS_DESFRUTE_RECEITA, mesesAteM);
            aRec_M_acum = somarAgreg(agMeta,   TIPOS_DESFRUTE_RECEITA, mesesAteM);
          }
          realAcum.push(   valorPorLente(tipo, lente, aR_acum, saldoInicialAnoCorr, aRec_R_acum) ?? 0);
          anoAntAcum.push( valorPorLente(tipo, lente, aA_acum, saldoInicialAnoAnt,  aRec_A_acum) ?? 0);
          metaAcum.push(   valorPorLente(tipo, lente, aM_acum, saldoInicialMeta,    aRec_M_acum) ?? 0);
        }
        seriesJanDez[lente]    = { real, anoAnt: anoAntS, meta: metaS };
        seriesAcumulada[lente] = { real: realAcum, anoAnt: anoAntAcum, meta: metaAcum };
      }

      result[tipo] = {
        mesAtual:  porLente(tipo, aMesAtual,  saldoInicialAnoCorr, aRecMesAtual),
        mesAnt:    porLente(tipo, aMesAnt,    saldoInicialAnoCorr, aRecMesAnt),
        mesAnoAnt: porLente(tipo, aMesAnoAnt, saldoInicialAnoAnt,  aRecMesAnoAnt),
        meta:      porLente(tipo, aMeta,      saldoInicialMeta,    aRecMeta),
        seriesJanDez,
        seriesAcumulada,
      };
    }

    return result;
  }, [lancCorr, lancAnoAnt, lancMeta, saldosCorr, saldosAnoAnt, ano, mes, viewMode]);

  return { loading, porTipo };
}
