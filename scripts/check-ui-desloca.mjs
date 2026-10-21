#!/usr/bin/env node
/**
 * UI-SEM-DESLOCAR-01 (FORN-01b, Gabriel 21/10/2026) — `npm run check:ui-desloca`: as telas reais na bancada do `check:ui-cortes`
 * (scripts/ui-cortes, banco simulado), no Chromium do Playwright. Em cada tela, troca os ESTADOS — tamanho de pagina, pagina, filtros e
 * segmentos, abas, busca com e sem resultado, a faixa de aviso aparecendo — e reprova se x, y ou largura de qualquer CONTROLE (botao, aba,
 * campo, seletor), TITULO ou CABECALHO DE TABELA mudar em relacao ao estado inicial (mais de 0,5px). E' a LEI DE ESTABILIDADE VISUAL
 * (13/09) e o espaco reservado (09/10) virando gate: o texto que muda com a selecao tem largura reservada para o maior valor possivel.
 *   - Medidos: `button, [role=tab], [role=button], [role=combobox], input, select, textarea, h1-h4, th, [data-desloca]` visiveis, fora
 *     de `tbody` e da area que rola (as linhas sao o conteudo que muda; o cabecalho `th` e o que esta' preso contam) e fora de
 *     `[data-desloca-livre]` (o miolo que troca de proposito). A identidade de cada um e' o `data-testid` (com a ordem, se repete) ou o
 *     caminho no DOM.
 *   - `auto`: troca cada opcao de cada `Segmentado` (pelas classes do componente) e cada aba (`role=tab`) da tela, uma por vez.
 *   - So' comparam os que existem nos dois estados (o que aparece ou some e' conteudo); o que ESTAVA e mudou de lugar ou de largura,
 *     reprova.
 * Antes de varrer, o detector se prova num fixture (um rotulo que cresce empurra o vizinho): se nao achar, sai com codigo 2.
 * `--so NOME` mede so' os cenarios que comecam com NOME; `--tamanhos 1126x579,...` troca os tamanhos.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtroRapido } from './ui-gate-rapido.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SO = arg('--so');
const TAMANHOS = arg('--tamanhos') ? arg('--tamanhos').split(',').map((t) => t.split('x').map(Number))
  : [[750, 483], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];

const espera = (p, ms = 450) => p.waitForTimeout(ms);
const botao = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await espera(p); };
const clicar = (sel) => async (p) => { await p.locator(sel).first().click(); await espera(p); };
const digitar = (sel, txt) => async (p) => { await p.locator(sel).first().fill(txt); await espera(p, 800); };

/* Cada estado e' um gesto aplicado em sequencia; cada um e' comparado com o estado INICIAL da tela. `url` = outra pagina inteira
   comparada com a inicial (a faixa de aviso aparecendo). */
const CENARIOS = [
  { nome: 'fornecedores', url: 'tela=fornecedores&barra=32&n=2356', estados: [
    ['por pagina 50', botao(/^50$/)], ['por pagina 200', botao(/^200$/)], ['por pagina 100', botao(/^100$/)],
    ['proxima pagina', botao(/^Próxima/)], ['proxima de novo', botao(/^Próxima/)], ['pagina anterior', botao(/^← Anterior/)],
    ['Inativos', botao(/^Inativos /)], ['Mesclados', botao(/^Mesclados /)], ['Todos', botao(/^Todos /)], ['Ativos', botao(/^Ativos /)],
    ['Sem CPF/CNPJ ligado', clicar('[data-testid="filtro-sem-documento"]')], ['Sem CPF/CNPJ desligado', clicar('[data-testid="filtro-sem-documento"]')],
    ['busca com resultado', digitar('[data-testid="busca-fornecedores"]', 'Exemplo')],
    ['busca sem resultado', digitar('[data-testid="busca-fornecedores"]', 'zzzzzz nada')],
    ['busca limpa', digitar('[data-testid="busca-fornecedores"]', '')],
    ['aba Sem cadastro', clicar('[data-testid="aba-sem-cadastro"]')], ['aba Cadastro', clicar('[data-testid="aba-cadastro"]')],
    ['faixa do inativo aparecendo', { url: 'tela=fornecedores&barra=32&n=2356&aviso=1' }],
  ] },
  /* as outras telas do `check:ui-cortes` que tem escolhas: `auto` troca cada opcao de cada `Segmentado` (pelas classes do componente) e cada aba
     (`role=tab`) visivel, uma por vez a partir da tela recem-aberta, e compara com a inicial; `antes` prepara a tela */
  { nome: 'fornecedores-sem-cadastro', url: 'tela=fornecedores&barra=32&n=2356', antes: clicar('[data-testid="aba-sem-cadastro"]'), auto: true },
  { nome: 'recorrencias', url: 'tela=recorrencias&barra=32', auto: true },
  { nome: 'cpr', url: 'tela=cpr', auto: true },
  { nome: 'mesclar', url: 'tela=mesclar', auto: true },
  /* OC-CC-BOTAO-BUSCAR-DESLOCA-01 — os botoes da conta corrente nao andam com o motivo ("Principal já programado…") aparecendo ou
     sumindo, nem as abas com a sub-aba Despesas. So' nos tamanhos em que o modal da OC tem desenho (>= 1000). */
  ...['venda', 'abate'].map((v) => ({ nome: `oc-cc-faixa-${v}`, url: `tela=oc&v=${v}&aba=financeiro&cc=1`, minLargura: 1000, estados: [
    ['sem principal programado (sem o motivo)', { url: `tela=oc&v=${v}&aba=financeiro&cc=1&coberto=0` }],
  ] })),
];

