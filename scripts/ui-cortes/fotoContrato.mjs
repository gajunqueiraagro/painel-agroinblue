/* FIN-FINANC-LAYOUT-02 — fotos e medidas da tela do contrato de crédito (bancada SINTÉTICA) a 1126×579, 1366×768 e 1440×900, em cada aba:
 * conta os elementos que cortam (scrollWidth > clientWidth) e os textos que se sobrepõem (caixas de texto de células vizinhas ou que saem
 * da própria célula). Uso: `node scripts/ui-cortes/fotoContrato.mjs <pasta> [rotulo] [v] [parâmetros extra, ex. lib=formas]` — grava <rotulo>-<v|grande>-<aba>-<w>x<h>.png. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA, ROTULO = 'foto', V = '', EXTRA = ''] = process.argv.slice(2);
if (PASTA) fs.mkdirSync(PASTA, { recursive: true });
const MEDIR = () => {
        const cortes = [], sobre = [];
        const vis = (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none'; };
        const nome = (e) => `${e.tagName.toLowerCase()}${e.dataset.testid ? `[${e.dataset.testid}]` : ''} "${(e.textContent ?? '').trim().slice(0, 40)}"`;
        for (const e of document.querySelectorAll('body *')) {
          if (!vis(e) || !e.getClientRects().length) continue;
          const s = getComputedStyle(e);
          const rola = /(auto|scroll)/.test(s.overflowX);
          /* permitido: "…" com o inteiro no title (regra de corte de 21/10) e o texto só para leitor de tela (sr-only, 1px) */
          const reticencia = s.textOverflow === 'ellipsis' && !!e.closest('[title]');
          if (!rola && !reticencia && e.clientWidth > 1 && !(e.tagName === 'INPUT' && e.type === 'file') && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && s.overflowX !== 'visible') cortes.push(`${nome(e)} ${e.scrollWidth}>${e.clientWidth}`);
        }
        /* textos: cada nó de texto não vazio vira uma caixa; duas caixas de células diferentes que se cruzam = sobreposição; caixa fora da célula = vaza */
        const caixas = [];
        const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = it.nextNode(); n; n = it.nextNode()) {
          if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const cel = n.parentElement.closest('td,th');
          /* o texto que termina em "…" (com title) tem a caixa do texto INTEIRO; o que se vê é a caixa do elemento */
          if (getComputedStyle(n.parentElement).textOverflow === 'ellipsis' && n.parentElement.closest('[title]')) continue;
          /* o texto escondido atrás do cabeçalho/rodapé presos (a lista rolou por baixo) não conta: só o que se VÊ */
          for (const b of rg.getClientRects()) {
            if (b.width <= 0.5) continue;
            const topo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            if (!topo || !(n.parentElement.contains(topo) || topo.contains(n.parentElement))) continue;
            caixas.push({ b, cel, t: n.textContent.trim().slice(0, 30) });
          }
        }
        for (const c of caixas) if (c.cel) {
          const k = c.cel.getBoundingClientRect();
          if (c.b.left < k.left - 0.5 || c.b.right > k.right + 0.5 || c.b.top < k.top - 0.5 || c.b.bottom > k.bottom + 0.5) sobre.push(`vaza da célula: "${c.t}"`);
        }
        for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
          const a = caixas[i], b = caixas[j];
          if (a.cel === b.cel) continue;
          /* o cabeçalho e o rodapé presos cobrem a linha que rolou por baixo (fundo opaco): não é sobreposição */
          const preso = (c) => !!c?.closest('thead,tfoot');
          if (preso(a.cel) !== preso(b.cel)) continue;
          const x = Math.min(a.b.right, b.b.right) - Math.max(a.b.left, b.b.left), y = Math.min(a.b.bottom, b.b.bottom) - Math.max(a.b.top, b.b.top);
          if (x > 0.5 && y > 0.5) sobre.push(`"${a.t}" × "${b.t}"`);
        }
        return { cortes, sobre, rolaPagina: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
      };
