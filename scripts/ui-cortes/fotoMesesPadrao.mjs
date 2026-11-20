/* UI-MESES-PADRAO-01 — prints da regra global (cabeçalho navy, fita de meses única, corpo #D9DFE8) na bancada SINTÉTICA.
 * Uso: `node scripts/ui-cortes/fotoMesesPadrao.mjs <pasta> [rotulo]` — grava <rotulo>-<tela>-<tamanho>.png. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'foto'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const TELAS = [
  ['conciliacao', 'tela=conciliacao'],
  ['lancamentos', 'tela=financeiro'],
  ['dre', 'tela=dre&f_de=2025-07'],
  ['fechamento', 'tela=fechamento-grupo&v=topo'],
];
const TAMANHOS = [['1366', 1366, 768], ['918', 918, 700], ['celular', 390, 844]];
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const [nome, qs] of TELAS) for (const [tam, w, h] of TAMANHOS) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?${qs}&barra=32`); await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${nome}-${tam}.png`) });
    console.log(nome, tam);
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
