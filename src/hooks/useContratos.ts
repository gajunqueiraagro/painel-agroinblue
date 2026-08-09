import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';
import { ErroUsuarioSeguro, reportarErro } from '@/lib/erroOperacional';

/**
 * PR-SEC-RLS-CONTRATOS-01A — a exclusao de contrato esta BLOQUEADA.
 *
 * O caminho antigo emitia DELETE direto em `financeiro_lancamentos_v2` e em
 * `financeiro_contratos`, sem guarda de status: apagaria obrigacoes realizadas
 * e conciliadas. O 01A revoga o privilegio de DELETE de `authenticated`, entao
 * esse caminho passaria a falhar no banco — e o codigo antigo exibiria
 * `toast.success` mesmo assim.
 *
 * Ate o 01B entregar a exclusao transacional server-side, a operacao e recusada
 * ANTES de qualquer chamada ao banco. Texto autoral, sem interpolar nada de
 * fora, conforme o contrato de ErroUsuarioSeguro.
 */
export const MENSAGEM_CRIACAO_INDEFINIDA =
  'Nao foi possivel confirmar a criacao do contrato. Recarregue a tela e tente novamente.';

export const MENSAGEM_REGENERACAO_INDEFINIDA =
  'Nao foi possivel confirmar a atualizacao das obrigacoes futuras. Recarregue a tela e tente novamente.';

export const MENSAGEM_CONTRATO_NAO_LOCALIZADO =
  'Nao foi possivel localizar este contrato. Recarregue a tela e tente novamente.';

