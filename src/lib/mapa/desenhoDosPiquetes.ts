/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o DESENHO do "Criar piquetes" como UM dado só (a praça com as cercas dela, as linhas riscadas ou geradas
 * pela grade, o corredor) e os gestos que o editam, todos puros e devolvendo um desenho novo: é o que a pilha do "Desfazer" guarda e o que o
 * rascunho do navegador grava. Editar qualquer linha é o mesmo gesto para a cerca da praça e para a linha riscada; a diferença (a ponta da
 * praça leva o vértice, a da borda gira) mora aqui.
 */
import { cortesIguais, montar, type Divisao } from '@/lib/mapa/criarPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import {
  areasParaGravar, comPontoMovido, piqueteDesenhado, comPontoNaLinha, deslizarParalela, divisoesDasLinhas, infraParaGravar, linhasDaGrade, novoCorredor, semPontoDaLinha,
  type AreaInterna, type AreaParaGravar, type InfraParaGravar, type LinhaDeCorte,
} from '@/lib/mapa/linhasDosPiquetes';
import {
  areaDaPraca, centroDaPraca, cercaComPontos, cercasComoLinhas, comFixa, deslizarCerca, girarCerca, moverVertice, semCerca,
  type FormatoDaPraca, type MedidaDaPraca, type PracaCentral,
} from '@/lib/mapa/pracaCentral';

/** 'poligonos' (PIQUETE-POLIGONO-01, Gabriel 03/11 21:37): cada piquete é um polígono desenhado dentro do pasto ("+ Piquete") */
export type ModoDosPiquetes = 'praca' | 'linhas' | 'grade' | 'iguais' | 'poligonos';
/** As escolhas da barra que o rascunho também guarda. */
export interface ConfigDosPiquetes {
  modo: ModoDosPiquetes; n: number; formato: FormatoDaPraca; medida: MedidaDaPraca; refLado: number; cocho: boolean;
  linhasGrade: number; colunas: number; girado: boolean; larguraCorredor: number; prefixo: string;
}

/** `piquetes` (PIQUETE-POLIGONO-01): os polígonos desenhados no "+ Piquete", na ordem em que nasceram; opcional, o rascunho de antes não tem. */
export interface Desenho { praca: PracaCentral | null; linhas: LinhaDeCorte[]; corredor: AreaInterna | null; piquetes?: (GeoJSON.Polygon | GeoJSON.MultiPolygon)[] }
export const desenhoVazio = (): Desenho => ({ praca: null, linhas: [], corredor: null });

export const linhasDoDesenho = (d: Desenho): LinhaDeCorte[] => [...(d.praca ? cercasComoLinhas(d.praca) : []), ...d.linhas];
export const internasDoDesenho = (d: Desenho): AreaInterna[] => [...(d.praca ? [areaDaPraca(d.praca)] : []), ...(d.corredor ? [d.corredor] : [])];
export const divisoesDoDesenho = (g: GeoJSON.Polygon, d: Desenho): Divisao[] => divisoesDasLinhas(g, linhasDoDesenho(d), internasDoDesenho(d));

export const ehCerca = (d: Desenho, id: string) => !!d.praca?.cercas.some(c => c.id === id);
export const linhaDoDesenho = (d: Desenho, id: string): LinhaDeCorte | null => linhasDoDesenho(d).find(l => l.id === id) ?? null;
export const cercaDoDesenho = (d: Desenho, id: string) => d.praca?.cercas.find(c => c.id === id) ?? null;

/** "Cerca 3" / "Linha 2": o rótulo e o número da linha (cercas numeradas na ordem da praça, linhas na ordem em que existem). */
export function rotuloDaLinha(d: Desenho, id: string): { rotulo: 'Cerca' | 'Linha'; numero: number } | null {
  const i = d.praca ? d.praca.cercas.findIndex(c => c.id === id) : -1;
  if (i >= 0) return { rotulo: 'Cerca', numero: i + 1 };
  const j = d.linhas.findIndex(l => l.id === id);
  return j >= 0 ? { rotulo: 'Linha', numero: j + 1 } : null;
}

const comLinha = (d: Desenho, nova: LinhaDeCorte): Desenho => ({ ...d, linhas: d.linhas.map(l => (l.id === nova.id ? nova : l)) });

/** Mexe no ponto `i` da linha: na cerca, a ponta da praça leva o vértice, a da borda gira (presa à borda) e os do meio andam à vontade. */
export function moverPontoDaLinha(g: GeoJSON.Polygon, d: Desenho, id: string, i: number, p: Ponto): Desenho {
  const cerca = cercaDoDesenho(d, id);
  if (cerca && d.praca) {
    if (i === 0) return { ...d, praca: moverVertice(g, d.praca, cerca.vertice, p) };
    if (i === cerca.pontos.length - 1) return { ...d, praca: girarCerca(g, d.praca, id, p) };
    return { ...d, praca: cercaComPontos(d.praca, id, cerca.pontos.map((q, k): Ponto => (k === i ? p : q))) };
  }
  const l = d.linhas.find(x => x.id === id);
  return l ? comLinha(d, comPontoMovido(l, i, p)) : d;
}

/** Cria um ponto na linha, no trecho mais perto de `p` (a forma não muda). */
export function pontoNaLinha(d: Desenho, id: string, p: Ponto): Desenho {
  const cerca = cercaDoDesenho(d, id);
  if (cerca && d.praca) return { ...d, praca: cercaComPontos(d.praca, id, comPontoNaLinha({ id, pontos: cerca.pontos }, p).pontos) };
  const l = d.linhas.find(x => x.id === id);
  return l ? comLinha(d, comPontoNaLinha(l, p)) : d;
}

