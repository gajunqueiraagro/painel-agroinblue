import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useSnapshotAreaAnual, DESTINOS_AREA, type DestinoArea, type SnapshotAreaFazendaMes } from '@/hooks/useFechamentoArea';
import { useAreaPlanejamento } from '@/hooks/useAreaPlanejamento';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';
import {
  useRebanhoOficial,
  totalizarPorMes as totalizarViewPorMes,
} from '@/hooks/useRebanhoOficial';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { buildMonthlyDataFromView } from '@/lib/painelConsultor/buildMonthlyDataFromView';
import { montarComposicaoCategoria } from '@/lib/painelConsultor/rebanho/composicaoCategoria';
import { montarComposicaoFazenda } from '@/lib/painelConsultor/rebanho/composicaoFazenda';
import { montarMovimentacoes } from '@/lib/painelConsultor/rebanho/movimentacoes';
import type { PC100_Rebanho } from '@/lib/painelConsultor/rebanho/types';
import { montarCentrosCusto } from '@/lib/painelConsultor/financeiro/centrosCusto';
import type { PC100_Financeiro } from '@/lib/painelConsultor/financeiro/types';
import { useSaldoCaixaMensal } from '@/hooks/useSaldoCaixaMensal';
import { montarCaixaIndicador } from '@/lib/painelConsultor/financeiro/caixaIndicador';
import { calcularRunway } from '@/lib/painelConsultor/executivo/calcularRunway';
import type { PC100_Executivo } from '@/lib/painelConsultor/executivo/types';
import {
  agregaCusteioPecSemJuros,
  agregaJurosPec,
  agregaInvFazendaPec,
  agregaCusteioAgriSemJuros,
  agregaJurosAgri,
  agregaInvFazendaAgri,
  agregaInvBovinos,
  agregaAmortizacoes,
  agregaDividendos,
  // PR-PC100-RECEITAS-01 — os agregadores JA EXISTIAM em agregadosFinanceiros.ts, com
  // predicate proprio em classificacao.ts. O PC-100 e que nao os importava: o lado das
  // SAIDAS foi construido e o das RECEITAS ficou como "gap futuro". Ligar, nao construir.
  agregaReceitaPec,
  // PR-PC100-SILVICULTURA-01 — silvicultura ganha os mesmos cinco atomicos que
  // pecuaria e agricultura ja tinham. Predicates literais por grupo_custo.
  agregaReceitaSilvicola,
  agregaCusteioSilviSemJuros,
  agregaJurosSilvi,
  agregaInvFazendaSilvi,
  agregaAmortizacaoSilvi,
  agregaReceitaAgri,
  agregaOutrasReceitas,
  agregaEntradasFinanceiras,
  agregaCaptacaoPec,
  agregaCaptacaoAgri,
  agregaCaptacaoSilvi,
  agregaCaptacaoSemEscopo,
  agregaEntradasNaoClassificadas,
  agregaDeducoesSaida,
  agregaAmortizacaoPec,
  agregaAmortizacaoAgri,
  agregaTributos,
  agregaCusteioPecSemJurosMeta,
  agregaJurosPecMeta,
  agregaInvFazendaPecMeta,
  agregaCusteioAgriSemJurosMeta,
  agregaJurosAgriMeta,
  agregaInvFazendaAgriMeta,
  agregaInvBovinosMeta,
  agregaAmortizacoesMeta,
  agregaDividendosMeta,
  agregaReceitaPecMeta,
  agregaReceitaSilvicolaMeta,
  agregaCusteioSilviSemJurosMeta,
  agregaJurosSilviMeta,
  agregaInvFazendaSilviMeta,
  agregaAmortizacaoSilviMeta,
  agregaReceitaAgriMeta,
  agregaOutrasReceitasMeta,
  agregaEntradasFinanceirasMeta,
  agregaCaptacaoPecMeta,
  agregaCaptacaoAgriMeta,
  agregaCaptacaoSilviMeta,
  agregaCaptacaoSemEscopoMeta,
  agregaEntradasNaoClassificadasMeta,
  agregaDeducoesSaidaMeta,
  agregaAmortizacaoPecMeta,
  agregaAmortizacaoAgriMeta,
  agregaTributosMeta,
  agregaSaidasTotais,
  agregaSaidasTotaisMeta,
  agregaCustoFixoPec,
  agregaCustoVariavelPec,
  agregaCustoFixoAgri,
  agregaCustoFixoSilvi,
  agregaDeducoesPec,
  agregaDeducoesAgri,
  agregaDeducoesSilvi,
  agregaAportePessoal,
  agregaRetornoEmprestimos,
  agregaCustoFixoPecMeta,
  agregaCustoVariavelPecMeta,
  agregaCustoFixoAgriMeta,
  agregaCustoFixoSilviMeta,
  agregaDeducoesPecMeta,
  agregaDeducoesAgriMeta,
  agregaDeducoesSilviMeta,
  agregaAportePessoalMeta,
  agregaRetornoEmprestimosMeta,
} from '@/lib/painelConsultor/agregadosFinanceiros';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { composeGridMetaConsolidado } from '@/lib/painelConsultor/composeGridMetaConsolidado';
import {
  computePeriodGmd,
  rollingAvg,
  buildDesfruteCabMensal,
  TIPOS_DESFRUTE_OFICIAL,
} from '@/lib/calculos/painelConsultorIndicadores';
import { calcularIndicadoresEficienciaArea, calcularArrHaAcumulado,
         calcularRazaoEstoqueAcumulada, mediaIgnorandoZero } from '@/lib/calculos/eficienciaArea';
import type { StatusPilares } from '@/hooks/useStatusPilares';

interface Params {
  ano: number;
  mes: number;
  viewMode?: 'mes' | 'periodo';
  /** Quando false (default), o hook NÃO carrega/processa dados de meta — economiza N queries e o pesado buildMonthlyDataFromView. */
  carregarMeta?: boolean;
  /** Quando true, hook carrega ano-1 e calcula deltas/séries comparativas internamente (Cabeças). Default: false. */
  incluirComparativos?: boolean;
  /** Lançamentos pecuários compartilhados — quando fornecido, o hook NÃO carrega via useLancamentos. */
  lancPecExterno?: Lancamento[];
  /** Lançamentos financeiros compartilhados — quando fornecido, o hook NÃO carrega via useFinanceiro. */
  lancFinExterno?: FinanceiroLancamento[];
  /** Grid de planejamento financeiro (META) compartilhado — quando fornecido, o hook calcula serieMeta dos 13 indicadores soberanos. Default: undefined (slot serieMeta fica undefined). */
  gridMetaExterno?: SubcentroGrid[];
  /** Quando false, hooks internos pesados (rebanho, lançamentos, financeiro) ficam com enabled:false; o hook segue retornando o shape esperado mas com indicadores null. useSnapshotAreaAnual segue rodando (não aceita enabled). Default: true. */
  enabled?: boolean;
  /**
   * Quando true, o `incompletoOverride` (que neutraliza o realizado global
   * quando P1 não está fechado em todas as fazendas pec) é DESLIGADO,
   * permitindo que séries META sejam entregues mesmo nesse cenário.
   *
   * REGRA: este flag NÃO altera `dadosCompletos`, NÃO preserva séries
   * REALIZADO, NÃO interfere em validação de P1. Só evita o retorno
   * terminal nulo que bloqueia o consumidor de receber as séries META.
   *
   * Default: false (comportamento histórico — Painel Consultor / Realizado
   * Global continua protegido pelo override).
   *
   * Consumidor oficial: V2 Planejamento > Visão Geral, que precisa renderizar
   * META 2026 do Bloco "Produção Pecuária" independentemente do P1 do
   * realizado estar completo.
   */
  preservarMetaQuandoGlobalIncompleto?: boolean;
}

export type StatusValidacaoArea =
  | 'ok'
  | 'sem_area'
  | 'sem_snapshot'
  | 'p1_aberto'
  | 'p1_fechado_sem_snap'
  | 'incompleto'
  | 'carregando';

/**
 * Shape compartilhado dos indicadores financeiros oficiais (Etapa 2B).
 * Mesma forma usada em receitaPecIndicador, custeioPecIndicador etc.
 * Não substitui os indicadores existentes — usado apenas pelos campos
 * novos da Etapa 2B (saídas totais, juros, desembolsos, caixa…).
 */
export interface IndicadorFinanceiroShape {
  label:        string;
  titulo:       string;
  subtitulo:    string;
  /** As duas leituras. Ver TitulosPorModo. */
  titulos?:     TitulosPorModo;
  valor:        number | null;
  deltaMes:     number | null;
  deltaAno:     number | null;
  deltaMeta:    number | null;
  serieAno:     number[];
  serieAnoAnt?: number[];
  serieMeta?:   number[];
  /** As duas leituras. Ver SeriesPorModo. */
  series?:      SeriesPorModo;
}

/* PR-HOME-MODAL-DOIS-GRAFICOS-01 — as DUAS leituras, sempre ambas.
   `series` aninhado, nao seis campos flat: a ausencia de uma serie fica
   local e legivel (`series.periodo.meta === undefined`) em vez de espalhada
   em opcionais soltos. E `serieAno` continua escolhendo por viewMode —
   nenhum consumidor atual muda.
   Existe porque o modal mostra os dois graficos AO MESMO TEMPO e nao pode
   calcular: a regra do IndicadorHistoricoModal:16-20 existe para o modal
   nunca discordar do tile que o abriu. */
/* Titulo e subtitulo POR LEITURA, ao lado de `titulo`/`subtitulo`.
   Com as duas leituras visiveis ao mesmo tempo, um titulo unico mente sobre
   uma delas. `titulo` continua colapsado por viewMode — nenhum consumidor
   atual muda. Mesmo padrao do `series`.
   As quatro strings sao as MESMAS do ternario acima em cada indicador: se um
   dos dois mudar, o outro tem de mudar junto. */
export interface TitulosPorModo {
  mes:     { titulo: string; subtitulo: string };
  periodo: { titulo: string; subtitulo: string };
}

export interface SeriesPorModo {
  mes:     { ano: number[]; anoAnt?: number[]; meta?: number[] };
  periodo: { ano: number[]; anoAnt?: number[]; meta?: number[] };
}

export interface PainelConsultorDataResult {
  cabecas: number | null;
  pesoMedio: number | null;
  gmd: number | null;
  arrobas: number | null;
  desfrute: number | null;
  receita: number | null;
  desembolso: number | null;
  resultado: number | null;
  valorRebanhoMes: number | null;
  areaProdutivaMes: number | null;
  /** C4 — Área META oficial (estoque mensal; NÃO acumula em viewMode='periodo'). */
  areaPecuariaMetaMes: number | null;
  areaAgriculturaMetaMes: number | null;
  areaTotalMetaMes: number | null;
  areaPecuariaMetaPorMes: (number | null)[];
  areaAgriculturaMetaPorMes: (number | null)[];
  areaTotalMetaPorMes: (number | null)[];
  /** C4.2 — Área REALIZADA via snapshots de fechamento_pasto_itens. Estoque; NÃO acumula. */
  areaPecuariaRealMes: number | null;
  areaAgriculturaRealMes: number | null;
  areaProdutivaRealMes: number | null;
  areaPecuariaRealPorMes: (number | null)[];
  areaAgriculturaRealPorMes: (number | null)[];
  areaProdutivaRealPorMes: (number | null)[];
  /**
   * PR-HOME-AREA-COMPOSICAO-01 — as seis series restantes do snapshot de area,
   * mesmo idioma das tres acima: null = mes sem snapshot (a tela exibe "—"),
   * 0 = valor real. Estoque mensal; NAO acumula em viewMode='periodo'.
   */
  areaTotalRealPorMes: (number | null)[];
  areaSilviculturaRealPorMes: (number | null)[];
  areaReservaRealPorMes: (number | null)[];
  areaAppRealPorMes: (number | null)[];
  areaBenfeitoriasRealPorMes: (number | null)[];
  areaOutrasRealPorMes: (number | null)[];
  /**
   * PR-HOME-AREA-TABELA-FAZENDA-01 — composicao por FAZENDA do mes selecionado,
   * ordenada por area total desc. So tem conteudo no escopo Global; em escopo de
   * fazenda a lista traz a unica fazenda e a tela nao exibe o bloco.
   */
  areaPorFazendaMes: SnapshotAreaFazendaMes[];
  /* snapshotsFazenda exposto: a serie de area por fazenda-mes ja era
     carregada e colapsada em areaPorFazendaMes. A lotacao do periodo
     precisa dela ANTES do colapso — media dos UA/ha mensais, nao razao de
     medias. Publicar o que ja se calcula; nao duplicar a leitura de
     fechamento_area_snapshot num segundo hook.
     NAO e anulado em incompletoOverride: e area, nao indicador dependente
     de P1 — mesma regra de areaPorFazendaMes, que tambem passa intacto. */
  snapshotsFazenda: SnapshotAreaFazendaMes[];
  /**
   * PR-PC100-AREAS-01 — repartição REALIZADA por destino, uma série de 12 por
   * destino. null = mês sem snapshot (exibe "—"); 0 = destino sem pasto no mês.
   * Recalculada de fechamento_pastos; não sai do snapshot.
   */
  areaDestinoRealPorMes: Record<DestinoArea, (number | null)[]>;
  lotUaHa: number | null;
  kgHa: number | null;
  arrHa: number | null;
  statusArea: StatusValidacaoArea;
  faltandoCount: number;
  statusPilares: StatusPilares | null;
  /** False quando GLOBAL e nem todas as fazendas pec do cliente têm P1 fechado no(s) mês(es) avaliado(s). */
  dadosCompletos: boolean;
  /** Séries mensais Jan–Dez do cenário REALIZADO. null durante loading ou em incompletoOverride. */
  seriesMensais: {
    cabFin:             number[];
    cabMediaAcumulada:  number[];   // média Jan→mes, índice 1=Jan…12=Dez
    pesoMedioFin:       number[];
    arrobasProd:        number[];
    gmd:                number[];
    desfruteCab:        number[];
    valorRebFin:        number[];
  } | null;
  /** Séries mensais Jan–Dez do cenário META. null se não houver meta carregada. */
  seriesMeta: {
    cabFin:       number[];
    pesoMedioFin: number[];
    arrobasProd:  number[];
    gmd:          number[];
  } | null;
  /**
   * Foto Dez ano-1 REALIZADO — saldo final cabeças (= rebanho INICIAL do ano).
   * Independente de viewMode (não é média acumulada). Fonte: cabFinAnoAntSerie[12].
   */
  cabecasFinFotoAnoAnt: number | null;
  /**
   * Foto Dez ano-1 REALIZADO — peso médio final ponderado (peso_total/cab).
   * Independente de viewMode. Fonte: pesoMedioFinAnoAnt13[12].
   */
  pesoMedioFinFotoAnoAnt: number | null;
  /**
   * Peso médio final META Dez/ano — snapshot validado oficial (mesma fonte
   * usada pela tabela Rebanho META). Ponderado por cabeças no Global.
   * Fonte: valor_rebanho_meta_validada.peso_medio_kg × cabecas / Σcabecas.
   * null quando snapshot ausente — não inverte para view zoot.
   */
  pesoMedioFinMetaSnap: number | null;
  /** Indicador de Cabeças/Rebanho com tudo pronto para o card e o modal. */
  cabecasIndicador: {
    label:     string;
    titulo:    string;
    subtitulo: string;
    titulos?:   TitulosPorModo;
    valor:     number | null;
    deltaMes:  number | null;
    deltaAno:  number | null;
    deltaMeta: number | null;
    serieAno:  number[];   // tamanho 13, índice 1=Jan…12=Dez (índice 0 = NaN)
    serieAnoAnt?: number[];
    serieMetaIndicador?: number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /** Indicador de Peso Médio com tudo pronto para o card e o modal. */
  pesoMedioIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /** Indicador de GMD com tudo pronto para o card e o modal. */
  gmdIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /** Indicador de UA/ha (lotação) — sem ano anterior nesta fase. */
  uaHaIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /** Indicador kg vivo/ha (peso total do rebanho / área) — sem ano anterior nesta fase. */
  kgHaIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /** Indicador @ produzidas — fluxo (mês = valor do mês; período = acumulado Jan→mês). */
  arrobasIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /**
   * Indicador Desfrute (cab.) — fluxo (mês = abate+venda+consumo do mês;
   * período = acumulado Jan→mês). Sem ano anterior nem meta (PC-100 também não expõe).
   */
  desfruteIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;   // sempre null nesta fase
    deltaMeta:  number | null;   // sempre null nesta fase
    serieAno:   number[];
    serieAnoAnt?: number[];      // ausente nesta fase
    serieMeta?:  number[];       // ausente nesta fase
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /**
   * Indicador Desfrute (@) — arrobas desfrutadas no fluxo
   * (abate + venda em pé + consumo). Mesmas regras semânticas do
   * desfruteIndicador (cab.), porém em arrobas.
   *
   * Real: monthlyData.desfrute_arr.
   * Ano-1 e meta: pecAnoAnt12.desfArr / pecMeta12.desfArr (mesmas
   * queries diretas a 'lancamentos' que alimentam precoArrIndicador).
   */
  desfruteArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Desfrute (@) em PERCENTUAL — @ desfrutadas / @ iniciais.
   * Mês = desfrute_arr[m] / (pesoTotalIni[m]/30). Período = razão de SOMAS.
   * NÃO confundir com `desfruteArrIndicador` (arrobas absolutas, 3 consumidores)
   * nem com `desfruteIndicador` (cabeças). São três indicadores distintos.
   */
  desfrutePctArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
  } | null;
  /**
   * Indicador Valor do Rebanho — patrimônio (estoque).
   * Mês = posição final do mês. Período = MESMO VALOR (não soma, não média).
   * Fonte: valor_rebanho_realizado_validado (Fazenda) / vw_valor_rebanho_realizado_global_mensal (Global).
   * Meta: valor_rebanho_meta_validada (somente Fazenda — não há fonte Global).
   */
  valorRebanhoIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /**
   * Valor do rebanho AO PRECO DE DEZEMBRO DO ANO ANTERIOR — irmao do
   * `valorRebanhoIndicador`, mesma forma. A diferenca entre os dois E o
   * efeito de mercado: com ele, "quanto vale hoje"; sem ele, "quanto
   * valeria ao preco do inicio do ano".
   * `null` quando `incluirComparativos` e false — sem o ano anterior nao ha
   * de onde tirar o preco congelado, e zero afirmaria patrimonio nulo.
   */
  /** @ em ESTOQUE — peso vivo total / 30. Par patrimonial do "@ produzidas".
   *  `mes` e `periodo` sao a MESMA serie: estoque nao acumula. */
  arrobasEstoqueIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  /** @ produzidas por hectare de area PECUARIA. Fluxo.
   *  Mensal: `monthlyData.arrHa`, da fonte unica `eficienciaArea`.
   *  Acumulado: Σ arrobas ÷ MEDIA da area, nao Σ das razoes — ver
   *  `calcularArrHaAcumulado`. Ano anterior desde o PR-ATIVIDADE-09: a area
   *  do ano-1 entrou por `snapshotsAnoAnt`, sem query nova. */
  arrobasHaIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  /** Hectares de pecuaria. A MESMA serie que divide `@/ha`, `lotUaHa` e
   *  `kgHa` — declarada no rotulo para nao colidir com as outras duas
   *  "produtivas" do hook. `mes` e a foto; `periodo` e a MEDIA acumulada. */
  areaProdutivaPecIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  /** R$ por @ em ESTOQUE. Pode divergir do `preco_arroba_medio` publicado
   *  quando avaliacao e fechamento discordam do peso — ver o comentario no
   *  corpo do hook. Sem meta: nao ha meta de preco de estoque. */
  precoArrEstoqueIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  valorRebanhoSemEfeitoIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  /**
   * Receita Pecuária Competência — fonte: monthlyData.recPecComp (lancPec desfrute, valorTotal/competência).
   * Mês = recPecComp[m]. Período = Σ recPecComp Jan→m.
   * Ano-1 e meta: queries diretas a 'lancamentos' (cenario='realizado'/'meta', TIPOS_DESFRUTE).
   */
  receitaPecIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /**
   * Custeio Produção Pecuária — fonte: monthlyData.custeioPec
   *   (lancFin grupo_custo IN ('Custo Fixo Pecuária', 'Custo Variável Pecuária')).
   * Mês = custeioPec[m]. Período = Σ custeioPec Jan→m.
   * Ano-1: query direta a financeiro_lancamentos_v2 (status='realizado').
   * Meta: query direta a planejamento_financeiro (cenario='meta').
   */
  custeioPecIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    series?: SeriesPorModo;
  } | null;
  /**
   * Custo Produtivo R$/@ — derivado: custeioPec / arrobasProd.
   * Mês = custeioPec[m]/arrobasProd[m]. Período = Σ custeioPec / Σ arrobasProd.
   * Ano-1 e meta: derivados das séries custeioPec ano-1/meta e arrobasProd ano-1/meta.
   */
  custoArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
    /** Valor do mês (1=Jan…12=Dez, 0=NaN): custeioPec[m]/arrobasProd[m]. Sempre mensal, independe de viewMode. */
    serieMensal: number[];
  } | null;
  /**
   * Preço de Venda R$/@ — derivado: recPecComp / desfrute_arr.
   * Mês = recPecComp[m]/desfrute_arr[m]. Período = Σ recPecComp / Σ desfrute_arr.
   * Ano-1 e meta: derivados das mesmas queries diretas a 'lancamentos' (pecAnoAnt12/pecMeta12).
   */
  precoArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;
  /**
   * Custo por Cabeça R$/cab — derivado: custeioPec / cabMedia.
   * Mês = custeioPec[m]/cabMediaMes[m]. Período = (Σ custeioPec / cabMediaAcumulada) / numMeses.
   * Ano-1 e meta: derivados de custeioPec ano-1/meta e cabMedia ano-1/meta.
   */
  custoCabIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
    /** Valor do mês (1=Jan…12=Dez, 0=NaN): custeioPec[m]/cabMediaMes[m]. Sempre mensal, independe de viewMode. */
    serieMensal: number[];
  } | null;
  /**
   * Margem por @ — derivado: precoArr − custoArr.
   * Mês = precoArrMes − custoArrMes. Período = precoArrPeriodo − custoArrPeriodo.
   * Ano-1 e meta: derivados das séries de Preço de Venda e Custo R$/@.
   */
  margemArrIndicador: {
    label:      string;
    titulo:     string;
    subtitulo:  string;
    titulos?:   TitulosPorModo;
    valor:      number | null;
    deltaMes:   number | null;
    deltaAno:   number | null;
    deltaMeta:  number | null;
    serieAno:   number[];
    serieAnoAnt?: number[];
    serieMeta?:  number[];
    /** As duas leituras. Ver SeriesPorModo. */
    series?: SeriesPorModo;
  } | null;

  // ─── Indicadores financeiros oficiais — Etapa 2B (shape only) ───
  // Todos retornam null nesta etapa; o cálculo entra na 2C/2D.
  saidasTotaisIndicador:        IndicadorFinanceiroShape | null;
  jurosPecIndicador:            IndicadorFinanceiroShape | null;
  custeioPecComJurosIndicador:  IndicadorFinanceiroShape | null;
  investPecIndicador:           IndicadorFinanceiroShape | null;
  desembolsoPecIndicador:       IndicadorFinanceiroShape | null;
  custeioAgriIndicador:         IndicadorFinanceiroShape | null;
  jurosAgriIndicador:           IndicadorFinanceiroShape | null;
  custeioAgriComJurosIndicador: IndicadorFinanceiroShape | null;
  investAgriIndicador:          IndicadorFinanceiroShape | null;
  desembolsoAgriIndicador:      IndicadorFinanceiroShape | null;
  investBovinosIndicador:       IndicadorFinanceiroShape | null;
  amortizacoesIndicador:        IndicadorFinanceiroShape | null;
  dividendosIndicador:          IndicadorFinanceiroShape | null;
  caixaIndicador:               IndicadorFinanceiroShape | null;

  // ─── PR-PC100-RECEITAS-01 — lado das ENTRADAS e as duas amortizacoes ───
  // amortizacoesIndicador acima CONTINUA sendo o TOTAL e tem consumidores; os dois
  // abaixo sao o par detalhado.
  //
  // Silvicultura entra por grupo_custo literal ('Receita Silvícola'), via
  // isReceitaSilvicola — mesmo critério de pecuária e agricultura. O tipo
  // Escopo NÃO foi tocado: silvicultura não é um escopo no código, é um
  // grupo no plano de contas.
  receitaAgriIndicador:         IndicadorFinanceiroShape | null;
  receitaOutrasIndicador:       IndicadorFinanceiroShape | null;
  /**
   * Receita Pecuária CAIXA — fonte: financeiro_lancamentos_v2 por
   * data_pagamento, grupo_custo='Receita Pecuária' (isReceitaPecuaria).
   *
   * NÃO CONFUNDIR com receitaPecIndicador, que é COMPETÊNCIA zootécnica
   * (lancamentos, abate/venda/consumo por data de movimentação) e é a
   * fonte soberana da DRE. As duas DEVEM divergir: venda/abate pode
   * existir sem movimentação financeira no período, e recebimento pode
   * ocorrer meses depois. Nunca forçar a bater.
   */
  receitaPecCaixaIndicador:     IndicadorFinanceiroShape | null;
  /**
   * Silvicultura — quatro indicadores soberanos de CAIXA, mesmo padrão de
   * pecuária e agricultura: grupo_custo literal, sem passar por getEscopo().
   * Atividade própria (ciclo plurianual, formação capitalizada), não
   * subconjunto de agricultura. Ver isReceitaSilvicola em classificacao.ts.
   */
  receitaSilvicolaIndicador:    IndicadorFinanceiroShape | null;
  custeioSilviIndicador:        IndicadorFinanceiroShape | null;
  investSilviIndicador:         IndicadorFinanceiroShape | null;
  amortizacaoSilviIndicador:    IndicadorFinanceiroShape | null;
  captacaoIndicador:            IndicadorFinanceiroShape | null;
  /**
   * Captacao aberta por escopo. Os quatro PARTICIONAM captacaoIndicador, que
   * permanece como TOTAL: a soma dos quatro tem que bater com ele, e a tela
   * exibe a divergencia se nao bater (subcentro novo fora do mapa).
   */
  /* PR-PC100-BLOCO-CAIXA-01 — nove indicadores por ESCOPO. Custo Fixo e
     Custo Variavel Pecuaria vem dos predicates ESTRITOS; somados dao
     custeioPecSemJuros, e essa e a conferencia de fechamento do bloco. */
  /* jurosSilvi ja existia no _finSoberano desde a frente de silvicultura,
     mas nunca foi exposto no retorno — nenhum consumidor o pedia. */
  jurosSilviIndicador:           IndicadorFinanceiroShape | null;
  custoFixoPecIndicador:         IndicadorFinanceiroShape | null;
  custoVariavelPecIndicador:     IndicadorFinanceiroShape | null;
  custoFixoAgriIndicador:        IndicadorFinanceiroShape | null;
  custoFixoSilviIndicador:       IndicadorFinanceiroShape | null;
  deducoesPecIndicador:          IndicadorFinanceiroShape | null;
  deducoesAgriIndicador:         IndicadorFinanceiroShape | null;
  deducoesSilviIndicador:        IndicadorFinanceiroShape | null;
  aportePessoalIndicador:        IndicadorFinanceiroShape | null;
  retornoEmprestimosIndicador:   IndicadorFinanceiroShape | null;
  captacaoPecIndicador:         IndicadorFinanceiroShape | null;
  captacaoAgriIndicador:        IndicadorFinanceiroShape | null;
  captacaoSilviIndicador:       IndicadorFinanceiroShape | null;
  captacaoSemEscopoIndicador:   IndicadorFinanceiroShape | null;
  /* Residuo de entrada: grupo que nao casa com nenhum oficial. Existe para nada sumir
     do total sem aviso — a linha da tela so aparece quando ha valor. */
  entradasNaoClassificadasIndicador: IndicadorFinanceiroShape | null;
  amortizacaoPecIndicador:      IndicadorFinanceiroShape | null;
  amortizacaoAgriIndicador:     IndicadorFinanceiroShape | null;
  deducoesTributosIndicador:    IndicadorFinanceiroShape | null;
  /* PR-CLASSIF-TRIBUTOS-01 — tributos tem indicador PROPRIO. Nao procure dentro de
     deducoesTributosIndicador acima: ele entrega SO deducoes de receitas. Deducao e
     ajuste de receita; tributo e saida patrimonial e fiscal. */
  tributosIndicador:            IndicadorFinanceiroShape | null;

  /** Domínio rebanho · estruturas executivas (Fase 0 Step 2.2). */
  rebanho: PC100_Rebanho;

  /** Domínio financeiro · breakdowns financeiros (Fase 0 Step 2.4). */
  financeiro: PC100_Financeiro;

  /** Domínio executivo · derivações de leitura (Step 2.1*). */
  executivo: PC100_Executivo;

  loading: boolean;
}

