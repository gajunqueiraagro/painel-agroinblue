/**
 * MAPA-EDITAR-POLIGONO-01 — a geometria da edição de polígono, numa lib só e pura (Gabriel 01/11/2026).
 * - Medidas ao vivo: a área é a MESMA conta do mapa (`areaEmHectares`, esfera de raio 6.371.008,8 m); perímetro e lados pela distância na
 *   esfera de mesmo raio (haversine). Nenhuma segunda conta de área.
 * - Unir e sobreposição pela `polyclip-ts` (MIT, dependência direta fixa; decisão do Gabriel 01/11).
 * - Dividir: a linha riscada, prolongada até uma caixa bem maior que o polígono, fecha um "lado"; metade A = polígono ∩ lado, metade B =
 *   polígono − lado (as duas pela polyclip). Assim as duas metades têm EXATAMENTE a mesma divisa (sem fresta nem sobreposição). Sobrou
 *   mais de 2 pedaços (a linha entra e sai várias vezes) = recusa com frase.
 * O banco (`fn_geometria_gravar`) guarda e confere; a conta é toda daqui.
 */
import { difference, intersection, union } from 'polyclip-ts';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { casaNaBusca, normalizarParaBusca } from '@/lib/texto/busca';

const RAIO_DA_TERRA_M = 6371008.8;

export type Ponto = [number, number]; // [lng, lat]
type Anel = Ponto[];
type Poli = Anel[];

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const rad = (g: number) => (g * Math.PI) / 180;
const pt = (p: readonly number[]): Ponto => [p[0], p[1]];

/** Distância em metros entre dois pontos [lng, lat], na esfera do mapa. */
export function distanciaM(a: readonly number[], b: readonly number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_DA_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function aneisExternos(g: GeoJSON.Geometry): Anel[] {
  if (g.type === 'Polygon') return g.coordinates.length ? [g.coordinates[0].map(pt)] : [];
  if (g.type === 'MultiPolygon') return g.coordinates.filter(p => p.length).map(p => p[0].map(pt));
  return [];
}

/** Os lados do anel externo, em metros (o anel fechado não repete o último lado). */
export function ladosM(anel: readonly (readonly number[])[]): number[] {
  const n = anel.length;
  if (n < 2) return [];
  const fechado = anel[0][0] === anel[n - 1][0] && anel[0][1] === anel[n - 1][1];
  const pontos = fechado ? anel.slice(0, -1) : anel;
  return pontos.map((p, i) => distanciaM(p, pontos[(i + 1) % pontos.length]));
}

export interface Medidas { areaHa: number; perimetroM: number; ladosM: number[] }

export function medidasDe(g: GeoJSON.Geometry): Medidas {
  const aneis = aneisExternos(g);
  const lados = aneis.flatMap(a => ladosM(a));
  return { areaHa: areaEmHectares(g), perimetroM: lados.reduce((s, l) => s + l, 0), ladosM: aneis.length === 1 ? ladosM(aneis[0]) : lados };
}

/** "12,4 ha" · "1.530 m" — pt-BR. */
export const textoHa = (ha: number) => `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`;
export const textoM = (m: number) => `${Math.round(m).toLocaleString('pt-BR')} m`;

/** "área do mapa X ha · cadastro Y ha" (a área oficial é a do cadastro; sem cadastro: "—"). */
export function fraseDasAreas(areaDoMapaHa: number, areaCadastroHa: number | null | undefined): string {
  return `área do mapa ${textoHa(areaDoMapaHa)} · cadastro ${areaCadastroHa != null && areaCadastroHa > 0 ? textoHa(areaCadastroHa) : '—'}`;
}

const numHa = (ha: number | null | undefined) =>
  ha != null && ha > 0 ? ha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';

/** MAPA-EDITAR-POLIGONO-02 (Gabriel 01/11) — a linha compacta da barra: "58,7 ha · 3.200 m · mapa 58,7 · cadastro 58,7".
 *  1º = a área AO VIVO (o que está no mapa agora), "mapa" = a área GRAVADA do polígono antes da edição, "cadastro" = a oficial do pasto;
 *  sem polígono gravado (desenhar) ou sem pasto: "—". */
export function fraseCompactaDasMedidas(m: Medidas, areaGravadaHa: number | null | undefined, areaCadastroHa: number | null | undefined): string {
  return `${textoHa(m.areaHa)} · ${textoM(m.perimetroM)} · mapa ${numHa(areaGravadaHa)} · cadastro ${numHa(areaCadastroHa)}`;
}

// ---------------------------------------------------------------------------------------------------------------------------
function paraPoli(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): Poli | Poli[] {
  if (g.type === 'Polygon') return g.coordinates.map(a => a.map(pt));
  return g.coordinates.map(pp => pp.map(a => a.map(pt)));
}

function deMultiPoli(m: Poli[]): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const partes = m.filter(p => p.length && p[0].length >= 4);
  if (partes.length === 0) return null;
  if (partes.length === 1) return { type: 'Polygon', coordinates: partes[0] };
  return { type: 'MultiPolygon', coordinates: partes };
}

