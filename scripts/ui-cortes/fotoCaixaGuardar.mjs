/* CAIXA-GUARDAR-01 — fotos (bancada SINTÉTICA, `dados/caixaBoletos.ts`) a 1280×720 e 1920×1080: A resolver (o grupo "Na caixa, sem
 * lançamento" PRIMEIRO, com Desfazer) e Resolvidos (o selo "guardado · sem lançamento" no e-mail do guardado; o ligado diz a que lançamento).
 * Uso: `node scripts/ui-cortes/fotoCaixaGuardar.mjs <pasta> [rotulo]`. */
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
const caixa = async (p) => { await p.locator('[data-testid="caixa-de-boletos"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); };
const aba = (re) => async (p) => { await caixa(p); await p.locator('[data-testid="caixa-de-boletos"] button', { hasText: re }).first().click(); await p.waitForTimeout(700); };
const FLUXOS = { 'a-resolver': caixa, resolvidos: aba(/^Resolvidos/) };
try {
  for (const [w, h] of [[1280, 720], [1920, 1080]]) for (const [nome, antes] of Object.entries(FLUXOS)) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/?tela=caixa-boletos`);
    await antes(p);
    const arq = path.join(PASTA, `${ROTULO}-${nome}-${w}.png`);
    await p.screenshot({ path: arq });
    console.log(arq);
    await p.close();
  }
} finally {
  await navegador.close();
  await servidor.close();
}
