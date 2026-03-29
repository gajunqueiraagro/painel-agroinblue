/**
 * Hook central do módulo financeiro.
 * Gerencia importações, lançamentos financeiros, indicadores e rateio ADM.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RATEIO ADM v2 — Critério: REBANHO MÉDIO do período
 * ═══════════════════════════════════════════════════════════════════════
 * Regras:
 * - Modo global: soma todos os lançamentos originais (incluindo ADM), sem rateio.
 * - Modo por fazenda: lançamentos da fazenda + parcela rateada dos custos ADM
 *   proporcional ao rebanho médio.
 * - Somente lançamentos ADM com status_transacao = "conciliado" entram no rateio.
 * - O período do rateio usa data_pagamento (não data_realizacao nem ano_mes).
 * - Desembolso produtivo = macro_custo "Custeio Produtivo" + tipo_operacao 2-Saídas.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { LinhaImportada, SaldoBancarioImportado, ResumoCaixaImportado, CentroCustoOficial } from '@/lib/financeiro/importParser';

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
  nota_fiscal: string | null;
  cpf_cnpj: string | null;
  recorrencia: string | null;
  forma_pagamento: string | null;
  obs: string | null;
  escopo_negocio: string | null;
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
  (l.status_transacao || '').toLowerCase().trim() === 'conciliado' &&
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFinanceiro() {
  const { fazendaAtual, fazendas } = useFazenda();
  const { user } = useAuth();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';

  const [importacoes, setImportacoes] = useState<ImportacaoRecord[]>([]);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOficial[]>([]);
  const [lancamentosADM, setLancamentosADM] = useState<FinanceiroLancamento[]>([]);
  const [rawSaldos, setRawSaldos] = useState<RawSaldo[]>([]);
  const [rawLancsPec, setRawLancsPec] = useState<RawLancPec[]>([]);
  const [loading, setLoading] = useState(false);

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
          setLancamentosADM([]); setRawSaldos([]); setRawLancsPec([]);
          setLoading(false);
          return;
        }

        const [allLancs, ccResult, impResult, saldoResult, lancPecResult] = await Promise.all([
          fetchAllPaginated<FinanceiroLancamento>((from, to) =>
            (supabase.from('financeiro_lancamentos').select('*') as any).in('fazenda_id', allFazendaIds).order('data_realizacao', { ascending: false }).range(from, to),
          ),
          supabase.from('financeiro_centros_custo').select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro').in('fazenda_id', allFazendaIds).eq('ativo', true),
          supabase.from('financeiro_importacoes').select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro').in('fazenda_id', allFazendaIds).order('data_importacao', { ascending: false }),
          opIds.length > 0 ? supabase.from('saldos_iniciais').select('fazenda_id, ano, categoria, quantidade').in('fazenda_id', opIds) : Promise.resolve({ data: [] }),
          opIds.length > 0 ? supabase.from('lancamentos').select('fazenda_id, data, tipo, quantidade, categoria, categoria_destino').in('fazenda_id', opIds) : Promise.resolve({ data: [] }),
        ]);

        setLancamentos(allLancs);
        setCentrosCusto((ccResult.data as CentroCustoOficial[]) || []);
        setImportacoes((impResult.data as ImportacaoRecord[]) || []);
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

        const lancPromise = fetchAllPaginated<FinanceiroLancamento>((from, to) =>
          (supabase.from('financeiro_lancamentos').select('*') as any).eq('fazenda_id', fazendaId).order('data_realizacao', { ascending: false }).range(from, to),
        );

        const admPromise = needsRateio
          ? fetchAllPaginated<FinanceiroLancamento>((from, to) =>
              (supabase.from('financeiro_lancamentos').select('*') as any).eq('fazenda_id', fazendaADM.id).order('data_realizacao', { ascending: false }).range(from, to),
            )
          : Promise.resolve([] as FinanceiroLancamento[]);

        const [lancData, ccResult, impResult, admData, saldoResult, lancPecResult] = await Promise.all([
          lancPromise,
          supabase.from('financeiro_centros_custo').select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro').eq('fazenda_id', fazendaId).eq('ativo', true),
          supabase.from('financeiro_importacoes').select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro').in('fazenda_id', allFazendaIds).order('data_importacao', { ascending: false }),
          admPromise,
          needsRateio && opIds.length > 0
            ? supabase.from('saldos_iniciais').select('fazenda_id, ano, categoria, quantidade').in('fazenda_id', opIds)
            : Promise.resolve({ data: [] }),
          needsRateio && opIds.length > 0
            ? supabase.from('lancamentos').select('fazenda_id, data, tipo, quantidade, categoria, categoria_destino').in('fazenda_id', opIds)
            : Promise.resolve({ data: [] }),
        ]);

        setLancamentos(lancData);
        setCentrosCusto((ccResult.data as CentroCustoOficial[]) || []);
        setImportacoes((impResult.data as ImportacaoRecord[]) || []);

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
        const rm = calcRebanhoMedioFazenda(rawSaldos, rawLancsPec, f.id, ano, mes);
        if (rm > 0) fazMap.set(f.id, rm);
      }
      result.set(am, fazMap);
    }
    return result;
  }, [fazendaADM, lancamentosADM, rawSaldos, rawLancsPec, fazendasOperacionais]);

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

        const fazendasComRebanho = fazendasOperacionais
          .filter(f => fazMap?.has(f.id) && (fazMap.get(f.id) || 0) > 0)
          .map(f => {
            const rm = fazMap!.get(f.id) || 0;
            const pct = rebanhoTotal > 0 ? (rm / rebanhoTotal) * 100 : 0;
            return { fazendaId: f.id, fazendaNome: f.nome, rebanhoMedio: rm, percentual: pct, valorRateado: totalADMElegivel * (pct / 100) };
          });

        const semRebanho = fazendasOperacionais
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
  }, [fazendaADM, lancamentosADM, rebanhoMedioPorFazendaMes, fazendasOperacionais]);

  // --- Fazendas sem rebanho (aviso) ---
  const fazendasSemRebanho = useMemo(() => {
    if (!fazendaADM || rebanhoMedioPorFazendaMes.size === 0) return [];
    const meses = Array.from(rebanhoMedioPorFazendaMes.keys()).sort();
    if (meses.length === 0) return [];
    const fazMap = rebanhoMedioPorFazendaMes.get(meses[meses.length - 1]);
    if (!fazMap) return [];
    return fazendasOperacionais
      .filter(f => !fazMap.has(f.id) || (fazMap.get(f.id) || 0) <= 0)
      .map(f => f.nome);
  }, [fazendasOperacionais, rebanhoMedioPorFazendaMes, fazendaADM]);

  // --- Confirmar importação ---
  const confirmarImportacao = useCallback(async (
    nomeArquivo: string,
    linhas: LinhaImportada[],
    totalLinhas: number,
    totalErros: number,
    saldosBancarios?: SaldoBancarioImportado[],
    _contas?: unknown[],
    resumoCaixa?: ResumoCaixaImportado[],
  ) => {
    if (!user) return false;

    try {
      const primaryFazendaId = linhas[0]?.fazendaId
        || saldosBancarios?.find(s => s.fazendaId)?.fazendaId
        || resumoCaixa?.find(r => r.fazendaId)?.fazendaId
        || fazendas.find(f => f.id !== '__global__')?.id;
      if (!primaryFazendaId) {
        toast.error('Nenhum registro com fazenda válida');
        return false;
      }

      const totalValid = linhas.length + (saldosBancarios?.length || 0) + (resumoCaixa?.length || 0);

      const clienteId = fazendas.find(f => f.id === primaryFazendaId)?.cliente_id || fazendaAtual?.cliente_id || '';

      const { data: imp, error: impErr } = await supabase
        .from('financeiro_importacoes')
        .insert({
          fazenda_id: primaryFazendaId,
          cliente_id: clienteId,
          nome_arquivo: nomeArquivo,
          usuario_id: user.id,
          status: 'processada',
          total_linhas: totalLinhas,
          total_validas: totalValid,
          total_com_erro: totalErros,
        })
        .select('id')
        .single();

      if (impErr) throw impErr;

      const batchSize = 50;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize).map(l => ({
          fazenda_id: l.fazendaId!,
          cliente_id: fazendas.find(f => f.id === l.fazendaId)?.cliente_id || clienteId,
          importacao_id: imp.id,
          origem_dado: 'import_excel',
          data_realizacao: l.dataPagamento || l.anoMes + '-01',
          data_pagamento: l.dataPagamento,
          ano_mes: l.anoMes,
          produto: l.produto,
          fornecedor: l.fornecedor,
          valor: l.valor,
          status_transacao: l.statusTransacao,
          tipo_operacao: l.tipoOperacao,
          conta_origem: l.contaOrigem,
          conta_destino: l.contaDestino,
          macro_custo: l.macroCusto,
          grupo_custo: l.grupoCusto,
          centro_custo: l.centroCusto,
          subcentro: l.subcentro,
          obs: l.obs,
          escopo_negocio: l.escopoNegocio,
        }));
        const { error } = await supabase.from('financeiro_lancamentos').insert(batch);
        if (error) throw error;
      }

      if (saldosBancarios && saldosBancarios.length > 0) {
        const saldoBatch = saldosBancarios.map(s => ({
          fazenda_id: s.fazendaId || primaryFazendaId,
          cliente_id: fazendas.find(f => f.id === (s.fazendaId || primaryFazendaId))?.cliente_id || clienteId,
          importacao_id: imp.id,
          conta_banco: s.contaBanco,
          ano_mes: s.anoMes,
          saldo_final: s.saldoFinal,
        }));
        const { error } = await supabase.from('financeiro_saldos_bancarios').upsert(saldoBatch, {
          onConflict: 'fazenda_id,conta_banco,ano_mes',
        });
        if (error) throw error;
      }

      if (resumoCaixa && resumoCaixa.length > 0) {
        const resumoBatch = resumoCaixa.map(r => ({
          fazenda_id: r.fazendaId || primaryFazendaId,
          cliente_id: fazendas.find(f => f.id === (r.fazendaId || primaryFazendaId))?.cliente_id || clienteId,
          importacao_id: imp.id,
          ano_mes: r.anoMes,
          entradas: r.entradas,
          saidas: r.saidas,
          saldo_final_total: r.saldoFinalTotal,
        }));
        const { error } = await supabase.from('financeiro_resumo_caixa').upsert(resumoBatch, {
          onConflict: 'fazenda_id,ano_mes',
        });
        if (error) throw error;
      }

      toast.success(`Importação concluída: ${linhas.length} lançamentos + ${(saldosBancarios?.length || 0)} saldos + ${(resumoCaixa?.length || 0)} resumos`);
      await loadData();
      return true;
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || err));
      return false;
    }
  }, [user, loadData, fazendas]);

  // --- Excluir importação ---
  const excluirImportacao = useCallback(async (importacaoId: string) => {
    try {
      const deletes = await Promise.all([
        supabase.from('financeiro_lancamentos').delete().eq('importacao_id', importacaoId),
        supabase.from('financeiro_saldos_bancarios').delete().eq('importacao_id', importacaoId),
        supabase.from('financeiro_resumo_caixa').delete().eq('importacao_id', importacaoId),
      ]);
      for (const { error } of deletes) { if (error) throw error; }

      const { error: delImp } = await supabase
        .from('financeiro_importacoes')
        .delete()
        .eq('id', importacaoId);
      if (delImp) throw delImp;

      toast.success('Importação excluída com sucesso');
      await loadData();
      return true;
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || err));
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
    importacoes, lancamentos, centrosCusto, indicadores,
    rateioADM, rateioConferencia, fazendasSemRebanho,
    fazendaMapForImport, loading, confirmarImportacao, excluirImportacao,
    reloadData: loadData, isGlobal, fazendaADM,
    totalLancamentosADM: lancamentosADM.length,
  };
}
