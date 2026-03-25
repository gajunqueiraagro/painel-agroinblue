/**
 * Hook central do módulo financeiro.
 * Gerencia importações, lançamentos financeiros, indicadores e rateio ADM.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RATEIO ADM v1
 * ═══════════════════════════════════════════════════════════════════════
 * Critério único: área produtiva (ha) de fazenda_cadastros.
 *
 * Regras:
 * - Modo global: soma todos os lançamentos originais (incluindo ADM), sem rateio.
 * - Modo por fazenda: lançamentos da fazenda + parcela rateada dos custos ADM
 *   proporcional à área produtiva.
 * - Somente lançamentos ADM com status_transacao = "conciliado" entram no rateio.
 * - O período do rateio usa data_pagamento (não data_realizacao nem ano_mes).
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
  totalADMConciliado: number;
  lancamentosUsados: {
    dataPagamento: string | null;
    produto: string | null;
    valor: number;
    statusTransacao: string | null;
    fazenda: string;
    tipoOperacao: string | null;
    contaOrigem: string | null;
    contaDestino: string | null;
  }[];
  fazendas: {
    fazendaId: string;
    fazendaNome: string;
    areaProdutiva: number;
    percentual: number;
    valorRateado: number;
  }[];
  fazendasSemArea: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Macro-custos que NÃO entram no desembolso produtivo.
 * Apenas "Custeio Produtivo" entra; todo o resto é excluído.
 */
const MACRO_CUSTO_EXCLUIDOS = new Set([
  'investimento na fazenda',
  'investimento em bovinos',
  'amortizações financeiras',
  'dividendos',
  'outras entradas financeiras',
  'receitas',
  'dedução de receitas',
]);

export const isDesembolsoProdutivo = (l: FinanceiroLancamento) => {
  const macro = (l.macro_custo || '').toLowerCase().trim();
  // Se macro_custo não preenchido, mantém comportamento legado (inclui)
  if (!macro) {
    const escopo = (l.escopo_negocio || '').toLowerCase();
    const tipo = (l.tipo_operacao || '').toLowerCase();
    if (escopo === 'financeiro') return false;
    if (tipo === 'receita') return false;
    return true;
  }
  // Com macro_custo preenchido: só entra "Custeio Produtivo"
  return macro === 'custeio produtivo';
};

export const isDesembolsoPecuaria = (l: FinanceiroLancamento) =>
  isDesembolsoProdutivo(l) && (l.escopo_negocio || 'pecuaria') === 'pecuaria';

export const isReceita = (l: FinanceiroLancamento) => {
  const tipo = (l.tipo_operacao || '').toLowerCase();
  return tipo === 'receita' || l.valor < 0;
};

/** Check if ADM lancamento qualifies for rateio:
 *  - Status Transação = Conciliado
 *  - Tipo Operação = 2-Saídas
 *  - macro_custo = "Custeio Produtivo" (only operational costs)
 */
const isADMConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'conciliado' &&
  (l.tipo_operacao || '').toLowerCase().startsWith('2') &&
  (l.macro_custo || '').toLowerCase().trim() === 'custeio produtivo';

