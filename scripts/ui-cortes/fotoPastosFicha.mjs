/* PASTO-FICHA-01 PR B / PASTOS-CAD-02 — fotos de Cadastros › Pastos na bancada: a lista (Vigentes), Todos (com os encerrados), os piquetes
 * abertos, agrupado por destino e a aba Áreas, a 1240×697, 1024×600 e 918×516 (= 1240 a 135%).
 * Uso: `node scripts/ui-cortes/fotoPastosFicha.mjs <pasta> <rotulo> [casos] [--caso <arquivo.json>]` — grava <rotulo>-<caso>-<largura>.png.
 *   `casos` (vírgula): lista, todos, piquetes, destino, areas (padrão: todos eles).
 *   `--caso`: um caso REAL (fazenda, pastos, mapa, lotação, matrícula, mes) injetado na bancada SÓ na hora da foto — o arquivo fica FORA do
 *   repositório (dado de cliente não entra na bancada); com ele, a lista abre no `mes` do caso. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iCaso = args.indexOf('--caso');
const CASO = iCaso >= 0 ? JSON.parse(fs.readFileSync(args[iCaso + 1], 'utf8')) : null;
const [PASTA, ROTULO = 'foto', CASOS = 'lista,todos,piquetes,destino,areas'] = args.filter((_, i) => iCaso < 0 || (i !== iCaso && i !== iCaso + 1));
fs.mkdirSync(PASTA, { recursive: true });
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const clicar = (sel) => async (p) => { const el = p.locator(sel).first(); if (await el.count()) { await el.click(); await p.waitForTimeout(500); } };
const PASSOS = {
  lista: async () => {},
  todos: async (p) => { await p.getByRole('button', { name: 'Todos', exact: true }).first().click(); await p.waitForTimeout(500); },
  piquetes: clicar('[data-testid="abrir-piquetes"]'),
  destino: async (p) => { await p.getByRole('button', { name: 'Destino', exact: true }).first().click(); await p.waitForTimeout(500); await clicar('[data-testid="abrir-piquetes"]')(p); },
  areas: clicar('[data-testid="pastos-modo-areas"]'),
};
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  for (const caso of CASOS.split(',')) for (const [w, h] of [[1240, 697], [1024, 600], [918, 516]]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    if (CASO) await p.addInitScript((c) => { globalThis.__casoPastos = c; }, CASO);
    await p.goto(`${base}/index.html?tela=pastos&barra=32`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    if (CASO?.mes) {
      /* o mês do caso no campo de mês da lista (mês + ano) */
      await p.locator('[data-testid="lista-mes-mes"]').click(); await p.getByRole('option', { name: MESES[Number(CASO.mes.slice(5, 7)) - 1], exact: true }).click();
      await p.waitForTimeout(300);
      await p.locator('[data-testid="lista-mes-ano"]').click(); await p.getByRole('option', { name: CASO.mes.slice(0, 4), exact: true }).click();
      await p.waitForTimeout(900);
    }
    await PASSOS[caso](p); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${caso}-${w}.png`) });
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
