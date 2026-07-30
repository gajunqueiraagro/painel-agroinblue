/**
 * Domínio de STATUS do Financeiro V2 — DONO ÚNICO do vocabulário de
 * `status_transacao` apresentado/gravado pelo Financeiro V2.
 *
 * Criado em PR-FIN-STATUS-UX-03A-1 para eliminar a duplicação que existia entre
 * FinanceiroV2Tab, LancamentoV2Dialog e useFinanceiroV2, SEM tocar o módulo
 * compartilhado `src/lib/statusOperacional.ts` (usado por zootécnico/compra/mesa).
 *
 * ESCOPO / LIMITES:
 *   - NÃO inclui 'conciliado' (estado DERIVADO da conciliação bancária — será
 *     tratado no PR-FIN-OC-LEDGER-SYNC-04). 'conciliado' nunca é escolhido no
 *     modal nem gravado por aqui.
 *   - NÃO se relaciona com o eixo `cenario='meta'` (planejamento). Aqui só se
 *     trata de `status_transacao`.
 */

// ── Domínio oficial (estágio financeiro persistido) ──

/** Fluxo oficial: previsto → agendado → programado → realizado. */
export type StatusFinanceiro = 'previsto' | 'agendado' | 'programado' | 'realizado';

/** Status inicial de um NOVO lançamento (era 'meta' até PR-FIN-STATUS-UX-03A-1). */
export const STATUS_FINANCEIRO_INICIAL: StatusFinanceiro = 'previsto';

/** Ordem oficial do fluxo. */
export const STATUS_FINANCEIRO_ORDEM: StatusFinanceiro[] = [
  'previsto', 'agendado', 'programado', 'realizado',
];

/** Labels de apresentação. */
export const STATUS_FINANCEIRO_LABEL: Record<StatusFinanceiro, string> = {
  previsto: 'Previsto',
  agendado: 'Agendado',
  programado: 'Programado',
  realizado: 'Realizado',
};

/** Cores de texto na grade (padrão cromático atual preservado). */
export const STATUS_FINANCEIRO_COR: Record<StatusFinanceiro, string> = {
  previsto: 'text-cyan-600 dark:text-cyan-400',
  agendado: 'text-purple-600 dark:text-purple-400',
  programado: 'text-blue-600 dark:text-blue-400',
  realizado: 'text-green-700 dark:text-green-400 font-bold',
};

/** Opções do Select do MODAL (seleção única). Sem Meta, sem Conciliado. */
export const STATUS_FINANCEIRO_OPCOES_MODAL: { value: StatusFinanceiro; label: string }[] =
  STATUS_FINANCEIRO_ORDEM.map(v => ({ value: v, label: STATUS_FINANCEIRO_LABEL[v] }));

// ── Filtro da grade (inclui Meta LEGADO como opção própria) ──

/**
 * Chave do filtro Status da grade.
 *
 * LEGADO TRANSITÓRIO — 'meta':
 *   `status_transacao='meta'` permanece persistido (~354 registros). Esta opção
 *   existe apenas para permitir LOCALIZAR os registros antigos na grade. Não
 *   representa reclassificação. Não autoriza migration. Não deve ser agrupada
 *   dentro de "Previsto". Será removida após o saneamento do legado.
 */
export type StatusFiltroFinanceiro = StatusFinanceiro | 'meta';

/** Opções do FILTRO (multisseleção): ordem oficial + Meta (legado) ao fim. */
export const STATUS_FINANCEIRO_OPCOES_FILTRO: { value: StatusFiltroFinanceiro; label: string }[] = [
  ...STATUS_FINANCEIRO_ORDEM.map((v): { value: StatusFiltroFinanceiro; label: string } => ({ value: v, label: STATUS_FINANCEIRO_LABEL[v] })),
  { value: 'meta', label: 'Meta (legado)' },
];

const STATUS_FILTRO_SET = new Set<string>([...STATUS_FINANCEIRO_ORDEM, 'meta']);

/** Guard: a string é uma chave válida do filtro de status? (sem cast, para drill-down externo) */
export function isStatusFiltroFinanceiro(v: unknown): v is StatusFiltroFinanceiro {
  return typeof v === 'string' && STATUS_FILTRO_SET.has(v);
}

/** Labels da grade/filtro por valor persistido — expõe o valor REAL (meta não é mascarado).
 *  Tipado como Record<string,string> para indexação direta pelo status_transacao cru (sem cast). */
export const STATUS_FILTRO_LABEL: Record<string, string> = {
  ...STATUS_FINANCEIRO_LABEL,
  meta: 'Meta (legado)',
};

/** Cores da grade/filtro — Meta (legado) com aparência discreta/muted. */
export const STATUS_FILTRO_COR: Record<string, string> = {
  ...STATUS_FINANCEIRO_COR,
  meta: 'text-muted-foreground',
};

// ── Writers ──

/**
 * Deriva o status pela data de pagamento (writer de novos lançamentos).
 *   sem data → previsto (era 'meta' até PR-FIN-STATUS-UX-03A-1);
 *   data futura → agendado; data passada/hoje → programado.
 */
export function deriveStatusFinanceiro(dataPagamento: string): StatusFinanceiro {
  if (!dataPagamento) return STATUS_FINANCEIRO_INICIAL;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > hoje) return 'agendado';
  return 'programado';
}

/**
 * Normaliza um `status_transacao` persistido para exibição no MODAL (que só
 * conhece os quatro estágios oficiais). Preserva a compatibilidade histórica
 * (confirmado→programado, conciliado→realizado) e mostra o LEGADO 'meta' como
 * 'previsto' (o modal não tem opção Meta). Exibição apenas — nada é gravado
 * até uma ação explícita de salvar.
 */
export function normalizeStatusModal(status?: string | null): StatusFinanceiro {
  const raw = (status || '').trim().toLowerCase();
  switch (raw) {
    case 'agendado': return 'agendado';
    case 'programado':
    case 'confirmado': return 'programado';
    case 'realizado':
    case 'conciliado': return 'realizado';
    case 'previsto':
    case 'meta':
    default: return STATUS_FINANCEIRO_INICIAL; // previsto
  }
}
