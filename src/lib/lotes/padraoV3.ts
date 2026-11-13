/**
 * LOTE-PADRAO-V3 · L2 (mock lote-padrao-v3.html, aprovado 12/11 13:31; ordem de parto Chat 14:10; Chat 14:35) — o cadastro padrão do lote,
 * igual para todos os clientes. Listas FIXAS do AGROinBLUE (as mesmas dos CHECK da 117590); o cliente só acrescenta raças e marcadores.
 * Nada de sigla sozinha na tela: sempre a palavra inteira. Quem grava é a fn_lote_salvar (as frases do banco são as mesmas daqui).
 */
import type { CadastroDoLote } from './tipos';

export type CategoriaFixa = 'vacas' | 'novilhas' | 'desmama_f' | 'desmama_m' | 'garrotes' | 'bois' | 'touros';
export type CriaAoPe = 'solteira' | 'parida';
export type Prenhez = 'vazia' | 'prenha' | 'sem_diagnostico';
export type PrenhaDe = 'iatf' | 'monta';
export type OrdemDoPartoV3 = 'SEM' | 'PRI' | 'SEC' | 'MUL';
export type ProgramaDoLote = 'reproducao' | 'recria' | 'terminacao' | 'descarte' | 'venda';
export type MetodoReproducao = 'iatf' | 'iatf_repasse' | 'monta';
export type EntradaNovilha = 'superprecoce' | 'precoce' | 'convencional';
export type SistemaDoLote = 'pasto' | 'pasto_suplemento' | 'tip' | 'semi' | 'confinamento';

/** [valor gravado, nome por extenso] — a ordem é a da tela */
export type Lista<T extends string> = readonly (readonly [T, string])[];

/** as 7 categorias fixas: [código do rebanho, nome, sigla fixa] — o espelho da _fn_lote_categoria_fixa (117590) */
export const CATEGORIAS_FIXAS: readonly (readonly [CategoriaFixa, string, string])[] = [
  ['vacas', 'Vacas', 'VAC'], ['novilhas', 'Novilhas', 'NOV'], ['desmama_f', 'Desmama fêmea', 'DSF'], ['desmama_m', 'Desmama macho', 'DSM'],
  ['garrotes', 'Garrotes', 'GAR'], ['bois', 'Bois', 'BOI'], ['touros', 'Touros', 'TOU'],
];
export const CRIA_AO_PE: Lista<CriaAoPe> = [['solteira', 'Solteira'], ['parida', 'Parida']];
export const PRENHEZ: Lista<Prenhez> = [['vazia', 'Vazia'], ['prenha', 'Prenha'], ['sem_diagnostico', 'Sem diagnóstico']];
export const PRENHA_DE: Lista<PrenhaDe> = [['iatf', 'IATF'], ['monta', 'Monta natural']];
export const ORDENS_V3: Lista<OrdemDoPartoV3> = [['SEM', 'Sem parto'], ['PRI', 'Primípara'], ['SEC', 'Secundípara'], ['MUL', 'Multípara']];
export const PROGRAMAS: Lista<ProgramaDoLote> = [
  ['reproducao', 'Reprodução'], ['recria', 'Recria'], ['terminacao', 'Terminação (abate)'], ['descarte', 'Descarte'], ['venda', 'Venda'],
];
export const METODOS: Lista<MetodoReproducao> = [['iatf', 'IATF'], ['iatf_repasse', 'IATF + repasse'], ['monta', 'Monta natural']];
export const ENTRADAS: Lista<EntradaNovilha> = [['superprecoce', 'Superprecoce'], ['precoce', 'Precoce'], ['convencional', 'Convencional']];
export const SISTEMAS: Lista<SistemaDoLote> = [
  ['pasto', 'Pasto'], ['pasto_suplemento', 'Pasto + suplemento'], ['tip', 'TIP'], ['semi', 'Semiconfinamento'], ['confinamento', 'Confinamento'],
];

export const nomeDe = <T extends string>(lista: Lista<T>, v: T | null | undefined): string | null => lista.find(x => x[0] === v)?.[1] ?? null;
export const nomeDaCategoria = (c: CategoriaFixa | null | undefined): string | null => CATEGORIAS_FIXAS.find(x => x[0] === c)?.[1] ?? null;

