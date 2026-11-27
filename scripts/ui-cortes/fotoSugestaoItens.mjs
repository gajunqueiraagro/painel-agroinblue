/* NOTA-ITENS-SUGESTAO (Gabriel 27/11) — o modal "Novo lançamento · do XML" REAL da bancada (dado SINTÉTICO), em foto e em DOM estático
 * (HTML + o CSS que a página usa), para o mock ser o modal de hoje com só as 3 mudanças. Uso: `node scripts/ui-cortes/fotoSugestaoItens.mjs <pasta>`. */
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
const navegador = await chromium.launch();
const pronto = async (p) => { await p.locator('[role="dialog"]').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); };
const ESTADOS = {
  geral: async (p) => { await pronto(p); },
  itens: async (p) => { await pronto(p); await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(600); },
  'itens-contas': async (p) => {
    await ESTADOS.itens(p);
    const b = p.getByText('Contas', { exact: true }).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(600); }
  },
};
/* a página como está: valor dos campos vira atributo, scripts saem, o CSS de todas as folhas entra num <style> */
const congelar = () => {
  for (const i of document.querySelectorAll('input, textarea')) { i.setAttribute('value', i.value); if (i.tagName === 'TEXTAREA') i.textContent = i.value; }
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  const corpo = document.body.cloneNode(true);
  for (const s of corpo.querySelectorAll('script')) s.remove();
  return `<!doctype html><html lang="pt-BR" class="${document.documentElement.className}"><head><meta charset="utf-8"><style>${css}</style></head>`
    + `<body class="${document.body.className}" style="${document.body.getAttribute('style') ?? ''}">${corpo.innerHTML}</body></html>`;
};
try {
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) for (const [nome, antes] of Object.entries(ESTADOS)) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    try {
      await p.goto(`${base}/index.html?tela=lancamento&m=novo&v=xml`); await antes(p);
      await p.screenshot({ path: path.join(PASTA, `hoje-${nome}-${w}x${h}.png`) });
      if (w === 1280) fs.writeFileSync(path.join(PASTA, `hoje-${nome}.html`), await p.evaluate(congelar));
      console.log(`${w}x${h} ${nome}: ok`);
    } catch (e) { console.log(`${w}x${h} ${nome}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