/** Extract YYYY-MM from a date string (YYYY-MM-DD) */
const dateToAnoMes = (dateStr: string | null): string | null => {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.substring(0, 7);
};

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
  const [areaFazendas, setAreaFazendas] = useState<Map<string, number>>(new Map());
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
      setAreaFazendas(new Map());
      return;
    }
    setLoading(true);
    try {
      // Always load importacoes across all fazendas (import is global)
      const allFazendaIds = fazendas.filter(f => f.id !== '__global__').map(f => f.id);

      if (isGlobal) {
        if (allFazendaIds.length === 0) {
          setLancamentos([]);
          setImportacoes([]);
          setCentrosCusto([]);
          setLancamentosADM([]);
          setAreaFazendas(new Map());
          setLoading(false);
          return;
        }

        const promises: PromiseLike<any>[] = [
          supabase
            .from('financeiro_lancamentos')
            .select('*')
            .in('fazenda_id', allFazendaIds)
            .order('data_realizacao', { ascending: false }),
          supabase
            .from('financeiro_centros_custo')
            .select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro')
            .in('fazenda_id', allFazendaIds)
            .eq('ativo', true),
          supabase
            .from('financeiro_importacoes')
            .select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro')
            .in('fazenda_id', allFazendaIds)
            .order('data_importacao', { ascending: false }),
        ];

        const opIds = fazendasOperacionais.map(f => f.id);
        if (opIds.length > 0) {
          promises.push(
            supabase
              .from('fazenda_cadastros')
              .select('fazenda_id, area_produtiva')
              .in('fazenda_id', opIds),
          );
        }

        const results = await Promise.all(promises);
        setLancamentos((results[0].data as FinanceiroLancamento[]) || []);
        setCentrosCusto((results[1].data as CentroCustoOficial[]) || []);
        setImportacoes((results[2].data as ImportacaoRecord[]) || []);

        // In global, ADM lancamentos are already in lancamentos — extract for conference
        if (fazendaADM) {
          const allLancs = (results[0].data as FinanceiroLancamento[]) || [];
          setLancamentosADM(allLancs.filter(l => l.fazenda_id === fazendaADM.id));
        } else {
          setLancamentosADM([]);
        }

        const areaMap = new Map<string, number>();
        if (results[3]?.data) {
          for (const row of results[3].data as { fazenda_id: string; area_produtiva: number | null }[]) {
            if (row.area_produtiva && row.area_produtiva > 0) {
              areaMap.set(row.fazenda_id, row.area_produtiva);
            }
          }
        }
        setAreaFazendas(areaMap);
      } else {
        // Per-fazenda: own lancamentos + ADM for rateio + global importacoes
        const promises: PromiseLike<any>[] = [
          supabase
            .from('financeiro_lancamentos')
            .select('*')
            .eq('fazenda_id', fazendaId)
            .order('data_realizacao', { ascending: false }),
          supabase
            .from('financeiro_centros_custo')
            .select('tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro')
            .eq('fazenda_id', fazendaId)
            .eq('ativo', true),
          supabase
            .from('financeiro_importacoes')
            .select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro')
            .in('fazenda_id', allFazendaIds)
            .order('data_importacao', { ascending: false }),
        ];

        const needsRateio = fazendaADM && fazendaADM.id !== fazendaId;
        if (needsRateio) {
          promises.push(
            supabase
              .from('financeiro_lancamentos')
              .select('*')
              .eq('fazenda_id', fazendaADM.id)
              .order('data_realizacao', { ascending: false }),
          );
          const opIds = fazendasOperacionais.map(f => f.id);
          if (opIds.length > 0) {
            promises.push(
              supabase
                .from('fazenda_cadastros')
                .select('fazenda_id, area_produtiva')
                .in('fazenda_id', opIds),
            );
          }
        }

        const results = await Promise.all(promises);

        setLancamentos((results[0].data as FinanceiroLancamento[]) || []);
        setCentrosCusto((results[1].data as CentroCustoOficial[]) || []);
        setImportacoes((results[2].data as ImportacaoRecord[]) || []);

        if (needsRateio) {
          setLancamentosADM((results[3]?.data as FinanceiroLancamento[]) || []);
          const areaMap = new Map<string, number>();
          if (results[4]?.data) {
            for (const row of results[4].data as { fazenda_id: string; area_produtiva: number | null }[]) {
              if (row.area_produtiva && row.area_produtiva > 0) {
                areaMap.set(row.fazenda_id, row.area_produtiva);
              }
            }
          }
          setAreaFazendas(areaMap);
        } else {
          setLancamentosADM([]);
          setAreaFazendas(new Map());
        }
      }
    } catch {
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [fazendaId, isGlobal, fazendas, fazendaADM, fazendasOperacionais]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Fazendas sem área produtiva ---
  const fazendasSemArea = useMemo(() => {
    if (!fazendaADM) return [];
    return fazendasOperacionais
      .filter(f => !areaFazendas.has(f.id) || (areaFazendas.get(f.id) || 0) <= 0)
      .map(f => f.nome);
  }, [fazendasOperacionais, areaFazendas, fazendaADM]);

  // --- Rateio ADM (for current fazenda) ---
  const rateioADM = useMemo((): RateioADM[] => {
    if (isGlobal || !fazendaId || !fazendaADM || fazendaADM.id === fazendaId) return [];
    if (lancamentosADM.length === 0 || areaFazendas.size === 0) return [];

    const areaAtual = areaFazendas.get(fazendaId) || 0;
    const areaTotal = Array.from(areaFazendas.values()).reduce((s, v) => s + v, 0);
    if (areaTotal === 0 || areaAtual === 0) return [];

    const percentual = (areaAtual / areaTotal) * 100;

    // Group ADM conciliado costs by data_pagamento → YYYY-MM
    const admPorMes = new Map<string, number>();
    for (const l of lancamentosADM) {
      if (!isADMConciliado(l)) continue;
      const am = dateToAnoMes(l.data_pagamento);
      if (!am) continue;
      const v = Math.abs(l.valor);
      admPorMes.set(am, (admPorMes.get(am) || 0) + v);
    }

    return Array.from(admPorMes.entries()).map(([anoMes, valorTotal]) => ({
      anoMes,
      valorTotal,
      percentualFazenda: percentual,
      valorRateado: valorTotal * (percentual / 100),
    }));
  }, [isGlobal, fazendaId, fazendaADM, lancamentosADM, areaFazendas]);

  // --- Rateio ADM conferência (all fazendas, for review view) ---
  const rateioConferencia = useMemo((): RateioADMConferencia[] => {
    if (!fazendaADM || lancamentosADM.length === 0) return [];

    const areaTotal = Array.from(areaFazendas.values()).reduce((s, v) => s + v, 0);
    const admNomeFazenda = fazendaADM.nome;

    // Group ADM conciliado by data_pagamento → YYYY-MM
    const admPorMes = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancamentosADM) {
      if (!isADMConciliado(l)) continue;
      const am = dateToAnoMes(l.data_pagamento);
      if (!am) continue;
      const arr = admPorMes.get(am) || [];
      arr.push(l);
      admPorMes.set(am, arr);
    }

    const semArea = fazendasOperacionais
      .filter(f => !areaFazendas.has(f.id) || (areaFazendas.get(f.id) || 0) <= 0)
      .map(f => f.nome);

    return Array.from(admPorMes.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([anoMes, lancs]) => {
        const totalADM = lancs.reduce((s, l) => s + Math.abs(l.valor), 0);
        return {
          anoMes,
          totalADMConciliado: totalADM,
          lancamentosUsados: lancs.map(l => ({
            dataPagamento: l.data_pagamento,
            produto: l.produto,
            valor: Math.abs(l.valor),
            statusTransacao: l.status_transacao,
            fazenda: admNomeFazenda,
            tipoOperacao: l.tipo_operacao,
            contaOrigem: l.conta_origem,
            contaDestino: l.conta_destino,
          })),
          fazendas: fazendasOperacionais
            .filter(f => areaFazendas.has(f.id) && (areaFazendas.get(f.id) || 0) > 0)
            .map(f => {
              const area = areaFazendas.get(f.id) || 0;
              const pct = areaTotal > 0 ? (area / areaTotal) * 100 : 0;
              return {
                fazendaId: f.id,
                fazendaNome: f.nome,
                areaProdutiva: area,
                percentual: pct,
                valorRateado: totalADM * (pct / 100),
              };
            }),
          fazendasSemArea: semArea,
        };
      });
  }, [fazendaADM, lancamentosADM, areaFazendas, fazendasOperacionais]);

  // --- Confirmar importação (aba única EXPORT_APP_UNICO) ---
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
      const primaryFazendaId = linhas[0]?.fazendaId;
      if (!primaryFazendaId) {
        toast.error('Nenhuma linha com fazenda válida');
        return false;
      }

      const totalValid = linhas.length + (saldosBancarios?.length || 0) + (contasImportadas?.length || 0) + (resumoCaixa?.length || 0);

      const { data: imp, error: impErr } = await supabase
        .from('financeiro_importacoes')
        .insert({
          fazenda_id: primaryFazendaId,
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

      // Insert lancamentos
      const batchSize = 50;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize).map(l => ({
          fazenda_id: l.fazendaId!,
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

      // Insert saldos bancarios
      if (saldosBancarios && saldosBancarios.length > 0) {
        const saldoBatch = saldosBancarios.map(s => ({
          fazenda_id: primaryFazendaId,
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

      // Insert/update contas
      if (contasImportadas && contasImportadas.length > 0) {
        for (const c of contasImportadas) {
          const { error } = await supabase.from('financeiro_contas').upsert({
            fazenda_id: primaryFazendaId,
            nome_conta: c.contaId,
            banco: c.banco,
            instrumento: c.instrumento,
            agencia_conta: c.agenciaConta,
            uso: c.uso,
            tipo: c.instrumento,
          }, { onConflict: 'id' });
          if (error) console.warn('Conta upsert warning:', error.message);
        }
      }

      // Insert resumo caixa
      if (resumoCaixa && resumoCaixa.length > 0) {
        const resumoBatch = resumoCaixa.map(r => ({
          fazenda_id: primaryFazendaId,
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
  }, [user, loadData]);

  // --- Excluir importação ---
  const excluirImportacao = useCallback(async (importacaoId: string) => {
    try {
      // Delete all related data
      const deletes = await Promise.all([
        supabase.from('financeiro_lancamentos').delete().eq('importacao_id', importacaoId),
        supabase.from('financeiro_saldos_bancarios').delete().eq('importacao_id', importacaoId),
        supabase.from('financeiro_resumo_caixa').delete().eq('importacao_id', importacaoId),
      ]);
      for (const { error } of deletes) { if (error) throw error; }

      // Delete import record
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
      const desembolsoProd = lancs.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
      const desembolsoPec = lancs.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);

      const rateioMes = rateioADM.find(r => r.anoMes === am);
      const rateioValor = rateioMes?.valorRateado || 0;

      return {
        anoMes: am,
        entradas,
        saidas: saidas + rateioValor,
        desembolsoProd: desembolsoProd + rateioValor,
        desembolsoPec: desembolsoPec + rateioValor,
        rateioADM: rateioValor,
      };
    });

    const porMacro = new Map<string, number>();
    for (const l of lancamentos) {
      if (!isDesembolsoProdutivo(l) || !l.macro_custo) continue;
      porMacro.set(l.macro_custo, (porMacro.get(l.macro_custo) || 0) + Math.abs(l.valor));
    }

    const totalDesembolsoProd = lancamentos.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
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
    importacoes,
    lancamentos,
    centrosCusto,
    indicadores,
    rateioADM,
    rateioConferencia,
    fazendasSemArea,
    fazendaMapForImport,
    loading,
    confirmarImportacao,
    excluirImportacao,
    reloadData: loadData,
    isGlobal,
    fazendaADM,
  };
}
