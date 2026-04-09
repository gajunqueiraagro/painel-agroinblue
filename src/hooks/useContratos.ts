import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface Contrato {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  fornecedor_id: string | null;
  produto: string | null;
  valor: number;
  frequencia: string;
  data_inicio: string;
  data_fim: string | null;
  dia_pagamento: number;
  forma_pagamento: string | null;
  dados_pagamento: string | null;
  conta_bancaria_id: string | null;
  subcentro: string | null;
  centro_custo: string | null;
  macro_custo: string | null;
  observacao: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ContratoForm {
  fazenda_id: string;
  fornecedor_id?: string | null;
  produto?: string;
  valor: number;
  frequencia?: string;
  data_inicio: string;
  data_fim?: string | null;
  dia_pagamento: number;
  forma_pagamento?: string | null;
  dados_pagamento?: string | null;
  conta_bancaria_id?: string | null;
  subcentro?: string | null;
  centro_custo?: string | null;
  macro_custo?: string | null;
  observacao?: string | null;
  status?: string;
}


function addMonthsClamped(dateStr: string, months: number, dayTarget: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayTarget, lastDay));
  return d.toISOString().slice(0, 10);
}

export function useContratos() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContratos = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const query = supabase
      .from('financeiro_contratos' as any)
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('created_at', { ascending: false });

    if (fazendaAtual && fazendaAtual.id !== '__global__') {
      query.eq('fazenda_id', fazendaAtual.id);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar contratos');
      console.error(error);
    } else {
      setContratos((data as any[] || []) as Contrato[]);
    }
    setLoading(false);
  }, [clienteAtual?.id, fazendaAtual?.id]);

  useEffect(() => {
    fetchContratos();
  }, [fetchContratos]);

  const criarContrato = useCallback(async (form: ContratoForm): Promise<boolean> => {
    if (!clienteAtual?.id) return false;

    const row = {
      cliente_id: clienteAtual.id,
      fazenda_id: form.fazenda_id,
      fornecedor_id: form.fornecedor_id || null,
      produto: form.produto || null,
      valor: form.valor,
      frequencia: form.frequencia || 'mensal',
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      dia_pagamento: form.dia_pagamento,
      forma_pagamento: form.forma_pagamento || null,
      dados_pagamento: form.dados_pagamento || null,
      conta_bancaria_id: form.conta_bancaria_id || null,
      subcentro: form.subcentro || null,
      centro_custo: form.centro_custo || null,
      macro_custo: form.macro_custo || null,
      observacao: form.observacao || null,
      status: form.status || 'ativo',
    };

    const { data, error } = await supabase
      .from('financeiro_contratos' as any)
      .insert(row as any)
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar contrato');
      console.error(error);
      return false;
    }

    const contrato = data as any as Contrato;

    // Generate lancamentos
    const generated = await gerarLancamentos(contrato);
    toast.success(`Contrato criado com ${generated} lançamentos gerados`);
    await fetchContratos();
    return true;
  }, [clienteAtual?.id, fetchContratos]);

  const editarContrato = useCallback(async (id: string, form: Partial<ContratoForm>, atualizarFuturos: boolean): Promise<boolean> => {
    const { data: contratoAtualRaw, error: contratoAtualError } = await supabase
      .from('financeiro_contratos' as any)
      .select('*')
      .eq('id', id)
      .single();

    const contratoAtual = contratoAtualRaw as unknown as Contrato | null;

    if (contratoAtualError || !contratoAtual) {
      toast.error('Erro ao localizar contrato atual');
      console.error(contratoAtualError);
      return false;
    }

    const { error } = await supabase
      .from('financeiro_contratos' as any)
      .update(form as any)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar contrato');
      console.error(error);
      return false;
    }

    if (atualizarFuturos) {
      const today = new Date().toISOString().slice(0, 10);

      // Delete future lancamentos linked by contrato_id (single source of truth)
      const { error: deleteError, count: deleted } = await (supabase
        .from('financeiro_lancamentos_v2') as any)
        .delete()
        .select('id', { count: 'exact', head: true })
        .eq('contrato_id', id)
        .gte('data_competencia', today);

      if (deleteError) {
        toast.error('Erro ao limpar lançamentos futuros do contrato');
        console.error(deleteError);
        return false;
      }

      const { data: updatedRaw } = await supabase
        .from('financeiro_contratos' as any)
        .select('*')
        .eq('id', id)
        .single();

      const updated = updatedRaw as unknown as Contrato | null;

      if (updated) {
        const regenerated = await gerarLancamentos(updated as any as Contrato, today);
        console.info('[Contratos] atualizar futuros', {
          contratoId: id,
          deleted: deleted || 0,
          regenerated,
        });
      }
    }

    toast.success('Contrato atualizado');
    await fetchContratos();
    return true;
  }, [fetchContratos]);

  const alterarStatus = useCallback(async (id: string, novoStatus: string): Promise<boolean> => {
    const { error } = await supabase
      .from('financeiro_contratos' as any)
      .update({ status: novoStatus } as any)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao alterar status');
      console.error(error);
      return false;
    }

    toast.success(`Contrato ${novoStatus === 'ativo' ? 'reativado' : novoStatus}`);
    await fetchContratos();
    return true;
  }, [fetchContratos]);

  const gerarLancamentos = useCallback(async (contrato: Contrato, aPartirDe?: string): Promise<number> => {
    if (contrato.status !== 'ativo') return 0;

    const inicio = new Date(contrato.data_inicio + 'T00:00:00');
    const anoVigente = new Date().getFullYear();
    const fimDefault = `${anoVigente}-12-31`;
    const dataFim = contrato.data_fim || fimDefault;
    const startDate = aPartirDe && aPartirDe > contrato.data_inicio ? aPartirDe : contrato.data_inicio;

    const lancamentos: any[] = [];
    let currentDate = contrato.data_inicio;
    let monthOffset = 0;

    while (true) {
      const comp = monthOffset === 0 ? contrato.data_inicio : addMonthsClamped(contrato.data_inicio, monthOffset, inicio.getDate());
      
      if (comp > dataFim) break;
      if (comp < startDate) {
        monthOffset++;
        continue;
      }

      // Payment date uses dia_pagamento
      const compDate = new Date(comp + 'T00:00:00');
      const lastDayOfMonth = new Date(compDate.getFullYear(), compDate.getMonth() + 1, 0).getDate();
      const payDay = Math.min(contrato.dia_pagamento, lastDayOfMonth);
      const dataPgto = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`;

      const anoMes = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;

      lancamentos.push({
        cliente_id: contrato.cliente_id,
        fazenda_id: contrato.fazenda_id,
        data_competencia: comp,
        data_pagamento: dataPgto,
        ano_mes: anoMes,
        valor: contrato.valor,
        tipo_operacao: '2-Saídas',
        status_transacao: 'meta',
        descricao: contrato.produto || null,
        macro_custo: contrato.macro_custo || null,
        centro_custo: contrato.centro_custo || null,
        subcentro: contrato.subcentro || null,
        observacao: contrato.observacao || null,
        numero_documento: null,
        favorecido_id: contrato.fornecedor_id || null,
        forma_pagamento: contrato.forma_pagamento || null,
        dados_pagamento: contrato.dados_pagamento || null,
        conta_bancaria_id: contrato.conta_bancaria_id || null,
        contrato_id: contrato.id,
        origem_lancamento: 'contrato',
      });

      monthOffset++;
      if (lancamentos.length > 36) break; // safety cap
    }

    if (lancamentos.length === 0) return 0;

    const { error } = await (supabase
      .from('financeiro_lancamentos_v2') as any)
      .insert(lancamentos);

    if (error) {
      console.error('Erro ao gerar lançamentos do contrato:', error);
      toast.error('Erro ao gerar lançamentos');
      return 0;
    }

    return lancamentos.length;
  }, []);

  const excluirContrato = useCallback(async (id: string): Promise<boolean> => {
    // Delete linked lancamentos first
    const { error: delLanc } = await (supabase
      .from('financeiro_lancamentos_v2') as any)
      .delete()
      .eq('contrato_id', id);

    if (delLanc) {
      toast.error('Erro ao excluir lançamentos do contrato');
      console.error(delLanc);
      return false;
    }

    const { error } = await supabase
      .from('financeiro_contratos' as any)
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir contrato');
      console.error(error);
      return false;
    }

    toast.success('Contrato excluído');
    await fetchContratos();
    return true;
  }, [fetchContratos]);

  return {
    contratos,
    loading,
    criarContrato,
    editarContrato,
    alterarStatus,
    excluirContrato,
    fetchContratos,
  };
}
