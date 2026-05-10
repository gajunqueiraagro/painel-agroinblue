/**
 * Fonte única e soberana de "tipo_uso" do solo.
 *
 * Modelo:
 *   pastos.tipo_uso          → uso cadastral atual (estável até reclassificar)
 *   fechamento_pastos.tipo_uso_mes → snapshot mensal (herda do cadastral por padrão)
 *
 * Conceitos derivados (NÃO armazenar no banco):
 *   - grupo: pecuaria | agricultura | ambiental | infraestrutura
 *   - operacional_pecuaria: entra na área produtiva pecuária do denominador
 *   - exige_rebanho: ao fechar pasto, exige quantidade > 0
 *
 * Lista oficial fechada. Adicionar valor novo exige decisão arquitetural,
 * não decisão de UI ou import.
 *
 * Tolerância a legado: as funções aceitam string genérica e retornam
 * false/null para valores desconhecidos (ex: 'pecuaria', 'pecuario',
 * 'divergencia' que existem no banco mas serão migrados em Passo C).
 */

// ─── Listas oficiais ────────────────────────────────────────────────────────

export const TIPOS_USO_PECUARIA = [
  'cria',
  'recria',
  'engorda',
  'vedado',
  'reforma_pecuaria',
] as const;

export const TIPOS_USO_AGRICULTURA = [
  'agricultura', // provisório — granularidade por cultura a definir
] as const;

export const TIPOS_USO_AMBIENTAL = [
  'reserva',
  'app',
] as const;

export const TIPOS_USO_INFRAESTRUTURA = [
  'benfeitorias',
] as const;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TipoUsoPecuaria = typeof TIPOS_USO_PECUARIA[number];
export type TipoUsoAgricultura = typeof TIPOS_USO_AGRICULTURA[number];
export type TipoUsoAmbiental = typeof TIPOS_USO_AMBIENTAL[number];
export type TipoUsoInfraestrutura = typeof TIPOS_USO_INFRAESTRUTURA[number];

export type TipoUso =
  | TipoUsoPecuaria
  | TipoUsoAgricultura
  | TipoUsoAmbiental
  | TipoUsoInfraestrutura;

export type GrupoUso = 'pecuaria' | 'agricultura' | 'ambiental' | 'infraestrutura';

// ─── Sets para lookup O(1) ──────────────────────────────────────────────────

const SET_PEC = new Set<string>(TIPOS_USO_PECUARIA);
const SET_AGRI = new Set<string>(TIPOS_USO_AGRICULTURA);
const SET_AMB = new Set<string>(TIPOS_USO_AMBIENTAL);
const SET_INFRA = new Set<string>(TIPOS_USO_INFRAESTRUTURA);
const SET_EXIGE_REBANHO = new Set<string>(['cria', 'recria', 'engorda']);

// ─── Funções soberanas ──────────────────────────────────────────────────────
// Aceitam string genérica para tolerar valores legados do banco
// (ex: 'pecuaria', 'pecuario', 'divergencia') sem quebrar leitura.

export function isTipoUsoValido(t: string | null | undefined): t is TipoUso {
  if (!t) return false;
  return SET_PEC.has(t) || SET_AGRI.has(t) || SET_AMB.has(t) || SET_INFRA.has(t);
}

export function grupoDoTipoUso(t: string | null | undefined): GrupoUso | null {
  if (!t) return null;
  if (SET_PEC.has(t)) return 'pecuaria';
  if (SET_AGRI.has(t)) return 'agricultura';
  if (SET_AMB.has(t)) return 'ambiental';
  if (SET_INFRA.has(t)) return 'infraestrutura';
  return null;
}

export function isOperacionalPecuaria(t: string | null | undefined): boolean {
  if (!t) return false;
  return SET_PEC.has(t);
}

export function exigeRebanhoNoFechamento(t: string | null | undefined): boolean {
  if (!t) return false;
  return SET_EXIGE_REBANHO.has(t);
}

// ─── Listas explícitas para consumidores que precisam iterar ────────────────

export const TIPOS_USO_EXIGEM_REBANHO: ReadonlyArray<TipoUso> = ['cria', 'recria', 'engorda'];
export const TIPOS_USO_OPERACIONAIS_PECUARIA: ReadonlyArray<TipoUso> = TIPOS_USO_PECUARIA;

// ─── UI: opções agrupadas com labels ────────────────────────────────────────

export interface TipoUsoOption {
  value: TipoUso;
  label: string;
}

export interface TipoUsoGrupoOption {
  grupo: GrupoUso;
  label: string;
  options: ReadonlyArray<TipoUsoOption>;
}

export const TIPOS_USO_OPTIONS_AGRUPADAS: ReadonlyArray<TipoUsoGrupoOption> = [
  {
    grupo: 'pecuaria',
    label: 'Pecuária',
    options: [
      { value: 'cria', label: 'Cria' },
      { value: 'recria', label: 'Recria' },
      { value: 'engorda', label: 'Engorda' },
      { value: 'vedado', label: 'Vedado' },
      { value: 'reforma_pecuaria', label: 'Reforma Pecuária' },
    ],
  },
  {
    grupo: 'agricultura',
    label: 'Agricultura',
    options: [
      { value: 'agricultura', label: 'Agricultura' },
    ],
  },
  {
    grupo: 'ambiental',
    label: 'Ambiental',
    options: [
      { value: 'reserva', label: 'Reserva Legal' },
      { value: 'app', label: 'APP' },
    ],
  },
  {
    grupo: 'infraestrutura',
    label: 'Infraestrutura',
    options: [
      { value: 'benfeitorias', label: 'Benfeitorias' },
    ],
  },
];

export const TIPOS_USO_OPTIONS_FLAT: ReadonlyArray<TipoUsoOption> =
  TIPOS_USO_OPTIONS_AGRUPADAS.flatMap(g => g.options);

export function labelDoTipoUso(t: string | null | undefined): string {
  if (!t) return '';
  const found = TIPOS_USO_OPTIONS_FLAT.find(o => o.value === t);
  return found?.label || t;
}
