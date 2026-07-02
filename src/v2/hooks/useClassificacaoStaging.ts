/**
 * useClassificacaoStaging — wrappers React Query para as RPCs do PR-M:
 *   - fn_classificacao_populate_staging(sessao_id, cliente_id, rows)
 *   - fn_classificacao_apply(sessao_id)
 *   + SELECT * FROM financeiro_classificacao_staging WHERE sessao_id = $1
 *
 * Tipos do supabase ainda não regenerados após PR-M aplicado via
 * Chrome MCP (PR-M2: sincronizar quando regenerar). Casts `(supabase as any)`
 * são intencionais e padrão do projeto para RPCs/tabelas novas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClassificacaoRow } from '@/v2/lib/excelPreview/loteToClassificacao';

// PR-M2: sincronizar com fn_classificacao_populate_staging quando types regenerarem.
export type MatchStatus =
  | 'exato'
  | 'ambiguo'
  | 'sem_match'
  | 'ja_classificado'
  | 'divergente';

/**
 * @deprecated PR-M4: substituído por ClassificacaoStagingPreviewRow.
 * Mantido como referência durante a transição — pode ser removido
 * num PR posterior se nenhum consumidor restante depender deste shape.
 */
export interface ClassificacaoStagingRow {
  staging_id: string;
  sessao_id: string;
  cliente_id: string;
  excel_linha_origem: number | null;
  excel_subcentro: string | null;
  excel_fornecedor: string | null;
  excel_produto: string | null;
  excel_conta_origem: string | null;
  excel_conta_destino: string | null;
  excel_ano_mes: string | null;
  excel_data: string | null;
  excel_valor: number | null;
  excel_tipo_operacao: string | null;
  excel_fazenda_codigo: string | null;
  match_lancamento_id: string | null;
  match_status: MatchStatus;
  update_proposto: Record<string, unknown> | null;
  estado_anterior: Record<string, unknown> | null;
  aplicado: boolean;
  aplicado_em: string | null;
  aplicado_por: string | null;
  erro_apply: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * PR-M4: shape da view vw_classificacao_staging_preview.
 * Enriquece staging com estado vivo do lançamento (lanc_*) + proposta
 * resolvida (proposto_*) + flags calculadas pelo banco (will_set_*,
 * will_change_anything, conflito_subcentro).
 *
 * Flags espelham EXATAMENTE o COALESCE do apply — não duplicar lógica
 * no front.
 */
export interface ClassificacaoStagingPreviewRow {
  staging_id: string;
  sessao_id: string;
  cliente_id: string;
  match_status: MatchStatus;
  aplicado: boolean;
  aplicado_em: string | null;
  aplicado_por: string | null;
  erro_apply: string | null;
  created_at: string;
  updated_at: string;

  // EXCEL
  excel_linha_origem: number | null;
  excel_data: string | null;
  excel_valor: number | null;
  excel_tipo_operacao: string | null;
  excel_conta_origem: string | null;
  excel_conta_destino: string | null;
  excel_subcentro: string | null;
  excel_fornecedor: string | null;
  excel_produto: string | null;
  excel_fazenda_codigo: string | null;
  excel_documento: string | null;   // P0-5: documento do Excel

  // SISTEMA (estado vivo do lançamento)
  lanc_id: string | null;
  lanc_descricao: string | null;
  lanc_observacao: string | null;
  lanc_data_pagamento: string | null;
  lanc_data_competencia: string | null;
  lanc_valor: number | null;
  lanc_sinal: string | null;
  lanc_tipo_operacao: string | null;
  lanc_status: string | null;
  lanc_subcentro_atual: string | null;
  lanc_macro_atual: string | null;
  lanc_grupo_atual: string | null;
  lanc_centro_atual: string | null;
  lanc_plano_conta_id_atual: string | null;
  lanc_favorecido_id_atual: string | null;
  lanc_favorecido_nome_atual: string | null;
  lanc_conta_bancaria_id: string | null;
  lanc_conta_bancaria_nome: string | null;
  lanc_conta_destino_id: string | null;
  lanc_conta_destino_nome: string | null;
  lanc_fazenda_id: string | null;

  // PROPOSTA (apenas o que apply realmente toca)
  proposto_subcentro: string | null;
  proposto_favorecido_id: string | null;
  proposto_favorecido_nome: string | null;