const ehPoligono = (g: GeoJSON.Geometry): g is GeoJSON.Polygon | GeoJSON.MultiPolygon => g.type === 'Polygon' || g.type === 'MultiPolygon';

/** Une dois polígonos que se tocam (o encaixe garante o lado comum). Não se tocam = recusa. */
export function unirVizinhos(a: GeoJSON.Geometry, b: GeoJSON.Geometry): Resultado<GeoJSON.Polygon> {
  if (!ehPoligono(a) || !ehPoligono(b)) return { ok: false, motivo: 'Só se unem polígonos.' };
  const u = deMultiPoli(union(paraPoli(a), paraPoli(b)));
  if (!u) return { ok: false, motivo: 'A união ficou vazia.' };
  if (u.type !== 'Polygon') return { ok: false, motivo: 'Os dois polígonos não se tocam: aproxime as divisas (encaixe nos vértices) e tente de novo.' };
  return { ok: true, valor: u };
}

export interface Sobreposicao { id: string; nome: string; areaHa: number }

/** MAPA-EDITAR-POLIGONO-02 (Gabriel 01/11): abaixo de 0,1 ha (1.000 m²) a "sobreposição" é encaixe/arredondamento da divisa — o
 *  aviso mostrava "P18 (0,0 ha)". Uma faixa de 5 m ao longo de 200 m já passa disso. */
export const MINIMO_SOBREPOSICAO_HA = 0.1;

export type Vizinho = { id: string; nome: string; tipo?: string | null; geojson: GeoJSON.Geometry };

export const TIPOS_DE_CONTORNO: readonly string[] = ['area_total', 'area_fazenda'];
/** O contorno da fazenda ("Area Total"): o tipo 'area_total' (o do KMZ: "Area Total" da 3M) ou 'area_fazenda', ou o polígono que contém TODOS os outros (cada um ≥ 99% dentro dele;
 *  só com 3 polígonos ou mais). Ele cobre os pastos por definição: não é sobreposição. */
export function contornosDaFazenda(todos: readonly Vizinho[]): Set<string> {
  const ids = new Set(todos.filter(v => TIPOS_DE_CONTORNO.includes(v.tipo ?? '')).map(v => v.id));
  const outros = todos.filter(v => !ids.has(v.id) && ehPoligono(v.geojson));
  if (outros.length < 3) return ids;
  for (const c of outros) {
    const gc = c.geojson;
    if (!ehPoligono(gc)) continue;
    const pc = paraPoli(gc);
    const contemTodos = outros.every(o => {
      const go = o.geojson;
      if (o.id === c.id) return true;
      if (!ehPoligono(go)) return true;
      const area = areaEmHectares(go);
      const i = deMultiPoli(intersection(pc, paraPoli(go)));
      return area > 0 && !!i && areaEmHectares(i) >= area * 0.99;
    });
    if (contemTodos) ids.add(c.id);
  }
  return ids;
}

/** Polígonos vizinhos que o editado invade, com a área invadida (aviso; abaixo de `MINIMO_SOBREPOSICAO_HA` não conta). O contorno
 *  da fazenda fica de fora: quem chama passa os ids de `contornosDaFazenda` em `ignorar`. */
