/**
 * MAPA-PIQUETES-04 — o CONTORNO do pai que vira grupo = a união das divisões, para o banco gravar no MESMO gesto (`fn_piquetes_concluir` /
 * `fn_piquetes_ligar` com `p_contorno`, 20261028117110). A união é a do Code 3 (`unirVarios`: encaixe na divisa, polyclip, furinhos de
 * fresta fechados); por cima, a LIMPEZA que o P28 da Pureza pediu (a união devolveu uma "agulha" de ~60 m e o furo do redondel encostado
 * no contorno por uma fresta de largura zero): tirar, em repetição, o ponto colado ao anterior (< 0,05 m) e a ponta de agulha (o anterior e o
 * seguinte a < 0,5 m). Combinado com o Code 3 (bilhete 02/11): quando a limpeza entrar DENTRO da `unirVarios`, esta função só a chama.
 */
import { unirVarios, type Resultado } from '@/lib/mapa/edicaoDoPoligono';

type Ponto = GeoJSON.Position;

/** distância em metros entre dois pontos lon/lat (plano local; serve para limiar de centímetros/metros) */
function metros(a: Ponto, b: Ponto): number {
  const dx = (a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110540;
  return Math.hypot(dx, dy);
}

/** Um anel fechado sem pontos colados nem agulhas. Devolve também quantos pontos saíram. */
export function limparAnel(anel: readonly Ponto[]): { anel: Ponto[]; tirados: number } {
  const pts = anel.slice(0, -1).map((p) => [p[0], p[1]]);
  let tirados = 0;
  for (let mudou = true; mudou && pts.length > 3;) {
    mudou = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (metros(a, b) < 0.05 || metros(a, c) < 0.5) { pts.splice(i, 1); tirados++; mudou = true; break; }
    }
  }
  return { anel: [...pts, pts[0]], tirados };
}

/** A união das divisões, limpa. Recusa (com o nome) quem não encosta nos outros, como a `unirVarios`. */
export function contornoDasDivisoes(divisoes: readonly { id: string; nome: string; geojson: GeoJSON.Geometry }[]): Resultado<GeoJSON.Polygon> {
  const u = unirVarios(divisoes);
  if ('motivo' in u) return { ok: false, motivo: `O contorno não fecha: ${u.motivo}` };
  const aneis = u.valor.geojson.coordinates.map((a) => limparAnel(a).anel).filter((a) => a.length >= 4);
  if (aneis.length === 0) return { ok: false, motivo: 'O contorno não fecha: a união ficou vazia.' };
  return { ok: true, valor: { type: 'Polygon', coordinates: aneis } };
}
