/**
 * usePlanejamentoAprovacaoData — leitura executiva da META do ano.
 *
 * Camada única para a tela "Visão Geral Planejamento" (pré-aprovação da META).
 * Consome PC-100 (usePainelConsultorData) e gridMeta canônico
 * (usePlanejamentoFinanceiro). Sem fonte paralela, sem cálculo paralelo,
 * sem mistura META × Realizado corrente do mês em curso.
 *
 * Regra de ouro: campo retorna null quando a fonte soberana não entrega
 * contrato seguro. UI exibe "Sem base validada" para esses campos.
 *
 * A1: TopoCards/ProducaoVendas/CustosDesembolsos via PC-100 (META + ano-1).
 * A2: meta_versoes.status, abertura do ano, flags de transparência de área.
 * A3: média histórica 3a (pendente).
 * A4: alertas leves (pendente).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useSnapshotAreaAnual } from '@/hooks/useFechamentoArea';

// Cliente Supabase casteado de forma frouxa: alguns campos usados aqui
// (`status` em meta_versoes pós-A2.1; `status_operacional` em fazendas;
// várias colunas em fechamento_area_snapshot) ainda não estão refletidos
// em src/integrations/supabase/types.ts. Mesmo padrão usado em outros
// hooks canônicos (PC-100, useFechamentoArea). Trocar quando types.ts
// for regenerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLoose = any;
const sbLoose = supabase as SupabaseLoose;

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
  area_provisoria: boolean;                       // sempre true em V1
  area_inclui_fazenda_sem_rebanho: boolean;       // NOVO A2
  area_alerta: string | null;                     // NOVO A2
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

/**
 * Hook executivo de leitura para Visão Geral Planejamento.
 *
 * IMPORTANTE: em modo Individual (fazendaId definido), o consumidor
 * DEVE garantir que FazendaContext.fazendaAtual.id === fazendaId
 * antes de chamar este hook. Isso porque hooks canônicos consumidos
 * internamente (useRebanhoOficial, usePainelConsultorData) leem o
 * FazendaContext em vez de receber fazendaId como parâmetro. Esta
 * é convenção estabelecida em outros hooks executivos do projeto
 * (usePainelConsultorData, usePlanejamentoFinanceiro).
 *
 * Em modo Global (fazendaId=null), o hook agrega todas as fazendas
 * pec do cliente via clienteAtual.id do ClienteContext.
 */
