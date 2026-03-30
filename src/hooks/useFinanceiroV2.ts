/**
 * Hook for financeiro_lancamentos_v2 CRUD with pagination and filters.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface LancamentoV2 {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  conta_bancaria_id: string | null;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  sinal: number;
  tipo_operacao: string;
  status_transacao: string | null;
  descricao: string | null;
  macro_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  escopo_negocio: string | null;
  observacao: string | null;
  ano_mes: string;
  documento: string | null;
  historico: string | null;
  nota_fiscal: string | null;
  favorecido_id: string | null;
  origem_lancamento: string;
  forma_pagamento: string | null;
  dados_pagamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface LancamentoV2Form {
  fazenda_id: string;
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null; // For transfers
  data_competencia: string;
  data_pagamento?: string | null;
  valor: number;
  tipo_operacao: string;
  status_transacao?: string;
  descricao?: string;
  macro_custo?: string;
  centro_custo?: string;
  subcentro?: string;
  escopo_negocio?: string;
  observacao?: string;
  nota_fiscal?: string | null;
  favorecido_id?: string | null;
}

export interface ContaBancariaV2 {
  id: string;
  nome_conta: string;
  banco: string | null;
  fazenda_id: string;
  tipo_conta: string | null;
  codigo_conta: string | null;
  nome_exibicao: string | null;
}

export interface FornecedorV2 {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
}

export interface FiltrosV2 {
  fazenda_id?: string;
  ano?: string;
  mes?: string;           // single month or 'todos'
  meses?: string[];       // multi-month select
  conta_bancaria_id?: string;
  tipo_operacao?: string;
  status_transacao?: string;
  macro_custo?: string;
  centro_custo?: string;
  subcentro?: string;
}

export interface ClassificacaoItem {
  subcentro: string;
  centro_custo: string;
  macro_custo: string;
  tipo_operacao: string;
}

const PAGE_SIZE = 50;

export function useFinanceiroV2() {
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id;

  const [lancamentos, setLancamentos] = useState<LancamentoV2[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancariaV2[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorV2[]>([]);
  const [classificacoes, setClassificacoes] = useState<ClassificacaoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const loadContas = useCallback(async () => {
    if (!clienteId) return;
    const { data } = await supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, banco, fazenda_id, tipo_conta, codigo_conta, nome_exibicao')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao');
    setContasBancarias((data as ContaBancariaV2[]) || []);
  }, [clienteId]);

  const loadFornecedores = useCallback(async () => {
    if (!clienteId) return;
    const { data } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, cpf_cnpj, fazenda_id')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .order('nome');
    setFornecedores((data as FornecedorV2[]) || []);
  }, [clienteId]);

  const criarFornecedor = useCallback(async (nome: string, fazendaId: string, cpfCnpj?: string) => {
    if (!clienteId) return null;
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, fazenda_id: fazendaId, nome, cpf_cnpj: cpfCnpj || null })
      .select('id, nome, cpf_cnpj, fazenda_id')
      .single();
    if (error) {
      toast.error('Erro ao criar fornecedor');
      console.error(error);
      return null;
    }
    setFornecedores(prev => [...prev, data as FornecedorV2]);
    toast.success('Fornecedor criado');
    return data as FornecedorV2;
  }, [clienteId]);

  const loadClassificacoes = useCallback(async () => {
    if (!clienteId) return;
    const { data } = await supabase
      .from('financeiro_plano_contas')
      .select('subcentro, centro_custo, macro_custo, tipo_operacao')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .not('subcentro', 'is', null)
      .order('ordem_exibicao');

    const items: ClassificacaoItem[] = [];
    for (const row of (data || []) as any[]) {
      if (!row.subcentro) continue;
      items.push({
        subcentro: row.subcentro,
        centro_custo: row.centro_custo || '',
        macro_custo: row.macro_custo || '',
        tipo_operacao: row.tipo_operacao || '',
      });
    }
    setClassificacoes(items);
  }, [clienteId]);

  const loadLancamentos = useCallback(async (filtros: FiltrosV2, pageNum: number = 0) => {
    if (!clienteId) return;
    if (!filtros.ano) {
      setLancamentos([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('financeiro_lancamentos_v2')
        .select('*', { count: 'exact' })
        .eq('cliente_id', clienteId);

      if (filtros.fazenda_id) {
        query = query.eq('fazenda_id', filtros.fazenda_id);
      }

      // Multi-month support
      if (filtros.meses && filtros.meses.length > 0 && !filtros.meses.includes('todos')) {
        const anoMeses = filtros.meses.map(m => `${filtros.ano}-${m.padStart(2, '0')}`);
        query = query.in('ano_mes', anoMeses);
      } else if (filtros.mes && filtros.mes !== 'todos') {
        query = query.eq('ano_mes', `${filtros.ano}-${filtros.mes.padStart(2, '0')}`);
      } else {
        query = query.gte('ano_mes', `${filtros.ano}-01`).lte('ano_mes', `${filtros.ano}-12`);
      }

      if (filtros.conta_bancaria_id) query = query.eq('conta_bancaria_id', filtros.conta_bancaria_id);
      if (filtros.tipo_operacao) query = query.eq('tipo_operacao', filtros.tipo_operacao);
      if (filtros.status_transacao) query = query.eq('status_transacao', filtros.status_transacao);
      if (filtros.macro_custo) query = query.eq('macro_custo', filtros.macro_custo);
      if (filtros.centro_custo) query = query.eq('centro_custo', filtros.centro_custo);
      if (filtros.subcentro) query = query.eq('subcentro', filtros.subcentro);

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await query
        .order('data_pagamento', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setLancamentos((data as LancamentoV2[]) || []);
      setTotal(count || 0);
      setPage(pageNum);
    } catch (err: any) {
      toast.error('Erro ao carregar lançamentos v2');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  const buildInsertRow = (form: LancamentoV2Form, userId: string) => {
    const anoMes = form.data_pagamento
      ? form.data_pagamento.substring(0, 7)
      : form.data_competencia.substring(0, 7);
    const sinal = (form.tipo_operacao || '').startsWith('1') ? 1 : -1;

    return {
      cliente_id: clienteId!,
      fazenda_id: form.fazenda_id,
      conta_bancaria_id: form.conta_bancaria_id || null,
      data_competencia: form.data_competencia,
      data_pagamento: form.data_pagamento || null,
      valor: form.valor,
      sinal,
      tipo_operacao: form.tipo_operacao,
      status_transacao: form.status_transacao || 'previsto',
      descricao: form.descricao || null,
      macro_custo: form.macro_custo || null,
      centro_custo: form.centro_custo || null,
      subcentro: form.subcentro || null,
      escopo_negocio: form.escopo_negocio || null,
      observacao: form.observacao || null,
      nota_fiscal: form.nota_fiscal || null,
      favorecido_id: form.favorecido_id || null,
      ano_mes: anoMes,
      origem_lancamento: 'manual',
      created_by: userId,
    };
  };

  const criarLancamento = useCallback(async (form: LancamentoV2Form) => {
    if (!clienteId || !user) return false;

    const row = buildInsertRow(form, user.id);
    const { error } = await supabase.from('financeiro_lancamentos_v2').insert(row);

    if (error) {
      toast.error('Erro ao criar lançamento');
      console.error(error);
      return false;
    }
    toast.success('Lançamento criado');
    return true;
  }, [clienteId, user]);

  const editarLancamento = useCallback(async (id: string, form: LancamentoV2Form) => {
    if (!clienteId || !user) return false;

    const anoMes = form.data_pagamento
      ? form.data_pagamento.substring(0, 7)
      : form.data_competencia.substring(0, 7);
    const sinal = (form.tipo_operacao || '').startsWith('1') ? 1 : -1;

    const { error } = await supabase.from('financeiro_lancamentos_v2').update({
      fazenda_id: form.fazenda_id,
      conta_bancaria_id: form.conta_bancaria_id || null,
      data_competencia: form.data_competencia,
      data_pagamento: form.data_pagamento || null,
      valor: form.valor,
      sinal,
      tipo_operacao: form.tipo_operacao,
      status_transacao: form.status_transacao || 'previsto',
      descricao: form.descricao || null,
      macro_custo: form.macro_custo || null,
      centro_custo: form.centro_custo || null,
      subcentro: form.subcentro || null,
      escopo_negocio: form.escopo_negocio || null,
      observacao: form.observacao || null,
      nota_fiscal: form.nota_fiscal || null,
      favorecido_id: form.favorecido_id || null,
      ano_mes: anoMes,
      updated_by: user.id,
    }).eq('id', id);

    if (error) {
      toast.error('Erro ao editar lançamento');
      console.error(error);
      return false;
    }
    toast.success('Lançamento atualizado');
    return true;
  }, [clienteId, user]);

  const excluirLancamento = useCallback(async (id: string) => {
    const { error } = await supabase.from('financeiro_lancamentos_v2').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir lançamento');
      return false;
    }
    toast.success('Lançamento excluído');
    return true;
  }, []);

  const duplicarLancamento = useCallback(async (lanc: LancamentoV2) => {
    if (!clienteId || !user) return false;

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
      cliente_id: clienteId,
      fazenda_id: lanc.fazenda_id,
      conta_bancaria_id: lanc.conta_bancaria_id,
      data_competencia: lanc.data_competencia,
      data_pagamento: lanc.data_pagamento,
      valor: lanc.valor,
      sinal: lanc.sinal,
      tipo_operacao: lanc.tipo_operacao,
      status_transacao: 'previsto',
      descricao: lanc.descricao ? `(Cópia) ${lanc.descricao}` : '(Cópia)',
      macro_custo: lanc.macro_custo,
      centro_custo: lanc.centro_custo,
      subcentro: lanc.subcentro,
      escopo_negocio: lanc.escopo_negocio,
      observacao: lanc.observacao,
      nota_fiscal: lanc.nota_fiscal,
      favorecido_id: lanc.favorecido_id,
      ano_mes: lanc.ano_mes,
      origem_lancamento: 'manual',
      created_by: user.id,
    });

    if (error) {
      toast.error('Erro ao duplicar lançamento');
      return false;
    }
    toast.success('Lançamento duplicado');
    return true;
  }, [clienteId, user]);

  const criarLancamentosEmLote = useCallback(async (forms: LancamentoV2Form[]) => {
    if (!clienteId || !user || forms.length === 0) return false;

    const rows = forms.map(form => buildInsertRow(form, user.id));

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert(rows);

    if (error) {
      toast.error(`Erro ao salvar lote: ${error.message}`);
      console.error(error);
      return false;
    }
    toast.success(`${forms.length} lançamentos salvos`);
    return true;
  }, [clienteId, user]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    lancamentos,
    contasBancarias,
    fornecedores,
    classificacoes,
    loading,
    total,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    loadContas,
    loadFornecedores,
    loadClassificacoes,
    criarFornecedor,
    loadLancamentos,
    criarLancamento,
    criarLancamentosEmLote,
    editarLancamento,
    excluirLancamento,
    duplicarLancamento,
    setPage,
  };
}
