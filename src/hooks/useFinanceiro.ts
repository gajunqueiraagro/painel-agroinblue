/**
 * Hook central do módulo financeiro.
 * Gerencia importações, lançamentos financeiros, indicadores e rateio ADM.
 *
 * hash_importacao: campo técnico de apoio para rastreabilidade de dedup.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RATEIO ADM v2 — Critério: REBANHO MÉDIO do período
 * ═══════════════════════════════════════════════════════════════════════
 * Regras:
 * - Modo global: soma todos os lançamentos originais (incluindo ADM), sem rateio.
 * - Modo por fazenda: lançamentos da fazenda + parcela rateada dos custos ADM
 *   proporcional ao rebanho médio.
 * - Somente lançamentos ADM com status_transacao = "realizado" entram no rateio.
 * - O período do rateio usa data_pagamento (não data_realizacao nem ano_mes).
 * - Desembolso produtivo = macro_custo "Custeio Produtivo" + tipo_operacao 2-Saídas.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { LinhaImportada, SaldoBancarioImportado, ResumoCaixaImportado, CentroCustoOficial } from '@/lib/financeiro/importParser';
import { gerarHashImportacao } from '@/lib/financeiro/duplicidadeImportacao';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportacaoRecord {
  id: string;
  nome_arquivo: string;
  data_importacao: string;
  status: string;
  total_linhas: number;
  total_validas: number;
  total_com_erro: number;
}

export interface ImportErroDetalhe {
  linha?: number;
  descricao?: string;
  valor?: number;
  fornecedor?: string;
  motivo: string;
}

export interface ImportResultado {
  ok: boolean;
  totalProcessado: number;
  totalSalvo: number;
  totalDuplicado: number;
  totalErro: number;
  erros: ImportErroDetalhe[];
}

export interface FinanceiroLancamento {
  id: string;
  fazenda_id: string;
  importacao_id: string | null;
  origem_dado: string;
  data_realizacao: string;
  data_pagamento: string | null;
  ano_mes: string;
  produto: string | null;
  fornecedor: string | null;
  valor: number;
  status_transacao: string | null;
  tipo_operacao: string | null;
  conta_origem: string | null;
  conta_destino: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  numero_documento: string | null;
  cpf_cnpj: string | null;
  recorrencia: string | null;
  forma_pagamento: string | null;
  obs: string | null;
  escopo_negocio: string | null;
  // V2 fields mapped
  sinal?: number;
  favorecido_id?: string | null;
  conta_bancaria_id?: string | null;
  descricao?: string | null;
  observacao?: string | null;
  origem_lancamento?: string;
  lote_importacao_id?: string | null;
  cancelado?: boolean;
  editado_manual?: boolean;
}

interface ContaBancariaImportacao {
  id: string;
  fazenda_id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  codigo_conta: string | null;
  banco?: string | null;
  numero_conta?: string | null;
  conta_digito?: string | null;
}

interface LinhaImportadaResolvida extends LinhaImportada {
  contaBancariaId: string | null;
  contaDestinoId: string | null;
}

interface SaldoImportadoResolvido extends SaldoBancarioImportado {
  contaBancariaId: string | null;
}

/** Rateio calculado para a fazenda atual */
export interface RateioADM {
  anoMes: string;
  valorTotal: number;
  percentualFazenda: number;
  valorRateado: number;
}

/** Dados completos do rateio para conferência (todas as fazendas) */
export interface RateioADMConferencia {
  anoMes: string;
  totalADMEncontrado: number;
  totalADMElegivel: number;
  totalADMExcluido: number;
  qtdADMEncontrado: number;
  qtdADMElegivel: number;
  qtdADMExcluido: number;
  gruposExcluidos: {
    grupo: string;
    valor: number;
    quantidade: number;
  }[];
  lancamentosUsados: {
    dataRef: string | null;
    dataPagamento: string | null;
    produto: string | null;
    valor: number;
    statusTransacao: string | null;
    fazenda: string;
    tipoOperacao: string | null;
    contaOrigem: string | null;
    contaDestino: string | null;
    macroCusto: string | null;
  }[];
  fazendas: {
    fazendaId: string;
    fazendaNome: string;
    rebanhoMedio: number;
    percentual: number;
    valorRateado: number;
  }[];
  fazendasSemRebanho: string[];
}

/** Raw saldo/lancamento from DB for rebanho calc */
interface RawSaldo { fazenda_id: string; ano: number; categoria: string; quantidade: number }
interface RawLancPec { fazenda_id: string; data: string; tipo: string; quantidade: number; categoria: string; categoria_destino: string | null }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Paginated fetch — loads ALL rows from a query, bypassing the 1000-row default.
 * Same strategy used in useFluxoCaixa to guarantee data completeness.
 */
async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => ReturnType<ReturnType<typeof supabase.from>['select']>,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1) as { data: T[] | null };
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}

/** Map a V2 row to the FinanceiroLancamento interface for backward compatibility */
function mapV2ToLancamento(r: any): FinanceiroLancamento {
  return {
    id: r.id,
    fazenda_id: r.fazenda_id,
    importacao_id: r.lote_importacao_id || null,
    origem_dado: r.origem_lancamento || 'manual',
    data_realizacao: r.data_competencia,
    data_pagamento: r.data_pagamento,
    ano_mes: r.ano_mes,
    produto: r.descricao || null,
    fornecedor: null, // V2 uses favorecido_id (UUID)
    valor: r.valor,
    status_transacao: r.status_transacao,
    tipo_operacao: r.tipo_operacao,
    conta_origem: null, // V2 uses conta_bancaria_id
    conta_destino: null,
    macro_custo: r.macro_custo,
    grupo_custo: r.grupo_custo || null,
    centro_custo: r.centro_custo,
    subcentro: r.subcentro,
    numero_documento: r.numero_documento,
    cpf_cnpj: null,
    recorrencia: null,
    forma_pagamento: r.forma_pagamento,
    obs: r.observacao || null,
    escopo_negocio: r.escopo_negocio,
    sinal: r.sinal,
    favorecido_id: r.favorecido_id,
    conta_bancaria_id: r.conta_bancaria_id,
    descricao: r.descricao,
    observacao: r.observacao,
    origem_lancamento: r.origem_lancamento,
    lote_importacao_id: r.lote_importacao_id,
    cancelado: r.cancelado,
    editado_manual: r.editado_manual,
  };
}

/**
 * Desembolso produtivo — re-exportado da classificação centralizada.
 * macro_custo "Custeio Produtivo" OU "Investimento na Fazenda" + tipo_operacao 2-Saídas.
 */
export { isDesembolsoProdutivo, isReceita as isReceitaCentral } from '@/lib/financeiro/classificacao';
import { isDesembolsoProdutivo as isDesembolsoProdutivoCentral } from '@/lib/financeiro/classificacao';

export const isDesembolsoPecuaria = (l: FinanceiroLancamento) =>
  isDesembolsoProdutivoCentral(l) && (l.escopo_negocio || 'pecuaria') === 'pecuaria';

export const isReceita = (l: FinanceiroLancamento) => {
  const tipo = (l.tipo_operacao || '').toLowerCase();
  return tipo === 'receita' || tipo.startsWith('1');
};