export function sobreposicoes(g: GeoJSON.Geometry, vizinhos: readonly Vizinho[],
  minimoHa = MINIMO_SOBREPOSICAO_HA, ignorar: ReadonlySet<string> = new Set()): Sobreposicao[] {
  if (!ehPoligono(g)) return [];
  const eu = paraPoli(g);
  const achadas: Sobreposicao[] = [];
  for (const v of vizinhos) {
    if (ignorar.has(v.id) || !ehPoligono(v.geojson)) continue;
    const i = deMultiPoli(intersection(eu, paraPoli(v.geojson)));
    const ha = i ? areaEmHectares(i) : 0;
    if (ha >= minimoHa) achadas.push({ id: v.id, nome: v.nome, areaHa: ha });
  }
  return achadas.sort((x, y) => y.areaHa - x.areaHa);
}

/** "Sobrepõe P20 (0,3 ha), Reserva (0,2 ha) +2" — em UMA linha: os `max` maiores e o resto num "+N" (item 3 do -02). */
export function fraseDasSobreposicoes(s: readonly Sobreposicao[], max = 2): string {
  if (s.length === 0) return '';
  const vistos = s.slice(0, max).map(x => `${x.nome} (${textoHa(x.areaHa)})`).join(', ');
  return `Sobrepõe ${vistos}${s.length > max ? ` +${s.length - max}` : ''}`;
}

// --- divisa compartilhada ("Mover a divisa junto", item 5 do -02) -------------------------------------------------------------
/** Dois vértices são o MESMO ponto da divisa quando estão a até 0,5 m (o KMZ e o encaixe deixam as divisas iguais ou quase). */
export const TOLERANCIA_VERTICE_COMUM_M = 0.5;

/** O que se fez num vértice do polígono editado, na ordem em que se fez (o hook anota pelos eventos do Geoman). */
export type OperacaoNoVertice =
  | { tipo: 'mover'; de: Ponto; para: Ponto }
  | { tipo: 'tirar'; de: Ponto }
  | { tipo: 'acrescentar'; entre: [Ponto, Ponto]; ponto: Ponto };

const perto = (a: readonly number[], b: readonly number[], tol = TOLERANCIA_VERTICE_COMUM_M) => distanciaM(a, b) <= tol;

/** Aplica as operações num anel do vizinho: mover/tirar o vértice que coincide com o do editado; acrescentar só quando o vizinho tem
 *  o MESMO lado (os dois pontos, seguidos). Devolve null quando nada coincidiu. Tirar que deixaria menos de 3 pontos não tira. */
function aplicarNoAnel(anel: readonly (readonly number[])[], ops: readonly OperacaoNoVertice[]): Anel | null {
  const fechado = anel.length > 1 && anel[0][0] === anel[anel.length - 1][0] && anel[0][1] === anel[anel.length - 1][1];
  let pts: Anel = (fechado ? anel.slice(0, -1) : anel).map(pt);
  let mudou = false;
  for (const op of ops) {
    if (op.tipo === 'mover') {
      pts = pts.map(p => { if (perto(p, op.de)) { mudou = true; return op.para; } return p; });
    } else if (op.tipo === 'tirar') {
      const resto = pts.filter(p => !perto(p, op.de));
      if (resto.length !== pts.length && resto.length >= 3) { pts = resto; mudou = true; }
    } else {
      const [a, b] = op.entre;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        if ((perto(p, a) && perto(q, b)) || (perto(p, b) && perto(q, a))) {
          pts = [...pts.slice(0, i + 1), op.ponto, ...pts.slice(i + 1)];
          mudou = true;
          break;
        }
      }
    }
  }
  return mudou ? [...pts, pts[0]] : null;
}

