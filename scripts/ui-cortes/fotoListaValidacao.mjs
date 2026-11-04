/* MAPA-LISTA-COMPACTA-01 — fotos e medidas da lista da Validação a 1366 (bancada SINTÉTICA, `&piquetes=1&praca=1`):
 * fonte e altura das linhas, nomes cortados, a área, os ícones e a faixa de ações; o mapa com o rótulo da praça sobre o do pasto.
 * Uso: `node scripts/ui-cortes/fotoListaValidacao.mjs <pasta> <prefixo>` — grava <prefixo>-lista.png, <prefixo>-tela.png, <prefixo>-mapa.png e
 * <prefixo>-medidas.json. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, PREFIXO = 'foto'] = process.argv.slice(2);
fs.mkdirSync(PASTA, { recursive: true });
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
try {
  const p = await navegador.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto(`${base}/index.html?tela=mapa-geo&piquetes=1&praca=1`); await p.waitForTimeout(1300);
  await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(900);
  const medidas = await p.evaluate(() => {
    const px = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : null);
    const linhas = [...document.querySelectorAll('[data-testid="validacao-linha"]')];
    const nomes = [...document.querySelectorAll('[data-testid="validacao-nome"]')];
    const cortado = (e) => { const t = e.querySelector('[data-testid="validacao-nome-texto"]') ?? e; return t.scrollWidth > t.clientWidth + 0.5; };
    const area = document.querySelector('[data-testid="validacao-area"]');
    const icone = document.querySelector('[data-testid="validacao-linha"] svg');
    const acoes = document.querySelector('[data-testid="validacao-lista-acoes"]');
    const busca = document.querySelector('[data-testid="validacao-lista"] input');
    return {
      linhas: linhas.length,
      alturaDaLinha: linhas[0] ? Math.round(linhas[0].getBoundingClientRect().height) : null,
      fonteDoNome: px(nomes[0]?.querySelector('[data-testid="validacao-nome-texto"]') ?? nomes[0]),
      larguraDoNome: nomes[0] ? Math.round(nomes[0].getBoundingClientRect().width) : null,
      nomesCortados: nomes.filter(cortado).map(e => e.getAttribute('title')),
      fonteDaArea: px(area), larguraDaArea: area ? Math.round(area.getBoundingClientRect().width) : null,
      icone: icone ? `${Math.round(icone.getBoundingClientRect().width)} px` : null,
      alturaDasAcoes: acoes ? Math.round(acoes.getBoundingClientRect().height) : null,
      fonteDaBusca: px(busca),
      fonteDosBotoes: [...(acoes?.querySelectorAll('button') ?? [])].map(b => `${b.textContent?.trim()} ${px(b)}`),
    };
  });
  await p.locator('[data-testid="validacao-lista"]').screenshot({ path: path.join(PASTA, `${PREFIXO}-lista.png`) });
  await p.screenshot({ path: path.join(PASTA, `${PREFIXO}-tela.png`) });
  /* o mapa perto da praça do P_02 (o rótulo dela sobre o do pasto) */
  await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_02' }).first().click(); await p.waitForTimeout(900);
  const rotulos = await p.evaluate(() => [...document.querySelectorAll('.pasto-label')].map(m => {
    const s = m.querySelector('span'); if (!s) return null; const r = s.getBoundingClientRect();
    return { nome: s.textContent, px: parseFloat(getComputedStyle(s).fontSize), cor: getComputedStyle(s).color, visivel: r.width > 0 && getComputedStyle(m).display !== 'none' && getComputedStyle(m).visibility !== 'hidden' };
  }).filter(x => x && /P_02|P_08|Praça/.test(x.nome)));
  await p.screenshot({ path: path.join(PASTA, `${PREFIXO}-mapa.png`) });
  fs.writeFileSync(path.join(PASTA, `${PREFIXO}-medidas.json`), JSON.stringify({ ...medidas, rotulos }, null, 2));
  console.log(JSON.stringify({ ...medidas, rotulos }, null, 1));
} finally { await navegador.close(); await servidor.close(); }
