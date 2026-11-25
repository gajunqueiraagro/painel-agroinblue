/* VISUALIZADOR-PDF-02 / 02b — fotos no Chromium de verdade (bancada SINTÉTICA): DANFE 1 página, boleto e PDF de 3 páginas, a 1366×768 e
 * 1920×1080, nos DOIS caminhos do visualizador:
 *   leitor  — o Chromium COM o leitor de PDF (`channel: 'chromium'`, `navigator.pdfViewerEnabled`): o iframe com a URL blob em #zoom=100;
 *   pdfjs   — o Chromium SEM leitor (o `headless shell` padrão do Playwright, como o Chrome do Android): o pdf.js de sempre.
 * Em cada um: (1) como abre; (2) um dente da roda com Ctrl (Δ 100); (3) a pinça do trackpad (10 eventos de Δ −10, como o Chrome do Mac a manda);
 * (4) ⌘ + roda. Imprime o zoom do documento (a barra do leitor ou a nossa) e o zoom da PÁGINA (tem de ficar 1: o navegador não amplia o app).
 * Uso: `node scripts/ui-cortes/fotoVisualizador.mjs <pasta>`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;

/* o zoom do documento: no leitor, o campo de zoom da barra do Chrome (dentro do frame do leitor); no pdf.js, a nossa barra */
const zoomDoLeitor = async (p) => {
  for (const f of p.frames()) {
    try {
      const v = await f.evaluate(() => document.querySelector('pdf-viewer')?.shadowRoot?.querySelector('viewer-toolbar')?.shadowRoot
        ?.querySelector('#zoom-controls input, input[aria-label*="oom"]')?.value);
      if (v) return v;
    } catch { /* frame de outra origem ainda carregando */ }
  }
  return '?';
};
const zoomDoDocumento = (p, caminho) => (caminho === 'leitor' ? zoomDoLeitor(p) : p.locator('[data-testid="visualizador-zoom"]').textContent());
const pronto = async (p, caminho) => {
  if (caminho === 'leitor') { await p.locator('[data-testid="visualizador-iframe"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(2500); }
  else { await p.locator('[data-testid="visualizador-pagina-desenhada"] canvas').waitFor({ timeout: 20000 }); await p.waitForTimeout(1200); }
};
const rodaCom = async (p, tecla, deltaY, vezes = 1) => {
  const q = await p.locator('[data-testid="visualizador-quadro"]').boundingBox();
  await p.mouse.move(q.x + q.width / 2, q.y + q.height / 3);
  await p.keyboard.down(tecla);
  for (let i = 0; i < vezes; i++) { await p.mouse.wheel(0, deltaY); await p.waitForTimeout(120); }
  await p.keyboard.up(tecla);
  await p.waitForTimeout(900);
};

for (const caminho of ['leitor', 'pdfjs']) {
  const navegador = await chromium.launch(caminho === 'leitor' ? { channel: 'chromium' } : {});
  try {
    for (const [w, h] of [[1366, 768], [1920, 1080]]) for (const v of ['danfe', 'boleto', 'tres']) {
      const p = await navegador.newPage({ viewport: { width: w, height: h } });
      const foto = async (passo) => { await p.screenshot({ path: path.join(PASTA, `${caminho}-${v}-${w}x${h}-${passo}.png`) }); };
      try {
        await p.goto(`${base}/fotoVisualizador.html?v=${v}`); await pronto(p, caminho);
        const temLeitor = await p.evaluate(() => navigator.pdfViewerEnabled === true);
        const modo = await p.locator('[data-testid="visualizador-quadro"]').getAttribute('data-modo');
        const abre = await zoomDoDocumento(p, caminho); await foto('1-abre');
        await rodaCom(p, 'Control', -100, 1);
        const dente = await zoomDoDocumento(p, caminho); await foto('2-ctrl-um-dente');
        await rodaCom(p, 'Control', -10, 10);
        const pinca = await zoomDoDocumento(p, caminho); await foto('3-pinca');
        await rodaCom(p, 'Meta', 100, 1);
        const meta = await zoomDoDocumento(p, caminho); await foto('4-cmd-roda');
        const zoomPagina = await p.evaluate(() => window.__zoomDoNavegador());
        console.log(`${caminho} ${w}x${h} ${v}: leitor do navegador ${temLeitor} (${modo}) · abre ${abre} · Ctrl+1 dente ${dente} · +pinça ${pinca} · ⌘+roda ${meta} · zoom da página ${zoomPagina}`);
      } catch (e) { console.log(`${caminho} ${w}x${h} ${v}: FALHOU ${String(e).slice(0, 200)}`); }
      await p.close();
    }
  } finally { await navegador.close(); }
}
await servidor.close();