/** A forma nova de cada vizinho que divide vértice com o editado (só os que mudaram). Nunca o contorno da fazenda. */
export function vizinhosDaDivisa(vizinhos: readonly Vizinho[], ops: readonly OperacaoNoVertice[],
  ignorar: ReadonlySet<string> = new Set()): { id: string; nome: string; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon }[] {
  if (ops.length === 0) return [];
  const saida: { id: string; nome: string; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon }[] = [];
  for (const v of vizinhos) {
    const g = v.geojson;
    if (ignorar.has(v.id) || TIPOS_DE_CONTORNO.includes(v.tipo ?? '')) continue;
    if (g.type === 'Polygon') {
      const aneis = g.coordinates.map(a => aplicarNoAnel(a, ops));
      if (aneis.every(a => a === null)) continue;
      saida.push({ id: v.id, nome: v.nome, geojson: { type: 'Polygon', coordinates: aneis.map((a, i) => a ?? g.coordinates[i].map(pt)) } });
    } else if (g.type === 'MultiPolygon') {
      const partes = g.coordinates.map(p => p.map(a => aplicarNoAnel(a, ops)));
      if (partes.every(p => p.every(a => a === null))) continue;
      saida.push({ id: v.id, nome: v.nome, geojson: { type: 'MultiPolygon',
        coordinates: partes.map((p, j) => p.map((a, i) => a ?? g.coordinates[j][i].map(pt))) } });
    }
  }
  return saida;
}

// --- recortar dos vizinhos (item 6 do -02) ----------------------------------------------------------------------------------
/** A forma nova sai de cada vizinho que ela cobre (acima de `MINIMO_SOBREPOSICAO_HA`): vizinho − forma. Nunca o contorno da fazenda.
 *  Vizinho que sumiria inteiro = recusa com frase (apagar é outro gesto, com motivo). */
export function recortarDosVizinhos(forma: GeoJSON.Geometry, vizinhos: readonly Vizinho[], ignorar: ReadonlySet<string> = new Set()):
  Resultado<{ id: string; nome: string; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon }[]> {
  if (!ehPoligono(forma)) return { ok: true, valor: [] };
  const corte = paraPoli(forma);
  const saida: { id: string; nome: string; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon }[] = [];
  for (const v of vizinhos) {
    const g = v.geojson;
    if (ignorar.has(v.id) || TIPOS_DE_CONTORNO.includes(v.tipo ?? '') || !ehPoligono(g)) continue;
    const i = deMultiPoli(intersection(corte, paraPoli(g)));
    if (!i || areaEmHectares(i) < MINIMO_SOBREPOSICAO_HA) continue;
    const resto = deMultiPoli(difference(paraPoli(g), corte));
    if (!resto || areaEmHectares(resto) < MINIMO_SOBREPOSICAO_HA) {
      return { ok: false, motivo: `${v.nome} ficaria inteiro dentro do polígono novo: apague-o antes (com motivo) ou desenhe sem recortar.` };
    }
    saida.push({ id: v.id, nome: v.nome, geojson: resto });
  }
  return { ok: true, valor: saida };
}

// --- dividir ----------------------------------------------------------------------------------------------------------------
type Caixa = { oeste: number; sul: number; leste: number; norte: number };

function caixaGrande(g: GeoJSON.Polygon, linha: readonly Ponto[]): Caixa {
  const xs = [...g.coordinates[0].map(p => p[0]), ...linha.map(p => p[0])];
  const ys = [...g.coordinates[0].map(p => p[1]), ...linha.map(p => p[1])];
  const w = Math.max(...xs) - Math.min(...xs) || 1e-3;
  const h = Math.max(...ys) - Math.min(...ys) || 1e-3;
  const folga = Math.max(w, h) * 10;
  return { oeste: Math.min(...xs) - folga, sul: Math.min(...ys) - folga, leste: Math.max(...xs) + folga, norte: Math.max(...ys) + folga };
}

/** Onde o raio que sai de `de` na direção `para` (além de `para`) encontra a borda da caixa. */
function naBorda(de: Ponto, para: Ponto, c: Caixa): Ponto {
  const dx = para[0] - de[0];
  const dy = para[1] - de[1];
  const ts: number[] = [];
  if (dx > 0) ts.push((c.leste - de[0]) / dx);
  if (dx < 0) ts.push((c.oeste - de[0]) / dx);
  if (dy > 0) ts.push((c.norte - de[1]) / dy);
  if (dy < 0) ts.push((c.sul - de[1]) / dy);
  const t = Math.min(...ts.filter(v => v > 0));
  return [de[0] + dx * t, de[1] + dy * t];
}

