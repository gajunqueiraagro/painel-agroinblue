import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizarErroRpc } from '@/hooks/useOcCompromissos';
import { lerContaCorrente, type ContaCorrente, type TipoExplicacao } from '@/lib/oc/contaCorrente';

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

/** Uma linha do dialogo "Explicar diferenca", como a RPC a recebe. */
export interface ExplicacaoRascunho {
  tipo: TipoExplicacao;
  /** Magnitude; o sinal do saldo sai do tipo (`efeitoNoSaldo`). No ajuste de preco, positivo reduz a entrega. */
  valor: number;
  loteId: string | null;
  planoContaId: string | null;
  motivo: string;
  vencimento: string | null;
}

/** O que o cancelamento da OC vai fazer (`oc_cancelar_rol`), para o dialogo mostrar antes de confirmar. */
export interface RolCancelamento {
  entregas: Array<{ data: string; loteOrdem: number | null; valor: number }>;
  explicacoes: Array<{ tipo: string; valor: number; conta: string | null }>;
  recebimentos: Array<{ data: string; valor: number; contaAtual: string | null; contaOriginal: string | null; acao: string }>;
  saidas: Array<{ data: string; cab: number; categoria: string | null; origem: string }>;
  compromissos: Array<{ componente: string; valor: number }>;
  bloqueios: string[];
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
  /** Grava as linhas do rascunho em ordem, encadeando a versao; para no primeiro erro e devolve a mensagem. */
  explicarSaldo: (itens: readonly ExplicacaoRascunho[]) => Promise<string | null>;
  desfazerExplicacao: (parteId: string, motivo: string) => Promise<string | null>;
  programarRecebimento: (valor: number, vencimento: string) => Promise<string | null>;
  lerRolCancelamento: () => Promise<{ rol: RolCancelamento | null; erro: string | null }>;
  /** Lotes da OC com entrega, para o ajuste de preco. */
  listarLotes: () => Promise<LoteParaAjuste[]>;
  /** Contas que a explicacao aceita: pecuaria, compoem o DRE (decisao 4), na direcao do tipo. */
  listarContas: (tipoOperacao: '1-Entradas' | '2-Saídas') => Promise<ContaParaExplicacao[]>;
}

export interface LoteParaAjuste { id: string; ordem: number; categoria: string | null; cab: number | null; total: number | null }
export interface ContaParaExplicacao { id: string; ordem: number | null; subcentro: string }

interface Opts {
  operacaoId: string | null;
  enabled: boolean;
  versao: number | null;
  onVersaoChange: (v: number) => void;
  /** OC-VENDA-ENTREGAS-01d (A2): o ajuste de preco e o desfazer dele REVALORAM um lote no banco. Quem mostra os lotes (o resumo
      lateral soma `lotesApi.totais`) precisa reler, senao o "Valor acordado" segue com o lote de antes do ajuste. */
  aoMudarLotes?: () => void | Promise<unknown>;
}

