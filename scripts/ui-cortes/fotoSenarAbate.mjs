/* IMPORTAR-ABATE-01 (D5) — fotos do Negociar lote com o SENAR (bancada SINTÉTICA, só os números do lote 6), aba dos impostos, a
 * 1240×697, 1024×600 e 918×516 (= 1240 a 135%). Uso: `node scripts/ui-cortes/fotoSenarAbate.mjs <pasta> <rotulo>` — grava
 * <rotulo>-<caso>-<largura>.png para os casos lote6 (só SENAR) e composta (Funrural + SENAR). */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'foto'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const caso of ['lote6', 'composta']) for (const [w, h] of [[1240, 697], [1024, 600], [918, 516]]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=negociar-lote&v=${caso}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1300);
    await p.getByRole('button', { name: 'Bônus, descontos e impostos', exact: true }).first().click(); await p.waitForTimeout(500);
    const linhas = await p.evaluate(() => [...document.querySelectorAll('[data-testid="resultado-do-lote"] tbody tr')]
      .map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim()));
    console.log(caso, w, JSON.stringify(linhas));
    await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${caso}-${w}.png`) });
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
