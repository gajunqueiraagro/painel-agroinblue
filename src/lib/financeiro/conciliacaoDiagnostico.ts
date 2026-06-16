/**
 * Diagnóstico operacional de movimentos OFX.
 * Pure function. Não faz I/O. Não classifica conciliado por valor.
 *
 * REGRA SOBERANA: m.status é a fonte de verdade.
 * - status === 'conciliado'  → 'conciliado' (não é pendência, painel ignora)
 * - status === 'ignorado'    → 'ignorado'   (não é pendência, painel ignora)
 * - status === 'parcial'     → diagnosticar como pendência
 * - status === 'nao_conciliado' → diagnosticar como pendência
 *
 * Para pendências, ordem de classificação:
 *   1. Par OFX cross-account → 'transferencia_provavel'
 *   2. qtCandidatosSistema === 0 → 'banco_orfao'
 *   3. qtCandidatosSistema === 1 → 'candidato_unico'
 *   4. qtCandidatosSistema  > 1 → 'multiplos_candidatos'
 *
 * Motivo da ordem: transferência interna é informação operacional dominante.
 * Mesmo que tenha candidato financeiro com sinal estranho, o sinal mais útil
 * pro operador é "isso parece transferência".
 *
 * CTAs neste PR são placeholder. Toast "Ação em próximo PR".
 */
import type { MovimentoEnriquecido } from './extratoEnriquecer';

export type DiagClasse =
  | 'conciliado'
  | 'ignorado'
  | 'banco_orfao'
  | 'candidato_unico'
  | 'multiplos_candidatos'
  | 'transferencia_provavel';

export interface DiagClasseInfo {
  label: string;
  short: string;
  ctaLabel: string;
  badgeCls: string; // Tailwind para o badge clicável
}

export const DIAG_INFO: Record<DiagClasse, DiagClasseInfo> = {
  conciliado: {
    label: 'Conciliado',
    short: '',
    ctaLabel: '',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  ignorado: {
    label: 'Ignorado',
    short: '',
    ctaLabel: '',
    badgeCls: 'bg-muted text-muted-foreground border-muted',
  },
  banco_orfao: {
    label: 'Banco órfão',
    short: 'Sem lançamento',
    ctaLabel: 'Criar lançamento',
    badgeCls: 'bg-red-50 text-red-700 border-red-300',
  },
  candidato_unico: {
    label: 'Candidato único',
    short: 'Sugestão encontrada',
    ctaLabel: 'Vincular sugestão',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-300',
  },
  multiplos_candidatos: {
    label: 'Múltiplos candidatos',
    short: 'Revisar candidatos',
    ctaLabel: 'Resolver',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-300',
  },
  transferencia_provavel: {
    label: 'Transferência provável',
    short: 'Par de transferência',
    ctaLabel: 'Marcar transferência',
    badgeCls: 'bg-violet-50 text-violet-700 border-violet-300',
  },
};

/** Classes consideradas "pendência" — entram no painel e ganham badge na linha. */
export const CLASSES_PENDENTES: ReadonlyArray<DiagClasse> = [
  'banco_orfao',
  'candidato_unico',
  'multiplos_candidatos',
  'transferencia_provavel',
];

/**
 * Classifica 1 movimento.
 * Status é soberano. Par OFX tem prioridade sobre candidatos financeiros.
 */
export function classificarMovimento(
  mov: MovimentoEnriquecido,
  paresOfx: ReadonlySet<string>,
  confirmadosOfx?: ReadonlySet<string>,
): DiagClasse {
  // Status soberano — não inferimos conciliação por valor aplicado.
  if (mov.status === 'conciliado') return 'conciliado';
  if (mov.status === 'ignorado') return 'ignorado';

  // PR-Det-5a — transferência confirmada deixa de ser pendência.
  // Reusa 'conciliado' (estado resolvido); o selo na linha comunica o detalhe.
  if (confirmadosOfx?.has(mov.id)) return 'conciliado';

  // Demais status ('nao_conciliado' e 'parcial') são pendências — diagnosticar.
  // 1. Par OFX cross-account vence candidato financeiro.
  if (paresOfx.has(mov.id)) return 'transferencia_provavel';

  // 2. Candidatos financeiros.
  const qt = mov.qtCandidatosSistema ?? 0;
  if (qt === 0) return 'banco_orfao';
  if (qt === 1) return 'candidato_unico';
  return 'multiplos_candidatos';
}

/** Agrega contadores por classe sobre um conjunto de movimentos. */
export function agregarPorClasse(
  movs: ReadonlyArray<MovimentoEnriquecido>,
  paresOfx: ReadonlySet<string>,
  confirmadosOfx?: ReadonlySet<string>,
): Record<DiagClasse, number> {
  const out: Record<DiagClasse, number> = {
    conciliado: 0,
    ignorado: 0,
    banco_orfao: 0,
    candidato_unico: 0,
    multiplos_candidatos: 0,
    transferencia_provavel: 0,
  };
  for (const m of movs) {
    out[classificarMovimento(m, paresOfx, confirmadosOfx)]++;
  }
  return out;
}

export interface ResumoOperacional {
  totalLinhas: number;
  totalPendencias: number;
  acionaveis: number;   // têm pista: candidato_unico + multiplos_candidatos + transferencia_provavel
  semPista: number;     // banco_orfao
}

/**
 * Deriva o resumo operacional do agregado por classe.
 * Puro, sem I/O. `totalLinhas` é informado pelo caller (qt de movimentos OFX).
 */
export function derivarResumoOperacional(
  agg: Record<DiagClasse, number>,
  totalLinhas: number,
): ResumoOperacional {
  const totalPendencias = CLASSES_PENDENTES.reduce((s, k) => s + agg[k], 0);
  const semPista = agg.banco_orfao;
  return {
    totalLinhas,
    totalPendencias,
    acionaveis: totalPendencias - semPista,
    semPista,
  };
}
