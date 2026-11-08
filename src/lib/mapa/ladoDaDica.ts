/**
 * FECH-TOPO-02 acerto 2 (Chat 07/11 21:55) — a dica (o popup do pasto) no mapa fica SEMPRE dentro do quadro do mapa: o Leaflet só
 * escolhe esquerda/direita pelo CENTRO do mapa e centra a dica na altura do mouse, então perto da borda ela saía cortada.
 * Aqui: à direita do mouse se couber, senão à esquerda (senão o lado com mais espaço) e, na vertical, desliza o mínimo para caber.
 * Devolve a direção e o deslocamento no formato do Leaflet (`direction` explícita + `offset`).
 */
export interface Ponto { x: number; y: number }
export interface Tamanho { w: number; h: number }
export interface LadoDaDica { direcao: 'left' | 'right'; deslocamento: [number, number] }

/** a distância do mouse até a dica */
export const AFASTAMENTO_DA_DICA = 12;
/** a folga mínima até a borda do mapa */
export const FOLGA_DA_BORDA = 4;

export function ladoDaDica(mouse: Ponto, mapa: Tamanho, dica: Tamanho): LadoDaDica {
  const cabeADireita = mouse.x + AFASTAMENTO_DA_DICA + dica.w <= mapa.w - FOLGA_DA_BORDA;
  const cabeAEsquerda = mouse.x - AFASTAMENTO_DA_DICA - dica.w >= FOLGA_DA_BORDA;
  const direcao = cabeADireita ? 'right' : cabeAEsquerda ? 'left' : mouse.x <= mapa.w / 2 ? 'right' : 'left';
  /* o Leaflet centra a dica na altura do mouse: o topo fica em mouse.y + dy − h/2 */
  const meio = dica.h / 2;
  const sobeAte = mapa.h - FOLGA_DA_BORDA - meio - mouse.y;
  const desceAte = FOLGA_DA_BORDA + meio - mouse.y;
  /* mapa mais baixo que a dica: fica presa no topo (o cabeçalho com o nome sempre à vista) */
  const dy = Math.max(desceAte, Math.min(0, sobeAte));
  return { direcao, deslocamento: [direcao === 'right' ? AFASTAMENTO_DA_DICA : -AFASTAMENTO_DA_DICA, dy] };
}
