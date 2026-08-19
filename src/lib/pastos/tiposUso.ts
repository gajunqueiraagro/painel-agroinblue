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

// ─── UI: cor por tipo de uso ────────────────────────────────────────────────
// Fonte única da cor de atividade. Antes vivia como função local não exportada
// em MapaPastosTab.tsx; qualquer segunda tela precisaria copiar o switch, e uma
// cor nova entraria numa cópia só. Aceita string genérica pela mesma razão que
// as funções de domínio: 'divergencia' e outros legados existem no banco.
//
// Seis cores: cria/reforma_pecuaria emerald · recria green · engorda sky
// agricultura blue · vedado slate · divergencia amber · resto neutro.

export function corDoTipoUso(t: string | null | undefined): string {
  if (!t) return 'bg-muted/40 text-muted-foreground border-border/50';
  switch (t) {
    case 'cria':
    case 'reforma_pecuaria':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'recria':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'engorda':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'agricultura':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'vedado':
      return 'bg-slate-100 text-slate-600 border-slate-300';
    case 'divergencia':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    default:
      return 'bg-muted/40 text-muted-foreground border-border/50';
  }
}

export function tintDoTipoUso(t: string | null | undefined): string {
  if (!t) return 'transparent';
  switch (t) {
    case 'cria':
    case 'reforma_pecuaria':
      return 'rgba(236, 253, 245, 0.4)'; // emerald-50/40
    case 'recria':
      return 'rgba(220, 252, 231, 0.3)'; // green-100/30
    case 'engorda':
      return 'rgba(240, 249, 255, 0.4)'; // sky-50/40
    case 'agricultura':
      return 'rgba(219, 234, 254, 0.3)'; // blue-100/30
    case 'vedado':
      return 'rgba(241, 245, 249, 0.4)'; // slate-100/40
    case 'divergencia':
      return 'rgba(254, 243, 199, 0.3)'; // amber-100/30
    default:
      return 'transparent';
  }
}
