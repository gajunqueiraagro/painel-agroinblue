/* PASTO-FICHA-01 PR B — fotos da FICHA do pasto na bancada (SINTÉTICO): o "+ Novo" (Cadastro) e o lápis do P10 nas 6 abas, a 1240×697 e
 * 918×516 (= 1240 a 135%). Uso: `node scripts/ui-cortes/fotoFichaPasto.mjs <pasta> [rotulo]` — grava <rotulo>-<caso>-<largura>.png. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'ficha'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const ABAS = ['cadastro', 'infra', 'avaliacoes', 'reformas', 'lotacao', 'documentos'];
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const [w, h] of [[1240, 697], [918, 516]]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=pastos&barra=32`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    /* o NOVO */
    await p.locator('[data-testid="pastos-novo"]').click(); await p.locator('[data-testid="ficha-do-pasto"]').waitFor(); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(PASTA, `${ROTULO}-novo-cadastro-${w}.png`) });
    await p.locator('[data-testid="ficha-salvar"]').click(); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(PASTA, `${ROTULO}-novo-pendencias-${w}.png`) });
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    /* o EDITAR (P10, o primeiro da lista) nas 6 abas */
    await p.locator('[data-testid="editar-pasto"]').first().click(); await p.locator('[data-testid="ficha-do-pasto"]').waitFor(); await p.waitForTimeout(900);
    for (const a of ABAS) {
      await p.locator(`[data-testid="ficha-aba-${a}"]`).click(); await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(PASTA, `${ROTULO}-editar-${a}-${w}.png`) });
    }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
