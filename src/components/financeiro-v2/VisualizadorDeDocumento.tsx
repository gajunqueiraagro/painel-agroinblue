/**
 * O VISUALIZADOR DA NOTA (Gabriel 29/10 14:02, item 7; o desenho do mock "Novo documento", gabarito Finanças): o PDF em TELA CHEIA, com a
 * barra fixa — − / % / + · Ajustar à largura · Página inteira · Girar · ‹ página n/N › · Abrir em nova aba. Desenha pelo MESMO pdf.js da
 * `PreviaDaNota` (só desenha; ler é do `lerNota`). Falha ao desenhar = a frase, e a nota segue no "Nova aba".
 *
 * VISUALIZADOR-PDF-01 (Gabriel 18/11 14:50; o componente ÚNICO, vale em todas as telas):
 * ⚠ ZOOM COM Ctrl/⌘ + RODA e com a PINÇA do trackpad (o navegador manda a pinça como roda com Ctrl; o Safari, como `gesture*`), CENTRADO NO
 *   CURSOR — e a página do navegador NÃO dá zoom (o evento é cancelado no quadro, com `passive: false`).
 * ⚠ ARRASTAR move o documento ampliado (começando fora do texto: no texto, o arrastar seleciona).
 * ⚠ CAMADA DE TEXTO do pdf.js (`TextLayer`, a CSS dela em `visualizadorTexto.css`, copiada verbatim): selecionar e copiar (Ctrl/⌘+C) a linha
 *   digitável, o CNPJ, os valores. PDF escaneado (imagem) não tem texto: não há o que selecionar.
 * ⚠ DUPLO CLIQUE fora do texto alterna "Ajustar à largura" ↔ 100%.
 */
import { useEffect, useRef, useState, type PointerEvent as PointerDoReact } from 'react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import './visualizadorTexto.css';

import type { PDFDocumentProxy } from 'pdfjs-dist';

type Modo = 'largura' | 'pagina' | 'livre';
type PdfJs = typeof import('pdfjs-dist');

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
/** A roda: cada 100 de `deltaY` ≈ 10% de zoom (a pinça manda deltas pequenos e seguidos). */
const SENSIBILIDADE_DA_RODA = 0.001;

export const limitarZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
/** O zoom novo pela roda/pinça: para cima (deltaY < 0) amplia. */
export const zoomPelaRoda = (z: number, deltaY: number): number => limitarZoom(z * Math.exp(-deltaY * SENSIBILIDADE_DA_RODA * 10));
/** O ponto sob o cursor fica sob o cursor: a rolagem nova para ir do zoom `z0` ao `z1` com o cursor em `cursor` (px do quadro). */
export const rolagemCentrada = (rolagem: number, cursor: number, z0: number, z1: number): number =>
  Math.max(0, (rolagem + cursor) * (z1 / z0) - cursor);

