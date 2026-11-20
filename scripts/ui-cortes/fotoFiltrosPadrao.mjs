/* PROD-LANC-FILTROS-01 — prints do "Personalizado…" (o SeletorDePeriodo do DRE) e da lista de Categorias (o padrão único de seleção
 * múltipla), contagens pequenas (A) × de 4 dígitos (B, `&n=grande`), 1280×800 e 1920×1080; mede a largura do botão e da lista (iguais em A e B).
 * Uso: `node scripts/ui-cortes/fotoFiltrosPadrao.mjs <pasta>` */
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
const b = await chromium.launch();
const med = {};
try {
  for (const [tam, w, h] of [['1280', 1280, 800], ['1920', 1920, 1080]]) for (const [cli, qs] of [['A', ''], ['B', '&n=grande']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=filtros-padrao&barra=32${qs}`); await p.waitForTimeout(1500);
    await p.locator('[data-testid="periodo-personalizado-gatilho"]').click(); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(PASTA, `personalizado-${tam}-${cli}.png`) });
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.locator('[data-testid="filtro-multiplo"]').click(); await p.waitForTimeout(500);
    const m = await p.evaluate(() => ({
      botao: Math.round(document.querySelector('[data-testid="filtro-multiplo"]').getBoundingClientRect().width),
      lista: Math.round(document.querySelector('[data-testid="filtro-multiplo-lista"]').getBoundingClientRect().width),
      linhas: [...document.querySelectorAll('[data-opcao]')].map((e) => Math.round(e.getBoundingClientRect().height)),
      texto: document.querySelector('[data-testid="filtro-multiplo"]').textContent,
    }));
    med[`${tam}${cli}`] = m;
    await p.screenshot({ path: path.join(PASTA, `categorias-${tam}-${cli}.png`) });
    console.log(tam, cli, JSON.stringify(m));
    await p.close();
  }
  for (const t of ['1280', '1920']) console.log(t, JSON.stringify(med[`${t}A`].botao) === JSON.stringify(med[`${t}B`].botao) && med[`${t}A`].lista === med[`${t}B`].lista ? 'A × B IGUAIS' : 'A × B DIFERENTES');
} finally { await b.close(); await servidor.close(); }
