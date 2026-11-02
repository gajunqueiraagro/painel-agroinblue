/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — os nomes (e, no grupo que já existe, as ligações) PRESOS à divisão pelo PONTO INTERIOR: quando as linhas
 * mudam, o nome vai para a divisão que contém o ponto. "Nomear clicando": cada clique numa divisão dá a próxima letra, na ordem dos cliques.
 * Puro: nada de mapa nem de banco aqui.
 */
import type { Divisao } from '@/lib/mapa/criarPiquetes';
import { nomeSugerido } from '@/lib/mapa/criarPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import { pontoDentro, pontoInterior } from '@/lib/mapa/linhasDosPiquetes';

export interface NomePreso { ponto: Ponto; nome: string; liga: string | null }
export interface JaUsados { nomes: ReadonlySet<string>; ligas: ReadonlySet<string> }
export type GeradorDeNome = (usados: JaUsados) => { nome: string; liga: string | null };

export const chaveDoNome = (s: string) => s.trim().toLowerCase();

/** A letra da divisão `i` (A, B… Z, AA…). */
export const letraDoIndice = (i: number) => nomeSugerido('', i).slice(1);

/** O 1º nome livre "<prefixo>A", "<prefixo>B"… (sem repetir os usados, sem caixa). */
export function proximoNomeLivre(prefixo: string, usados: ReadonlySet<string>): string {
  for (let i = 0; i < 2000; i++) {
    const nome = `${prefixo}${letraDoIndice(i)}`;
    if (!usados.has(chaveDoNome(nome))) return nome;
  }
  return `${prefixo}?`;
}

/** Um nome por divisão, na ordem delas: o nome fica com a divisão que CONTÉM o ponto dele; divisão sem nome ganha um novo (do `gerar`); duas
 *  divisões fundidas (dois pontos numa só) ficam com o 1º e o outro nome volta a ficar livre. */
export function presosDasDivisoes(divs: readonly Divisao[], presos: readonly NomePreso[], gerar: GeradorDeNome): NomePreso[] {
  const consumidos = new Set<number>();
  const saida: (NomePreso | null)[] = divs.map(d => {
    const dentro = presos.map((p, k) => ({ p, k })).filter(x => !consumidos.has(x.k) && pontoDentro(d.geojson, x.p.ponto));
    dentro.forEach(x => consumidos.add(x.k));
    return dentro.length ? dentro[0].p : null;
  });
  const nomes = new Set(saida.flatMap(p => (p ? [chaveDoNome(p.nome)] : [])));
  const ligas = new Set(saida.flatMap(p => (p && p.liga ? [p.liga] : [])));
  return saida.map((p, i) => {
    if (p) return p;
    const g = divs[i].geojson;
    const novo = gerar({ nomes, ligas });
    nomes.add(chaveDoNome(novo.nome));
    if (novo.liga) ligas.add(novo.liga);
    return { ponto: g ? pontoInterior(g) : [0, 0], nome: novo.nome, liga: novo.liga };
  });
}

/** O clique da vez: a divisão `i` ganha `nome`; se outra já tinha esse nome, ela fica com o que a `i` tinha (os nomes nunca repetem). */
export function nomearClicando(presos: readonly NomePreso[], i: number, nome: string): NomePreso[] {
  if (i < 0 || i >= presos.length) return [...presos];
  const velho = presos[i].nome;
  return presos.map((p, k) => {
    if (k === i) return { ...p, nome };
    if (chaveDoNome(p.nome) === chaveDoNome(nome)) return { ...p, nome: velho };
    return p;
  });
}

/** Zera os nomes (Recomeçar): as divisões ficam sem nome até o próximo clique. */
export const semNomes = (presos: readonly NomePreso[]): NomePreso[] => presos.map(p => ({ ...p, nome: '' }));

/** A ordem da lista: pelo nome (números pelo valor: "P2" antes de "P10"); sem nome por último, mantendo a ordem do mapa. */
export function ordemDaLista(nomes: readonly string[]): number[] {
  return nomes.map((nome, i) => ({ nome, i })).sort((a, b) => {
    if (!a.nome.trim() !== !b.nome.trim()) return a.nome.trim() ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }) || a.i - b.i;
  }).map(x => x.i);
}
