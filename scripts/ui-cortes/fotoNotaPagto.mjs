/* NOTA-PAGTO-PARCELADO-01 — fotos da prévia da nota (bancada SINTÉTICA) a 1126×579, 1366×768 e 1440×900: P3 o aviso "não é compra",
 * P1 o "Outros lançamentos do fornecedor" (2 marcados) e P2 o "Como foi pago? › Parcelado". Uso: `node scripts/ui-cortes/fotoNotaPagto.mjs <pasta> [rotulo]`. */
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
const pronto = async (p) => { await p.locator('[role="dialog"]').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(1200); };
const FLUXOS = {
  semcompra: { url: 'tela=nota-pdf&v=jalancada&natureza=conserto', antes: pronto },
  outros: { url: 'tela=nota-pdf&v=jalancada&outros=1', antes: async (p) => {
    await pronto(p);
    await p.locator('[data-testid="nota-abas-ja"] button', { hasText: 'Parcelas × sistema' }).first().click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="nota-outros-abrir"]').click(); await p.waitForTimeout(900);
    const c = p.locator('[data-testid="outros-marcar"]:not([disabled])'); await c.nth(0).click(); await p.waitForTimeout(300);
  } },
  'outros-juntados': { url: 'tela=nota-pdf&v=jalancada&outros=1', antes: async (p) => {
    await FLUXOS.outros.antes(p);
    await p.locator('[data-testid="outros-juntar"]').click(); await p.waitForTimeout(800);
  } },
  parcelado: { url: 'tela=nota-pdf&v=jalancada', antes: async (p) => {
    await pronto(p);
    await p.locator('[data-testid="nota-mais"]').click(); await p.waitForTimeout(300); await p.locator('[data-testid="nota-mais-criar-novo"]').click(); await p.waitForTimeout(600);
    await p.locator('[data-testid="nota-como-foi-pago"]').click(); await p.waitForTimeout(300); await p.locator('[data-testid="nota-como-parcelado"]').click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="nota-parcelado-forma"]').click(); await p.waitForTimeout(300); await p.getByRole('option', { name: 'PIX', exact: true }).click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="nota-cartao-parcelas"]').fill('4'); await p.waitForTimeout(600);
    const d = p.locator('[data-testid="nota-cartao-fatura"] input, input[data-testid="nota-cartao-fatura"]').first(); if (await d.count()) { await d.click(); await d.fill('10/10/2026'); await d.press('Enter'); await p.waitForTimeout(600); }
  } },
  /* NOTA-LIGAR-LANCAMENTO-01 — o Novo documento com a nota de outra filial (o quadro e a participação) e a prévia da troca */
  ligar: { url: 'tela=documento-nota&v=ligar', antes: async (p) => {
    await p.locator('[data-testid="doc-arquivo"]').waitFor({ timeout: 20000 });
    const conteudo = await p.evaluate(() => globalThis.__xmlDaBancada);
    await p.locator('[data-testid="doc-arquivo"]').setInputFiles({ name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(conteudo) });
    await p.locator('[data-testid="nota-x-linha"][data-quem="liberacao"]').waitFor({ timeout: 8000 }); await p.waitForTimeout(500);
  } },
  'ligar-troca': { url: 'tela=documento-nota&v=ligar', antes: async (p) => {
    await FLUXOS.ligar.antes(p);
    await p.locator('[data-testid="nota-filial-trocar"]').click(); await p.locator('[data-testid="nota-filial-confirmar"]').waitFor({ timeout: 4000 }); await p.waitForTimeout(300);
  } },
};
try {
  for (const [w, h] of [[1126, 579], [1366, 768], [1440, 900]]) for (const [nome, f] of Object.entries(FLUXOS).filter(([n]) => !SO || n.startsWith(SO))) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    try {
      await p.goto(`${base}/index.html?${f.url}`); await f.antes(p);
      await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${nome}-${w}x${h}.png`) });
      console.log(`${w}x${h} ${nome}: ok`);
    } catch (e) { console.log(`${w}x${h} ${nome}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
