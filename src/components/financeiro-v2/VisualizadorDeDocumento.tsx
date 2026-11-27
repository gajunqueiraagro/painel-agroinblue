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
 *
 * VISUALIZADOR-PDF-02 (Gabriel 23/11 13:17):
 * ⚠ (substituído pelo VISUALIZADOR-PDF-02b) abria em "Página inteira".
 * ⚠ O QUADRO É CALLBACK REF (`refDoQuadro` → estado): o Dialog monta o conteúdo pelo Portal um render DEPOIS, e o efeito da roda lia
 *   `quadro.current` nulo e nunca mais rodava — o zoom com Ctrl/⌘ + roda e a pinça não funcionavam com um PDF que abre (o teste antigo só
 *   passava porque o PDF dele falhava e o `falhou` rodava o efeito de novo).
 *
 * VISUALIZADOR-PDF-02b (Gabriel 25/11 15:23, todos os arquivos do sistema): "abrir SEMPRE em 100% e o zoom com a MESMA sensibilidade de abrir o
 * PDF numa guia nova do navegador".
 * ⚠ O LEITOR DO NAVEGADOR PRIMEIRO: com `navigator.pdfViewerEnabled` (Chrome, Edge, Firefox, Safari de mesa), o PDF abre num `iframe` com uma
 *   URL `blob:` — o arquivo fica na memória DESTA aba (nunca uma URL pública; revogada ao fechar) — em `#zoom=100&navpanes=0`. O zoom, a pinça, girar,
 *   páginas e a seleção de texto são os do navegador, os mesmos da guia nova. A nossa barra fica com Baixar e Abrir em nova aba.
 * ⚠ SEM O LEITOR (o Chrome do Android, navegador antigo): o pdf.js de sempre, abrindo em 100%, e a roda/pinça pela conta MEDIDA no leitor do
 *   Chrome (`zoomPelaRoda`: ×e^(−Δ/100) por evento, entre ×0,75 e ×1,25; 25% a 500%). A conta antiga era ×e^(−Δ/500): a pinça andava 5× mais devagar.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as PointerDoReact } from 'react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import './visualizadorTexto.css';

import type { PDFDocumentProxy } from 'pdfjs-dist';

type Modo = 'largura' | 'pagina' | 'livre';
type PdfJs = typeof import('pdfjs-dist');

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
/** VISUALIZADOR-PDF-02b — a conta do leitor de PDF do Chrome, MEDIDA (25/11, Chromium do Playwright, um evento de roda com Ctrl a partir de 100%):
 *  Δ −1 → 101% · −5 → 105% · −10 → 111% · −20 → 122% · −40 ou mais → 125% · +10 → 90% · +50 ou mais → 75%. Ou seja, ×e^(−Δ/100) por evento,
 *  preso entre ×0,75 e ×1,25: um dente da roda do mouse (Δ 100) = +25% / −25%; a pinça (Δ pequenos e seguidos) acompanha os dedos. */
const RODA_ESCALA = 100;
const RODA_PASSO_MAX = 1.25;
const RODA_PASSO_MIN = 0.75;

export const limitarZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
/** O zoom novo pela roda/pinça: para cima (deltaY < 0) amplia — a mesma conta do leitor do Chrome. */
export const zoomPelaRoda = (z: number, deltaY: number): number =>
  limitarZoom(z * Math.min(RODA_PASSO_MAX, Math.max(RODA_PASSO_MIN, Math.exp(-deltaY / RODA_ESCALA))));

/** O navegador tem leitor de PDF próprio? (`navigator.pdfViewerEnabled`; ausente = não — o pdf.js desenha.) */
export const temLeitorDePdf = (): boolean => typeof navigator !== 'undefined' && Reflect.get(navigator, 'pdfViewerEnabled') === true;
/** Os bytes são de um PDF (`%PDF` no começo)? Outro arquivo nunca vai ao leitor do navegador. */
export const ehPdf = (bytes: ArrayBuffer): boolean => {
  const b = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
  for (let i = 0; i + 3 < b.length; i++) if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true;
  return false;
};
/** O endereço do `iframe`: a URL `blob:` local + abrir em 100% e sem a coluna de miniaturas (o ☰ do leitor a abre) — os parâmetros de abertura
 *  de PDF que o Chrome, o Edge e o Firefox leem. */
export const enderecoNoLeitor = (urlDoBlob: string): string => `${urlDoBlob}#zoom=100&navpanes=0`;
/** O ponto sob o cursor fica sob o cursor: a rolagem nova para ir do zoom `z0` ao `z1` com o cursor em `cursor` (px do quadro). */
export const rolagemCentrada = (rolagem: number, cursor: number, z0: number, z1: number): number =>
  Math.max(0, (rolagem + cursor) * (z1 / z0) - cursor);

