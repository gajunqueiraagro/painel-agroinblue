/**
 * usePlanejamentoAprovacaoData — V1 (A1) leitura executiva da META do ano.
 *
 * Camada única para a tela "Visão Geral Planejamento" (pré-aprovação da META).
 * Consome PC-100 (usePainelConsultorData) e gridMeta canônico
 * (usePlanejamentoFinanceiro). Sem fonte paralela, sem cálculo paralelo,
 * sem mistura META × Realizado corrente do mês em curso.
 *
 * Regra de ouro: campo retorna null quando a fonte soberana não entrega
 * contrato seguro. UI exibe "Sem base validada" para esses campos.
 *
 * Mapeamento auditado em A1.0 com decisões humanas finais aplicadas.
 *
 * Etapa A1: meta info + abertura do ano + média histórica + alertas
 * entram nas etapas A2/A3/A4 (campos retornam stub aqui).
 */
import { useMemo } from 'react';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';

// ─── Tipos públicos ────────────────────────────────────────────────────────

interface MetaInfo {
  versao_id: string | null;
  status: 'rascunho' | 'aprovada';
  aprovada_em: string | null;
  aprovada_por: string | null;
}

interface TopoCards {
  receita_planejada: number | null;
  desembolso_planejado: number | null;
  resultado_projetado: number | null;
  caixa_final_projetado: number | null;
  rebanho_final_cabecas: number | null;
  rebanho_final_arrobas: number | null;
}

interface AberturaAno {
  rebanho_inicial_cabecas: number | null;
  rebanho_inicial_peso_medio: number | null;
  valor_inicial_rebanho: number | null;
  valor_inicial_p2_fechado: boolean;
  caixa_inicial: number | null;
  divida_inicial: number | null;
  divida_inicial_fonte:
    | 'camada_b_pendente'
    | 'sem_base_validada'
    | null;
  area_produtiva_ha: number | null;
  area_provisoria: boolean;
}

interface IndicadorComparativo {
  meta: number | null;
  ano_anterior: number | null;
  media_historica_3a: number | null;
}

interface ProducaoVendas {
  desfrute_planejado: IndicadorComparativo;
  arrobas_produzidas: IndicadorComparativo;
  arrobas_vendidas: IndicadorComparativo;
  gmd_kg_dia: IndicadorComparativo;
  peso_medio_saida_kg: IndicadorComparativo;
  preco_medio_arroba: IndicadorComparativo;
  faturamento_planejado: IndicadorComparativo;
}

interface CustosDesembolsos {
  nutricao: IndicadorComparativo;
  operacional: IndicadorComparativo;
  investimentos: IndicadorComparativo;
  financiamentos: IndicadorComparativo;
  dividendos: IndicadorComparativo;
  total_desembolso: IndicadorComparativo;
}

interface ResumoEconomicoLinha {
  linha: 'receita' | 'despesas' | 'margem' | 'geracao_caixa';
  meta: number | null;
  ano_anterior: number | null;
  media_historica: number | null;
}

type AlertaSeveridade = 'info' | 'aviso';

interface AlertaLeve {
  id: string;
  severidade: AlertaSeveridade;
  mensagem: string;
  bloco: 'topo' | 'abertura' | 'producao' | 'custos' | 'resumo';
}

export interface PlanejamentoAprovacaoData {
  meta: MetaInfo;
  topoExecutivo: TopoCards;
  comoAnoComeca: AberturaAno;
  producaoVendas: ProducaoVendas;
  custosDesembolsos: CustosDesembolsos;
  resumoEconomico: ResumoEconomicoLinha[];
  alertas: AlertaLeve[];
  baseValidada: boolean;
  historicoDisponivel: {
    ano_anterior: boolean;
    anos_validos_historico: number;
  };
}

interface Params {
  /** Cliente atual — apenas guarda contra chamadas sem cliente.
   *  PC-100 e usePlanejamentoFinanceiro lêem o cliente real do ClienteContext. */
  clienteId: string | null;
  /** Fazenda atual ou null para Global. PC-100 lê do FazendaContext;
   *  o param é repassado a usePlanejamentoFinanceiro. */
  fazendaId: string | null;
  /** Ano da META (ex: 2026). */
  ano: number;
  /** True para Global, false para Individual. Documentação de contrato; o valor
   *  efetivo vem do FazendaContext (consumido por PC-100 e ppf). */
  isGlobal: boolean;
}

