/* NOTAS-RECEITA-A1-01 F3.4 MÍNIMA — fotos (bancada SINTÉTICA) a 918×600 e 1366×768: o "+ Novo ▾" aberto com o selo de boletos + notas
 * (D2), a lista "Notas da Receita" (Todas / A lançar / Ciência pendente) e os dados de uma nota ("Ver").
 * Uso: `node scripts/ui-cortes/fotoNotasReceita.mjs <pasta> [rotulo] [so]`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'f34', SO = ''] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const lista = async (p) => { await p.locator('[data-testid="notas-da-receita"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(800); };
const aba = (re) => async (p) => { await lista(p); await p.locator('[data-testid="notas-da-receita"] button', { hasText: re }).first().click(); await p.waitForTimeout(500); };
const FLUXOS = {
  menu: { url: 'tela=notas-receita-menu', antes: async (p) => {
    await p.locator('[data-testid="btn-novo"]').waitFor({ timeout: 20000 }); await p.locator('[data-testid="btn-novo"]').click();
    await p.locator('[data-testid="menu-novo"]').waitFor({ timeout: 4000 }); await p.waitForTimeout(400);
  } },
  todas: { url: 'tela=notas-receita', antes: lista },
  'a-lancar': { url: 'tela=notas-receita', antes: aba(/^A lançar/) },
  ciencia: { url: 'tela=notas-receita', antes: aba(/^Ciência pendente/) },
  casar: { url: 'tela=notas-receita-casar', antes: async (p) => { await p.locator('[data-testid="receita-casar"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(600); } },
  ver: { url: 'tela=notas-receita', antes: async (p) => { await lista(p); await p.locator('[data-testid="receita-ver"]').first().click(); await p.waitForTimeout(500); } },
};
try {
  for (const [w, h] of [[918, 600], [1366, 768]]) for (const [nome, f] of Object.entries(FLUXOS).filter(([n]) => !SO || n.startsWith(SO))) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    try {
      await p.goto(`${base}/index.html?${f.url}`); await f.antes(p);
      await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${nome}-${w}x${h}.png`) });
      console.log(`${w}x${h} ${nome}: ok`);
    } catch (e) { console.log(`${w}x${h} ${nome}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