export function VisualizadorDeDocumento({ open, onFechar, bytes, nome, onNovaAba, onBaixar, embutido = false }: {
  open: boolean;
  onFechar: () => void;
  bytes: ArrayBuffer;
  nome: string;
  onNovaAba: () => void;
  /** BOLETO D3d (Gabriel 18/11 11:59): quem passa ganha o "Baixar" (salvar o arquivo); sem ele, a barra é a de sempre. */
  onBaixar?: () => void;
  /** CONC-PAINEL-02 (Gabriel 23/11: "Ver abre o visualizador DENTRO do painel") — o MESMO visualizador sem o diálogo de tela cheia: a barra
   *  e o quadro ocupam a caixa de quem o monta (altura de quem hospeda). O desenho, o zoom e o texto são os mesmos. */
  embutido?: boolean;
}) {
  const quadro = useRef<HTMLDivElement | null>(null);
  /* VISUALIZADOR-PDF-02: o quadro como ESTADO — o efeito da roda roda quando ele monta (o Portal do Dialog monta depois do 1º efeito) */
  const [quadroMontado, setQuadroMontado] = useState<HTMLDivElement | null>(null);
  const refDoQuadro = useCallback((n: HTMLDivElement | null) => { quadro.current = n; setQuadroMontado(n); }, []);
  const tela = useRef<HTMLCanvasElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const camadaDeTexto = useRef<HTMLDivElement>(null);
  const pdfjsRef = useRef<PdfJs | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [pagina, setPagina] = useState(1);
  /* VISUALIZADOR-PDF-02b: o leitor do navegador quando ele existe; sem ele, o pdf.js (abre em 100%) */
  const nativo = temLeitorDePdf() && ehPdf(bytes);
  const [urlDoBlob, setUrlDoBlob] = useState<string | null>(null);
  /* a barra do leitor mostra o TÍTULO do PDF (sem ele, o código da URL blob): o leitor recebe uma CÓPIA com o título = o nome do arquivo
     (`pdfComTitulo`; o pdf-lib sob demanda). Sem cópia possível (senha, arquivo que o pdf-lib não abre), o original. Baixar = o original. */
  useEffect(() => {
    if (!open || !nativo) return undefined;
    let vivo = true;
    let u: string | null = null;
    (async () => {
      let copia: Uint8Array | null = null;
      try {
        const { pdfComTitulo } = await importarDoApp(() => import('@/lib/pdf/pdfComTitulo'));
        copia = await pdfComTitulo(bytes, nome);
      } catch (e) {
        console.error('[VisualizadorDeDocumento] título', e);
      }
      if (!vivo) return;
      u = URL.createObjectURL(new Blob([copia ?? bytes], { type: 'application/pdf' }));
      setUrlDoBlob(u);
    })();
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); setUrlDoBlob(null); };
  }, [open, nativo, bytes, nome]);
  const [modo, setModo] = useState<Modo>('livre');
  const [zoom, setZoom] = useState(1);
  const [rotacao, setRotacao] = useState(0);
  /* o ponto que o zoom pela roda/pinça mantém sob o cursor (aplicado depois que a página muda de tamanho) */
  const ancora = useRef<{ x: number; y: number; z0: number; sx: number; sy: number } | null>(null);
  const zoomAtual = useRef(1);
  zoomAtual.current = zoom;

  /* abrir o documento (uma vez por arquivo) */
  useEffect(() => {
    if (!open || nativo) return;
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
  }, [open, bytes, nativo]);

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
    const caixa = quadroMontado;
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
      /* a roda em LINHAS (o Firefox, `deltaMode` 1) vira px como no navegador (uma linha ≈ 33 px) */
      ampliarEm(e.clientX - r.left, e.clientY - r.top, zoomPelaRoda(zoomAtual.current, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY));
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
  }, [open, quadroMontado]);

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

  const corpo = (
      <>
        {/* a barra fixa (o mock): − % + · Ajustar à largura · Página inteira · Girar · ‹ n/N › · Abrir em nova aba */}
        <div className="flex h-[32px] shrink-0 items-center gap-1 border-b bg-card px-2 text-[10.5px]" data-testid="visualizador-barra">
          {nativo
            ? <span data-testid="visualizador-leitor-nativo" />
            : <>
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
            </>}
          <span className="ml-auto" />
          {onBaixar && <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={onBaixar} data-testid="visualizador-baixar">⤓ Baixar</Button>}
          {!embutido && <Button type="button" size="sm" variant="outline" className={BOTAO} onClick={onNovaAba} data-testid="visualizador-nova-aba">↗ Abrir em nova aba</Button>}
        </div>
        {nativo ? (
          <div className="flex min-h-0 flex-1 bg-[#e9ecf0]" data-testid="visualizador-quadro" data-modo="nativo">
            {urlDoBlob && <iframe src={enderecoNoLeitor(urlDoBlob)} title={nome} className="h-full w-full border-0" data-testid="visualizador-iframe" />}
          </div>
        ) : (
        <div ref={refDoQuadro} className={`flex min-h-0 flex-1 overflow-auto bg-[#e9ecf0] p-4 ${arrastando ? 'cursor-grabbing select-none' : ''}`}
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
        )}
      </>
  );

  if (embutido) {
    return <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden" data-testid="visualizador-documento" data-embutido="">{corpo}</div>;
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* o ✕ branco sobre a barra azul, centrado nela (o padrão dos modais de barra azul: `[&>button]:text-primary-foreground`) */}
      <DialogContent className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="visualizador-documento">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="min-w-0 truncate text-[13px] font-semibold text-primary-foreground" title={nome}>{nome}</DialogTitle>
          <DialogDescription className="sr-only">A nota fiscal em tela cheia, com zoom, girar e páginas.</DialogDescription>
        </div>
        {corpo}
      </DialogContent>
    </Dialog>
  );
}
