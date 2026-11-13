/**
 * LOTES-03 F1 (Gabriel 06/11/2026, mock lotes-03-assistente.html) — o contrato da tela de Lotes com o banco.
 * O lote guarda só identidade e estratégia; cabeças, peso, GMD e pasto vêm do fechamento (`fn_lotes_da_fazenda`), nunca se gravam.
 * Escritas: `fn_lote_cadastro_salvar`, `fn_lote_salvar`, `fn_lote_situacao` (todas com `p_simular`; trilha em `audit_log`).
 */
export type TipoDoCadastro = 'categoria' | 'raca' | 'atividade' | 'sistema' | 'programa' | 'destino';

/** Uma linha de `rebanho_lote_cadastros`. `sigla` só em categoria, raça e atividade; `categoriasRebanho` só na categoria. */
export interface CadastroDoLote {
  id: string;
  tipo: TipoDoCadastro;
  sigla: string | null;
  nome: string;
  categoriasRebanho: string[];
  ordem: number;
  ativo: boolean;
  /** LOTE-PADRAO-V3 · L2 — o cadastro de uma categoria FIXA do rebanho (117590) */
  fixo?: boolean;
}

/** LOTE-SIGLA-EDITAR-01 — um lote cujo código muda quando a sigla em uso muda (prévia e resposta de `fn_lote_cadastro_salvar`). */
export interface TrocaDeCodigo { id: string; antes: string; depois: string }

export type SituacaoDoLote = 'ativo' | 'encerrado' | 'cancelado';

/** Uma linha de `fn_lotes_da_fazenda(p_fazenda, p_ano_mes)`. Os números do fechamento são nulos sem lançamento ("—"). */
export interface LoteDaLista {
  id: string;
  codigo: string;
  codigosAntigos: string[];
  nomeCampeiro: string | null;
  situacao: SituacaoDoLote;
  formadoEm: string;          // 'aaaa-mm-dd'
  encerradoEm: string | null;
  categoriaId: string;
  racaId: string;
  atividadeId: string;
  numero: number;
  sistemaId: string | null;
  programaId: string | null;
  destinoId: string | null;
  safra: string | null;
  carimbo: string | null;
  idadeMediaMeses: number | null;
  metaPesoKg: number | null;
  metaGmdKg: number | null;
  metaData: string | null;
  versao: number;
  /** do fechamento (fonte única) */
  anoMesDado: string | null;
  cabecas: number | null;
  pesoMedioKg: number | null;
  gmdKg: number | null;
  pastos: string[];
  lancamentos: number;
  /** o que falta conferir no lote (117440); nulo = nada a conferir */
  conferir: string | null;
  /** L1 (Gabriel 09/11) — o lote leva carimbo (a regra do assistente, `aceitaCarimbo`), lida no `useLotesDaFazenda`; sem a leitura = não */
  daCria?: boolean;
  /** LOTE-ETAPAS-01 (117540) — fora do código; nulos nos lotes de antes. Opcionais: a lista antiga (e os testes dela) seguem valendo. */
  situacaoCria?: SituacaoDaCria | null;
  ordemParto?: OrdemDoParto | null;
  mamotesSexo?: SexoDosMamotes | null;
  mamotesCruzamento?: CruzamentoDosMamotes | null;
  mamotesSemen?: SemenDosMamotes | null;
  anotacao?: string | null;
  /** nulo = código ATIV-CAT-RAÇA-NN (lotes até 11/11); 'etapas' = ATIV-CAT-RAÇA[-carimbo], -02/-03 só quando repetir */
  codigoRegra?: 'etapas' | null;
  /** LOTE-CARIMBOS-01 (117580) — os carimbos dos bezerros ao pé (1..n); `carimbo` = o 1º */
  carimbos?: string[] | null;
  /** LOTE-PADRAO-V3 · L2 (117590/117595) — o cadastro padrão; nulos no legado. `categoriaFixa` = o código da categoria do rebanho do
   *  cadastro marcado fixo (nula = lote de antes, que segue no assistente antigo até a L6) */
  categoriaFixa?: string | null;
  composicaoRacas?: string[] | null;
  nascidoDe?: string | null;
  nascidoAte?: string | null;
  criaAoPe?: string | null;
  prenhez?: string | null;
  prenhaDe?: string | null;
  prenhaRacaId?: string | null;
  partoPrevisto?: string | null;
  bezerrosPaiRacaId?: string | null;
  carimbosCab?: (number | null)[] | null;
  programaLote?: string | null;
  metodoReproducao?: string | null;
  entradaNovilha?: string | null;
  sistemaLote?: string | null;
  marcadores?: string[] | null;
}