export const MENSAGEM_EXCLUSAO_BLOQUEADA =
  'Contratos com historico nao podem ser excluidos. Altere o status para Encerrado. ' +
  'A exclusao segura de contratos sem movimentacoes sera disponibilizada em uma proxima etapa.';

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
      reportarErro(error, 'fetchContratos', toast.error);
    } else {
      setContratos((data as any[] || []) as Contrato[]);
    }
    setLoading(false);
  }, [clienteAtual?.id, fazendaAtual?.id]);

  useEffect(() => {
    fetchContratos();
  }, [fetchContratos]);

  const criarContrato = useCallback(async (form: ContratoForm): Promise<boolean> => {
    // PR-FIN-DATAS-VENCIMENTO-02A — criacao ATOMICA server-side.
    //
    // O caminho antigo fazia INSERT do contrato, commitava, e so entao gerava
    // as parcelas numa segunda chamada: falha na segunda deixava contrato
    // ORFAO. E o gerador client-side gravava o vencimento em `data_pagamento`,
    // produzindo as 126 obrigacoes defeituosas.
    //
    // Agora e uma unica RPC. O tenant e resolvido no servidor a partir da
    // fazenda: `cliente_id` nao e enviado.
    const { data: r, error } = await (supabase as any).rpc('fn_contrato_criar_e_gerar', {
      p_fazenda_id: form.fazenda_id,
      p_fornecedor_id: form.fornecedor_id ?? null,
      p_produto: form.produto ?? null,
      p_valor: form.valor,
      p_frequencia: form.frequencia ?? 'mensal',
      p_data_inicio: form.data_inicio,
      p_data_fim: form.data_fim ?? null,
      p_dia_pagamento: form.dia_pagamento,
      p_forma_pagamento: form.forma_pagamento ?? null,
      p_dados_pagamento: form.dados_pagamento ?? null,
      p_conta_bancaria_id: form.conta_bancaria_id ?? null,
      p_subcentro: form.subcentro ?? null,
      p_centro_custo: form.centro_custo ?? null,
      p_macro_custo: form.macro_custo ?? null,
      p_observacao: form.observacao ?? null,
      p_status: form.status ?? 'ativo',
    });

    if (error) { reportarErro(error, 'criarContrato', toast.error); return false; }

    const ok = r && typeof r === 'object' && r.ok === true
      && typeof r.contrato_id === 'string' && typeof r.criadas === 'number';
    if (!ok) {
      reportarErro(new ErroUsuarioSeguro(MENSAGEM_CRIACAO_INDEFINIDA), 'criarContrato', toast.error);
      return false;
    }

    await fetchContratos();
    toast.success(`Contrato criado com ${r.criadas} obrigacao(oes) programada(s).`);
    return true;
  }, [fetchContratos]);

  const editarContrato = useCallback(async (id: string, form: Partial<ContratoForm>, atualizarFuturos: boolean): Promise<boolean> => {
    const { data: atualRaw, error: erroLeitura } = await supabase
      .from('financeiro_contratos' as any).select('*').eq('id', id).single();
    if (erroLeitura || !atualRaw) {
      reportarErro(erroLeitura ?? new ErroUsuarioSeguro(MENSAGEM_CONTRATO_NAO_LOCALIZADO), 'editarContrato', toast.error);
      return false;
    }
    const atual = atualRaw as unknown as Contrato;
    const novo = { ...atual, ...form };

    if (atualizarFuturos) {
      // PR-SEC-RLS-CONTRATOS-01B — edicao e regeneracao em UMA transacao
      // server-side. NAO ha UPDATE aqui: se houvesse e a regeneracao falhasse,
      // o contrato ficaria alterado e o cronograma nao. A versao enviada e a
      // PRE-update, para que uma segunda chamada concorrente falhe.
      const { data: r, error: erroRpc } = await (supabase as any).rpc('fn_contrato_editar_e_regenerar', {
        p_contrato_id: id,
        p_versao: atual.updated_at,
        p_a_partir_de: new Date().toISOString().slice(0, 10),
        p_fazenda_id: novo.fazenda_id ?? null,
        p_fornecedor_id: novo.fornecedor_id ?? null,
        p_produto: novo.produto ?? null,
        p_valor: novo.valor,
        p_frequencia: novo.frequencia ?? null,
        p_data_inicio: novo.data_inicio,
        p_data_fim: novo.data_fim ?? null,
        p_dia_pagamento: novo.dia_pagamento,
        p_forma_pagamento: novo.forma_pagamento ?? null,
        p_dados_pagamento: novo.dados_pagamento ?? null,
        p_conta_bancaria_id: novo.conta_bancaria_id ?? null,
        p_subcentro: novo.subcentro ?? null,
        p_centro_custo: novo.centro_custo ?? null,
        p_macro_custo: novo.macro_custo ?? null,
        p_observacao: novo.observacao ?? null,
        p_status: novo.status ?? 'ativo',
      });
      if (erroRpc) { reportarErro(erroRpc, 'editarContratoRegenerar', toast.error); return false; }
      const ok = r && typeof r === 'object' && r.ok === true
        && typeof r.removidas === 'number' && typeof r.criadas === 'number';
      if (!ok) {
        reportarErro(new ErroUsuarioSeguro(MENSAGEM_REGENERACAO_INDEFINIDA), 'editarContratoRegenerar', toast.error);
        return false;
      }
      await fetchContratos();
      toast.success(`Contrato atualizado. ${r.removidas} obrigacao(oes) substituida(s), ${r.criadas} criada(s).`);
      return true;
    }

    // Sem regeneracao: UPDATE simples, com retorno conferido.
    const { data: gravado, error } = await supabase
      .from('financeiro_contratos' as any).update(form as any).eq('id', id).select('id').single();
    if (error || !gravado) {
      reportarErro(error ?? new ErroUsuarioSeguro(MENSAGEM_CONTRATO_NAO_LOCALIZADO), 'editarContrato', toast.error);
      return false;
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
      reportarErro(error, 'alterarStatus', toast.error);
      return false;
    }

    toast.success(`Contrato ${novoStatus === 'ativo' ? 'reativado' : novoStatus}`);
    await fetchContratos();
    return true;
  }, [fetchContratos]);

  const excluirContrato = useCallback(async (): Promise<boolean> => {
    // Nenhuma chamada ao banco: a recusa acontece antes de qualquer DELETE.
    try {
      throw new ErroUsuarioSeguro(MENSAGEM_EXCLUSAO_BLOQUEADA);
    } catch (e) {
      reportarErro(e, 'excluirContrato', toast.error);
      return false;
    }
  }, []);

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
