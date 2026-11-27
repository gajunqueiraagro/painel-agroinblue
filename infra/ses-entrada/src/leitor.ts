/**
 * ENTRADA-CENTRAL-01 F1 — o leitor da caixa NA LAMBDA: o MESMO `lerDaCaixaCom` do app (empacotado pelo esbuild, sem cópia), com as duas
 * peças que o navegador dá e o Node não: o `DOMParser` (o do jsdom, o mesmo dos testes do leitor) e o pdfjs (o build `legacy`, o mesmo dos
 * testes). Devolve SÓ o resultado a guardar (`paraGravar`): o texto do arquivo nunca sai daqui, nunca vai a log.
 */
import { JSDOM } from 'jsdom';
import { lerDaCaixaCom } from '@/lib/financeiro/boleto/lerDaCaixa';
import { paraGravar, type LeituraGravada } from '@/lib/financeiro/boleto/leituraGravada';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

/**
 * O pdfjs (build `legacy`) cria um `DOMMatrix` ao CARREGAR; no navegador e nos testes ele existe (no Node dos testes vem do
 * `@napi-rs/canvas`, binário nativo). Para EXTRAIR TEXTO o pdfjs não usa matriz nenhuma — só para DESENHAR. Aqui vai a matriz 2D afim
 * (a…f), com as contas certas, só para o módulo carregar; algum caminho de desenho que use mais que isto falha, o leitor devolve erro e o
 * arquivo entra SEM leitura (a caixa lê no navegador). Provado no pacote: `scratchpad/pacote/rodar.mjs` (boleto, nota, catálogo).
 */
export class Matriz2D {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(m?: ArrayLike<number>) { if (m && m.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = [m[0], m[1], m[2], m[3], m[4], m[5]]; }
  get is2D() { return true; }
  multiplySelf(o: Matriz2D) {
    const { a, b, c, d, e, f } = this;
    this.a = a * o.a + c * o.b; this.b = b * o.a + d * o.b;
    this.c = a * o.c + c * o.d; this.d = b * o.c + d * o.d;
    this.e = a * o.e + c * o.f + e; this.f = b * o.e + d * o.f + f;
    return this;
  }
  preMultiplySelf(o: Matriz2D) { const r = new Matriz2D([o.a, o.b, o.c, o.d, o.e, o.f]).multiplySelf(this); return Object.assign(this, { a: r.a, b: r.b, c: r.c, d: r.d, e: r.e, f: r.f }); }
  translateSelf(x = 0, y = 0) { return this.multiplySelf(new Matriz2D([1, 0, 0, 1, x, y])); }
  scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new Matriz2D([sx, 0, 0, sy, 0, 0])); }
  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) { [this.a, this.b, this.c, this.d, this.e, this.f] = [NaN, NaN, NaN, NaN, NaN, NaN]; return this; }
    const { a, b, c, d, e, f } = this;
    [this.a, this.b, this.c, this.d] = [d / det, -b / det, -c / det, a / det];
    [this.e, this.f] = [(c * f - d * e) / det, (b * e - a * f) / det];
    return this;
  }
  transformPoint(p: { x?: number; y?: number } = {}) { const x = p.x ?? 0, y = p.y ?? 0; return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 }; }
}

let pronto: Promise<(bytes: Uint8Array, tipo: 'pdf' | 'xml', nome: string | null) => Promise<LeituraGravada | null>> | null = null;

export function leitorDaLambda() {
  pronto ??= (async () => {
    if (typeof globalThis.DOMParser === 'undefined') Object.assign(globalThis, { DOMParser: new JSDOM('').window.DOMParser });
    if (typeof globalThis.DOMMatrix === 'undefined') Object.assign(globalThis, { DOMMatrix: Matriz2D });
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const ler = lerDaCaixaCom(pdfjs);
    return async (bytes: Uint8Array, tipo: 'pdf' | 'xml', nome: string | null) => {
      const copia = new Uint8Array(bytes);   // um ArrayBuffer só deste arquivo (o leitor fatia e o pdfjs transfere)
      return paraGravar(await ler(copia.buffer, tipo, undefined, nome ?? undefined));
    };
  })();
  return pronto;
}
