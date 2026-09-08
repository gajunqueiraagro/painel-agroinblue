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
import { ErroUsuarioSeguro, normalizarErro } from '@/lib/erroOperacional';
import { supabase } from '@/integrations/supabase/client';
import type { ClassificacaoRow } from '@/v2/lib/excelPreview/loteToClassificacao';

// PR-M2: sincronizar com fn_classificacao_populate_staging quando types regenerarem.
/**
 * ⚠ ESTE TIPO É MENOR QUE O CHECK DO BANCO, e fica assim de propósito. A coluna aceita
 * também `ambiguo_resolvido`, `candidatos_proximos`, `resolvido_manual`, `resolvido_grupo`,
 * `ja_aplicado`, `sem_conta_para_match` e — desde 07/09 — `sugestao_grupo` e
 * `sugestao_split`. Ampliá-lo aqui obriga a completar `Record<MatchStatus, …>` em
 * `MesaClassificacaoTab` e `MesaRowCompact`, telas LEGADAS que saíram de circulação: seriam
 * sete mapas a preencher com rótulos que ninguém vê. Quem precisa dos status novos (o
 * adapter da Mesa nova) lê `match_status` como `string` e trata o desconhecido.
 * ⚠ SE ESTE TIPO UM DIA FOR A FONTE DE VERDADE, o lugar de completá-lo é junto da remoção
 * daquelas duas telas — não antes.
 */
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
  /* 133h item 9 — a marca de revisada, persistida (migration 20260908105039). */
  revisado_em: string | null;
  revisado_por: string | null;
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
  /* ── 129c (view de 20260906195410): os seis campos que passaram a gravar ──────
     ⚠ ESTE TIPO É ESCRITO À MÃO e não vem do `types.ts`. Acrescentar a coluna aqui é o
     que a torna visível para o adapter — sem isso ela existe no banco, chega no JSON e o
     TS diz que não existe. Foi assim que `Data venc.` e `Safra` ficaram em "—". */
  lanc_data_vencimento: string | null;
  /* 133a — as datas que o parser passou a ler da planilha, gravadas pelo front. */
  excel_data_pagamento: string | null;
  excel_data_vencimento: string | null;
  casamento_meta: Record<string, unknown> | null;
  match_lancamento_ids: string[] | null;
  lanc_safra_id: string | null;
  lanc_safra_codigo: string | null;
  proposto_safra_id: string | null;
  proposto_safra_codigo: string | null;
  proposto_data_competencia: string | null;
  proposto_data_vencimento: string | null;
  proposto_data_pagamento: string | null;
  proposto_conta_bancaria_id: string | null;
  proposto_observacao: string | null;
  /** P0-1A: fonte única "aplicável em lote" (calculada na view). */
  lote_aplicavel: boolean;
}

