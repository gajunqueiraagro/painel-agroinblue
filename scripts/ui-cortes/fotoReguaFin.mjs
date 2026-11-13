/* FIN-FINANC-LAYOUT-03 — a RÉGUA ÚNICA das tabelas de financiamento em 10 e em 11 (cabeçalho 1px menor), LADO A LADO, para o Gabriel
 * escolher: a lista de Financiamentos e as abas do contrato (Cronograma, Liberações com as 4 formas, Pagamentos, Documentos, Histórico),
 * a 1126×579 e 1366×768, na bancada SINTÉTICA (`&regua=10|11`). Mede corte e sobreposição em cada foto (a mesma medida do fotoContrato).
 * Uso: `node scripts/ui-cortes/fotoReguaFin.mjs <pasta>` — grava <tela>-<10|11>-<w>x<h>.png e lado-a-lado-<tela>-<w>x<h>.png. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [PASTA = ''] = process.argv.slice(2);
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
const TELAS = [
  { nome: 'lista', url: 'tela=financiamentos-lista&enc=1' },
  { nome: 'contrato-cronograma', url: 'tela=contrato', aba: null },
  { nome: 'contrato-liberacoes', url: 'tela=contrato&lib=formas', aba: 'Liberações' },
  { nome: 'contrato-pagamentos', url: 'tela=contrato', aba: 'Pagamentos' },
  { nome: 'contrato-documentos', url: 'tela=contrato', aba: 'Documentos' },
  { nome: 'contrato-historico', url: 'tela=contrato', aba: 'Histórico' },
  { nome: 'contrato-a-resolver', url: 'tela=contrato', aba: 'A resolver' },
];
const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let achados = 0;
try {
  for (const [w, h] of (process.env.TAMANHOS ?? '750x483,1024x640,1126x579,1199x700,1366x768,1440x900').split(',').map((t) => t.split('x').map(Number))) {
    for (const t of TELAS) {
      const fotos = [];
      for (const regua of (process.env.REGUAS ?? '10,11').split(',')) {
        const p = await navegador.newPage({ viewport: { width: w, height: h } });
        await p.goto(`${base}/index.html?${t.url}&regua=${regua}`); await p.waitForTimeout(1500);
        if (t.aba) {
          const b = p.getByRole('button', { name: new RegExp(`^${t.aba}`) }).first();
          if (!(await b.count())) { console.log(`${w}x${h} ${t.nome}: aba ${t.aba} não existe`); await p.close(); continue; }
          await b.click(); await p.waitForTimeout(500);
        }
        const r = await p.evaluate(MEDIR);
        /* Chat 16:45: NENHUM "…" em célula de tabela (a regra de corte aceitava com title; aqui não) */
        r.cortes.push(...await p.evaluate(() => [...document.querySelectorAll('td *, td')].filter((e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)
          .map((e) => `"…" na célula: ${(e.textContent ?? '').trim().slice(0, 30)}`)));
        /* decisão do Gabriel 16:58 "sem quebrar": nenhuma célula em 2 linhas, salvo a Obs. das liberações (livre); Chat 18:35: na lista, a
           Descrição (e o rótulo do grupo, que quebra só entre os nomes) em ATÉ 2 linhas */
        r.cortes.push(...await p.evaluate(() => [...document.querySelectorAll('tbody td, thead th, tfoot td')].filter((td) => td.dataset.testid !== 'observacao-da-liberacao').flatMap((td) => {
          /* até 2 linhas (Chat 18:35/22:00): a Descrição, o rótulo do grupo (só entre os nomes), o "Próx. / venc." do cabeçalho e a seta do sucessor */
          const ate2 = ['cel-descricao', 'rotulo-do-grupo', 'cel-pendencia'].includes(td.dataset.testid ?? '') || td.dataset.coluna === 'proxVencimento';
          const fonte = parseFloat(getComputedStyle(td).fontSize);
          const rg = document.createRange(); rg.selectNodeContents(td); const alt = rg.getBoundingClientRect().height;
          return alt > fonte * (ate2 ? 3.2 : 2.2) ? [`${ate2 ? '3+' : '2'} linhas: ${(td.textContent ?? '').trim().slice(0, 30)}`] : [];
        })));
        /* Chat 22:00 (regra soberana): TODA coluna com rótulo ordena — th com texto e sem aria-sort é achado */
        r.cortes.push(...await p.evaluate(() => [...document.querySelectorAll('thead th')].filter((th) => (th.textContent ?? '').trim() && !th.hasAttribute('aria-sort'))
          .map((th) => `cabeçalho sem ordenar: ${(th.textContent ?? '').trim()}`)));
        /* fora de tabela o MEDIR não olha: o valor do cartão do Resumo que passa da caixa do cartão também é achado */
        r.cortes.push(...await p.evaluate(() => [...document.querySelectorAll('[data-testid="bloco-resumo"] > div')].flatMap((c) => {
          const v = c.lastElementChild; const k = c.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(v); const b = rg.getBoundingClientRect();
          return b.right > k.right - 2 ? [`cartão "${c.firstElementChild?.textContent}" o valor passa ${Math.round(b.right - k.right + 2)}px`] : [];
        })));
        const n = r.cortes.length + r.sobre.length + (r.rolaPagina ? 1 : 0);
        achados += n;
        const fonte = await p.evaluate(() => { const td = document.querySelector('tbody td'); const th = document.querySelector('thead th');
          return `${td ? getComputedStyle(td).fontSize : '?'}/${th ? getComputedStyle(th).fontSize : '?'}`; });
        const rolaX = await p.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-testid^="area-que-rola"], [data-testid="lista-fin-rolagem"]')].map((a) => a.scrollWidth - a.clientWidth)));
        console.log(`${w}x${h} ${t.nome} régua ${regua} (célula/cabeçalho ${fonte}) · a tabela rola na horizontal ${rolaX}px: cortes ${r.cortes.length} · sobreposições ${r.sobre.length}${r.rolaPagina ? ' · A PÁGINA ROLA' : ''}`);
        for (const x of [...new Set([...r.cortes, ...r.sobre])].slice(0, 10)) console.log('   ', x);
        const arq = path.join(PASTA || '/tmp', `${t.nome}-${regua}-${w}x${h}.png`);
        if (PASTA && w >= 1126) { await p.screenshot({ path: arq }); fotos.push({ regua, arq }); }
        await p.close();
      }
      /* as duas lado a lado, com o rótulo em cima (só 1126 e 1366: as do pedido) */
      if (PASTA && fotos.length === 2 && (w === 1126 || w === 1366) && false) {
        const img = (f) => `<figure style="margin:0"><figcaption style="font:600 16px system-ui;padding:6px 0">célula ${f.regua}px · cabeçalho ${Number(f.regua) - 1}px</figcaption>
          <img src="data:image/png;base64,${fs.readFileSync(f.arq).toString('base64')}" style="width:${w}px;height:${h}px;border:1px solid #888"></figure>`;
        const c = await navegador.newPage({ viewport: { width: w * 2 + 48, height: h + 60 } });
        await c.setContent(`<body style="margin:8px;background:#fff;display:flex;gap:24px">${img(fotos[0])}${img(fotos[1])}</body>`);
        await c.screenshot({ path: path.join(PASTA, `lado-a-lado-${t.nome}-${w}x${h}.png`), fullPage: true });
        await c.close();
      }
    }
  }
} finally { await navegador.close(); await servidor.close(); }
console.log(`TOTAL de achados: ${achados}`);
