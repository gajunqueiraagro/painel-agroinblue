/**
 * useEditPermissions — calcula permissões de edição de um lançamento
 * zootécnico a partir do próprio registro + status oficial do mês.
 *
 * F2 (zoo-edit): hook puro, sem efeitos colaterais. Vai alimentar o futuro
 * `LancamentoZooEditModal` (F4) decidindo se o modal abre em modo edição,
 * leitura ou edição parcial (apenas campos não-estruturais).
 *
 * Regra soberana — INDEPENDENTE DA UI:
 *   As permissões são calculadas EXCLUSIVAMENTE a partir do próprio
 *   lançamento (`cancelado`, `data`, `fazenda_id`, `cenario`) e do status
 *   oficial do mês correspondente (`useStatusPilares` filtrado por
 *   `lancamento.fazenda_id` + `ano_mes` derivado de `lancamento.data`).
 *
 *   NÃO importa FazendaContext, NÃO lê isGlobal, NÃO lê fazendaAtual.
 *
 *   O mesmo lançamento deve produzir o MESMO resultado de permissão
 *   independente da tela de origem (Global, fazenda individual, DRE,
 *   Movimentações, Conferência, etc.).
 *
 * Bloqueios cobertos nesta versão:
 *   - 'cancelado'    → `cancelado === true`. canEdit=false, canEditEstrutural=false.
 *   - 'mes_fechado'  → status_pilares.p1_mapa_pastos.status === 'oficial' E cenario='realizado'.
 *                      canEdit=true (campos não-estruturais), canEditEstrutural=false.
 *                      META bypassa P1 (Gabriel: planejamento sempre editável).
 *   - 'sem_permissao' → reservado para F7+ (detecção via RLS error no save).
 *                       Não calculado proativamente aqui.
 *
 * Bloqueio NÃO coberto nesta versão (será F7):
 *   - Vínculo com financeiro conciliado/pago.
 */
import { useStatusPilares } from './useStatusPilares';
import type { LancamentoRow } from './useLancamento';

export type EditBlockReason = 'mes_fechado' | 'cancelado' | 'sem_permissao' | null;

export interface EditPermissions {
  /** Pode salvar alguma edição? `false` quando lançamento cancelado ou sem permissão. */
  canEdit: boolean;
  /** Pode alterar campos estruturais (data, qtd, categoria, fazenda)?
   *  `false` em mês fechado + cenário realizado — apenas observação/peso editáveis. */
  canEditEstrutural: boolean;
  /** Motivo do bloqueio mais restritivo aplicável. `null` quando edição totalmente liberada. */
  blockReason: EditBlockReason;
}

const UNLOCKED: EditPermissions = {
  canEdit: true,
  canEditEstrutural: true,
  blockReason: null,
};

const PARCIAL_MES_FECHADO: EditPermissions = {
  canEdit: true,
  canEditEstrutural: false,
  blockReason: 'mes_fechado',
};

const BLOQUEADO_CANCELADO: EditPermissions = {
  canEdit: false,
  canEditEstrutural: false,
  blockReason: 'cancelado',
};

const PENDENTE: EditPermissions = {
  // Lançamento ausente — modal ainda carregando ou id inválido. Bloquear até
  // dados confirmados; caller deve diferenciar via `loading` do useLancamento.
  canEdit: false,
  canEditEstrutural: false,
  blockReason: null,
};

export function useEditPermissions(lancamento: LancamentoRow | null | undefined): EditPermissions {
  // useStatusPilares precisa ser sempre chamado (regras dos hooks).
  // Passamos undefined quando o lançamento ainda não está carregado — o hook
  // retorna status 'provisorio' default, que é tratado abaixo.
  const fazendaId = lancamento?.fazenda_id;
  const anoMes = lancamento ? lancamento.data.substring(0, 7) : undefined;
  const { status } = useStatusPilares(fazendaId, anoMes);

  if (!lancamento) return PENDENTE;

  if (lancamento.cancelado === true) {
    return BLOQUEADO_CANCELADO;
  }

  // META bypassa P1 — planejamento sempre editável.
  if (lancamento.cenario === 'meta') {
    return UNLOCKED;
  }

  // P1 oficial bloqueia campos estruturais; observação/peso continuam livres.
  const p1Oficial = status?.p1_mapa_pastos?.status === 'oficial';
  if (p1Oficial) {
    return PARCIAL_MES_FECHADO;
  }

  return UNLOCKED;
}
