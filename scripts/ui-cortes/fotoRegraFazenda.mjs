/* FIN-REGRA-MODAL-02 — fotos (bancada SINTÉTICA, nas formas da Vera e do NJ medidas no proto) a 1280×720 e 1920×1080: o modal "Fazenda fora
 * da regra da conta" aberto, a linha clicada (destaque âmbar: a que abre o Editar lançamento por cima) e a lista da saída "Conta" aberta.
 * Uso: `node scripts/ui-cortes/fotoRegraFazenda.mjs <pasta> [so]`. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, SO = ''] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const modal = async (p) => { await p.locator('[data-testid="correcao-linha"]').first().waitFor({ timeout: 20000 }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(700); };
const linha = (id) => `[data-testid="correcao-linha"][data-id="${id}"]`;
const FLUXOS = {
  aberto: { antes: modal },
  'linha-clicada': { antes: async (p, c) => { await modal(p); await p.locator(`${linha(c.clicar)} [data-testid="correcao-regra"]`).click(); await p.waitForTimeout(500); } },
  'conta-aberta': { antes: async (p, c) => { await modal(p); await p.locator(`${linha(c.conta)} [data-testid="correcao-para-conta"] button`).first().click(); await p.waitForTimeout(600); } },
};
const CLIENTES = { vera: { clicar: 'v-man', conta: 'v-itr' }, nj: { clicar: 'nj-4', conta: 'nj-2' } };
try {
  for (const [cli, c] of Object.entries(CLIENTES)) for (const [w, h] of [[1280, 720], [1920, 1080]])
    for (const [nome, f] of Object.entries(FLUXOS).filter(([n]) => !SO || `${cli}-${n}`.startsWith(SO))) {
      const p = await navegador.newPage({ viewport: { width: w, height: h } });
      try {
        await p.goto(`${base}/index.html?tela=regra-fazenda&v=${cli}`); await f.antes(p, c);
        await p.screenshot({ path: path.join(PASTA, `${cli}-${nome}_${w}x${h}.png`) });
        console.log(`${cli} ${w}x${h} ${nome}: ok`);
      } catch (e) { console.log(`${cli} ${w}x${h} ${nome}: FALHOU ${String(e).slice(0, 160)}`); }
      await p.close();
    }
} finally { await navegador.close(); await servidor.close(); }
