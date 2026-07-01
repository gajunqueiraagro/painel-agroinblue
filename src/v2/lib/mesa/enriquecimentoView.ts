// ============================================================================
// enriquecimentoView — módulo PURO (sem React, sem Supabase, sem RPC/write).
// Só adapter/selector: mapeia a shape do banco (vw_classificacao_staging_preview
// / SessaoClassificacaoResumo) para os ViewModels burros da Mesa Global de
// Enriquecimento. NENHUMA regra de negócio nova: as decisões (grava/mantém/órfão)
// vêm prontas das flags will_* da view; aqui só há projeção e formatação.
// Selectors de contagem/filtro/melhor-sessão são EXTRAÇÃO da lógica que hoje
// está inline no MesaClassificacaoTab (não é duplicação — passa a morar aqui).
// ============================================================================
import type {
  ClassificacaoStagingPreviewRow,
  SessaoClassificacaoResumo,
} from '@/v2/hooks/useClassificacaoStaging';
import type { EnriqRowVM, EnriqSessaoVM, EnriqContagensVM, EnriqStatus } from '@/v2/components/mesa/enriquecimento/types';

// ── Adapters ────────────────────────────────────────────────────────────────

/** Linha da view → ViewModel da linha. Só projeção de campos + flags da view. */
export function toRowVM(row: ClassificacaoStagingPreviewRow): EnriqRowVM {
  return {
    id: row.staging_id,
    data: row.excel_data ?? row.lanc_data_pagamento,
    valor: row.excel_valor ?? row.lanc_valor,
    descricao: row.lanc_descricao ?? row.excel_fornecedor ?? row.excel_produto,
    status: row.match_status as EnriqStatus,
    aplicado: row.aplicado,
    subcentroAtual: row.lanc_subcentro_atual,
    subcentroProposto: row.proposto_subcentro ?? row.excel_subcentro,
    gravaSubcentro: row.will_set_subcentro,
    subcentroOrfao: row.will_create_subcentro_orfao,
    favorecidoAtual: row.lanc_favorecido_nome_atual,
    favorecidoProposto: row.proposto_favorecido_nome ?? row.excel_fornecedor,
    gravaFavorecido: row.will_set_favorecido,
    mudaAlgo: row.will_change_anything,
  };
}

/** Resumo de sessão → ViewModel do seletor. Só formatação de label. */
export function toSessaoVM(s: SessaoClassificacaoResumo): EnriqSessaoVM {
  return {
    id: s.sessao_id,
    label: `${s.excel_ano_mes ?? '—'} · ${s.total} linhas · ${s.exatos} exatos`,
    exatos: s.exatos,
    ambiguos: s.ambiguos,
    aplicados: s.aplicados,
  };
}

// ── Selectors (extração da lógica inline do MesaClassificacaoTab) ────────────

/** Contagens por status + aplicados (espelha countsPorStatus). */
export function contarContagens(staging: ClassificacaoStagingPreviewRow[]): EnriqContagensVM {
  const c: EnriqContagensVM = { total: staging.length, exatos: 0, ambiguos: 0, semMatch: 0, aplicados: 0 };
  for (const r of staging) {
    if (r.match_status === 'exato') c.exatos++;
    else if (r.match_status === 'ambiguo') c.ambiguos++;
    else if (r.match_status === 'sem_match') c.semMatch++;
    if (r.aplicado) c.aplicados++;
  }
  return c;
}

/** N de exatos ainda aplicáveis (espelha headerStats: exato && !aplicado). */
export function contarAplicaveisExatos(staging: ClassificacaoStagingPreviewRow[]): number {
  return staging.filter((r) => r.match_status === 'exato' && !r.aplicado).length;
}

/** Filtro por status sobre os VMs já mapeados. */
export function filtrarPorStatus(rows: EnriqRowVM[], filtro: EnriqStatus | 'todos'): EnriqRowVM[] {
  return filtro === 'todos' ? rows : rows.filter((r) => r.status === filtro);
}

/**
 * Sessão mais útil na abertura (extração da regra hoje no useEffect do
 * MesaClassificacaoTab): maior (exatos+ambiguos), desempate por criada_em desc.
 * Retorna null se não houver sessão com utilidade > 0.
 */
export function escolherMelhorSessaoId(sessoes: SessaoClassificacaoResumo[] | undefined | null): string | null {
  if (!sessoes || sessoes.length === 0) return null;
  const ordenadas = [...sessoes].sort((a, b) => {
    const ua = a.exatos + a.ambiguos, ub = b.exatos + b.ambiguos;
    if (ub !== ua) return ub - ua;
    return b.criada_em.localeCompare(a.criada_em);
  });
  const melhor = ordenadas[0];
  return melhor && (melhor.exatos + melhor.ambiguos) > 0 ? melhor.sessao_id : null;
}