/** a fase pela sigla da atividade (C/R/E e as de antes) */
export type FaseV3 = 'cria' | 'recria' | 'engorda';
/** as categorias fixas de cada fase (cria: matrizes e touros; recria: desmama, garrotes, novilhas; engorda: bois, garrotes, novilhas, vacas) */
const DA_FASE: Record<FaseV3, readonly CategoriaFixa[]> = {
  cria: ['vacas', 'novilhas', 'touros'],
  recria: ['desmama_f', 'desmama_m', 'garrotes', 'novilhas'],
  engorda: ['bois', 'garrotes', 'novilhas', 'vacas'],
};
export function categoriasDaFase(fase: FaseV3 | null, escolhida: CategoriaFixa | null): CategoriaFixa[] {
  const lista = fase ? [...DA_FASE[fase]] : CATEGORIAS_FIXAS.map(c => c[0]);
  return escolhida && !lista.includes(escolhida) ? [...lista, escolhida] : lista;
}

/** fêmeas = vacas, novilhas, desmama fêmea: só elas têm situação e ordem de parto */
export const ehFemea = (c: CategoriaFixa | null | undefined): boolean => c === 'vacas' || c === 'novilhas' || c === 'desmama_f';
/** situação e ordem de parto: só na cria e só fêmeas (recria e engorda pulam) */
export const temReproducao = (fase: FaseV3 | null, c: CategoriaFixa | null | undefined): boolean => fase === 'cria' && ehFemea(c) && c !== 'desmama_f';

/**
 * O cadastro de categoria que o banco vai usar (o espelho da _fn_lote_categoria_fixa): 1:1 com a categoria do rebanho e a mesma sigla fixa,
 * senão o mesmo nome; nenhum = null (o banco cria com a sigla fixa). Só para o CÓDIGO na tela — quem decide é o banco.
 */
export function cadastroDaCategoria(cadastros: readonly CadastroDoLote[], idsDoRebanho: ReadonlyMap<string, string>, c: CategoriaFixa): CadastroDoLote | null {
  const fixa = CATEGORIAS_FIXAS.find(x => x[0] === c);
  const idReb = idsDoRebanho.get(c);
  if (!fixa || !idReb) return null;
  const candidatos = cadastros.filter(k => k.tipo === 'categoria' && k.ativo && k.categoriasRebanho.length === 1 && k.categoriasRebanho[0] === idReb);
  return candidatos.find(k => k.sigla === fixa[2]) ?? candidatos.find(k => k.nome.toLowerCase() === fixa[1].toLowerCase()) ?? null;
}
export function siglaDaCategoria(cadastros: readonly CadastroDoLote[], idsDoRebanho: ReadonlyMap<string, string>, c: CategoriaFixa | null): string | null {
  if (!c) return null;
  return cadastroDaCategoria(cadastros, idsDoRebanho, c)?.sigla ?? CATEGORIAS_FIXAS.find(x => x[0] === c)?.[2] ?? null;
}

/** A idade média em meses pelo nascimento de/até (o meio da faixa) num dia; sem data = null. Nunca digitada. */
export function idadeMedia(nascidoDe: string, nascidoAte: string, hoje: string): number | null {
  const d = (s: string) => (s ? new Date(`${s}T12:00:00`) : null);
  const a = d(nascidoDe) ?? d(nascidoAte); const b = d(nascidoAte) ?? d(nascidoDe); const h = d(hoje);
  if (!a || !b || !h) return null;
  const meio = new Date((a.getTime() + b.getTime()) / 2);
  return Math.max(0, Math.round((h.getTime() - meio.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
}

/** marcadores: sem espaço sobrando, sem repetir, até 10, cada um até 32 letras (as regras do banco) */
export function marcadoresLimpos(lista: readonly string[]): string[] {
  const vistos = new Set<string>(); const out: string[] = [];
  for (const m of lista.map(x => x.trim()).filter(Boolean)) { if (!vistos.has(m)) { vistos.add(m); out.push(m.slice(0, 32)); } }
  return out.slice(0, 10);
}
