/**
 * MAPA-02a — as FAIXAS DE LOTAÇÃO do mapa de pastos, num lugar só (D2, Gabriel 31/10/2026: 300/500).
 * Antes eram duas cópias com 280/600 (`usePastoOcupacao` e o histórico do Gestor) e um "ideal 440" fixo.
 *   sem animais (ou kg/ha 0) → vazio · < 300 → sublotado · 300 a 500 → ideal · > 500 → carga alta.
 *   sem fechamento no mês (kg/ha desconhecido) → null: a tela mostra "—", nunca 0 nem "vazio".
 */
import { calcUA, calcUAHa } from '@/lib/calculos/zootecnicos';

export type FaixaLotacao = 'vazio' | 'sublotado' | 'ideal' | 'carga_alta';

export const LIMITE_SUBLOTADO = 300;
export const LIMITE_CARGA_ALTA = 500;

export function faixaDaLotacao(kgHa: number | null | undefined): FaixaLotacao | null {
  if (kgHa == null || Number.isNaN(kgHa)) return null;
  if (kgHa <= 0) return 'vazio';
  if (kgHa < LIMITE_SUBLOTADO) return 'sublotado';
  if (kgHa <= LIMITE_CARGA_ALTA) return 'ideal';
  return 'carga_alta';
}

export const ROTULO_DA_FAIXA: Record<FaixaLotacao, string> = {
  ideal: `Ideal (${LIMITE_SUBLOTADO}–${LIMITE_CARGA_ALTA})`,
  sublotado: `Sublotado (< ${LIMITE_SUBLOTADO})`,
  carga_alta: `Carga alta (> ${LIMITE_CARGA_ALTA})`,
  vazio: 'Vazio',
};

/** As cores das faixas (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`). */
export const COR_DA_FAIXA: Record<FaixaLotacao, string> = {
  ideal: '#3E9E5F',
  sublotado: '#E2B53E',
  carga_alta: '#D0453A',
  vazio: '#9AA3AE',
};

/** Sem fechamento no mês: a cor do "sem dado" (mais clara que o vazio). */
export const COR_SEM_FECHAMENTO = '#D5DAE0';

/** O status antigo das views (Operação), para quem ainda o lê: mesma régua, outro nome. */
export type StatusOcupacao = 'sem_ocupacao' | 'atencao' | 'adequado' | 'pressao';
export function statusDaFaixa(f: FaixaLotacao | null): StatusOcupacao {
  if (f === 'sublotado') return 'atencao';
  if (f === 'ideal') return 'adequado';
  if (f === 'carga_alta') return 'pressao';
  return 'sem_ocupacao';
}

/**
 * MAPA-02a-fix1 (3) — a lotação em UA/ha do mapa: a MESMA regra do Fechamento (`calcUA`: cabeças × peso médio ÷ 450; `calcUAHa`: ÷ área),
 * sem fórmula nova. Sem cabeças ou sem área: null ("—").
 */
export function uaPorHa(cabecas: number | null | undefined, pesoMedioKg: number | null | undefined, areaHa: number | null | undefined): number | null {
  if (cabecas == null || !(areaHa && areaHa > 0)) return null;
  return calcUAHa(calcUA(cabecas, pesoMedioKg ?? null), areaHa);
}

/** "0,92 UA/ha" (2 casas, pt-BR); null quando não há valor. */
export function textoUaHa(ua: number | null): string | null {
  return ua == null ? null : `${ua.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UA/ha`;
}
