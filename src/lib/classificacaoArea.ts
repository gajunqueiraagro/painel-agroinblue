/**
 * Matriz Oficial de Classificação de Áreas
 * =========================================
 * Fonte única de verdade para natureza estrutural e uso operacional de pastos.
 *
 * Natureza Pecuária:        cria, recria, engorda, reforma_pecuaria, vedado
 * Natureza Agricultura:     agricultura
 * Natureza Estrutural/Ambiental: benfeitorias, app, reserva_legal
 *
 * Uso operacional (exige conciliação de cabeças): cria, recria, engorda
 * Pecuário sem lotação (auto-conciliado):         reforma_pecuaria, vedado
 */

export type TipoUsoArea =
  | 'cria'
  | 'recria'
  | 'engorda'
  | 'reforma_pecuaria'
  | 'vedado'
  | 'agricultura'
  | 'app'
  | 'reserva_legal'
  | 'benfeitorias';

export type NaturezaArea = 'pecuaria' | 'agricultura' | 'estrutural_ambiental';

// ── Conjuntos canônicos ──────────────────────────────────────────────

/** Tipos que NÃO pertencem à pecuária */
export const TIPOS_USO_NAO_PECUARIO = new Set<string>([
  'agricultura', 'app', 'reserva_legal', 'benfeitorias',
]);

/** Tipos pecuários que NÃO possuem lotação operacional no mês */
export const TIPOS_PECUARIO_SEM_LOTACAO = new Set<string>([
  'reforma_pecuaria', 'vedado',
]);

/** Todos os tipos de uso disponíveis com label para UI */
export const TIPOS_USO_AREA: { value: TipoUsoArea; label: string; natureza: NaturezaArea }[] = [
  { value: 'cria',              label: 'Cria',              natureza: 'pecuaria' },
  { value: 'recria',            label: 'Recria',            natureza: 'pecuaria' },
  { value: 'engorda',           label: 'Engorda',           natureza: 'pecuaria' },
  { value: 'reforma_pecuaria',  label: 'Reforma Pecuária',  natureza: 'pecuaria' },
  { value: 'vedado',            label: 'Vedado',            natureza: 'pecuaria' },
  { value: 'agricultura',       label: 'Agricultura',       natureza: 'agricultura' },
  { value: 'app',               label: 'APP',               natureza: 'estrutural_ambiental' },
  { value: 'reserva_legal',     label: 'Reserva Legal',     natureza: 'estrutural_ambiental' },
  { value: 'benfeitorias',      label: 'Benfeitorias',      natureza: 'estrutural_ambiental' },
];

// ── Funções de classificação ─────────────────────────────────────────

/** Retorna a natureza estrutural de um tipo de uso */
export function getNatureza(tipo: string | null | undefined): NaturezaArea {
  if (!tipo) return 'pecuaria'; // sem tipo = assume pecuário
  if (tipo === 'agricultura') return 'agricultura';
  if (TIPOS_USO_NAO_PECUARIO.has(tipo)) return 'estrutural_ambiental';
  return 'pecuaria';
}

/** Retorna true se o tipo pertence à natureza pecuária */
export function isTipoPecuario(tipo: string | null | undefined): boolean {
  return getNatureza(tipo) === 'pecuaria';
}

/** Retorna true se o tipo exige conciliação operacional de cabeças */
export function isTipoOperacional(tipo: string | null | undefined): boolean {
  if (!tipo) return true; // sem tipo = assume operacional
  if (TIPOS_USO_NAO_PECUARIO.has(tipo)) return false;
  if (TIPOS_PECUARIO_SEM_LOTACAO.has(tipo)) return false;
  return true;
}

// ── Helpers para entidades de pasto ──────────────────────────────────

interface PastoLike {
  tipo_uso: string;
}

interface FechamentoLike {
  tipo_uso_mes?: string | null;
}

/** Tipo de uso efetivo: prioriza o uso mensal (fechamento) sobre o cadastro */
export function getTipoUsoEfetivo(
  pasto: PastoLike,
  fechamento: FechamentoLike | null | undefined,
): string {
  return fechamento?.tipo_uso_mes || pasto.tipo_uso;
}

/** Retorna true se o pasto (com contexto de fechamento) é pecuário */
export function isPastoPecuario(pasto: PastoLike, fechamento: FechamentoLike | null | undefined): boolean {
  return isTipoPecuario(getTipoUsoEfetivo(pasto, fechamento));
}

/** Retorna true se o pasto exige conciliação operacional de cabeças */
export function isPastoOperacional(pasto: PastoLike, fechamento: FechamentoLike | null | undefined): boolean {
  return isTipoOperacional(getTipoUsoEfetivo(pasto, fechamento));
}
