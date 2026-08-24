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

export type Lente =
  | 'cab' | 'arroba_total' | 'arroba_media' | 'preco_arroba' | 'valor_total'
  /* PR-MOVIMENTACOES-01 — peso e preco em QUILO, para os tipos cuja unidade
     de negocio nao e a arroba: compra, venda em pe, consumo e morte. Abate e
     desfrute seguem em @, porque a arroba de abate e carcaca/15 e converter
     de volta para quilo introduziria erro. */
  | 'peso_medio_kg' | 'preco_kg';

export type TipoMov =
  | 'nascimentos' | 'compras' | 'transf_entradas' | 'soma_entradas'
  | 'vendas' | 'abates' | 'consumos' | 'mortes' | 'transf_saidas'
  | 'soma_saidas' | 'desfrute' | 'desfrute_pct'
  /* PR-MOVIMENTACOES-02 — mortalidade% = mortes ÷ REBANHO INICIAL DO ANO,
     no mes E no acumulado. Nunca sobre o rebanho do mes nem sobre a media:
     o denominador e o mesmo o ano inteiro, entao o acumulado cresce e o
     numero e comparavel entre meses. Mesma forma do `desfrute_pct`, e o
     mesmo denominador — `saldoInicialAnual`, ja calculado aqui. */
  | 'mortalidade_pct'
  | 'reposicao';

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
  /** Saldo inicial total do rebanho em Jan/ano. Usado para encadear
   * saldo mês a mês na TabelaConferencia. */
  saldoInicialAnual: number;
};

