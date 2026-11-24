/* FOLHA-NA-CAIXA-01 — fotos (bancada SINTÉTICA, `dados/folhaDaCaixa.ts` + `dados/caixaBoletos.ts`) a 1280×720 e 1920×1080: a linha
 * "Folha" na Caixa; a prévia por funcionário (divide 1ª + 2ª, atualiza, sem lançamento com "Criar"); com o "Criar" marcado (Aprovar livre);
 * aplicado (um PDF "não subiu · de novo"); o já aplicado com o Desfazer e o que volta; Resolvidos com a "folha aplicada".
 * Uso: `node scripts/ui-cortes/fotoFolhaNaCaixa.mjs <pasta> [rotulo]`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'folha'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const caixa = async (p) => { await p.locator('[data-testid="caixa-de-boletos"]').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); };
const abrir = async (p) => { await caixa(p); await p.locator('[data-testid="acao-abrir_folha"]').first().click(); await p.locator('[data-testid="linha-folha-0"]').waitFor(); await p.waitForTimeout(600); };
const criar = async (p) => { await abrir(p); await p.locator('[data-testid="criar-2"]').click(); await p.waitForTimeout(600); };
const FLUXOS = [
  ['1-linha-na-caixa', '', async (p) => { await caixa(p); await p.locator('[data-chave^="folha:"]').first().scrollIntoViewIfNeeded(); await p.locator('[data-chave^="folha:"]').first().hover(); await p.waitForTimeout(300); }],
  ['2-previa', '', abrir],
  ['3-criar-marcado', '', criar],
  ['3c-completar', '&caso=folha_completar', abrir],
  ['3b-sem-recibo-aberto', '', async (p) => { await abrir(p); await p.locator('[data-testid="ver-sem-recibo"]').click(); await p.waitForTimeout(300); }],
  ['4-aplicado', '', async (p) => { await criar(p); await p.locator('[data-testid="aprovar-folha"]').click(); await p.waitForTimeout(1200); }],
  ['5-ja-aplicado-desfazer', '&caso=folha_aplicada', async (p) => {
    await abrir(p).catch(() => {}); await p.locator('[data-testid="desfazer-folha"]').click();
    await p.locator('[data-testid="motivo-desfazer-folha"]').fill('o contador mandou o recibo de novo com o valor certo');
    await p.locator('[data-testid="prever-desfazer"]').click(); await p.waitForTimeout(600); }],
  ['6-resolvidos', '', async (p) => { await caixa(p); await p.locator('[data-testid="caixa-de-boletos"] button', { hasText: /^Resolvidos/ }).first().click(); await p.waitForTimeout(700); }],
];
try {
  for (const [w, h] of [[1280, 720], [1920, 1080]]) for (const [nome, extra, antes] of FLUXOS) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/?tela=caixa-boletos${extra}`);
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
