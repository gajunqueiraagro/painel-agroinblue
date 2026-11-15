/* CONC-CUSTEIO-FONTE-01 — fotos do "Relatório de custeio" (bancada SINTÉTICA) a 1126×579, 1366×768 e 1440×900: a lista na régua e a lista
 * rolada (topo e cabeçalho presos). Uso: `node scripts/ui-cortes/fotoCusteio.mjs <pasta> [rotulo]`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'depois'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const [w, h] of [[1126, 579], [1366, 768], [1440, 900]]) for (const rolado of [false, true]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const nome = `${ROTULO}-custeio${rolado ? '-rolado' : ''}-${w}x${h}.png`;
    try {
      await p.goto(`${base}/index.html?tela=custeio-txt`);
      await p.locator('[data-testid="custeio-item"]').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
      if (rolado) { await p.locator('[data-testid="bancada-custeio"]').evaluate((e) => { e.scrollTop = 400; }); await p.waitForTimeout(300); }
      await p.screenshot({ path: path.join(PASTA, nome) });
      console.log(`${nome}: ok`);
    } catch (e) { console.log(`${nome}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
