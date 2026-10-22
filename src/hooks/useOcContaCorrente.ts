import { useCallback, useEffect, useRef, useState } from 'react';
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
  /* OC-CORRECOES-01 C3 (`oc_recebimentos_do_financeiro`): as tres datas, o favorecido e a conta bancaria pelo nome, e — do comprador —
     o MOTIVO de a regra o excluir (nulo = vinculavel). Opcionais: quem monta fixture antigo continua valendo. */
  competencia?: string | null;
  vencimento?: string | null;
  pagamento?: string | null;
  favorecido?: string | null;
  contaBancaria?: string | null;
  motivoExcluido?: string | null;
}

/** Uma linha do dialogo "Explicar diferenca", como a RPC a recebe. */
export interface ExplicacaoRascunho {
  tipo: TipoExplicacao;
  /** Magnitude; o sinal do saldo sai do tipo (`efeitoNoSaldo`). No ajuste de preco, positivo BAIXA o preco e negativo SOBE
   *  (`valorAjusteParaRpc`). */
  valor: number;
  /** No ajuste de preco, NULO = todos os lotes, rateio por kg (OC-CC-VOLTA-01b). */
  loteId: string | null;
  planoContaId: string | null;
  motivo: string;
  /** Devolucao: o vencimento. Permuta / outra receita: a data do fato (OC-CC-VOLTA-01b; sem ela, o banco usa a ultima entrega). */
  vencimento: string | null;
}

