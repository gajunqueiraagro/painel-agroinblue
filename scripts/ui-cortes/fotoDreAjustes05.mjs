/* DRE-AJUSTES-05 — prints do DRE (abre em R$; "por hectare" dentro do total) na bancada SINTÉTICA, cliente A (o dado de sempre) × cliente B
 * (`&v=grande&cliente=b`: todo valor ×10 e nomes longos), Resumido e Detalhado, 1280×800 e 1920×1080 (UI-LARGURA-FIXA-01: a divisão não muda
 * entre os dois). Mede também a largura da grade e o x das colunas — têm de ser iguais em A e B.
 * Uso: `node scripts/ui-cortes/fotoDreAjustes05.mjs <pasta>` */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const CLIENTES = [['A', ''], ['B', '&v=grande&cliente=b']];
const TAMANHOS = [['1280', 1280, 800], ['1920', 1920, 1080]];
const MODOS = ['Resumido', 'Detalhado'];
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const medidas = {};
try {
  for (const [tam, w, h] of TAMANHOS) for (const modo of MODOS) for (const [cli, qs] of CLIENTES) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=dre&f_de=2025-07&barra=32${qs}`); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: new RegExp(`^${modo}$`) }).first().click(); await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return null;
      const th = [...t.querySelectorAll('thead tr:last-child th')].map((e) => Math.round(e.getBoundingClientRect().left));
      const ha = document.querySelectorAll('[data-ha-abaixo]').length;
      const linhaHa = [...document.querySelectorAll('tbody tr td:first-child')].filter((e) => e.textContent?.trim() === 'por hectare').length;
      const chips = [...document.querySelectorAll('button[aria-pressed="true"], [data-state="on"]')].map((e) => e.textContent?.trim()).filter(Boolean);
      return { largura: Math.round(t.getBoundingClientRect().width), colunasX: th, dentroDaCelula: ha, linhasProprias: linhaHa, ligados: chips };
    });
    medidas[`${tam}-${modo}-${cli}`] = m;
    await p.screenshot({ path: path.join(PASTA, `dre-${tam}-${modo.toLowerCase()}-${cli}.png`) });
    console.log(tam, modo, cli, JSON.stringify(m));
    await p.close();
  }
  for (const [tam] of TAMANHOS) for (const modo of MODOS) {
    const a = medidas[`${tam}-${modo}-A`]; const b = medidas[`${tam}-${modo}-B`];
    const igual = a && b && a.largura === b.largura && JSON.stringify(a.colunasX) === JSON.stringify(b.colunasX);
    console.log(`${tam} ${modo}: A × B ${igual ? 'IGUAIS (largura e x das colunas)' : 'DIFERENTES'}`);
  }
} finally { await navegador.close(); await servidor.close(); }