  // FLAGS (calculadas pelo banco — espelham COALESCE do apply)
  will_set_subcentro: boolean;
  will_set_favorecido: boolean;
  /** Flag-mãe (A1): true se QUALQUER campo será gravado. */
  will_change_anything: boolean;
  conflito_subcentro: boolean;

  // PR-M5-A2: proteção anti-órfão (cells em vermelho + bloqueio Apply)
  proposto_subcentro_existe_no_plano: boolean;
  will_create_subcentro_orfao: boolean;

  // PR-B: conta canônica (via vw migration 253 — fonte soberana)
  conta_filtro_id: string | null;
  conta_filtro_nome: string | null;

  // PR-U2b: enriquecimento (proposta completa) + _meta (projeção read-only p/ rastreabilidade).
  proposto_fazenda_id: string | null;
  proposto_fazenda_nome: string | null;
  proposto_produto: string | null;
  proposto_safra: string | null;
  proposto_categoria: string | null;
  will_set_fazenda: boolean;        // "muda fazenda": proposta ≠ atual
  proposto_tier: string | null;
  proposto_origem_resolucao: string | null;
  proposto_regra_id: string | null;
  proposto_alias_id: string | null;
  motor_version: number | null;
  proposto_macro: string | null;   // PR-U2c-2A: para FazendaSelect forçar Administrativo em Dividendos
  lanc_fazenda_nome: string | null; // P0-4: nome real da fazenda do lançamento (Sistema Atual)
  lanc_numero_documento: string | null;      // P0-5: documento do lançamento (Sistema Atual)
  proposto_numero_documento: string | null;  // P0-5: documento proposto (editor)
}

export interface PopulateResult {
  sessao_id: string;
  total_linhas: number;
  inseridas: number;
  counts_por_status: Partial<Record<MatchStatus, number>>;
}

export interface ApplyResult {
  sessao_id: string;
  aplicados: number;
  pulados_subcentro_preenchido: number;
  erros: number;
}

function queryKeyStaging(sessaoId: string | null) {
  return ['classificacao-staging', sessaoId ?? null] as const;
}

/**
 * Hook agregador da staging de classificação.
 *
 * @param sessaoId  UUID da sessão (null = sem fetch).
 * @param clienteId Cliente atual (usado em populate; opcional na query).
 */
export function useClassificacaoStaging(
  sessaoId: string | null,
  clienteId: string | null | undefined,
) {
  const qc = useQueryClient();

  const stagingQuery = useQuery({
    queryKey: queryKeyStaging(sessaoId),
    enabled: !!sessaoId,
    queryFn: async () => {
      // PR-M4: view de preview substitui SELECT direto na staging — traz
      // enriquecimento Excel+Sistema+Proposta + flags will_set_*. Tipos
      // do Supabase não regenerados (PR-M2 aplicado via Chrome MCP);
      // cast `(supabase as any)` mantido conforme padrão do projeto.
      const { data, error } = await (supabase as any)
        .from('vw_classificacao_staging_preview')
        .select('*')
        .eq('sessao_id', sessaoId)
        .order('excel_linha_origem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassificacaoStagingPreviewRow[];
    },
    staleTime: 30_000,
  });

  const populateMutation = useMutation({
    mutationFn: async (params: {
      sessao_id: string;
      rows: ClassificacaoRow[];
    }): Promise<PopulateResult> => {
      if (!clienteId) throw new Error('Cliente atual não definido');
      // PR-M2: cast `any` enquanto types não regenerarem.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_populate_staging',
        {
          p_sessao_id: params.sessao_id,
          p_cliente_id: clienteId,
          p_rows: params.rows,
        },
      );
      if (error) throw error;
      return data as PopulateResult;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(variables.sessao_id) });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (sessao_id: string): Promise<ApplyResult> => {
      // PR-M2: cast `any` enquanto types não regenerarem.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_apply',
        { p_sessao_id: sessao_id },
      );
      if (error) throw error;
      return data as ApplyResult;
    },
    onSuccess: (_data, sessao_id) => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(sessao_id) });
    },
  });

  // PR-U1 — escrita por linha (revisão manual). Retorna o jsonb da RPC
  // ({ ok, aplicado, motivo, ... }); a RPC NÃO lança em rejeições de regra
  // (sem_lancamento_vinculado, sem_permissao, etc) — o chamador checa `ok`.
  const invalidarSessaoAtual = () => {
    if (sessaoId) qc.invalidateQueries({ queryKey: queryKeyStaging(sessaoId) });
    if (clienteId) qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
  };

  const applyRowMutation = useMutation({
    mutationFn: async (params: { staging_id: string; overwrite: boolean }): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_apply_row', {
        p_staging_id: params.staging_id,
        p_overwrite: params.overwrite,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  const reverterRowMutation = useMutation({
    mutationFn: async (staging_id: string): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_reverter_row', {
        p_staging_id: staging_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  // PR-U2b — edição da proposta de enriquecimento (subcentro/favorecido/fazenda/
  // produto/safra/categoria) via RPC existente. Retorna o jsonb ({ ok, motivo,
  // update_proposto, campos_aplicados, campos_rejeitados }); o chamador checa `ok`.
  const editarPropostoMutation = useMutation({
    mutationFn: async (params: { staging_id: string; patch: Record<string, unknown> }): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_editar_proposto', {
        p_staging_id: params.staging_id,
        p_patch: params.patch,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  const resetarPropostoMutation = useMutation({
    mutationFn: async (staging_id: string): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_resetar_proposto', {
        p_staging_id: staging_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  return {
    staging: stagingQuery.data ?? [],
    isLoading: stagingQuery.isLoading,
    isFetching: stagingQuery.isFetching,
    populate: populateMutation.mutateAsync,
    isPopulating: populateMutation.isPending,
    populateResult: populateMutation.data ?? null,
    apply: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
    applyResult: applyMutation.data ?? null,
    applyRow: applyRowMutation.mutateAsync,
    isApplyingRow: applyRowMutation.isPending,
    reverterRow: reverterRowMutation.mutateAsync,
    isRevertingRow: reverterRowMutation.isPending,
    editarProposto: editarPropostoMutation.mutateAsync,
    isEditando: editarPropostoMutation.isPending,
    resetarProposto: resetarPropostoMutation.mutateAsync,
    isResetando: resetarPropostoMutation.isPending,
  };
}

// ── PR-P4: listagem read-only de sessões de classificação (para reabrir/trocar) ──
export interface SessaoClassificacaoResumo {
  sessao_id: string;
  excel_ano_mes: string | null;
  total: number;
  exatos: number;
  ambiguos: number;
  sem_match: number;
  aplicados: number;
  criada_em: string;   // max(created_at) da sessão
}

// SOMENTE SELECT: agrega staging por sessão no cliente. Não escreve, não popula, não aplica.
export function useSessoesClassificacao(clienteId: string | null) {
  return useQuery({
    queryKey: ['classificacao-sessoes', clienteId],
    enabled: !!clienteId,
    staleTime: 30_000,
    queryFn: async (): Promise<SessaoClassificacaoResumo[]> => {
      // PR-P4.1 — PostgREST limita ~1000 linhas por request; Santa Rita tem milhares
      // (ex.: 9k+), então um único select escondia sessões (as de Maio sumiam do seletor).
      // Pagina por staging_id (PK → ordem estável, sem pular/duplicar) em blocos de 1000.
      type Row = { sessao_id: string; excel_ano_mes: string | null; match_status: string | null; aplicado: boolean | null; created_at: string };
      const PAGE = 1000;
      const linhas: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await (supabase as any)
          .from('financeiro_classificacao_staging')
          .select('sessao_id, excel_ano_mes, match_status, aplicado, created_at')
          .eq('cliente_id', clienteId)
          .order('staging_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as Row[];
        linhas.push(...batch);
        if (batch.length < PAGE) break;
        if (from > 200_000) break; // salvaguarda anti-loop
      }
      const map = new Map<string, SessaoClassificacaoResumo>();
      for (const r of linhas) {
        const k = r.sessao_id;
        const cur = map.get(k) ?? {
          sessao_id: k, excel_ano_mes: r.excel_ano_mes,
          total: 0, exatos: 0, ambiguos: 0, sem_match: 0, aplicados: 0, criada_em: r.created_at,
        };
        cur.total++;
        if (r.match_status === 'exato') cur.exatos++;
        else if (r.match_status === 'ambiguo') cur.ambiguos++;
        else if (r.match_status === 'sem_match') cur.sem_match++;
        if (r.aplicado) cur.aplicados++;
        if (r.created_at > cur.criada_em) cur.criada_em = r.created_at;
        map.set(k, cur);
      }
      return [...map.values()];
    },
  });
}