/* roda NA PAGINA: o retangulo de cada elemento medido, pela identidade */
function medirPosicoes() {
  const SEL = 'button, [role="tab"], [role="button"], [role="combobox"], input, select, textarea, h1, h2, h3, h4, th, [data-desloca]';
  const raiz = document.getElementById('root') ?? document.body;
  const caminho = (e) => { const p = []; for (let x = e; x && x !== raiz; x = x.parentElement) { const pai = x.parentElement; p.unshift(`${x.tagName.toLowerCase()}${pai ? `:${[...pai.children].indexOf(x)}` : ''}`); } return p.join('>'); };
  const rolaPorDentro = (e) => {
    /* a lista e' o container que rola DENTRO da tela (o da casca da bancada, `data-casca`, e' a pagina: nao conta) */
    for (let a = e; a && a !== raiz && !a.hasAttribute('data-casca'); a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'sticky') return false;
      if (a !== e && /(auto|scroll)/.test(cs.overflowY)) return true;
    }
    return false;
  };
  const vistos = new Map(); const out = {};
  for (const e of document.querySelectorAll(SEL)) {
    if (e.closest('tbody') || e.closest('[data-desloca-livre]')) continue;
    /* dentro da area que ROLA (a lista) mora o conteudo: so' o cabecalho e o que esta' preso (sticky) contam */
    if (e.tagName !== 'TH' && rolaPorDentro(e)) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) continue;
    const tid = e.getAttribute('data-testid');
    let chave = tid ? `#${tid}` : caminho(e);
    const n = vistos.get(chave) ?? 0; vistos.set(chave, n + 1); if (n) chave += `[${n}]`;
    out[chave] = { x: r.left, y: r.top, w: r.width, rotulo: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40) };
  }
  return out;
}
const comparar = (a, b, estado) => {
  const achados = [];
  for (const [k, va] of Object.entries(a)) {
    const vb = b[k]; if (!vb) continue;
    const d = [['x', vb.x - va.x], ['y', vb.y - va.y], ['largura', vb.w - va.w]].filter(([, v]) => Math.abs(v) > 0.5);
    if (d.length) achados.push({ estado, texto: `"${va.rotulo}"${va.rotulo !== vb.rotulo ? ` -> "${vb.rotulo}"` : ''}: ${d.map(([n, v]) => `${n} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(', ')}` });
  }
  return achados;
};

/* UI-GATE-RAPIDO-01 — `--rapido`: so' as telas cuja arvore de imports alcanca o diff contra o origin/proto (`scripts/ui-gate-rapido.mjs`);
   mudanca compartilhada sai com 3 ("rode o completo"); diff sem tela, com 0. */
const RAPIDO = process.argv.includes('--rapido');
const naRapida = RAPIDO ? filtroRapido('check-ui-desloca') : () => true;
/* no modo rapido, os 7 tamanhos do contrato (o `minLargura` do cenario continua valendo) */
const TAMANHOS_DA_VEZ = RAPIDO && !arg('--tamanhos') ? [[750, 520], [750, 600], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]] : TAMANHOS;
const ESCOLHIDOS = CENARIOS.filter((c) => (!SO || c.nome.startsWith(SO)) && naRapida(c));
const servidor = await createServer({ configFile: path.join(AQUI, 'ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let codigo = 0;
try {
  /* AUTO-TESTE: o rotulo que cresce empurra o botao ao lado (achado); o que tem largura reservada nao empurra (sem achado) */
  const p0 = await navegador.newPage({ viewport: { width: 800, height: 300 } });
  await p0.setContent(`<div id="root"><div style="display:flex;gap:8px"><span id="t">1–50</span><button data-testid="vizinho">Próxima</button></div>
    <div style="display:flex;gap:8px"><span id="r" style="display:inline-block;width:120px">1–50</span><button data-testid="reservado">Próxima</button></div></div>`);
  const a0 = await p0.evaluate(medirPosicoes);
  await p0.evaluate(() => { document.getElementById('t').textContent = '1.001–1.050 de 2.356'; document.getElementById('r').textContent = '1.001–1.050'; });
  const prova = comparar(a0, await p0.evaluate(medirPosicoes), 'prova');
  await p0.close();
  if (!prova.some((x) => x.texto.startsWith('"Próxima"')) || prova.length !== 1) { console.error(`check-ui-desloca: AUTO-TESTE FALHOU (${JSON.stringify(prova)})`); process.exit(2); }

  const todos = []; let medicoes = 0;
  for (const cen of ESCOLHIDOS) for (const [w, h] of TAMANHOS_DA_VEZ) {
    if (w < (cen.minLargura ?? 0)) continue; /* tela sem desenho abaixo desta largura (o modal da OC: >= 1000) */
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const erros = []; p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
    const abrir = async (pg, url) => { await pg.goto(`${base}/index.html?${url}`); await pg.evaluate(() => document.fonts.ready); await espera(pg, 1300); };
    await abrir(p, cen.url);
    if (cen.antes) await cen.antes(p);
    const inicial = await p.evaluate(medirPosicoes);
    /* `auto`: as escolhas da tela, por indice (a lista e' relida na tela recem-aberta a cada troca) */
    /* o `Segmentado` da casa: `div.inline-flex.shrink-0.overflow-hidden.rounded-md.border` com os botoes filhos (src/components/ui/segmentado) */
    const ESCOLHAS = 'div.inline-flex.shrink-0.overflow-hidden.rounded-md.border > button:not([disabled]), [role="tab"]:not([disabled])';
    const estados = [...(cen.estados ?? [])];
    if (cen.auto) {
      const rotulos = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('tbody'))
        .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)), ESCOLHAS);
      rotulos.forEach((rot, i) => estados.push([`escolha "${rot}"`, async (pg) => {
        await abrir(pg, cen.url); if (cen.antes) await cen.antes(pg);
        await pg.evaluate(([sel, k]) => { const v = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('tbody')); v[k]?.click(); }, [ESCOLHAS, i]);
        await espera(pg, 600);
      }]));
    }
    for (const [nome, gesto] of estados) {
      medicoes++;
      if (typeof gesto === 'function') {
        try { await gesto(p); } catch (e) { erros.push(`${nome}: ${String(e).slice(0, 100)}`); continue; }
        todos.push(...comparar(inicial, await p.evaluate(medirPosicoes), nome).map((a) => ({ tela: cen.nome, tamanho: `${w}x${h}`, ...a })));
      } else {
        const pu = await navegador.newPage({ viewport: { width: w, height: h } }); await abrir(pu, gesto.url);
        todos.push(...comparar(inicial, await pu.evaluate(medirPosicoes), nome).map((a) => ({ tela: cen.nome, tamanho: `${w}x${h}`, ...a })));
        await pu.close();
      }
    }
    todos.push(...erros.map((e) => ({ tela: cen.nome, tamanho: `${w}x${h}`, estado: 'erro', texto: e })));
    await p.close();
  }
  const unicos = [...new Map(todos.map((a) => [`${a.tela}|${a.estado}|${a.texto}`, a])).values()];
  if (unicos.length) {
    codigo = 1;
    console.error(`check-ui-desloca: ${unicos.length} achado(s):`);
    for (const a of unicos) console.error(`  ${a.tela} [${todos.filter((x) => x.tela === a.tela && x.estado === a.estado && x.texto === a.texto).map((x) => x.tamanho).join(' ')}] ${a.estado}: ${a.texto}`);
  } else console.log(`check-ui-desloca: ${ESCOLHIDOS.length} telas, ${medicoes} trocas de estado medidas (${TAMANHOS_DA_VEZ.length} tamanhos): nada se desloca.`);
} finally { await navegador.close(); await servidor.close(); }
process.exit(codigo);
