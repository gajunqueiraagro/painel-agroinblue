/* BOLETO-DDA-API-01 D1c (a) + "+ Novo ▾" — fotos (bancada SINTÉTICA) a 918×600 e 1366×768: o bloco de ações com o menu aberto em
 * Lançamentos; a caixa de boletos com os 8 PDFs soltos (Chegando), a senha aberta, e as abas Na caixa / Todos.
 * Uso: `node scripts/ui-cortes/fotoCaixaBoletos.mjs <pasta> [rotulo] [so]`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'depois', SO = ''] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const NOMES = ['boleto-0031283.pdf', 'boleto_dez_G.pdf', 'boleto-condominio.pdf', 'boleto_insumos.pdf', 'boleto-pago-antes.pdf',
  'boleto com nome de arquivo muito comprido que não cabe na coluna 2026-12.pdf', 'Boleto_Unimed.pdf', 'boleto-escaneado.pdf'];
const caixa = async (p) => { await p.locator('[data-testid="caixa-de-boletos"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(800); };
const soltar = async (p) => {
  await caixa(p);
  await p.locator('[data-testid="input-da-caixa"]').setInputFiles(NOMES.map((n) => ({ name: n, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${n}`) })));
  await p.waitForTimeout(1200);
};
const aba = (re) => async (p) => { await caixa(p); await p.locator('[data-testid="caixa-de-boletos"] button', { hasText: re }).first().click(); await p.waitForTimeout(600); };
const FLUXOS = {
  'novo-menu': { url: 'tela=financeiro', antes: async (p) => {
    await p.locator('[data-testid="btn-novo"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
    await p.locator('[data-testid="btn-novo"]').click(); await p.locator('[data-testid="menu-novo"]').waitFor({ timeout: 4000 }); await p.waitForTimeout(400);
  } },
  'caixa-chegando': { url: 'tela=caixa-boletos', antes: soltar },
  'caixa-senha-aberta': { url: 'tela=caixa-boletos', antes: async (p) => {
    await soltar(p); await p.locator('[data-testid="sugestao-de-senha"]').first().click(); await p.waitForTimeout(900);
  } },
  'caixa-na-caixa': { url: 'tela=caixa-boletos', antes: aba(/^Na caixa/) },
  'caixa-todos': { url: 'tela=caixa-boletos', antes: aba(/^Todos/) },
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