interface Result {
  loading: boolean;
  error: Error | null;
  data: PlanejamentoAprovacaoData | null;
}

// ─── Helpers locais ────────────────────────────────────────────────────────

// Indicadores α/β do PC-100 publicam serieMeta/serieAnoAnt como number[] de
// length 13 com índice 0 = NaN e índice 12 = total/média acumulada Jan→Dez.
// Em viewMode='periodo' mes=12 isso já é o valor anual (auditado em A1.0).
function safeSerieMeta12(ind: { serieMeta?: number[] } | null | undefined): number | null {
  if (!ind?.serieMeta) return null;
  const v = ind.serieMeta[12];
  return Number.isFinite(v) ? v : null;
}

function safeSerieAnoAnt12(ind: { serieAnoAnt?: number[] } | null | undefined): number | null {
  if (!ind?.serieAnoAnt) return null;
  const v = ind.serieAnoAnt[12];
  return Number.isFinite(v) ? v : null;
}

// Política conservadora: se qualquer parcela for null, a soma é null.
function somaNulableSafe(values: (number | null)[]): number | null {
  if (values.some(v => v == null)) return null;
  return values.reduce<number>((acc, v) => acc + (v as number), 0);
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function usePlanejamentoAprovacaoData({
  clienteId,
  fazendaId,
  ano,
  isGlobal,
}: Params): Result {
  // isGlobal mantido na assinatura (contrato público); valor real vem do
  // FazendaContext via hooks subordinados.
  void isGlobal;

  // gridMeta canônico — único caminho permitido para alimentar serieMeta dos
  // indicadores _finSoberano do PC-100. Acesso direto a planejamento_financeiro
  // está proibido pela regra de ouro; usePlanejamentoFinanceiro é o hub oficial.
  const ppf = usePlanejamentoFinanceiro(ano, fazendaId ?? undefined);
  const { buildGrid: ppfBuildGrid, loading: ppfLoading } = ppf;
  const gridMeta = useMemo(() => ppfBuildGrid(), [ppfBuildGrid]);

  const pc100 = usePainelConsultorData({
    ano,
    mes: 12,
    viewMode: 'periodo',
    carregarMeta: true,
    incluirComparativos: true,
    gridMetaExterno: gridMeta,
  });

  const loading = !!ppfLoading || !!pc100.loading;

  const data = useMemo<PlanejamentoAprovacaoData | null>(() => {
    if (!clienteId) return null;
    if (loading) return null;

    // ─── TopoCards ────────────────────────────────────────────────────
    const receita_planejada = safeSerieMeta12(pc100.receitaPecIndicador);
    const desembolso_planejado = safeSerieMeta12(pc100.saidasTotaisIndicador);
    const resultado_projetado =
      receita_planejada != null && desembolso_planejado != null
        ? receita_planejada - desembolso_planejado
        : null;

    // TODO(A1): caixa_final_projetado retorna null porque PC-100 não expõe
    // caixaIndicador (hardcoded null em usePainelConsultorData.ts:2636/2688).
    // Aguardar Etapa 2D do PC-100 expor série de caixa META.
    const caixa_final_projetado: number | null = null;

    // Decisão A1.0 #10: rebanho final usa as séries top-level seriesMeta
    // (0-based, índice 11 = Dez). NÃO usar cabecasIndicador.valor: em
    // viewMode='periodo' o escalar devolve cabMediaAcumulada (média anual
    // de cabeças médias), não o estoque final de Dez.
    const cabFinDez = pc100.seriesMeta?.cabFin?.[11];
    const pesoMedioFinDez = pc100.seriesMeta?.pesoMedioFin?.[11];
    const rebanho_final_cabecas: number | null =
      typeof cabFinDez === 'number' && Number.isFinite(cabFinDez) ? cabFinDez : null;
    const rebanho_final_arrobas: number | null =
      rebanho_final_cabecas != null
      && typeof pesoMedioFinDez === 'number'
      && Number.isFinite(pesoMedioFinDez)
        ? (pesoMedioFinDez * rebanho_final_cabecas) / 30
        : null;

    const topoExecutivo: TopoCards = {
      receita_planejada,
      desembolso_planejado,
      resultado_projetado,
      caixa_final_projetado,
      rebanho_final_cabecas,
      rebanho_final_arrobas,
    };

    // ─── AberturaAno (V1 stub — A2 popula) ────────────────────────────
    // TODO(A1): divida_inicial retorna null porque a Camada B do PC-100
    // ainda não expõe saldo devedor de abertura. Hoje Camada B só entrega
    // fluxo (juros/amortizações). Não usar useFinanciamentosPainel direto
    // — regra de ouro. Quando Camada B evoluir, mudar divida_inicial_fonte
    // para 'pc100_camada_b'.
    const comoAnoComeca: AberturaAno = {
      rebanho_inicial_cabecas: null,
      rebanho_inicial_peso_medio: null,
      valor_inicial_rebanho: null,
      valor_inicial_p2_fechado: false,
      caixa_inicial: null,
      divida_inicial: null,
      divida_inicial_fonte: 'camada_b_pendente',
      area_produtiva_ha: null,
      area_provisoria: true,
    };

    // ─── ProducaoVendas ───────────────────────────────────────────────
    // Decisão A1.0 #3: desfrute = abate + venda + consumo (TIPOS_DESFRUTE_OFICIAL).
    const desfrute_planejado: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.desfruteIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.desfruteIndicador),
      media_historica_3a: null,
    };
    const arrobas_produzidas: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.arrobasIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.arrobasIndicador),
      media_historica_3a: null,
    };
    // TODO(A1): arrobas_vendidas retorna null. Decisão A1.0 #5 — PC-100 não
    // expõe arrobas vendidas META soberano (só desfrute_arr Realizado).
    // Aguardar PC-100 isolar arrobas de saída.
    const arrobas_vendidas: IndicadorComparativo = {
      meta: null,
      ano_anterior: null,
      media_historica_3a: null,
    };
    // PC-100 entrega derivado ponderado via computePeriodGmd. PROIBIDO
    // somar série de GMD (média/derivado).
    const gmd_kg_dia: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.gmdIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.gmdIndicador),
      media_historica_3a: null,
    };
    // TODO(A1): peso_medio_saida_kg retorna null. Decisão A1.0 #4 —
    // pesoMedioIndicador é peso médio do rebanho-estoque, não peso médio
    // das cabeças que saíram. Sem proxy aceitável; aguardar PC-100 expor
    // peso médio ponderado por desfrute.
    const peso_medio_saida_kg: IndicadorComparativo = {
      meta: null,
      ano_anterior: null,
      media_historica_3a: null,
    };
    // Derivado ponderado entregue pelo PC-100. PROIBIDO somar série.
    const preco_medio_arroba: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.precoArrIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.precoArrIndicador),
      media_historica_3a: null,
    };
    // Decisão A1.0 #1: faturamento_planejado = receita_planejada do TopoCards
    // (mesmo dado, exibição em dois lugares).
    const faturamento_planejado: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.receitaPecIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.receitaPecIndicador),
      media_historica_3a: null,
    };

    const producaoVendas: ProducaoVendas = {
      desfrute_planejado,
      arrobas_produzidas,
      arrobas_vendidas,
      gmd_kg_dia,
      peso_medio_saida_kg,
      preco_medio_arroba,
      faturamento_planejado,
    };

    // ─── CustosDesembolsos ────────────────────────────────────────────
    // TODO(A1): nutricao retorna null. Decisão A1.0 #6 — PC-100 não isola
    // Nutrição em indicador soberano (está embutido em Custo Variável Pec).
    // Sem proxy aceitável; aguardar PC-100 expor recorte de Nutrição.
    const nutricao: IndicadorComparativo = {
      meta: null,
      ano_anterior: null,
      media_historica_3a: null,
    };
    // Decisão A1.0 #7: operacional = custeio pec sem juros (custo fixo +
    // variável pec). custeioPecIndicador é o único _finSoberano com
    // serieAnoAnt (tem fetch ano-1 dedicado em PC-100).
    const operacional: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.custeioPecIndicador),
      ano_anterior: safeSerieAnoAnt12(pc100.custeioPecIndicador),
      media_historica_3a: null,
    };
    // Decisão A1.0 #7: investimentos = Inv. Bovinos + Inv. Fazenda Pec +
    // Inv. Fazenda Agri. Soma de fluxos (OK). _finSoberano sem ano-1.
    const investimentos: IndicadorComparativo = {
      meta: somaNulableSafe([
        safeSerieMeta12(pc100.investBovinosIndicador),
        safeSerieMeta12(pc100.investPecIndicador),
        safeSerieMeta12(pc100.investAgriIndicador),
      ]),
      ano_anterior: null,
      media_historica_3a: null,
    };
    // Decisão A1.0 #7: financiamentos = juros pec + juros agri + amortizações.
    const financiamentos: IndicadorComparativo = {
      meta: somaNulableSafe([
        safeSerieMeta12(pc100.jurosPecIndicador),
        safeSerieMeta12(pc100.jurosAgriIndicador),
        safeSerieMeta12(pc100.amortizacoesIndicador),
      ]),
      ano_anterior: null,
      media_historica_3a: null,
    };
    const dividendos: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.dividendosIndicador),
      ano_anterior: null,
      media_historica_3a: null,
    };
    // total_desembolso = saidasTotais (Pec + Agri + Bovinos + Amort + Div).
    // Mesma fórmula oficial 1T26 do PC-100 (agregadosFinanceiros.ts).
    const total_desembolso: IndicadorComparativo = {
      meta: safeSerieMeta12(pc100.saidasTotaisIndicador),
      ano_anterior: null,
      media_historica_3a: null,
    };

    const custosDesembolsos: CustosDesembolsos = {
      nutricao,
      operacional,
      investimentos,
      financiamentos,
      dividendos,
      total_desembolso,
    };

    // ─── ResumoEconomicoLinha[] ───────────────────────────────────────
    const resumoEconomico: ResumoEconomicoLinha[] = [
      {
        linha: 'receita',
        meta: receita_planejada,
        ano_anterior: faturamento_planejado.ano_anterior,
        media_historica: null,
      },
      {
        linha: 'despesas',
        meta: desembolso_planejado,
        ano_anterior: total_desembolso.ano_anterior,
        media_historica: null,
      },
      {
        linha: 'margem',
        meta: resultado_projetado,
        ano_anterior:
          faturamento_planejado.ano_anterior != null
          && total_desembolso.ano_anterior != null
            ? faturamento_planejado.ano_anterior - total_desembolso.ano_anterior
            : null,
        media_historica: null,
      },
      {
        linha: 'geracao_caixa',
        meta: caixa_final_projetado,
        ano_anterior: null,
        media_historica: null,
      },
    ];

    // ─── meta (V1 stub — A2 popula via meta_versoes) ──────────────────
    const metaInfo: MetaInfo = {
      versao_id: null,
      status: 'rascunho',
      aprovada_em: null,
      aprovada_por: null,
    };

    // ─── alertas (V1 vazio — A4 popula) ───────────────────────────────
    const alertas: AlertaLeve[] = [];

    // ─── baseValidada ─────────────────────────────────────────────────
    const baseValidada =
      pc100.dadosCompletos === true
      && receita_planejada != null
      && desembolso_planejado != null;

    // ─── historicoDisponivel ──────────────────────────────────────────
    // PROIBIDO usar > 0 — ano fechado pode ter valor 0 ou negativo.
    const candidatosAnoAnt: (number | null)[] = [
      desfrute_planejado.ano_anterior,
      arrobas_produzidas.ano_anterior,
      gmd_kg_dia.ano_anterior,
      preco_medio_arroba.ano_anterior,
      faturamento_planejado.ano_anterior,
      operacional.ano_anterior,
    ];
    const temAnoAnterior = candidatosAnoAnt.some(v => v !== null);

    return {
      meta: metaInfo,
      topoExecutivo,
      comoAnoComeca,
      producaoVendas,
      custosDesembolsos,
      resumoEconomico,
      alertas,
      baseValidada,
      historicoDisponivel: {
        ano_anterior: temAnoAnterior,
        anos_validos_historico: 0,
      },
    };
    // gridMeta não entra nos deps: ele só influencia data via pc100
    // (gridMetaExterno → _finSoberano.serieMeta). pc100 já cobre a invalidação.
  }, [clienteId, loading, pc100]);

  if (!clienteId) {
    return { loading: false, error: null, data: null };
  }

  return {
    loading,
    error: null,
    data,
  };
}
