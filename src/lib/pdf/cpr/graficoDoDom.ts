/**
 * graficoDoDom — CPR-TRANSFERENCIAS-NO-FLUXO-01 (commit B). O gráfico da aba Fluxo, para a folha do PDF, em VETOR.
 *
 * ⚠ NÃO RECALCULA NADA E NÃO REDESENHA NADA: lê o SVG que o `CprFluxoPrevisto` (o MESMO componente, com as MESMAS props da
 * tela — a mesma série do dono) acabou de desenhar e o descreve nó a nó (caminho, linha, retângulo, círculo, texto). A folha
 * só repete esses nós. Nenhuma escala, nenhum ponto e nenhuma cor nascem aqui.
 * ⚠ SEM DEPENDÊNCIA DO MOTOR do PDF: quem lê o DOM é a tela, antes de decidir gerar.
 * ⚠ SÓ `translate` É ENTENDIDO (é o que o recharts e os ticks do componente usam); recorte (`clipPath`), `<title>` e `<defs>`
 *   não são levados.
 */
export type NoDoGrafico =
  | { t: 'path'; d: string; tx: number; ty: number; fill: string; stroke: string; sw: number; dash: string | null; fo: number; so: number; cap: string | null }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash: string | null; so: number; cap: string | null }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke: string; sw: number; fo: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; sw: number; fo: number }
  | { t: 'text'; x: number; y: number; texto: string; ancora: 'start' | 'middle' | 'end'; tamanho: number; peso: number; fill: string; fo: number };

export interface LegendaDoGrafico { rotulo: string; cor: string; tracejado: boolean; ponto: boolean }
export interface GraficoDaFolha {
  largura: number; altura: number; fundo: string | null;
  titulo: string; subtitulo: string; legenda: LegendaDoGrafico[]; nos: NoDoGrafico[];
}

interface Herdado { tx: number; ty: number; fill: string; stroke: string; sw: number; dash: string | null; op: number; fo: number; so: number; cap: string | null; tamanho: number; peso: number; ancora: 'start' | 'middle' | 'end' }

const num = (v: string | null | undefined, padrao = 0): number => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : padrao; };
/** um comprimento do SVG em px: número puro, "px" ou "em" (relativo ao tamanho da letra) */
const comprimento = (v: string | null, tamanho: number): number => {
  if (!v) return 0;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return /em\s*$/.test(v) ? n * tamanho : n;
};
const translacao = (t: string | null): { x: number; y: number } => {
  const m = /translate\(\s*(-?[\d.eE+-]+)(?:[\s,]+(-?[\d.eE+-]+))?\s*\)/.exec(t ?? '');
  return m ? { x: num(m[1]), y: num(m[2]) } : { x: 0, y: 0 };
};
const ancoraDe = (v: string | null, padrao: Herdado['ancora']): Herdado['ancora'] => (v === 'middle' || v === 'end' || v === 'start' ? v : padrao);
const pesoDe = (v: string | null, padrao: number): number => (v == null || v === '' ? padrao : v === 'bold' ? 700 : v === 'normal' ? 400 : num(v, padrao));
/** atributo do nó ou, na falta, a propriedade de mesmo nome no `style` inline (o recharts usa os dois) */
const atr = (el: Element, nome: string): string | null => {
  const a = el.getAttribute(nome);
  if (a != null) return a;
  const m = new RegExp(`(?:^|;)\\s*${nome}\\s*:\\s*([^;]+)`).exec(el.getAttribute('style') ?? '');
  return m ? m[1].trim() : null;
};

function herdar(el: Element, h: Herdado): Herdado {
  const t = translacao(el.getAttribute('transform'));
  const tamanho = el.hasAttribute('font-size') || /font-size/.test(el.getAttribute('style') ?? '') ? num(atr(el, 'font-size'), h.tamanho) : h.tamanho;
  return {
    tx: h.tx + t.x, ty: h.ty + t.y,
    fill: atr(el, 'fill') ?? h.fill, stroke: atr(el, 'stroke') ?? h.stroke,
    sw: atr(el, 'stroke-width') != null ? num(atr(el, 'stroke-width'), h.sw) : h.sw,
    dash: atr(el, 'stroke-dasharray') ?? h.dash,
    op: h.op * num(atr(el, 'opacity'), 1),
    fo: atr(el, 'fill-opacity') != null ? num(atr(el, 'fill-opacity'), 1) : h.fo,
    so: atr(el, 'stroke-opacity') != null ? num(atr(el, 'stroke-opacity'), 1) : h.so,
    cap: atr(el, 'stroke-linecap') ?? h.cap,
    tamanho, peso: pesoDe(atr(el, 'font-weight'), h.peso), ancora: ancoraDe(atr(el, 'text-anchor'), h.ancora),
  };
}

function textoDe(el: Element, h: Herdado, out: NoDoGrafico[]): void {
  const x0 = h.tx + comprimento(el.getAttribute('x'), h.tamanho) + comprimento(el.getAttribute('dx'), h.tamanho);
  let y = h.ty + comprimento(el.getAttribute('y'), h.tamanho) + comprimento(el.getAttribute('dy'), h.tamanho);
  const base = { t: 'text' as const, ancora: h.ancora, tamanho: h.tamanho, peso: h.peso, fill: h.fill === 'none' ? '#000' : h.fill, fo: h.op * h.fo };
  const tspans = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'tspan');
  if (tspans.length === 0) {
    const texto = (el.textContent ?? '').trim();
    if (texto) out.push({ ...base, x: x0, y, texto });
    return;
  }
  for (const ts of tspans) {
    if (ts.hasAttribute('y')) y = h.ty + comprimento(ts.getAttribute('y'), h.tamanho);
    y += comprimento(ts.getAttribute('dy'), h.tamanho);
    const x = ts.hasAttribute('x') ? h.tx + comprimento(ts.getAttribute('x'), h.tamanho) + comprimento(ts.getAttribute('dx'), h.tamanho) : x0;
    const texto = (ts.textContent ?? '').trim();
    if (texto) out.push({ ...base, x, y, texto, fill: atr(ts, 'fill') ?? base.fill });
  }
}