export function usePlanejamentoAprovacaoData({
  clienteId,
  fazendaId,
  ano,
  isGlobal,
}: Params): Result {
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

  // ─── A2: hooks canônicos para abertura do ano ────────────────────────────
  // useRebanhoOficial é o hub oficial declarado para qualquer leitura de
  // rebanho. Em Individual, lê fazendaAtual.id do FazendaContext (ver JSDoc).
  const rebanhoOficial = useRebanhoOficial({
    ano,
    cenario: 'realizado',
    global: isGlobal,
    enabled: !!clienteId,
  });
  // Destructure para deps explícitas no useMemo (exhaustive-deps).
  const {
    rawCategorias: rebanhoRawCategorias,
    getFazendaMes: rebanhoGetFazendaMes,
    loading: rebanhoLoading,
  } = rebanhoOficial;

  const snapshot = useSnapshotAreaAnual(
    ano,
    fazendaId ?? undefined,
    isGlobal,
    clienteId ?? undefined,
  );

  // ─── A2: queries declaradas (acesso direto autorizado) ───────────────────
  // meta_versoes, valor_rebanho_fechamento, financeiro_saldos_bancarios_v2,
  // fazendas, fechamento_area_snapshot, fechamento_pastos, fechamento_pasto_itens.
  const metaQuery = useQuery({
    queryKey: ['planej-meta-info', clienteId, fazendaId ?? 'global', ano],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Cast `as any`: types do Supabase são gerados a partir do schema antes
      // da migration A2.1; coluna `status` em meta_versoes ainda não aparece
      // no types.ts. Padrão do codebase para esses casos.
      let q = sbLoose.from('meta_versoes')
        .select('id, status, created_at, user_id, usuario_email, fazenda_id')
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fazendaId) {
        q = q.eq('fazenda_id', fazendaId);
      } else {
        q = q.is('fazenda_id', null);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data?.[0] ?? null) as {
        id: string;
        status: string;
        created_at: string;
        user_id: string | null;
        usuario_email: string | null;
        fazenda_id: string | null;
      } | null;
    },
  });

  const vrfQuery = useQuery({
    queryKey: ['planej-vrf-init', clienteId, fazendaId ?? 'global', ano],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ valor: number | null; completo: boolean }> => {
      const anoMesDez = `${ano - 1}-12`;

      if (isGlobal) {
        // Cast `as any`: status_operacional existe na tabela mas não nos
        // types gerados (mesma situação de useFechamentoArea).
        const { data: fazendas, error: errFaz } = await sbLoose.from('fazendas')
          .select('id, nome')
          .eq('cliente_id', clienteId)
          .eq('tem_pecuaria', true)
          .eq('status_operacional', 'ativa');
        if (errFaz) throw errFaz;
        const idsPec = ((fazendas ?? []) as { id: string }[]).map(f => f.id);
        if (idsPec.length === 0) return { valor: null, completo: false };

        const { data: vrf, error: errVrf } = await sbLoose.from('valor_rebanho_fechamento')
          .select('fazenda_id, status, valor_total')
          .eq('cliente_id', clienteId)
          .eq('ano_mes', anoMesDez)
          .eq('status', 'fechado')
          .in('fazenda_id', idsPec);
        if (errVrf) throw errVrf;

        const fazendasComFechamento = new Set(((vrf ?? []) as { fazenda_id: string }[]).map(r => r.fazenda_id));
        const todasFechadas = idsPec.every(id => fazendasComFechamento.has(id));

        if (!todasFechadas) {
          return { valor: null, completo: false };
        }
        const total = ((vrf ?? []) as { valor_total: number | null }[])
          .reduce((acc, r) => acc + Number(r.valor_total ?? 0), 0);
        return { valor: total, completo: true };
      }

      // Individual
      if (!fazendaId) return { valor: null, completo: false };
      const { data, error } = await sbLoose.from('valor_rebanho_fechamento')
        .select('valor_total, status')
        .eq('cliente_id', clienteId)
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMesDez)
        .eq('status', 'fechado')
        .limit(1);
      if (error) throw error;
      const row = (data as { valor_total: number | null }[] | null)?.[0];
      if (!row) return { valor: null, completo: false };
      return { valor: Number(row.valor_total ?? 0), completo: true };
    },
  });

  // Caixa pertence ao cliente/Administrativo, não à fazenda.
  // Em modo Individual TAMBÉM somar todas as contas do cliente.
  const caixaQuery = useQuery({
    queryKey: ['planej-caixa-init', clienteId, ano],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const anoMesDez = `${ano - 1}-12`;
      const { data, error } = await sbLoose.from('financeiro_saldos_bancarios_v2')
        .select('saldo_final')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesDez);
      if (error) throw error;
      const rows = (data ?? []) as { saldo_final: number | null }[];
      if (rows.length === 0) return null;
      return rows.reduce((acc, r) => acc + Number(r.saldo_final ?? 0), 0);
    },
  });

  // V1: detecção de transparência sobre BUG conhecido em useSnapshotAreaAnual.
  // O hook canônico soma área Global incluindo fazendas pec ativas SEM rebanho
  // efetivo. Não corrigimos a fonte agora (decisão arquitetural — área é dado
  // histórico de uso do solo, não pode ser recalculada). Apenas sinalizamos
  // via flag e mensagem para que a UI futura mostre alerta de transparência.
  // Issue separada: "BUG ÁREA GLOBAL — useSnapshotAreaAnual soma fazendas pec
  // ativas sem rebanho efetivo".
  const areaBugQuery = useQuery({
    queryKey: ['planej-area-bug-check', clienteId, ano],
    enabled: !!clienteId && isGlobal,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{
      fazendasPec: { id: string; nome: string }[];
      semRebanho: { id: string; nome: string; area: number }[];
    }> => {
      const anoMesJan = `${ano}-01`;

      const { data: fazendasRaw, error: errFaz } = await sbLoose.from('fazendas')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('tem_pecuaria', true)
        .eq('status_operacional', 'ativa');
      if (errFaz) throw errFaz;
      const fazendasPec = ((fazendasRaw ?? []) as { id: string; nome: string }[])
        .map(f => ({ id: f.id, nome: f.nome }));
      if (fazendasPec.length === 0) return { fazendasPec, semRebanho: [] };

      const { data: snapsRaw, error: errSnap } = await sbLoose.from('fechamento_area_snapshot')
        .select('fazenda_id, area_pecuaria_ha')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', `${ano}-01-01`);
      if (errSnap) throw errSnap;
      const snaps = (snapsRaw ?? []) as { fazenda_id: string; area_pecuaria_ha: number | null }[];
      const fazendasComArea = new Map<string, number>(
        snaps
          .filter(s => Number(s.area_pecuaria_ha) > 0)
          .map(s => [s.fazenda_id, Number(s.area_pecuaria_ha)]),
      );

      const { data: fpRaw, error: errFp } = await sbLoose.from('fechamento_pastos')
        .select('id, fazenda_id')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesJan)
        .eq('status', 'fechado');
      if (errFp) throw errFp;
      const fp = (fpRaw ?? []) as { id: string; fazenda_id: string }[];

      const cabecasPorFazenda = new Map<string, number>();
      if (fp.length > 0) {
        const { data: fpiRaw, error: errFpi } = await sbLoose.from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade')
          .in('fechamento_id', fp.map(r => r.id));
        if (errFpi) throw errFpi;
        const fpi = (fpiRaw ?? []) as { fechamento_id: string; quantidade: number | null }[];

        const fechToFazenda = new Map<string, string>(fp.map(r => [r.id, r.fazenda_id]));
        for (const item of fpi) {
          const fid = fechToFazenda.get(item.fechamento_id);
          if (!fid) continue;
          const qtd = Number(item.quantidade ?? 0);
          cabecasPorFazenda.set(fid, (cabecasPorFazenda.get(fid) ?? 0) + qtd);
        }
      }

      const semRebanho = fazendasPec
        .filter(f => fazendasComArea.has(f.id))
        .filter(f => (cabecasPorFazenda.get(f.id) ?? 0) === 0)
        .map(f => ({ id: f.id, nome: f.nome, area: fazendasComArea.get(f.id)! }));

      return { fazendasPec, semRebanho };
    },
  });

  const loading =
    !!ppfLoading
    || !!pc100.loading
    || metaQuery.isLoading
    || vrfQuery.isLoading
    || caixaQuery.isLoading
    || snapshot.loading
    || areaBugQuery.isLoading
    || !!rebanhoLoading;

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

    // ─── AberturaAno ──────────────────────────────────────────────────
    //
    // V1: regra conservadora tudo-ou-nada. Em Global, se qualquer fazenda
    // pec ativa não tem saldo Jan ou está com rebanho zero, retornamos null.
    // Não somamos parcial para não exibir número incompleto sem aviso.
    //
    // Caso típico tratado: fazenda esvaziada antes/durante Dez/(ano-1) — o
    // saldo_inicial Jan vem do P1 fechado Dez/(ano-1) e a regra dispara null.
    // Caso NJ Sta. Luzia 2026 enquadra-se aqui.
    //
    // RISCO RESIDUAL ACEITO em V1: se fazenda for esvaziada DURANTE Jan via
    // lançamento Realizado, saldo_inicial Jan ainda mostra o número Dez/(ano-1)
    // (gate não dispara). Refinar em A3+ se aparecer caso real.
    let rebanho_inicial_cabecas: number | null = null;
    let rebanho_inicial_peso_medio: number | null = null;
    if (isGlobal) {
      const fazendasPec = areaBugQuery.data?.fazendasPec ?? [];
      if (fazendasPec.length > 0) {
        const cabecasPorFazenda = new Map<string, number>();
        for (const r of rebanhoRawCategorias) {
          if (r.mes !== 1) continue;
          cabecasPorFazenda.set(
            r.fazenda_id,
            (cabecasPorFazenda.get(r.fazenda_id) ?? 0) + r.saldo_inicial,
          );
        }
        const todasComRebanho = fazendasPec.every(
          f => (cabecasPorFazenda.get(f.id) ?? 0) > 0,
        );
        if (todasComRebanho) {
          const fazJan = rebanhoGetFazendaMes(1);
          const cabecas = fazJan?.cabecasInicio ?? 0;
          const pesoTotal = fazJan?.pesoInicioKg ?? 0;
          if (cabecas > 0 && pesoTotal > 0) {
            rebanho_inicial_cabecas = cabecas;
            rebanho_inicial_peso_medio = pesoTotal / cabecas;
          }
        }
      }
    } else {
      // Individual
      const fazJan = rebanhoGetFazendaMes(1);
      const cabecas = fazJan?.cabecasInicio ?? 0;
      const pesoTotal = fazJan?.pesoInicioKg ?? 0;
      if (cabecas > 0 && pesoTotal > 0) {
        rebanho_inicial_cabecas = cabecas;
        rebanho_inicial_peso_medio = pesoTotal / cabecas;
      }
    }

    const valor_inicial_rebanho = vrfQuery.data?.valor ?? null;
    const valor_inicial_p2_fechado = !!vrfQuery.data?.completo;

    const caixa_inicial = caixaQuery.data ?? null;

    const area_produtiva_ha = snapshot.fazendasAtivasCarregadas
      ? (snapshot.areaMensal[0] ?? null)
      : (isGlobal ? null : (snapshot.areaMensal[0] ?? null));
    const area_provisoria = true;

    const semRebanhoCount = areaBugQuery.data?.semRebanho.length ?? 0;
    const area_inclui_fazenda_sem_rebanho = isGlobal && semRebanhoCount > 0;
    const area_alerta = area_inclui_fazenda_sem_rebanho && areaBugQuery.data
      ? `Área global pecuária inclui ${semRebanhoCount} fazenda(s) sem rebanho efetivo no período (${
          areaBugQuery.data.semRebanho.map(f => `${f.nome}: ${f.area.toFixed(2)} ha`).join(', ')
        }). Indicadores por hectare podem estar subestimados. Bug conhecido em useFechamentoArea — aguardar Módulo Oficial de Áreas.`
      : null;

    // TODO(A1): divida_inicial retorna null porque a Camada B do PC-100
    // ainda não expõe saldo devedor de abertura. Hoje Camada B só entrega
    // fluxo (juros/amortizações). Não usar useFinanciamentosPainel direto
    // — regra de ouro. Quando Camada B evoluir, mudar divida_inicial_fonte
    // para 'pc100_camada_b'.
    const comoAnoComeca: AberturaAno = {
      rebanho_inicial_cabecas,
      rebanho_inicial_peso_medio,
      valor_inicial_rebanho,
      valor_inicial_p2_fechado,
      caixa_inicial,
      divida_inicial: null,
      divida_inicial_fonte: 'camada_b_pendente',
      area_produtiva_ha,
      area_provisoria,
      area_inclui_fazenda_sem_rebanho,
      area_alerta,
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

    // ─── meta (A2: query meta_versoes) ────────────────────────────────
    const metaRow = metaQuery.data;
    const metaStatus: 'rascunho' | 'aprovada' =
      metaRow?.status === 'aprovada' ? 'aprovada' : 'rascunho';
    const metaInfo: MetaInfo = {
      versao_id: metaRow?.id ?? null,
      status: metaStatus,
      aprovada_em: metaStatus === 'aprovada' ? (metaRow?.created_at ?? null) : null,
      aprovada_por: metaStatus === 'aprovada' ? (metaRow?.usuario_email ?? null) : null,
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
    // gridMeta não entra nos deps: só influencia data via pc100
    // (gridMetaExterno → _finSoberano.serieMeta). pc100 já cobre a invalidação.
  }, [
    clienteId,
    loading,
    isGlobal,
    pc100,
    metaQuery.data,
    vrfQuery.data,
    caixaQuery.data,
    snapshot.areaMensal,
    snapshot.fazendasAtivasCarregadas,
    areaBugQuery.data,
    rebanhoRawCategorias,
    rebanhoGetFazendaMes,
  ]);

  if (!clienteId) {
    return { loading: false, error: null, data: null };
  }

  return {
    loading,
    error: null,
    data,
  };
}
