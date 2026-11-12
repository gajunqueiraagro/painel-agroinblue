/* NOTA-PDF-REGRESSAO-01 — fotos do Novo lançamento lido do DANFE SINTÉTICO com a FATURA em coluna e o item em meias-linhas (`v=notacoluna`)
 * a 1126×579, 1366×768 e 1440×900: a Geral (descrição sugerida pelo item), o Pagamento (o vencimento da duplicata) e os Itens da nota.
 * Uso: `node scripts/ui-cortes/fotoNotaColuna.mjs <pasta> [rotulo]`. */
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
const pronto = async (p) => { await p.locator('[role="dialog"]').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(1500); };
const aba = (nome) => async (p) => { await pronto(p); await p.getByRole('tab', { name: new RegExp(`^${nome}`) }).first().click(); await p.waitForTimeout(900); };
const FLUXOS = { geral: pronto, pagamento: aba('Pagamento'), itens: aba('Itens da nota') };
try {
  for (const [w, h] of [[1126, 579], [1366, 768], [1440, 900]]) for (const [nome, antes] of Object.entries(FLUXOS)) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    try {
      await p.goto(`${base}/index.html?tela=lancamento&m=novo&v=notacoluna`); await antes(p);
      await p.screenshot({ path: path.join(PASTA, `${ROTULO}-${nome}-${w}x${h}.png`) });
      console.log(`${w}x${h} ${nome}: ok`);
    } catch (e) { console.log(`${w}x${h} ${nome}: FALHOU ${String(e).slice(0, 160)}`); }
    await p.close();
  }
} finally { await navegador.close(); await servidor.close(); }