function andar(el: Element, pai: Herdado, out: NoDoGrafico[]): void {
  const tag = el.tagName.toLowerCase();
  if (tag === 'defs' || tag === 'clippath' || tag === 'title' || tag === 'desc') return;
  const h = herdar(el, pai);
  const fo = h.op * h.fo, so = h.op * h.so;
  if (tag === 'path') {
    const d = el.getAttribute('d');
    if (d) out.push({ t: 'path', d, tx: h.tx, ty: h.ty, fill: h.fill, stroke: h.stroke, sw: h.sw, dash: h.dash, fo, so, cap: h.cap });
    return;
  }
  if (tag === 'line') {
    out.push({ t: 'line', x1: h.tx + num(el.getAttribute('x1')), y1: h.ty + num(el.getAttribute('y1')), x2: h.tx + num(el.getAttribute('x2')), y2: h.ty + num(el.getAttribute('y2')), stroke: h.stroke, sw: h.sw, dash: h.dash, so, cap: h.cap });
    return;
  }
  if (tag === 'rect') {
    out.push({ t: 'rect', x: h.tx + num(el.getAttribute('x')), y: h.ty + num(el.getAttribute('y')), w: num(el.getAttribute('width')), h: num(el.getAttribute('height')), fill: h.fill, stroke: h.stroke, sw: h.sw, fo });
    return;
  }
  if (tag === 'circle') {
    out.push({ t: 'circle', cx: h.tx + num(el.getAttribute('cx')), cy: h.ty + num(el.getAttribute('cy')), r: num(el.getAttribute('r')), fill: h.fill, stroke: h.stroke, sw: h.sw, fo });
    return;
  }
  if (tag === 'text') { textoDe(el, h, out); return; }
  for (const filho of Array.from(el.children)) andar(filho, h, out);
}

/**
 * Lê o gráfico que está DESENHADO em `raiz` (o `CprFluxoPrevisto` montado). `null` enquanto o SVG não tem traço nenhum —
 * quem chama espera e tenta de novo, e sem gráfico a folha sai sem ele (com o aviso), nunca com um desenho pela metade.
 */
export function lerGraficoDoDom(raiz: Element): GraficoDaFolha | null {
  const svg = raiz.querySelector('[data-grafico-plot] svg');
  if (!svg) return null;
  const largura = num(svg.getAttribute('width')), altura = num(svg.getAttribute('height'));
  if (largura <= 0 || altura <= 0) return null;
  const nos: NoDoGrafico[] = [];
  const inicial: Herdado = { tx: 0, ty: 0, fill: '#000', stroke: 'none', sw: 1, dash: null, op: 1, fo: 1, so: 1, cap: null, tamanho: 10, peso: 400, ancora: 'start' };
  for (const filho of Array.from(svg.children)) andar(filho, inicial, nos);
  /* sem a linha do saldo (um caminho com traço) o gráfico ainda não foi desenhado */
  if (!nos.some((n) => n.t === 'path' && n.stroke !== 'none' && n.fill === 'none')) return null;
  const legenda: LegendaDoGrafico[] = Array.from(raiz.querySelectorAll('[data-grafico-legenda] > span')).map((s) => {
    const linha = s.querySelector('line'), ponto = s.querySelector('circle');
    return {
      rotulo: (s.textContent ?? '').trim(), cor: linha?.getAttribute('stroke') ?? ponto?.getAttribute('fill') ?? '#000',
      tracejado: !!linha?.getAttribute('stroke-dasharray'), ponto: !linha && !!ponto,
    };
  });
  const fundo = raiz.querySelector('[data-grafico]')?.getAttribute('data-grafico') || null;
  return {
    largura, altura, fundo,
    titulo: (raiz.querySelector('h2')?.textContent ?? '').trim(), subtitulo: (raiz.querySelector('p')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    legenda, nos,
  };
}

/** O tamanho em que o gráfico é montado para a folha (px = pt): a largura útil do A4 paisagem; a altura inclui título e legenda. */
export const TAMANHO_DO_GRAFICO_NO_PDF = { largura: 798, altura: 240 };
export const AVISO_PDF_SEM_GRAFICO = 'PDF gerado sem o gráfico: ele não terminou de desenhar. Gere de novo com a aba à vista.';

/**
 * Espera o gráfico terminar de desenhar e o lê: duas leituras seguidas IGUAIS (o recharts mede a largura e redesenha).
 * Passado o prazo devolve nulo — a folha sai sem o gráfico e a tela avisa.
 */
export async function esperarGraficoNoDom(
  alvo: () => Element | null, o: { prazoMs?: number; passoMs?: number } = {},
): Promise<GraficoDaFolha | null> {
  const prazo = o.prazoMs ?? 4000, passo = o.passoMs ?? 90;
  let anterior = '';
  for (let t = 0; t <= prazo; t += passo) {
    await new Promise((r) => setTimeout(r, passo));
    const el = alvo();
    const lido = el ? lerGraficoDoDom(el) : null;
    if (!lido) { anterior = ''; continue; }
    const foto = JSON.stringify(lido);
    if (foto === anterior) return lido;
    anterior = foto;
  }
  return null;
}
