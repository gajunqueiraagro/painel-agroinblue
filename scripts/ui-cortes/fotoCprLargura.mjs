/* CPR-LARGURA-01 — fotos e medidas da lista da Contas a Pagar e Receber a 1.280, 1.440 e 1.920 (bancada SINTÉTICA), normal e Ampliado
 * (sem a barra lateral, como no app): a largura da lista, a mínima dela e se o rolador dela rola na horizontal.
 * Uso: `node scripts/ui-cortes/fotoCprLargura.mjs <pasta> [rotulo]` — grava <rotulo>-<largura>[-amp].png (rotulo: "foto" sem ele). */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'foto'] = process.argv.slice(2);
if (PASTA) fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const [w, h] of [[1280, 720], [1440, 800], [1920, 1000]]) for (const ampliado of [false, true]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=cpr${ampliado ? '&semlateral=1' : ''}`); await p.waitForTimeout(1500);
    if (ampliado) { await p.locator('[data-testid="cpr-ampliar"]').first().click(); await p.waitForTimeout(500); }
    const medidas = await p.evaluate(() => {
      const lista = document.querySelector('[data-tabela-que-rola]'); const rolador = lista?.parentElement;
      const larg = (e) => (e ? Math.round(e.getBoundingClientRect().width) : null);
      return { lista: larg(lista), minima: lista?.style.minWidth, disponivel: larg(rolador),
        rolaNoX: rolador && rolador.scrollWidth > rolador.clientWidth + 1 ? `${rolador.scrollWidth}/${rolador.clientWidth}` : 'não' };
    });
    console.log(w, ampliado ? 'ampliado' : 'normal', JSON.stringify(medidas));
    if (PASTA) await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${w}${ampliado ? '-amp' : ''}.png`) });
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
