import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addMonths, format } from 'date-fns';

/* ── Types ── */
export interface ParcelaPreview {
  numero: number;
  data_vencimento: string;
  valor_principal: number;
  valor_juros: number;
}

export type FrequenciaParcela = 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface FinanciamentoForm {
  descricao: string;
  numero_contrato: string;
  tipo_financiamento: 'pecuaria' | 'agricultura';
  credor_id: string;
  conta_bancaria_id: string;
  valor_total: number;
  valor_entrada: number;
  data_contrato: string;
  data_primeira_parcela: string;
  total_parcelas: number;
  taxa_juros_anual: number;
  frequencia_parcela: FrequenciaParcela;
  observacao: string;
  plano_conta_captacao_id: string;
  plano_conta_parcela_id: string;
  gerar_lancamento_captacao: boolean;
}

const INITIAL: FinanciamentoForm = {
  descricao: '',
  numero_contrato: '',
  tipo_financiamento: 'pecuaria',
  credor_id: '',
  conta_bancaria_id: '',
  valor_total: 0,
  valor_entrada: 0,
  data_contrato: '',
  data_primeira_parcela: '',
  total_parcelas: 12,
  taxa_juros_anual: 0,
  frequencia_parcela: 'mensal',
  observacao: '',
  plano_conta_captacao_id: '',
  plano_conta_parcela_id: '',
  gerar_lancamento_captacao: false,
};