/** O que `fn_classificacao_casar_sessao` devolve — 133a. */
export interface CasarSessaoResult {
  casou: number;
  ambiguo: number;
  sugestaoGrupo: number;
  sugestaoSplit: number;
  semPar: number;
  semConta: number;
  naoTocadas: number;
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
      /** Progresso por lote, para a tela não ficar muda em arquivos grandes. */
      onProgresso?: (feitas: number, total: number) => void;
    }): Promise<PopulateResult> => {
      if (!clienteId) throw new Error('Cliente atual não definido');

      /**
       * ⚠ EM LOTES, PORQUE A CHAMADA INTEIRA MORRIA CALADA — ENR-EXCEL-POPULAR.
       *
       * 492 linhas do NJ voltavam "Não foi possível concluir…" e o staging ficava com
       * ZERO: a transação inteira caía e nada era gravado. `authenticated` tem
       * `statement_timeout = 8s`, e a RPC faz, POR LINHA, uma busca de fazenda, duas
       * resoluções de conta e uma de contexto — o custo cresce com o arquivo, então o
       * limite não é uma linha ruim: é o tamanho.
       * ⚠ LOTE É SEGURO AQUI PORQUE A RPC NÃO APAGA NADA. Conferido no corpo dela: zero
       * DELETE, zero TRUNCATE, e o laço é `FOR v_row IN jsonb_array_elements(p_rows)`.
       * Chamar N vezes com a MESMA `sessao_id` acumula — não precisou de `p_append`.
       * ⚠ E O QUE JÁ ENTROU, FICA. Se o lote 4 falhar, os três primeiros continuam no
       * staging e a mensagem diz onde parou: reimportar 492 para recuperar 300 é o
       * desperdício que o "tudo ou nada" cobrava.
       */
      const TAMANHO_LOTE = 100;
      const total = params.rows.length;
      const acumulado: PopulateResult = {
        sessao_id: params.sessao_id, total_linhas: 0, inseridas: 0, counts_por_status: {},
      };

      for (let i = 0; i < total; i += TAMANHO_LOTE) {
        const fatia = params.rows.slice(i, i + TAMANHO_LOTE);
        // PR-M2: cast `any` enquanto types não regenerarem.
        const { data, error } = await (supabase as any).rpc(
          'fn_classificacao_populate_staging',
          { p_sessao_id: params.sessao_id, p_cliente_id: clienteId, p_rows: fatia },
        );
        if (error) {
          /* ⚠ DIZ ONDE PAROU E O QUE JÁ ENTROU — sem vazar o erro do banco. `normalizarErro`
             descarta `message`, `details` e `hint` do PostgREST de propósito (só o SQLSTATE
             conhecido atravessa), e furar isso aqui seria trocar um defeito por outro. O que
             falta ao operador não é o texto do Postgres: é saber quantas linhas se salvaram
             e de onde recomeçar. Isso é do nosso domínio e pode ser dito inteiro.
             ⚠ O SQLSTATE SEGUE PELO CAMINHO NORMAL: 57014 agora tem categoria própria
             ('tempo') e vira "tente com menos linhas", em vez de "procure o suporte". */
          const causa = normalizarErro(error, 'popularStagingClassificacao');
          throw new ErroUsuarioSeguro(
            `${causa.mensagem} Parou no lote que começa na linha ${i + 1} de ${total}; ` +
            `${acumulado.inseridas} linha(s) já estão no staging e não se perdem.`,
          );
        }
        const parcial = data as PopulateResult;
        acumulado.total_linhas += parcial?.total_linhas ?? fatia.length;
        acumulado.inseridas += parcial?.inseridas ?? 0;
        for (const [k, v] of Object.entries(parcial?.counts_por_status ?? {})) {
          const chave = k as MatchStatus;
          acumulado.counts_por_status[chave] = (acumulado.counts_por_status[chave] ?? 0) + (v ?? 0);
        }
        /* ⚠ AS DATAS DE PAGAMENTO E VENCIMENTO ENTRAM AQUI, DEPOIS DA FATIA —
           [ENRIQUECER-MOTOR-01] (133a). `fn_classificacao_populate_staging` lê só
           `data` (competência) e NÃO se mexe nela; as duas colunas novas são gravadas
           pelo front, sobre as linhas que a fatia acabou de inserir.
           ⚠ O POPULATE NÃO DEVOLVE OS IDS — conferido no retorno (`total_linhas`,
           `inseridas`, `counts_por_status`). O par é `sessao_id + excel_linha_origem`,
           que é único por sessão e é a identidade que o operador também usa.
           ⚠ AGRUPADO POR DATA, e não uma requisição por linha: 492 updates seriam 492
           idas. As datas se repetem muito num mês, então são dezenas de chamadas. */
        await gravarDatasDaFatia(params.sessao_id, fatia);
        params.onProgresso?.(Math.min(i + TAMANHO_LOTE, total), total);
      }
      return acumulado;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(variables.sessao_id) });
    },
  });

  /**
   * Grava `excel_data_pagamento` / `excel_data_vencimento` das linhas de uma fatia.
   *
   * ⚠ ISTO NUNCA GRAVOU NADA, e o silêncio é a lição — [ENRIQUECER-TELA-02] (133d).
   * Medido no Proto: `excel_data_pagamento` preenchida em 0 de 551 na sessão de 07/09, e em
   * 0 de 492 em TODAS as sessões desde o 133a. A causa não é o parser nem a planilha:
   * `financeiro_classificacao_staging` tem RLS ligada com UMA policy, de SELECT. Sem policy
   * de UPDATE, o `update()` casa ZERO linhas — e o PostgREST devolve `error: null`, porque
   * atualizar zero linhas não é erro. O `if (error)` abaixo nunca disparou.
   * ⚠ O CONSERTO DE VERDADE É MIGRATION, e não mora aqui: `fn_classificacao_populate_staging`
   * já recebe as duas datas dentro de `p_rows` e simplesmente não as insere. Quem escreve
   * staging é a RPC (SECURITY DEFINER); abrir UPDATE direto para o front seria alargar a
   * superfície de escrita de uma tabela que hoje só o banco escreve.
   * ⚠ ATÉ LÁ, O SILÊNCIO ACABA. Contamos as linhas afetadas e dizemos quando são zero: é a
   * diferença entre "não gravou" e "ninguém sabia que não gravava".
   */
  async function gravarDatasDaFatia(sessaoId: string, fatia: ClassificacaoRow[]) {
    const porChave = new Map<string, number[]>();
    for (const r of fatia) {
      if (!r.data_pagamento && !r.data_vencimento) continue;
      const chave = `${r.data_pagamento ?? ''}|${r.data_vencimento ?? ''}`;
      const atual = porChave.get(chave);
      if (atual) atual.push(r.linha); else porChave.set(chave, [r.linha]);
    }
    let pedidas = 0; let afetadas = 0;
    for (const [chave, linhas] of porChave) {
      const [pag, venc] = chave.split('|');
      pedidas += linhas.length;
      /* `.select('staging_id')` é o que torna o resultado CONTÁVEL: sem ele o PostgREST
         devolve `data: null` e não há como distinguir "gravou" de "não casou nada". */
      const { data, error } = await supabase
        .from('financeiro_classificacao_staging')
        .update({
          excel_data_pagamento: pag || null,
          excel_data_vencimento: venc || null,
        })
        .eq('sessao_id', sessaoId)
        .in('excel_linha_origem', linhas)
        .select('staging_id');
      if (error) { console.error('[staging] falha ao gravar datas da fatia', error); continue; }
      afetadas += (data ?? []).length;
    }
    if (pedidas > 0 && afetadas === 0) {
      /* ⚠ UM AVISO POR FATIA, E ELE DIZ A CONSEQUÊNCIA: sem as datas o casador cai na regra
         do mês, e o operador vê "você decide" onde a data resolveria. */
      console.warn(
        `[staging] as datas de ${pedidas} linha(s) NÃO foram gravadas (0 linhas afetadas). ` +
        'A tabela não tem policy de UPDATE para o front — o casamento cairá na regra do mês.',
      );
    }
  }

  /**
   * O casador do mês — 133a.
   *
   * ⚠ UM MOTOR SÓ. Antes havia dois respondendo "esta linha é qual lançamento?" com
   * números diferentes: o bloco de cima dizia 379 atualizam, a Mesa dizia 183 sem match,
   * na mesma planilha de 492 linhas. Agora o casamento mora no banco, e a Mesa lê.
   * ⚠ O `ano_mes` É O DA RÉGUA, não o da planilha: a competência das linhas do cliente vai
   * de 10/2025 a 09/2026, e o mês que se está conciliando é o que a tela mostra.
   */
  const casarSessaoMutation = useMutation({
    mutationFn: async (params: { sessao_id: string; ano_mes: string }): Promise<CasarSessaoResult> => {
      const { data, error } = await supabase.rpc('fn_classificacao_casar_sessao', {
        p_sessao_id: params.sessao_id, p_ano_mes: params.ano_mes,
      });
      if (error) throw error;
      const e = (data && typeof data === 'object' && !Array.isArray(data)) ? data as Record<string, unknown> : {};
      const n = (k: string) => Number(e[k] ?? 0) || 0;
      return {
        casou: n('casou'), ambiguo: n('ambiguo'),
        sugestaoGrupo: n('sugestao_grupo'), sugestaoSplit: n('sugestao_split'),
        semPar: n('sem_par'), semConta: n('sem_conta'), naoTocadas: n('nao_tocadas'),
      };
    },
    onSuccess: (_d, variables) => {
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
      // P0-1A: o lote muda contadores de aplicados da sessão → invalidar o seletor
      // de sessões também (padrão de invalidarSessaoAtual), senão fica com dado velho.
      if (clienteId) qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
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

  // PR-MESA-RESOLUCAO-01 — decisão humana de 'candidatos_proximos'. Retornam o jsonb
  // ({ ok, motivo, ... }); a RPC NÃO lança em rejeições de regra (nao_candidatos_proximos,
  // candidato_invalido, lancamento_ja_escolhido) — o chamador checa `ok`/`motivo`.
  const resolverProximosMutation = useMutation({
    mutationFn: async (params: { staging_id: string; lancamento_id: string }): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_resolver_proximos', {
        p_staging_id: params.staging_id,
        p_lancamento_id: params.lancamento_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  const desfazerProximosMutation = useMutation({
    mutationFn: async (staging_id: string): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_desfazer_proximos', {
        p_staging_id: staging_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  // PR-MESA-GRUPO-01 — agrupamento manual N:1. Retornam o jsonb ({ ok, motivo, ... });
  // a RPC NÃO lança em rejeições de regra (status_nao_elegivel, soma_divergente,
  // use_resolver_proximos, lancamento_ja_escolhido, ...) — o chamador checa `ok`/`motivo`.
  const resolverGrupoMutation = useMutation({
    mutationFn: async (params: { staging_id: string; lancamento_ids: string[] }): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_resolver_grupo', {
        p_staging_id: params.staging_id,
        p_lancamento_ids: params.lancamento_ids,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  const desfazerGrupoMutation = useMutation({
    mutationFn: async (staging_id: string): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_desfazer_grupo', {
        p_staging_id: staging_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidarSessaoAtual,
  });

  /**
   * N linhas = 1 lançamento — `fn_classificacao_split_substituir` (133c-a).
   *
   * ⚠ ELA FICOU CHAMÁVEL AGORA. Até a migration 20260907173019 os guards (c) e (d)
   * recusavam por construção as linhas que o casador do 133a produz: elas têm
   * `match_lancamento_id` preenchido e, por isso, o lançamento contava como "já
   * referenciado". Ligar o botão antes disso teria dado 100% de `ja_referenciado`.
   * ⚠ O QUE ELA FAZ É PESADO: cria N lançamentos, cancela o consolidado e move o vínculo
   * do extrato. Por isso a tela pergunta antes, na própria linha.
   */
  const splitSubstituirMutation = useMutation({
    mutationFn: async (p: { lancamento_id: string; sessao_id: string; staging_ids: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_classificacao_split_substituir', {
        p_lancamento_id: p.lancamento_id, p_sessao_id: p.sessao_id, p_staging_ids: p.staging_ids,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(sessaoId) });
    },
  });

  /**
   * Apagar uma sessão inteira do staging — 133h item 2 (migration 20260908101255).
   *
   * ⚠ QUEM DECIDE SE PODE É O BANCO, e por isso a tela não conta nada: a RPC recusa quando
   * a sessão tem linha gravada (`aplicado` ou os quatro `match_status` de resolvida) e
   * devolve `{ok:false, motivo:'sessao_com_linhas_gravadas'}`. Uma contagem no front seria
   * uma segunda régua para a mesma pergunta, e as duas divergiriam na primeira regra nova.
   *
   * ⚠ `p_simular` É O ENSAIO: a mesma RPC responde quantas linhas sairiam SEM apagar nada,
   * e é isso que a confirmação inline mostra. O gesto de apagar é o mesmo com
   * `p_simular=false` — sem uma segunda função que pudesse divergir da primeira.
   */
  const excluirSessaoMutation = useMutation({
    mutationFn: async (params: { sessao_id: string; simular: boolean }): Promise<ExcluirSessaoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_classificacao_excluir_sessao', {
        p_sessao_id: params.sessao_id,
        p_simular: params.simular,
      });
      if (error) throw error;
      return (data ?? {}) as ExcluirSessaoResult;
    },
    onSuccess: (_d, variables) => {
      /* Só o que apagou de verdade mexe nas listas; o ensaio não muda nada. */
      if (!variables.simular) {
        qc.invalidateQueries({ queryKey: queryKeyStaging(variables.sessao_id) });
        if (clienteId) qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
      }
    },
  });

  /**
   * "Confirmar" deixa de viver na memória da tela — 133h item 9 (migration 20260908105039).
   *
   * ⚠ ELE SUMIA NO RELOAD, e Gabriel refez linhas por causa disso (07:47). O `revisei` era
   * um `useState` do container: fechar a aba, trocar de sessão ou recarregar apagava a
   * revisão de tudo o que já tinha sido conferido — e nada na tela avisava.
   * ⚠ NÃO É GRAVAÇÃO NO LANÇAMENTO: marca a LINHA da staging. Quem toca o Financeiro é o
   * Salvar; esta RPC só escreve `revisado_em`/`revisado_por` no staging.
   */
  const marcarRevisadaMutation = useMutation({
    mutationFn: async (params: { staging_id: string; revisada: boolean }): Promise<{ ok?: boolean }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_classificacao_marcar_revisada', {
        p_staging_id: params.staging_id,
        p_revisada: params.revisada,
      });
      if (error) throw error;
      return (data ?? {}) as { ok?: boolean };
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
    /* 133a — o casador da sessão, e o "Recasar" da toolbar. */
    casarSessao: casarSessaoMutation.mutateAsync,
    isCasando: casarSessaoMutation.isPending,
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
    // PR-MESA-RESOLUCAO-01
    resolverProximos: resolverProximosMutation.mutateAsync,
    isResolvendoProximos: resolverProximosMutation.isPending,
    desfazerProximos: desfazerProximosMutation.mutateAsync,
    isDesfazendoProximos: desfazerProximosMutation.isPending,
    // PR-MESA-GRUPO-01
    resolverGrupo: resolverGrupoMutation.mutateAsync,
    isResolvendoGrupo: resolverGrupoMutation.isPending,
    desfazerGrupo: desfazerGrupoMutation.mutateAsync,
    isDesfazendoGrupo: desfazerGrupoMutation.isPending,
    // 133c-a — N linhas = 1 lançamento.
    splitSubstituir: splitSubstituirMutation.mutateAsync,
    isSubstituindo: splitSubstituirMutation.isPending,
    // 133h item 2 — apagar uma sessão sem linha gravada.
    excluirSessao: excluirSessaoMutation.mutateAsync,
    isExcluindoSessao: excluirSessaoMutation.isPending,
    // 133h item 9 — "Confirmar" persistido.
    marcarRevisada: marcarRevisadaMutation.mutateAsync,
    isMarcandoRevisada: marcarRevisadaMutation.isPending,
  };
}

/**
 * O que `fn_classificacao_excluir_sessao` devolve.
 *
 * ⚠ `ok:false` NÃO É ERRO DE REDE: é a recusa da regra, com o motivo e o número de linhas
 * gravadas para a tela poder dizer POR QUE não dá. A RPC só lança em sessão inexistente e
 * em falta de permissão.
 */
export interface ExcluirSessaoResult {
  ok: boolean;
  motivo?: string;
  linhas?: number;
  gravadas?: number;
  apagadas?: number;
  simulado?: boolean;
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