/** Posição na volta da borda da caixa, no sentido horário a partir do canto noroeste (0..4). */
function voltaNaBorda(p: Ponto, c: Caixa): number {
  const w = c.leste - c.oeste;
  const h = c.norte - c.sul;
  const eps = 1e-12 * Math.max(w, h);
  if (Math.abs(p[1] - c.norte) <= eps) return (p[0] - c.oeste) / w;          // topo: 0..1
  if (Math.abs(p[0] - c.leste) <= eps) return 1 + (c.norte - p[1]) / h;      // direita: 1..2
  if (Math.abs(p[1] - c.sul) <= eps) return 2 + (c.leste - p[0]) / w;        // base: 2..3
  return 3 + (p[1] - c.sul) / h;                                             // esquerda: 3..4
}

const CANTOS = (c: Caixa): [number, Ponto][] => [[1, [c.leste, c.norte]], [2, [c.leste, c.sul]], [3, [c.oeste, c.sul]], [4, [c.oeste, c.norte]]];

/** O "lado" que a linha fecha: a linha prolongada até a borda + a volta da borda (sentido horário) do fim até o começo. */
function ladoDaLinha(linha: readonly Ponto[], c: Caixa): Poli {
  const n = linha.length;
  const ini = naBorda(linha[1], linha[0], c);
  const fim = naBorda(linha[n - 2], linha[n - 1], c);
  const anel: Ponto[] = [ini, ...linha.map(pt), fim];
  const tIni = voltaNaBorda(ini, c);
  const t = voltaNaBorda(fim, c);
  const alvo = tIni <= t ? tIni + 4 : tIni;
  for (const volta of [0, 4]) {
    for (const [k, canto] of CANTOS(c)) {
      const tc = k + volta;
      if (tc > t && tc < alvo) anel.push(canto);
    }
  }
  anel.push(ini);
  return [anel];
}

export interface Divisao { a: GeoJSON.Polygon; b: GeoJSON.Polygon }

/** Divide um polígono por uma linha riscada (2+ pontos). Precisa dar exatamente 2 pedaços. */
export function dividirPorLinha(g: GeoJSON.Geometry, linha: readonly Ponto[]): Resultado<Divisao> {
  if (g.type !== 'Polygon') return { ok: false, motivo: 'Só se divide um polígono simples (sem partes separadas).' };
  if (g.coordinates.length > 1) return { ok: false, motivo: 'Este polígono tem furo: redesenhe-o antes de dividir.' };
  if (linha.length < 2) return { ok: false, motivo: 'Risque a linha de divisão com pelo menos 2 pontos.' };
  const c = caixaGrande(g, linha);
  const lado = ladoDaLinha(linha, c);
  const poli = paraPoli(g);
  const a = deMultiPoli(intersection(poli, lado));
  const b = deMultiPoli(difference(poli, lado));
  if (!a || !b) return { ok: false, motivo: 'A linha não atravessa o polígono: risque de um lado ao outro.' };
  if (a.type !== 'Polygon' || b.type !== 'Polygon') {
    return { ok: false, motivo: 'A linha corta o polígono em mais de 2 partes: risque uma linha que entre e saia uma vez só.' };
  }
  return { ok: true, valor: { a, b } };
}

// --- a linha que cruza ela mesma (item 7 do -02) ----------------------------------------------------------------------------
export const FRASE_DO_CRUZAMENTO = 'A linha cruza ela mesma (anel vermelho): mova ou tire o ponto laranja — ou "Corrigir automaticamente".';

/** Onde o anel cruza ele mesmo: o ponto de cada cruzamento entre dois lados que não são vizinhos (lados vizinhos só se tocam no vértice). */
export function cruzamentos(anel: readonly (readonly number[])[]): Ponto[] {
  const n0 = anel.length;
  const fechado = n0 > 1 && anel[0][0] === anel[n0 - 1][0] && anel[0][1] === anel[n0 - 1][1];
  const pts = (fechado ? anel.slice(0, -1) : anel).map(pt);
  const n = pts.length;
  if (n < 4) return [];
  const achados: Ponto[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // o primeiro e o último lado são vizinhos
      const c = pts[j], d = pts[(j + 1) % n];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (den === 0) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) achados.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return achados;
}

