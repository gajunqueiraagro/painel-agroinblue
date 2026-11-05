/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o DESENHO do "Criar piquetes" como UM dado só (a praça com as cercas dela, as linhas riscadas ou geradas
 * pela grade, o corredor) e os gestos que o editam, todos puros e devolvendo um desenho novo: é o que a pilha do "Desfazer" guarda e o que o
 * rascunho do navegador grava. Editar qualquer linha é o mesmo gesto para a cerca da praça e para a linha riscada; a diferença (a ponta da
 * praça leva o vértice, a da borda gira) mora aqui.
 */
import { areaDoBancoHa, cortesIguais, montar, type Divisao } from '@/lib/mapa/criarPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import {
  areasParaGravar, comPontoMovido, piqueteDesenhado, piqueteRecortado, sobraDoPasto, comPontoNaLinha, deslizarParalela, divisoesDasLinhas, infraParaGravar, linhasDaGrade, novoCorredor, semPontoDaLinha,
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

/** `piquetes` (PIQUETE-POLIGONO-01): os polígonos desenhados no "+ Piquete", na ordem em que nasceram; opcional, o rascunho de antes não tem.
 *  `internas` (PIQUETE-PRO-01): as áreas internas desenhadas no "+ Área interna" (praça, corredor, benfeitoria), que recortam os piquetes. */
export interface Desenho {
  praca: PracaCentral | null; linhas: LinhaDeCorte[]; corredor: AreaInterna | null; piquetes?: (GeoJSON.Polygon | GeoJSON.MultiPolygon)[]; internas?: AreaInterna[];
}
type Geo = GeoJSON.Polygon | GeoJSON.MultiPolygon;
/** PIQUETE-PRO-01: o SEM PIQUETE aceito para gravar (regra do Gabriel: os piquetes preenchem 100% do pasto) */
export const TOLERANCIA_SEM_PIQUETE_HA = 0.01;
export const desenhoVazio = (): Desenho => ({ praca: null, linhas: [], corredor: null });

export const linhasDoDesenho = (d: Desenho): LinhaDeCorte[] => [...(d.praca ? cercasComoLinhas(d.praca) : []), ...d.linhas];
export const internasDoDesenho = (d: Desenho): AreaInterna[] => [...(d.praca ? [areaDaPraca(d.praca)] : []), ...(d.corredor ? [d.corredor] : []), ...(d.internas ?? [])];
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
export const temDesenho = (d: Desenho) => !!d.praca || d.linhas.length > 0 || !!d.corredor || !!d.piquetes?.length || !!d.internas?.length;

/** O que um piquete não pode cobrir: os outros piquetes (menos o `exceto`), as áreas internas desenhadas e as que já existem no pasto (`fixas`). */
const obstaculos = (d: Desenho, fixas: readonly Geo[], exceto = -1): Geo[] =>
  [...(d.piquetes ?? []).filter((_p, i) => i !== exceto), ...internasDoDesenho(d).map(a => a.geojson), ...fixas];

/** "+ Piquete": acrescenta o polígono clicado, recortado pelo pasto e sem cobrir os piquetes já desenhados nem as áreas internas (PIQUETE-PRO-01:
 *  as `fixas`, a praça que já existe no pasto, ficam fora sozinhas); nada sobrou = o desenho não muda. */
export function comPiqueteDesenhado(g: GeoJSON.Polygon, d: Desenho, pontos: readonly Ponto[], fixas: readonly Geo[] = []): Desenho {
  const p = piqueteDesenhado(g, obstaculos(d, fixas), pontos);
  return p ? { ...d, piquetes: [...(d.piquetes ?? []), p] } : d;
}

/** PIQUETE-PRO-01 — o piquete `i` com a forma do arrasto, AINDA SEM recortar (o arrasto ao vivo: os cantos não mudam de número no meio do gesto). */
export function comPiqueteCru(d: Desenho, i: number, forma: Geo): Desenho {
  return d.piquetes && d.piquetes[i] ? { ...d, piquetes: d.piquetes.map((p, k) => (k === i ? forma : p)) } : d;
}
/** O fim da edição do piquete `i`: recortado pelo pasto e pelos vizinhos (a sobreposição sai sozinha); se nada sobrar, fica a forma de `antes`. */
export function comPiqueteEditado(g: GeoJSON.Polygon, d: Desenho, i: number, antes: Geo, fixas: readonly Geo[] = []): Desenho {
  const atual = d.piquetes?.[i];
  if (!atual) return d;
  const r = piqueteRecortado(g, obstaculos(d, fixas, i), atual);
  return comPiqueteCru(d, i, r ?? antes);
}
/** Apaga o piquete `i` (o que ele cobria volta a ser "sem piquete"). */
export function semPiqueteNoDesenho(d: Desenho, i: number): Desenho {
  return d.piquetes && d.piquetes[i] ? { ...d, piquetes: d.piquetes.filter((_p, k) => k !== i) } : d;
}
/** "Restante vira piquete": a área do pasto que nada cobre vira o próximo piquete (já encaixada: é a sobra exata). A sobra em pedaços soltos vira
 *  um piquete por pedaço (o piquete em partes não grava); o farelo abaixo da tolerância (0,01 ha) não vira piquete. */