export function usePainelConsultorData({ ano, mes, viewMode = 'mes', carregarMeta = false, incluirComparativos = false, enabled = true, lancPecExterno, lancFinExterno, gridMetaExterno, preservarMetaQuandoGlobalIncompleto = false }: Params): PainelConsultorDataResult {
  const { fazendaAtual, isGlobal, fazendasComPecuaria } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const { clienteAtual } = useCliente();

  const { areaMensal, snapshots, snapshotsFazenda, totalFazendasAtivas, fazendasAtivasCarregadas, fazendasComSnapPorMes, fazendasComP1PorMes, temP1FechadoPorMes, loading: loadingArea } = useSnapshotAreaAnual(
    ano,
    isGlobal ? undefined : fazendaId,
    isGlobal,
    clienteAtual?.id,
    enabled,
  );

  // Área do ano anterior — necessária para deltaAno de UA/ha e kg vivo/ha.
  // useSnapshotAreaAnual não tem param `enabled`; carrega incondicionalmente.
  // Custo: +3 queries leves; aceitável conforme decisão D1 prévia.
  /* PR-ATIVIDADE-09 — `snapshots` entrou na desestruturacao: a requisicao
     ja acontecia e o resultado era descartado. Nenhuma query nova. E o que
     destrava o ano anterior do `areaProdutivaPec` E do `arrobasHa`. */
  const { areaMensal: areaMensalAnoAnt, snapshots: snapshotsAnoAnt } = useSnapshotAreaAnual(
    ano - 1,
    isGlobal ? undefined : fazendaId,
    isGlobal,
    clienteAtual?.id,
    enabled,
  );

  // C4 — Área META oficial (dado estrutural; não acumula).
  const { data: areaMetaData } = useAreaPlanejamento(
    clienteAtual?.id ?? null,
    isGlobal ? null : fazendaId ?? null,
    ano,
    isGlobal,
    enabled,
  );

  // C4 / C4.2 — Derivações por cenário (movidas pra cá para serem consumidas
  // pelos callsites de monthlyData / monthlyDataMeta / kgHaPorMes / kgHaPorMesMeta).
  // Estoque mensal; NÃO acumula em viewMode='periodo'.
  const areaMetaPorMes = areaMetaData?.porMes ?? null;
  const areaMetaIdx = Math.max(0, Math.min(11, (mes ?? 1) - 1));
  const areaPecuariaMetaPorMes = useMemo<(number | null)[]>(
    () => areaMetaPorMes?.map(m => m.area_pecuaria_ha) ?? Array(12).fill(null),
    [areaMetaPorMes],
  );
  const areaAgriculturaMetaPorMes = useMemo<(number | null)[]>(
    () => areaMetaPorMes?.map(m => m.area_agricultura_ha) ?? Array(12).fill(null),
    [areaMetaPorMes],
  );
  const areaTotalMetaPorMes = useMemo<(number | null)[]>(
    () => areaMetaPorMes?.map(m => m.area_total_ha) ?? Array(12).fill(null),
    [areaMetaPorMes],
  );

  // C4.2 — Área REALIZADA via snapshots (já no escopo). Estoque mensal; NÃO acumula.
  // snapshots: SnapshotAreaMes[] não-posicional — indexar via .find por mes.
  const areaRealIdx = areaMetaIdx;
  const areaPecuariaRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_pecuaria_ha : null;
    }),
    [snapshots],
  );
  /* Ano anterior da MESMA coluna, mesmo idioma. `snapshots` de
     `useFechamentoArea` traz a pecuaria RECALCULADA de `fechamento_pastos`
     (useFechamentoArea:343), nao a coluna crua do snapshot — e' por isso
     que a media Jan-Jul da NJ da 4.861,42 e nao 4.832,96. */
  const areaPecuariaRealAnoAntPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshotsAnoAnt.find(x => x.mes === i + 1);
      return s ? s.area_pecuaria_ha : null;
    }),
    [snapshotsAnoAnt],
  );
  const areaAgriculturaRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_agricultura_ha : null;
    }),
    [snapshots],
  );
  const areaProdutivaRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_produtiva_ha : null;
    }),
    [snapshots],
  );
  // PR-HOME-AREA-COMPOSICAO-01 — mesmo idioma das tres acima. As seis colunas
  // restantes do snapshot, cruas, para o bloco de composicao da area.
  const areaTotalRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_total_ha : null;
    }),
    [snapshots],
  );
  const areaSilviculturaRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_silvicultura_ha : null;
    }),
    [snapshots],
  );
  const areaReservaRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_reserva_ha : null;
    }),
    [snapshots],
  );
  const areaAppRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_app_ha : null;
    }),
    [snapshots],
  );
  const areaBenfeitoriasRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_benfeitorias_ha : null;
    }),
    [snapshots],
  );
  const areaOutrasRealPorMes = useMemo<(number | null)[]>(
    () => Array.from({ length: 12 }, (_, i) => {
      const s = snapshots.find(x => x.mes === i + 1);
      return s ? s.area_outras_ha : null;
    }),
    [snapshots],
  );
  // PR-HOME-AREA-TABELA-FAZENDA-01 — a mesma composicao, sem agregar fazendas.
  // PR-PC100-AREA-FAZENDA-PERIODO-01 — e agora sensivel ao viewMode.
  const areaPorFazendaMes = useMemo(() => {
    const ateMes = areaRealIdx + 1;

    if (viewMode !== 'periodo') {
      return snapshotsFazenda
        .filter(s => s.mes === ateMes)
        .sort((a, b) => b.area_total_ha - a.area_total_ha);
    }

    /* MEDIA POR FAZENDA, Jan -> mes selecionado. Media dos meses em que a
       fazenda TEM snapshot: mes sem fechamento e ausencia, nao zero — contar
       zero faria a area da fazenda encolher so porque um mes nao fechou.
       Divisor por fazenda, nunca fixo: fazenda que fechou 3 dos 7 meses
       divide por 3.

       O campo `mes` das linhas devolvidas carrega o mes FINAL do intervalo,
       NAO um mes real de snapshot — quem consumir precisa saber disso. O tipo
       continua SnapshotAreaFazendaMes: a tela nao precisa saber se e foto ou
       media, so as duas leituras precisam ter o mesmo formato. */
    const porFazenda = new Map<string, SnapshotAreaFazendaMes[]>();
    for (const s of snapshotsFazenda) {
      if (s.mes > ateMes) continue;
      const arr = porFazenda.get(s.fazenda_id) ?? [];
      arr.push(s);
      porFazenda.set(s.fazenda_id, arr);
    }

    const media = (arr: SnapshotAreaFazendaMes[], campo: keyof SnapshotAreaFazendaMes) =>
      arr.reduce((acc, s) => acc + (Number(s[campo]) || 0), 0) / arr.length;

    return Array.from(porFazenda.entries())
      .map(([fazenda_id, arr]) => ({
        fazenda_id,
        mes: ateMes,
        area_total_ha:        media(arr, 'area_total_ha'),
        area_produtiva_ha:    media(arr, 'area_produtiva_ha'),
        area_pecuaria_ha:     media(arr, 'area_pecuaria_ha'),
        area_agricultura_ha:  media(arr, 'area_agricultura_ha'),
        area_silvicultura_ha: media(arr, 'area_silvicultura_ha'),
        area_reserva_ha:      media(arr, 'area_reserva_ha'),
        area_app_ha:          media(arr, 'area_app_ha'),
        area_benfeitorias_ha: media(arr, 'area_benfeitorias_ha'),
        area_outras_ha:       media(arr, 'area_outras_ha'),
      }))
      .sort((a, b) => b.area_total_ha - a.area_total_ha);
  }, [snapshotsFazenda, areaRealIdx, viewMode]);
  // PR-PC100-AREAS-01 — mesmo idioma das três acima: `find` por mês e null quando
  // o mês não tem snapshot, para o painel exibir "—" em vez de zero inventado.
  const areaDestinoRealPorMes = useMemo<Record<DestinoArea, (number | null)[]>>(
    () => Object.fromEntries(
      DESTINOS_AREA.map(d => [
        d,
        Array.from({ length: 12 }, (_, i) => {
          const s = snapshots.find(x => x.mes === i + 1);
          return s ? s.destinos[d] : null;
        }),
      ]),
    ) as Record<DestinoArea, (number | null)[]>,
    [snapshots],
  );

  // C5.1 — séries number[] para buildMonthlyDataFromView e divisores diretos
  // (kg/ha). null → NaN; buildMonthlyDataFromView trata NaN como ausência via
  // fallback interno → 0, e calcularIndicadoresEficienciaArea retorna NaN
  // quando área = 0. Cadeia preserva "sem base validada".
  const areaPecuariaRealNumPorMes = useMemo<number[]>(
    () => areaPecuariaRealPorMes.map(v => v ?? NaN),
    [areaPecuariaRealPorMes],
  );
  const areaPecuariaMetaNumPorMes = useMemo<number[]>(
    () => areaPecuariaMetaPorMes.map(v => v ?? NaN),
    [areaPecuariaMetaPorMes],
  );
  const areaPecuariaRealAnoAntNumPorMes = useMemo<number[]>(
    () => areaPecuariaRealAnoAntPorMes.map(v => v ?? NaN),
    [areaPecuariaRealAnoAntPorMes],
  );
  /* Regra do periodo: media ACUMULADA dos meses COM area, ignorando nulo,
     NaN e ZERO. Area zero nao e area pequena: e mes sem fechamento.
     E a MESMA regra do `mediaIgnorandoNulos` do PainelConsultorTab
     (alinhadas em 24/08) e do `calcularArrHaAcumulado`. As tres
     coincidirem e o que mantem o circuito fechado nas duas telas:
     @ produzidas (periodo) ÷ area (periodo) = @/ha (periodo),
     no Executivo e no modal. */
  const mediaAreaAcumulada12 = mediaIgnorandoZero;
  /* 12 -> 13 com NaN em [0], como `arrobasHa` ja faz. O chip "no ano" nasce
     desabilitado por consequencia, e esta correto: nao ha dezembro do ano-1
     nesta serie. */
  const areaTo13 = (serie12: (number | null)[]): number[] =>
    Array.from({ length: 13 }, (_, i) => (i === 0 ? NaN : (serie12[i - 1] ?? NaN)));

  const {
    rawCategorias: viewDataRealizado,
    getCategoriasDetalhe,
    loading: loadingRebanho,
  } = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal, enabled });

  // Meta é carregada quando carregarMeta=true OU incluirComparativos=true
  // (cabecasIndicador.deltaMeta precisa de seriesMeta).
  const carregarMetaEffective = carregarMeta || incluirComparativos;

  const {
    rawCategorias: viewDataMetaRaw,
  } = useRebanhoOficial({ ano, cenario: 'meta', global: isGlobal, enabled: enabled && carregarMetaEffective });

  // ─── GRID META FINANCEIRO CONSOLIDADO — fonte soberana única ─────────────
  // Espelha o mesmo grid que o Fluxo de Caixa META renderiza visualmente:
  //   buildGrid() de planejamento_financeiro + composeGridMetaConsolidado
  //   somando os 4 streams auto (rebanho, financiamento, nutrição, projetos).
  //
  // Indicadores soberanos _finSoberano.* (custeioPec, juros, invFaz, etc.) E
  // o legado custeioPecMeta12 consomem EXCLUSIVAMENTE este grid. Não há
  // mais query direta a planejamento_financeiro neste hook para META.
  //
  // gridMetaExterno (param) permanece no contrato mas é IGNORADO pela
  // lógica META interna. Callers atuais (PainelConsultorTab,
  // usePlanejamentoAprovacaoData) passavam grid manual cru — mesma raiz do
  // bug do custeioPecMeta12. Consolidar interno garante 1 fonte única e
  // consistente em V2 Visão Geral Planejamento, PainelConsultorTab/Auditoria
  // e usePlanejamentoAprovacaoData.
  //
  // buildGrid de usePlanejamentoFinanceiro é useCallback estável
  // (deps: planoContas, savedData, dividendos). Padrão de uso replicado
  // de V2PlanejamentoVisaoGeral.tsx L50.
  const _planFinInterno = usePlanejamentoFinanceiro(
    ano,
    isGlobal ? undefined : fazendaId,
    enabled,
  );
  const _gridMetaBaseInterno = useMemo(
    () => _planFinInterno.buildGrid(),
    [_planFinInterno.buildGrid, _planFinInterno.loading],
  );
  const gridMetaConsolidado = useMemo<SubcentroGrid[]>(
    () => composeGridMetaConsolidado(_gridMetaBaseInterno, {
      lancamentosRebanho: _planFinInterno.lancamentosRebanho,
      lancamentosFinanciamento: _planFinInterno.lancamentosFinanciamento,
      lancamentosNutricao: _planFinInterno.lancamentosNutricao,
      lancamentosProjetos: _planFinInterno.lancamentosProjetos,
    }),
    [
      _gridMetaBaseInterno,
      _planFinInterno.lancamentosRebanho,
      _planFinInterno.lancamentosFinanciamento,
      _planFinInterno.lancamentosNutricao,
      _planFinInterno.lancamentosProjetos,
    ],
  );

  const viewDataMeta = carregarMetaEffective ? viewDataMetaRaw : null;

  const {
    rawCategorias: viewDataAnoAnt,
  } = useRebanhoOficial({
    ano: ano - 1,
    cenario: 'realizado',
    global: isGlobal,
    enabled: enabled && incluirComparativos === true,
  });

  const viewTotalsAnoAnt = useMemo(
    () => incluirComparativos && viewDataAnoAnt
      ? totalizarViewPorMes(viewDataAnoAnt)
      : null,
    [viewDataAnoAnt, incluirComparativos],
  );

  const viewTotals = useMemo(
    () => totalizarViewPorMes(viewDataRealizado ?? []),
    [viewDataRealizado],
  );

  const viewTotalsMeta = useMemo(
    () => carregarMetaEffective ? totalizarViewPorMes(viewDataMeta ?? []) : ({} as ReturnType<typeof totalizarViewPorMes>),
    [viewDataMeta, carregarMetaEffective],
  );

  // Só usar externo quando tiver dado real — array vazio [] = ainda carregando
  const usarLancPecExterno = Array.isArray(lancPecExterno) && lancPecExterno.length > 0;
  const usarLancFinExterno = Array.isArray(lancFinExterno) && lancFinExterno.length > 0;

  /* `ano` no fetch, nao so no filtro. Sem ele os dois hooks baixam o
     historico INTEIRO do cliente, paginado de mil em mil, e o hook joga
     fora tudo menos um ano: `buildMonthlyDataFromView` recorta por
     `l.data.startsWith(String(ano))` e `montarMovimentacoes` descarta com
     `if (a !== ano) return false`. Nenhum consumo de lancPec/lancFin
     atravessa anos — o ano-1 vem de queries proprias (viewTotalsAnoAnt,
     pecAnoAnt12, custeioPecAnoAnt12), e o comentario de :2598 ja dizia
     que "lancPec/lancFin ano-1 nao fetched".
     Medido: abrir um modal migrado dispara quatro instancias sem
     `sharedLanc`, e o historico ficava mais de quinze segundos em
     "Carregando...". */
  const { lancamentos: lancPecInterno, loading: loadingLancInterno } =
    useLancamentos({ enabled: enabled && !usarLancPecExterno, ano });

  const { lancamentos: lancFinInterno, loading: loadingFinInterno } =
    useFinanceiro({ enabled: enabled && !usarLancFinExterno, ano });

  // Etapa 2D — caixaIndicador.
  // Caixa: fonte oficial de saldo bancário consolidado por cliente
  // (financeiro_saldos_bancarios_v2). Escopo CLIENTE — não depende
  // da fazenda selecionada nem é afetado por modo Global/Individual.
  const {
    serieAno: caixaSerieAno,
    serieAnoAnt: caixaSerieAnoAnt,
  } = useSaldoCaixaMensal({
    clienteId: clienteAtual?.id ?? null,
    ano,
    enabled,
  });

  const lancPec    = usarLancPecExterno ? lancPecExterno! : lancPecInterno;
  const lancFin    = usarLancFinExterno ? lancFinExterno! : lancFinInterno;
  const loadingLanc = usarLancPecExterno ? false : loadingLancInterno;
  const loadingFin  = usarLancFinExterno ? false : loadingFinInterno;

  // Valor do Rebanho oficial — mesma fonte do PainelConsultorTab (sem fallback).
  // Array 13 posições: [0] = Dez ano anterior, [1..12] = Jan..Dez do ano.
  // Ausência de validado → NaN (propaga como null no consumidor via safe()).
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(() => Array(13).fill(NaN));

  useEffect(() => {
    if (!enabled) { setValorRebanhoMes(Array(13).fill(NaN)); return; }
    let cancelled = false;
    const cid = clienteAtual?.id;

    const load = async () => {
      const dezAnoAnterior = `${ano - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        if (!cid) {
          if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total')
          .eq('cliente_id', cid)
          .in('ano_mes', todasMeses);
        if (cancelled) return;
        if (error || !data?.length) {
          setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const byMes = Object.fromEntries(
          (data as any[]).map(r => [r.ano_mes, Number(r.valor_total)]),
        );
        setValorRebanhoMes(
          todasMeses.map(m => (byMes[m] != null && !isNaN(byMes[m]) ? byMes[m] : NaN)),
        );
        return;
      }

      if (!fazendaId || fazendaId === '__global__') {
        if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', todasMeses);
      if (cancelled) return;
      if (error || !data?.length) {
        setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const byMes = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.status === 'validado') {
          byMes.set(row.ano_mes, Number(row.valor_total));
        }
      }
      setValorRebanhoMes(todasMeses.map(m => (byMes.has(m) ? byMes.get(m)! : NaN)));
    };

    load();
    return () => { cancelled = true; };
  }, [enabled, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Valor do Rebanho ano anterior (apenas quando incluirComparativos=true).
  const [valorRebanhoMesAnoAnt, setValorRebanhoMesAnoAnt] = useState<number[]>(() => Array(13).fill(NaN));
  useEffect(() => {
    if (!incluirComparativos) {
      setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const dezAnoAnterior = `${anoAnt - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${anoAnt}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        if (!cid) {
          if (!cancelled) setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total')
          .eq('cliente_id', cid)
          .in('ano_mes', todasMeses);
        if (cancelled) return;
        if (error || !data?.length) { setValorRebanhoMesAnoAnt(Array(13).fill(NaN)); return; }
        const byMes = Object.fromEntries((data as any[]).map(r => [r.ano_mes, Number(r.valor_total)]));
        setValorRebanhoMesAnoAnt(todasMeses.map(m => (byMes[m] != null && !isNaN(byMes[m]) ? byMes[m] : NaN)));
        return;
      }

      if (!fazendaId || fazendaId === '__global__') {
        if (!cancelled) setValorRebanhoMesAnoAnt(Array(13).fill(NaN));
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', todasMeses);
      if (cancelled) return;
      if (error || !data?.length) { setValorRebanhoMesAnoAnt(Array(13).fill(NaN)); return; }
      const byMes = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.status === 'validado') byMes.set(row.ano_mes, Number(row.valor_total));
      }
      setValorRebanhoMesAnoAnt(todasMeses.map(m => (byMes.has(m) ? byMes.get(m)! : NaN)));
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Desfrute ano-1 — query direta a 'lancamentos' filtrada por TIPOS_DESFRUTE_OFICIAL.
  // Carregado apenas quando incluirComparativos=true (chamada principal do hook).
  const [desfruteAnoAnt12, setDesfruteAnoAnt12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!incluirComparativos) {
      setDesfruteAnoAnt12(Array(12).fill(0));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;

    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('id, tipo, quantidade, data')
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${anoAnt}-01-01`)
          .lte('data', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setDesfruteAnoAnt12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setDesfruteAnoAnt12(Array(12).fill(0));
          return;
        }

        const { data, error } = await q
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      // Dedup defensivo por id: paginação Supabase pode entregar duplicatas
      // entre páginas se a ordenação não for totalmente determinística.
      const seenIds = new Set<string>();
      const dedupRows = allRows.filter((r: any) => {
        if (!r?.id || seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      const lite = dedupRows.map((r: any) => ({
        tipo: r.tipo,
        quantidade: Number(r.quantidade) || 0,
        data: r.data,
        cenario: 'realizado',
      }));
      setDesfruteAnoAnt12(buildDesfruteCabMensal(lite, anoAnt));
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Desfrute META — query direta a 'lancamentos' (cenario='meta') filtrada por TIPOS_DESFRUTE_OFICIAL.
  // Mantém a invariante (abate+venda+consumo, sem morte/transfer) — divergente do PC-100 que usa
  // saidas externas META (inclui morte/transfer).
  const [desfruteMetaMes12, setDesfruteMetaMes12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!enabled) { setDesfruteMetaMes12(Array(12).fill(0)); return; }
    let cancelled = false;
    const cid = clienteAtual?.id;
    if (!cid && !fazendaId) {
      setDesfruteMetaMes12(Array(12).fill(0));
      return;
    }
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('id, tipo, quantidade, data')
          .eq('cancelado', false)
          .eq('cenario', 'meta')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setDesfruteMetaMes12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setDesfruteMetaMes12(Array(12).fill(0));
          return;
        }
        const { data, error } = await q
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      // Dedup defensivo por id: paginação Supabase pode entregar duplicatas
      // entre páginas se a ordenação não for totalmente determinística.
      const seenIds = new Set<string>();
      const dedupRows = allRows.filter((r: any) => {
        if (!r?.id || seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      const lite = dedupRows.map((r: any) => ({
        tipo: r.tipo,
        quantidade: Number(r.quantidade) || 0,
        data: r.data,
        cenario: 'realizado',  // bypass: já filtramos cenario=meta no SQL acima
      }));
      setDesfruteMetaMes12(buildDesfruteCabMensal(lite, ano));
    };
    load();
    return () => { cancelled = true; };
  }, [enabled, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Pec ano-1 (cenario='realizado', TIPOS_DESFRUTE) — agrega Σ valor_total e Σ arrobas
  // (abate: peso_carcaca_kg/15; venda/consumo: peso_medio_kg/30) por mês.
  // Suporta Receita Pec ano-1 e Preço de Venda R$/@ ano-1 (mesma fonte oficial).
  const [pecAnoAnt12, setPecAnoAnt12] = useState<{ rec: number[]; desfArr: number[] }>(
    () => ({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) }),
  );
  useEffect(() => {
    if (!incluirComparativos) {
      setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('id, tipo, quantidade, peso_medio_kg, peso_carcaca_kg, valor_total, data')
          .eq('cancelado', false)
          .eq('cenario', 'realizado')
          .eq('status_operacional', 'realizado')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${anoAnt}-01-01`)
          .lte('data', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setPecAnoAnt12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
          return;
        }
        const { data, error } = await q
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      // Dedup defensivo por id: paginação Supabase pode entregar duplicatas
      // entre páginas se a ordenação não for totalmente determinística.
      const seenIds = new Set<string>();
      const dedupRows = allRows.filter((r: any) => {
        if (!r?.id || seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      const rec = Array(12).fill(0);
      const desfArr = Array(12).fill(0);
      for (const r of dedupRows) {
        const m = parseInt(String(r.data ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        const qtd = Number(r.quantidade) || 0;
        const vt  = Math.abs(Number(r.valor_total) || 0);
        rec[m - 1] += vt;
        if (r.tipo === 'abate') {
          const pc = Number(r.peso_carcaca_kg) || 0;
          if (pc > 0) desfArr[m - 1] += (qtd * pc) / 15;
        } else {
          const pmk = Number(r.peso_medio_kg) || 0;
          if (pmk > 0) desfArr[m - 1] += (qtd * pmk) / 30;
        }
      }
      setPecAnoAnt12({ rec, desfArr });
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Pec META (cenario='meta', TIPOS_DESFRUTE) — mesma estrutura para o ano corrente.
  const [pecMeta12, setPecMeta12] = useState<{ rec: number[]; desfArr: number[] }>(
    () => ({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) }),
  );
  useEffect(() => {
    if (!carregarMetaEffective) {
      setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('id, tipo, quantidade, peso_medio_kg, peso_carcaca_kg, valor_total, data')
          .eq('cancelado', false)
          .eq('cenario', 'meta')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setPecMeta12({ rec: Array(12).fill(0), desfArr: Array(12).fill(0) });
          return;
        }
        const { data, error } = await q
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      // Dedup defensivo por id: paginação Supabase pode entregar duplicatas
      // entre páginas se a ordenação não for totalmente determinística.
      const seenIds = new Set<string>();
      const dedupRows = allRows.filter((r: any) => {
        if (!r?.id || seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      const rec = Array(12).fill(0);
      const desfArr = Array(12).fill(0);
      for (const r of dedupRows) {
        const m = parseInt(String(r.data ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        const qtd = Number(r.quantidade) || 0;
        const vt  = Math.abs(Number(r.valor_total) || 0);
        rec[m - 1] += vt;
        if (r.tipo === 'abate') {
          const pc = Number(r.peso_carcaca_kg) || 0;
          if (pc > 0) desfArr[m - 1] += (qtd * pc) / 15;
        } else {
          const pmk = Number(r.peso_medio_kg) || 0;
          if (pmk > 0) desfArr[m - 1] += (qtd * pmk) / 30;
        }
      }
      setPecMeta12({ rec, desfArr });
    };
    load();
    return () => { cancelled = true; };
  }, [carregarMetaEffective, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // Custeio Produção Pecuária ANO-1 — financeiro_lancamentos_v2 do ano-1.
  // Filtros SQL: status_transacao='realizado', cenario='realizado', cancelado=false,
  //              sem_movimentacao_caixa=false, grupo_custo IN (Custo Fixo/Var Pec).
  const [custeioPecAnoAnt12, setCusteioPecAnoAnt12] = useState<number[]>(() => Array(12).fill(0));
  useEffect(() => {
    if (!incluirComparativos) {
      setCusteioPecAnoAnt12(Array(12).fill(0));
      return;
    }
    let cancelled = false;
    const cid = clienteAtual?.id;
    const anoAnt = ano - 1;
    const load = async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = (supabase
          .from('financeiro_lancamentos_v2')
          .select('id, data_pagamento, valor, grupo_custo') as any)
          .eq('cancelado', false)
          .eq('sem_movimentacao_caixa', false)
          .eq('status_transacao', 'realizado')
          .eq('cenario', 'realizado')
          .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária'])
          .gte('data_pagamento', `${anoAnt}-01-01`)
          .lte('data_pagamento', `${anoAnt}-12-31`);
        if (isGlobal) {
          if (!cid) {
            if (!cancelled) setCusteioPecAnoAnt12(Array(12).fill(0));
            return;
          }
          q = q.eq('cliente_id', cid);
        } else if (fazendaId && fazendaId !== '__global__') {
          q = q.eq('fazenda_id', fazendaId);
        } else {
          if (!cancelled) setCusteioPecAnoAnt12(Array(12).fill(0));
          return;
        }
        const { data, error } = await q
          .order('data_pagamento', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (cancelled) return;
      // Dedup defensivo por id: paginação Supabase pode entregar duplicatas
      // entre páginas se a ordenação não for totalmente determinística.
      const seenIds = new Set<string>();
      const dedupRows = allRows.filter((r: any) => {
        if (!r?.id || seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      });
      const out = Array(12).fill(0);
      for (const r of dedupRows) {
        const m = parseInt(String(r.data_pagamento ?? '').slice(5, 7));
        if (isNaN(m) || m < 1 || m > 12) continue;
        out[m - 1] += Math.abs(Number(r.valor) || 0);
      }
      setCusteioPecAnoAnt12(out);
    };
    load();
    return () => { cancelled = true; };
  }, [incluirComparativos, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // ─── custeioPecMeta12 — fonte: gridMetaConsolidado (soberano único) ───────
  // Antes: fetch direto a planejamento_financeiro (incompleto, ignorava os
  // 4 streams auto). Agora: deriva do mesmo agregador oficial que alimenta
  // _finSoberano.custeioPecSemJuros, garantindo paridade entre o caminho
  // legado (_custeioPecIndicadorMemo) e o caminho soberano (_finSoberano).
  const custeioPecMeta12 = useMemo<number[]>(() => {
    if (!carregarMetaEffective) return Array(12).fill(0);
    const result = agregaCusteioPecSemJurosMeta(gridMetaConsolidado);
    return result ?? Array(12).fill(0);
  }, [carregarMetaEffective, gridMetaConsolidado]);

  // Valor do Rebanho META validada — somente Fazenda (Global não tem fonte oficial).
  // Estendido: lê também `peso_medio_kg` e `cabecas` para expor pesoMedioFinMetaSnap
  // (mesma fórmula do PainelConsultorTab.metaPesoSnap — ponderação por cabeças).
  const [valorRebanhoMetaMes, setValorRebanhoMetaMes] = useState<number[]>(() => Array(12).fill(NaN));
  const [pesoMedioFinMetaSnap12, setPesoMedioFinMetaSnap12] = useState<number[]>(() => Array(12).fill(NaN));
  useEffect(() => {
    if (!enabled) {
      setValorRebanhoMetaMes(Array(12).fill(NaN));
      setPesoMedioFinMetaSnap12(Array(12).fill(NaN));
      return;
    }
    const cid = clienteAtual?.id;
    if (!cid) {
      setValorRebanhoMetaMes(Array(12).fill(NaN));
      setPesoMedioFinMetaSnap12(Array(12).fill(NaN));
      return;
    }
    if (!isGlobal && (!fazendaId || fazendaId === '__global__')) {
      setValorRebanhoMetaMes(Array(12).fill(NaN));
      setPesoMedioFinMetaSnap12(Array(12).fill(NaN));
      return;
    }
    let cancelled = false;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    // Sem filtro de status — alinha com MetaPrecoTab (fonte oficial). O snapshot
    // é considerado autoritativo independente do status (ver auditoria meta).
    let q = supabase
      .from('valor_rebanho_meta_validada' as any)
      .select('ano_mes, valor_total, peso_medio_kg, cabecas')
      .eq('cliente_id', cid)
      .in('ano_mes', meses);
    if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setValorRebanhoMetaMes(Array(12).fill(NaN));
        setPesoMedioFinMetaSnap12(Array(12).fill(NaN));
        return;
      }
      // Agregação por ano_mes — soma de fazendas validadas no Global; 1 só registro p/ Fazenda.
      const valor = Array(12).fill(0);
      const tem   = Array(12).fill(false);
      const cab   = Array(12).fill(0);
      const pTot  = Array(12).fill(0); // peso_medio × cabecas (numerador para ponderação)
      for (const r of data as any[]) {
        const idx = meses.indexOf(r.ano_mes);
        if (idx < 0) continue;
        const v   = Number(r.valor_total)   || 0;
        const c   = Number(r.cabecas)       || 0;
        const pm0 = Number(r.peso_medio_kg) || 0;
        valor[idx] += v;
        tem[idx] = true;
        cab[idx]  += c;
        pTot[idx] += pm0 * c;
      }
      // Mês sem nenhum registro → NaN (não 0); preserva semântica "sem meta".
      setValorRebanhoMetaMes(valor.map((v, i) => tem[i] ? v : NaN));
      setPesoMedioFinMetaSnap12(pTot.map((pt, i) => (tem[i] && cab[i] > 0) ? pt / cab[i] : NaN));
    });
    return () => { cancelled = true; };
  }, [enabled, ano, isGlobal, fazendaId, clienteAtual?.id]);

  // META — GMD previsto por (fazenda × ano_mes × categoria_codigo)
  // Fonte oficial: meta_gmd_mensal. Defensivo: dedup por updated_at DESC.
  // (Mesmo após UNIQUE constraint, dedup defensivo no fetch protege contra
  // regressão acidental ou estados intermediários durante deploy.)
  const [gmdPrevistoLookup, setGmdPrevistoLookup] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    const cid = clienteAtual?.id;
    if (!carregarMetaEffective || !cid) { setGmdPrevistoLookup(null); return; }
    if (!isGlobal && (!fazendaId || fazendaId === '__global__')) {
      setGmdPrevistoLookup(null); return;
    }
    let cancelled = false;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    let q = supabase
      .from('meta_gmd_mensal' as any)
      .select('fazenda_id, ano_mes, categoria, gmd_previsto, updated_at, id')
      .eq('cliente_id', cid)
      .in('ano_mes', meses)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });
    if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setGmdPrevistoLookup(null); return; }
      // Dedup defensiva: mantém o primeiro (mais recente) por chave.
      // SEM soma, SEM média entre duplicatas — escolha explícita do registro soberano.
      const map = new Map<string, number>();
      for (const r of data as any[]) {
        const key = `${r.fazenda_id}|${r.ano_mes}|${r.categoria}`;
        if (map.has(key)) continue;
        const v = Number(r.gmd_previsto);
        if (!Number.isFinite(v)) continue;
        map.set(key, v);
      }
      setGmdPrevistoLookup(map);
    });
    return () => { cancelled = true; };
  }, [ano, isGlobal, fazendaId, clienteAtual?.id, carregarMetaEffective]);

  const mesRef = mes === 0 ? 12 : mes;
  const mesStr = `${ano}-${String(mesRef).padStart(2, '0')}`;
  const { status: statusPilares } = useStatusPilares(fazendaId, mesStr, enabled);

  const monthlyData = useMemo(
    () =>
      buildMonthlyDataFromView(
        viewTotals,
        viewDataRealizado ?? [],
        lancFin,
        lancPec,
        ano,
        0,
        valorRebanhoMes,
        isGlobal,
        areaPecuariaRealNumPorMes,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotals, viewDataRealizado, lancFin, lancPec, ano, isGlobal, areaPecuariaRealNumPorMes, valorRebanhoMes],
  );

  const monthlyDataMeta = useMemo(
    () =>
      carregarMetaEffective && viewDataMeta && viewDataMeta.length > 0
        ? buildMonthlyDataFromView(
            viewTotalsMeta,
            viewDataMeta,
            [],
            [],
            ano,
            0,
            Array(13).fill(NaN),
            isGlobal,
            areaPecuariaMetaNumPorMes,
            gmdPrevistoLookup,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotalsMeta, viewDataMeta, carregarMetaEffective, ano, isGlobal, areaPecuariaMetaNumPorMes, gmdPrevistoLookup],
  );

  const loading = loadingRebanho || loadingLanc || loadingFin || loadingArea;

  const idx = mesRef - 1;

  const statusArea: StatusValidacaoArea = (() => {
    // Status reflete EXISTÊNCIA de snapshot/P1, não valor da área pecuária.
    // Área operacional pecuária = 0 é resultado válido (ex: pasto com
    // tipo_uso='agricultura' tem área pec efetiva zero, mas snapshot existe e
    // mês está OK). Indicadores por hectare continuam virando NaN/"—" no
    // consumidor — isso é correto e independente de status.
    if (loadingArea) return 'carregando';
    if (isGlobal) {
      // Aguardar query de fazendas ativas completar antes de julgar
      if (!fazendasAtivasCarregadas) return 'carregando';
      if (totalFazendasAtivas === 0) return 'sem_snapshot';
      const comP1  = fazendasComP1PorMes[idx] ?? 0;
      const comSnap = fazendasComSnapPorMes[idx] ?? 0;
      if (comP1 === 0) return 'ok';
      if (comSnap < comP1) return 'incompleto';
      return 'ok';
    }
    const temSnap = snapshots.some(s => s.mes === idx + 1);
    if (temSnap) return 'ok';
    if (temP1FechadoPorMes[idx]) return 'p1_fechado_sem_snap';
    return 'p1_aberto';
  })();

  const faltandoCount = isGlobal
    ? Math.max(0, (fazendasComP1PorMes[idx] ?? 0) - (fazendasComSnapPorMes[idx] ?? 0))
    : 0;

  const safe = (v: number | null | undefined) =>
    v == null || isNaN(Number(v)) ? null : Number(v);

  const meanArr = (arr: number[]): number | null => {
    const valid = arr.filter(v => v != null && !isNaN(v));
    return valid.length > 0
      ? valid.reduce((s, v) => s + v, 0) / valid.length
      : null;
  };

  const sumArr = (arr: number[]): number =>
    arr.reduce((s, v) => s + (v == null || isNaN(v) ? 0 : v), 0);

  const sliceUpTo = (arr: number[], i: number): number[] => arr.slice(0, i + 1);

  const isPeriodo = viewMode === 'periodo';

  // ── Integridade do GLOBAL ──
  // dadosCompletos: no modo global, verificar se todas as fazendas pecuárias
  // possuem P1 fechado no(s) mês(es) avaliado(s).
  // Usa fazendasComP1PorMes (fonte: fechamento_pastos) — não depende do cache.
  const dadosCompletos = (() => {
    if (!isGlobal) return true;
    if (loading || !fazendasAtivasCarregadas) return true; // não julgar durante carregamento
    if (totalFazendasAtivas === 0) return true;
    if (isPeriodo) {
      for (let i = 0; i <= idx; i++) {
        const comP1 = fazendasComP1PorMes[i] ?? 0;
        if (comP1 < totalFazendasAtivas) return false;
      }
      return true;
    }
    const comP1 = fazendasComP1PorMes[idx] ?? 0;
    return comP1 >= totalFazendasAtivas;
  })();
  const incompletoOverride = isGlobal && !dadosCompletos && !loading && !preservarMetaQuandoGlobalIncompleto;

  // kgHaPorMes (mensal): peso vivo total do rebanho / área pecuária REALIZADA.
  // C5.1: tab-aware — denominador = areaPecuariaRealPorMes (snapshot oficial),
  // não mais areaMensal genérico. Sem fallback à META.
  const kgHaPorMes = (monthlyData.pesoTotalFin ?? []).map((p, i) => {
    const area = areaPecuariaRealPorMes[i] ?? 0;
    return p > 0 && area > 0 ? p / area : NaN;
  });

  // ── Cabeças/Rebanho oficial (1-based, length 13) ──
  // monthlyData.cabFin é 0-based (índice 0=Jan); converter para 1-based.
  const cabFinSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.cabFin[i - 1] ?? NaN)
  );

  // Média acumulada Jan→m baseada em cabMediaMes = (cabIni+cabFin)/2
  const cabMediaAcumulada = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const vals = monthlyData.cabMediaMes
      .slice(0, i)
      .filter(v => !isNaN(v) && v > 0);
    return vals.length > 0
      ? vals.reduce((s, v) => s + v, 0) / vals.length
      : NaN;
  });

  const cabSerie = isPeriodo ? cabMediaAcumulada : cabFinSerie13;
  const mesIdx = mes;
  const cabValorRaw = cabSerie[mesIdx];
  const cabValor = (cabValorRaw == null || isNaN(cabValorRaw)) ? null : cabValorRaw;

  const cabDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = cabSerie[mesIdx];
    const prev = cabSerie[mesIdx - 1];
    if (curr == null || isNaN(curr) || prev == null || isNaN(prev) || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // ── Séries do ano anterior (somente quando incluirComparativos=true) ──
  // cabFin do ano anterior — 1-based (índice 0 = NaN, 1=Jan … 12=Dez)
  const cabFinAnoAntSerie = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (viewTotalsAnoAnt[i]?.saldo_final ?? NaN)
      )
    : null;

  // cabIni do ano anterior — para calcular cabMedia do ano anterior
  const cabIniAnoAntSerie = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (viewTotalsAnoAnt[i]?.saldo_inicial ?? NaN)
      )
    : null;

  // cabMediaAcumulada do ano anterior — rolling avg de cabMedia[m] = (cabIni[m] + cabFin[m]) / 2
  const cabMediaAcumAnoAnt = (() => {
    if (!cabFinAnoAntSerie || !cabIniAnoAntSerie) return null;
    const result = Array(13).fill(NaN) as number[];
    let sum = 0, n = 0;
    for (let m = 1; m <= 12; m++) {
      const ini = cabIniAnoAntSerie[m];
      const fin = cabFinAnoAntSerie[m];
      if (!isNaN(ini) && !isNaN(fin)) {
        sum += (ini + fin) / 2;
        n++;
        result[m] = sum / n;
      }
    }
    return result;
  })();

  const cabSerieAnoAnt = isPeriodo ? cabMediaAcumAnoAnt : cabFinAnoAntSerie;

  const cabDeltaAno = (() => {
    if (!cabSerieAnoAnt) return null;
    const curr = cabSerie[mesIdx];
    const ant  = cabSerieAnoAnt[mesIdx];
    if (curr == null || isNaN(curr) || ant == null || isNaN(ant) || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ── Séries da META para o ano corrente (carregadas se carregarMeta || incluirComparativos) ──
  const cabFinMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.cabFin[i - 1] ?? NaN)
      )
    : null;

  const cabMediaAcumMeta = (() => {
    if (!monthlyDataMeta) return null;
    const result = Array(13).fill(NaN) as number[];
    let sum = 0, n = 0;
    for (let m = 1; m <= 12; m++) {
      const v = monthlyDataMeta.cabMediaMes[m - 1];
      if (!isNaN(v) && v > 0) {
        sum += v;
        n++;
        result[m] = sum / n;
      }
    }
    return result;
  })();

  const cabSerieMeta = isPeriodo ? cabMediaAcumMeta : cabFinMetaSerie13;

  /* Rebanho INICIAL do ano — a foto de Dez do ano anterior. O valor ja era
     calculado inline no return (`cabecasFinFotoAnoAnt`); aqui ele ganha um
     dono so, para servir tambem ao `series`. */
  const cabFotoIniAnoAnt: number | null =
    cabFinAnoAntSerie && Number.isFinite(cabFinAnoAntSerie[12])
      ? cabFinAnoAntSerie[12]
      : null;

  /* A posicao 0 das series de 13 e declarada como "Dez ano anterior"
     (:1018) e nasce NaN. Aqui ela recebe a foto — o rebanho inicial do
     ano — SO nas series publicadas ao modal. `cabSerie`, `cabValor` e
     os deltas continuam lendo os arrays originais.
     Devolve array NOVO: nenhuma mutacao em cabFinSerie13/cabMediaAcumulada. */
  const comInicial = (s: number[], ini: number | null): number[] => {
    if (ini == null) return s;
    const out = [...s];
    out[0] = ini;
    return out;
  };

  const cabDeltaMeta = (() => {
    if (!cabSerieMeta) return null;
    const curr = cabSerie[mesIdx];
    const meta = cabSerieMeta[mesIdx];
    if (curr == null || isNaN(curr) || meta == null || isNaN(meta) || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Peso Médio oficial (1-based, length 13) ──
  // ─────────────────────────────────────────────────────────────
  // Realizado mensal — pesoMedioFin já é 0-based; converter para 1-based.
  const pesoMedioFinSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.pesoMedioFin[i - 1] ?? NaN)
  );

  // Realizado período — média ponderada Σ pesoTotalFin / Σ cabFin (idêntico à fórmula
  // oficial do PainelConsultor já presente no escalar `pesoMedio` deste hook).
  const pesoMedioPeriodoSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const totalPeso = monthlyData.pesoTotalFin.slice(0, i)
      .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
    const totalCab = monthlyData.cabFin.slice(0, i)
      .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
    return totalCab > 0 ? totalPeso / totalCab : NaN;
  });

  const pesoSerie = isPeriodo ? pesoMedioPeriodoSerie13 : pesoMedioFinSerie13;

  const pesoDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const prev = safe(pesoSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — usa viewTotalsAnoAnt (carregado quando incluirComparativos=true)
  const pesoMedioFinAnoAnt13 = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const ptf = viewTotalsAnoAnt[i]?.peso_total_final ?? 0;
        const cab = viewTotalsAnoAnt[i]?.saldo_final ?? 0;
        return cab > 0 ? ptf / cab : NaN;
      })
    : null;

  const pesoMedioPeriodoAnoAnt13 = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        let totalPeso = 0, totalCab = 0;
        for (let m = 1; m <= i; m++) {
          totalPeso += viewTotalsAnoAnt[m]?.peso_total_final ?? 0;
          totalCab  += viewTotalsAnoAnt[m]?.saldo_final ?? 0;
        }
        return totalCab > 0 ? totalPeso / totalCab : NaN;
      })
    : null;

  const pesoSerieAnoAnt = isPeriodo ? pesoMedioPeriodoAnoAnt13 : pesoMedioFinAnoAnt13;

  /* Peso medio INICIAL do ano — a foto de Dez do ano anterior. Mesmo desenho
     de `cabFotoIniAnoAnt`: o valor ja era calculado inline no return
     (`pesoMedioFinFotoAnoAnt`), e aqui ganha um dono so para servir tambem ao
     `series`. Reaproveita o helper `comInicial` (:1839). */
  const pesoMedioFotoIniAnoAnt: number | null =
    pesoMedioFinAnoAnt13 && Number.isFinite(pesoMedioFinAnoAnt13[12])
      ? pesoMedioFinAnoAnt13[12]
      : null;

  // Meta — usa monthlyDataMeta (gate carregarMetaEffective já existente)
  const pesoMedioMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.pesoMedioFin[i - 1] ?? NaN)
      )
    : null;

  const pesoMedioPeriodoMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const totalPeso = (monthlyDataMeta.pesoTotalFin ?? []).slice(0, i)
          .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
        const totalCab = (monthlyDataMeta.cabFin ?? []).slice(0, i)
          .reduce((s, v) => s + (Number.isNaN(v) ? 0 : v), 0);
        return totalCab > 0 ? totalPeso / totalCab : NaN;
      })
    : null;

  const pesoMetaSerie = isPeriodo ? pesoMedioPeriodoMetaSerie13 : pesoMedioMetaSerie13;

  const pesoDeltaAno = (() => {
    if (!pesoSerieAnoAnt) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const ant  = safe(pesoSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const pesoDeltaMeta = (() => {
    if (!pesoMetaSerie) return null;
    const curr = safe(pesoSerie[mesIdx]);
    const meta = safe(pesoMetaSerie[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── GMD oficial (1-based, length 13) ──
  // Fórmula período = computePeriodGmd (PC-100), helper compartilhado.
  // ─────────────────────────────────────────────────────────────
  const diasNoMesAno = (anoRef: number) =>
    Array.from({ length: 12 }, (_, i) => new Date(anoRef, i + 1, 0).getDate());

  const diasAno = diasNoMesAno(ano);

  // GMD mensal (oficial): monthlyData.gmd já é prodBio/cabMedia/dias por mês.
  const gmdMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.gmd[i - 1] ?? NaN)
  );

  // GMD período (oficial PC-100): computePeriodGmd(prodKg, cabMediaMes, dias).
  const gmdPeriodo12 = computePeriodGmd(monthlyData.prodKg, monthlyData.cabMediaMes, diasAno);
  const gmdPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (gmdPeriodo12[i - 1] ?? NaN)
  );

  const gmdSerie = isPeriodo ? gmdPeriodoSerie13 : gmdMesSerie13;
  const gmdValor = safe(gmdSerie[mesIdx]);

  const gmdDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const prev = safe(gmdSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — derivar prodKg, cabMediaMes, gmdMensal a partir de viewTotalsAnoAnt.
  const prodKgAnoAnt = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0)
    : null;

  const cabMediaMesAnoAnt = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) => {
        const ini = viewTotalsAnoAnt[i + 1]?.saldo_inicial ?? 0;
        const fin = viewTotalsAnoAnt[i + 1]?.saldo_final ?? 0;
        return (ini + fin) / 2;
      })
    : null;

  const diasAnoAnt = diasNoMesAno(ano - 1);

  const gmdMesAnoAntSerie13 = (prodKgAnoAnt && cabMediaMesAnoAnt)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const m = i;
        const cm = cabMediaMesAnoAnt[m - 1];
        const pb = prodKgAnoAnt[m - 1];
        const d = diasAnoAnt[m - 1];
        return cm > 0 && d > 0 ? pb / cm / d : NaN;
      })
    : null;

  const gmdPeriodoAnoAntSerie13 = (prodKgAnoAnt && cabMediaMesAnoAnt)
    ? (() => {
        const arr12 = computePeriodGmd(prodKgAnoAnt, cabMediaMesAnoAnt, diasAnoAnt);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const gmdSerieAnoAnt = isPeriodo ? gmdPeriodoAnoAntSerie13 : gmdMesAnoAntSerie13;

  const gmdDeltaAno = (() => {
    if (!gmdSerieAnoAnt) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const ant  = safe(gmdSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — monthlyDataMeta já tem gmd mensal, prodKg e cabMediaMes.
  const gmdMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.gmd[i - 1] ?? NaN)
      )
    : null;

  const gmdPeriodoMetaSerie13 = monthlyDataMeta
    ? (() => {
        const arr12 = computePeriodGmd(monthlyDataMeta.prodKg, monthlyDataMeta.cabMediaMes, diasAno);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const gmdSerieMeta = isPeriodo ? gmdPeriodoMetaSerie13 : gmdMesMetaSerie13;

  const gmdDeltaMeta = (() => {
    if (!gmdSerieMeta) return null;
    const curr = safe(gmdSerie[mesIdx]);
    const meta = safe(gmdSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── UA/ha oficial (1-based, length 13) ──
  // PERIODO = RAZAO DE AGREGADOS (PR-RAZAO-ESTOQUE-01): media do UA ÷ media da
  // area, nao media das razoes mensais. `rollingAvg` dava o mesmo peso a um mes
  // de 4.750 ha e a um de 4.942 ha; com area variando muito o erro cresce, e a
  // soma ponderada das fazendas nao reproduzia este numero. Ver
  // `calcularRazaoEstoqueAcumulada`.
  // ─────────────────────────────────────────────────────────────
  const uaHaMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.lotUaHa[i - 1] ?? NaN)
  );

  const uaHaPeriodo12 = calcularRazaoEstoqueAcumulada(monthlyData.uaMedia, areaPecuariaRealPorMes);
  const uaHaPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (uaHaPeriodo12[i - 1] ?? NaN)
  );

  const uaHaSerie = isPeriodo ? uaHaPeriodoSerie13 : uaHaMesSerie13;
  const uaHaValor = safe(uaHaSerie[mesIdx]);

  const uaHaDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const prev = safe(uaHaSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Meta — monthlyDataMeta.lotUaHa já vem de calcularIndicadoresEficienciaArea.
  const uaHaMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.lotUaHa[i - 1] ?? NaN)
      )
    : null;

  const uaHaPeriodoMetaSerie13 = monthlyDataMeta
    ? (() => {
        const arr12 = calcularRazaoEstoqueAcumulada(monthlyDataMeta.uaMedia, areaPecuariaMetaPorMes);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const uaHaSerieMeta = isPeriodo ? uaHaPeriodoMetaSerie13 : uaHaMesMetaSerie13;

  const uaHaDeltaMeta = (() => {
    if (!uaHaSerieMeta) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const meta = safe(uaHaSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ── Ano anterior — UA/ha (e kg vivo/ha): exige área ano-1 + viewTotalsAnoAnt ──
  // Reusa calcularIndicadoresEficienciaArea (helper compartilhado).
  const eficienciaAreaAnoAnt = (() => {
    const temAreaValidaAnoAnt =
      Array.isArray(areaMensalAnoAnt) &&
      areaMensalAnoAnt.some(v => v > 0);

    const temRebanhoAnoAnt =
      viewTotalsAnoAnt &&
      Object.keys(viewTotalsAnoAnt).length > 0;

    if (!temAreaValidaAnoAnt || !temRebanhoAnoAnt) return null;
    const cabIni = Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.saldo_inicial ?? 0);
    const cabFin = Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt[i + 1]?.saldo_final ?? 0);
    const pesoMedioFin = Array.from({ length: 12 }, (_, i) => {
      const c = cabFin[i];
      const ptf = viewTotalsAnoAnt[i + 1]?.peso_total_final ?? 0;
      return c > 0 ? ptf / c : NaN;
    });
    const arrobasProd = Array.from({ length: 12 }, (_, i) =>
      (viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0) / 30
    );
    return calcularIndicadoresEficienciaArea({
      cabIni, cabFin, pesoMedioFin, arrobasProd,
      areaProdMensal: areaMensalAnoAnt,
    });
  })();

  const uaHaMesAnoAntSerie13 = eficienciaAreaAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (eficienciaAreaAnoAnt.lotUaHa[i - 1] ?? NaN)
      )
    : null;

  const uaHaPeriodoAnoAntSerie13 = eficienciaAreaAnoAnt
    ? (() => {
        const arr12 = calcularRazaoEstoqueAcumulada(eficienciaAreaAnoAnt.uaMedia, areaMensalAnoAnt);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const uaHaSerieAnoAnt = isPeriodo ? uaHaPeriodoAnoAntSerie13 : uaHaMesAnoAntSerie13;

  const uaHaDeltaAno = (() => {
    if (!uaHaSerieAnoAnt) return null;
    const curr = safe(uaHaSerie[mesIdx]);
    const ant  = safe(uaHaSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── kg vivo/ha oficial (1-based, length 13) ──
  // peso vivo total do rebanho ÷ área produtiva (estoque, NÃO produção).
  // PERIODO = RAZAO DE AGREGADOS, mesma regra do UA/ha: media do peso vivo ÷
  // media da area. O numerador e ESTOQUE — somar peso de doze meses nao produz
  // numero nenhum —, por isso NAO e' `calcularArrHaAcumulado`.
  // ─────────────────────────────────────────────────────────────
  const kgHaMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (kgHaPorMes[i - 1] ?? NaN)
  );

  const kgHaPeriodo12 = calcularRazaoEstoqueAcumulada(monthlyData.pesoTotalFin ?? [], areaPecuariaRealPorMes);
  const kgHaPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (kgHaPeriodo12[i - 1] ?? NaN)
  );

  const kgHaSerie = isPeriodo ? kgHaPeriodoSerie13 : kgHaMesSerie13;
  const kgHaValor = safe(kgHaSerie[mesIdx]);

  const kgHaDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const prev = safe(kgHaSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Meta — monthlyDataMeta.pesoTotalFin / areaMensal (mesma área do realizado).
  // C5.1: tab-aware — denominador = areaPecuariaMetaPorMes (planejamento_area_meta),
  // não mais areaMensal. Sem fallback ao realizado.
  const kgHaPorMesMeta = monthlyDataMeta
    ? (monthlyDataMeta.pesoTotalFin ?? []).map((p, i) => {
        const area = areaPecuariaMetaPorMes[i] ?? 0;
        return p > 0 && area > 0 ? p / area : NaN;
      })
    : null;

  const kgHaMesMetaSerie13 = kgHaPorMesMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (kgHaPorMesMeta[i - 1] ?? NaN)
      )
    : null;

  const kgHaPeriodoMetaSerie13 = kgHaPorMesMeta
    ? (() => {
        const arr12 = calcularRazaoEstoqueAcumulada(monthlyDataMeta?.pesoTotalFin ?? [], areaPecuariaMetaPorMes);
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const kgHaSerieMeta = isPeriodo ? kgHaPeriodoMetaSerie13 : kgHaMesMetaSerie13;

  const kgHaDeltaMeta = (() => {
    if (!kgHaSerieMeta) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const meta = safe(kgHaSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // Ano anterior — kg vivo/ha: pesoTotalFin ano-1 / area ano-1.
  const kgHaPorMesAnoAnt = (viewTotalsAnoAnt && areaMensalAnoAnt)
    ? Array.from({ length: 12 }, (_, i) => {
        const ptf = viewTotalsAnoAnt[i + 1]?.peso_total_final ?? 0;
        const area = areaMensalAnoAnt[i] ?? 0;
        return ptf > 0 && area > 0 ? ptf / area : NaN;
      })
    : null;

  const kgHaMesAnoAntSerie13 = kgHaPorMesAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (kgHaPorMesAnoAnt[i - 1] ?? NaN)
      )
    : null;

  const kgHaPeriodoAnoAntSerie13 = kgHaPorMesAnoAnt
    ? (() => {
        const arr12 = calcularRazaoEstoqueAcumulada(
          Array.from({ length: 12 }, (_, i) => viewTotalsAnoAnt?.[i + 1]?.peso_total_final ?? 0),
          areaMensalAnoAnt,
        );
        return Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : (arr12[i - 1] ?? NaN)
        );
      })()
    : null;

  const kgHaSerieAnoAnt = isPeriodo ? kgHaPeriodoAnoAntSerie13 : kgHaMesAnoAntSerie13;

  const kgHaDeltaAno = (() => {
    if (!kgHaSerieAnoAnt) return null;
    const curr = safe(kgHaSerie[mesIdx]);
    const ant  = safe(kgHaSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── @ produzidas oficial — fluxo (1-based, length 13) ──
  // mes = valor do mês; periodo = soma acumulada Jan→m. Sem média/rollingAvg.
  // ─────────────────────────────────────────────────────────────
  const cumSumTo13 = (arr12: number[]): number[] => {
    const out = Array(13).fill(NaN) as number[];
    let acc = 0;
    for (let i = 1; i <= 12; i++) {
      const v = arr12[i - 1];
      acc += (v == null || isNaN(v) ? 0 : v);
      out[i] = acc;
    }
    return out;
  };

  const arrobasMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.arrobasProd[i - 1] ?? NaN)
  );
  const arrobasPeriodoSerie13 = cumSumTo13(monthlyData.arrobasProd);
  const arrobasSerie = isPeriodo ? arrobasPeriodoSerie13 : arrobasMesSerie13;
  const arrobasValor = safe(arrobasSerie[mesIdx]);

  const arrobasDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const prev = safe(arrobasSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — viewTotalsAnoAnt[m].producao_biologica / 30
  const arrobasProdAnoAnt12 = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) =>
        (viewTotalsAnoAnt[i + 1]?.producao_biologica ?? 0) / 30
      )
    : null;

  const arrobasMesAnoAntSerie13 = arrobasProdAnoAnt12
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (arrobasProdAnoAnt12[i - 1] ?? NaN)
      )
    : null;

  const arrobasPeriodoAnoAntSerie13 = arrobasProdAnoAnt12
    ? cumSumTo13(arrobasProdAnoAnt12)
    : null;

  const arrobasSerieAnoAnt = isPeriodo ? arrobasPeriodoAnoAntSerie13 : arrobasMesAnoAntSerie13;

  const arrobasDeltaAno = (() => {
    if (!arrobasSerieAnoAnt) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const ant  = safe(arrobasSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — monthlyDataMeta.arrobasProd
  const arrobasMesMetaSerie13 = monthlyDataMeta
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (monthlyDataMeta.arrobasProd[i - 1] ?? NaN)
      )
    : null;

  const arrobasPeriodoMetaSerie13 = monthlyDataMeta
    ? cumSumTo13(monthlyDataMeta.arrobasProd)
    : null;

  const arrobasSerieMeta = isPeriodo ? arrobasPeriodoMetaSerie13 : arrobasMesMetaSerie13;

  const arrobasDeltaMeta = (() => {
    if (!arrobasSerieMeta) return null;
    const curr = safe(arrobasSerie[mesIdx]);
    const meta = safe(arrobasSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Desfrute (cab.) oficial — fluxo (1-based, length 13) ──
  // mes = abate+venda+consumo do mês (já em monthlyData.desfruteCab via lancPec).
  // periodo = soma acumulada Jan→m. Sem média/rollingAvg, sem mortes.
  // ─────────────────────────────────────────────────────────────
  const desfruteMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.desfruteCab[i - 1] ?? NaN)
  );
  const desfrutePeriodoSerie13 = cumSumTo13(monthlyData.desfruteCab);
  const desfruteSerie = isPeriodo ? desfrutePeriodoSerie13 : desfruteMesSerie13;
  const desfruteValor = safe(desfruteSerie[mesIdx]);

  const desfruteDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const prev = safe(desfruteSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — Desfrute: query a 'lancamentos' (TIPOS_DESFRUTE_OFICIAL).
  const desfruteAnoAntPossui = desfruteAnoAnt12.some(v => v > 0);

  const desfruteMesAnoAntSerie13 = desfruteAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (desfruteAnoAnt12[i - 1] ?? NaN)
      )
    : null;

  const desfrutePeriodoAnoAntSerie13 = desfruteAnoAntPossui
    ? cumSumTo13(desfruteAnoAnt12)
    : null;

  const desfruteSerieAnoAnt = isPeriodo ? desfrutePeriodoAnoAntSerie13 : desfruteMesAnoAntSerie13;

  const desfruteDeltaAno = (() => {
    if (!desfruteSerieAnoAnt) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const ant  = safe(desfruteSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — Desfrute: 'lancamentos' cenario='meta' filtrado pelos mesmos tipos oficiais.
  const desfruteMetaPossui = desfruteMetaMes12.some(v => v > 0);

  const desfruteMesMetaSerie13 = desfruteMetaPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (desfruteMetaMes12[i - 1] ?? NaN)
      )
    : null;

  const desfrutePeriodoMetaSerie13 = desfruteMetaPossui
    ? cumSumTo13(desfruteMetaMes12)
    : null;

  const desfruteSerieMeta = isPeriodo ? desfrutePeriodoMetaSerie13 : desfruteMesMetaSerie13;

  const desfruteDeltaMeta = (() => {
    if (!desfruteSerieMeta) return null;
    const curr = safe(desfruteSerie[mesIdx]);
    const meta = safe(desfruteSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Desfrute (@) oficial — fluxo (1-based, length 13) ──
  // mes = arrobas desfrutadas do mês (abate: qtd×peso_carcaca/15;
  // venda+consumo: qtd×peso_medio/30) — já consolidado em
  // monthlyData.desfrute_arr (real), pecAnoAnt12.desfArr (ano-1),
  // pecMeta12.desfArr (meta). Sem fonte nova; espelha desfrute (cab.).
  // ─────────────────────────────────────────────────────────────
  const desfruteArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.desfrute_arr[i - 1] ?? NaN)
  );
  const desfruteArrPeriodoSerie13 = cumSumTo13(monthlyData.desfrute_arr);
  const desfruteArrSerie = isPeriodo ? desfruteArrPeriodoSerie13 : desfruteArrMesSerie13;
  const desfruteArrValor = safe(desfruteArrSerie[mesIdx]);

  const desfruteArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(desfruteArrSerie[mesIdx]);
    const prev = safe(desfruteArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — pecAnoAnt12.desfArr.
  const desfruteArrAnoAntPossui = pecAnoAnt12.desfArr.some(v => v > 0);
  const desfruteArrMesAnoAntSerie13 = desfruteArrAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (pecAnoAnt12.desfArr[i - 1] ?? NaN)
      )
    : null;
  const desfruteArrPeriodoAnoAntSerie13 = desfruteArrAnoAntPossui
    ? cumSumTo13(pecAnoAnt12.desfArr)
    : null;
  const desfruteArrSerieAnoAnt = isPeriodo
    ? desfruteArrPeriodoAnoAntSerie13
    : desfruteArrMesAnoAntSerie13;
  const desfruteArrDeltaAno = (() => {
    if (!desfruteArrSerieAnoAnt) return null;
    const curr = safe(desfruteArrSerie[mesIdx]);
    const ant  = safe(desfruteArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — pecMeta12.desfArr.
  const desfruteArrMetaPossui = pecMeta12.desfArr.some(v => v > 0);
  const desfruteArrMesMetaSerie13 = desfruteArrMetaPossui
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (pecMeta12.desfArr[i - 1] ?? NaN)
      )
    : null;
  const desfruteArrPeriodoMetaSerie13 = desfruteArrMetaPossui
    ? cumSumTo13(pecMeta12.desfArr)
    : null;
  const desfruteArrSerieMeta = isPeriodo
    ? desfruteArrPeriodoMetaSerie13
    : desfruteArrMesMetaSerie13;
  const desfruteArrDeltaMeta = (() => {
    if (!desfruteArrSerieMeta) return null;
    const curr = safe(desfruteArrSerie[mesIdx]);
    const meta = safe(desfruteArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Desfrute (@) em PERCENTUAL — @ desfrutadas / @ iniciais ──
  //
  /* Distinto do desfruteArrIndicador, que entrega arrobas ABSOLUTAS e tem
     tres consumidores esperando isso (buildPlanejamentoVisaoGeralData:1050,
     buildProducaoRealizadaData:153, BlocoReuniaoExecutiva:25), e do
     desfruteIndicador, que e em CABECAS. Sao tres indicadores diferentes —
     nao unificar.
     Derivado: reusa desfrute_arr como numerador, sem fonte nova.
     @ INICIAIS = pesoTotalIni / 30, a definicao canonica do PC-100
     (consolidacaoGlobal.ts:86, `peso_ini_arr = Σ peso_total_inicial / 30`).
     Conferido em 22/08 contra o `peso_inicio_kg` da vw_zoot_fazenda_mensal
     que a tabela por fazenda usa: IDENTICOS nos 7 meses do NJ/2026 — as duas
     fontes de @ iniciais concordam, entao a linha e o tile partem do mesmo
     denominador.
     PERIODO = razao de SOMAS (Σ desfrute_arr / Σ @ iniciais), nunca media dos
     percentuais mensais: e a regra que os PRs de 22/08 fixaram para o periodo,
     a mesma do precoArr (Σ recPecComp / Σ desfrute_arr, :453). */
  // ─────────────────────────────────────────────────────────────
  const KG_ARROBA_PC100 = 30;
  const arrIni12 = monthlyData.pesoTotalIni.map(kg => (kg ?? 0) / KG_ARROBA_PC100);
  const pctArr = (num: number, den: number) => (den > 0 ? (num / den) * 100 : NaN);

  const desfrutePctArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : pctArr(monthlyData.desfrute_arr[i - 1] ?? 0, arrIni12[i - 1] ?? 0)
  );
  const desfrutePctArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : pctArr(
      sumArr(sliceUpTo(monthlyData.desfrute_arr, i - 1)),
      sumArr(sliceUpTo(arrIni12, i - 1)),
    )
  );
  const desfrutePctArrSerie = isPeriodo ? desfrutePctArrPeriodoSerie13 : desfrutePctArrMesSerie13;
  const desfrutePctArrValor = safe(desfrutePctArrSerie[mesIdx]);

  const desfrutePctArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(desfrutePctArrSerie[mesIdx]);
    const prev = safe(desfrutePctArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  /* Ano-1: numerador de pecAnoAnt12.desfArr (o MESMO do desfruteArr) e
     denominador de viewTotalsAnoAnt.peso_total_inicial — a fonte ano-1 que o
     prodKg ano-1 ja usa (:1826). Sem os dois, nao ha razao: devolve null e o
     delta simplesmente nao aparece, como nos irmaos. */
  const arrIniAnoAnt12 = viewTotalsAnoAnt
    ? Array.from({ length: 12 }, (_, i) => (viewTotalsAnoAnt[i + 1]?.peso_total_inicial ?? 0) / KG_ARROBA_PC100)
    : null;
  const desfrutePctArrAnoAntPossui = desfruteArrAnoAntPossui && !!arrIniAnoAnt12 && arrIniAnoAnt12.some(v => v > 0);
  const desfrutePctArrSerieAnoAnt = (desfrutePctArrAnoAntPossui && arrIniAnoAnt12)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        return isPeriodo
          ? pctArr(sumArr(sliceUpTo(pecAnoAnt12.desfArr, i - 1)), sumArr(sliceUpTo(arrIniAnoAnt12, i - 1)))
          : pctArr(pecAnoAnt12.desfArr[i - 1] ?? 0, arrIniAnoAnt12[i - 1] ?? 0);
      })
    : null;
  const desfrutePctArrDeltaAno = (() => {
    if (!desfrutePctArrSerieAnoAnt) return null;
    const curr = safe(desfrutePctArrSerie[mesIdx]);
    const ant  = safe(desfrutePctArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  /* Meta: numerador de pecMeta12.desfArr, denominador de
     monthlyDataMeta.pesoTotalIni — o mesmo par que o cenario realizado usa. */
  const arrIniMeta12 = monthlyDataMeta
    ? monthlyDataMeta.pesoTotalIni.map(kg => (kg ?? 0) / KG_ARROBA_PC100)
    : null;
  const desfrutePctArrMetaPossui = desfruteArrMetaPossui && !!arrIniMeta12 && arrIniMeta12.some(v => v > 0);
  const desfrutePctArrSerieMeta = (desfrutePctArrMetaPossui && arrIniMeta12)
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        return isPeriodo
          ? pctArr(sumArr(sliceUpTo(pecMeta12.desfArr, i - 1)), sumArr(sliceUpTo(arrIniMeta12, i - 1)))
          : pctArr(pecMeta12.desfArr[i - 1] ?? 0, arrIniMeta12[i - 1] ?? 0);
      })
    : null;
  const desfrutePctArrDeltaMeta = (() => {
    if (!desfrutePctArrSerieMeta) return null;
    const curr = safe(desfrutePctArrSerie[mesIdx]);
    const meta = safe(desfrutePctArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─────────────────────────────────────────────────────────────
  // ── Valor do Rebanho oficial — patrimônio/estoque (1-based, length 13) ──
  // mes = posição do mês. periodo = MESMO valor (estoque, sem soma/média).
  // Fonte: valor_rebanho_realizado_validado / vw_valor_rebanho_realizado_global_mensal.
  // ─────────────────────────────────────────────────────────────
  // valorRebanhoMes é 1-based (length 13): [0]=Dez ano-1, [1..12]=Jan..Dez.
  // serieAno é a mesma em mes/periodo (regra: período = posição do mês selecionado).
  const valorRebanhoSerie = valorRebanhoMes;
  const valorRebanhoValor = safe(valorRebanhoSerie[mesIdx]);

  const valorRebanhoDeltaMes = (() => {
    if (mesIdx < 1) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    // mesIdx-1 é Dez ano-1 quando mesIdx=1 — fonte oficial inclui esse valor
    const prev = safe(valorRebanhoSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Ano anterior — vem de valorRebanhoMesAnoAnt (carregado quando incluirComparativos=true).
  const valorRebanhoSerieAnoAnt = valorRebanhoMesAnoAnt.some(v => !isNaN(v))
    ? valorRebanhoMesAnoAnt
    : null;

  const valorRebanhoDeltaAno = (() => {
    if (!valorRebanhoSerieAnoAnt) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    const ant  = safe(valorRebanhoSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  // Meta — só Fazenda. valorRebanhoMetaMes é 0-based (length 12).
  // Convertemos para 1-based length 13 para padronizar com as outras séries.
  const valorRebanhoSerieMeta = valorRebanhoMetaMes.some(v => !isNaN(v))
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : (valorRebanhoMetaMes[i - 1] ?? NaN)
      )
    : null;

  const valorRebanhoDeltaMeta = (() => {
    if (!valorRebanhoSerieMeta) return null;
    const curr = safe(valorRebanhoSerie[mesIdx]);
    const meta = safe(valorRebanhoSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ── Valor do Rebanho SEM efeito de mercado (1-based, length 13) ──
  //
  // A PERGUNTA: o patrimonio cresceu porque ha mais boi, ou porque o boi
  // subiu de preco? Hoje as duas causas estao somadas num numero so, e a
  // diferenca entre este indicador e o irmao COM efeito E o efeito de
  // mercado.
  //
  // O preco e congelado em DEZEMBRO DO ANO ANTERIOR e vale o ano inteiro.
  //
  // R$/@ e nao R$/cabeca: assim o valor acompanha o PESO. Rebanho que
  // engordou tem de aparecer valendo mais, e por cabeca ficaria parado.
  //
  // `peso_total_final` de dez/ano-1 sai de `viewTotalsAnoAnt[12]` — a mesma
  // fonte que `pesoMedioFinAnoAnt13` (:1898) ja le. NENHUMA query nova: o
  // ano anterior so existe quando `incluirComparativos` e true, e sem ele o
  // indicador e null, nunca zero.
  const pesoTotalFinDezAnoAnt = viewTotalsAnoAnt
    ? viewTotalsAnoAnt[12]?.peso_total_final ?? null
    : null;

  /* O PRECO DERIVADO E O `preco_arroba_medio` PUBLICADO COINCIDEM, salvo um
     caso. Ele sai de `valor_total` da avaliacao dividido pelas arrobas que
     `viewTotalsAnoAnt` entrega — e essas ja vem do cache COM o overlay de
     fechamento aplicado (`rawCategorias`), nao do cache cru.

     Medido em dez/2025, arrobas com overlay contra as da avaliacao:
       Agnaldo, Raul Juliato, RRCC, Sta. Rita, Vera Ligia  →  0,0
       NJ Pecuaria                                         →  902,9 @

     Cinco dos seis batem EXATAMENTE. Os 902,9 da NJ sao integralmente uma
     fazenda num mes: Faz. Sto. Expedito, dez/2025, onde a avaliacao traz
     577.651 kg em 1.873 cabecas e o fechamento traz 604.738 kg em 1.869 —
     MAIS cabecas e MENOS peso, peso medio 308,4 contra 323,6. Nao e
     categoria faltando de um lado: e a mesma tropa pesada de outro jeito.

     Fora esse caso a avaliacao SEGUE o fechamento — bate em 8 das 9
     fazendas, com diferenca de 0 a 2 kg. As duas fontes concordam por
     construcao, e o Sto. Expedito e excecao a decidir, nao regra.

     ⚠ COMO A MEDICAO ERRADA ACONTECEU. A primeira versao deste comentario
     afirmava 1,2% na NJ e 3,0% na Vera Ligia. Era artefato de comparar com o
     cache CRU enquanto o codigo consome o cache COM overlay: o cru estava
     20.539 kg atrasado nas 3 Muchachas e 660 kg na Pureza. Corrigido o lado
     da comparacao, a Vera Ligia bate exatamente.
     E a MESMA armadilha que pos 273,3 @ na tela quando o correto era 245,0
     (PR-OVERLAY-EXTRAI-34): ler o cache cru onde a fonte soberana e o cache
     com overlay. Ao conferir qualquer numero de peso ou arroba contra este
     hook, comparar sempre com o overlay aplicado.

     Dividir pelo peso do cache e deliberado: e ele que move a serie mes a
     mes, e so assim dezembro coincide com o valor COM efeito — que e o teste
     do indicador. */
  const precoArrCongelado = (() => {
    const valorDez = safe(valorRebanhoMes[0]);     // [0] = dez do ano anterior
    if (valorDez == null || pesoTotalFinDezAnoAnt == null) return null;
    const arrobasDez = pesoTotalFinDezAnoAnt / 30;
    // Divisao por zero devolve null: rebanho sem peso nao define preco.
    return arrobasDez > 0 ? valorDez / arrobasDez : null;
  })();

  /* A posicao 0 sai da MESMA formula das outras, nao do valor com efeito
     copiado: assim a coincidencia de dezembro e estrutural, nao um caso
     especial escrito a mao — e o gate do PR e verificar que ela acontece. */
  const semEfeitoDe = (pesoTotalFin: number[] | undefined, i: number): number => {
    if (precoArrCongelado == null) return NaN;
    const peso = i === 0 ? pesoTotalFinDezAnoAnt : pesoTotalFin?.[i - 1];
    if (peso == null || !Number.isFinite(peso)) return NaN;
    return precoArrCongelado * (peso / 30);
  };

  const valorSemEfeitoSerie = precoArrCongelado == null
    ? null
    : Array.from({ length: 13 }, (_, i) => semEfeitoDe(monthlyData?.pesoTotalFin, i));

  const valorSemEfeitoValor = valorSemEfeitoSerie ? safe(valorSemEfeitoSerie[mesIdx]) : null;

  /* Ano anterior: o valor COM efeito do ano-1. Nao existe preco congelado
     do ano-2 para refaze-lo sem efeito, e inventar um seria pior que
     declarar a assimetria — ela fica no comentario e no subtitulo. */
  const valorSemEfeitoSerieAnoAnt = valorRebanhoSerieAnoAnt;

  /* Meta com o MESMO preco congelado: a meta mede so a evolucao PLANEJADA
     do rebanho, sem embutir aposta de preco. */
  const valorSemEfeitoSerieMeta = (() => {
    if (precoArrCongelado == null || !monthlyDataMeta) return null;
    const s = Array.from({ length: 13 }, (_, i) =>
      i === 0 ? NaN : semEfeitoDe(monthlyDataMeta.pesoTotalFin, i));
    return s.some(v => !isNaN(v)) ? s : null;
  })();

  const delta13 = (serie: number[] | null, idx: number): number | null => {
    if (!serie || !valorSemEfeitoSerie) return null;
    const curr = safe(valorSemEfeitoSerie[mesIdx]);
    const ref  = safe(serie[idx]);
    if (curr == null || ref == null || ref === 0) return null;
    return ((curr - ref) / ref) * 100;
  };

  const valorSemEfeitoDeltaMes  = mesIdx < 1 ? null : delta13(valorSemEfeitoSerie, mesIdx - 1);
  const valorSemEfeitoDeltaAno  = delta13(valorSemEfeitoSerieAnoAnt, mesIdx);
  const valorSemEfeitoDeltaMeta = delta13(valorSemEfeitoSerieMeta, mesIdx);

  // ─────────────────────────────────────────────────────────────
  // ── @ EM ESTOQUE (1-based, length 13) ──
  //
  // O par patrimonial do "@ produzidas": aquele e fluxo, este e estoque.
  // `peso_vivo / 30` — a regra da arroba do sistema para tudo que nao e
  // abate. Mesmo insumo do `kgHa` e do `pesoMedio`, so que sem divisor.
  //
  // `mes` e `periodo` recebem a MESMA serie: estoque NAO acumula, igual ao
  // `valorRebanho` e ao `cabecas`. Somar o estoque de doze meses contaria o
  // mesmo boi doze vezes.
  //
  // A posicao 0 reusa `pesoTotalFinDezAnoAnt`, ja derivado de
  // `viewTotalsAnoAnt[12]` no bloco do valor sem efeito — nenhuma leitura
  // nova, e a mesma foto que o ponto "Ini" usa.
  // ─────────────────────────────────────────────────────────────
  const arrEstoque = (peso: number | null | undefined): number =>
    peso != null && Number.isFinite(peso) ? peso / 30 : NaN;

  const arrobasEstoqueSerie = Array.from({ length: 13 }, (_, i) =>
    i === 0
      ? arrEstoque(pesoTotalFinDezAnoAnt)
      : arrEstoque(monthlyData?.pesoTotalFin?.[i - 1]));

  const arrobasEstoqueValor = safe(arrobasEstoqueSerie[mesIdx]);

  const arrobasEstoqueSerieAnoAnt = viewTotalsAnoAnt
    ? Array.from({ length: 13 }, (_, i) =>
        i === 0 ? NaN : arrEstoque(viewTotalsAnoAnt[i]?.peso_total_final))
    : null;

  const arrobasEstoqueSerieMeta = monthlyDataMeta
    ? (() => {
        const s = Array.from({ length: 13 }, (_, i) =>
          i === 0 ? NaN : arrEstoque(monthlyDataMeta.pesoTotalFin?.[i - 1]));
        return s.some(v => !isNaN(v)) ? s : null;
      })()
    : null;

  const deltaEstoque = (ref: number[] | null, idx: number): number | null => {
    if (!ref) return null;
    const curr = safe(arrobasEstoqueSerie[mesIdx]);
    const r = safe(ref[idx]);
    if (curr == null || r == null || r === 0) return null;
    return ((curr - r) / r) * 100;
  };
  const arrobasEstoqueDeltaMes  = mesIdx < 1 ? null : deltaEstoque(arrobasEstoqueSerie, mesIdx - 1);
  const arrobasEstoqueDeltaAno  = deltaEstoque(arrobasEstoqueSerieAnoAnt, mesIdx);
  const arrobasEstoqueDeltaMeta = deltaEstoque(arrobasEstoqueSerieMeta, mesIdx);


  // ─────────────────────────────────────────────────────────────
  // ── R$ POR @ EM ESTOQUE (1-based, length 13) ──
  //
  // `valorRebanhoMes[m] / arrobasEstoque[m]` — liga patrimonio a peso.
  // Estoque, entao `mes` e `periodo` recebem a mesma serie.
  //
  // ⚠ ESTE NUMERO JA EXISTE PUBLICADO como `preco_arroba_medio` em
  // `valor_rebanho_realizado_validado`, e os dois NEM SEMPRE BATEM. Medido
  // em dez/2025, Faz. Sto. Expedito: R$ 320,30 derivado contra R$ 335,32
  // publicado, porque as duas fontes discordam de quantas arrobas existem
  // naquele mes — 577.651 kg na avaliacao contra 604.738 no fechamento.
  // Nos outros oito pares fazenda-mes daquele mes elas batem.
  //
  // E a divergencia NAO e permanente: medido em jul/2026, as NOVE fazendas
  // batem com diferenca 0,00 — inclusive o proprio Sto. Expedito, 322,05
  // contra 322,05. O desencontro e daquele mes, nao da formula.
  //
  // A divergencia e ANTERIOR a este indicador (ver o bloco do valor sem
  // efeito, acima) e nao e resolvida aqui. O que muda e que ela passa a
  // aparecer na tela quando acontecer — e aparecer e melhor que ficar
  // escondida.
  // ─────────────────────────────────────────────────────────────
  const precoArrEstoqueSerie = Array.from({ length: 13 }, (_, i) => {
    const valor = safe(valorRebanhoMes[i]);
    const arr   = safe(arrobasEstoqueSerie[i]);
    return valor != null && arr != null && arr !== 0 ? valor / arr : NaN;
  });
  const precoArrEstoqueValor = safe(precoArrEstoqueSerie[mesIdx]);

  const precoArrEstoqueSerieAnoAnt = (valorRebanhoSerieAnoAnt && arrobasEstoqueSerieAnoAnt)
    ? Array.from({ length: 13 }, (_, i) => {
        const valor = safe(valorRebanhoSerieAnoAnt[i]);
        const arr   = safe(arrobasEstoqueSerieAnoAnt[i]);
        return valor != null && arr != null && arr !== 0 ? valor / arr : NaN;
      })
    : null;

  const deltaPrecoEst = (ref: number[] | null, idx: number): number | null => {
    if (!ref) return null;
    const curr = safe(precoArrEstoqueSerie[mesIdx]);
    const r = safe(ref[idx]);
    if (curr == null || r == null || r === 0) return null;
    return ((curr - r) / r) * 100;
  };
  const precoArrEstoqueDeltaMes = mesIdx < 1 ? null : deltaPrecoEst(precoArrEstoqueSerie, mesIdx - 1);
  const precoArrEstoqueDeltaAno = deltaPrecoEst(precoArrEstoqueSerieAnoAnt, mesIdx);

  // ─────────────────────────────────────────────────────────────
  // ── @ PRODUZIDAS POR HECTARE (1-based, length 13) ──
  //
  // NENHUMA FORMULA NOVA AQUI. O mensal e `monthlyData.arrHa`, que sai de
  // `calcularIndicadoresEficienciaArea` — a fonte unica declarada. O
  // acumulado e `calcularArrHaAcumulado`, que passou a morar no MESMO
  // modulo em vez de nascer aqui: `arrHa` ja tinha tres copias no
  // PainelConsultorTab, e uma quarta no hook seria a quinta implementacao.
  //
  // A AREA JA E A PECUARIA. Conferido: `buildMonthlyDataFromView` recebe
  // `areaPecuariaRealNumPorMes` no parametro `areaProdutivaMensal`
  // (:1694) e `areaPecuariaMetaNumPorMes` na meta (:1712). O nome do
  // parametro diz "produtiva" e o insumo e pecuaria — por isso `lotUaHa` e
  // `kgHa` NAO mudam de valor com este PR: eles ja dividiam certo.
  //
  // ANO ANTERIOR (PR-ATIVIDADE-09): passou a existir. A producao do ano-1 ja
  // estava aqui (`arrobasProdAnoAnt12`, :2367) e a area do ano-1 entrou com
  // `snapshotsAnoAnt` — a requisicao ja rodava e o resultado era descartado.
  // E' divisao, nao fonte nova.
  // ─────────────────────────────────────────────────────────────
  const arrobasHaMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData?.arrHa?.[i - 1] ?? NaN));

  const arrobasHaAcum12 = calcularArrHaAcumulado(
    monthlyData?.arrobasProd ?? [],
    areaPecuariaRealNumPorMes,
  );
  const arrobasHaPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (arrobasHaAcum12[i - 1] ?? NaN));

  const arrobasHaSerie = isPeriodo ? arrobasHaPeriodoSerie13 : arrobasHaMesSerie13;
  const arrobasHaValor = safe(arrobasHaSerie[mesIdx]);

  const arrobasHaMetaSerie13 = monthlyDataMeta
    ? (() => {
        const s12 = isPeriodo
          ? calcularArrHaAcumulado(monthlyDataMeta.arrobasProd ?? [], areaPecuariaMetaNumPorMes)
          : (monthlyDataMeta.arrHa ?? []);
        const s13 = Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (s12[i - 1] ?? NaN));
        return s13.some(v => !isNaN(v)) ? s13 : null;
      })()
    : null;

  const deltaArrHa = (ref: number[] | null, idx: number): number | null => {
    if (!ref) return null;
    const curr = safe(arrobasHaSerie[mesIdx]);
    const r = safe(ref[idx]);
    if (curr == null || r == null || r === 0) return null;
    return ((curr - r) / r) * 100;
  };
  const arrobasHaDeltaMes  = mesIdx < 1 ? null : deltaArrHa(arrobasHaSerie, mesIdx - 1);
  const arrobasHaDeltaMeta = deltaArrHa(arrobasHaMetaSerie13, mesIdx);

  /* @/ha do ano anterior — producao do ano-1 sobre area pecuaria do ano-1.
     No mes e' a razao mes a mes; no periodo e' `calcularArrHaAcumulado`, a
     MESMA funcao do realizado, para que as duas leituras respondam a mesma
     pergunta em anos diferentes. */
  const arrobasHaMesAnoAntSerie13 = arrobasProdAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const a = areaPecuariaRealAnoAntNumPorMes[i - 1];
        const prod = arrobasProdAnoAnt12[i - 1];
        return Number.isFinite(a) && a > 0 && Number.isFinite(prod) ? prod / a : NaN;
      })
    : null;
  const arrobasHaPeriodoAnoAntSerie13 = arrobasProdAnoAnt12
    ? (() => {
        const s12 = calcularArrHaAcumulado(arrobasProdAnoAnt12, areaPecuariaRealAnoAntNumPorMes);
        return Array.from({ length: 13 }, (_, i) => (i === 0 ? NaN : (s12[i - 1] ?? NaN)));
      })()
    : null;
  const arrobasHaSerieAnoAnt = isPeriodo ? arrobasHaPeriodoAnoAntSerie13 : arrobasHaMesAnoAntSerie13;
  const arrobasHaDeltaAno = deltaArrHa(arrobasHaSerieAnoAnt, mesIdx);

  /* ── E1 · AREA PRODUTIVA PECUARIA ──
     O nome resolve a ambiguidade que parou o PR-08: ha tres series de area
     no hook e duas se chamam "produtiva". Esta declara no rotulo qual e —
     a MESMA que divide o `@/ha`, `lotUaHa` e o `kgHa`.
     `areaProdutivaRealPorMes` e `areaProdutivaMes` seguem intocados, com os
     donos que tem. Este indicador nao participa da colisao: usa outro nome.
     PERIODO E MEDIA, nao a foto do mes — ver `mediaAreaAcumulada12`. */
  const areaPecMesSerie13     = areaTo13(areaPecuariaRealPorMes);
  const areaPecPeriodoSerie13 = areaTo13(mediaAreaAcumulada12(areaPecuariaRealPorMes));
  const areaPecMesAnoAntSerie13     = areaTo13(areaPecuariaRealAnoAntPorMes);
  const areaPecPeriodoAnoAntSerie13 = areaTo13(mediaAreaAcumulada12(areaPecuariaRealAnoAntPorMes));
  const areaPecMesMetaSerie13     = areaTo13(areaPecuariaMetaPorMes);
  const areaPecPeriodoMetaSerie13 = areaTo13(mediaAreaAcumulada12(areaPecuariaMetaPorMes));
  const areaPecSerie = isPeriodo ? areaPecPeriodoSerie13 : areaPecMesSerie13;
  const areaPecValor = safe(areaPecSerie[mesIdx]);
  const deltaAreaPec = (ref: number[] | null, idx: number): number | null => {
    if (!ref) return null;
    const curr = safe(areaPecSerie[mesIdx]);
    const r = safe(ref[idx]);
    if (curr == null || r == null || r === 0) return null;
    return ((curr - r) / r) * 100;
  };
  const areaPecDeltaMes  = mesIdx < 1 ? null : deltaAreaPec(areaPecSerie, mesIdx - 1);
  const areaPecDeltaAno  = deltaAreaPec(isPeriodo ? areaPecPeriodoAnoAntSerie13 : areaPecMesAnoAntSerie13, mesIdx);
  const areaPecDeltaMeta = deltaAreaPec(isPeriodo ? areaPecPeriodoMetaSerie13 : areaPecMesMetaSerie13, mesIdx);

  // ─────────────────────────────────────────────────────────────
  // ── Financeiro Produtivo — 6 indicadores (1-based, length 13) ──
  // Sem ano-1 nem meta nas fontes auditadas (lancPec/lancFin ano-1
  // não fetched; monthlyDataMeta não tem recPecComp/custOper).
  // ─────────────────────────────────────────────────────────────
  const cumSumArr = (arr: number[]): number[] => {
    const out: number[] = [];
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      acc += (v == null || isNaN(v) ? 0 : v);
      out.push(acc);
    }
    return out;
  };

  // === 1) Receita Pecuária Competência ===
  const receitaPecMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.recPecComp[i - 1] ?? NaN)
  );
  const receitaPecPeriodoSerie13 = cumSumTo13(monthlyData.recPecComp);
  const receitaPecSerie = isPeriodo ? receitaPecPeriodoSerie13 : receitaPecMesSerie13;
  const receitaPecValor = safe(receitaPecSerie[mesIdx]);
  const receitaPecDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const prev = safe(receitaPecSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Receita Pec — ano-1 e meta (fonte: pecAnoAnt12 / pecMeta12 via fetch direto a 'lancamentos').
  const receitaPecAnoAntPossui = pecAnoAnt12.rec.some(v => v > 0);
  const receitaPecMesAnoAntSerie13 = receitaPecAnoAntPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (pecAnoAnt12.rec[i - 1] ?? NaN))
    : null;
  const receitaPecPeriodoAnoAntSerie13 = receitaPecAnoAntPossui
    ? cumSumTo13(pecAnoAnt12.rec)
    : null;
  const receitaPecSerieAnoAnt = isPeriodo ? receitaPecPeriodoAnoAntSerie13 : receitaPecMesAnoAntSerie13;
  const receitaPecDeltaAno = (() => {
    if (!receitaPecSerieAnoAnt) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const ant  = safe(receitaPecSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const receitaPecMetaPossui = pecMeta12.rec.some(v => v > 0);
  const receitaPecMesMetaSerie13 = receitaPecMetaPossui
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (pecMeta12.rec[i - 1] ?? NaN))
    : null;
  const receitaPecPeriodoMetaSerie13 = receitaPecMetaPossui
    ? cumSumTo13(pecMeta12.rec)
    : null;
  const receitaPecSerieMeta = isPeriodo ? receitaPecPeriodoMetaSerie13 : receitaPecMesMetaSerie13;
  const receitaPecDeltaMeta = (() => {
    if (!receitaPecSerieMeta) return null;
    const curr = safe(receitaPecSerie[mesIdx]);
    const meta = safe(receitaPecSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 2) Custeio Produção Pecuária — fonte custeioPec (sem investimento/juros/agri) ===
  // Booleans "possui" mantidos no escopo do hook por serem consumidos também por
  // custoArrIndicador/custoCabIndicador (custoArrAnoAntPossui, custoCabAnoAntPossui etc.).
  const custeioPecAnoAntPossui = custeioPecAnoAnt12.some(v => v > 0);
  const custeioPecMetaPossui = custeioPecMeta12.some(v => v > 0);
  // O objeto custeioPecIndicador é construído via _custeioPecIndicadorMemo,
  // declarado logo antes de baseReturn (referência estável — quebra o render
  // loop quando consumido como dep de useMemo em PainelConsultorTab).

  // === 3) Custo Produtivo R$/@ — custeioPec / arrobasProd ===
  const custoArrMes12 = monthlyData.custeioPec.map((c, i) => {
    const a = monthlyData.arrobasProd[i];
    return a != null && a > 0 ? c / a : NaN;
  });
  const custoArrPeriodo12 = (() => {
    const cAcum = cumSumArr(monthlyData.custeioPec);
    const aAcum = cumSumArr(monthlyData.arrobasProd);
    return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
  })();
  const custoArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoArrMes12[i - 1] ?? NaN)
  );
  const custoArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoArrPeriodo12[i - 1] ?? NaN)
  );
  const custoArrSerie = isPeriodo ? custoArrPeriodoSerie13 : custoArrMesSerie13;
  const custoArrValor = safe(custoArrSerie[mesIdx]);
  const custoArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const prev = safe(custoArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Custo R$/@ — ano-1 e meta. Possui se custeio E arrobas ano-1/meta possuírem.
  const custoArrAnoAntPossui = custeioPecAnoAntPossui
    && !!arrobasProdAnoAnt12 && arrobasProdAnoAnt12.some(v => v > 0);
  const custoArrMesAnoAnt12 = custoArrAnoAntPossui && arrobasProdAnoAnt12
    ? custeioPecAnoAnt12.map((c, i) => {
        const a = arrobasProdAnoAnt12[i];
        return a > 0 ? c / a : NaN;
      })
    : null;
  const custoArrPeriodoAnoAnt12 = custoArrAnoAntPossui && arrobasProdAnoAnt12
    ? (() => {
        const cAcum = cumSumArr(custeioPecAnoAnt12);
        const aAcum = cumSumArr(arrobasProdAnoAnt12);
        return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
      })()
    : null;
  const custoArrMesAnoAntSerie13 = custoArrMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoArrPeriodoAnoAntSerie13 = custoArrPeriodoAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrPeriodoAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoArrSerieAnoAnt = isPeriodo ? custoArrPeriodoAnoAntSerie13 : custoArrMesAnoAntSerie13;
  const custoArrDeltaAno = (() => {
    if (!custoArrSerieAnoAnt) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const ant  = safe(custoArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const custoArrMetaPossui = custeioPecMetaPossui
    && !!monthlyDataMeta && monthlyDataMeta.arrobasProd.some(v => v > 0);
  const custoArrMesMeta12 = custoArrMetaPossui && monthlyDataMeta
    ? custeioPecMeta12.map((c, i) => {
        const a = monthlyDataMeta.arrobasProd[i];
        return a > 0 ? c / a : NaN;
      })
    : null;
  const custoArrPeriodoMeta12 = custoArrMetaPossui && monthlyDataMeta
    ? (() => {
        const cAcum = cumSumArr(custeioPecMeta12);
        const aAcum = cumSumArr(monthlyDataMeta.arrobasProd);
        return cAcum.map((c, i) => aAcum[i] > 0 ? c / aAcum[i] : NaN);
      })()
    : null;
  const custoArrMesMetaSerie13 = custoArrMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrMesMeta12[i - 1] ?? NaN))
    : null;
  const custoArrPeriodoMetaSerie13 = custoArrPeriodoMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoArrPeriodoMeta12[i - 1] ?? NaN))
    : null;
  const custoArrSerieMeta = isPeriodo ? custoArrPeriodoMetaSerie13 : custoArrMesMetaSerie13;
  const custoArrDeltaMeta = (() => {
    if (!custoArrSerieMeta) return null;
    const curr = safe(custoArrSerie[mesIdx]);
    const meta = safe(custoArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 4) Preço de Venda R$/@ — recPecComp / desfrute_arr ===
  const precoArrMes12 = monthlyData.recPecComp.map((r, i) => {
    const d = monthlyData.desfrute_arr[i];
    return d != null && d > 0 ? r / d : NaN;
  });
  const precoArrPeriodo12 = (() => {
    const rAcum = cumSumArr(monthlyData.recPecComp);
    const dAcum = cumSumArr(monthlyData.desfrute_arr);
    return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
  })();
  const precoArrMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (precoArrMes12[i - 1] ?? NaN)
  );
  const precoArrPeriodoSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (precoArrPeriodo12[i - 1] ?? NaN)
  );
  const precoArrSerie = isPeriodo ? precoArrPeriodoSerie13 : precoArrMesSerie13;
  const precoArrValor = safe(precoArrSerie[mesIdx]);
  const precoArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const prev = safe(precoArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Preço R$/@ — ano-1 e meta (mesmas fontes pecAnoAnt12 / pecMeta12).
  const precoArrAnoAntPossui = pecAnoAnt12.desfArr.some(v => v > 0);
  const precoArrMesAnoAnt12 = precoArrAnoAntPossui
    ? pecAnoAnt12.rec.map((r, i) => {
        const d = pecAnoAnt12.desfArr[i];
        return d > 0 ? r / d : NaN;
      })
    : null;
  const precoArrPeriodoAnoAnt12 = precoArrAnoAntPossui
    ? (() => {
        const rAcum = cumSumArr(pecAnoAnt12.rec);
        const dAcum = cumSumArr(pecAnoAnt12.desfArr);
        return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
      })()
    : null;
  const precoArrMesAnoAntSerie13 = precoArrMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const precoArrPeriodoAnoAntSerie13 = precoArrPeriodoAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrPeriodoAnoAnt12[i - 1] ?? NaN))
    : null;
  const precoArrSerieAnoAnt = isPeriodo ? precoArrPeriodoAnoAntSerie13 : precoArrMesAnoAntSerie13;
  const precoArrDeltaAno = (() => {
    if (!precoArrSerieAnoAnt) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const ant  = safe(precoArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const precoArrMetaPossui = pecMeta12.desfArr.some(v => v > 0);
  const precoArrMesMeta12 = precoArrMetaPossui
    ? pecMeta12.rec.map((r, i) => {
        const d = pecMeta12.desfArr[i];
        return d > 0 ? r / d : NaN;
      })
    : null;
  const precoArrPeriodoMeta12 = precoArrMetaPossui
    ? (() => {
        const rAcum = cumSumArr(pecMeta12.rec);
        const dAcum = cumSumArr(pecMeta12.desfArr);
        return rAcum.map((r, i) => dAcum[i] > 0 ? r / dAcum[i] : NaN);
      })()
    : null;
  const precoArrMesMetaSerie13 = precoArrMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrMesMeta12[i - 1] ?? NaN))
    : null;
  const precoArrPeriodoMetaSerie13 = precoArrPeriodoMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (precoArrPeriodoMeta12[i - 1] ?? NaN))
    : null;
  const precoArrSerieMeta = isPeriodo ? precoArrPeriodoMetaSerie13 : precoArrMesMetaSerie13;
  const precoArrDeltaMeta = (() => {
    if (!precoArrSerieMeta) return null;
    const curr = safe(precoArrSerie[mesIdx]);
    const meta = safe(precoArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // === 5) Custo Cab. R$/cab — custeioPec / cabMedia (mesma base GMD) ===
  // Mês:     custeioPec[m] / cabMediaMes[m]
  // Período: (Σ custeioPec Jan→m / cabMediaAcumulada[m]) / m
  //          onde m = número de meses considerados no período (1..12).
  // Não somar custo/cab mês a mês — a divisão pelo nº de meses garante R$/cab.mês médio.
  const custoCabMes12 = monthlyData.custeioPec.map((c, i) => {
    const cm = monthlyData.cabMediaMes[i];
    return cm != null && cm > 0 ? c / cm : NaN;
  });
  const custoCabPeriodoSerie13 = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const cAcum = sumArr(sliceUpTo(monthlyData.custeioPec, i - 1));
    const cmAcum = cabMediaAcumulada[i];
    if (!(cmAcum > 0)) return NaN;
    return (cAcum / cmAcum) / i;
  });
  const custoCabMesSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (custoCabMes12[i - 1] ?? NaN)
  );
  const custoCabSerie = isPeriodo ? custoCabPeriodoSerie13 : custoCabMesSerie13;
  const custoCabValor = safe(custoCabSerie[mesIdx]);
  const custoCabDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const prev = safe(custoCabSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  // Custo Cab. — ano-1 e meta. Mesma fórmula: mês = c/cm; per = (Σc/cmAcum)/numMeses.
  const custoCabAnoAntPossui = custeioPecAnoAntPossui
    && !!cabMediaMesAnoAnt && cabMediaMesAnoAnt.some(v => v > 0)
    && !!cabMediaAcumAnoAnt;
  const custoCabMesAnoAnt12 = custoCabAnoAntPossui && cabMediaMesAnoAnt
    ? custeioPecAnoAnt12.map((c, i) => {
        const cm = cabMediaMesAnoAnt[i];
        return cm > 0 ? c / cm : NaN;
      })
    : null;
  const custoCabMesAnoAntSerie13 = custoCabMesAnoAnt12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoCabMesAnoAnt12[i - 1] ?? NaN))
    : null;
  const custoCabPeriodoAnoAntSerie13 = custoCabAnoAntPossui && cabMediaAcumAnoAnt
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const cAcum = sumArr(sliceUpTo(custeioPecAnoAnt12, i - 1));
        const cmAcum = cabMediaAcumAnoAnt[i];
        if (!(cmAcum > 0)) return NaN;
        return (cAcum / cmAcum) / i;
      })
    : null;
  const custoCabSerieAnoAnt = isPeriodo ? custoCabPeriodoAnoAntSerie13 : custoCabMesAnoAntSerie13;
  const custoCabDeltaAno = (() => {
    if (!custoCabSerieAnoAnt) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const ant  = safe(custoCabSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const custoCabMetaPossui = custeioPecMetaPossui
    && !!monthlyDataMeta && monthlyDataMeta.cabMediaMes.some(v => v > 0)
    && !!cabMediaAcumMeta;
  const custoCabMesMeta12 = custoCabMetaPossui && monthlyDataMeta
    ? custeioPecMeta12.map((c, i) => {
        const cm = monthlyDataMeta.cabMediaMes[i];
        return cm > 0 ? c / cm : NaN;
      })
    : null;
  const custoCabMesMetaSerie13 = custoCabMesMeta12
    ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custoCabMesMeta12[i - 1] ?? NaN))
    : null;
  const custoCabPeriodoMetaSerie13 = custoCabMetaPossui && cabMediaAcumMeta
    ? Array.from({ length: 13 }, (_, i) => {
        if (i === 0) return NaN;
        const cAcum = sumArr(sliceUpTo(custeioPecMeta12, i - 1));
        const cmAcum = cabMediaAcumMeta[i];
        if (!(cmAcum > 0)) return NaN;
        return (cAcum / cmAcum) / i;
      })
    : null;
  const custoCabSerieMeta = isPeriodo ? custoCabPeriodoMetaSerie13 : custoCabMesMetaSerie13;
  const custoCabDeltaMeta = (() => {
    if (!custoCabSerieMeta) return null;
    const curr = safe(custoCabSerie[mesIdx]);
    const meta = safe(custoCabSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  /* Margem = preco - custo, elemento a elemento. Guarda de NaN em
     qualquer dos dois lados: sem preco ou sem custo nao ha margem, e
     zero afirmaria margem nula. A posicao 0 fica NaN de proposito —
     margem por @ e RAZAO, nao estoque: nao existe "margem inicial", e o
     modal so prepende "Ini" quando a posicao 0 e finita. */
  const margem13 = (p: number[] | null, c: number[] | null): number[] | null => {
    if (!p || !c) return null;
    return Array.from({ length: 13 }, (_, i) => {
      if (i === 0) return NaN;
      const pv = p[i];
      const cv = c[i];
      if (isNaN(pv) || isNaN(cv)) return NaN;
      return pv - cv;
    });
  };
  /* Fallback de tipo para os dois casos NAO-nulos abaixo: `precoArr*Serie13` e
     `custoArr*Serie13` sao `number[]`, nunca null, entao este ramo e
     inalcancavel. Existe so para o resultado continuar `number[]` — um
     `Array(13).fill(NaN)` daria `any[]` e alargaria o tipo. */
  const nan13 = (): number[] => Array.from({ length: 13 }, () => NaN);

  // === 6) Margem por @ — preçoArr − custoArr ===
  const margemArrMesSerie13     = margem13(precoArrMesSerie13,     custoArrMesSerie13)     ?? nan13();
  const margemArrPeriodoSerie13 = margem13(precoArrPeriodoSerie13, custoArrPeriodoSerie13) ?? nan13();
  const margemArrSerie = isPeriodo ? margemArrPeriodoSerie13 : margemArrMesSerie13;
  const margemArrValor = safe(margemArrSerie[mesIdx]);
  const margemArrDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const prev = safe(margemArrSerie[mesIdx - 1]);
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  /* Margem por @ — ano-1 e meta, agora nas DUAS leituras. Antes cada uma
     subtraia as series JA COLAPSADAS por `isPeriodo`, entao existia uma
     leitura so de cada e o modal ficava sem linha de ano anterior e sem meta.
     Subtrair depois de escolher o modo e escolher o modo depois de subtrair
     dao o mesmo array — os deltas nao mudam. */
  const margemArrMesAnoAntSerie13     = margem13(precoArrMesAnoAntSerie13,     custoArrMesAnoAntSerie13);
  const margemArrPeriodoAnoAntSerie13 = margem13(precoArrPeriodoAnoAntSerie13, custoArrPeriodoAnoAntSerie13);
  const margemArrMesMetaSerie13       = margem13(precoArrMesMetaSerie13,       custoArrMesMetaSerie13);
  const margemArrPeriodoMetaSerie13   = margem13(precoArrPeriodoMetaSerie13,   custoArrPeriodoMetaSerie13);

  const margemArrSerieAnoAnt = isPeriodo ? margemArrPeriodoAnoAntSerie13 : margemArrMesAnoAntSerie13;
  const margemArrDeltaAno = (() => {
    if (!margemArrSerieAnoAnt) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const ant  = safe(margemArrSerieAnoAnt[mesIdx]);
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  })();

  const margemArrSerieMeta = isPeriodo ? margemArrPeriodoMetaSerie13 : margemArrMesMetaSerie13;
  const margemArrDeltaMeta = (() => {
    if (!margemArrSerieMeta) return null;
    const curr = safe(margemArrSerie[mesIdx]);
    const meta = safe(margemArrSerieMeta[mesIdx]);
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  })();

  // ─── Etapa 2C + fix referências (Opção A): indicadores financeiros oficiais ───────────────────────
  // Agregadores literais por grupo_custo / macro_custo (classificacao.ts).
  // Fonte: lancFin já filtrado e disponível neste hook. Nenhuma query extra.
  //
  // CRÍTICO: o bloco inteiro (14 séries raw + 14 *Indicador) está dentro de um único
  // useMemo com deps [lancFin, ano, mes, viewMode]. Isso garante que as referências
  // dos *Indicador permaneçam ESTÁVEIS quando os inputs não mudam — evitando render
  // loop em consumidores que coloquem esses objetos em deps de useMemo (caso de
  // PainelConsultorTab → soberanoSerie → blocos → setOpenBlocos).
  const _finSoberano = useMemo(() => {
    const addArr12 = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] ?? 0));

    const cusPecSemJ  = agregaCusteioPecSemJuros(lancFin, ano);
    const jurPec      = agregaJurosPec(lancFin, ano);
    const invFazPec   = agregaInvFazendaPec(lancFin, ano);
    const cusAgriSemJ = agregaCusteioAgriSemJuros(lancFin, ano);
    const jurAgri     = agregaJurosAgri(lancFin, ano);
    const invFazAgri  = agregaInvFazendaAgri(lancFin, ano);
    const invBov      = agregaInvBovinos(lancFin, ano);
    const amort       = agregaAmortizacoes(lancFin, ano);
    const div         = agregaDividendos(lancFin, ano);
    const recPecCx    = agregaReceitaPec(lancFin, ano);
    const recSilvi      = agregaReceitaSilvicola(lancFin, ano);
    const cusSilviSemJ  = agregaCusteioSilviSemJuros(lancFin, ano);
    const invFazSilvi   = agregaInvFazendaSilvi(lancFin, ano);
    const amortSilvi    = agregaAmortizacaoSilvi(lancFin, ano);
    const recAgri     = agregaReceitaAgri(lancFin, ano);
    const recOutras   = agregaOutrasReceitas(lancFin, ano);
    const captacao    = agregaEntradasFinanceiras(lancFin, ano);
/* PR-PC100-BLOCO-CAIXA-01 — dez series novas. Custo Fixo e Custo Variavel
   PECUARIA saem dos predicates ESTRITOS: `custeioPecSemJuros` soma os dois,
   e usa-lo numa das linhas faria ela conter a irma (Custo Fixo Pecuaria,
   R$ 49,85 mi, o maior grupo de saida da base). */
    const cfPec       = agregaCustoFixoPec(lancFin, ano);
    const cvPec       = agregaCustoVariavelPec(lancFin, ano);
    const cfAgri       = agregaCustoFixoAgri(lancFin, ano);
    const cfSilvi       = agregaCustoFixoSilvi(lancFin, ano);
    const dedPec       = agregaDeducoesPec(lancFin, ano);
    const dedAgri       = agregaDeducoesAgri(lancFin, ano);
    const dedSilvi       = agregaDeducoesSilvi(lancFin, ano);
    const jurSilvi       = agregaJurosSilvi(lancFin, ano);
    const aporte       = agregaAportePessoal(lancFin, ano);
    const retEmp       = agregaRetornoEmprestimos(lancFin, ano);
    const captPec     = agregaCaptacaoPec(lancFin, ano);
    const captAgri    = agregaCaptacaoAgri(lancFin, ano);
    const captSilvi   = agregaCaptacaoSilvi(lancFin, ano);
    const captSemEsc  = agregaCaptacaoSemEscopo(lancFin, ano);
    const naoClassif  = agregaEntradasNaoClassificadas(lancFin, ano);
    const deducoes    = agregaDeducoesSaida(lancFin, ano);
    const amortPec    = agregaAmortizacaoPec(lancFin, ano);
    const amortAgri   = agregaAmortizacaoAgri(lancFin, ano);
    const tributos    = agregaTributos(lancFin, ano);
    const cusPecComJ  = addArr12(cusPecSemJ, jurPec);
    const cusAgriComJ = addArr12(cusAgriSemJ, jurAgri);
    const cusSilviComJ  = addArr12(cusSilviSemJ, jurSilvi);
    const desembPec   = addArr12(cusPecComJ, invFazPec);
    const desembAgri  = addArr12(cusAgriComJ, invFazAgri);
    // Modelo Caixa puro — inclui Deduções de Receitas (lado saída).
    // Espelha agregaSaidasTotais oficial; eliminamos a soma manual paralela
    // que excluía dedução e gerava divergência com Dashboard.
    const saidasTot = agregaSaidasTotais(lancFin, ano);

    // ─── META — só calcula se grid disponível (A3) ───────────────────────
    // Indicadores soberanos META consomem o grid consolidado interno único.
    // gridMetaExterno (param) é ignorado deliberadamente — callers atuais
    // passavam grid cru com mesmo bug do custeioPecMeta12 standalone.
    //
    // NÃO gatear por carregarMetaEffective: callers como PainelConsultorTab
    // chamam o hook sem carregarMeta=true (default false), mas SEMPRE precisam
    // dos indicadores META do _finSoberano (modal Auditoria, custeioPec/jurosPec
    // etc.). O grid interno é carregado independente desse flag — basta checar
    // length para saber se já chegaram dados do TanStack Query.
    const hasGridMeta = gridMetaConsolidado.length > 0;
    const cusPecSemJ_M  = hasGridMeta ? agregaCusteioPecSemJurosMeta(gridMetaConsolidado) : null;
    const jurPec_M      = hasGridMeta ? agregaJurosPecMeta(gridMetaConsolidado) : null;
    const invFazPec_M   = hasGridMeta ? agregaInvFazendaPecMeta(gridMetaConsolidado) : null;
    const cusAgriSemJ_M = hasGridMeta ? agregaCusteioAgriSemJurosMeta(gridMetaConsolidado) : null;
    const jurAgri_M     = hasGridMeta ? agregaJurosAgriMeta(gridMetaConsolidado) : null;
    const invFazAgri_M  = hasGridMeta ? agregaInvFazendaAgriMeta(gridMetaConsolidado) : null;
    const invBov_M      = hasGridMeta ? agregaInvBovinosMeta(gridMetaConsolidado) : null;
    const amort_M       = hasGridMeta ? agregaAmortizacoesMeta(gridMetaConsolidado) : null;
    const div_M         = hasGridMeta ? agregaDividendosMeta(gridMetaConsolidado) : null;
    const recPecCx_M    = hasGridMeta ? agregaReceitaPecMeta(gridMetaConsolidado) : null;
    const recSilvi_M     = hasGridMeta ? agregaReceitaSilvicolaMeta(gridMetaConsolidado) : null;
    const cusSilviSemJ_M = hasGridMeta ? agregaCusteioSilviSemJurosMeta(gridMetaConsolidado) : null;
    const jurSilvi_M     = hasGridMeta ? agregaJurosSilviMeta(gridMetaConsolidado) : null;
    const invFazSilvi_M  = hasGridMeta ? agregaInvFazendaSilviMeta(gridMetaConsolidado) : null;
    const amortSilvi_M   = hasGridMeta ? agregaAmortizacaoSilviMeta(gridMetaConsolidado) : null;
    const recAgri_M     = hasGridMeta ? agregaReceitaAgriMeta(gridMetaConsolidado) : null;
    const recOutras_M   = hasGridMeta ? agregaOutrasReceitasMeta(gridMetaConsolidado) : null;
    const captacao_M    = hasGridMeta ? agregaEntradasFinanceirasMeta(gridMetaConsolidado) : null;
    const cfPec_M      = hasGridMeta ? agregaCustoFixoPecMeta(gridMetaConsolidado) : null;
    const cvPec_M      = hasGridMeta ? agregaCustoVariavelPecMeta(gridMetaConsolidado) : null;
    const cfAgri_M      = hasGridMeta ? agregaCustoFixoAgriMeta(gridMetaConsolidado) : null;
    const cfSilvi_M      = hasGridMeta ? agregaCustoFixoSilviMeta(gridMetaConsolidado) : null;
    const dedPec_M      = hasGridMeta ? agregaDeducoesPecMeta(gridMetaConsolidado) : null;
    const dedAgri_M      = hasGridMeta ? agregaDeducoesAgriMeta(gridMetaConsolidado) : null;
    const dedSilvi_M      = hasGridMeta ? agregaDeducoesSilviMeta(gridMetaConsolidado) : null;
    const aporte_M      = hasGridMeta ? agregaAportePessoalMeta(gridMetaConsolidado) : null;
    const retEmp_M      = hasGridMeta ? agregaRetornoEmprestimosMeta(gridMetaConsolidado) : null;
    const captPec_M     = hasGridMeta ? agregaCaptacaoPecMeta(gridMetaConsolidado) : null;
    const captAgri_M    = hasGridMeta ? agregaCaptacaoAgriMeta(gridMetaConsolidado) : null;
    const captSilvi_M   = hasGridMeta ? agregaCaptacaoSilviMeta(gridMetaConsolidado) : null;
    const captSemEsc_M  = hasGridMeta ? agregaCaptacaoSemEscopoMeta(gridMetaConsolidado) : null;
    const naoClassif_M  = hasGridMeta ? agregaEntradasNaoClassificadasMeta(gridMetaConsolidado) : null;
    const deducoes_M    = hasGridMeta ? agregaDeducoesSaidaMeta(gridMetaConsolidado) : null;
    const amortPec_M    = hasGridMeta ? agregaAmortizacaoPecMeta(gridMetaConsolidado) : null;
    const amortAgri_M   = hasGridMeta ? agregaAmortizacaoAgriMeta(gridMetaConsolidado) : null;
    const tributos_M    = hasGridMeta ? agregaTributosMeta(gridMetaConsolidado) : null;
    const cusPecComJ_M  = (cusPecSemJ_M && jurPec_M) ? addArr12(cusPecSemJ_M, jurPec_M) : null;
    const cusAgriComJ_M = (cusAgriSemJ_M && jurAgri_M) ? addArr12(cusAgriSemJ_M, jurAgri_M) : null;
    const cusSilviComJ_M = (cusSilviSemJ_M && jurSilvi_M) ? addArr12(cusSilviSemJ_M, jurSilvi_M) : null;
    const desembPec_M   = (cusPecComJ_M && invFazPec_M) ? addArr12(cusPecComJ_M, invFazPec_M) : null;
    const desembAgri_M  = (cusAgriComJ_M && invFazAgri_M) ? addArr12(cusAgriComJ_M, invFazAgri_M) : null;
    // Modelo Caixa puro — inclui Deduções de Receitas META.
    // Espelha agregaSaidasTotaisMeta oficial. Mantém gate hasGridMeta.
    const saidasTot_M = hasGridMeta ? agregaSaidasTotaisMeta(gridMetaConsolidado) : null;

    const isPer = viewMode === 'periodo';
    const mesPos = mes;
    const buildInd = (
      serie12: number[],
      label: string,
      titulo: string,
      subtitulo: string,
      serie12Meta: number[] | null = null,
    ): IndicadorFinanceiroShape => {
      const mesSerie13 = Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (serie12[i - 1] ?? NaN));
      const periodoSerie13 = cumSumTo13(serie12);
      const serieAno = isPer ? periodoSerie13 : mesSerie13;
      const valor = safe(serieAno[mesPos]);
      const deltaMes = (() => {
        if (mesPos <= 1) return null;
        const curr = safe(serieAno[mesPos]);
        const prev = safe(serieAno[mesPos - 1]);
        if (curr == null || prev == null || prev === 0) return null;
        return ((curr - prev) / prev) * 100;
      })();

      // Série META (mesmo formato 13 com NaN no [0]) e deltaMeta — só quando gridMeta foi fornecido
      let serieMeta: number[] | undefined = undefined;
      let deltaMeta: number | null = null;
      /* mesSerie13Meta e periodoSerie13Meta hoisted para fora do if: as duas ja
         eram calculadas e uma era descartada ao escolher por viewMode. O hoist
         nao criou calculo — parou de jogar fora o que estava pronto. Com isso o
         `series` atende os 31 indicadores do _finSoberano, nao so o custeioPec.
         `serieMeta` continua colapsada por `isPer` — quem precisa das duas
         leituras usa `series`. */
      let mesSerie13Meta: number[] | undefined = undefined;
      let periodoSerie13Meta: number[] | undefined = undefined;
      if (serie12Meta && serie12Meta.length === 12) {
        mesSerie13Meta = Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (serie12Meta[i - 1] ?? NaN));
        periodoSerie13Meta = cumSumTo13(serie12Meta);
        serieMeta = isPer ? periodoSerie13Meta : mesSerie13Meta;
        const meta = safe(serieMeta[mesPos]);
        if (valor != null && meta != null && meta !== 0) {
          deltaMeta = ((valor - meta) / meta) * 100;
        }
      }

      return {
        label, titulo, subtitulo,
        valor, deltaMes,
        deltaAno:  null,
        deltaMeta,
        serieAno,
        serieAnoAnt: undefined,
        serieMeta,
        /* As DUAS leituras, para os 31 indicadores do _finSoberano de uma vez.
           `anoAnt` fica ausente porque este builder nao produz ano anterior —
           e a ausencia local e legivel, que e a razao do formato aninhado. */
        series: {
          mes:     { ano: mesSerie13,     anoAnt: undefined, meta: mesSerie13Meta },
          periodo: { ano: periodoSerie13, anoAnt: undefined, meta: periodoSerie13Meta },
        },
      };
    };

    return {
      saidasTotais: buildInd(saidasTot, 'SAÍDAS TOTAIS', 'Saídas Totais',
        isPer ? 'Saída total de caixa acumulada Jan→mês (espelho do Dashboard Financeiro)'
              : 'Saída total de caixa no mês (espelho do Dashboard Financeiro)',
        saidasTot_M),
      jurosPec: buildInd(jurPec, 'JUROS PECUÁRIA', 'Juros Pecuária',
        isPer ? 'Juros pecuária acumulado Jan→mês (caixa)'
              : 'Juros pecuária no mês (caixa)',
        jurPec_M),
      custeioPecSemJuros: buildInd(cusPecSemJ, 'CUSTEIO PEC. SEM JUROS', 'Custeio Pec. sem Juros',
        isPer ? 'Custeio produção pecuária acumulado Jan→mês (caixa, sem juros)'
              : 'Custeio produção pecuária no mês (caixa, sem juros)',
        cusPecSemJ_M),
      custeioPecComJuros: buildInd(cusPecComJ, 'CUSTEIO PEC. COM JUROS', 'Custeio Pec. com Juros',
        isPer ? 'Custeio Produção Pecuária + Juros acumulado Jan→mês (caixa)'
              : 'Custeio Produção Pecuária + Juros no mês (caixa)',
        cusPecComJ_M),
      investPec: buildInd(invFazPec, 'INV. FAZENDA PECUÁRIA', 'Investimento na Fazenda Pecuária',
        isPer ? 'Investimento na Fazenda escopo Pecuária acumulado Jan→mês (caixa)'
              : 'Investimento na Fazenda escopo Pecuária no mês (caixa)',
        invFazPec_M),
      desembolsoPec: buildInd(desembPec, 'DESEMBOLSO PECUÁRIA', 'Desembolso Pecuária',
        isPer ? 'Custeio Pec. com Juros + Inv. Fazenda Pec. acumulado Jan→mês (caixa)'
              : 'Custeio Pec. com Juros + Inv. Fazenda Pec. no mês (caixa)',
        desembPec_M),
      custeioAgri: buildInd(cusAgriSemJ, 'CUSTEIO AGRICULTURA', 'Custeio Agricultura',
        isPer ? 'Custo Fixo + Custo Variável Agricultura acumulado Jan→mês (caixa)'
              : 'Custo Fixo + Custo Variável Agricultura no mês (caixa)',
        cusAgriSemJ_M),
      jurosAgri: buildInd(jurAgri, 'JUROS AGRICULTURA', 'Juros Agricultura',
        isPer ? 'Juros agricultura acumulado Jan→mês (caixa)'
              : 'Juros agricultura no mês (caixa)',
        jurAgri_M),
      custeioAgriComJuros: buildInd(cusAgriComJ, 'CUSTEIO AGRI. COM JUROS', 'Custeio Agri. com Juros',
        isPer ? 'Custeio Produção Agri + Juros acumulado Jan→mês (caixa)'
              : 'Custeio Produção Agri + Juros no mês (caixa)',
        cusAgriComJ_M),
      investAgri: buildInd(invFazAgri, 'INV. FAZENDA AGRI.', 'Investimento na Fazenda Agricultura',
        isPer ? 'Investimento na Fazenda escopo Agricultura acumulado Jan→mês (caixa)'
              : 'Investimento na Fazenda escopo Agricultura no mês (caixa)',
        invFazAgri_M),
      desembolsoAgri: buildInd(desembAgri, 'DESEMBOLSO AGRICULTURA', 'Desembolso Agricultura',
        isPer ? 'Custeio Agri com Juros + Inv. Fazenda Agri acumulado Jan→mês (caixa)'
              : 'Custeio Agri com Juros + Inv. Fazenda Agri no mês (caixa)',
        desembAgri_M),
      investBovinos: buildInd(invBov, 'INV. EM BOVINOS', 'Investimento em Bovinos',
        isPer ? 'Investimento em Bovinos (reposição) acumulado Jan→mês (caixa)'
              : 'Investimento em Bovinos (reposição) no mês (caixa)',
        invBov_M),
      amortizacoes: buildInd(amort, 'AMORTIZAÇÕES', 'Amortizações Financeiras',
        isPer ? 'Amortizações de financiamentos (principal) acumulado Jan→mês (caixa)'
              : 'Amortizações de financiamentos (principal) no mês (caixa)',
        amort_M),
      dividendos: buildInd(div, 'DIVIDENDOS / RETIRADAS', 'Dividendos / Retiradas',
        isPer ? 'Dividendos e retiradas acumulado Jan→mês (caixa)'
              : 'Dividendos e retiradas no mês (caixa)',
        div_M),

      // ─── PR-PC100-RECEITAS-01 ───
      receitaAgri: buildInd(recAgri, 'RECEITA AGRICULTURA', 'Receita Agricultura',
        isPer ? 'Receita operacional escopo Agricultura acumulada Jan→mês (caixa)'
              : 'Receita operacional escopo Agricultura no mês (caixa)',
        recAgri_M),
      receitaOutras: buildInd(recOutras, 'OUTRAS RECEITAS', 'Outras Receitas',
        isPer ? 'Receita operacional fora de Pecuária e Agricultura acumulada Jan→mês (caixa)'
              : 'Receita operacional fora de Pecuária e Agricultura no mês (caixa)',
        recOutras_M),
      receitaPecCaixa: buildInd(recPecCx,
        'RECEITA PECUÁRIA CAIXA', 'Receita Pecuária (caixa)',
        isPer ? 'Receita pecuária recebida, acumulada Jan→mês (caixa, por data de pagamento)'
              : 'Receita pecuária recebida no mês (caixa, por data de pagamento)',
        recPecCx_M),
      receitaSilvicola: buildInd(recSilvi,
        'RECEITA SILVÍCOLA', 'Receita Silvícola',
        isPer ? 'Receita silvícola recebida, acumulada Jan→mês (caixa)'
              : 'Receita silvícola recebida no mês (caixa)',
        recSilvi_M),
      custeioSilvi: buildInd(cusSilviComJ,
        'CUSTEIO SILVICULTURA', 'Custeio Silvicultura',
        isPer ? 'Custeio silvícola com juros, acumulado Jan→mês (caixa)'
              : 'Custeio silvícola com juros no mês (caixa)',
        cusSilviComJ_M),
      investSilvi: buildInd(invFazSilvi,
        'INVESTIMENTO SILVICULTURA', 'Investimento Silvicultura',
        isPer ? 'Investimento silvícola acumulado Jan→mês (caixa)'
              : 'Investimento silvícola no mês (caixa)',
        invFazSilvi_M),
      amortizacaoSilvi: buildInd(amortSilvi,
        'AMORTIZAÇÃO FINANC. SILVI.', 'Amortização Financiamento Silvicultura',
        isPer ? 'Amortização de financiamento silvícola acumulada Jan→mês (caixa)'
              : 'Amortização de financiamento silvícola no mês (caixa)',
        amortSilvi_M),
      captacao: buildInd(captacao, 'CAPTAÇÃO FINANCIAMENTO', 'Captação de Financiamento',
        isPer ? 'Entradas financeiras (captação) acumuladas Jan→mês (caixa)'
              : 'Entradas financeiras (captação) no mês (caixa)',
        captacao_M),
      custoFixoPec: buildInd(cfPec,
        'CUSTO FIXO PECUÁRIA', 'Custo Fixo Pecuária',
        isPer ? 'Custo fixo pecuário acumulado Jan→mês (caixa)'
              : 'Custo fixo pecuário no mês (caixa)',
        cfPec_M),
      custoVariavelPec: buildInd(cvPec,
        'CUSTO VARIÁVEL PECUÁRIA', 'Custo Variável Pecuária',
        isPer ? 'Custo variável pecuário acumulado Jan→mês (caixa)'
              : 'Custo variável pecuário no mês (caixa)',
        cvPec_M),
      custoFixoAgri: buildInd(cfAgri,
        'CUSTO FIXO AGRICULTURA', 'Custo Fixo Agricultura',
        isPer ? 'Custo fixo agrícola acumulado Jan→mês (caixa)'
              : 'Custo fixo agrícola no mês (caixa)',
        cfAgri_M),
      custoFixoSilvi: buildInd(cfSilvi,
        'CUSTO FIXO SILVICULTURA', 'Custo Fixo Silvicultura',
        isPer ? 'Custo fixo silvícola acumulado Jan→mês (caixa)'
              : 'Custo fixo silvícola no mês (caixa)',
        cfSilvi_M),
      deducoesPec: buildInd(dedPec,
        'DEDUÇÕES PECUÁRIA', 'Deduções Pecuária',
        isPer ? 'Deduções pecuárias acumulado Jan→mês (caixa)'
              : 'Deduções pecuárias no mês (caixa)',
        dedPec_M),
      deducoesAgri: buildInd(dedAgri,
        'DEDUÇÕES AGRICULTURA', 'Deduções Agricultura',
        isPer ? 'Deduções agrícolas acumulado Jan→mês (caixa)'
              : 'Deduções agrícolas no mês (caixa)',
        dedAgri_M),
      deducoesSilvi: buildInd(dedSilvi,
        'DEDUÇÕES SILVICULTURA', 'Deduções Silvicultura',
        isPer ? 'Deduções silvícolas acumulado Jan→mês (caixa)'
              : 'Deduções silvícolas no mês (caixa)',
        dedSilvi_M),
      aportePessoal: buildInd(aporte,
        'APORTE PESSOAL', 'Aporte Pessoal',
        isPer ? 'Aporte pessoal acumulado Jan→mês (caixa)'
              : 'Aporte pessoal no mês (caixa)',
        aporte_M),
      retornoEmprestimos: buildInd(retEmp,
        'RETORNO DE EMPRÉSTIMOS', 'Retorno de Empréstimos',
        isPer ? 'Retorno de empréstimos acumulado Jan→mês (caixa)'
              : 'Retorno de empréstimos no mês (caixa)',
        retEmp_M),
      jurosSilvi: buildInd(jurSilvi,
        'JUROS SILVICULTURA', 'Juros Silvicultura',
        isPer ? 'Juros silvícolas acumulado Jan→mês (caixa)'
              : 'Juros silvícolas no mês (caixa)',
        jurSilvi_M),
      captacaoPec: buildInd(captPec,
        'CAPTAÇÃO PECUÁRIA', 'Captação Pecuária',
        isPer ? 'Captação de financiamento pecuário acumulada Jan→mês (caixa)'
              : 'Captação de financiamento pecuário no mês (caixa)',
        captPec_M),
      captacaoAgri: buildInd(captAgri,
        'CAPTAÇÃO AGRICULTURA', 'Captação Agricultura',
        isPer ? 'Captação de financiamento agrícola acumulada Jan→mês (caixa)'
              : 'Captação de financiamento agrícola no mês (caixa)',
        captAgri_M),
      captacaoSilvi: buildInd(captSilvi,
        'CAPTAÇÃO SILVICULTURA', 'Captação Silvicultura',
        isPer ? 'Captação de financiamento silvícola acumulada Jan→mês (caixa)'
              : 'Captação de financiamento silvícola no mês (caixa)',
        captSilvi_M),
      captacaoSemEscopo: buildInd(captSemEsc,
        'APORTES E OUTRAS ENTRADAS', 'Aportes e Outras Entradas',
        isPer ? 'Aportes e demais entradas financeiras sem escopo, acumulados Jan→mês (caixa)'
              : 'Aportes e demais entradas financeiras sem escopo no mês (caixa)',
        captSemEsc_M),
      entradasNaoClassificadas: buildInd(naoClassif,
        'ENTRADAS NÃO CLASSIFICADAS', 'Entradas não classificadas',
        isPer ? 'Entradas sem grupo oficial, acumulado Jan→mês (caixa)'
              : 'Entradas sem grupo oficial no mês (caixa)',
        naoClassif_M),
      // O par detalhado. amortizacoes (acima) segue sendo o TOTAL, intocado.
      amortizacaoPec: buildInd(amortPec, 'AMORTIZAÇÃO PECUÁRIA', 'Amortização Financiamento Pecuária',
        isPer ? 'Amortização de financiamento pecuária acumulada Jan→mês (caixa)'
              : 'Amortização de financiamento pecuária no mês (caixa)',
        amortPec_M),
      amortizacaoAgri: buildInd(amortAgri, 'AMORTIZAÇÃO AGRICULTURA', 'Amortização Financiamento Agricultura',
        isPer ? 'Amortização de financiamento agricultura acumulada Jan→mês (caixa)'
              : 'Amortização de financiamento agricultura no mês (caixa)',
        amortAgri_M),
      /* MEDIDO: agregaDeducoesSaida usa isDeducaoReceitas e entrega SO deducoes —
         93.036 no NJ jan-jul/2026. "Tributos e Impostos" e grupo_custo separado
         (25.586) e nao tem agregador em agregadosFinanceiros.ts. 93.036 + 25.586 =
         118.622, que era o numero esperado para a linha. O rotulo diz o que o
         indicador CONTEM, e nao o que a linha do bloco gostaria de conter — ver
         relatorio do PR. */
      deducoesTributos: buildInd(deducoes, 'DEDUÇÕES DE RECEITAS', 'Deduções de Receitas',
        isPer ? 'Deduções de receitas acumuladas Jan→mês (caixa, lado saída)'
              : 'Deduções de receitas no mês (caixa, lado saída)',
        deducoes_M),
      tributos: buildInd(tributos, 'TRIBUTOS', 'Tributos e Impostos',
        isPer ? 'Tributos e impostos acumulados Jan→mês (caixa) — ITR, taxas, IRPF, IRPJ'
              : 'Tributos e impostos no mês (caixa) — ITR, taxas, IRPF, IRPJ',
        tributos_M),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancFin, ano, mes, viewMode, gridMetaConsolidado]);

  // ─── custeioPecIndicador legado memoizado (Opção D) ─────────────────
  // Estabiliza a referência do objeto retornado para evitar render loop em
  // consumidores que coloquem custeioPecIndicador em deps de useMemo (caso
  // de PainelConsultorTab → soberanoSerie). Fórmula idêntica ao código
  // anterior — apenas envolvida em useMemo com deps primitivas/estáveis.
  const _custeioPecIndicadorMemo = useMemo<IndicadorFinanceiroShape | null>(() => {
    if (!monthlyData) return null;

    const custeioPecMesSerie13 = Array.from({ length: 13 }, (_, i) =>
      i === 0 ? NaN : (monthlyData.custeioPec[i - 1] ?? NaN),
    );
    const custeioPecPeriodoSerie13 = cumSumTo13(monthlyData.custeioPec);
    const custeioPecSerie = isPeriodo ? custeioPecPeriodoSerie13 : custeioPecMesSerie13;
    const custeioPecValor = safe(custeioPecSerie[mesIdx]);
    const custeioPecDeltaMes = (() => {
      if (mesIdx <= 1) return null;
      const curr = safe(custeioPecSerie[mesIdx]);
      const prev = safe(custeioPecSerie[mesIdx - 1]);
      if (curr == null || prev == null || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    })();

    const anoAntPossui = custeioPecAnoAnt12.some(v => v > 0);
    const custeioPecMesAnoAntSerie13 = anoAntPossui
      ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custeioPecAnoAnt12[i - 1] ?? NaN))
      : null;
    const custeioPecPeriodoAnoAntSerie13 = anoAntPossui
      ? cumSumTo13(custeioPecAnoAnt12)
      : null;
    const custeioPecSerieAnoAnt = isPeriodo
      ? custeioPecPeriodoAnoAntSerie13
      : custeioPecMesAnoAntSerie13;
    const custeioPecDeltaAno = (() => {
      if (!custeioPecSerieAnoAnt) return null;
      const curr = safe(custeioPecSerie[mesIdx]);
      const ant  = safe(custeioPecSerieAnoAnt[mesIdx]);
      if (curr == null || ant == null || ant === 0) return null;
      return ((curr - ant) / ant) * 100;
    })();

    const metaPossui = custeioPecMeta12.some(v => v > 0);
    const custeioPecMesMetaSerie13 = metaPossui
      ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (custeioPecMeta12[i - 1] ?? NaN))
      : null;
    const custeioPecPeriodoMetaSerie13 = metaPossui
      ? cumSumTo13(custeioPecMeta12)
      : null;
    const custeioPecSerieMeta = isPeriodo
      ? custeioPecPeriodoMetaSerie13
      : custeioPecMesMetaSerie13;
    const custeioPecDeltaMeta = (() => {
      if (!custeioPecSerieMeta) return null;
      const curr = safe(custeioPecSerie[mesIdx]);
      const meta = safe(custeioPecSerieMeta[mesIdx]);
      if (curr == null || meta == null || meta === 0) return null;
      return ((curr - meta) / meta) * 100;
    })();

    return {
      label:     isPeriodo ? 'CUSTEIO PRODUÇÃO PECUÁRIA ACUM.' : 'CUSTEIO PRODUÇÃO PECUÁRIA NO MÊS',
      titulo:    isPeriodo ? 'Custeio Produção Pecuária acum.' : 'Custeio Produção Pecuária no mês',
      subtitulo: isPeriodo
        ? 'Custo Fixo + Custo Variável Pecuária acumulado Jan→mês (caixa)'
        : 'Custo Fixo + Custo Variável Pecuária no mês (caixa)',
      titulos:   { mes:     { titulo: 'Custeio Produção Pecuária no mês', subtitulo: 'Custo Fixo + Custo Variável Pecuária no mês (caixa)' },
                   periodo: { titulo: 'Custeio Produção Pecuária acum.', subtitulo: 'Custo Fixo + Custo Variável Pecuária acumulado Jan→mês (caixa)' } },
      valor:     custeioPecValor,
      deltaMes:  custeioPecDeltaMes,
      deltaAno:  custeioPecDeltaAno,
      deltaMeta: custeioPecDeltaMeta,
      serieAno:    custeioPecSerie,
      serieAnoAnt: custeioPecSerieAnoAnt ?? undefined,
      serieMeta:   custeioPecSerieMeta ?? undefined,
      /* As duas leituras, do proprio memo. A meta daqui pode ser substituida
         pela do soberano no wrapper abaixo — nos DOIS modos, nunca so num. */
      series: {
        mes: {
          ano:    custeioPecMesSerie13,
          anoAnt: custeioPecMesAnoAntSerie13 ?? undefined,
          meta:   custeioPecMesMetaSerie13 ?? undefined,
        },
        periodo: {
          ano:    custeioPecPeriodoSerie13,
          anoAnt: custeioPecPeriodoAnoAntSerie13 ?? undefined,
          meta:   custeioPecPeriodoMetaSerie13 ?? undefined,
        },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyData, isPeriodo, mesIdx, custeioPecAnoAnt12, custeioPecMeta12]);

  // Wrapper que prefere serieMeta soberana (calculada via gridMetaExterno em
  // _finSoberano.custeioPecSemJuros) e mantém todo o resto vindo do memo legado.
  // Quando _finSoberano.custeioPecSemJuros.serieMeta é undefined (sem gridMeta),
  // retorna o memo legado intacto — preservando comportamento Realizado.
  const _custeioPecIndicadorMerged = useMemo<IndicadorFinanceiroShape | null>(() => {
    if (!_custeioPecIndicadorMemo) return null;
    const sob = _finSoberano.custeioPecSemJuros;
    const sobMetaSerie = sob?.serieMeta;
    if (!sobMetaSerie) return _custeioPecIndicadorMemo;
    /* O merge do soberano vale para as duas leituras: substituir so o
       serieMeta de topo deixaria o `series` com a meta antiga, e os dois
       graficos discordariam do numero grande.
       `sob.serieMeta` sozinha nao serviria — ela e colapsada por viewMode
       dentro do buildInd. As duas variantes vem de `sob.series`, que passou
       a expo-las neste PR. Sem elas, mantem a meta do memo: melhor a antiga
       nos dois modos do que a mesma serie repetida nos dois. */
    const base = _custeioPecIndicadorMemo;
    return {
      ...base,
      serieMeta: sobMetaSerie,
      series: base.series && {
        mes:     { ...base.series.mes,     meta: sob?.series?.mes.meta     ?? base.series.mes.meta },
        periodo: { ...base.series.periodo, meta: sob?.series?.periodo.meta ?? base.series.periodo.meta },
      },
    };
  }, [_custeioPecIndicadorMemo, _finSoberano.custeioPecSemJuros]);

  // C5.1: derivações de áreas por cenário foram movidas para CIMA (após
  // useAreaPlanejamento, ~L398) para serem consumidas por monthlyData,
  // monthlyDataMeta, kgHaPorMes, kgHaPorMesMeta. Não duplicar aqui.

  // ─── DOMÍNIO REBANHO — Steps 2.2 + 2.3: composicao por Categoria/Fazenda
  // Snapshot do mês de referência. Independente de viewMode (composição
  // é estado pontual, não acumulado). null durante loading/incompleto.
  const fazendaNomesMap = useMemo(
    () => new Map((fazendasComPecuaria ?? []).map(f => [f.id, f.nome])),
    [fazendasComPecuaria],
  );
  const fazendasComPecuariaIds = useMemo(
    () => new Set((fazendasComPecuaria ?? []).map(f => f.id)),
    [fazendasComPecuaria],
  );
  // Step 2.5: movimentações por tipo e natureza.
  // lancPec já vem com cancelado=false e cenario='realizado' aplicados
  // pelo useLancamentos upstream. Aqui aplicamos só o recorte temporal
  // (viewMode mes/periodo).
  // Cross-validation: movimentacoes.porNatureza[op].cabecas
  // === desfruteIndicador.valor (modo 'mes').
  const rebanho: PC100_Rebanho = {
    composicaoCategoria: getCategoriasDetalhe
      ? montarComposicaoCategoria(getCategoriasDetalhe(mes))
      : null,
    composicaoFazenda: montarComposicaoFazenda(
      viewDataRealizado,
      mes,
      fazendaNomesMap,
      fazendasComPecuariaIds,
    ),
    movimentacoes: montarMovimentacoes({
      lancPec,
      ano,
      mes,
      viewMode,
    }),
  };

  // ─── DOMÍNIO FINANCEIRO — Step 2.4: centrosCusto ───────────────
  // Consome o MESMO lancFin que agregaCusteioPecSemJuros usa.
  // Aplica viewMode internamente (mes/periodo).
  // Cross-validation: totalRealizado === custeioPecIndicador.valor.
  const financeiro: PC100_Financeiro = {
    centrosCusto: montarCentrosCusto({
      lancFin,
      ano,
      mes,
      viewMode,
    }),
  };

  // ─── Etapa 2D: caixaIndicador (estoque, escopo CLIENTE) ─────────
  // Saldo bancário consolidado do cliente. serieAno e valor são
  // IDÊNTICOS em viewMode='mes' e 'periodo' (regra estoque). Mesmo
  // valor é retornado em baseReturn e incompletoOverride — caixa
  // independe de P1 das fazendas.
  const caixaIndicadorResolved = montarCaixaIndicador({
    serieAno:    caixaSerieAno,
    serieAnoAnt: caixaSerieAnoAnt,
    mes,
    isPeriodo:   viewMode === 'periodo',
  });

  // ─── Step 2.1*: Runway (executivo) ─────────────────────────────
  // Consome caixaIndicador.serieAno (estoque, mes-agnostic) e a série
  // mensal de saídas totais. saidasTotaisIndicador.serieAno depende
  // de viewMode (acumulada em 'periodo'). Para runway precisamos da
  // série MENSAL não-acumulada: quando viewMode='periodo', invertemos
  // o cumSum para recuperar a série mensal correta.
  const _saidasMesSerieParaRunway: number[] | null = (() => {
    const ind = _finSoberano?.saidasTotais;
    if (!ind || !Array.isArray(ind.serieAno) || ind.serieAno.length !== 13) {
      return null;
    }
    if (viewMode !== 'periodo') return ind.serieAno;
    // viewMode='periodo': inverter cumSum (serieAno está acumulada)
    const out: number[] = new Array(13).fill(NaN);
    for (let m = 1; m <= 12; m++) {
      const curr = ind.serieAno[m];
      const prev = m === 1 ? 0 : ind.serieAno[m - 1];
      if (Number.isFinite(curr)) {
        out[m] = Number.isFinite(prev) ? curr - prev : curr;
      }
    }
    return out;
  })();

  const _runwayResolved = (caixaIndicadorResolved && _saidasMesSerieParaRunway)
    ? calcularRunway({
        caixaSerie:  caixaIndicadorResolved.serieAno,
        saidasSerie: _saidasMesSerieParaRunway,
        mes,
      })
    : null;
  const executivo: PC100_Executivo = { runway: _runwayResolved };

  const baseReturn: PainelConsultorDataResult = {
    cabecas: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.cabFin, idx))
      : safe(monthlyData.cabFin[idx]),

    pesoMedio: isPeriodo
      ? (() => {
          const totalPeso = sumArr(sliceUpTo(monthlyData.pesoTotalFin, idx));
          const totalCab  = sumArr(sliceUpTo(monthlyData.cabFin, idx));
          return totalCab > 0 ? totalPeso / totalCab : null;
        })()
      : safe(monthlyData.pesoMedioFin[idx]),

    // GMD: série oficial (mês = monthlyData.gmd; período = computePeriodGmd PC-100)
    gmd: gmdValor,

    // @ produzidas: série oficial (mês = valor do mês; período = acumulado Jan→m)
    arrobas: arrobasValor,

    // Desfrute (cab.): série oficial (mês = valor do mês; período = acumulado Jan→m)
    desfrute: desfruteValor,

    receita: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.recPecComp, idx))
      : safe(monthlyData.recPecComp[idx]),

    desembolso: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.custOper, idx))
      : safe(monthlyData.custOper[idx]),

    resultado: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.resOper, idx))
      : safe(monthlyData.resOper[idx]),

    // Valor Rebanho e areaProdutivaMes: posição do mês selecionado — não soma, não média
    valorRebanhoMes: safe(monthlyData.valorRebFin[idx]),
    areaProdutivaMes: safe(areaMensal[idx]),

    // C4 — Área META oficial (estoque mensal; não acumula em viewMode='periodo').
    areaPecuariaMetaMes:    areaPecuariaMetaPorMes[areaMetaIdx]    ?? null,
    areaAgriculturaMetaMes: areaAgriculturaMetaPorMes[areaMetaIdx] ?? null,
    areaTotalMetaMes:       areaTotalMetaPorMes[areaMetaIdx]       ?? null,
    areaPecuariaMetaPorMes,
    areaAgriculturaMetaPorMes,
    areaTotalMetaPorMes,

    // C4.2 — Área REALIZADA via snapshots oficiais (estoque mensal; não acumula).
    areaPecuariaRealMes:    areaPecuariaRealPorMes[areaRealIdx]    ?? null,
    areaAgriculturaRealMes: areaAgriculturaRealPorMes[areaRealIdx] ?? null,
    areaProdutivaRealMes:   areaProdutivaRealPorMes[areaRealIdx]   ?? null,
    areaPecuariaRealPorMes,
    areaDestinoRealPorMes,
    areaAgriculturaRealPorMes,
    areaProdutivaRealPorMes,
    areaTotalRealPorMes,
    areaSilviculturaRealPorMes,
    areaReservaRealPorMes,
    areaAppRealPorMes,
    areaBenfeitoriasRealPorMes,
    areaOutrasRealPorMes,
    areaPorFazendaMes,
    snapshotsFazenda,

    // UA/ha: série oficial (mês = monthlyData.lotUaHa; período = razão de agregados)
    lotUaHa: uaHaValor,

    /* Era `meanArr` das razoes mensais — uma TERCEIRA agregacao, e errada
       pelo mesmo motivo da soma. Passa a usar `calcularArrHaAcumulado`.
       Zero consumidores externos hoje, entao a troca nao move tela
       nenhuma; alinha o campo antes que alguem o leia. */
    arrHa: isPeriodo
      ? safe(arrobasHaAcum12[idx])
      : safe(monthlyData.arrHa[idx]),

    kgHa: kgHaValor,
    statusArea,
    faltandoCount,
    statusPilares: statusPilares ?? null,
    dadosCompletos,
    seriesMensais: monthlyData ? {
      cabFin:       monthlyData.cabFin,
      cabMediaAcumulada,
      pesoMedioFin: monthlyData.pesoMedioFin,
      arrobasProd:  monthlyData.arrobasProd,
      gmd:          monthlyData.gmd,
      desfruteCab:  monthlyData.desfruteCab,
      valorRebFin:  monthlyData.valorRebFin,
    } : null,
    seriesMeta: monthlyDataMeta ? {
      cabFin:       monthlyDataMeta.cabFin,
      pesoMedioFin: monthlyDataMeta.pesoMedioFin,
      arrobasProd:  monthlyDataMeta.arrobasProd,
      gmd:          monthlyDataMeta.gmd,
    } : null,
    cabecasFinFotoAnoAnt: cabFotoIniAnoAnt,
    pesoMedioFinFotoAnoAnt: pesoMedioFotoIniAnoAnt,
    pesoMedioFinMetaSnap: Number.isFinite(pesoMedioFinMetaSnap12[11])
      ? pesoMedioFinMetaSnap12[11]
      : null,
    cabecasIndicador: monthlyData ? {
      label:     isPeriodo ? 'REBANHO MÉDIO' : 'CABEÇAS',
      titulo:    isPeriodo ? 'Rebanho Médio no período' : 'Rebanho Final do mês',
      subtitulo: isPeriodo
        ? 'Quantidade média de cabeças no período selecionado'
        : 'Quantidade de cabeças no final do mês',
      titulos:   { mes:     { titulo: 'Rebanho Final do mês', subtitulo: 'Quantidade de cabeças no final do mês' },
                   periodo: { titulo: 'Rebanho Médio no período', subtitulo: 'Quantidade média de cabeças no período selecionado' } },
      valor:     cabValor,
      deltaMes:  cabDeltaMes,
      deltaAno:  cabDeltaAno,
      deltaMeta: cabDeltaMeta,
      serieAno:  cabSerie,
      serieAnoAnt: cabSerieAnoAnt ?? undefined,
      serieMetaIndicador: cabSerieMeta ?? undefined,
      /* As DUAS leituras. Nada calculado aqui: as seis series ja existem no
         corpo do hook, e sao as MESMAS que os colapsos de :1747, :1792 e
         :1824 escolhem por viewMode. `?? undefined` porque as quatro de
         anoAnt/meta sao `number[] | null` e SeriesPorModo nao aceita null. */
      series: {
        mes: {
          /* So o realizado recebe a posicao 0. Para o ano anterior o inicial
             seria Dez/ano-2, que nao existe; a meta nao tem foto inicial. */
          ano:    comInicial(cabFinSerie13, cabFotoIniAnoAnt),
          anoAnt: cabFinAnoAntSerie  ?? undefined,
          meta:   cabFinMetaSerie13  ?? undefined,
        },
        periodo: {
          ano:    comInicial(cabMediaAcumulada, cabFotoIniAnoAnt),
          anoAnt: cabMediaAcumAnoAnt ?? undefined,
          meta:   cabMediaAcumMeta   ?? undefined,
        },
      },
    } : null,
    pesoMedioIndicador: monthlyData ? {
      label:     isPeriodo ? 'PESO MÉDIO PERÍODO' : 'PESO MÉDIO FINAL',
      titulo:    isPeriodo ? 'Peso Médio Período' : 'Peso Médio Final',
      subtitulo: isPeriodo
        ? 'Peso médio do rebanho na média do período'
        : 'Peso médio do rebanho no final do mês',
      titulos:   { mes:     { titulo: 'Peso Médio Final', subtitulo: 'Peso médio do rebanho no final do mês' },
                   periodo: { titulo: 'Peso Médio Período', subtitulo: 'Peso médio do rebanho na média do período' } },
      valor:     safe(pesoSerie[mesIdx]),
      deltaMes:  pesoDeltaMes,
      deltaAno:  pesoDeltaAno,
      deltaMeta: pesoDeltaMeta,
      serieAno:    pesoSerie,
      serieAnoAnt: pesoSerieAnoAnt ?? undefined,
      serieMeta:   pesoMetaSerie ?? undefined,
      series: {
        /* So o realizado recebe a posicao 0. Para o ano anterior o inicial
           seria Dez/ano-2, que nao existe; a meta nao tem foto inicial. */
        mes:     { ano: comInicial(pesoMedioFinSerie13, pesoMedioFotoIniAnoAnt), anoAnt: pesoMedioFinAnoAnt13, meta: pesoMedioMetaSerie13 },
        periodo: { ano: comInicial(pesoMedioPeriodoSerie13, pesoMedioFotoIniAnoAnt), anoAnt: pesoMedioPeriodoAnoAnt13, meta: pesoMedioPeriodoMetaSerie13 },
      },
    } : null,
    gmdIndicador: monthlyData ? {
      label:     isPeriodo ? 'GMD MÉDIO NO PERÍODO' : 'GMD NO MÊS',
      titulo:    isPeriodo ? 'GMD no Período' : 'GMD no mês',
      subtitulo: isPeriodo
        ? 'Ganho médio diário no período'
        : 'Ganho médio diário no mês',
      titulos:   { mes:     { titulo: 'GMD no mês', subtitulo: 'Ganho médio diário no mês' },
                   periodo: { titulo: 'GMD no Período', subtitulo: 'Ganho médio diário no período' } },
      valor:     gmdValor,
      deltaMes:  gmdDeltaMes,
      deltaAno:  gmdDeltaAno,
      deltaMeta: gmdDeltaMeta,
      serieAno:    gmdSerie,
      serieAnoAnt: gmdSerieAnoAnt ?? undefined,
      serieMeta:   gmdSerieMeta ?? undefined,
      series: {
        mes:     { ano: gmdMesSerie13, anoAnt: gmdMesAnoAntSerie13, meta: gmdMesMetaSerie13 },
        periodo: { ano: gmdPeriodoSerie13, anoAnt: gmdPeriodoAnoAntSerie13, meta: gmdPeriodoMetaSerie13 },
      },
    } : null,
    uaHaIndicador: monthlyData ? {
      label:     isPeriodo ? 'UA/HA MÉDIA NO PERÍODO' : 'UA/HA NO MÊS',
      titulo:    isPeriodo ? 'UA/ha no período' : 'UA/ha no mês',
      subtitulo: isPeriodo
        ? 'Taxa de lotação média no período'
        : 'Taxa de lotação no mês',
      titulos:   { mes:     { titulo: 'UA/ha no mês', subtitulo: 'Taxa de lotação no mês' },
                   periodo: { titulo: 'UA/ha no período', subtitulo: 'Taxa de lotação média no período' } },
      valor:     uaHaValor,
      deltaMes:  uaHaDeltaMes,
      deltaAno:  uaHaDeltaAno,
      deltaMeta: uaHaDeltaMeta,
      serieAno:    uaHaSerie,
      serieAnoAnt: uaHaSerieAnoAnt ?? undefined,
      serieMeta:   uaHaSerieMeta ?? undefined,
      series: {
        mes:     { ano: uaHaMesSerie13, anoAnt: uaHaMesAnoAntSerie13, meta: uaHaMesMetaSerie13 },
        periodo: { ano: uaHaPeriodoSerie13, anoAnt: uaHaPeriodoAnoAntSerie13, meta: uaHaPeriodoMetaSerie13 },
      },
    } : null,
    kgHaIndicador: monthlyData ? {
      label:     isPeriodo ? 'KG VIVO/HA MÉDIO NO PERÍODO' : 'KG VIVO/HA NO MÊS',
      titulo:    isPeriodo ? 'kg vivo/ha no período' : 'kg vivo/ha no mês',
      subtitulo: isPeriodo
        ? 'Peso vivo médio do rebanho por hectare no período'
        : 'Peso vivo do rebanho por hectare no final do mês',
      titulos:   { mes:     { titulo: 'kg vivo/ha no mês', subtitulo: 'Peso vivo do rebanho por hectare no final do mês' },
                   periodo: { titulo: 'kg vivo/ha no período', subtitulo: 'Peso vivo médio do rebanho por hectare no período' } },
      valor:     kgHaValor,
      deltaMes:  kgHaDeltaMes,
      deltaAno:  kgHaDeltaAno,
      deltaMeta: kgHaDeltaMeta,
      serieAno:    kgHaSerie,
      serieAnoAnt: kgHaSerieAnoAnt ?? undefined,
      serieMeta:   kgHaSerieMeta ?? undefined,
      series: {
        mes:     { ano: kgHaMesSerie13, anoAnt: kgHaMesAnoAntSerie13, meta: kgHaMesMetaSerie13 },
        periodo: { ano: kgHaPeriodoSerie13, anoAnt: kgHaPeriodoAnoAntSerie13, meta: kgHaPeriodoMetaSerie13 },
      },
    } : null,
    arrobasIndicador: monthlyData ? {
      label:     isPeriodo ? '@ PRODUZIDAS NO PERÍODO' : '@ PRODUZIDAS NO MÊS',
      titulo:    isPeriodo ? '@ produzidas no período' : '@ produzidas no mês',
      subtitulo: isPeriodo
        ? 'Arrobas produzidas acumuladas no período'
        : 'Arrobas produzidas no mês',
      titulos:   { mes:     { titulo: '@ produzidas no mês', subtitulo: 'Arrobas produzidas no mês' },
                   periodo: { titulo: '@ produzidas no período', subtitulo: 'Arrobas produzidas acumuladas no período' } },
      valor:     arrobasValor,
      deltaMes:  arrobasDeltaMes,
      deltaAno:  arrobasDeltaAno,
      deltaMeta: arrobasDeltaMeta,
      serieAno:    arrobasSerie,
      serieAnoAnt: arrobasSerieAnoAnt ?? undefined,
      serieMeta:   arrobasSerieMeta ?? undefined,
      series: {
        mes:     { ano: arrobasMesSerie13, anoAnt: arrobasMesAnoAntSerie13, meta: arrobasMesMetaSerie13 },
        periodo: { ano: arrobasPeriodoSerie13, anoAnt: arrobasPeriodoAnoAntSerie13, meta: arrobasPeriodoMetaSerie13 },
      },
    } : null,
    desfruteIndicador: monthlyData ? {
      label:     isPeriodo ? 'DESFRUTE (CAB.) NO PERÍODO' : 'DESFRUTE (CAB.) NO MÊS',
      titulo:    isPeriodo ? 'Desfrute no período' : 'Desfrute no mês',
      subtitulo: isPeriodo
        ? 'Animais abatidos, vendidos em pé e consumidos no período'
        : 'Animais abatidos, vendidos em pé e consumidos no mês',
      titulos:   { mes:     { titulo: 'Desfrute no mês', subtitulo: 'Animais abatidos, vendidos em pé e consumidos no mês' },
                   periodo: { titulo: 'Desfrute no período', subtitulo: 'Animais abatidos, vendidos em pé e consumidos no período' } },
      valor:     desfruteValor,
      deltaMes:  desfruteDeltaMes,
      deltaAno:  desfruteDeltaAno,
      deltaMeta: desfruteDeltaMeta,
      serieAno:    desfruteSerie,
      serieAnoAnt: desfruteSerieAnoAnt ?? undefined,
      serieMeta:   desfruteSerieMeta ?? undefined,
      series: {
        mes:     { ano: desfruteMesSerie13, anoAnt: desfruteMesAnoAntSerie13, meta: desfruteMesMetaSerie13 },
        periodo: { ano: desfrutePeriodoSerie13, anoAnt: desfrutePeriodoAnoAntSerie13, meta: desfrutePeriodoMetaSerie13 },
      },
    } : null,
    desfrutePctArrIndicador: monthlyData ? {
      label:     isPeriodo ? 'DESFRUTE (@) NO PERÍODO' : 'DESFRUTE (@) NO MÊS',
      titulo:    isPeriodo ? 'Desfrute (@) no período' : 'Desfrute (@) no mês',
      subtitulo: isPeriodo
        ? '@ desfrutadas ÷ @ iniciais no período (razão de somas)'
        : '@ desfrutadas ÷ @ iniciais no mês',
      valor:     desfrutePctArrValor,
      deltaMes:  desfrutePctArrDeltaMes,
      deltaAno:  desfrutePctArrDeltaAno,
      deltaMeta: desfrutePctArrDeltaMeta,
      serieAno:    desfrutePctArrSerie,
      serieAnoAnt: desfrutePctArrSerieAnoAnt ?? undefined,
      serieMeta:   desfrutePctArrSerieMeta ?? undefined,
    } : null,
    desfruteArrIndicador: monthlyData ? {
      label:     isPeriodo ? 'DESFRUTE (@) NO PERÍODO' : 'DESFRUTE (@) NO MÊS',
      titulo:    isPeriodo ? 'Desfrute (@) no período' : 'Desfrute (@) no mês',
      subtitulo: isPeriodo
        ? 'Arrobas desfrutadas (abate + venda + consumo) no período'
        : 'Arrobas desfrutadas (abate + venda + consumo) no mês',
      valor:     desfruteArrValor,
      deltaMes:  desfruteArrDeltaMes,
      deltaAno:  desfruteArrDeltaAno,
      deltaMeta: desfruteArrDeltaMeta,
      serieAno:    desfruteArrSerie,
      serieAnoAnt: desfruteArrSerieAnoAnt ?? undefined,
      serieMeta:   desfruteArrSerieMeta ?? undefined,
    } : null,
    valorRebanhoIndicador: monthlyData ? {
      label:     isPeriodo ? 'VALOR DO REBANHO NO PERÍODO' : 'VALOR DO REBANHO NO MÊS',
      titulo:    isPeriodo ? 'Valor do Rebanho no período' : 'Valor do Rebanho no mês',
      subtitulo: 'Valor patrimonial do rebanho no final do mês selecionado',
      titulos:   { mes:     { titulo: 'Valor do Rebanho no mês', subtitulo: 'Valor patrimonial do rebanho no final do mês selecionado' },
                   periodo: { titulo: 'Valor do Rebanho no período', subtitulo: 'Valor patrimonial do rebanho no final do mês selecionado' } },
      valor:     valorRebanhoValor,
      deltaMes:  valorRebanhoDeltaMes,
      deltaAno:  valorRebanhoDeltaAno,
      deltaMeta: valorRebanhoDeltaMeta,
      serieAno:    valorRebanhoSerie,
      serieAnoAnt: valorRebanhoSerieAnoAnt ?? undefined,
      serieMeta:   valorRebanhoSerieMeta ?? undefined,
      series: {
        mes:     { ano: valorRebanhoMes, anoAnt: valorRebanhoSerieAnoAnt, meta: valorRebanhoSerieMeta },
        periodo: { ano: valorRebanhoMes, anoAnt: valorRebanhoSerieAnoAnt, meta: valorRebanhoSerieMeta },
      },
    } : null,
    /* Irmao, NAO substituto: `valorRebanhoIndicador` fica com o nome e a
       forma que os consumidores ja usam. O agrupamento "Com efeito / Sem
       efeito" e de APRESENTACAO e vem depois, na UI.
       `series.mes` e `series.periodo` recebem a MESMA serie: valor de
       estoque nao acumula — mesma regra do irmao (:3888-3889). */
    arrobasEstoqueIndicador: monthlyData ? {
      label:     'ARROBAS EM ESTOQUE',
      titulo:    'Arrobas em estoque',
      subtitulo: 'Peso vivo do rebanho no final do mês, em arrobas',
      titulos:   { mes:     { titulo: 'Arrobas em estoque', subtitulo: 'Peso vivo do rebanho no final do mês, em arrobas' },
                   periodo: { titulo: 'Arrobas em estoque', subtitulo: 'Peso vivo do rebanho no final do mês, em arrobas' } },
      valor:     arrobasEstoqueValor,
      deltaMes:  arrobasEstoqueDeltaMes,
      deltaAno:  arrobasEstoqueDeltaAno,
      deltaMeta: arrobasEstoqueDeltaMeta,
      serieAno:    arrobasEstoqueSerie,
      serieAnoAnt: arrobasEstoqueSerieAnoAnt ?? undefined,
      serieMeta:   arrobasEstoqueSerieMeta ?? undefined,
      series: {
        mes:     { ano: arrobasEstoqueSerie, anoAnt: arrobasEstoqueSerieAnoAnt ?? undefined, meta: arrobasEstoqueSerieMeta ?? undefined },
        periodo: { ano: arrobasEstoqueSerie, anoAnt: arrobasEstoqueSerieAnoAnt ?? undefined, meta: arrobasEstoqueSerieMeta ?? undefined },
      },
    } : null,
    arrobasHaIndicador: monthlyData ? {
      label:     isPeriodo ? 'ARROBAS/HA NO PERÍODO' : 'ARROBAS/HA NO MÊS',
      titulo:    'Arrobas produzidas por hectare',
      subtitulo: 'Produção de pecuária por hectare de área pecuária',
      titulos:   { mes:     { titulo: 'Arrobas produzidas por hectare', subtitulo: 'Produção de pecuária por hectare de área pecuária' },
                   periodo: { titulo: 'Arrobas produzidas por hectare', subtitulo: 'Produção acumulada ÷ área pecuária média do período' } },
      valor:     arrobasHaValor,
      deltaMes:  arrobasHaDeltaMes,
      deltaAno:  arrobasHaDeltaAno,
      deltaMeta: arrobasHaDeltaMeta,
      serieAno:    arrobasHaSerie,
      serieAnoAnt: arrobasHaSerieAnoAnt ?? undefined,
      serieMeta:   arrobasHaMetaSerie13 ?? undefined,
      series: {
        mes:     { ano: arrobasHaMesSerie13,     anoAnt: arrobasHaMesAnoAntSerie13 ?? undefined,     meta: monthlyDataMeta ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : ((monthlyDataMeta.arrHa ?? [])[i - 1] ?? NaN)) : undefined },
        periodo: { ano: arrobasHaPeriodoSerie13, anoAnt: arrobasHaPeriodoAnoAntSerie13 ?? undefined, meta: monthlyDataMeta ? Array.from({ length: 13 }, (_, i) => i === 0 ? NaN : (calcularArrHaAcumulado(monthlyDataMeta.arrobasProd ?? [], areaPecuariaMetaNumPorMes)[i - 1] ?? NaN)) : undefined },
      },
    } : null,
    areaProdutivaPecIndicador: monthlyData ? {
      label:     isPeriodo ? 'ÁREA PRODUTIVA PECUÁRIA MÉDIA' : 'ÁREA PRODUTIVA PECUÁRIA',
      titulo:    'Área Produtiva Pecuária',
      subtitulo: 'Hectares de pecuária',
      titulos:   { mes:     { titulo: 'Área Produtiva Pecuária', subtitulo: 'Hectares de pecuária' },
                   periodo: { titulo: 'Área Produtiva Pecuária', subtitulo: 'Hectares de pecuária — média do período' } },
      valor:     areaPecValor,
      deltaMes:  areaPecDeltaMes,
      deltaAno:  areaPecDeltaAno,
      deltaMeta: areaPecDeltaMeta,
      serieAno:    areaPecSerie,
      serieAnoAnt: (isPeriodo ? areaPecPeriodoAnoAntSerie13 : areaPecMesAnoAntSerie13),
      serieMeta:   (isPeriodo ? areaPecPeriodoMetaSerie13 : areaPecMesMetaSerie13),
      series: {
        mes:     { ano: areaPecMesSerie13,     anoAnt: areaPecMesAnoAntSerie13,     meta: areaPecMesMetaSerie13 },
        periodo: { ano: areaPecPeriodoSerie13, anoAnt: areaPecPeriodoAnoAntSerie13, meta: areaPecPeriodoMetaSerie13 },
      },
    } : null,
    precoArrEstoqueIndicador: monthlyData ? {
      label:     'R$/@ EM ESTOQUE',
      titulo:    'Valor da arroba do estoque',
      subtitulo: 'Valor do rebanho ÷ arrobas em estoque',
      titulos:   { mes:     { titulo: 'Valor da arroba do estoque', subtitulo: 'Valor do rebanho ÷ arrobas em estoque' },
                   periodo: { titulo: 'Valor da arroba do estoque', subtitulo: 'Valor do rebanho ÷ arrobas em estoque' } },
      valor:     precoArrEstoqueValor,
      deltaMes:  precoArrEstoqueDeltaMes,
      deltaAno:  precoArrEstoqueDeltaAno,
      deltaMeta: null,
      serieAno:    precoArrEstoqueSerie,
      serieAnoAnt: precoArrEstoqueSerieAnoAnt ?? undefined,
      serieMeta:   undefined,
      series: {
        mes:     { ano: precoArrEstoqueSerie, anoAnt: precoArrEstoqueSerieAnoAnt ?? undefined },
        periodo: { ano: precoArrEstoqueSerie, anoAnt: precoArrEstoqueSerieAnoAnt ?? undefined },
      },
    } : null,
    valorRebanhoSemEfeitoIndicador: monthlyData && valorSemEfeitoSerie ? {
      label:     isPeriodo ? 'VALOR DO REBANHO S/ EFEITO NO PERÍODO' : 'VALOR DO REBANHO S/ EFEITO NO MÊS',
      titulo:    'Valor do Rebanho sem efeito de mercado',
      subtitulo: 'Ao preço de dezembro do ano anterior',
      titulos:   { mes:     { titulo: 'Valor do Rebanho sem efeito de mercado', subtitulo: 'Ao preço de dezembro do ano anterior' },
                   periodo: { titulo: 'Valor do Rebanho sem efeito de mercado', subtitulo: 'Ao preço de dezembro do ano anterior' } },
      valor:     valorSemEfeitoValor,
      deltaMes:  valorSemEfeitoDeltaMes,
      deltaAno:  valorSemEfeitoDeltaAno,
      deltaMeta: valorSemEfeitoDeltaMeta,
      serieAno:    valorSemEfeitoSerie,
      serieAnoAnt: valorSemEfeitoSerieAnoAnt ?? undefined,
      serieMeta:   valorSemEfeitoSerieMeta ?? undefined,
      series: {
        mes:     { ano: valorSemEfeitoSerie, anoAnt: valorSemEfeitoSerieAnoAnt ?? undefined, meta: valorSemEfeitoSerieMeta ?? undefined },
        periodo: { ano: valorSemEfeitoSerie, anoAnt: valorSemEfeitoSerieAnoAnt ?? undefined, meta: valorSemEfeitoSerieMeta ?? undefined },
      },
    } : null,
    receitaPecIndicador: monthlyData ? {
      label:     isPeriodo ? 'RECEITAS PECUÁRIAS COMPETÊNCIA ACUM.' : 'RECEITAS PECUÁRIAS COMPETÊNCIA NO MÊS',
      titulo:    isPeriodo ? 'Receitas Pecuárias Competência acum.' : 'Receitas Pecuárias Competência no mês',
      subtitulo: isPeriodo
        ? 'Receita pecuária acumulada Jan→mês (competência)'
        : 'Receita pecuária do mês (competência)',
      titulos:   { mes:     { titulo: 'Receitas Pecuárias Competência no mês', subtitulo: 'Receita pecuária do mês (competência)' },
                   periodo: { titulo: 'Receitas Pecuárias Competência acum.', subtitulo: 'Receita pecuária acumulada Jan→mês (competência)' } },
      valor:     receitaPecValor,
      deltaMes:  receitaPecDeltaMes,
      deltaAno:  receitaPecDeltaAno,
      deltaMeta: receitaPecDeltaMeta,
      serieAno:    receitaPecSerie,
      serieAnoAnt: receitaPecSerieAnoAnt ?? undefined,
      serieMeta:   receitaPecSerieMeta ?? undefined,
      series: {
        mes:     { ano: receitaPecMesSerie13, anoAnt: receitaPecMesAnoAntSerie13, meta: receitaPecMesMetaSerie13 },
        periodo: { ano: receitaPecPeriodoSerie13, anoAnt: receitaPecPeriodoAnoAntSerie13, meta: receitaPecPeriodoMetaSerie13 },
      },
    } : null,
    custeioPecIndicador: _custeioPecIndicadorMerged,
    custoArrIndicador: monthlyData ? {
      label:     'CUSTO PRODUTIVO R$/@',
      titulo:    'Custo Produtivo R$/@',
      subtitulo: isPeriodo
        ? 'Custo produtivo pecuário por @ produzida (acumulado Jan→mês)'
        : 'Custo produtivo pecuário por @ produzida no mês',
      titulos:   { mes:     { titulo: 'Custo Produtivo R$/@', subtitulo: 'Custo produtivo pecuário por @ produzida no mês' },
                   periodo: { titulo: 'Custo Produtivo R$/@', subtitulo: 'Custo produtivo pecuário por @ produzida (acumulado Jan→mês)' } },
      valor:     custoArrValor,
      deltaMes:  custoArrDeltaMes,
      deltaAno:  custoArrDeltaAno,
      deltaMeta: custoArrDeltaMeta,
      serieAno:    custoArrSerie,
      serieAnoAnt: custoArrSerieAnoAnt ?? undefined,
      serieMeta:   custoArrSerieMeta ?? undefined,
      series: {
        mes:     { ano: custoArrMesSerie13, anoAnt: custoArrMesAnoAntSerie13, meta: custoArrMesMetaSerie13 },
        periodo: { ano: custoArrPeriodoSerie13, anoAnt: custoArrPeriodoAnoAntSerie13, meta: custoArrPeriodoMetaSerie13 },
      },
      serieMensal: custoArrMesSerie13,
    } : null,
    precoArrIndicador: monthlyData ? {
      label:     'PREÇO DE VENDA R$/@',
      titulo:    'Preço de Venda R$/@',
      subtitulo: isPeriodo
        ? 'Receita pecuária por @ desfrutada (acumulado Jan→mês)'
        : 'Receita pecuária por @ desfrutada no mês',
      titulos:   { mes:     { titulo: 'Preço de Venda R$/@', subtitulo: 'Receita pecuária por @ desfrutada no mês' },
                   periodo: { titulo: 'Preço de Venda R$/@', subtitulo: 'Receita pecuária por @ desfrutada (acumulado Jan→mês)' } },
      valor:     precoArrValor,
      deltaMes:  precoArrDeltaMes,
      deltaAno:  precoArrDeltaAno,
      deltaMeta: precoArrDeltaMeta,
      serieAno:    precoArrSerie,
      serieAnoAnt: precoArrSerieAnoAnt ?? undefined,
      serieMeta:   precoArrSerieMeta ?? undefined,
      series: {
        mes:     { ano: precoArrMesSerie13, anoAnt: precoArrMesAnoAntSerie13, meta: precoArrMesMetaSerie13 },
        periodo: { ano: precoArrPeriodoSerie13, anoAnt: precoArrPeriodoAnoAntSerie13, meta: precoArrPeriodoMetaSerie13 },
      },
    } : null,
    custoCabIndicador: monthlyData ? {
      label:     isPeriodo ? 'CUSTO CAB. PERÍODO R$/CAB.' : 'CUSTO CAB. MÊS R$/CAB.',
      titulo:    isPeriodo ? 'Custo Cab. período R$/cab.' : 'Custo Cab. mês R$/cab.',
      subtitulo: isPeriodo
        ? 'Custeio pecuário por cabeça média (acumulado Jan→mês, R$/cab.mês)'
        : 'Custeio pecuário por cabeça média no mês',
      titulos:   { mes:     { titulo: 'Custo Cab. mês R$/cab.', subtitulo: 'Custeio pecuário por cabeça média no mês' },
                   periodo: { titulo: 'Custo Cab. período R$/cab.', subtitulo: 'Custeio pecuário por cabeça média (acumulado Jan→mês, R$/cab.mês)' } },
      valor:     custoCabValor,
      deltaMes:  custoCabDeltaMes,
      deltaAno:  custoCabDeltaAno,
      deltaMeta: custoCabDeltaMeta,
      serieAno:    custoCabSerie,
      serieAnoAnt: custoCabSerieAnoAnt ?? undefined,
      serieMeta:   custoCabSerieMeta ?? undefined,
      series: {
        mes:     { ano: custoCabMesSerie13, anoAnt: custoCabMesAnoAntSerie13, meta: custoCabMesMetaSerie13 },
        periodo: { ano: custoCabPeriodoSerie13, anoAnt: custoCabPeriodoAnoAntSerie13, meta: custoCabPeriodoMetaSerie13 },
      },
      serieMensal: custoCabMesSerie13,
    } : null,
    margemArrIndicador: monthlyData ? {
      label:     'MARGEM POR @',
      titulo:    'Margem por @',
      subtitulo: isPeriodo
        ? 'Preço de venda R$/@ menos custo produtivo R$/@ (acumulado Jan→mês)'
        : 'Preço de venda R$/@ menos custo produtivo R$/@ no mês',
      valor:     margemArrValor,
      deltaMes:  margemArrDeltaMes,
      deltaAno:  margemArrDeltaAno,
      deltaMeta: margemArrDeltaMeta,
      serieAno:    margemArrSerie,
      serieAnoAnt: margemArrSerieAnoAnt ?? undefined,
      serieMeta:   margemArrSerieMeta ?? undefined,
      series: {
        mes: {
          ano:    margemArrMesSerie13,
          anoAnt: margemArrMesAnoAntSerie13 ?? undefined,
          meta:   margemArrMesMetaSerie13   ?? undefined,
        },
        periodo: {
          ano:    margemArrPeriodoSerie13,
          anoAnt: margemArrPeriodoAnoAntSerie13 ?? undefined,
          meta:   margemArrPeriodoMetaSerie13   ?? undefined,
        },
      },
    } : null,

    // ─── Etapa 2C: indicadores financeiros oficiais (caixa fica em 2D) ───
    // Lê do _finSoberano memoizado — referências estáveis por [lancFin, ano, mes, viewMode].
    saidasTotaisIndicador:        _finSoberano.saidasTotais,
    jurosPecIndicador:            _finSoberano.jurosPec,
    custeioPecComJurosIndicador:  _finSoberano.custeioPecComJuros,
    investPecIndicador:           _finSoberano.investPec,
    desembolsoPecIndicador:       _finSoberano.desembolsoPec,
    custeioAgriIndicador:         _finSoberano.custeioAgri,
    jurosAgriIndicador:           _finSoberano.jurosAgri,
    custeioAgriComJurosIndicador: _finSoberano.custeioAgriComJuros,
    investAgriIndicador:          _finSoberano.investAgri,
    desembolsoAgriIndicador:      _finSoberano.desembolsoAgri,
    investBovinosIndicador:       _finSoberano.investBovinos,
    amortizacoesIndicador:        _finSoberano.amortizacoes,
    dividendosIndicador:          _finSoberano.dividendos,
    caixaIndicador:               caixaIndicadorResolved,
    /* Soberanos: vem de financeiro_lancamentos_v2 e NAO dependem de P1. Por isso
       aparecem tambem no retorno de incompletoOverride, ao lado dos de saida. */
    receitaAgriIndicador:         _finSoberano.receitaAgri,
    receitaOutrasIndicador:       _finSoberano.receitaOutras,
    receitaPecCaixaIndicador:     _finSoberano.receitaPecCaixa,
    receitaSilvicolaIndicador:    _finSoberano.receitaSilvicola,
    custeioSilviIndicador:        _finSoberano.custeioSilvi,
    investSilviIndicador:         _finSoberano.investSilvi,
    amortizacaoSilviIndicador:    _finSoberano.amortizacaoSilvi,
    captacaoIndicador:            _finSoberano.captacao,
    jurosSilviIndicador:           _finSoberano.jurosSilvi,
    custoFixoPecIndicador:         _finSoberano.custoFixoPec,
    custoVariavelPecIndicador:     _finSoberano.custoVariavelPec,
    custoFixoAgriIndicador:        _finSoberano.custoFixoAgri,
    custoFixoSilviIndicador:       _finSoberano.custoFixoSilvi,
    deducoesPecIndicador:          _finSoberano.deducoesPec,
    deducoesAgriIndicador:         _finSoberano.deducoesAgri,
    deducoesSilviIndicador:        _finSoberano.deducoesSilvi,
    aportePessoalIndicador:        _finSoberano.aportePessoal,
    retornoEmprestimosIndicador:   _finSoberano.retornoEmprestimos,
    captacaoPecIndicador:         _finSoberano.captacaoPec,
    captacaoAgriIndicador:        _finSoberano.captacaoAgri,
    captacaoSilviIndicador:       _finSoberano.captacaoSilvi,
    captacaoSemEscopoIndicador:   _finSoberano.captacaoSemEscopo,
    entradasNaoClassificadasIndicador: _finSoberano.entradasNaoClassificadas,
    amortizacaoPecIndicador:      _finSoberano.amortizacaoPec,
    amortizacaoAgriIndicador:     _finSoberano.amortizacaoAgri,
    deducoesTributosIndicador:    _finSoberano.deducoesTributos,
    tributosIndicador:            _finSoberano.tributos,

    rebanho,
    financeiro,
    executivo,

    loading,
  };

  if (incompletoOverride) {
    // BUG #1 FIX: indicadores financeiros soberanos vêm de financeiro_lancamentos_v2
    // e NÃO dependem de fechamento P1 das fazendas. Preservá-los aqui garante que
    // o bloco "Financeiro Soberano (Auditoria)" continue visível mesmo quando o
    // mês selecionado não tem P1 fechado em todas as fazendas (ex: meses futuros).
    // Indicadores rebanho/produção/derivados continuam null pois DEPENDEM de P1.
    return {
      ...baseReturn,
      cabecas: null,
      pesoMedio: null,
      gmd: null,
      arrobas: null,
      desfrute: null,
      lotUaHa: null,
      kgHa: null,
      areaProdutivaMes: null,
      dadosCompletos: false,
      seriesMensais: null,
      seriesMeta: null,
      cabecasFinFotoAnoAnt: null,
      pesoMedioFinFotoAnoAnt: null,
      pesoMedioFinMetaSnap: null,
      cabecasIndicador: null,
      pesoMedioIndicador: null,
      gmdIndicador: null,
      uaHaIndicador: null,
      kgHaIndicador: null,
      arrobasIndicador: null,
      desfruteIndicador: null,
      desfrutePctArrIndicador: null,
      desfruteArrIndicador: null,
      valorRebanhoIndicador: null,
      receitaPecIndicador: null,
      custeioPecIndicador: _custeioPecIndicadorMerged,
      custoArrIndicador: null,
      precoArrIndicador: null,
      custoCabIndicador: null,
      margemArrIndicador: null,
      // ─── Etapa 2C: indicadores financeiros soberanos preservados (independem de P1) ───
      saidasTotaisIndicador:        _finSoberano.saidasTotais,
      jurosPecIndicador:            _finSoberano.jurosPec,
      custeioPecComJurosIndicador:  _finSoberano.custeioPecComJuros,
      investPecIndicador:           _finSoberano.investPec,
      desembolsoPecIndicador:       _finSoberano.desembolsoPec,
      custeioAgriIndicador:         _finSoberano.custeioAgri,
      jurosAgriIndicador:           _finSoberano.jurosAgri,
      custeioAgriComJurosIndicador: _finSoberano.custeioAgriComJuros,
      investAgriIndicador:          _finSoberano.investAgri,
      desembolsoAgriIndicador:      _finSoberano.desembolsoAgri,
      investBovinosIndicador:       _finSoberano.investBovinos,
      amortizacoesIndicador:        _finSoberano.amortizacoes,
      dividendosIndicador:          _finSoberano.dividendos,
      caixaIndicador:               caixaIndicadorResolved,
      receitaAgriIndicador:         _finSoberano.receitaAgri,
      receitaOutrasIndicador:       _finSoberano.receitaOutras,
      receitaPecCaixaIndicador:     _finSoberano.receitaPecCaixa,
      receitaSilvicolaIndicador:    _finSoberano.receitaSilvicola,
      custeioSilviIndicador:        _finSoberano.custeioSilvi,
      investSilviIndicador:         _finSoberano.investSilvi,
      amortizacaoSilviIndicador:    _finSoberano.amortizacaoSilvi,
      captacaoIndicador:            _finSoberano.captacao,
      jurosSilviIndicador:           _finSoberano.jurosSilvi,
    custoFixoPecIndicador:         _finSoberano.custoFixoPec,
    custoVariavelPecIndicador:     _finSoberano.custoVariavelPec,
    custoFixoAgriIndicador:        _finSoberano.custoFixoAgri,
    custoFixoSilviIndicador:       _finSoberano.custoFixoSilvi,
    deducoesPecIndicador:          _finSoberano.deducoesPec,
    deducoesAgriIndicador:         _finSoberano.deducoesAgri,
    deducoesSilviIndicador:        _finSoberano.deducoesSilvi,
    aportePessoalIndicador:        _finSoberano.aportePessoal,
    retornoEmprestimosIndicador:   _finSoberano.retornoEmprestimos,
    captacaoPecIndicador:         _finSoberano.captacaoPec,
      captacaoAgriIndicador:        _finSoberano.captacaoAgri,
      captacaoSilviIndicador:       _finSoberano.captacaoSilvi,
      captacaoSemEscopoIndicador:   _finSoberano.captacaoSemEscopo,
      entradasNaoClassificadasIndicador: _finSoberano.entradasNaoClassificadas,
      amortizacaoPecIndicador:      _finSoberano.amortizacaoPec,
      amortizacaoAgriIndicador:     _finSoberano.amortizacaoAgri,
      deducoesTributosIndicador:    _finSoberano.deducoesTributos,
      tributosIndicador:            _finSoberano.tributos,
      // Step 2.2: dominio rebanho preservado (composicao depende de getCategoriasDetalhe,
      // que pode existir mesmo em estado incompleto — funcao filtra saldoFinal > 0 e
      // retorna null quando vazio).
      rebanho,
      // Step 2.4: dominio financeiro preservado (centrosCusto vem de lancFin, que
      // independe de P1 — analogo aos *Indicadores financeiros soberanos acima).
      financeiro,
      // Step 2.1*: runway preservado — depende apenas de caixa + saidas totais,
      // ambos soberanos e independentes de P1.
      executivo,
    };
  }

  return baseReturn;
}
