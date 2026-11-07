/* FECH-TOPO-COMPACTO-01 — fotos e medidas do topo do Fechamento de pastos (bancada SINTÉTICA, `tela=fechamento-grupo&v=topo`) a 1.240, 1.024
 * e 1.240 com zoom de 135% (a janela de 1.240×700 vista com 135%: 919×519 px de CSS, densidade 1,35).
 * Mede a altura do topo, a de cada coluna, a da tabela de conferência e onde começa a grade dos pastos.
 * Uso: `node scripts/ui-cortes/fotoFechTopo.mjs <pasta> [rotulo]` — grava <rotulo>-<tamanho>.png (rotulo: "foto" sem ele). */
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
const TAMANHOS = [['1240', 1240, 700, 1], ['1024', 1024, 600, 1], ['1240-zoom135', 919, 519, 1.35]];
try {
  for (const [nome, w, h, dpr] of TAMANHOS) {
    const p = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await p.goto(`${base}/index.html?tela=fechamento-grupo&v=topo&barra=32`); await p.waitForTimeout(2500);
    const medidas = await p.evaluate(() => {
      const topo = document.querySelector('.sticky.top-0');
      const grade = topo?.firstElementChild;
      const cols = grade ? [...grade.children] : [];
      const tabela = topo?.querySelector('table');
      const alt = (e) => (e ? Math.round(e.getBoundingClientRect().height) : null);
      const prox = topo?.nextElementSibling;
      return { topo: alt(topo), col1: alt(cols[0]), col2: alt(cols[1]), col3: alt(cols[2]), tabela: alt(tabela),
        larguraCol3: cols[2] ? Math.round(cols[2].getBoundingClientRect().width) : null,
        gradeComecaEm: prox ? Math.round(prox.getBoundingClientRect().top) : null };
    });
    console.log(nome, JSON.stringify(medidas));
    if (PASTA) await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${nome}.png`) });
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