export function VisualizadorDeDocumento({ open, onFechar, bytes, nome, onNovaAba, onBaixar }: {
  open: boolean;
  onFechar: () => void;
  bytes: ArrayBuffer;
  nome: string;
  onNovaAba: () => void;
  /** BOLETO D3d (Gabriel 18/11 11:59): quem passa ganha o "Baixar" (salvar o arquivo); sem ele, a barra é a de sempre. */
  onBaixar?: () => void;
}) {
  const quadro = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const camadaDeTexto = useRef<HTMLDivElement>(null);
  const pdfjsRef = useRef<PdfJs | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [modo, setModo] = useState<Modo>('largura');
  const [zoom, setZoom] = useState(1);
  const [rotacao, setRotacao] = useState(0);
  /* o ponto que o zoom pela roda/pinça mantém sob o cursor (aplicado depois que a página muda de tamanho) */
  const ancora = useRef<{ x: number; y: number; z0: number; sx: number; sy: number } | null>(null);
  const zoomAtual = useRef(1);
  zoomAtual.current = zoom;

  /* abrir o documento (uma vez por arquivo) */
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setFalhou(false);
    (async () => {
      try {
        const pdfjs = await importarDoApp(() => import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        pdfjsRef.current = pdfjs;
        const d = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        if (vivo) { setDoc(d); setPagina(1); }
      } catch (e) {
        console.error('[VisualizadorDeDocumento] abrir', e);
        if (vivo) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
  }, [open, bytes]);

  /* desenhar a página na escala do modo (largura/página inteira) ou do zoom livre, com a rotação. O zoom MOSTRADO no modo largura/página não
     redesenha (só o zoom livre entra nas dependências), e o desenho anterior é cancelado antes do próximo — o pdf.js recusa dois no mesmo canvas.
     Depois do desenho, a CAMADA DE TEXTO na mesma escala (sem o fator da tela: ela é medida em px de CSS). */
  const zoomQueDesenha = modo === 'livre' ? zoom : -1;
  const tarefa = useRef<{ cancel: () => void } | null>(null);
  const tarefaDoTexto = useRef<{ cancel: () => void } | null>(null);
  useEffect(() => {
    if (!doc || !tela.current || !quadro.current) return;
    let vivo = true;
    (async () => {
      try {
        const pg = await doc.getPage(pagina);
        const base = pg.getViewport({ scale: 1, rotation: rotacao });
        const caixa = quadro.current;
        if (!caixa) return;
        const larguraUtil = Math.max(100, caixa.clientWidth - 32);
        const alturaUtil = Math.max(100, caixa.clientHeight - 32);
        const escala = modo === 'largura' ? larguraUtil / base.width : modo === 'pagina' ? Math.min(larguraUtil / base.width, alturaUtil / base.height) : zoomQueDesenha;
        if (vivo && modo !== 'livre') setZoom(Math.round(escala * 100) / 100);
        const dpr = window.devicePixelRatio || 1;
        const vp = pg.getViewport({ scale: escala * dpr, rotation: rotacao });
        const c = tela.current;
        if (!vivo || !c) return;
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        c.style.width = `${Math.floor(vp.width / dpr)}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`;
        if (folha.current) { folha.current.style.width = c.style.width; folha.current.style.height = c.style.height; }
        /* o zoom pela roda/pinça: o ponto sob o cursor fica sob o cursor */
        const a = ancora.current;
        if (a && modo === 'livre') {
          caixa.scrollLeft = rolagemCentrada(a.sx, a.x, a.z0, escala);
          caixa.scrollTop = rolagemCentrada(a.sy, a.y, a.z0, escala);
          ancora.current = null;
        }
        const ctx = c.getContext('2d');
        if (!ctx) return;
        tarefa.current?.cancel();
        const t = pg.render({ canvasContext: ctx, viewport: vp, canvas: c });
        tarefa.current = t;
        await t.promise;
        /* a camada de texto (selecionar e copiar) */
        const pdfjs = pdfjsRef.current;
        const camada = camadaDeTexto.current;
        if (!vivo || !pdfjs || !camada) return;
        tarefaDoTexto.current?.cancel();
        camada.replaceChildren();
        const vpTexto = pg.getViewport({ scale: escala, rotation: rotacao });
        camada.style.setProperty('--scale-factor', String(escala));
        camada.style.setProperty('--total-scale-factor', String(escala));
        const camadaPdf = new pdfjs.TextLayer({ textContentSource: pg.streamTextContent(), container: camada, viewport: vpTexto });
        tarefaDoTexto.current = camadaPdf;
        await camadaPdf.render();
      } catch (e) {
        /* o desenho cancelado (trocou a página, o zoom ou girou no meio) não é falha; a camada de texto que falha não apaga o desenho */
        if (e && typeof e === 'object' && ['RenderingCancelledException', 'AbortException'].includes(String(Reflect.get(e, 'name')))) return;
        console.error('[VisualizadorDeDocumento] desenhar', e);
        if (vivo && !tela.current?.width) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
  }, [doc, pagina, modo, zoomQueDesenha, rotacao]);

  /* Ctrl/⌘ + roda e a pinça: zoom no documento, nunca na página do navegador (`passive: false` para poder cancelar) */
  useEffect(() => {
    const caixa = quadro.current;
    if (!open || !caixa) return undefined;
    const ampliarEm = (x: number, y: number, z1: number) => {
      const z0 = zoomAtual.current;
      if (z1 === z0) return;
      ancora.current = { x, y, z0, sx: caixa.scrollLeft, sy: caixa.scrollTop };
      setModo('livre');
      setZoom(z1);
    };
    const naRoda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = caixa.getBoundingClientRect();
      ampliarEm(e.clientX - r.left, e.clientY - r.top, zoomPelaRoda(zoomAtual.current, e.deltaY));
    };
    /* Safari: a pinça chega como `gesturestart/gesturechange` (com `scale`), fora do padrão */
    let zoomNoComeco = 1;
    const noGestoComeca = (e: Event) => { e.preventDefault(); zoomNoComeco = zoomAtual.current; };
    const noGesto = (e: Event) => {
      e.preventDefault();
      const escala = Number(Reflect.get(e, 'scale'));
      if (!Number.isFinite(escala) || escala <= 0) return;
      const r = caixa.getBoundingClientRect();
      ampliarEm(r.width / 2, r.height / 2, limitarZoom(zoomNoComeco * escala));
    };
    caixa.addEventListener('wheel', naRoda, { passive: false });
    caixa.addEventListener('gesturestart', noGestoComeca, { passive: false });
    caixa.addEventListener('gesturechange', noGesto, { passive: false });
    return () => {
      caixa.removeEventListener('wheel', naRoda);
      caixa.removeEventListener('gesturestart', noGestoComeca);
      caixa.removeEventListener('gesturechange', noGesto);
    };
  }, [open, falhou]);

  /* arrastar: move o documento ampliado; começa fora do texto (no texto, o arrastar seleciona) */
  const arrasto = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const foraDoTexto = (alvo: EventTarget | null) => !(alvo instanceof Element && alvo.closest('.textLayer span'));
  const aoPressionar = (e: PointerDoReact<HTMLDivElement>) => {
    const caixa = quadro.current;
    if (!caixa || e.button !== 0 || !foraDoTexto(e.target)) return;
    if (caixa.scrollWidth <= caixa.clientWidth && caixa.scrollHeight <= caixa.clientHeight) return;   // cabe inteiro: nada a mover
    arrasto.current = { x: e.clientX, y: e.clientY, sx: caixa.scrollLeft, sy: caixa.scrollTop };
    setArrastando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const aoMover = (e: PointerDoReact<HTMLDivElement>) => {
    const a = arrasto.current;
    const caixa = quadro.current;
    if (!a || !caixa) return;
    caixa.scrollLeft = a.sx - (e.clientX - a.x);
    caixa.scrollTop = a.sy - (e.clientY - a.y);
  };
  const aoSoltar = () => { arrasto.current = null; setArrastando(false); };

  const total = doc?.numPages ?? 1;
  const mudarZoom = (fator: number) => { setModo('livre'); setZoom((z) => limitarZoom(z * fator)); };
  /* duplo clique (fora do texto: no texto ele seleciona a palavra) = largura ↔ 100% */
  const alternarLargura = () => {
    if (modo === 'largura') { setModo('livre'); setZoom(1); } else setModo('largura');
  };
  const BOTAO = 'h-[22px] px-2 text-[10.5px]';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="visualizador-documento">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="min-w-0 truncate text-[13px] font-semibold text-primary-foreground" title={nome}>{nome}</DialogTitle>
          <DialogDescription className="sr-only">A nota fiscal em tela cheia, com zoom, girar e páginas.</DialogDescription>
        </div>
        {/* a barra fixa (o mock): − % + · Ajustar à largura · Página inteira · Girar · ‹ n/N › · Abrir em nova aba */}
        <div className="flex h-[32px] shrink-0 items-center gap-1 border-b bg-card px-2 text-[10.5px]" data-testid="visualizador-barra">
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={() => mudarZoom(1 / 1.25)} aria-label="Diminuir o zoom" data-testid="visualizador-menos">−</Button>
          <span className="w-[44px] text-center tabular-nums" data-testid="visualizador-zoom">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={() => mudarZoom(1.25)} aria-label="Aumentar o zoom" data-testid="visualizador-mais">+</Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button type="button" size="sm" variant={modo === 'largura' ? 'default' : 'outline'} className={BOTAO} onClick={() => setModo('largura')} data-testid="visualizador-largura">⇔ Ajustar à largura</Button>
          <Button type="button" size="sm" variant={modo === 'pagina' ? 'default' : 'outline'} className={BOTAO} onClick={() => setModo('pagina')} data-testid="visualizador-pagina">▢ Página inteira</Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={() => setRotacao((r) => (r + 90) % 360)} data-testid="visualizador-girar">↻ Girar</Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={() => setPagina((n) => Math.max(1, n - 1))} disabled={pagina <= 1} aria-label="Página anterior">‹</Button>
          <span className="w-[44px] text-center tabular-nums" data-testid="visualizador-pagina-n">{pagina}/{total}</span>
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={() => setPagina((n) => Math.min(total, n + 1))} disabled={pagina >= total} aria-label="Próxima página">›</Button>
          <span className="ml-auto" />
          {onBaixar && <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={onBaixar} data-testid="visualizador-baixar">⤓ Baixar</Button>}
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={onNovaAba} data-testid="visualizador-nova-aba">↗ Abrir em nova aba</Button>
        </div>
        <div ref={quadro} className={`flex min-h-0 flex-1 overflow-auto bg-[#e9ecf0] p-4 ${arrastando ? 'cursor-grabbing select-none' : ''}`}
          data-testid="visualizador-quadro" data-modo={modo} onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
          onDoubleClick={(e) => { if (foraDoTexto(e.target)) alternarLargura(); }}>
          {falhou
            ? <p className="m-auto text-[11px] text-muted-foreground" data-testid="visualizador-falhou">Não foi possível desenhar a nota aqui; use "Abrir em nova aba".</p>
            : (
              /* `m-auto`: centrado quando cabe; maior que o quadro, começa no canto (a rolagem alcança as bordas) */
              /* UI-LARGURA-FIXA-01: a folha tem o tamanho MEDIDO da página desenhada (posto junto com o canvas), nunca fit-content */
              <div ref={folha} className="relative m-auto flex-none shadow-md" data-testid="visualizador-pagina-desenhada">
                <canvas ref={tela} className="block" aria-label="A nota fiscal" />
                <div ref={camadaDeTexto} className="textLayer" data-testid="visualizador-texto" />
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