const MACROS_RATEIO_ADM_PRODUTIVO = new Set([
  'custeio produtivo',
  'investimento na fazenda',
]);

/** Base ADM para avaliação de rateio */
const isADMBaseRateio = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase().trim() === 'realizado' &&
  (l.tipo_operacao || '').startsWith('2') &&
  !!l.data_realizacao;

/** Elegível no rateio ADM produtivo */
const isADMElegivelRateioProdutivo = (l: FinanceiroLancamento) => {
  if (!isADMBaseRateio(l)) return false;
  const macro = (l.macro_custo || '').toLowerCase().trim();
  return MACROS_RATEIO_ADM_PRODUTIVO.has(macro);
};

/** Extract YYYY-MM from a date string */
const dateToAnoMes = (dateStr: string | null | undefined): string | null => {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.substring(0, 7);
};

/** Data de referência do lançamento para rateio (Data_Ref = data_realizacao) */
const dataRefRateio = (l: FinanceiroLancamento): string | null =>
  dateToAnoMes(l.data_realizacao);

// Tipos de movimentação pecuária
const TIPOS_ENTRADA_PEC = new Set(['nascimento', 'compra', 'transferencia_entrada']);
const TIPOS_SAIDA_PEC = new Set(['abate', 'venda', 'transferencia_saida', 'consumo', 'morte']);

/** Calcula saldo total de uma fazenda até ano/mes usando dados raw do DB */
function calcSaldoFazendaRaw(
  saldos: RawSaldo[],
  lancs: RawLancPec[],
  fazendaId: string,
  ano: number,
  mes: number,
): number {
  const si = saldos
    .filter(s => s.fazenda_id === fazendaId && s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade, 0);

  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  const startDate = `${ano}-01-01`;

  let saldo = si;
  for (const l of lancs) {
    if (l.fazenda_id !== fazendaId) continue;
    if (l.data < startDate || l.data > endDate) continue;
    if (TIPOS_ENTRADA_PEC.has(l.tipo)) saldo += l.quantidade;
    else if (TIPOS_SAIDA_PEC.has(l.tipo)) saldo -= l.quantidade;
    // reclassificacao doesn't change total
  }
  return saldo;
}

/** Rebanho médio de uma fazenda num dado mês */
function calcRebanhoMedioFazenda(
  saldos: RawSaldo[],
  lancs: RawLancPec[],
  fazendaId: string,
  ano: number,
  mes: number,
): number {
  const saldoInicioMes = mes === 1
    ? saldos.filter(s => s.fazenda_id === fazendaId && s.ano === ano).reduce((sum, s) => sum + s.quantidade, 0)
    : calcSaldoFazendaRaw(saldos, lancs, fazendaId, ano, mes - 1);
  const saldoFimMes = calcSaldoFazendaRaw(saldos, lancs, fazendaId, ano, mes);
  return (saldoInicioMes + saldoFimMes) / 2;
}

/** Verifica se fazenda está ativa num dado mês. Default = true (sem registro = ativa) */
function isFazendaAtivaMes(statusMap: Map<string, boolean>, fazendaId: string, anoMes: string): boolean {
  const key = `${fazendaId}|${anoMes}`;
  const val = statusMap.get(key);
  return val === undefined ? true : val;
}

// Hook
// ---------------------------------------------------------------------------