/** O vértice do anel que fica a menos de `TOLERANCIA_VERTICE_COMUM_M` de outro (o ponto solto em cima de outro): o índice do repetido. */
export function verticeEmCimaDeOutro(anel: readonly (readonly number[])[], i: number): number | null {
  const n0 = anel.length;
  const fechado = n0 > 1 && anel[0][0] === anel[n0 - 1][0] && anel[0][1] === anel[n0 - 1][1];
  const n = fechado ? n0 - 1 : n0;
  if (i < 0 || i >= n || n <= 3) return null;
  for (let j = 0; j < n; j++) if (j !== i && distanciaM(anel[i], anel[j]) <= TOLERANCIA_VERTICE_COMUM_M) return j;
  return null;
}

// --- corrigir automaticamente o polígono que já veio inválido (item 8 do -02) -------------------------------------------------
export interface Correcao {
  geojson: GeoJSON.Polygon;
  pontosJuntados: number;      // pontos amontoados (≤ 0,5 m do vizinho no anel) que viraram um só
  partesDescartadas: number;   // os laços soltos que saíram (fica a parte maior)
  areaAntesHa: number;
  areaDepoisHa: number;
}

/** Junta os pontos seguidos a até `TOLERANCIA_VERTICE_COMUM_M` (o amontoado do KMZ) e, se o anel ainda cruza ele mesmo, desfaz o
 *  cruzamento pela polyclip (a união do polígono com ele mesmo devolve as partes sem cruzamento) e fica com a parte MAIOR — o laço
 *  pequeno sai. Nada a corrigir = recusa com frase. Furos não entram (o anel externo é o que o KMZ errou). */
export function corrigirPoligono(g: GeoJSON.Geometry): Resultado<Correcao> {
  if (g.type !== 'Polygon' || !g.coordinates[0]) return { ok: false, motivo: 'Só se corrige um polígono simples.' };
  const anel0 = g.coordinates[0];
  const n0 = anel0.length;
  const fechado = n0 > 1 && anel0[0][0] === anel0[n0 - 1][0] && anel0[0][1] === anel0[n0 - 1][1];
  const aberto = (fechado ? anel0.slice(0, -1) : anel0).map(pt);
  const limpo: Anel = [];
  for (const p of aberto) if (limpo.length === 0 || distanciaM(limpo[limpo.length - 1], p) > TOLERANCIA_VERTICE_COMUM_M) limpo.push(p);
  while (limpo.length > 1 && distanciaM(limpo[0], limpo[limpo.length - 1]) <= TOLERANCIA_VERTICE_COMUM_M) limpo.pop();
  const pontosJuntados = aberto.length - limpo.length;
  if (limpo.length < 3) return { ok: false, motivo: 'Sobraram menos de 3 pontos: redesenhe o polígono.' };
  let anel: Anel = [...limpo, limpo[0]];
  let partesDescartadas = 0;
  if (cruzamentos(anel).length > 0) {
    const partes = union([anel]).filter(p => p.length && p[0].length >= 4);
    if (partes.length === 0) return { ok: false, motivo: 'Não consegui desfazer o cruzamento: redesenhe o polígono.' };
    const maior = partes.reduce((a, b) => (areaEmHectares({ type: 'Polygon', coordinates: [b[0]] }) > areaEmHectares({ type: 'Polygon', coordinates: [a[0]] }) ? b : a));
    anel = maior[0];
    partesDescartadas = partes.length - 1;
    if (cruzamentos(anel).length > 0) return { ok: false, motivo: 'Não consegui desfazer o cruzamento: redesenhe o polígono.' };
  }
  if (pontosJuntados === 0 && partesDescartadas === 0 && cruzamentos(anel0).length === 0) return { ok: false, motivo: 'Este polígono não tem cruzamento nem pontos amontoados.' };
  const geojson: GeoJSON.Polygon = { type: 'Polygon', coordinates: [anel] };
  return { ok: true, valor: { geojson, pontosJuntados, partesDescartadas, areaAntesHa: areaEmHectares(g), areaDepoisHa: areaEmHectares(geojson) } };
}