/** O que o cancelamento da OC vai fazer (`oc_cancelar_rol`), para o dialogo mostrar antes de confirmar. */
export interface RolCancelamento {
  /** P32: 'titulo' = modelo antigo — o rol traz so' os compromissos que fecham (o resto o banco ja' exige estornado). */
  modelo: 'conta_corrente' | 'titulo';
  entregas: Array<{ data: string; loteOrdem: number | null; valor: number }>;
  explicacoes: Array<{ tipo: string; valor: number; conta: string | null }>;
  /** OC-CC-CLASSIFICACAO-01: `contaAtual` ja' e' a da operacao e `contaOriginal` e' a do `vincular_recebimento` (a mesma, desde que
   *  o vincular nao troca mais a conta). `acao`: 'volta_para_conta_original' (vinculado: perde a parte e volta ao DRE),
   *  'fica_manual' (nascido na OC e ja' pago) ou 'cancela_programado' (nascido na OC e nao pago). */
  recebimentos: Array<{ data: string; valor: number; contaAtual: string | null; contaOriginal: string | null; acao: string }>;
  saidas: Array<{ data: string; cab: number; categoria: string | null; origem: string }>;
  compromissos: Array<{ componente: string; valor: number; vencimento: string | null; descricao: string | null }>;
  /** OC-CONTA-CORRENTE-TODOS-01a (decisao 3): despesas pagas a terceiros — frete, comissao, ICMS, Fundersul, Iagro. FICAM. */
  despesas: Array<{ componente: string; nome: string | null; favorecido: string | null; valor: number; pago: number }>;
  /** OC-CANCELAR-CASCATA-01: os titulos das saidas fora da OC (a parcela da venda antiga adotada) — cancelados junto. */
  titulosSaida: Array<{ data: string; valor: number; descricao: string | null }>;
  /** OC-CANCELAR-CASCATA-01: mes fechado no Financeiro (o de P1 e' bloqueio). */
  avisos: string[];
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
  /** A previa de UMA explicacao: a propria `oc_explicar_saldo` com `p_simular` (nada grava). `previa` e' o jsonb cru da RPC. */
  simularExplicacao: (item: ExplicacaoRascunho) => Promise<{ previa: unknown; erro: string | null }>;
  lerRolCancelamento: () => Promise<{ rol: RolCancelamento | null; erro: string | null }>;
  /** Lotes da OC com entrega, para o ajuste de preco. */
  listarLotes: () => Promise<LoteParaAjuste[]>;
  /** Contas que a explicacao aceita: pecuaria, compoem o DRE (decisao 4), na direcao do tipo. */
  listarContas: (tipoOperacao: '1-Entradas' | '2-Saídas') => Promise<ContaParaExplicacao[]>;
  /** OC-CORRECOES-01 C2 — os gestos do titulo (cancelar, desvincular, parcelar), o legado sem compromisso incluido. Com compromisso, o
   *  desvincular vai por `oc_desvincular_lancamento`; o resto por `oc_recebimento_gesto`. Devolve a frase do banco, ou nulo. Opcional:
   *  sem ele os itens seguem apagados. */
  gestoNoTitulo?: (lancamentoId: string, gesto: 'cancelar' | 'desvincular' | 'parcelar', motivo: string,
    parcelas: { valor: number | null; vencimento: string }[] | null, comCompromisso: boolean) => Promise<string | null>;
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

/** OC-CC-EXPLICAR-CONGELA-01 — erro que NAO e' frase do produto (trava, tempo esgotado, rede): nunca a mensagem crua do PostgREST. */
export const FRASE_BANCO_OCUPADO = 'Não foi possível gravar agora (banco ocupado). Tente de novo.';
/** Os codigos cuja frase e' do produto: conflito de versao, permissao, operacao inexistente e a regra de negocio (verbatim do banco). */
const CODIGOS_COM_FRASE = new Set(['40001', '42501', 'P0002', 'P0001']);
export function fraseDoErroAoExplicar(error: { code?: string | null; message?: string | null } | null | undefined): string {
  const codigo = error?.code ?? '';
  if (!error || !CODIGOS_COM_FRASE.has(codigo)) return FRASE_BANCO_OCUPADO;
  return normalizarErroRpc({ code: codigo, message: error.message ?? '' }).message || FRASE_BANCO_OCUPADO;
}

export function useOcContaCorrente({ operacaoId, enabled, versao, onVersaoChange, aoMudarLotes }: Opts): OcContaCorrenteApi {
  const [contaCorrente, setContaCorrente] = useState<ContaCorrente | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const versaoLidaRef = useRef<number | null>(null);
  const lendoRef = useRef(0);

  /* A leitura devolve o que leu: quem acabou de ser recusado por versao precisa da versao RELIDA (OC-CC-EXPLICAR-CONGELA-01). */
  const ler = useCallback(async (): Promise<ContaCorrente | null> => {
    if (!operacaoId || !enabled) { setContaCorrente(null); return null; }
    setLoading(true);
    lendoRef.current += 1;
    try {
      const { data, error } = await (supabase as any).rpc('oc_conta_corrente', { p_operacao_id: operacaoId });
      if (error) throw normalizarErroRpc(error);
      const cc = lerContaCorrente(data);
      versaoLidaRef.current = cc.versao;
      setContaCorrente(cc);
      setErro(null);
      return cc;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a conta corrente.');
      return null;
    } finally {
      lendoRef.current -= 1;
      setLoading(false);
    }
  }, [operacaoId, enabled]);
  const recarregar = useCallback(async () => { await ler(); }, [ler]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /* OC-CC-PADRAO-NOVAS-01b — a versao da OC andou POR FORA deste hook (registrar / estornar / adotar a saida agora sincronizam
     a entrega no banco): rele a conta corrente UMA vez por versao nova. Nao rele o que este hook ja' esta' lendo (os gestos
     daqui avisam a versao e releem em seguida) nem a versao que a ultima leitura ja' trouxe — sem laco. */
  useEffect(() => {
    if (versao == null || lendoRef.current > 0 || versaoLidaRef.current == null || versaoLidaRef.current === versao) return;
    void recarregar();
  }, [versao, recarregar]);

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
    /* OC-CORRECOES-01 C3 — a lista nova: os vinculaveis de sempre + o do comprador que a regra exclui, com o motivo. */
    const { data, error } = await (supabase as any).rpc('oc_recebimentos_do_financeiro', { p_operacao_id: operacaoId });
    if (error) return { itens: [], erro: normalizarErroRpc(error).message };
    const linhas: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
    const txt = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
    return {
      erro: null,
      itens: linhas.map((r) => ({
        lancamentoId: String(r.lancamento_id),
        data: String(r.data_pagamento ?? r.data_vencimento ?? r.data_competencia ?? ''),
        valor: Number(r.valor) || 0,
        descricao: txt(r.descricao),
        subcentro: txt(r.subcentro),
        mesmoFavorecido: r.do_comprador === true,
        semContaBancaria: r.conta_bancaria_id == null,
        status: txt(r.status_transacao),
        conciliado: r.conciliado === true,
        competencia: txt(r.data_competencia), vencimento: txt(r.data_vencimento), pagamento: txt(r.data_pagamento),
        favorecido: txt(r.favorecido_nome), contaBancaria: txt(r.conta_bancaria_nome), motivoExcluido: txt(r.motivo_excluido),
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
        if (error) {
          const [relida] = await Promise.all([ler(), aoMudarLotes?.()]);
          /* ⚠ A VERSAO SE CURA (OC-CC-EXPLICAR-CONGELA-01): recusada por versao, a relida sobe pelo canal de sempre — o dono
             continua sendo quem recebe `onVersaoChange` — e o proximo Salvar ja' vai com ela. Antes a tela ficava presa na
             versao velha e todo Salvar recusava ate' o F5. */
          if (error.code === '40001' && relida && Number.isFinite(relida.versao)) onVersaoChange(relida.versao);
          return fraseDoErroAoExplicar(error);
        }
        const v = Number(data?.operacao_versao);
        if (Number.isFinite(v)) { versaoCorrente = v; onVersaoChange(v); }
      }
      await Promise.all([recarregar(), aoMudarLotes?.()]);
      return null;
    } catch {
      /* falha de rede / excecao: nada de mensagem crua na tela */
      return FRASE_BANCO_OCUPADO;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar, ler, aoMudarLotes]);

  /* OC-CC-VOLTA-01b — A PREVIA E' A PROPRIA RPC com `p_simular` (desfeita por SQLSTATE 'OCSIM'): o rateio por kg, os centavos no
     lote de maior peso e as entregas por data saem do banco, nunca de uma copia da regra aqui. Sem `ocupado`: e' leitura. */
  const simularExplicacao = useCallback(async (it: ExplicacaoRascunho): Promise<{ previa: unknown; erro: string | null }> => {
    if (!operacaoId || versaoAtual == null) return { previa: null, erro: 'Operação não carregada.' };
    const { data, error } = await (supabase as any).rpc('oc_explicar_saldo', {
      p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_tipo: it.tipo, p_valor: it.valor,
      p_lote_id: it.loteId, p_plano_conta_id: it.planoContaId, p_motivo: it.motivo.trim() || 'prévia', p_vencimento: it.vencimento,
      p_simular: true,
    });
    if (error) return { previa: null, erro: normalizarErroRpc(error).message };
    return { previa: data?.previa ?? null, erro: null };
  }, [operacaoId, versaoAtual]);

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

  const gestoNoTitulo = useCallback(async (lancamentoId: string, gesto: 'cancelar' | 'desvincular' | 'parcelar', motivo: string,
    parcelas: { valor: number | null; vencimento: string }[] | null, comCompromisso: boolean): Promise<string | null> => {
    if (!operacaoId || versaoAtual == null) return 'Operação não carregada.';
    if (!motivo.trim()) return 'Informe o motivo.';
    setOcupado(true);
    try {
      const { data, error } = gesto === 'desvincular' && comCompromisso
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        ? await (supabase as any).rpc('oc_desvincular_lancamento', {
            p_operacao_id: operacaoId, p_versao_esperada: versaoAtual, p_lancamento_id: lancamentoId, p_motivo: motivo.trim() })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        : await (supabase as any).rpc('oc_recebimento_gesto', {
            p_lancamento_id: lancamentoId, p_gesto: gesto, p_motivo: motivo.trim(), p_parcelas: parcelas, p_simular: false });
      if (error) return normalizarErroRpc(error).message;
      if (data && data.ok === false) return String(data.motivo ?? 'Não foi possível.');
      const v = Number(data?.operacao_versao);
      if (Number.isFinite(v)) onVersaoChange(v);
      await recarregar();
      return null;
    } finally {
      setOcupado(false);
    }
  }, [operacaoId, versaoAtual, onVersaoChange, recarregar]);

  return {
    contaCorrente, loading, erro, ocupado, recarregar, sincronizarEntregas, listarVinculaveis, vincularRecebimento,
    explicarSaldo, desfazerExplicacao, simularExplicacao, lerRolCancelamento, listarLotes, listarContas, gestoNoTitulo,
  };
}

const lista = (v: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x)) : {})) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Le o envelope de `oc_cancelar_rol`. Modelo titulo devolve `null` (nada extra a listar). */
export function lerRol(raw: unknown): RolCancelamento | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = Object.fromEntries(Object.entries(raw));
  const comps = lista(r.compromissos).map(e => ({ componente: String(e.componente ?? ''), valor: Number(e.valor) || 0,
    vencimento: txt(e.vencimento), descricao: txt(e.descricao) }));
  /* P32 — o modelo antigo: o banco lista so' os compromissos que fecham junto (OC-CANCELAR-CASCATA-01) */
  if (r.modelo === 'titulo') {
    return { modelo: 'titulo', entregas: [], explicacoes: [], recebimentos: [], saidas: [], compromissos: comps, despesas: [],
             titulosSaida: [], avisos: [], bloqueios: [] };
  }
  if (r.modelo !== 'conta_corrente') return null;
  return {
    modelo: 'conta_corrente',
    entregas: lista(r.entregas).map(e => ({ data: String(e.data ?? ''), loteOrdem: e.lote_ordem == null ? null : Number(e.lote_ordem), valor: Number(e.valor) || 0 })),
    explicacoes: lista(r.explicacoes).map(e => ({ tipo: String(e.tipo ?? ''), valor: Number(e.valor) || 0, conta: txt(e.conta) })),
    recebimentos: lista(r.recebimentos).map(e => ({ data: String(e.data ?? ''), valor: Number(e.valor) || 0,
      contaAtual: txt(e.conta_atual), contaOriginal: txt(e.conta_original), acao: String(e.acao ?? '') })),
    saidas: lista(r.saidas).map(e => ({ data: String(e.data ?? ''), cab: Number(e.cab) || 0, categoria: txt(e.categoria), origem: String(e.origem ?? '') })),
    compromissos: comps,
    despesas: lista(r.despesas).map(e => ({ componente: String(e.componente ?? ''), nome: txt(e.nome), favorecido: txt(e.favorecido),
      valor: Number(e.valor) || 0, pago: Number(e.pago) || 0 })),
    titulosSaida: lista(r.titulos_saida).map(e => ({ data: String(e.data ?? ''), valor: Number(e.valor) || 0, descricao: txt(e.descricao) })),
    avisos: Array.isArray(r.avisos) ? r.avisos.map(a => String(a)) : [],
    bloqueios: lista(r.bloqueios).map(e => String(e.descricao ?? '')),
  };
}