export function useOcContaCorrente({ operacaoId, enabled, versao, onVersaoChange, aoMudarLotes }: Opts): OcContaCorrenteApi {
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

  const explicarSaldo = useCallback(async (itens: readonly ExplicacaoRascunho[]): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    setOcupado(true);
    let versaoCorrente = versaoAtual;
    try {
      for (const it of itens) {
        const { data, error } = await (supabase as any).rpc('oc_explicar_saldo', {
          p_operacao_id: operacaoId, p_versao_esperada: versaoCorrente, p_tipo: it.tipo, p_valor: it.valor,
          p_lote_id: it.loteId, p_plano_conta_id: it.planoContaId, p_motivo: it.motivo.trim(), p_vencimento: it.vencimento,
          p_simular: false,
        });
        /* os itens anteriores ja' gravaram (inclusive um ajuste): reler os lotes tambem na recusa */
        if (error) { await Promise.all([recarregar(), aoMudarLotes?.()]); return normalizarErroRpc(error).message; }
        const v = Number(data?.operacao_versao);
        if (Number.isFinite(v)) { versaoCorrente = v; onVersaoChange(v); }
      }
      await Promise.all([recarregar(), aoMudarLotes?.()]);
      return null;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar, aoMudarLotes]);

  const desfazerExplicacao = useCallback(async (parteId: string, motivo: string): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    if (!motivo.trim()) return 'Informe o motivo.';
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_desfazer_explicacao', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_parte_id: parteId, p_motivo: motivo.trim(), p_simular: false,
      });
      if (error) return normalizarErroRpc(error).message;
      const v = Number(data?.operacao_versao);
      if (Number.isFinite(v)) onVersaoChange(v);
      await Promise.all([recarregar(), aoMudarLotes?.()]);
      return null;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar, aoMudarLotes]);

  const programarRecebimento = useCallback(async (valor: number, vencimento: string): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any).rpc('oc_programar_recebimento', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_valor: valor, p_vencimento: vencimento,
        p_conta_bancaria_id: null, p_simular: false,
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

  const lerRolCancelamento = useCallback(async () => {
    if (!operacaoId) return { rol: null, erro: 'Operação não carregada.' };
    const { data, error } = await (supabase as any).rpc('oc_cancelar_rol', { p_operacao_id: operacaoId });
    if (error) return { rol: null, erro: normalizarErroRpc(error).message };
    return { rol: lerRol(data), erro: null };
  }, [operacaoId]);

  const listarLotes = useCallback(async (): Promise<LoteParaAjuste[]> => {
    if (!operacaoId) return [];
    const { data } = await (supabase as any).from('zoo_operacao_lotes')
      .select('id, ordem, categoria_negociada, qtd_negociada, peso_medio_negociado_kg, criterio_valor, valor_informado')
      .eq('operacao_id', operacaoId).order('ordem');
    const linhas = lista(data);
    return linhas.map(l => {
      const qtd = Number(l.qtd_negociada) || 0;
      const peso = Number(l.peso_medio_negociado_kg) || 0;
      const vi = Number(l.valor_informado) || 0;
      const total = l.criterio_valor === 'kg' ? qtd * peso * vi : l.criterio_valor === 'cabeca' ? qtd * vi : l.criterio_valor === 'total' ? vi : null;
      return { id: String(l.id), ordem: Number(l.ordem) || 0, categoria: txt(l.categoria_negociada), cab: qtd || null,
               total: total === null ? null : Math.round(total * 100) / 100 };
    });
  }, [operacaoId]);

  const listarContas = useCallback(async (tipoOperacao: '1-Entradas' | '2-Saídas'): Promise<ContaParaExplicacao[]> => {
    const { data } = await (supabase as any).from('financeiro_plano_contas')
      .select('id, ordem_exibicao, subcentro, cliente_id')
      .eq('ativo', true).eq('escopo_negocio', 'pecuaria').eq('compoe_dre', true).eq('tipo_operacao', tipoOperacao)
      .order('ordem_exibicao');
    return lista(data).map(c => ({ id: String(c.id), ordem: c.ordem_exibicao == null ? null : Number(c.ordem_exibicao), subcentro: String(c.subcentro ?? '') }));
  }, []);

  return {
    contaCorrente, loading, erro, ocupado, recarregar, sincronizarEntregas, listarVinculaveis, vincularRecebimento,
    explicarSaldo, desfazerExplicacao, programarRecebimento, lerRolCancelamento, listarLotes, listarContas,
  };
}

const lista = (v: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x)) : {})) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Le o envelope de `oc_cancelar_rol`. Modelo titulo devolve `null` (nada extra a listar). */
export function lerRol(raw: unknown): RolCancelamento | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = Object.fromEntries(Object.entries(raw));
  if (r.modelo !== 'conta_corrente') return null;
  return {
    entregas: lista(r.entregas).map(e => ({ data: String(e.data ?? ''), loteOrdem: e.lote_ordem == null ? null : Number(e.lote_ordem), valor: Number(e.valor) || 0 })),
    explicacoes: lista(r.explicacoes).map(e => ({ tipo: String(e.tipo ?? ''), valor: Number(e.valor) || 0, conta: txt(e.conta) })),
    recebimentos: lista(r.recebimentos).map(e => ({ data: String(e.data ?? ''), valor: Number(e.valor) || 0,
      contaAtual: txt(e.conta_atual), contaOriginal: txt(e.conta_original), acao: String(e.acao ?? '') })),
    saidas: lista(r.saidas).map(e => ({ data: String(e.data ?? ''), cab: Number(e.cab) || 0, categoria: txt(e.categoria), origem: String(e.origem ?? '') })),
    compromissos: lista(r.compromissos).map(e => ({ componente: String(e.componente ?? ''), valor: Number(e.valor) || 0 })),
    bloqueios: lista(r.bloqueios).map(e => String(e.descricao ?? '')),
  };
}