/** Tira o ponto `i`: na cerca só os do meio (as pontas são a praça e a borda); na linha riscada, qualquer um enquanto sobrarem 2. */
export function tirarPontoDaLinha(d: Desenho, id: string, i: number): Desenho {
  const cerca = cercaDoDesenho(d, id);
  if (cerca && d.praca) {
    if (i <= 0 || i >= cerca.pontos.length - 1) return d;
    return { ...d, praca: cercaComPontos(d.praca, id, cerca.pontos.filter((_q, k) => k !== i)) };
  }
  const l = d.linhas.find(x => x.id === id);
  const nova = l ? semPontoDaLinha(l, i) : null;
  return nova ? comLinha(d, nova) : d;
}

/** Desliza a linha INTEIRA paralela a ela `desloc` metros (a cerca leva o vértice junto e fica fixa). */
export function deslizarLinha(g: GeoJSON.Polygon, d: Desenho, id: string, desloc: number): Desenho {
  if (ehCerca(d, id) && d.praca) return { ...d, praca: deslizarCerca(g, d.praca, id, desloc) };
  const l = d.linhas.find(x => x.id === id);
  return l ? comLinha(d, deslizarParalela(g, internasDoDesenho(d), l, desloc)) : d;
}

/** Apaga a linha (na cerca, a praça fica e perde aquela cerca). */
export function apagarLinha(d: Desenho, id: string): Desenho {
  if (ehCerca(d, id) && d.praca) return { ...d, praca: semCerca(d.praca, id) };
  return { ...d, linhas: d.linhas.filter(l => l.id !== id) };
}

/** Acrescenta a linha riscada (2 pontos ou mais) com um id novo. */
export function acrescentarLinha(d: Desenho, pontos: readonly Ponto[]): { desenho: Desenho; id: string } {
  const usados = new Set(linhasDoDesenho(d).map(l => l.id));
  let n = d.linhas.length + 1;
  while (usados.has(`linha-${n}`)) n++;
  const id = `linha-${n}`;
  return { desenho: { ...d, linhas: [...d.linhas, { id, pontos: pontos.map((p): Ponto => [p[0], p[1]]) }] }, id };
}

/** O cadeado da cerca (só a cerca da praça tem). */
/** PIQUETES-PRACA-CONCAVO-01: a linha riscada que sai do pasto e volta — cortar no 1º encontro (padrão) ou seguir além da borda. A cerca da
 *  praça não tem a escolha (ela nasce da praça e vai até a 1ª borda). */
export function alternarSeguir(d: Desenho, id: string): Desenho {
  if (ehCerca(d, id)) return d;
  return { ...d, linhas: d.linhas.map(l => (l.id !== id ? l : l.seguir ? { id: l.id, pontos: l.pontos } : { ...l, seguir: true })) };
}

export function alternarFixa(d: Desenho, id: string): Desenho {
  const cerca = cercaDoDesenho(d, id);
  return cerca && d.praca ? { ...d, praca: comFixa(d.praca, id, !cerca.fixa) } : d;
}

/** A grade (L × C) ou os N iguais (1 × N) só GERAM as linhas iniciais; daí em diante é edição de linhas. Troca as linhas e tira a praça. */
export function desenhoDaGrade(g: GeoJSON.Polygon, d: Desenho, linhas: number, colunas: number, girado: boolean): Desenho {
  const m = montar(g, girado);
  return { praca: null, linhas: linhasDaGrade(m, cortesIguais(m, linhas, colunas)), corredor: d.corredor };
}

/** O corredor: o eixo + a largura (m) viram a faixa; sem eixo/largura válidos, tira o corredor. */
export function comCorredor(d: Desenho, eixo: readonly Ponto[], larguraM: number): Desenho {
  return { ...d, corredor: novoCorredor('corredor', 'Corredor', eixo, larguraM) };
}
export function comLarguraDoCorredor(d: Desenho, larguraM: number): Desenho {
  return d.corredor && d.corredor.eixo ? comCorredor(d, d.corredor.eixo, larguraM) : d;
}

/** Há alguma coisa feita (é o que o Cancelar pergunta antes de descartar)? */
export const temDesenho = (d: Desenho) => !!d.praca || d.linhas.length > 0 || !!d.corredor || !!d.piquetes?.length;

/** "+ Piquete": acrescenta o polígono clicado, recortado pelo pasto e sem cobrir os piquetes já desenhados; nada sobrou = o desenho não muda. */
export function comPiqueteDesenhado(g: GeoJSON.Polygon, d: Desenho, pontos: readonly Ponto[]): Desenho {
  const p = piqueteDesenhado(g, d.piquetes ?? [], pontos);
  return p ? { ...d, piquetes: [...(d.piquetes ?? []), p] } : d;
}

/** O que vai ao banco além dos piquetes: `p_areas` (praça = benfeitoria, corredor = estrada) e `p_infra` (o cocho no centro da praça). */
export function extrasParaGravar(d: Desenho, cocho: boolean): { areas: AreaParaGravar[]; infra: InfraParaGravar[] } {
  return { areas: areasParaGravar(internasDoDesenho(d)), infra: infraParaGravar(d.praca ? centroDaPraca(d.praca) : null, cocho) };
}