const MESES_POR_FREQUENCIA: Record<FrequenciaParcela, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function useFinanciamentoCadastro() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id ?? '';
  const fazendaId = fazendaAtual?.id === '__global__' ? null : (fazendaAtual?.id ?? null);

  const [form, setForm] = useState<FinanciamentoForm>({ ...INITIAL });
  const [parcelas, setParcelas] = useState<ParcelaPreview[]>([]);
  const [saving, setSaving] = useState(false);

  /* ── Lookups ── */
  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fin-fornecedores', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['fin-contas-bancarias', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, banco')
        .eq('cliente_id', clienteId)
        .eq('ativa', true)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const { data: planosEntrada = [] } = useQuery({
    queryKey: ['fin-plano-captacao', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo')
        .eq('ativo', true)
        .eq('macro_custo', 'Entrada Financeira')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const { data: planosSaida = [] } = useQuery({
    queryKey: ['fin-plano-amortizacao', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo')
        .eq('ativo', true)
        .eq('macro_custo', 'Saída Financeira')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  /* ── Geração de parcelas ── */
  const gerarParcelas = useCallback(() => {
    const { valor_total, valor_entrada, total_parcelas, taxa_juros_anual, data_primeira_parcela, frequencia_parcela } = form;
    if (!valor_total || !total_parcelas || !data_primeira_parcela) return;

    const mesesPorParcela = MESES_POR_FREQUENCIA[frequencia_parcela] ?? 1;
    const base = (valor_total - valor_entrada) / total_parcelas;

    // Juros compostos: anual → mensal → período
    const taxaMensal = taxa_juros_anual > 0
      ? Math.pow(1 + taxa_juros_anual / 100, 1 / 12) - 1
      : 0;
    const taxaPeriodo = taxaMensal > 0
      ? Math.pow(1 + taxaMensal, mesesPorParcela) - 1
      : 0;
    const juros = base * taxaPeriodo;

    const baseDate = new Date(data_primeira_parcela + 'T12:00:00');

    const novas: ParcelaPreview[] = Array.from({ length: total_parcelas }, (_, i) => ({
      numero: i + 1,
      data_vencimento: format(addMonths(baseDate, i * mesesPorParcela), 'yyyy-MM-dd'),
      valor_principal: Math.round(base * 100) / 100,
      valor_juros: Math.round(juros * 100) / 100,
    }));
    setParcelas(novas);
  }, [form]);

  const updateParcela = useCallback((idx: number, field: keyof ParcelaPreview, value: any) => {
    setParcelas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }, []);

  const totalParcelas = useMemo(
    () => parcelas.reduce((s, p) => s + p.valor_principal + p.valor_juros, 0),
    [parcelas],
  );

  /* ── Salvar ── */
  const salvar = useCallback(async (destinacoes?: Array<{
    descricao: string; tipo: string; valor: number;
    fornecedor_id: string; conta_bancaria_id: string;
    plano_conta_id: string; gerar_lancamento: boolean; observacao: string;
  }>): Promise<boolean> => {
    if (!clienteId || !user) {
      toast.error('Sessão inválida');
      return false;
    }
    if (!form.descricao.trim()) {
      toast.error('Preencha a descrição');
      return false;
    }
    if (!form.data_contrato || !form.data_primeira_parcela) {
      toast.error('Preencha as datas');
      return false;
    }
    if (parcelas.length === 0) {
      toast.error('Gere as parcelas antes de salvar');
      return false;
    }

    setSaving(true);
    try {
      // Conversão juros compostos: anual → mensal
      const taxaMensal = form.taxa_juros_anual > 0
        ? (Math.pow(1 + form.taxa_juros_anual / 100, 1 / 12) - 1) * 100
        : 0;

      // 1 – Insert financiamento
      const { data: fin, error: errFin } = await supabase
        .from('financiamentos')
        .insert({
          cliente_id: clienteId,
          fazenda_id: fazendaId,
          descricao: form.descricao.trim(),
          numero_contrato: form.numero_contrato.trim() || null,
          tipo_financiamento: form.tipo_financiamento,
          credor_id: form.credor_id || null,
          conta_bancaria_id: form.conta_bancaria_id || null,
          valor_total: form.valor_total,
          valor_entrada: form.valor_entrada,
          taxa_juros_mensal: Math.round(taxaMensal * 10000) / 10000,
          total_parcelas: form.total_parcelas,
          data_contrato: form.data_contrato,
          data_primeira_parcela: form.data_primeira_parcela,
          plano_conta_captacao_id: form.plano_conta_captacao_id || null,
          plano_conta_parcela_id: form.plano_conta_parcela_id || null,
          gerar_lancamento_captacao: form.gerar_lancamento_captacao,
          observacao: form.observacao || null,
          status: 'ativo',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (errFin || !fin) throw new Error(errFin?.message ?? 'Erro ao salvar financiamento');

      // 2 – Insert parcelas
      const parcelasInsert = parcelas.map(p => ({
        financiamento_id: fin.id,
        cliente_id: clienteId,
        numero_parcela: p.numero,
        data_vencimento: p.data_vencimento,
        valor_principal: p.valor_principal,
        valor_juros: p.valor_juros,
        status: 'pendente' as const,
      }));

      const { error: errParcelas } = await supabase
        .from('financiamento_parcelas')
        .insert(parcelasInsert);

      if (errParcelas) {
        await supabase.from('financiamentos').delete().eq('id', fin.id);
        throw new Error(errParcelas.message);
      }

      // 3 – Lançamento de captação (opcional)
      if (form.gerar_lancamento_captacao && form.plano_conta_captacao_id) {
        const anoMes = format(new Date(form.data_contrato + 'T12:00:00'), 'yyyy-MM');
        const { error: errLanc } = await supabase
          .from('financeiro_lancamentos_v2')
          .insert({
            cliente_id: clienteId,
            fazenda_id: fazendaId,
            conta_bancaria_id: form.conta_bancaria_id || null,
            tipo_operacao: '1-Entradas',
            sinal: 1,
            valor: form.valor_total,
            data_competencia: form.data_contrato,
            ano_mes: anoMes,
            origem_lancamento: 'financiamento',
            origem_tipo: 'financiamento_captacao',
            plano_conta_id: form.plano_conta_captacao_id,
            descricao: `Captação: ${form.descricao.trim()}`,
            status_transacao: 'realizado',
            created_by: user.id,
          });

        if (errLanc) {
          console.error('Erro ao gerar lançamento de captação:', errLanc);
          toast.warning('Financiamento salvo, mas o lançamento de captação falhou.');
        }
      }

      // 4 – Destinações (opcional)
      if (destinacoes && destinacoes.length > 0) {
        const destInsert = destinacoes.map(d => ({
          financiamento_id: fin.id,
          cliente_id: clienteId,
          descricao: d.descricao,
          tipo: d.tipo,
          valor: d.valor,
          fornecedor_id: d.fornecedor_id || null,
          conta_bancaria_id: d.conta_bancaria_id || null,
          plano_conta_id: d.plano_conta_id || null,
          gerar_lancamento: d.gerar_lancamento,
          observacao: d.observacao || null,
        }));

        const { data: destSalvas, error: errDest } = await supabase
          .from('financiamento_destinacoes')
          .insert(destInsert)
          .select('id, tipo, valor, plano_conta_id, conta_bancaria_id, descricao, gerar_lancamento');

        if (errDest) {
          toast.warning('Financiamento salvo, mas houve erro ao salvar destinações: ' + errDest.message);
        } else if (destSalvas) {
          for (const dest of destSalvas) {
            if (!dest.gerar_lancamento) continue;

            const isEntrada = dest.tipo === 'conta_propria';
            const tipoOperacao = isEntrada ? '1-Entradas' : '2-Saídas';
            const sinal = isEntrada ? 1 : -1;
            const semCaixa = dest.tipo !== 'conta_propria';
            const anoMes = format(new Date(form.data_contrato + 'T12:00:00'), 'yyyy-MM');

            const { data: lancDest, error: errLancDest } = await supabase
              .from('financeiro_lancamentos_v2')
              .insert({
                cliente_id: clienteId,
                fazenda_id: fazendaId,
                conta_bancaria_id: dest.conta_bancaria_id || null,
                tipo_operacao: tipoOperacao,
                sinal: sinal,
                valor: dest.valor,
                data_competencia: form.data_contrato,
                ano_mes: anoMes,
                origem_lancamento: 'financiamento',
                origem_tipo: 'financiamento_destinacao',
                plano_conta_id: dest.plano_conta_id || null,
                descricao: `${dest.descricao} — ${form.descricao.trim()}`,
                status_transacao: 'realizado',
                cancelado: false,
                sem_movimentacao_caixa: semCaixa,
                created_by: user.id,
              })
              .select('id')
              .single();

            if (errLancDest) {
              console.error('Erro ao gerar lançamento da destinação:', errLancDest);
              toast.warning(`Destinação "${dest.descricao}" salva, mas lançamento falhou.`);
              continue;
            }

            await supabase
              .from('financiamento_destinacoes')
              .update({ lancamento_id: lancDest.id, updated_at: new Date().toISOString() })
              .eq('id', dest.id);
          }
        }
      }

      toast.success('Financiamento cadastrado com sucesso!');
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [clienteId, fazendaId, user, form, parcelas]);

  return {
    form, setForm,
    parcelas, setParcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    fornecedores, contas,
    planosEntrada, planosSaida,
    clienteId,
  };
}