interface Args {
  ano: number;
  mes: number; // 1..12
  viewMode: 'mes' | 'periodo';
  /** Quando true, Σ Entradas exclui transf entrada (movimentação interna do cliente). */
  isGlobal: boolean;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

/**
 * Mapeamento TipoMov → tipos brutos de Lancamento. Função (não const) porque
 * Σ Entradas DEPENDE do escopo: em Global, transferência entrada é interna
 * (movimenta entre fazendas do mesmo cliente) e não deve compor o total; em
 * Individual, vira entrada real para a fazenda específica.
 */
function getTiposLancDeMov(isGlobal: boolean): Record<TipoMov, Lancamento['tipo'][]> {
  return {
    nascimentos:     ['nascimento'],
    compras:         ['compra'],
    transf_entradas: ['transferencia_entrada'],
    soma_entradas:   isGlobal
      ? ['nascimento', 'compra']
      : ['nascimento', 'compra', 'transferencia_entrada'],
    vendas:          ['venda'],
    abates:          ['abate'],
    consumos:        ['consumo'],
    mortalidade_pct: ['morte'],
    mortes:          ['morte'],
    transf_saidas:   ['transferencia_saida'],
    soma_saidas:     isGlobal
      ? ['venda', 'abate', 'consumo', 'morte']
      : ['venda', 'abate', 'consumo', 'morte', 'transferencia_saida'],
    desfrute:        ['abate', 'venda', 'consumo'], // TIPOS_DESFRUTE_GLOBAL — cab/@/valor incluem consumo
    desfrute_pct:    ['abate', 'venda', 'consumo'], // mesmo agreg; valorPorLente força % p/ qualquer lente
    // reposicao: compra sempre; + transf_entrada em modo individual (movimentação real p/ a fazenda)
    reposicao:       isGlobal ? ['compra'] : ['compra', 'transferencia_entrada'],
  };
}

/**
 * Sub-conjunto de desfrute usado apenas na lente preco_arroba: abates + vendas.
 * Consumo é excluído porque não gera receita — média ponderada de R$/@ só
 * faz sentido com tipos que têm valor associado.
 */
const TIPOS_DESFRUTE_RECEITA: Lancamento['tipo'][] = ['abate', 'venda'];

/* ⚠ FILTRO DE EXIBICAO, nao regra de negocio. Uso unico, no guard de
   `valorPorLente` — nao filtra agregacao nem lancamento. Prova de que era
   escolha de apresentacao: `consumo` ja entrava em `desfrute` COM valor
   (:105), entao o mesmo tipo tinha valor somado e nao tinha valor sozinho.
   PR-MOVIMENTACOES-01 — `consumos` e `mortes` ganham `valor_total` e
   `preco_kg`. O campo de valor ainda NAO existe em `EditMorteSheet` nem em
   `EditConsumoSheet` (frente propria, junto da Operacao Comercial), entao
   as colunas nascem em travessao. Estao aqui para acenderem SOZINHAS quando
   o dado chegar: sem isto seriam trava invisivel, e acender depois exigiria
   voltar ao hook. `preco_arroba` fica de fora dos dois de proposito — a
   unidade deles e o QUILO. */
const LENTES_APLICAVEIS: Record<TipoMov, ReadonlySet<Lente>> = {
  nascimentos:     new Set(['cab', 'peso_medio_kg']),
  compras:         new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg', 'preco_kg']),
  transf_entradas: new Set(['cab', 'peso_medio_kg']),
  soma_entradas:   new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total', 'peso_medio_kg']),
  vendas:          new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg', 'preco_kg']),
  abates:          new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg']),
  consumos:        new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total', 'peso_medio_kg', 'preco_kg']),
  /* Percentual em qualquer lente, como o `desfrute_pct`: o card e a taxa. */
  mortalidade_pct: new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg', 'preco_kg']),
  mortes:          new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total', 'peso_medio_kg', 'preco_kg']),
  transf_saidas:   new Set(['cab', 'peso_medio_kg']),
  soma_saidas:     new Set(['cab', 'arroba_total', 'arroba_media', 'valor_total', 'peso_medio_kg']),
  desfrute:        new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg']),
  desfrute_pct:    new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg']),
  reposicao:       new Set(['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg', 'preco_kg']),
};

const TIPOS_TODOS: TipoMov[] = [
  'nascimentos', 'compras', 'transf_entradas', 'soma_entradas',
  'vendas', 'abates', 'consumos', 'mortes', 'transf_saidas',
  'soma_saidas', 'desfrute', 'desfrute_pct', 'mortalidade_pct',
  'reposicao',
];

const LENTES_TODAS: Lente[] = ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total', 'peso_medio_kg', 'preco_kg'];

// ─── HELPERS DE AGREGAÇÃO ────────────────────────────────────────────────────

type Agreg = { cab: number; arrobas: number; valor: number; peso: number };

function emptyAgreg(): Agreg {
  return { cab: 0, arrobas: 0, valor: 0, peso: 0 };
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
    /* PESO VIVO — `pesoMedioKg x quantidade`, a MESMA base de `calcArrobasSafe`
       (economicos.ts:88), entao peso e arroba ficam coerentes por construcao.
       NAO usar `l.pesoTotal`: medido no proto em 2026, ele esta nulo ou zero em
       17 de 22 COMPRAS (77%) e em 14 de 27 transferencias de entrada, enquanto
       `peso_medio_kg` esta preenchido em 100% dos lancamentos de todos os tipos.
       ⚠ E' esse o defeito de `montarMovimentacoes` (lib/painelConsultor/rebanho),
       que soma `l.pesoTotal` e por isso subestima o peso de compras hoje, em
       producao — independente deste bloco, e frente propria. */
    slot.peso += (Number(l.pesoMedioKg) || 0) * (Number(l.quantidade) || 0);
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
        out.peso += a.peso;
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

  // Desfrute % sempre retorna percentual (cab desfrutadas / saldo_inicial_ano × 100),
  // independente da lente da tela. Card próprio.
  if (tipo === 'desfrute_pct') {
    return calcDesfrute(agreg.cab, saldoInicialAno);
  }

  /* Mortalidade — a MESMA razao do desfrute (x ÷ saldo inicial x 100), entao
     a funcao e a mesma. Nao ha formula nova neste PR. */
  if (tipo === 'mortalidade_pct') {
    return calcDesfrute(agreg.cab, saldoInicialAno);
  }

  switch (lente) {
    case 'cab':
      // Antes 'desfrute' em cab retornava %; agora retorna Σ cabeças desfrutadas.
      // O % foi extraído para o card próprio 'desfrute_pct'.
      return agreg.cab;
    case 'arroba_total':
      /* Houve movimento e nao ha peso lancado -> AUSENCIA, nao zero arrobas.
         Sem cabeca nenhuma, zero e o numero certo: nada aconteceu. */
      if (agreg.cab > 0 && agreg.arrobas <= 0) return null;
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
    case 'peso_medio_kg':
      return agreg.cab > 0 ? agreg.peso / agreg.cab : null;
    case 'preco_kg': {
      /* Mesma guarda do `preco_arroba`: denominador ou numerador <= 0 devolve
         null, nunca zero — R$ 0,00/kg afirmaria preco, e o que ha e ausencia. */
      const base = (tipo === 'desfrute' && agregReceita) ? agregReceita : agreg;
      if (base.peso <= 0 || base.valor <= 0) return null;
      return base.valor / base.peso;
    }
    case 'valor_total':
      /* ⚠ A CORRECAO DO R$ 0,00. `Nascimentos — valor total` desenhava uma
         LINHA RETA NO ZERO nos treze meses, afirmando "houve 943 nascimentos
         e valeram nada". O certo e' travessao: houve movimento e o valor NAO
         FOI LANCADO — o campo nem existe em `EditMorteSheet`/`EditConsumoSheet`.
         Sem cabeca nenhuma o zero fica, porque ai nada aconteceu mesmo.
         ⚠ Zero EXPLICITO no banco e indistinguivel de ausencia: medido em
         2024-2026, ha 17 compras e 14 transferencias com `valor_total = 0`
         gravado. Nao ha como separar "lancado como zero" de "nao lancado",
         entao `<= 0` com movimento vira ausencia — a leitura conservadora. */
      if (agreg.cab > 0 && agreg.valor <= 0) return null;
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

export function useMovimentacoesAgregadas({ ano, mes, viewMode, isGlobal }: Args): MovimentacoesAgregadas {
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

  // Mapeamento tipo → tipos brutos depende de isGlobal (Σ Entradas inclui ou
  // não transf entrada conforme escopo). Memoizado para estabilidade.
  const TIPOS_LANC_DE_MOV = useMemo(() => getTiposLancDeMov(isGlobal), [isGlobal]);

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
          /* NaN, nao zero: e' aqui que a ausencia virava R$ 0,00 e desenhava
             a linha reta. NaN e' o idioma de ausencia das series do repo, e o
             recharts o trata como buraco com `connectNulls={false}`.
             ⚠ SEGURO para os tres consumidores existentes (V2VisaoGeralRebanho
             e os dois blocos de Fechamento): todos leem a lente `cab`, e `cab`
             nunca devolve null — contagem zero e' fato, nao ausencia. */
          real.push(   valorPorLente(tipo, lente, aR, saldoInicialAnoCorr, aRec_R) ?? NaN);
          anoAntS.push(valorPorLente(tipo, lente, aA, saldoInicialAnoAnt,  aRec_A) ?? NaN);
          metaS.push(  valorPorLente(tipo, lente, aM, saldoInicialMeta,    aRec_M) ?? NaN);

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
          realAcum.push(   valorPorLente(tipo, lente, aR_acum, saldoInicialAnoCorr, aRec_R_acum) ?? NaN);
          anoAntAcum.push( valorPorLente(tipo, lente, aA_acum, saldoInicialAnoAnt,  aRec_A_acum) ?? NaN);
          metaAcum.push(   valorPorLente(tipo, lente, aM_acum, saldoInicialMeta,    aRec_M_acum) ?? NaN);
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
  }, [lancCorr, lancAnoAnt, lancMeta, saldosCorr, saldosAnoAnt, ano, mes, viewMode, TIPOS_LANC_DE_MOV]);

  const saldoInicialAnual = useMemo(
    () => calcularSaldoInicialAno(saldosCorr, ano),
    [saldosCorr, ano],
  );

  return { loading, porTipo, saldoInicialAnual };
}