export function useFinanceiro() {
  const { fazendaAtual, fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const isGlobal = fazendaId === '__global__';

  const [importacoes, setImportacoes] = useState<ImportacaoRecord[]>([]);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOficial[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancariaImportacao[]>([]);
  const [lancamentosADM, setLancamentosADM] = useState<FinanceiroLancamento[]>([]);
  const [rawSaldos, setRawSaldos] = useState<RawSaldo[]>([]);
  const [rawLancsPec, setRawLancsPec] = useState<RawLancPec[]>([]);
  const [loading, setLoading] = useState(false);

  // Status mensal de fazendas (ativa_no_mes) — chave: "fazendaId|anoMes" → boolean
  const [fazendaStatusMensal, setFazendaStatusMensal] = useState<Map<string, boolean>>(new Map());

  // Área produtiva por fazenda (hectares) — chave: fazendaId → area_produtiva
  const [areaProdutivaPorFazenda, setAreaProdutivaPorFazenda] = useState<Map<string, number>>(new Map());

  // Identify ADM fazenda and operational fazendas
  const fazendaADM = useMemo(
    () => fazendas.find(f => (f.codigo_importacao || '').toUpperCase() === 'ADM'),
    [fazendas],
  );

  const fazendasOperacionais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__' && f.id !== fazendaADM?.id),
    [fazendas, fazendaADM],
  );

  // Fazenda map for import resolution
  const fazendaMapForImport = useMemo(
    () => fazendas
      .filter(f => f.id !== '__global__' && f.codigo_importacao)
      .map(f => ({ id: f.id, nome: f.nome, codigo: f.codigo_importacao! })),
    [fazendas],
  );

  // --- Load data ---
  const loadData = useCallback(async () => {
    if (!fazendaId) {
      setImportacoes([]);
      setLancamentos([]);
      setCentrosCusto([]);
      setContasBancarias([]);
      setLancamentosADM([]);
      setRawSaldos([]);
      setRawLancsPec([]);
      return;
    }
    setLoading(true);
    try {
      const allFazendaIds = fazendas.filter(f => f.id !== '__global__').map(f => f.id);
      const opIds = fazendasOperacionais.map(f => f.id);

      if (isGlobal) {
        if (allFazendaIds.length === 0) {
          setLancamentos([]); setImportacoes([]); setCentrosCusto([]);
          setContasBancarias([]); setLancamentosADM([]); setRawSaldos([]); setRawLancsPec([]);
          setLoading(false);
          return;
        }

        const [allLancsRaw, ccResult, impResult, contasResult, saldoResult, lancPecResult, statusMensalResult] = await Promise.all([
          fetchAllPaginated<any>((from, to) =>
            (supabase.from('financeiro_lancamentos_v2').select('*') as any).eq('cliente_id', clienteId).eq('cancelado', false).order('data_competencia', { ascending: false }).range(from, to),
          ),
          supabase.from('financeiro_centros_custo').select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro').in('fazenda_id', allFazendaIds).eq('ativo', true),
          supabase.from('financeiro_importacoes_v2').select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro').eq('cliente_id', clienteId!).neq('status', 'cancelada').order('data_importacao', { ascending: false }),
          supabase.from('financeiro_contas_bancarias').select('id, fazenda_id, nome_conta, nome_exibicao, codigo_conta, banco, numero_conta, conta_digito').eq('cliente_id', clienteId!).eq('ativa', true),
          opIds.length > 0 ? supabase.from('saldos_iniciais').select('fazenda_id, ano, categoria, quantidade').in('fazenda_id', opIds) : Promise.resolve({ data: [] }),
          opIds.length > 0 ? supabase.from('lancamentos').select('fazenda_id, data, tipo, quantidade, categoria, categoria_destino').in('fazenda_id', opIds) : Promise.resolve({ data: [] }),
          clienteId ? supabase.from('fazenda_status_mensal').select('fazenda_id, ano_mes, ativa_no_mes').eq('cliente_id', clienteId) : Promise.resolve({ data: [] }),
        ]);
        const allLancs = allLancsRaw.map(mapV2ToLancamento);

        // Build status mensal map
        const statusMap = new Map<string, boolean>();
        for (const row of (statusMensalResult.data || []) as { fazenda_id: string; ano_mes: string; ativa_no_mes: boolean }[]) {
          statusMap.set(`${row.fazenda_id}|${row.ano_mes}`, row.ativa_no_mes);
        }
        setFazendaStatusMensal(statusMap);

        setLancamentos(allLancs);
        setCentrosCusto((ccResult.data as CentroCustoOficial[]) || []);
        setImportacoes((impResult.data as ImportacaoRecord[]) || []);
        setContasBancarias((contasResult.data as ContaBancariaImportacao[]) || []);
        setRawSaldos((saldoResult.data as RawSaldo[]) || []);
        setRawLancsPec((lancPecResult.data as RawLancPec[]) || []);

        if (fazendaADM) {
          setLancamentosADM(allLancs.filter(l => l.fazenda_id === fazendaADM.id));
        } else {
          setLancamentosADM([]);
        }
      } else {
        // Per-fazenda — use paginated fetch for lancamentos
        const needsRateio = fazendaADM && fazendaADM.id !== fazendaId;

        const lancPromise = fetchAllPaginated<any>((from, to) =>
          (supabase.from('financeiro_lancamentos_v2').select('*') as any).eq('fazenda_id', fazendaId).eq('cancelado', false).order('data_competencia', { ascending: false }).range(from, to),
        ).then(rows => rows.map(mapV2ToLancamento));

        const admPromise = needsRateio
          ? fetchAllPaginated<any>((from, to) =>
              (supabase.from('financeiro_lancamentos_v2').select('*') as any).eq('fazenda_id', fazendaADM.id).eq('cancelado', false).order('data_competencia', { ascending: false }).range(from, to),
            ).then(rows => rows.map(mapV2ToLancamento))
          : Promise.resolve([] as FinanceiroLancamento[]);

        const [lancData, ccResult, impResult, contasResult, admData, saldoResult, lancPecResult, statusMensalResult2] = await Promise.all([
          lancPromise,
          supabase.from('financeiro_centros_custo').select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro').eq('fazenda_id', fazendaId).eq('ativo', true),
          clienteId ? supabase.from('financeiro_importacoes_v2').select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro').eq('cliente_id', clienteId).neq('status', 'cancelada').order('data_importacao', { ascending: false }) : Promise.resolve({ data: [] }),
          clienteId ? supabase.from('financeiro_contas_bancarias').select('id, fazenda_id, nome_conta, nome_exibicao, codigo_conta, banco, numero_conta, conta_digito').eq('cliente_id', clienteId).eq('ativa', true) : Promise.resolve({ data: [] }),
          admPromise,
          needsRateio && opIds.length > 0
            ? supabase.from('saldos_iniciais').select('fazenda_id, ano, categoria, quantidade').in('fazenda_id', opIds)
            : Promise.resolve({ data: [] }),
          needsRateio && opIds.length > 0
            ? supabase.from('lancamentos').select('fazenda_id, data, tipo, quantidade, categoria, categoria_destino').in('fazenda_id', opIds)
            : Promise.resolve({ data: [] }),
          clienteId ? supabase.from('fazenda_status_mensal').select('fazenda_id, ano_mes, ativa_no_mes').eq('cliente_id', clienteId) : Promise.resolve({ data: [] }),
        ]);

        // Build status mensal map
        const statusMap2 = new Map<string, boolean>();
        for (const row of (statusMensalResult2.data || []) as { fazenda_id: string; ano_mes: string; ativa_no_mes: boolean }[]) {
          statusMap2.set(`${row.fazenda_id}|${row.ano_mes}`, row.ativa_no_mes);
        }
        setFazendaStatusMensal(statusMap2);

        setLancamentos(lancData);
        setCentrosCusto((ccResult.data as CentroCustoOficial[]) || []);
        setImportacoes((impResult.data as ImportacaoRecord[]) || []);
        setContasBancarias((contasResult.data as ContaBancariaImportacao[]) || []);

        if (needsRateio) {
          setLancamentosADM(admData);
          setRawSaldos((saldoResult.data as RawSaldo[]) || []);
          setRawLancsPec((lancPecResult.data as RawLancPec[]) || []);
        } else {
          setLancamentosADM([]);
          setRawSaldos([]);
          setRawLancsPec([]);
        }
      }
    } catch {
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [fazendaId, isGlobal, fazendas, fazendaADM, fazendasOperacionais]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Rebanho médio por fazenda por mês (para rateio ADM v2) ---
  const rebanhoMedioPorFazendaMes = useMemo(() => {
    if (!fazendaADM || rawSaldos.length === 0) return new Map<string, Map<string, number>>();

    // Collect all YYYY-MM from ADM lancamentos conciliados
    const mesesADM = new Set<string>();
    for (const l of lancamentosADM) {
      if (!isADMBaseRateio(l)) continue;
      const am = dataRefRateio(l);
      if (am) mesesADM.add(am);
    }

    const result = new Map<string, Map<string, number>>();
    for (const am of mesesADM) {
      const ano = Number(am.substring(0, 4));
      const mes = Number(am.substring(5, 7));
      const fazMap = new Map<string, number>();
      for (const f of fazendasOperacionais) {
        // Skip fazendas inativas no mês
        if (!isFazendaAtivaMes(fazendaStatusMensal, f.id, am)) continue;
        const rm = calcRebanhoMedioFazenda(rawSaldos, rawLancsPec, f.id, ano, mes);
        if (rm > 0) fazMap.set(f.id, rm);
      }
      result.set(am, fazMap);
    }
    return result;
  }, [fazendaADM, lancamentosADM, rawSaldos, rawLancsPec, fazendasOperacionais, fazendaStatusMensal]);

  // --- Rateio ADM (for current fazenda) ---
  const rateioADM = useMemo((): RateioADM[] => {
    if (isGlobal || !fazendaId || !fazendaADM || fazendaADM.id === fazendaId) return [];
    if (lancamentosADM.length === 0) return [];

    const admPorMes = new Map<string, number>();
    for (const l of lancamentosADM) {
      if (!isADMElegivelRateioProdutivo(l)) continue;
      const am = dataRefRateio(l);
      if (!am) continue;
      admPorMes.set(am, (admPorMes.get(am) || 0) + Math.abs(l.valor));
    }

    return Array.from(admPorMes.entries()).map(([anoMes, valorTotal]) => {
      const fazMap = rebanhoMedioPorFazendaMes.get(anoMes);
      if (!fazMap || fazMap.size === 0) return { anoMes, valorTotal, percentualFazenda: 0, valorRateado: 0 };

      const rebanhoFaz = fazMap.get(fazendaId) || 0;
      const rebanhoTotal = Array.from(fazMap.values()).reduce((s, v) => s + v, 0);
      const percentual = rebanhoTotal > 0 ? (rebanhoFaz / rebanhoTotal) * 100 : 0;

      return { anoMes, valorTotal, percentualFazenda: percentual, valorRateado: valorTotal * (percentual / 100) };
    });
  }, [isGlobal, fazendaId, fazendaADM, lancamentosADM, rebanhoMedioPorFazendaMes]);

  // --- Rateio ADM conferência (all fazendas) ---
  const rateioConferencia = useMemo((): RateioADMConferencia[] => {
    if (!fazendaADM || lancamentosADM.length === 0) return [];

    const admNomeFazenda = fazendaADM.nome;
    const admPorMes = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancamentosADM) {
      if (!isADMBaseRateio(l)) continue;
      const am = dataRefRateio(l);
      if (!am) continue;
      const arr = admPorMes.get(am) || [];
      arr.push(l);
      admPorMes.set(am, arr);
    }

    return Array.from(admPorMes.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([anoMes, lancs]) => {
        const lancsElegiveis = lancs.filter(isADMElegivelRateioProdutivo);

        const totalADMEncontrado = lancs.reduce((s, l) => s + Math.abs(l.valor), 0);
        const totalADMElegivel = lancsElegiveis.reduce((s, l) => s + Math.abs(l.valor), 0);
        const totalADMExcluido = totalADMEncontrado - totalADMElegivel;

        const gruposExcluidosMap = new Map<string, { valor: number; quantidade: number }>();
        for (const l of lancs) {
          if (isADMElegivelRateioProdutivo(l)) continue;
          const grupo = (l.macro_custo || 'Não informado').trim() || 'Não informado';
          const atual = gruposExcluidosMap.get(grupo) || { valor: 0, quantidade: 0 };
          gruposExcluidosMap.set(grupo, {
            valor: atual.valor + Math.abs(l.valor),
            quantidade: atual.quantidade + 1,
          });
        }

        const gruposExcluidos = Array.from(gruposExcluidosMap.entries())
          .map(([grupo, dados]) => ({ grupo, valor: dados.valor, quantidade: dados.quantidade }))
          .sort((a, b) => b.valor - a.valor);

        const fazMap = rebanhoMedioPorFazendaMes.get(anoMes);
        const rebanhoTotal = fazMap ? Array.from(fazMap.values()).reduce((s, v) => s + v, 0) : 0;

        // Apenas fazendas ativas no mês participam
        const fazendasAtivasMes = fazendasOperacionais.filter(f => isFazendaAtivaMes(fazendaStatusMensal, f.id, anoMes));

        const fazendasComRebanho = fazendasAtivasMes
          .filter(f => fazMap?.has(f.id) && (fazMap.get(f.id) || 0) > 0)
          .map(f => {
            const rm = fazMap!.get(f.id) || 0;
            const pct = rebanhoTotal > 0 ? (rm / rebanhoTotal) * 100 : 0;
            return { fazendaId: f.id, fazendaNome: f.nome, rebanhoMedio: rm, percentual: pct, valorRateado: totalADMElegivel * (pct / 100) };
          });

        // Alerta apenas para fazendas ATIVAS sem rebanho (inativas não geram alerta)
        const semRebanho = fazendasAtivasMes
          .filter(f => !fazMap?.has(f.id) || (fazMap.get(f.id) || 0) <= 0)
          .map(f => f.nome);

        return {
          anoMes,
          totalADMEncontrado,
          totalADMElegivel,
          totalADMExcluido,
          qtdADMEncontrado: lancs.length,
          qtdADMElegivel: lancsElegiveis.length,
          qtdADMExcluido: lancs.length - lancsElegiveis.length,
          gruposExcluidos,
          lancamentosUsados: lancsElegiveis.map(l => ({
            dataRef: l.data_realizacao,
            dataPagamento: l.data_pagamento,
            produto: l.produto,
            valor: Math.abs(l.valor),
            statusTransacao: l.status_transacao,
            fazenda: admNomeFazenda,
            tipoOperacao: l.tipo_operacao,
            contaOrigem: l.conta_origem,
            contaDestino: l.conta_destino,
            macroCusto: l.macro_custo,
          })),
          fazendas: fazendasComRebanho,
          fazendasSemRebanho: semRebanho,
        };
      });
  }, [fazendaADM, lancamentosADM, rebanhoMedioPorFazendaMes, fazendasOperacionais, fazendaStatusMensal]);

  // --- Fazendas sem rebanho (aviso) — apenas fazendas ATIVAS ---
  const fazendasSemRebanho = useMemo(() => {
    if (!fazendaADM || rebanhoMedioPorFazendaMes.size === 0) return [];
    const meses = Array.from(rebanhoMedioPorFazendaMes.keys()).sort();
    if (meses.length === 0) return [];
    const ultimoMes = meses[meses.length - 1];
    const fazMap = rebanhoMedioPorFazendaMes.get(ultimoMes);
    if (!fazMap) return [];
    return fazendasOperacionais
      .filter(f => isFazendaAtivaMes(fazendaStatusMensal, f.id, ultimoMes))
      .filter(f => !fazMap.has(f.id) || (fazMap.get(f.id) || 0) <= 0)
      .map(f => f.nome);
  }, [fazendasOperacionais, rebanhoMedioPorFazendaMes, fazendaADM, fazendaStatusMensal]);

  // --- Gerar hash robusto de deduplicação ---
  const normalizeImportText = (value: string | null | undefined) =>
    (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

  const resolveContaBancariaId = (
    contaLabel: string | null,
    fazendaId: string | null,
    contas: ContaBancariaImportacao[],
  ): string | null => {
    const normalized = normalizeImportText(contaLabel);
    if (!normalized) return null;

    // Build codigo_conta uniqueness map
    const codigoCount = new Map<string, number>();
    for (const c of contas) {
      if (c.codigo_conta) {
        const ck = normalizeImportText(c.codigo_conta);
        codigoCount.set(ck, (codigoCount.get(ck) || 0) + 1);
      }
    }

    const matchConta = (item: ContaBancariaImportacao): boolean => {
      // 1st: nome_exibicao (primary key)
      if (normalizeImportText(item.nome_exibicao) === normalized) return true;
      // 2nd: codigo_conta ONLY if unique
      if (item.codigo_conta) {
        const ck = normalizeImportText(item.codigo_conta);
        if (ck === normalized && (codigoCount.get(ck) || 0) <= 1) return true;
      }
      return false;
    };

    // Try fazenda-specific first
    const contasDaFazenda = contas.filter(c => c.fazenda_id === fazendaId);
    const contaFazenda = contasDaFazenda.find(matchConta);
    if (contaFazenda) return contaFazenda.id;

    // Fallback: all contas from any fazenda of same client
    const contaGlobal = contas.find(matchConta);
    return contaGlobal?.id || null;
  };

  /** Hash núcleo para detecção de duplicidade — alinhado com SQL */
  const buildHashImportacao = (
    clienteId: string, fazendaId: string,
    dataPagamento: string | null, valor: number,
    tipoOperacao: string | null, contaBancariaId: string | null,
    numeroDocumento?: string | null,
    descricao?: string | null,
    fornecedor?: string | null,
  ): string => {
    const parts = [
      clienteId,
      fazendaId,
      (dataPagamento || '').trim(),
      valor.toFixed(2),
      (tipoOperacao || '').trim().toLowerCase(),
      contaBancariaId || '',
      normalizeImportText(numeroDocumento),
      normalizeImportText(descricao),
      normalizeImportText(fornecedor),
    ];
    return parts.join('|');
  };

  type NivelDuplicidade = 'D1' | 'D2' | 'D3' | 'LEGITIMO';

  /** Classificação multinível — espelha SQL classificar_nivel_duplicidade */
  const classificarNivel = (
    newRow: { fornecedor?: string | null; descricao?: string | null; numeroDocumento?: string | null; subcentro?: string | null },
    existing: { fornecedor?: string | null; descricao?: string | null; numeroDocumento?: string | null; subcentro?: string | null },
  ): NivelDuplicidade => {
    let diffCount = 0;
    let docDiverge = false;

    if (normalizeImportText(newRow.fornecedor) !== normalizeImportText(existing.fornecedor)) diffCount++;
    if (normalizeImportText(newRow.descricao) !== normalizeImportText(existing.descricao)
        && (newRow.descricao || existing.descricao)) diffCount++;

    const newDoc = normalizeImportText(newRow.numeroDocumento);
    const exDoc = normalizeImportText(existing.numeroDocumento);
    if (newDoc && exDoc) {
      if (newDoc !== exDoc) { docDiverge = true; diffCount++; }
    }

    if (normalizeImportText(newRow.subcentro) !== normalizeImportText(existing.subcentro)
        && (newRow.subcentro || existing.subcentro)) diffCount++;

    if (diffCount === 0) return 'D1';
    if (diffCount === 1 && !docDiverge) return 'D2';
    if (diffCount <= 2) return 'D3';
    return 'LEGITIMO';
  };

  // --- Confirmar importação (incremental com dedup) ---
  const confirmarImportacao = useCallback(async (
    nomeArquivo: string,
    linhas: LinhaImportada[],
    totalLinhas: number,
    totalErros: number,
    saldosBancarios?: SaldoBancarioImportado[],
    _contas?: unknown[],
    resumoCaixa?: ResumoCaixaImportado[],
    tipoImportacao?: string,
  ): Promise<ImportResultado> => {
    const errosDetalhe: ImportErroDetalhe[] = [];
    if (!user) return { ok: false, totalProcessado: 0, totalSalvo: 0, totalDuplicado: 0, totalErro: 0, erros: [{ motivo: 'Usuário não autenticado' }] };

    try {
      const primaryFazendaId = linhas[0]?.fazendaId
        || saldosBancarios?.find(s => s.fazendaId)?.fazendaId
        || resumoCaixa?.find(r => r.fazendaId)?.fazendaId
        || fazendas.find(f => f.id !== '__global__')?.id;
      if (!primaryFazendaId) {
        toast.error('Nenhum registro com fazenda válida');
        return { ok: false, totalProcessado: linhas.length, totalSalvo: 0, totalDuplicado: 0, totalErro: linhas.length, erros: [{ motivo: 'Nenhum registro com fazenda válida' }] };
      }

      const cid = fazendas.find(f => f.id === primaryFazendaId)?.cliente_id || fazendaAtual?.cliente_id || '';

      // ── Determinar origem_dado baseado no tipo de importação ──
      const origemDado = tipoImportacao || 'importacao_incremental';

      const { data: contasData, error: contasError } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, fazenda_id, nome_conta, nome_exibicao, codigo_conta, banco, numero_conta, conta_digito')
        .eq('cliente_id', cid)
        .eq('ativa', true);

      if (contasError) throw contasError;

      const contasBancarias = (contasData || []) as ContaBancariaImportacao[];

      // ── Resolver contas bancárias (origem + destino) ──
      const errosContaTransf: string[] = [];
      const linhasResolvidas: LinhaImportadaResolvida[] = [];
      const linhasBloqueadas: { linha: LinhaImportada; motivo: string }[] = [];

      for (const linha of linhas) {
        const contaBancariaId = resolveContaBancariaId(linha.contaOrigem, linha.fazendaId, contasBancarias);
        const contaDestinoId = linha.contaDestino
          ? resolveContaBancariaId(linha.contaDestino, linha.fazendaId, contasBancarias)
          : null;

        const tipoNorm = (linha.tipoOperacao || '').toLowerCase();
        const ehTransf = tipoNorm.startsWith('3') || tipoNorm.includes('transfer') || tipoNorm.includes('resgate') || tipoNorm.includes('aplicaç');

        if (ehTransf) {
          if (!contaBancariaId) {
            linhasBloqueadas.push({ linha, motivo: `Conta origem "${linha.contaOrigem}" não reconhecida no cadastro` });
            continue;
          }
          if (!contaDestinoId) {
            linhasBloqueadas.push({ linha, motivo: `Conta destino "${linha.contaDestino}" não reconhecida no cadastro` });
            continue;
          }
          if (contaBancariaId === contaDestinoId) {
            linhasBloqueadas.push({ linha, motivo: `Conta origem e destino resolveram para a mesma conta: "${linha.contaOrigem}"` });
            continue;
          }
        }

        linhasResolvidas.push({ ...linha, contaBancariaId, contaDestinoId });
      }

      if (linhasBloqueadas.length > 0) {
        const bloqErros: ImportErroDetalhe[] = linhasBloqueadas.map(b => ({
          linha: b.linha.linha,
          descricao: b.linha.produto || undefined,
          valor: b.linha.valor,
          fornecedor: b.linha.fornecedor || undefined,
          motivo: b.motivo,
        }));
        return { ok: false, totalProcessado: linhas.length, totalSalvo: 0, totalDuplicado: 0, totalErro: linhasBloqueadas.length, erros: bloqErros };
      }
      const saldosResolvidos: SaldoImportadoResolvido[] = (saldosBancarios || []).map((saldo) => ({
        ...saldo,
        contaBancariaId: resolveContaBancariaId(saldo.contaBanco, saldo.fazendaId, contasBancarias),
      }));

      // ── DETECÇÃO DE DUPLICIDADE (classificação, NÃO bloqueio) ──
      // Regra: TODOS os lançamentos são inseridos. Suspeitos são marcados pelo trigger do banco.
      // Nenhum lançamento é descartado no frontend.
      const fazendaIds = [...new Set(linhasResolvidas.map(l => l.fazendaId).filter(Boolean))] as string[];
      // Store existing records keyed by nucleus hash → differentiator fields
      // This allows comparing import line vs actual existing record
      type ExistingDiff = { fornecedor: string | null; descricao: string | null; numeroDocumento: string | null; subcentro: string | null };
      const existingByHash = new Map<string, ExistingDiff[]>();

      for (const fid of fazendaIds) {
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data: existing } = await supabase
            .from('financeiro_lancamentos_v2')
            .select('data_pagamento, valor, tipo_operacao, conta_bancaria_id, numero_documento, descricao, favorecido_id, subcentro')
            .eq('fazenda_id', fid)
            .eq('cliente_id', cid)
            .eq('cancelado', false)
            .range(from, from + batchSize - 1);
          if (!existing || existing.length === 0) break;
          for (const e of existing) {
            const hash = buildHashImportacao(
              cid, fid,
              e.data_pagamento, e.valor,
              e.tipo_operacao, e.conta_bancaria_id,
              e.numero_documento, e.descricao,
            );
            const diffs: ExistingDiff = {
              fornecedor: e.favorecido_id || null,
              descricao: e.descricao,
              numeroDocumento: e.numero_documento,
              subcentro: e.subcentro,
            };
            const arr = existingByHash.get(hash);
            if (arr) arr.push(diffs);
            else existingByHash.set(hash, [diffs]);
          }
          if (existing.length < batchSize) break;
          from += batchSize;
        }
      }

      // Classificar duplicados para log, mas NÃO filtrar — todos seguem para insert
      // A classificação oficial final é feita pelo trigger no banco.
      // O frontend faz pré-classificação para o log usando o registro existente real.
      let duplicados = 0;
      const linhasDuplicadasLog: Array<LinhaImportadaResolvida & { _hash: string; _nivel: NivelDuplicidade }> = [];

      for (const l of linhasResolvidas) {
        const hash = buildHashImportacao(
          cid, l.fazendaId || '',
          l.dataPagamento || '', l.valor,
          l.tipoOperacao, l.contaBancariaId,
          l.numeroDocumento, l.produto,
          l.fornecedor,
        );
        const existingMatches = existingByHash.get(hash);
        if (existingMatches && existingMatches.length > 0) {
          // Compare against the actual existing record — pick strongest suspicion
          let bestNivel = 'LEGITIMO' as NivelDuplicidade;
          for (const ex of existingMatches) {
            const nivel = classificarNivel(
              { fornecedor: l.fornecedor, descricao: l.produto, numeroDocumento: l.numeroDocumento, subcentro: l.subcentro },
              { fornecedor: ex.fornecedor, descricao: ex.descricao, numeroDocumento: ex.numeroDocumento, subcentro: ex.subcentro },
            );
            const rank = { D1: 3, D2: 2, D3: 1, LEGITIMO: 0 } as const;
            if (rank[nivel] > rank[bestNivel]) bestNivel = nivel;
            if (bestNivel === 'D1') break;
          }
          duplicados++;
          linhasDuplicadasLog.push({ ...l, _hash: hash, _nivel: bestNivel });
        }
        // NÃO descarta — todos vão para inserção
      }

      // Log duplicates persistently for audit trail
      if (linhasDuplicadasLog.length > 0) {
        const dupLogs = linhasDuplicadasLog.map((l) => ({
          cliente_id: cid,
          fazenda_id: l.fazendaId || primaryFazendaId,
          hash_calculado: l._hash,
          nivel_duplicidade: l._nivel,
          motivo: `Importação ${nomeArquivo} — linha ${l.linha || '?'}`,
          dados_linha: {
            linha_excel: l.linha,
            ano_mes: l.anoMes,
            data_pagamento: l.dataPagamento,
            valor: l.valor,
            tipo_operacao: l.tipoOperacao,
            descricao: l.produto,
            fornecedor: l.fornecedor,
            numero_documento: l.numeroDocumento,
            subcentro: l.subcentro,
            conta_origem: l.contaOrigem,
            obs: l.obs,
          },
        }));
        for (let i = 0; i < dupLogs.length; i += 50) {
          await supabase.from('financeiro_duplicidade_log' as any).insert(dupLogs.slice(i, i + 50) as any);
        }
      }

      // ── Criar registro da importação (V2) ──
      const { data: imp, error: impErr } = await supabase
        .from('financeiro_importacoes_v2')
        .insert({
          fazenda_id: primaryFazendaId,
          cliente_id: cid,
          nome_arquivo: nomeArquivo,
          created_by: user.id,
          status: 'processada',
          total_linhas: totalLinhas,
          total_validas: 0,
          total_com_erro: totalErros,
        })
        .select('id')
        .single();

      if (impErr) throw impErr;
      console.log('[Importação] importacao_id gerado:', imp.id);

      // ── Inserir lançamentos novos no V2 ──
      const insertBatchSize = 50;
      const sinalFromTipo = (tipo: string | null) => (tipo || '').startsWith('1') ? 1 : -1;
      let inseridos = 0;
      let ignorados = duplicados;

      // ── Normalização JS de nomes de fornecedores ──
      const normalizeFornecedorName = (value: string): string =>
        value
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9 ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      // ── Resolver fornecedores (texto → UUID) com auto-criação ──
      // Load ALL fornecedores (active + inactive) for name resolution
      // Inactive suppliers must still be linked to preserve historical data
      const { data: fornecedoresData } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome, nome_normalizado')
        .eq('cliente_id', cid);

      const fornecedorMap = new Map<string, string>();
      // Also store original entries for fuzzy search
      const fornecedorEntries: Array<{ id: string; nome: string; normalizado: string }> = [];
      for (const f of (fornecedoresData || [])) {
        const norm = f.nome ? normalizeFornecedorName(f.nome) : '';
        // Index by DB-stored nome_normalizado
        if (f.nome_normalizado) fornecedorMap.set(f.nome_normalizado, f.id);
        // Index by JS-normalized name (handles accent differences)
        if (norm) fornecedorMap.set(norm, f.id);
        // Index by uppercase original name
        if (f.nome) fornecedorMap.set(f.nome.toUpperCase().trim(), f.id);
        if (f.nome && norm) fornecedorEntries.push({ id: f.id, nome: f.nome, normalizado: norm });
      }

      // ── Fuzzy matching helpers ──
      const extractWords = (s: string): string[] =>
        s.split(/\s+/).filter(w => w.length >= 3);

      const fuzzyMatchFornecedor = (nomeNorm: string): string | null => {
        const inputWords = extractWords(nomeNorm);
        if (inputWords.length === 0) return null;

        // Tier 1: ilike-style — one name contains the other
        for (const entry of fornecedorEntries) {
          if (entry.normalizado.includes(nomeNorm) || nomeNorm.includes(entry.normalizado)) {
            return entry.id;
          }
        }

        // Tier 2: first significant keyword match (first word with 4+ chars)
        const primaryKeyword = inputWords.find(w => w.length >= 4);
        if (primaryKeyword) {
          const candidates = fornecedorEntries.filter(e =>
            e.normalizado.includes(primaryKeyword)
          );
          if (candidates.length === 1) return candidates[0].id;
        }

        // Tier 3: multi-word overlap scoring (Jaccard-like)
        let bestMatch: { id: string; score: number } | null = null;
        for (const entry of fornecedorEntries) {
          const entryWords = extractWords(entry.normalizado);
          if (entryWords.length === 0) continue;
          const shared = inputWords.filter(w => entryWords.some(ew => ew.includes(w) || w.includes(ew)));
          const score = shared.length / Math.max(inputWords.length, entryWords.length);
          if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { id: entry.id, score };
          }
        }
        if (bestMatch) return bestMatch.id;

        return null;
      };

      const resolveOrCreateFornecedorId = async (
        nome: string | null,
        fazendaIdLinha: string | null,
      ): Promise<string | null> => {
        if (!nome || !nome.trim()) return null;
        const nomeOriginal = nome.trim();
        const nomeNormalizado = normalizeFornecedorName(nomeOriginal);
        if (!nomeNormalizado) return null;

        // 1. Exact match in local cache
        const existente = fornecedorMap.get(nomeNormalizado);
        if (existente) return existente;

        const existenteUpper = fornecedorMap.get(nomeOriginal.toUpperCase());
        if (existenteUpper) return existenteUpper;

        // 2. Fuzzy match in local cache
        const fuzzyId = fuzzyMatchFornecedor(nomeNormalizado);
        if (fuzzyId) {
          fornecedorMap.set(nomeNormalizado, fuzzyId);
          return fuzzyId;
        }

        // 3. Query DB with ilike as last resort before creating
        const { data: dbExisting } = await supabase
          .from('financeiro_fornecedores')
          .select('id')
          .eq('cliente_id', cid)
          .ilike('nome', `%${nomeOriginal}%`)
          .limit(1)
          .maybeSingle();

        if (dbExisting) {
          fornecedorMap.set(nomeNormalizado, dbExisting.id);
          return dbExisting.id;
        }

        // 4. Not found — create new supplier
        const fazIdParaCriar = fazendaIdLinha || fazendas[0]?.id;
        if (!fazIdParaCriar) return null;

        const { data, error } = await supabase
          .from('financeiro_fornecedores')
          .insert({
            cliente_id: cid,
            fazenda_id: fazIdParaCriar,
            nome: nomeOriginal,
            ativo: true,
          })
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') {
            // Concurrency: another row in the same batch just created it
            // Use ilike on nome (not nome_normalizado) to avoid normalization mismatch
            const { data: existing } = await supabase
              .from('financeiro_fornecedores')
              .select('id')
              .eq('cliente_id', cid)
              .ilike('nome', nomeOriginal)
              .limit(1)
              .maybeSingle();
            if (existing) {
              fornecedorMap.set(nomeNormalizado, existing.id);
              return existing.id;
            }
            console.warn(`[Importação] Fornecedor duplicado não localizado após conflito: ${nomeOriginal}`);
            return null;
          }
          throw new Error(`Erro ao criar fornecedor automaticamente: ${nomeOriginal} — ${error.message}`);
        }

        fornecedorMap.set(nomeNormalizado, data.id);
        return data.id;
      };

      // ── Expand transfers into paired records (debit + credit) ──
      const expandedRows: Array<{
        fazenda_id: string; cliente_id: string; lote_importacao_id: string;
        origem_lancamento: string; data_competencia: string; data_pagamento: string | null;
        ano_mes: string; conta_bancaria_id: string | null; conta_destino_id?: string | null; descricao: string | null;
        valor: number; sinal: number; status_transacao: string | null;
        tipo_operacao: string; macro_custo: string | null; centro_custo: string | null;
        subcentro: string | null; observacao: string | null; escopo_negocio: string;
        created_by: string; transferencia_grupo_id: string | null;
        favorecido_id?: string | null;
      }> = [];

      for (const l of linhasResolvidas) {
        const tipoNorm = (l.tipoOperacao || '').toLowerCase();
        const ehTransf = tipoNorm.startsWith('3') || tipoNorm.includes('transfer') || tipoNorm.includes('resgate') || tipoNorm.includes('aplicaç');
        const clienteIdLinha = fazendas.find(f => f.id === l.fazendaId)?.cliente_id || cid;
        const baseRow = {
          fazenda_id: l.fazendaId!,
          cliente_id: clienteIdLinha,
          lote_importacao_id: imp.id,
          origem_lancamento: origemDado,
          data_competencia: l.dataPagamento || l.anoMes + '-01',
          data_pagamento: l.dataPagamento,
          ano_mes: l.anoMes,
          descricao: l.produto,
          valor: l.valor,
          status_transacao: (l.statusTransacao || '').toLowerCase().trim() || null,
          tipo_operacao: l.tipoOperacao || '2 - Saídas',
          macro_custo: l.macroCusto,
          centro_custo: l.centroCusto,
          subcentro: l.subcentro,
          observacao: l.obs,
          escopo_negocio: l.escopoNegocio,
          numero_documento: l.numeroDocumento || null,
          tipo_documento: l.tipoDocumento || null,
          favorecido_id: await resolveOrCreateFornecedorId(l.fornecedor, l.fazendaId),
          hash_importacao: gerarHashImportacao(l.dataPagamento, l.valor, l.fornecedor, l.contaBancariaId, l.numeroDocumento),
          created_by: user.id,
          sem_movimentacao_caixa: false,
        };

        if (ehTransf && l.contaDestinoId) {
          // Generate a shared group ID for the pair
          const grupoId = crypto.randomUUID();
          // Debit from origin (sinal = -1): conta_bancaria_id = origin
          expandedRows.push({
            ...baseRow,
            conta_bancaria_id: l.contaBancariaId,
            conta_destino_id: l.contaDestinoId,
            sinal: -1,
            transferencia_grupo_id: grupoId,
          });
        } else {
          const rowSinal = sinalFromTipo(l.tipoOperacao);
          const isEntry = rowSinal === 1;
          expandedRows.push({
            ...baseRow,
            // Directional: entries → conta_destino_id, exits → conta_bancaria_id
            conta_bancaria_id: isEntry ? null : l.contaBancariaId,
            conta_destino_id: isEntry ? l.contaBancariaId : null,
            sinal: rowSinal,
            transferencia_grupo_id: null,
          });
        }
      }

      for (let i = 0; i < expandedRows.length; i += insertBatchSize) {
        const batch = expandedRows.slice(i, i + insertBatchSize);
        const { error } = await supabase.from('financeiro_lancamentos_v2').insert(batch);
        if (!error) {
          inseridos += batch.length;
          continue;
        }

        if (error.code !== '23505') {
          // Non-dedup error on batch — try row-by-row to isolate failures
          for (const row of batch) {
            const { error: rowError } = await supabase.from('financeiro_lancamentos_v2').insert(row);
            if (!rowError) { inseridos += 1; continue; }
            errosDetalhe.push({
              descricao: row.descricao || undefined,
              valor: row.valor,
              motivo: rowError.message || `Erro ${rowError.code}`,
            });
          }
          continue;
        }

        for (const row of batch) {
          const { error: rowError } = await supabase.from('financeiro_lancamentos_v2').insert(row);
          if (!rowError) {
            inseridos += 1;
            continue;
          }
          if (rowError.code === '23505') {
            ignorados += 1;
            continue;
          }
          errosDetalhe.push({
            descricao: row.descricao || undefined,
            valor: row.valor,
            motivo: rowError.message || `Erro ${rowError.code}`,
          });
        }
      }

      const totalValid = inseridos + saldosResolvidos.length + (resumoCaixa?.length || 0);
      const { error: updateImportacaoError } = await supabase
        .from('financeiro_importacoes_v2')
        .update({ total_validas: totalValid })
        .eq('id', imp.id);
      if (updateImportacaoError) throw updateImportacaoError;

      // ── Saldos bancários legado (upsert, não apaga) ──
      if (saldosResolvidos.length > 0) {
        const saldoBatch = saldosResolvidos.map(s => ({
          fazenda_id: s.fazendaId || primaryFazendaId,
          cliente_id: fazendas.find(f => f.id === (s.fazendaId || primaryFazendaId))?.cliente_id || cid,
          conta_banco: s.contaBanco,
          ano_mes: s.anoMes,
          saldo_final: s.saldoFinal,
        }));
        console.log('[Importação] saldoBatch payload:', JSON.stringify(saldoBatch, null, 2));
        const { error } = await supabase.from('financeiro_saldos_bancarios').upsert(saldoBatch, {
          onConflict: 'fazenda_id,conta_banco,ano_mes',
        });
        if (error) {
          console.error('[Importação] Erro ao salvar saldos bancários:', error);
          throw error;
        }
      }

      // ── Resumo caixa (upsert, não apaga) ──
      if (resumoCaixa && resumoCaixa.length > 0) {
        const resumoBatch = resumoCaixa.map(r => ({
          fazenda_id: r.fazendaId || primaryFazendaId,
          cliente_id: fazendas.find(f => f.id === (r.fazendaId || primaryFazendaId))?.cliente_id || cid,
          ano_mes: r.anoMes,
          entradas: r.entradas,
          saidas: r.saidas,
          saldo_final_total: r.saldoFinalTotal,
        }));
        console.log('[Importação] resumoCaixa payload:', JSON.stringify(resumoBatch, null, 2));
        const { error } = await supabase.from('financeiro_resumo_caixa').upsert(resumoBatch, {
          onConflict: 'fazenda_id,ano_mes',
        });
        if (error) {
          console.error('[Importação] Erro ao salvar resumo caixa:', error);
          throw error;
        }
      }

      const msgs: string[] = [`${inseridos} lançamentos inseridos`];
      if (ignorados > 0) msgs.push(`${ignorados} duplicados ignorados`);
      if (errosDetalhe.length > 0) msgs.push(`${errosDetalhe.length} com erro`);
      if (saldosResolvidos.length) msgs.push(`${saldosResolvidos.length} saldos`);
      if (resumoCaixa?.length) msgs.push(`${resumoCaixa.length} resumos`);

      if (errosDetalhe.length > 0) {
        toast.warning(`Importação parcial: ${msgs.join(' · ')}`);
      } else {
        toast.success(`Importação concluída: ${msgs.join(' · ')}`);
      }

      await loadData();
      return {
        ok: errosDetalhe.length === 0,
        totalProcessado: expandedRows.length,
        totalSalvo: inseridos,
        totalDuplicado: ignorados,
        totalErro: errosDetalhe.length,
        erros: errosDetalhe,
      };
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || err));
      return {
        ok: false,
        totalProcessado: linhas.length,
        totalSalvo: 0,
        totalDuplicado: 0,
        totalErro: 1,
        erros: [{ motivo: err.message || String(err) }],
      };
    }
  }, [user, loadData, fazendas]);

  // --- Buscar detalhes do lote para confirmação ---
  const buscarDetalhesLote = useCallback(async (importacaoId: string) => {
    const { data, error } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, ano_mes, fazenda_id, cancelado')
      .eq('lote_importacao_id', importacaoId);
    if (error || !data) return null;

    const ativos = data.filter(r => !r.cancelado);
    const periodos = [...new Set(ativos.map(r => r.ano_mes))].sort();
    const fazendaIds = [...new Set(ativos.map(r => r.fazenda_id))];
    return { total: ativos.length, periodos, fazendaIds };
  }, []);

  // --- Cancelar importação completa (force, por lote) ---
  const excluirImportacao = useCallback(async (importacaoId: string) => {
    try {
      // 1. Cancel all lancamentos of this lote
      const { error: lancErr } = await supabase
        .from('financeiro_lancamentos_v2')
        .update({
          cancelado: true,
          cancelado_em: new Date().toISOString(),
        } as any)
        .eq('lote_importacao_id', importacaoId)
        .eq('cancelado', false);
      if (lancErr) throw lancErr;

      // 2. Mark importacao as cancelled
      const { error: impErr } = await supabase
        .from('financeiro_importacoes_v2')
        .update({
          status: 'cancelada',
          cancelada_em: new Date().toISOString(),
        } as any)
        .eq('id', importacaoId);
      if (impErr) throw impErr;

      toast.success('Importação removida com sucesso');
      await loadData();
      return true;
    } catch (err: any) {
      toast.error('Erro ao excluir importação: ' + (err.message || err));
      return false;
    }
  }, [loadData]);

  // --- Indicadores ---
  const indicadores = useMemo(() => {
    if (lancamentos.length === 0) return null;

    const byAnoMes = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancamentos) {
      const arr = byAnoMes.get(l.ano_mes) || [];
      arr.push(l);
      byAnoMes.set(l.ano_mes, arr);
    }

    const mesesOrdenados = Array.from(byAnoMes.keys()).sort();

    const resumoMensal = mesesOrdenados.map(am => {
      const lancs = byAnoMes.get(am)!;
      const entradas = lancs.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);
      const saidas = lancs.filter(l => !isReceita(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
      const desembolsoProd = lancs.filter(isDesembolsoProdutivoCentral).reduce((s, l) => s + Math.abs(l.valor), 0);
      const desembolsoPec = lancs.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);

      const rateioMes = rateioADM.find(r => r.anoMes === am);
      const rateioValor = rateioMes?.valorRateado || 0;

      return { anoMes: am, entradas, saidas: saidas + rateioValor, desembolsoProd: desembolsoProd + rateioValor, desembolsoPec: desembolsoPec + rateioValor, rateioADM: rateioValor };
    });

    const porMacro = new Map<string, number>();
    for (const l of lancamentos) {
      if (!isDesembolsoProdutivoCentral(l) || !l.macro_custo) continue;
      porMacro.set(l.macro_custo, (porMacro.get(l.macro_custo) || 0) + Math.abs(l.valor));
    }

    const totalDesembolsoProd = lancamentos.filter(isDesembolsoProdutivoCentral).reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalDesembolsoPec = lancamentos.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalReceitas = lancamentos.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalRateio = rateioADM.reduce((s, r) => s + r.valorRateado, 0);

    if (totalRateio > 0) {
      porMacro.set('ADM (Rateio)', (porMacro.get('ADM (Rateio)') || 0) + totalRateio);
    }

    return {
      resumoMensal,
      totalDesembolsoProd: totalDesembolsoProd + totalRateio,
      totalDesembolsoPec: totalDesembolsoPec + totalRateio,
      totalReceitas,
      totalRateioADM: totalRateio,
      porMacro: Array.from(porMacro.entries()).map(([k, v]) => ({ nome: k, valor: v })).sort((a, b) => b.valor - a.valor),
      porGrupo: [] as { nome: string; valor: number }[],
      porCentro: [] as { nome: string; valor: number }[],
    };
  }, [lancamentos, rateioADM]);

  return {
    importacoes, lancamentos, centrosCusto, contasBancarias, indicadores,
    rateioADM, rateioConferencia, fazendasSemRebanho,
    fazendaMapForImport, loading, confirmarImportacao, excluirImportacao, buscarDetalhesLote,
    reloadData: loadData, isGlobal, fazendaADM,
    totalLancamentosADM: lancamentosADM.length,
  };
}
