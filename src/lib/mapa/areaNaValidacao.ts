/**
 * MAPA-DICAS-01 (área) — a área do polígono na Validação (Gabriel 02/11: "quando eu crio um pasto, preciso ver a área dele em hectares").
 * UMA fórmula nos quatro lugares (barra, lista, rótulo no mapa, dica): a do BANCO (`areaDoBancoHa`, o espelho da `_fn_area_geodesica_ha`),
 * em 2 casas (`haDoBanco`). O perímetro é a soma dos lados do anel externo (`distanciaM`).
 */
import { areaDoBancoHa, haDoBanco } from '@/lib/mapa/criarPiquetes';
import { distanciaM, textoM } from '@/lib/mapa/edicaoDoPoligono';
import { larguraDoRotulo } from '@/lib/mapa/rotulosDosLados';

/** A área do mapa em ha (2 casas, a do banco); nulo quando a geometria não é polígono ou está vazia. */
export function areaDoMapaHa(g: GeoJSON.Geometry): number | null {
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
  const ha = haDoBanco(areaDoBancoHa(g));
  return ha > 0 ? ha : null;
}

/** O perímetro (m) do anel externo; MultiPolygon soma as partes. Nulo quando não é polígono. */
export function perimetroDoMapaM(g: GeoJSON.Geometry): number | null {
  const doAnel = (anel: readonly (readonly number[])[]) => anel.reduce((s, p, i) => (i === 0 ? s : s + distanciaM(anel[i - 1], p)), 0);
  if (g.type === 'Polygon') return g.coordinates.length ? doAnel(g.coordinates[0]) : null;
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, pol) => s + (pol.length ? doAnel(pol[0]) : 0), 0);
  return null;
}

/** "12,84" — 2 casas, vírgula e milhar pt-BR (o pior caso da lista é "9.999,99"). */
export const numHa2 = (ha: number) => ha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "12,84 ha" */
export const textoHa2 = (ha: number) => `${numHa2(ha)} ha`;
/** "12,8 ha" — 1 casa, o rótulo no mapa. */
export const textoHa1 = (ha: number) => `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`;

/** A diferença mapa − cadastro, com sinal e 2 casas: "+0,34" · "-0,50". */
export function diferencaComSinal(mapaHa: number, cadastroHa: number): string {
  const d = Math.round((mapaHa - cadastroHa) * 100) / 100;
  return `${d > 0 ? '+' : d < 0 ? '-' : ''}${numHa2(Math.abs(d))}`;
}

/** "cadastro 12,50 (+0,34)" só quando há pasto com área oficial E ela difere (em 2 casas) da do mapa; senão nulo. */
export function fraseDoCadastro(mapaHa: number | null, cadastroHa: number | null | undefined): string | null {
  if (mapaHa == null || cadastroHa == null || !(cadastroHa > 0)) return null;
  const cad = haDoBanco(cadastroHa);
  if (cad === mapaHa) return null;
  return `cadastro ${numHa2(cad)} (${diferencaComSinal(mapaHa, cad)})`;
}

/** A dica do rótulo da barra: o perímetro em metros (+ a conta inteira do cadastro, quando há). */
export function dicaDasMedidas(perimetroM: number | null, mapaHa: number | null, cadastroHa: number | null | undefined): string {
  const partes: string[] = [];
  partes.push(perimetroM != null ? `Perímetro: ${textoM(perimetroM)}` : 'Perímetro: —');
  if (mapaHa != null) partes.push(`Área do mapa: ${textoHa2(mapaHa)}`);
  if (cadastroHa != null && cadastroHa > 0) partes.push(`Área do cadastro: ${textoHa2(haDoBanco(cadastroHa))}`);
  return partes.join(' · ');
}

export const ZOOM_MINIMO_DO_ROTULO_DE_AREA = 14;
const ALTURA_DO_ROTULO_DE_AREA = 24; // as duas linhas (nome 9 px + área 8 px)

/** O rótulo de área só aparece com o zoom aproximado E o polígono com, na tela, ao menos 2× a largura do texto e 2× a altura do rótulo. */
export function rotuloDeAreaVisivel(larguraPx: number, alturaPx: number, zoom: number, texto: string): boolean {
  if (zoom < ZOOM_MINIMO_DO_ROTULO_DE_AREA) return false;
  return larguraPx >= 2 * larguraDoRotulo(texto) && alturaPx >= 2 * ALTURA_DO_ROTULO_DE_AREA;
}
