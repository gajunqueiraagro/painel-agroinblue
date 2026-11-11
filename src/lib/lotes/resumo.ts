/**
 * LOTES-06 (mock ui-validar/lotes-resumo.html, aprovado 08/11 12:33) — a aba RESUMO da lista de Lotes: os números do rebanho da fazenda
 * pelos lotes, lidos do fechamento (cab., peso e pasto do `fn_lotes_da_fazenda`, a fonte única da lista). PURO.
 *   · os 4 números do topo: cabeças em N lotes · peso médio (ponderado pelas cabeças) · machos · fêmeas · arrobas em estoque (peso vivo ÷ 30);
 *   · 6 quadros: por atividade, raça, sexo, categoria, programa e pasto — cab., peso, % das cabeças e a barra; o total de cada um.
 * ⚠ O SEXO é o da categoria do rebanho do lote (`categorias_rebanho.codigo`: _m, garrotes, bois, touros = machos; _f, novilhas, vacas =
 *   fêmeas). Lote cuja categoria junta os dois (ou nenhuma) fica em "Misto". Lote sem lançamento no mês conta 0 cabeças.
 */
import type { LoteDaLista } from './tipos';
import { faseDaAtividade, nomeDe, type NomesDoCadastro } from './lista';

export type Sexo = 'M' | 'F' | 'misto';
const MACHOS = new Set(['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros']);
const FEMEAS = new Set(['mamotes_f', 'desmama_f', 'novilhas', 'vacas']);

/** O sexo de um conjunto de códigos do rebanho: todos machos, todas fêmeas, ou misto. */
export function sexoDosCodigos(codigos: readonly string[]): Sexo {
  if (codigos.length && codigos.every((c) => MACHOS.has(c))) return 'M';
  if (codigos.length && codigos.every((c) => FEMEAS.has(c))) return 'F';
  return 'misto';
}

/** Soma de um grupo: cabeças, peso ponderado (só dos lotes com peso) e o peso vivo (kg). */
export interface SomaDoGrupo { cabecas: number; pesoMedioKg: number | null; pesoVivoKg: number; lotes: number }
export function somar(lotes: readonly LoteDaLista[]): SomaDoGrupo {
  let cab = 0; let kg = 0; let cabPeso = 0;
  for (const l of lotes) {
    const c = l.cabecas ?? 0;
    cab += c;
    if (l.pesoMedioKg != null && c > 0) { kg += c * l.pesoMedioKg; cabPeso += c; }
  }
  return { cabecas: cab, pesoMedioKg: cabPeso > 0 ? kg / cabPeso : null, pesoVivoKg: kg, lotes: lotes.length };
}

export interface LinhaDoQuadro { rotulo: string; cabecas: number; pesoMedioKg: number | null; pct: number; barra: number }
export interface QuadroDoResumo { titulo: string; coluna: string; linhas: LinhaDoQuadro[]; total: SomaDoGrupo }

/** Um quadro: agrupa, soma, ordena pelas cabeças (maior primeiro; empate pelo rótulo) e calcula a % e a barra (0–1, a maior = 1). */
export function quadro(titulo: string, coluna: string, lotes: readonly LoteDaLista[], chave: (l: LoteDaLista) => string,
  ordemFixa?: (rotulo: string) => number): QuadroDoResumo {
  const g = new Map<string, LoteDaLista[]>();
  for (const l of lotes) { const k = chave(l); g.set(k, [...(g.get(k) ?? []), l]); }
  const total = somar(lotes);
  const somas = [...g.entries()].map(([rotulo, ls]) => ({ rotulo, s: somar(ls) }));
  const maior = Math.max(0, ...somas.map((x) => x.s.cabecas));
  const linhas = somas
    .sort((a, b) => (ordemFixa ? ordemFixa(a.rotulo) - ordemFixa(b.rotulo) : 0) || b.s.cabecas - a.s.cabecas || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .map(({ rotulo, s }) => ({ rotulo, cabecas: s.cabecas, pesoMedioKg: s.pesoMedioKg,
      pct: total.cabecas > 0 ? (s.cabecas / total.cabecas) * 100 : 0, barra: maior > 0 ? s.cabecas / maior : 0 }));
  return { titulo, coluna, linhas, total };
}

export interface ResumoDosLotes {
  total: SomaDoGrupo;
  machos: number;
  femeas: number;
  /** peso vivo ÷ 30 (a arroba em pé); `null` sem peso nenhum */
  arrobas: number | null;
  quadros: QuadroDoResumo[];
}

const ROTULO_DO_SEXO: Record<Sexo, string> = { M: 'Machos', F: 'Fêmeas', misto: 'Misto' };
/** "Em 1 pasto" · "Em 2+ pastos" · "Sem pasto no mês" (o lote sem lançamento) */
export const pastoDoLote = (l: Pick<LoteDaLista, 'pastos'>): string => (l.pastos.length === 0 ? 'Sem pasto no mês' : l.pastos.length === 1 ? 'Em 1 pasto' : 'Em 2+ pastos');

export function resumoDosLotes(lotes: readonly LoteDaLista[], nomes: NomesDoCadastro, sexoDaCategoria: (categoriaId: string) => Sexo): ResumoDosLotes {
  const total = somar(lotes);
  const sexo = (l: LoteDaLista) => sexoDaCategoria(l.categoriaId);
  const sm = somar(lotes.filter((l) => sexo(l) === 'M'));
  const sf = somar(lotes.filter((l) => sexo(l) === 'F'));
  const sigla = (id: string) => nomes.get(id)?.sigla ?? null;
  const nomeDaAtividade = new Map(lotes.map((l) => [nomeDe(nomes, l.atividadeId) ?? '—', faseDaAtividade(sigla(l.atividadeId))]));
  return {
    total,
    machos: sm.cabecas,
    femeas: sf.cabecas,
    arrobas: total.pesoMedioKg == null ? null : total.pesoVivoKg / 30,
    quadros: [
      /* a atividade na ordem da fase (Cria · Recria · Engorda), como na lista */
      quadro('Por atividade', 'Atividade', lotes, (l) => nomeDe(nomes, l.atividadeId) ?? '—', (r) => nomeDaAtividade.get(r) ?? 9),
      quadro('Por raça', 'Raça', lotes, (l) => nomeDe(nomes, l.racaId) ?? '—'),
      quadro('Por sexo', 'Sexo', lotes, (l) => ROTULO_DO_SEXO[sexo(l)]),
      quadro('Por categoria', 'Categoria', lotes, (l) => nomeDe(nomes, l.categoriaId) ?? '—'),
      quadro('Por programa', 'Programa', lotes, (l) => nomeDe(nomes, l.programaId) ?? 'Sem programa'),
      quadro('Por pasto', 'Pasto', lotes, pastoDoLote),
    ],
  };
}