/** Os campos que `fn_lote_salvar` aceita em `p_campos` (só as chaves que vierem mudam). */
export interface CamposDoLote {
  categoria_id?: string;
  raca_id?: string;
  atividade_id?: string;
  numero?: number;
  nome_campeiro?: string;
  formado_em?: string;
  sistema_id?: string;
  programa_id?: string;
  destino_id?: string;
  safra?: string;
  carimbo?: string;
  idade_media_meses?: string;
  meta_peso_kg?: string;
  meta_gmd_kg?: string;
  meta_data?: string;
  /** vazio = conferido */
  conferir?: string;
  /** LOTE-ETAPAS-01 — vazio = limpar */
  situacao_cria?: string;
  ordem_parto?: string;
  mamotes_sexo?: string;
  mamotes_cruzamento?: string;
  mamotes_semen?: string;
  anotacao?: string;
  /** LOTE-CARIMBOS-01 — a lista inteira (vazia = sem carimbo); substitui `carimbo` nas gravações novas */
  carimbos?: string[];
  /** LOTE-PADRAO-V3 · L2 (117590) — vazio/[] = limpar; `categoria_rebanho` = o código fixo (o banco acha ou cria o cadastro) */
  categoria_rebanho?: string;
  composicao_racas?: string[];
  nascido_de?: string;
  nascido_ate?: string;
  cria_ao_pe?: string;
  prenhez?: string;
  prenha_de?: string;
  prenha_raca_id?: string;
  parto_previsto?: string;
  bezerros_pai_raca_id?: string;
  carimbos_cab?: (number | null)[];
  programa_lote?: string;
  metodo_reproducao?: string;
  entrada_novilha?: string;
  sistema_lote?: string;
  marcadores?: string[];
}

/** LOTE-CARIMBOS-01 — a faixa do código, espelho da `_fn_carimbos_faixa` (117580): 1 carimbo = ele mesmo; vários = os meses distintos
 *  em ordem, a ressinc. à parte ("7.1, 7.2, 8.1" → "7/8"; "7.1, 7R" → "7/7R"); nenhum = null. */
export function carimbosFaixa(carimbos: readonly string[] | null | undefined): string | null {
  const lista = (carimbos ?? []).filter(Boolean);
  if (lista.length === 0) return null;
  if (lista.length === 1) return lista[0];
  const partes = new Map<string, [number, number]>();
  for (const c of lista) {
    const m = Number(/^[0-9]+/.exec(c)?.[0] ?? 0); const r = c.includes('R') ? 1 : 0;
    partes.set(`${m}${r ? 'R' : ''}`, [m, r]);
  }
  return [...partes.entries()].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map(([t]) => t).join('/');
}

/* ── LOTE-ETAPAS-01 (Gabriel 11/11 08:45, D2/D3) — as listas fixas: as MESMAS dos CHECK da 117540 ─────────────────────────────── */
export type SituacaoDaCria = 'PR' | 'PA' | 'PP' | 'VZ' | 'SL' | 'DS';
export type OrdemDoParto = 'PRI' | 'SEC' | 'MUL';
export type SexoDosMamotes = 'M' | 'F' | 'MF';
export type CruzamentoDosMamotes = 'nelore' | 'f1_angus' | 'meio_charoles' | 'meio_senepol' | 'outro';
export type SemenDosMamotes = 'convencional' | 'sexado_f' | 'sexado_m' | 'touro';

/** [valor gravado, sigla no chip, nome] */
export const SITUACOES_DA_CRIA: readonly (readonly [SituacaoDaCria, string, string])[] = [
  ['PR', 'PR', 'Prenha (mojada)'], ['PA', 'PA', 'Parida com bezerro'], ['PP', 'PP', 'Parida prenha'], ['VZ', 'VZ', 'Parida vazia'],
  ['SL', 'SL', 'Solteira (sem cria)'], ['DS', 'DS', 'Descarte'],
];
export const ORDENS_DO_PARTO: readonly (readonly [OrdemDoParto, string, string])[] = [['PRI', 'PRI', 'Primípara'], ['SEC', 'SEC', 'Secundípara'], ['MUL', 'MUL', 'Multípara']];
export const SEXOS_DOS_MAMOTES: readonly (readonly [SexoDosMamotes, string, string])[] = [['M', 'M', 'Machos'], ['F', 'F', 'Fêmeas'], ['MF', 'MF', 'Misto']];
export const CRUZAMENTOS_DOS_MAMOTES: readonly (readonly [CruzamentoDosMamotes, string, string])[] = [
  ['nelore', 'NEL', 'Nelore'], ['f1_angus', '½ANG', 'F1 Angus'], ['meio_charoles', '½CHA', '½ Charolês'], ['meio_senepol', '½SEN', '½ Senepol'], ['outro', 'OUT', 'Outro'],
];
export const SEMENS_DOS_MAMOTES: readonly (readonly [SemenDosMamotes, string, string])[] = [
  ['convencional', 'CONV', 'Convencional'], ['sexado_f', 'SXF', 'Sexado fêmea'], ['sexado_m', 'SXM', 'Sexado macho'], ['touro', 'TOU', 'Touro'],
];
/** parida = PA, PP ou VZ: pede o carimbo e os mamotes ao pé; a mojada (PR) nunca pede (a mesma regra da `fn_lote_salvar`) */
export const ehParida = (s: SituacaoDaCria | null | undefined): boolean => s === 'PA' || s === 'PP' || s === 'VZ';

