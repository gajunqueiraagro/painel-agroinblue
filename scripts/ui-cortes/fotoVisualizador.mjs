/* VISUALIZADOR-PDF-02 — fotos no Chromium de verdade (bancada SINTÉTICA): DANFE 1 página, boleto e PDF de 3 páginas, a 1366×768 e
 * 1920×1080: (1) como abre (Página inteira); (2) "Ajustar à largura"; (3) depois de Ctrl + roda (o evento real do navegador, com ctrlKey —
 * a pinça do trackpad no Chrome do Mac chega assim); (4) ⌘ + roda; e no de 3 páginas, a 3ª. Imprime o % da barra e o zoom da PÁGINA.
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
const navegador = await chromium.launch();
const pct = (p) => p.locator('[data-testid="visualizador-zoom"]').textContent();
const pronto = async (p) => { await p.locator('[data-testid="visualizador-pagina-desenhada"] canvas').waitFor({ timeout: 20000 }); await p.waitForTimeout(1200); };
const rodaCom = async (p, tecla, deltaY, vezes = 1) => {
  const q = await p.locator('[data-testid="visualizador-quadro"]').boundingBox();
  await p.mouse.move(q.x + q.width / 2, q.y + q.height / 3);
  await p.keyboard.down(tecla);
  for (let i = 0; i < vezes; i++) { await p.mouse.wheel(0, deltaY); await p.waitForTimeout(60); }
  await p.keyboard.up(tecla);
  await p.waitForTimeout(900);
};
try {
  for (const [w, h] of [[1366, 768], [1920, 1080]]) for (const v of ['danfe', 'boleto', 'tres']) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const foto = async (passo) => { await p.screenshot({ path: path.join(PASTA, `${v}-${w}x${h}-${passo}.png`) }); };
    try {
      await p.goto(`${base}/fotoVisualizador.html?v=${v}`); await pronto(p);
      const abre = await pct(p); const modo = await p.locator('[data-testid="visualizador-quadro"]').getAttribute('data-modo');
      await foto('1-abre');
      await p.locator('[data-testid="visualizador-largura"]').click(); await p.waitForTimeout(900);
      const larg = await pct(p); await foto('2-largura');
      await p.locator('[data-testid="visualizador-pagina"]').click(); await p.waitForTimeout(900);
      await rodaCom(p, 'Control', -100, 3);
      const ctrl = await pct(p); await foto('3-ctrl-roda');
      await rodaCom(p, 'Meta', 100, 2);
      const meta = await pct(p); await foto('4-cmd-roda');
      const zoomPagina = await p.evaluate(() => window.__zoomDoNavegador());
      let pag3 = '';
      if (v === 'tres') {
        await p.locator('[aria-label="Próxima página"]').click(); await p.locator('[aria-label="Próxima página"]').click(); await p.waitForTimeout(1000);
        pag3 = ` · página ${await p.locator('[data-testid="visualizador-pagina-n"]').textContent()}`; await foto('5-pagina-3');
      }
      console.log(`${w}x${h} ${v}: abre ${abre} (${modo}) · largura ${larg} · Ctrl+roda ${ctrl} · ⌘+roda ${meta} · zoom da página ${zoomPagina}${pag3}`);
    } catch (e) { console.log(`${w}x${h} ${v}: FALHOU ${String(e).slice(0, 200)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
