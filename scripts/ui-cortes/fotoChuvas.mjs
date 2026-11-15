/* CHUVAS-VOLTAR-01 — fotos de Produção › Chuvas › lançar (bancada SINTÉTICA) a 1126×579, 1366×768 e 1440×900, e a medida de quanto do quadro
 * fica à vista sem rolar (o ano inteiro + Tot + anos anteriores + Acum.). Uso: `node scripts/ui-cortes/fotoChuvas.mjs <pasta> [rotulo]`. */
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
  for (const [w, h] of [[1126, 579], [1366, 768], [1440, 900]]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    try {
      await p.goto(`${base}/index.html?tela=chuvas-lancar`);
      await p.locator('[data-testid="chuvas-tabela"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
      await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${w}x${h}.png`) });
      const m = await p.evaluate(() => {
        const q = document.querySelector('[data-testid="chuvas-quadro"]'); const t = document.querySelector('[data-testid="chuvas-tabela"]');
        return { quadro: q.clientHeight, tabela: t.scrollHeight, rolaH: q.scrollWidth > q.clientWidth };
      });
      console.log(`${w}x${h}: quadro ${m.quadro}px · tabela ${m.tabela}px · ${m.tabela <= m.quadro ? 'CABE sem rolar' : `rola ${m.tabela - m.quadro}px`} · rolagem horizontal ${m.rolaH ? 'SIM' : 'não'}`);
    } catch (e) { console.log(`${w}x${h}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