const daLista = <T extends string>(lista: readonly (readonly [T, string, string])[], v: unknown): T | null =>
  lista.find(x => x[0] === v)?.[0] ?? null;
export const situacaoDaCria = (v: unknown) => daLista(SITUACOES_DA_CRIA, v);
export const ordemDoParto = (v: unknown) => daLista(ORDENS_DO_PARTO, v);
export const sexoDosMamotes = (v: unknown) => daLista(SEXOS_DOS_MAMOTES, v);
export const cruzamentoDosMamotes = (v: unknown) => daLista(CRUZAMENTOS_DOS_MAMOTES, v);
export const semenDosMamotes = (v: unknown) => daLista(SEMENS_DOS_MAMOTES, v);
export const nomeNaLista = (lista: readonly (readonly [string, string, string])[], v: string | null | undefined): string | null =>
  lista.find(x => x[0] === v)?.[2] ?? null;

/** LOTE-ETAPAS-01 (D1) — o código dos lotes NOVOS: ATIV-CAT-RAÇA[-carimbo]; repetido entre os vivos da fazenda = -02, -03… (o próprio
 *  lote não conta). Espelho da `_fn_lote_codigo_etapas` (117540): quem grava é o banco; aqui é só a prévia do trilho. Parte que falta = "__". */
export function codigoPorEtapas(ativ: string | null, cat: string | null, raca: string | null, carimbo: string | null,
  vivos: readonly { id: string; codigo: string; situacao: SituacaoDoLote }[] = [], idProprio: string | null = null): string {
  const p = (s: string | null) => s ?? '__';
  const c = carimbo?.trim();
  const base = `${p(ativ)}-${p(cat)}-${p(raca)}${c ? `-${c}` : ''}`;
  if (!ativ || !cat || !raca) return base;
  const usados = new Set(vivos.filter(l => l.situacao !== 'cancelado' && l.id !== idProprio).map(l => l.codigo));
  let cod = base;
  for (let i = 2; usados.has(cod) && i <= 99; i++) cod = `${base}-${String(i).padStart(2, '0')}`;
  return cod;
}

/** O código ATIV-CAT-RAÇA-NN (LOTES-04, Gabriel 07/11: começa pela atividade; D5 hífen); parte ainda não escolhida = "__".
 *  Mesma ordem da `_fn_lote_codigo` (113200). */
export function codigoDoLote(cat: string | null, raca: string | null, ativ: string | null, numero: number | null): string {
  const p = (s: string | null) => s ?? '__';
  return `${p(ativ)}-${p(cat)}-${p(raca)}-${numero == null ? '__' : String(numero).padStart(2, '0')}`;
}

/** LOTES-05 (Gabriel 08/11) — o carimbo do mês: 7.1, 7.2 … e a ressinc. 7R, 7R.2 (7R = o 1º). Mesma regra da 113220. */
export const CARIMBO_VALIDO = /^(1[0-2]|[1-9])(\.[1-9][0-9]?|R(\.[1-9][0-9]?)?)$/;
export const FRASE_CARIMBO_INVALIDO = 'Carimbo: mês.lote, ex.: 7.1 (julho, 1º lote) ou 7R (ressinc. de julho).';

/** LOTES-05 — o nome do lote na tela (modal, lista, ficha): na cria com carimbo, só o carimbo ("7.1"); sem carimbo, o código
 *  (recria, engorda, confinamento e a cria sem carimbo levam o nº automático). O código segue no banco, no title e na busca. */
export function nomeDoLote(l: { codigo: string; carimbo: string | null }): string {
  return l.carimbo?.trim() || l.codigo;
}

export const FRASE_SEM_CARIMBO = 'sem carimbo · definir';
/** L1 (Gabriel 09/11 07:58) — o nome no POPUP, na LISTA e no SELETOR: a cria mostra o carimbo; a cria SEM carimbo mostra
 *  "sem carimbo · definir" (o código vai no title/ao lado); fora da cria, o código. Frases e o "Usar o lote" seguem com `nomeDoLote`. */
export function nomeNaTela(l: { codigo: string; carimbo: string | null; daCria?: boolean; carimbos?: string[] | null }): string {
  /* LOTE-CARIMBOS-01 — com vários carimbos, todos ("7.1 · 7.2 · 8.1") */
  if (l.carimbos && l.carimbos.length > 1) return l.carimbos.join(' · ');
  return l.carimbo?.trim() || (l.daCria ? FRASE_SEM_CARIMBO : l.codigo);
}
/** O código aparece ao lado (title, cinza) quando o nome na tela não é ele. */
export const codigoAoLado = (l: { codigo: string; carimbo: string | null; daCria?: boolean }): string | null =>
  (nomeNaTela(l) === l.codigo ? null : l.codigo);
