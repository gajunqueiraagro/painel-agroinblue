/**
 * Hook central do módulo financeiro.
 * Gerencia importações, lançamentos financeiros e indicadores.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { LinhaImportada, CentroCustoOficial } from '@/lib/financeiro/importParser';

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFinanceiro() {
  const { fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';

  const [importacoes, setImportacoes] = useState<ImportacaoRecord[]>([]);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOficial[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Load data ---
  const loadData = useCallback(async () => {
    if (!fazendaId || isGlobal) {
      setImportacoes([]);
      setLancamentos([]);
      setCentrosCusto([]);
      return;
    }
    setLoading(true);
    try {
      const [impRes, lancRes, ccRes] = await Promise.all([
        supabase
          .from('financeiro_importacoes')
          .select('id, nome_arquivo, data_importacao, status, total_linhas, total_validas, total_com_erro')
          .eq('fazenda_id', fazendaId)
          .order('data_importacao', { ascending: false }),
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
      ]);

      setImportacoes((impRes.data as ImportacaoRecord[]) || []);
      setLancamentos((lancRes.data as FinanceiroLancamento[]) || []);
      setCentrosCusto((ccRes.data as CentroCustoOficial[]) || []);
    } catch {
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  }, [fazendaId, isGlobal]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Confirmar importação ---
  const confirmarImportacao = useCallback(async (
    nomeArquivo: string,
    linhas: LinhaImportada[],
    totalLinhas: number,
    totalErros: number,
  ) => {
    if (!fazendaId || !user) return false;

    try {
      // 1. Create import record
      const { data: imp, error: impErr } = await supabase
        .from('financeiro_importacoes')
        .insert({
          fazenda_id: fazendaId,
          nome_arquivo: nomeArquivo,
          usuario_id: user.id,
          status: 'processada',
          total_linhas: totalLinhas,
          total_validas: linhas.length,
          total_com_erro: totalErros,
        })
        .select('id')
        .single();

      if (impErr) throw impErr;

      // 2. Insert lançamentos in batches of 50
      const batchSize = 50;
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize).map(l => ({
          fazenda_id: fazendaId,
          importacao_id: imp.id,
          origem_dado: 'import_excel',
          data_realizacao: l.dataRealizacao,
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
          nota_fiscal: l.notaFiscal,
          cpf_cnpj: l.cpfCnpj,
          recorrencia: l.recorrencia,
          forma_pagamento: l.formaPagamento,
          obs: l.obs,
          escopo_negocio: l.escopoNegocio,
        }));

        const { error } = await supabase.from('financeiro_lancamentos').insert(batch);
        if (error) throw error;
      }

      toast.success(`${linhas.length} lançamentos importados com sucesso`);
      await loadData();
      return true;
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || err));
      return false;
    }
  }, [fazendaId, user, loadData]);

  // --- Indicadores ---
  const indicadores = useMemo(() => {
    if (lancamentos.length === 0) return null;

    const byAnoMes = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancamentos) {
      const arr = byAnoMes.get(l.ano_mes) || [];
      arr.push(l);
      byAnoMes.set(l.ano_mes, arr);
    }

    // Desembolso produtivo: custos operacionais (excl. financeiro puro)
    const isDesembolsoProdutivo = (l: FinanceiroLancamento) => {
      const tipo = (l.tipo_operacao || '').toLowerCase();
      const escopo = (l.escopo_negocio || '').toLowerCase();
      // Exclui operações puramente financeiras (empréstimos, juros, aplicações)
      if (escopo === 'financeiro') return false;
      if (tipo === 'receita') return false;
      // Inclui custos e investimentos operacionais
      return true;
    };

    const isDesembolsoPecuaria = (l: FinanceiroLancamento) => {
      return isDesembolsoProdutivo(l) && (l.escopo_negocio || 'pecuaria') === 'pecuaria';
    };

    const isReceita = (l: FinanceiroLancamento) => {
      const tipo = (l.tipo_operacao || '').toLowerCase();
      return tipo === 'receita' || l.valor < 0;
    };

    // Total por mês
    const mesesOrdenados = Array.from(byAnoMes.keys()).sort();

    const resumoMensal = mesesOrdenados.map(am => {
      const lancs = byAnoMes.get(am)!;
      const entradas = lancs.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);
      const saidas = lancs.filter(l => !isReceita(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
      const desembolsoProd = lancs.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
      const desembolsoPec = lancs.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);
      return { anoMes: am, entradas, saidas, desembolsoProd, desembolsoPec };
    });

    // Hierarquia de custos
    const porMacro = new Map<string, number>();
    const porGrupo = new Map<string, number>();
    const porCentro = new Map<string, number>();

    for (const l of lancamentos) {
      if (!isDesembolsoProdutivo(l)) continue;
      const v = Math.abs(l.valor);
      if (l.macro_custo) porMacro.set(l.macro_custo, (porMacro.get(l.macro_custo) || 0) + v);
      if (l.grupo_custo) {
        const key = `${l.macro_custo} > ${l.grupo_custo}`;
        porGrupo.set(key, (porGrupo.get(key) || 0) + v);
      }
      if (l.centro_custo) {
        const key = `${l.macro_custo} > ${l.grupo_custo} > ${l.centro_custo}`;
        porCentro.set(key, (porCentro.get(key) || 0) + v);
      }
    }

    const totalDesembolsoProd = lancamentos.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalDesembolsoPec = lancamentos.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalReceitas = lancamentos.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);

    return {
      resumoMensal,
      totalDesembolsoProd,
      totalDesembolsoPec,
      totalReceitas,
      porMacro: Array.from(porMacro.entries()).map(([k, v]) => ({ nome: k, valor: v })).sort((a, b) => b.valor - a.valor),
      porGrupo: Array.from(porGrupo.entries()).map(([k, v]) => ({ nome: k, valor: v })).sort((a, b) => b.valor - a.valor),
      porCentro: Array.from(porCentro.entries()).map(([k, v]) => ({ nome: k, valor: v })).sort((a, b) => b.valor - a.valor),
    };
  }, [lancamentos]);

  return {
    importacoes,
    lancamentos,
    centrosCusto,
    indicadores,
    loading,
    confirmarImportacao,
    reloadData: loadData,
  };
}
