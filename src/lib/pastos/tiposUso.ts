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

// Silvicultura — FAMÍLIA PRÓPRIA, não destino dentro de Agricultura.
// Criada em 19/08/2026 por decisão arquitetural: silvicultura tem ciclo, custo e
// receita distintos da lavoura, e misturá-los distorceria qualquer indicador de
// agricultura. 'eucalipto' JÁ EXISTIA no banco desde 2023-08 (399 linhas em
// fechamento_pastos, Faz. Sta. Luzia, ~27 mil ha-mês) sem constar desta lista —
// a lista se dizia fechada e o dado real a contradizia. A Sta. Luzia depende dela.
export const TIPOS_USO_SILVICULTURA = [
  'eucalipto',
] as const;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TipoUsoPecuaria = typeof TIPOS_USO_PECUARIA[number];
export type TipoUsoAgricultura = typeof TIPOS_USO_AGRICULTURA[number];
export type TipoUsoAmbiental = typeof TIPOS_USO_AMBIENTAL[number];
export type TipoUsoInfraestrutura = typeof TIPOS_USO_INFRAESTRUTURA[number];
export type TipoUsoSilvicultura = typeof TIPOS_USO_SILVICULTURA[number];

export type TipoUso =
  | TipoUsoPecuaria
  | TipoUsoAgricultura
  | TipoUsoAmbiental
  | TipoUsoInfraestrutura
  | TipoUsoSilvicultura;

export type GrupoUso = 'pecuaria' | 'agricultura' | 'ambiental' | 'infraestrutura' | 'silvicultura';

// ─── Sets para lookup O(1) ──────────────────────────────────────────────────

const SET_PEC = new Set<string>(TIPOS_USO_PECUARIA);
const SET_AGRI = new Set<string>(TIPOS_USO_AGRICULTURA);
const SET_AMB = new Set<string>(TIPOS_USO_AMBIENTAL);
const SET_INFRA = new Set<string>(TIPOS_USO_INFRAESTRUTURA);
const SET_SILVI = new Set<string>(TIPOS_USO_SILVICULTURA);
const SET_EXIGE_REBANHO = new Set<string>(['cria', 'recria', 'engorda']);

// ─── Funções soberanas ──────────────────────────────────────────────────────
// Aceitam string genérica para tolerar valores legados do banco
// (ex: 'pecuaria', 'pecuario', 'divergencia') sem quebrar leitura.

export function isTipoUsoValido(t: string | null | undefined): t is TipoUso {
  if (!t) return false;
  return SET_PEC.has(t) || SET_AGRI.has(t) || SET_AMB.has(t) || SET_INFRA.has(t) || SET_SILVI.has(t);
}

export function grupoDoTipoUso(t: string | null | undefined): GrupoUso | null {
  if (!t) return null;
  if (SET_PEC.has(t)) return 'pecuaria';
  if (SET_AGRI.has(t)) return 'agricultura';
  if (SET_AMB.has(t)) return 'ambiental';
  if (SET_INFRA.has(t)) return 'infraestrutura';
  if (SET_SILVI.has(t)) return 'silvicultura';
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
    grupo: 'silvicultura',
    label: 'Silvicultura',
    options: [
      { value: 'eucalipto', label: 'Eucalipto' },
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
// A paleta separa as FASES DO CICLO, que é o motivo de a cor existir:
// cria emerald · recria orange · engorda indigo — três famílias cromáticas
// distintas, legíveis lado a lado. A paleta anterior punha cria em emerald e
// recria em green, quase o mesmo tom, e ainda fazia reforma_pecuaria dividir o
// case de cria; agora reforma_pecuaria é red, caso próprio, porque é pasto FORA
// de produção e deve saltar. vedado slate · agricultura blue · divergencia amber.
// reserva/app/benfeitorias compartilham gray: não são fase de ciclo, e antes caíam
// no neutro por omissão — agora é escolha declarada.
//
// ATENÇÃO — esta paleta AINDA NÃO é a da aplicação inteira.
// ResumoPastosTab.tsx:38 e ResumoAtividadesView.tsx:11 mantêm tabelas próprias,
// e nelas LARANJA significa CRIA — aqui significa RECRIA. A mesma cor diz coisas
// opostas em telas diferentes até o PR-UI-PASTO-CORES-03 migrar as duas.
// Não "corrigir" uma ponta só: isso troca a divergência de lugar.

export function corDoTipoUso(t: string | null | undefined): string {
  if (!t) return 'bg-muted/40 text-muted-foreground border-border/50';
  switch (t) {
    case 'cria':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'recria':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'engorda':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'vedado':
      return 'bg-slate-100 text-slate-600 border-slate-300';
    case 'reforma_pecuaria':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'agricultura':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'eucalipto':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'reserva':
    case 'app':
    case 'benfeitorias':
      return 'bg-gray-200 text-gray-800 border-gray-400';
    case 'divergencia':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    default:
      return 'bg-muted/40 text-muted-foreground border-border/50';
  }
}

// Fundo de linha — ESPELHA corDoTipoUso na COR, diluído para o fundo não competir
// com os dados da linha. Os `case` estão na MESMA ordem da outra função, de
// propósito: lidas lado a lado, uma divergência salta aos olhos.
//
// O que não pode divergir é a COR; o degrau e o alpha são ajuste de legibilidade,
// porque badge e fundo de linha não se comportam igual. 'engorda' é o caso vivo:
// purple-50 no badge, purple-100 no tint — o 50 desaparece como fundo, ao lado das
// linhas de recria. Mesma cor, degrau escolhido para ela ser visível.
//
// As duas derivam da mesma decisão de cor e mudam JUNTAS. Alterar uma sem a outra
// reintroduz exatamente o defeito que o PR-UI-PASTO-CORES-02B corrigiu — recria com
// badge laranja sobre fundo verde, engorda com badge roxo sobre fundo azul, dentro
// do próprio módulo que existe para ser a fonte única.
export function tintDoTipoUso(t: string | null | undefined): string {
  if (!t) return 'transparent';
  switch (t) {
    case 'cria':
      return 'rgba(236, 253, 245, 0.4)'; // emerald-50/40
    case 'recria':
      return 'rgba(255, 247, 237, 0.5)'; // orange-50/50
    case 'engorda':
      return 'rgba(224, 231, 255, 0.6)'; // indigo-100/60
    case 'vedado':
      return 'rgba(241, 245, 249, 0.4)'; // slate-100/40
    case 'reforma_pecuaria':
      return 'rgba(254, 242, 242, 0.5)'; // red-50/50
    case 'agricultura':
      return 'rgba(219, 234, 254, 0.3)'; // blue-100/30
    case 'eucalipto':
      return 'rgba(240, 253, 250, 0.5)'; // teal-50/50
    case 'reserva':
    case 'app':
    case 'benfeitorias':
      return 'rgba(229, 231, 235, 0.5)'; // gray-200/50
    case 'divergencia':
      return 'rgba(254, 243, 199, 0.3)'; // amber-100/30
    default:
      return 'transparent';
  }
}