export function comRestante(g: GeoJSON.Polygon, d: Desenho, fixas: readonly Geo[] = []): Desenho {
  const sobra = sobraDoPasto(g, obstaculos(d, fixas));
  if (!sobra) return d;
  const pedacos: GeoJSON.Polygon[] = (sobra.type === 'Polygon' ? [sobra.coordinates] : sobra.coordinates).map(c => ({ type: 'Polygon', coordinates: c }));
  const novos = pedacos.filter(p => areaDoBancoHa(p) >= TOLERANCIA_SEM_PIQUETE_HA).sort((a, b) => areaDoBancoHa(b) - areaDoBancoHa(a));
  return novos.length ? { ...d, piquetes: [...(d.piquetes ?? []), ...novos] } : d;
}

/** "+ Área interna": a área desenhada (dentro do pasto, fora das que já existem) RECORTA os piquetes que ela cobre; nada sobrou = o desenho não muda. */
export const NOME_DA_AREA_INTERNA: Record<AreaInterna['tipo'], string> = { praca: 'Praça de alimentação', corredor: 'Corredor', benfeitoria: 'Benfeitoria' };
export function comAreaInterna(g: GeoJSON.Polygon, d: Desenho, tipo: AreaInterna['tipo'], pontos: readonly Ponto[], fixas: readonly Geo[] = []): Desenho {
  const area = piqueteDesenhado(g, [...internasDoDesenho(d).map(a => a.geojson), ...fixas], pontos);
  if (!area) return d;
  const usados = new Set((d.internas ?? []).map(a => a.id));
  let k = (d.internas ?? []).length + 1;
  while (usados.has(`area-${k}`)) k++;
  const nova: AreaInterna = { id: `area-${k}`, tipo, nome: NOME_DA_AREA_INTERNA[tipo], geojson: area };
  const piquetes = (d.piquetes ?? []).flatMap(p => { const r = piqueteRecortado(g, [area], p); return r ? [r] : []; });
  return { ...d, internas: [...(d.internas ?? []), nova], piquetes };
}
export function semAreaInterna(d: Desenho, id: string): Desenho {
  return { ...d, internas: (d.internas ?? []).filter(a => a.id !== id) };
}

/** PIQUETE-PRO-01 (item 3): a conta dos 100% — "Pasto · piquetes · praça/corredores · SEM PIQUETE". O pasto é a área do contorno (a útil; o furo
 *  da praça antiga já fica fora dela) e as áreas internas são as que existem dentro do contorno externo + as desenhadas (a regra da área cercada). */
export interface ContaDoPasto { pastoHa: number; piquetesHa: number; internasHa: number; semPiqueteHa: number; semPiquete: Geo | null }
export function contaDoPasto(g: GeoJSON.Polygon, d: Desenho, fixas: readonly Geo[] = []): ContaDoPasto {
  const semPiquete = sobraDoPasto(g, obstaculos(d, fixas));
  const ha = (x: Geo) => areaDoBancoHa(x);
  return {
    pastoHa: ha(g),
    piquetesHa: (d.piquetes ?? []).reduce((s, p) => s + ha(p), 0),
    internasHa: [...internasDoDesenho(d).map(a => a.geojson), ...fixas].reduce((s, p) => s + ha(p), 0),
    semPiqueteHa: semPiquete ? ha(semPiquete) : 0,
    semPiquete,
  };
}

/** O que vai ao banco além dos piquetes: `p_areas` (praça = benfeitoria, corredor = estrada) e `p_infra` (o cocho no centro da praça). */
export function extrasParaGravar(d: Desenho, cocho: boolean): { areas: AreaParaGravar[]; infra: InfraParaGravar[] } {
  return { areas: areasParaGravar(internasDoDesenho(d)), infra: infraParaGravar(d.praca ? centroDaPraca(d.praca) : null, cocho) };
}