/** O polígono tem pontos amontoados (dois seguidos a até 0,5 m)? */
export function temPontosAmontoados(g: GeoJSON.Geometry): boolean {
  if (g.type !== 'Polygon' || !g.coordinates[0]) return false;
  const a = g.coordinates[0];
  for (let i = 0; i + 1 < a.length; i++) if (distanciaM(a[i], a[i + 1]) <= TOLERANCIA_VERTICE_COMUM_M) return true;
  return false;
}

// --- unir vários (MAPA-EDITAR-POLIGONO-04) ----------------------------------------------------------------------------------
/** Dois polígonos ENCOSTAM quando as divisas ficam a até 2 m: o KMZ deixa frestas de centímetros a ~1 m entre vizinhos (6A × 6B da Pureza:
 *  ~0,6 m) e a união exata devolvia 2 pedaços — o Unir dizia "Nenhum resultado". Uma estrada entre dois pastos tem bem mais que isso. */
export const TOLERANCIA_FRESTA_M = 2;

/** A busca pelo nome do polígono, tolerante: a de sempre (P134) ou a "chave" — sem espaço/pontuação e sem o "P" da frente antes do
 *  número: 6b = 6B = P6B = "P 6B" = P_6B. */
export function chaveDoNomeDoPoligono(s: string | null | undefined): string {
  return normalizarParaBusca(s).replace(/[^a-z0-9]/g, '').replace(/^p(?=\d)/, '');
}
export function casaNoNomeDoPoligono(nome: string | null | undefined, termo: string | null | undefined): boolean {
  return casaNaBusca(nome, termo) || chaveDoNomeDoPoligono(nome).includes(chaveDoNomeDoPoligono(termo));
}