const ABAS = ['Cronograma', 'Liberações', 'Pagamentos', 'Documentos', 'Histórico', 'A resolver'];
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let achados = 0;
try {
  for (const [w, h] of [[1126, 579], [1366, 768], [1440, 900]]) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${base}/index.html?tela=contrato${V ? `&v=${V}` : ''}${EXTRA ? `&${EXTRA}` : ''}`); await p.waitForTimeout(1500);
    for (const aba of ABAS) {
      if (aba !== 'Cronograma') {
        const b = p.getByRole('button', { name: new RegExp(`^${aba}`) }).first();
        if (!(await b.count())) continue;
        await b.click(); await p.waitForTimeout(500);
      }
      const r = await p.evaluate(MEDIR);
      const n = r.cortes.length + r.sobre.length + (r.rolaPagina ? 1 : 0);
      achados += n;
      console.log(`${w}x${h} ${aba}: cortes ${r.cortes.length} · sobreposições ${r.sobre.length}${r.rolaPagina ? ' · A PÁGINA ROLA' : ''}`);
      for (const x of [...new Set([...r.cortes, ...r.sobre].map((t) => t.replace(/"[^"]*"/, '«…»')))].slice(0, 12)) console.log('   ', x);
      const arq = `${ROTULO}-${V || 'grande'}${EXTRA ? `-${EXTRA.replace(/[=&]/g, '-')}` : ''}-${aba.replace(/ /g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}-${w}x${h}.png`;
      if (PASTA) await p.screenshot({ path: path.join(PASTA, arq) });
    }
    /* (b) o modal Nova liberação com a destinação que não existe: '+ Criar "Plantadeira 1211 exemplo"' no fim da lista */
    await p.getByRole('button', { name: /^Liberações/ }).first().click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="nova-liberacao"]').click(); await p.waitForTimeout(500);
    const linha = p.locator('[data-testid="dialogo-liberacao"] span', { hasText: /^Destinação$/ }).locator('xpath=following-sibling::div[1]//button').first();
    await linha.click(); await p.waitForTimeout(300);
    await p.keyboard.type('Plantadeira 1211 exemplo'); await p.waitForTimeout(400);
    const criar = await p.locator('[data-testid="ss-criar"]').count();
    console.log(`${w}x${h} modal: '+ Criar' ${criar ? 'aparece' : 'NÃO aparece'}`);
    if (!criar) achados += 1;
    if (PASTA) await p.screenshot({ path: path.join(PASTA, `${ROTULO}-modal-criar-destinacao-${w}x${h}.png`) });
    await p.close();
    /* Chat 10:26 — o modal Editar contrato › Liberações: o MESMO `BlocoLiberacoes` (4 formas, observação longa) */
    const m = await navegador.newPage({ viewport: { width: w, height: h } });
    await m.goto(`${base}/index.html?tela=cadastro-contrato&m=editar&lib=formas`); await m.waitForTimeout(1500);
    await m.getByRole('button', { name: 'Liberações', exact: true }).first().click(); await m.waitForTimeout(700);
    const rm = await m.evaluate(MEDIR);
    /* a tabela das Liberações cabe no modal sem rolar na horizontal (a Observação à vista) */
    const rolaX = await m.evaluate(() => { const a = document.querySelector('[data-testid="area-que-rola-liberacoes"]'); return !!a && a.scrollWidth > a.clientWidth + 1; });
    if (rolaX) rm.cortes.push('a tabela das Liberações ROLA na horizontal no modal');
    const nm = rm.cortes.length + rm.sobre.length;
    achados += nm;
    console.log(`${w}x${h} modal Editar contrato › Liberações: cortes ${rm.cortes.length} · sobreposições ${rm.sobre.length}`);
    for (const x of [...rm.cortes, ...rm.sobre].slice(0, 8)) console.log('   ', x);
    if (PASTA) await m.screenshot({ path: path.join(PASTA, `${ROTULO}-modal-editar-liberacoes-${w}x${h}.png`) });
    await m.close();
  }
} finally { await navegador.close(); await servidor.close(); }
console.log(`TOTAL de achados: ${achados}`);
