import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizarErroRpc } from '@/hooks/useOcCompromissos';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';

/**
 * Conta corrente da OC (OC-VENDA-ENTREGAS-01b). Le `oc_conta_corrente` — o saldo e' do banco, a tela nao soma — e expoe as
 * duas escritas do modelo: gerar/atualizar as entregas (`oc_sincronizar_entregas`) e vincular um recebimento ja lancado
 * (`oc_vincular_lancamento`, que no modelo conta corrente cai no ramo do recebimento).
 * ⚠ AS ESCRITAS DEVOLVEM A MENSAGEM DE ERRO (ou null), SEM TOAST: a tela a mostra ao lado do botao (UX-TOAST-01).
 * ⚠ A VERSAO VEM DE FORA e a devolvida pela RPC sobe por `onVersaoChange` — encadear com a do state daria 40001.
 */

export interface RecebimentoVinculavel {
  lancamentoId: string;
  data: string;
  valor: number;
  descricao: string | null;
  subcentro: string | null;
  mesmoFavorecido: boolean;
  semContaBancaria: boolean;
  status: string | null;
  conciliado: boolean;
}

export interface OcContaCorrenteApi {
  contaCorrente: ContaCorrente | null;
  loading: boolean;
  erro: string | null;
  ocupado: boolean;
  recarregar: () => Promise<void>;
  sincronizarEntregas: () => Promise<string | null>;
  listarVinculaveis: () => Promise<{ itens: RecebimentoVinculavel[]; erro: string | null }>;
  vincularRecebimento: (lancamentoId: string, motivo: string) => Promise<string | null>;
}

interface Opts {
  operacaoId: string | null;
  enabled: boolean;
  versao: number | null;
  onVersaoChange: (v: number) => void;
}

export function useOcContaCorrente({ operacaoId, enabled, versao, onVersaoChange }: Opts): OcContaCorrenteApi {
  const [contaCorrente, setContaCorrente] = useState<ContaCorrente | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    if (!operacaoId || !enabled) { setContaCorrente(null); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_conta_corrente', { p_operacao_id: operacaoId });
      if (error) throw normalizarErroRpc(error);
      const cc = lerContaCorrente(data);
      setContaCorrente(cc);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a conta corrente.');
    } finally {
      setLoading(false);
    }
  }, [operacaoId, enabled]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const versaoAtual = versao ?? contaCorrente?.versao ?? null;

  const sincronizarEntregas = useCallback(async (): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_sincronizar_entregas', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_simular: false,
      });
      if (error) return normalizarErroRpc(error).message;
      const v = Number(data?.operacao_versao);
      if (Number.isFinite(v)) onVersaoChange(v);
      await recarregar();
      return null;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar]);

  const listarVinculaveis = useCallback(async () => {
    if (!operacaoId) return { itens: [], erro: 'Operação não carregada.' };
    const { data, error } = await (supabase as any).rpc('oc_recebimentos_vinculaveis', { p_operacao_id: operacaoId });
    if (error) return { itens: [], erro: normalizarErroRpc(error).message };
    const linhas: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
    return {
      erro: null,
      itens: linhas.map((r) => ({
        lancamentoId: String(r.lancamento_id),
        data: String(r.data ?? ''),
        valor: Number(r.valor) || 0,
        descricao: typeof r.descricao === 'string' ? r.descricao : null,
        subcentro: typeof r.subcentro === 'string' ? r.subcentro : null,
        mesmoFavorecido: r.mesmo_favorecido === true,
        semContaBancaria: r.conta_bancaria_id == null,
        status: typeof r.status_transacao === 'string' ? r.status_transacao : null,
        conciliado: r.conciliado === true,
      })),
    };
  }, [operacaoId]);

  const vincularRecebimento = useCallback(async (lancamentoId: string, motivo: string): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    if (!motivo.trim()) return 'Informe o motivo.';
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_vincular_lancamento', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_lancamento_id: lancamentoId,
        p_componente: null, p_motivo: motivo.trim(),
      });
      if (error) return normalizarErroRpc(error).message;
      if (data?.ok !== true) return 'O banco não vinculou o recebimento.';
      const v = Number(data?.operacao_versao);
      if (Number.isFinite(v)) onVersaoChange(v);
      await recarregar();
      return null;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar]);

  return { contaCorrente, loading, erro, ocupado, recarregar, sincronizarEntregas, listarVinculaveis, vincularRecebimento };
}
