/* CONSERTO "Quem paga" (Gabriel 27/11 10:07) — a prova: a posição de "Forma de pagamento", "Dados para pagamento" e "Parcelamento" na aba
   Pagamento, num lançamento COM e SEM o "Quem paga" ligado, em 1280/1440/1920 (diferença tem de ser 0 px). Bancada, dados sintéticos.
   Uso: node <este> <worktree> <pasta-das-fotos> <rotulo> */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const [WT, PASTA, ROT] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
process.chdir(WT);
const servidor = await createServer({ configFile: path.join(WT, 'scripts/ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}/index.html?`;
const nav = await chromium.launch();
const CASOS = { saida_a_pagar: 'tela=lancamento&m=editar&tipo=saida&status=programado', saida_paga: 'tela=lancamento&m=editar&tipo=saida&status=realizado',
  entrada: 'tela=lancamento&m=editar&tipo=entrada&status=programado', terceiro_marcado: 'tela=lancamento&m=editar&tipo=saida&status=programado&terceiro=marcado',
  novo: 'tela=lancamento&m=novo' };
const TAM = [[1280, 800], [1440, 900], [1920, 1080]];
const saida = {};
try {
  for (const [w, h] of TAM) for (const [caso, url] of Object.entries(CASOS)) {
    const p = await nav.newPage({ viewport: { width: w, height: h } });
    await p.goto(base + url);
    await p.getByRole('tab', { name: /^Pagamento/ }).first().click({ timeout: 20000 });
    await p.waitForTimeout(900);
    const y = async (loc) => { const b = await loc.first().boundingBox().catch(() => null); return b ? Math.round(b.y) : null; };
    const topo = await y(p.locator('[role="tabpanel"][data-state="active"]'));
    const r = {
      forma: await y(p.locator('[data-testid="pagamento-forma"]')),
      dados: await y(p.getByText('Dados para pagamento', { exact: true })),
      parcelamento: await y(p.getByText(/^Parcelamento/)),
      quemPaga: await y(p.locator('[data-testid="quem-paga-linha"]')),
    };
    saida[`${w}`] ??= {};
    saida[`${w}`][caso] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || topo === null ? null : v - topo]));
    await p.screenshot({ path: path.join(PASTA, `${ROT}-${caso}-${w}.png`) });
    await p.close();
  }
} finally { await nav.close(); await servidor.close(); }
let pior = 0;
for (const [w, casos] of Object.entries(saida)) {
  const ref = casos.saida_a_pagar;
  for (const [caso, r] of Object.entries(casos)) for (const k of ['forma', 'dados', 'parcelamento']) {
    const d = r[k] === null || ref[k] === null ? null : r[k] - ref[k];
    /* o Parcelamento só existe no lançamento novo: compara onde existe (os dois nulos = não se aplica) */
    if (r[k] === null && ref[k] === null) continue;
    if (k === 'parcelamento') continue;
    if (d === null || d !== 0) pior = Math.max(pior, d === null ? 999 : Math.abs(d));
  }
}
fs.writeFileSync(path.join(PASTA, `${ROT}-medidas.json`), JSON.stringify(saida, null, 2));
console.log(JSON.stringify({ rotulo: ROT, pior_diferenca_px: pior, medidas: saida }));