/* metros locais (plano tangente perto do ponto): bom para distâncias de poucos metros */
function paraMetros(ref: readonly number[]) {
  const kx = 111320 * Math.cos(rad(ref[1])), ky = 110540;
  return {
    ida: (p: readonly number[]): [number, number] => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky],
    volta: (m: readonly number[]): Ponto => [ref[0] + m[0] / kx, ref[1] + m[1] / ky],
  };
}
/** O ponto do segmento a–b mais perto de p, e a distância em metros. */
function maisPertoNoSegmento(p: readonly number[], a: readonly number[], b: readonly number[]): { ponto: Ponto; m: number } {
  const t = paraMetros(p);
  const [ax, ay] = t.ida(a), [bx, by] = t.ida(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const q: [number, number] = [ax + k * dx, ay + k * dy];
  return { ponto: t.volta(q), m: Math.hypot(q[0], q[1]) };
}
function segmentos(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): [Ponto, Ponto][] {
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  return aneis.flatMap(a => a.slice(0, -1).map((p, i): [Ponto, Ponto] => [pt(p), pt(a[i + 1])]));
}
function vertices(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ponto[] {
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  return aneis.flatMap(a => a.map(pt));
}

/** A menor distância entre as divisas de dois polígonos, em metros (0 = se tocam ou se sobrepõem). */
export function distanciaEntrePoligonosM(a: GeoJSON.Geometry, b: GeoJSON.Geometry): number {
  if (!ehPoligono(a) || !ehPoligono(b)) return Infinity;
  if (deMultiPoli(intersection(paraPoli(a), paraPoli(b)))) return 0;
  let menor = Infinity;
  const pares: [GeoJSON.Polygon | GeoJSON.MultiPolygon, GeoJSON.Polygon | GeoJSON.MultiPolygon][] = [[a, b], [b, a]];
  for (const [x, y] of pares) {
    const segs = segmentos(y);
    for (const v of vertices(x)) for (const [p, q] of segs) menor = Math.min(menor, maisPertoNoSegmento(v, p, q).m);
  }
  return menor;
}

/** Encaixa cada ponto de `g` que fica a até `tolM` da divisa de algum dos `outros` no ponto mais perto dessa divisa (fecha a fresta). */
function encaixarNaDivisa(g: GeoJSON.Polygon, outros: readonly (GeoJSON.Polygon | GeoJSON.MultiPolygon)[], tolM: number): { g: GeoJSON.Polygon; n: number } {
  const segs = outros.flatMap(segmentos);
  let n = 0;
  const aneis = g.coordinates.map(anel => anel.map(p => {
    let melhor: { ponto: Ponto; m: number } | null = null;
    for (const [a, b] of segs) { const r = maisPertoNoSegmento(p, a, b); if (r.m <= tolM && (!melhor || r.m < melhor.m)) melhor = r; }
    if (melhor && melhor.m > 0.001) { n++; return melhor.ponto; }
    return pt(p);
  }));
  return { g: { type: 'Polygon', coordinates: aneis }, n };
}

export interface Uniao { geojson: GeoJSON.Polygon; pontosEncaixados: number; furosFechados: number }

/** Une VÁRIOS polígonos que encostam (até `TOLERANCIA_FRESTA_M`) num só: fecha as frestas encaixando os pontos na divisa vizinha, une pela
 *  polyclip e fecha os furinhos que a fresta deixou (abaixo de `MINIMO_SOBREPOSICAO_HA`). Quem não encosta em nenhum = recusa com o nome. */
export function unirVarios(polis: readonly { id: string; nome: string; geojson: GeoJSON.Geometry }[], tolM = TOLERANCIA_FRESTA_M): Resultado<Uniao> {
  if (polis.length < 2) return { ok: false, motivo: 'Escolha pelo menos dois polígonos para unir.' };
  const simples: { id: string; nome: string; g: GeoJSON.Polygon }[] = [];
  for (const p of polis) {
    if (p.geojson.type !== 'Polygon') return { ok: false, motivo: `${p.nome} tem mais de uma parte: una só polígonos simples.` };
    simples.push({ id: p.id, nome: p.nome, g: { type: 'Polygon', coordinates: p.geojson.coordinates.map(a => a.map(pt)) } });
  }
  // quem encosta em quem (grafo): todos precisam estar ligados ao primeiro
  const ligados = new Set<number>([0]);
  for (let mudou = true; mudou;) {
    mudou = false;
    for (let i = 0; i < simples.length; i++) {
      if (ligados.has(i)) continue;
      if ([...ligados].some(j => distanciaEntrePoligonosM(simples[i].g, simples[j].g) <= tolM)) { ligados.add(i); mudou = true; }
    }
  }
  const soltos = simples.filter((_p, i) => !ligados.has(i)).map(p => p.nome);
  if (soltos.length) {
    return { ok: false, motivo: `${soltos.join(', ')} não ${soltos.length === 1 ? 'encosta' : 'encostam'} nos outros (fresta acima de ${tolM} m): aproxime as divisas ou tire da seleção.` };
  }
  let pontosEncaixados = 0;
  const encaixados = simples.map((p, i) => {
    const r = encaixarNaDivisa(p.g, simples.filter((_q, j) => j !== i).map(q => q.g), tolM);
    pontosEncaixados += r.n;
    return r.g;
  });
  const [primeiro, ...resto] = encaixados.map(g => paraPoli(g));
  const u = deMultiPoli(union(primeiro, ...resto));
  if (!u) return { ok: false, motivo: 'A união ficou vazia.' };
  if (u.type !== 'Polygon') return { ok: false, motivo: 'Os polígonos não ficaram numa peça só: aproxime as divisas (encaixe nos vértices) e tente de novo.' };
  const furos = u.coordinates.slice(1);
  const ficam = furos.filter(f => areaEmHectares({ type: 'Polygon', coordinates: [f] }) >= MINIMO_SOBREPOSICAO_HA);
  return { ok: true, valor: { geojson: { type: 'Polygon', coordinates: [u.coordinates[0], ...ficam] }, pontosEncaixados, furosFechados: furos.length - ficam.length } };
}
