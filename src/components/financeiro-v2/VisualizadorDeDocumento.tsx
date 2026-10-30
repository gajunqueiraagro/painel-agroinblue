/**
 * O VISUALIZADOR DA NOTA (Gabriel 29/10 14:02, item 7; o desenho do mock "Novo documento", gabarito Finanças): o PDF em TELA CHEIA, com a
 * barra fixa — − / % / + · Ajustar à largura · Página inteira · Girar · ‹ página n/N › · Abrir em nova aba. Desenha pelo MESMO pdf.js da
 * `PreviaDaNota` (só desenha; ler é do `lerNota`). Falha ao desenhar = a frase, e a nota segue no "Nova aba".
 */
import { useEffect, useRef, useState } from 'react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import type { PDFDocumentProxy } from 'pdfjs-dist';

type Modo = 'largura' | 'pagina' | 'livre';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

export function VisualizadorDeDocumento({ open, onFechar, bytes, nome, onNovaAba }: {
  open: boolean;
  onFechar: () => void;
  bytes: ArrayBuffer;
  nome: string;
  onNovaAba: () => void;
}) {
  const quadro = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [modo, setModo] = useState<Modo>('largura');
  const [zoom, setZoom] = useState(1);
  const [rotacao, setRotacao] = useState(0);

  /* abrir o documento (uma vez por arquivo) */
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setFalhou(false);
    (async () => {
      try {
        const pdfjs = await importarDoApp(() => import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
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
     redesenha (só o zoom livre entra nas dependências), e o desenho anterior é cancelado antes do próximo — o pdf.js recusa dois no mesmo canvas */
  const zoomQueDesenha = modo === 'livre' ? zoom : -1;
  const tarefa = useRef<{ cancel: () => void } | null>(null);
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
        const ctx = c.getContext('2d');
        if (!ctx) return;
        tarefa.current?.cancel();
        const t = pg.render({ canvasContext: ctx, viewport: vp, canvas: c });
        tarefa.current = t;
        await t.promise;
      } catch (e) {
        /* o desenho cancelado (trocou a página, o zoom ou girou no meio) não é falha */
        if (e && typeof e === 'object' && Reflect.get(e, 'name') === 'RenderingCancelledException') return;
        console.error('[VisualizadorDeDocumento] desenhar', e);
        if (vivo) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
  }, [doc, pagina, modo, zoomQueDesenha, rotacao]);

  const total = doc?.numPages ?? 1;
  const mudarZoom = (fator: number) => { setModo('livre'); setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * fator * 100) / 100))); };
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
          <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={onNovaAba} data-testid="visualizador-nova-aba">↗ Abrir em nova aba</Button>
        </div>
        <div ref={quadro} className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#e9ecf0] p-4" data-testid="visualizador-quadro">
          {falhou
            ? <p className="m-auto text-[11px] text-muted-foreground" data-testid="visualizador-falhou">Não foi possível desenhar a nota aqui; use "Abrir em nova aba".</p>
            : <canvas ref={tela} className="h-fit shadow-md" aria-label="A nota fiscal" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
