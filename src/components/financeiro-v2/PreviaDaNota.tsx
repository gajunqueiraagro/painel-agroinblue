/**
 * A FOLHA DA NOTA, COM O QUE FOI LIDO EM AMARELO — FIN-NOTA-PDF-01 (mock aprovado: o PDF a' esquerda). A primeira folha do PDF
 * desenhada pelo pdfjs num canvas que CABE no quadro (nada rola: a escala e' a menor entre largura e altura), e por cima um retangulo
 * ambar por campo lido (`MarcaNoPdf`, em pontos do PDF; o y do pdfjs e' a linha de base, de baixo para cima).
 * ⚠ So' desenha: ler e' do `lerNota`. Falha ao desenhar = o quadro diz e a leitura segue valendo.
 */
import { useEffect, useRef, useState } from 'react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import type { MarcaNoPdf } from '@/lib/financeiro/nfe/danfe';

export function PreviaDaNota({ bytes, marcas, tamanho, divergentes = [] }: {
  bytes: ArrayBuffer;
  marcas: readonly MarcaNoPdf[];
  tamanho: { largura: number; altura: number } | null;
  /** Campos da marca que a chave contradiz: o retangulo deles e' vermelho. */
  divergentes?: readonly MarcaNoPdf['campo'][];
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [escala, setEscala] = useState(0);
  const [falhou, setFalhou] = useState(false);

  /* a escala que faz a folha caber inteira no quadro */
  useEffect(() => {
    const el = caixa.current;
    if (!el || !tamanho) return;
    const medir = () => setEscala(Math.min(el.clientWidth / tamanho.largura, el.clientHeight / tamanho.altura));
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [tamanho]);

  useEffect(() => {
    let vivo = true;
    if (!escala || !tela.current) return;
    (async () => {
      try {
        const pdfjs = await importarDoApp(() => import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const pagina = await pdf.getPage(1);
        const dpr = window.devicePixelRatio || 1;
        const vp = pagina.getViewport({ scale: escala * dpr });
        const c = tela.current;
        if (!vivo || !c) return;
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        c.style.width = `${Math.floor(vp.width / dpr)}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        await pagina.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
      } catch {
        if (vivo) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
  }, [bytes, escala]);

  const alt = tamanho?.altura ?? 0;
  return (
    <div ref={caixa} className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden rounded border bg-[#f7f7f5]" data-testid="nota-previa">
      {falhou ? (
        <span className="m-auto px-2 text-center text-[10px] text-muted-foreground">Não foi possível desenhar o PDF aqui; o que foi lido está à direita.</span>
      ) : (
        <div className="relative" style={tamanho && escala ? { width: tamanho.largura * escala, height: tamanho.altura * escala } : undefined}>
          <canvas ref={tela} aria-hidden="true" />
          {escala > 0 && marcas.filter((m) => m.pagina === 1).map((m, i) => (
            <span key={i} aria-hidden="true" data-testid="nota-marca" data-campo={m.campo}
              className={divergentes.includes(m.campo) ? 'absolute rounded-[1px] bg-red-500/30 outline outline-1 outline-red-600' : 'absolute rounded-[1px] bg-amber-300/40 outline outline-1 outline-amber-500'}
              style={{ left: m.x * escala - 1, top: (alt - m.y - m.h) * escala - 1, width: m.w * escala + 2, height: m.h * 1.25 * escala + 2 }} />
          ))}
        </div>
      )}
    </div>
  );
}
