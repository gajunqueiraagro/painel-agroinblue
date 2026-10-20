#!/usr/bin/env node
/**
 * UI-SEM-CORTE-01 — `npm run check:ui-cortes`: as telas reais na bancada (scripts/ui-cortes, banco simulado) a 1000x600, 1126x579 e
 * 1440x800, no Chromium do Playwright. Reprova:
 *   (1) RETICENCIAS — elemento com `text-overflow: ellipsis` (ou `-webkit-line-clamp`) cujo texto nao cabe (scrollWidth > clientWidth,
 *       ou scrollHeight > clientHeight no clamp): nenhum texto com "…" em tela nenhuma; e o CORTE CALADO — texto proprio numa linha so'
 *       (`nowrap`) cortado por `overflow: hidden` sem reticencias;
 *   (2) CABECALHO PRESO COM VAO — num container que rola, rolado ate' o meio: o cabecalho preso (`position: sticky`) nao encosta no topo
 *       do container (por onde as linhas aparecem ACIMA dele), tem fundo transparente (a linha aparece POR BAIXO dele), ou mora num
 *       container que nao rola dentro de um que rola (sobe com a pagina e nao fica preso);
 *   (2b) DATA OU NUMERO QUEBRADO — celula cujo texto e' so' data, hora ou numero e ocupa mais de uma linha;
 *   (3) DATA INCOMPLETA — celula de coluna de data (cabecalho Data, Venc., Vencimento, Pgto., Pagamento, Emissão) que nao e' dd/mm/aaaa;
 *   (4) ALTURA QUE MUDA (FIN-FILTRO-DOC-01) — o cenario com `alturaFixa` mede o elemento antes e depois do gesto: nada empurra a tela.
 *   (5) CAMPO DE VALOR (UI-CAMPO-MOEDA-01) — todo campo de valor visivel tem de mostrar 999.999.999,99 inteiro ao lado do "R$" (regra `valor`).
 * Baseline = a lista de EXCECOES abaixo (vazia). Antes de varrer, o detector se prova num fixture com os defeitos: se nao os achar,
 * sai com codigo 2 ("zero achados" so' vale quando a busca provou que sabe achar). `--fotos DIR` grava um print por tela e tamanho.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXCECOES = [];   // { tela, regra, texto } — vazia por decisao do Gabriel (19/10/2026)
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
/* `--tamanhos 926x579,1000x600` mede outros tamanhos (diagnostico); o gate roda nos tres oficiais */
const TAMANHOS = arg('--tamanhos') ? arg('--tamanhos').split(',').map((t) => t.split('x').map(Number)) : [[1000, 600], [1126, 579], [1440, 800]];
const FOTOS = arg('--fotos');
const SO = arg('--so');

const TAMANHOS_DO_CONTRATO = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
const TAMANHOS_DO_CONSORCIO = [[750, 520], [750, 600], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
/* FIN-CONSORCIO-04 — no consórcio rolam por dentro só a lista de parcelas e a tabela das faixas (cabeçalho e Total presos nelas) */
const EXCETO_CONSORCIO = '[data-testid="lista-parcelas-consorcio"], [data-testid="lista-faixas-consorcio"]';
const clicar = (sel) => async (p) => { await p.locator(sel).first().click(); await p.waitForTimeout(500); };
const clicarTexto = (txt) => async (p) => { await p.getByText(txt, { exact: true }).first().click(); await p.waitForTimeout(500); };
const CENARIOS = [
  { nome: 'mesclar-vazio', url: 'tela=mesclar&vazio=1' },
  { nome: 'mesclar-comparar', url: 'tela=mesclar' },
  { nome: 'mesclar-uso', url: 'tela=mesclar', antes: clicarTexto('Uso') },
  { nome: 'mesclar-recentes', url: 'tela=mesclar', antes: clicar('[data-testid="abrir-recentes"]') },
  { nome: 'fornecedores-lista', url: 'tela=fornecedores' },
  { nome: 'fornecedores-pendentes', url: 'tela=fornecedores', antes: clicarTexto('Pendentes') },
  { nome: 'fornecedores-inativos', url: 'tela=fornecedores', antes: clicarTexto('Inativos') },
  { nome: 'fornecedores-todos', url: 'tela=fornecedores', antes: clicarTexto('Todos') },
  /* FORN-BUSCA-UNICA-01 — SO' OS FILTROS do Financeiro V2 (decisao do Gabriel, 19/10): a TABELA tem 60 achados (reticencias em Produto,
     Fornecedor e Centro; datas dd/mm/aa; cabecalho) e e' a frente FIN-V2-SEM-CORTE-01. Tirar a `regiao` mede a tela inteira. */
  { nome: 'financeiro-filtros', url: 'tela=financeiro', regiao: '[data-testid="filtros-da-lista"]' },
  /* FORN-BUSCA-UNICA-01 — o filtro de fornecedor com um nome longo escolhido: o chip mostra o nome inteiro. FIN-FILTRO-DOC-01 —
     `alturaFixa`: a fileira de filtros tem de ter a MESMA altura antes e depois de escolher o nome longo (nada empurra a tela) */
  { nome: 'financeiro-filtro-fornecedor', url: 'tela=financeiro', regiao: '[data-testid="filtros-da-lista"]', alturaFixa: '[data-testid="filtros-da-lista"]', antes: async (p) => {
    await p.locator('label:text-is("Fornecedor") + div [role="combobox"]').first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="favorecido-opcao"]').filter({ hasText: 'Cooperativa' }).first().click(); await p.waitForTimeout(500); } },
  ...['Dados gerais', 'Endereço e contato', 'Pagamento', 'Padrões', 'Uso'].map((aba) => ({ nome: `fornecedor-cadastro-${aba}`, url: 'tela=fornecedor-cadastro', antes: clicarTexto(aba) })),
  /* FIN-CONTRATO-TELA-FONTE-01 — a tela do contrato nos sete tamanhos: o crédito em cada aba, o título de 120 caracteres, a compra parcelada
     com a conta longa nas parcelas e o consórcio */
  ...['Cronograma', 'Liberações', 'Pagamentos', 'Histórico', 'Documentos', 'A resolver'].map((aba) => ({ nome: `contrato-v4-${aba}`, url: 'tela=contrato', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: aba === 'Cronograma' ? undefined : async (p) => { await p.getByRole('button', { name: new RegExp(`^${aba}`) }).first().click(); await p.waitForTimeout(500); } })),
  { nome: 'contrato-titulo-longo', url: 'tela=contrato&v=titulo', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-parcelamento', url: 'tela=contrato&v=parcelamento', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-consorcio', url: 'tela=contrato&v=consorcio', tamanhos: TAMANHOS_DO_CONTRATO },
  ...['Geral', 'Pagamento', 'Documentos'].flatMap((aba) => ['novo', 'editar'].map((m) => ({ nome: `lancamento-${m}-${aba}`, url: `tela=lancamento&m=${m}`, antes: clicarTexto(aba) }))),
  /* UI-TEXTO-LONGO-01 — a descrição de 300 caracteres: a tela é varrida (nenhum "…") e as alturas do modal, do resumo lateral e da lista
     de parcelas têm de ser as da MESMA tela com a descrição curta (`alturasComo`). O parcelado do XML traz a grade de parcelas. */
  ...['Geral', 'Pagamento', 'Documentos'].flatMap((aba) => ['novo', 'editar'].map((m) => ({ nome: `lancamento-${m}-${aba}-longo`, url: `tela=lancamento&m=${m}&desc=longo`,
    alturasComo: `tela=lancamento&m=${m}&desc=curto`, antes: clicarTexto(aba) }))),
  { nome: 'lancamento-xml-Pagamento-longo', url: 'tela=lancamento&m=novo&v=xml&desc=longo', alturasComo: 'tela=lancamento&m=novo&v=xml&desc=curto', antes: clicarTexto('Pagamento') },
  /* FIN-CONSORCIO-02 — o cadastro do consórcio, aba a aba, nos sete tamanhos do mock: nada rola dentro do modal além da lista de
     parcelas (`semRolagem`: a lista é a única exceção) e nada passa da caixa dele */
  ...[['consorcio', ''], ['custos', 'Custos e parcelas'], ['parcelas', /^Parcelas/], ['documentos', /^Documentos/]].map(([n, aba]) => ({
    nome: `consorcio-${n}`, url: 'tela=consorcio', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: aba ? async (p) => { await p.getByRole('button', { name: aba }).first().click(); await p.waitForTimeout(500); } : undefined })),
  /* FIN-CONTRATO-SALVAR-01 — o cadastro de contrato de crédito, Novo e Editar, todas as abas, nos sete tamanhos; e o "Falta:" do Salvar */
  ...['novo', 'editar'].flatMap((m) => ['Contrato', 'Liberações', 'Condições e cronograma', 'Destinação', 'Documentos'].map((aba) => ({
    nome: `cadastro-contrato-${m}-${aba}`, url: `tela=cadastro-contrato&m=${m}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => { await p.getByRole('button', { name: aba, exact: true }).first().click(); await p.waitForTimeout(500); } }))),
  { nome: 'cadastro-contrato-novo-falta', url: 'tela=cadastro-contrato&m=novo', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicar('[data-testid="salvar-cadastro"]') },
  ...[['novo-consorcio', ''], ['novo-custos', 'Custos e parcelas']].map(([n, aba]) => ({
    nome: `consorcio-${n}`, url: 'tela=consorcio&novo=1', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: aba ? async (p) => { await p.getByRole('button', { name: aba }).first().click(); await p.waitForTimeout(500); } : undefined })),
  /* UI-CAMPO-MOEDA-01 — os campos de valor de largura fixa dos modais fora da bancada (a regra `valor` os mede com 999.999.999,99) */
  { nome: 'campos-moeda', url: 'tela=campos-moeda', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* FIN-CONSORCIO-03 — o fundo comum do termo (% por parcela) na aba Custos e prazos, e o "Falta:" do rodapé depois do Salvar no novo
     (o modal tem a mesma caixa: `alturasComo` contra a aba de sempre) */
  { nome: 'consorcio-custos-fc-pct', url: 'tela=consorcio&fc=pct', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    alturasComo: 'tela=consorcio',
    antes: async (p) => { await p.getByRole('button', { name: 'Custos e parcelas' }).first().click(); await p.waitForTimeout(500); } },
  { nome: 'consorcio-novo-falta', url: 'tela=consorcio&novo=1', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: clicar('[data-testid="salvar-consorcio"]') },
  /* FIN-CONSORCIO-04 — "Custos e parcelas" nos dois modos: o 002122 pelas faixas do termo (editável) e pelas regras; 200 parcelas em 6 faixas
     nos dois modos. Só a tabela das faixas rola; `tabelaMinima`: a tabela mostra o cabeçalho, 3 linhas e o Total inteiros */
  ...[['faixas', 'tela=consorcio&modo=faixas'], ['regras', 'tela=consorcio&fc=pct'], ['200-faixas', 'tela=consorcio&n=200'], ['200-regras', 'tela=consorcio&n=200&r=1']].map(([n, url]) => ({
    nome: `consorcio-custos-${n}`, url, tamanhos: [[750, 483], ...TAMANHOS_DO_CONSORCIO],
    semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    tabelaMinima: { sel: '[data-testid="lista-faixas-consorcio"]', linhas: 3 },
    antes: async (p) => { await p.getByRole('button', { name: 'Custos e parcelas' }).first().click(); await p.waitForTimeout(500);
      if (url.includes('&r=1')) { await p.locator('[data-campo="montarPor"] button', { hasText: 'Regras (%)' }).first().click(); await p.waitForTimeout(300);
        const ok = p.locator('[data-testid="confirmar-passar-regras"]'); if (await ok.count()) { await ok.click(); await p.waitForTimeout(500); } } } })),
];
/* UI-TEXTO-LONGO-01 — o que tem de ter a mesma altura com texto curto e longo (o que não existe na tela é pulado nos dois lados) */
const ALTURAS_DO_MODAL = ['[role="dialog"]', '[role="dialog"] aside', '[data-testid="grade-de-parcelas"]'];
/* a altura da caixa E a do conteúdo dela (o resumo tem rolagem própria: crescer por dentro também conta) */
const alturasDe = (p) => p.evaluate((sels) => sels.map((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const rolante = [e, ...e.querySelectorAll('*')].find((x) => /(auto|scroll)/.test(getComputedStyle(x).overflowY));
  return { caixa: Math.round(e.getBoundingClientRect().height * 2) / 2, conteudo: rolante ? rolante.scrollHeight : null };
}), ALTURAS_DO_MODAL);

/* FIN-FILTRO-DOC-01 — a altura de um elemento, antes e depois do gesto do cenario: mudou mais que meio pixel = achado */
const alturaDe = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().height : null; }, sel);
const achadoDaAltura = (sel, antes, depois) => (antes === null || depois === null)
  ? { regra: 'altura', texto: `${sel} nao achado para medir a altura` }
  : Math.abs(depois - antes) > 0.5 ? { regra: 'altura', texto: `${sel} mudou de altura: ${antes}px -> ${depois}px` } : null;

/* FIN-CONSORCIO-02 — roda NA PAGINA: dentro de `dentro`, nenhum elemento com conteúdo maior que a caixa na vertical (rolando ou
   cortado), fora `exceto` e o que mora nele; e o próprio `dentro` cabe na janela */
function medirRolagem({ dentro, exceto }) {
  const achados = [];
  const raiz = document.querySelector(dentro); if (!raiz) return [{ regra: 'rolagem', texto: `${dentro} nao achado` }];
  const livres = exceto ? [...document.querySelectorAll(exceto)] : [];
  const rr = raiz.getBoundingClientRect();
  if (rr.bottom > innerHeight + 0.5 || rr.right > innerWidth + 0.5) achados.push({ regra: 'rolagem', texto: `${dentro} passa da janela (${Math.round(rr.width)}x${Math.round(rr.height)})` });
  for (const e of [raiz, ...raiz.querySelectorAll('*')]) {
    if (livres.some((l) => e === l || l.contains(e))) continue;
    const cs = getComputedStyle(e);
    if (cs.overflowY === 'visible' || cs.display === 'none') continue;
    if (e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 2)
      achados.push({ regra: 'rolagem', texto: `${(e.getAttribute('data-testid') || e.tagName.toLowerCase())} pede ${e.scrollHeight}px, tem ${e.clientHeight} (${cs.overflowY})` });
  }
  /* e na horizontal: caixa que esconde o que passa dela (o segmentado espremido numa célula) — a que ROLA de propósito (`auto`) fica */
  for (const e of raiz.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 2)
      achados.push({ regra: 'corte', texto: `${(e.getAttribute('data-testid') || (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40))} pede ${e.scrollWidth}px, tem ${e.clientWidth}` });
  }
  return achados;
}
/* FIN-CONSORCIO-04 — a tabela que rola por dentro mostra, sem rolar, o cabeçalho, N linhas e o Total inteiros (roda NA PAGINA) */
function medirTabelaMinima({ sel, linhas }) {
  const caixa = document.querySelector(sel); if (!caixa) return [{ regra: 'tabela', texto: `${sel} nao achado` }];
  const cb = caixa.getBoundingClientRect();
  const th = caixa.querySelector('thead')?.getBoundingClientRect(); const tf = caixa.querySelector('tfoot td')?.getBoundingClientRect(); /* a célula (sticky), não o tfoot (fica no fim natural da tabela) */
  if (!th || !tf) return [{ regra: 'tabela', texto: `${sel} sem cabecalho ou sem Total` }];
  const fundo = Math.min(cb.bottom, tf.top);
  const inteiras = [...caixa.querySelectorAll('tbody tr')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= th.bottom - 0.5 && b.bottom <= fundo + 0.5; }).length;
  const totalInteiro = tf.bottom <= cb.bottom + 0.5 && tf.top >= th.bottom - 0.5;
  return inteiras >= linhas && totalInteiro ? [] : [{ regra: 'tabela', texto: `${caixa.getAttribute('data-testid') || sel}: ${inteiras} linhas inteiras (pede ${linhas})${totalInteiro ? '' : ', Total fora'} em ${Math.round(cb.height)}px` }];
}
/* roda NA PAGINA: devolve os achados [{regra, texto}] */
function medir(regiao) {
  const achados = [];
  const raiz = (regiao && document.querySelector(regiao)) || document.body;
  const texto = (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  /* UI-CAMPO-MOEDA-01 — todo campo de valor visível tem de mostrar 999.999.999,99 inteiro ao lado do "R$": o texto é posto no input SEM
     evento (o React não fica sabendo), medido e devolvido como estava */
  for (const c of raiz.querySelectorAll('[data-testid="campo-moeda"]')) {
    const inp = c.querySelector('input'); if (!inp) continue;
    const rc = inp.getBoundingClientRect(); if (rc.width <= 2 || rc.height <= 2 || getComputedStyle(inp).visibility === 'hidden') continue;
    const antes = inp.value; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(inp, '999.999.999,99');
    if (inp.scrollWidth > inp.clientWidth + 0.5) {
      const rot = (c.closest('[data-campo]') || c.parentElement)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) || 'campo';
      achados.push({ regra: 'valor', texto: `campo de valor "${rot}": 999.999.999,99 pede ${inp.scrollWidth}px, tem ${inp.clientWidth}` });
    }
    set.call(inp, antes);
  }
  for (const e of raiz.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !e.textContent.trim()) continue;
    const r = e.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;   /* sr-only (so' para leitor de tela) fica de fora */
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 0.5) achados.push({ regra: 'reticencias', texto: texto(e) });
    else if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 0.5) achados.push({ regra: 'reticencias', texto: texto(e) });
    /* vazamento: celula de tabela cujo conteudo passa da largura dela (invade a vizinha) */
    else if ((e.tagName === 'TD' || e.tagName === 'TH') && cs.overflowX === 'visible' && e.scrollWidth > e.clientWidth + 1) achados.push({ regra: 'corte', texto: `${texto(e)} (vaza: pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
    /* corte calado: texto proprio cortado por overflow escondido numa linha so' (sem "…", mas cortado do mesmo jeito) */
    else if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.whiteSpace.startsWith('nowrap') && e.scrollWidth > e.clientWidth + 1
      && (e.tagName === 'TD' || e.tagName === 'TH' || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) achados.push({ regra: 'corte', texto: `${texto(e)} (pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
  }
  /* data, hora e numero NUNCA quebram a linha: o texto da celula numa linha so' */
  for (const td of raiz.querySelectorAll('td, th')) {
    const t = (td.textContent ?? '').trim();
    if (!/^(\d{2}\/\d{2}\/\d{2,4}|\d{2}:\d{2}|[-−]?(R\$\s?)?[\d.]+(,\d+)?%?)$/.test(t)) continue;
    const topos = new Set();
    const andar = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0) topos.add(Math.round(r.top));
    }
    if (topos.size > 1) achados.push({ regra: 'quebra', texto: `"${t}" em ${topos.size} linhas` });
  }
  const ehData = (t) => /^(data|venc\.?|vencimento|pgto\.?|pagamento|emissão|data de emissão)$/i.test(t.replace(/[▲▼↑↓*]/g, '').trim());
  for (const tb of raiz.querySelectorAll('table')) {
    const ths = [...tb.querySelectorAll('thead tr:last-child th')];
    ths.forEach((th, i) => {
      if (!ehData(th.textContent ?? '')) return;
      for (const tr of tb.querySelectorAll('tbody tr')) {
        const td = tr.children[i]; if (!td || td.colSpan > 1) continue;
        /* FIN-CONSORCIO-02 — a celula que DECLARA nao ter data (`data-sem-data`: a parcela adiada vence "contemplação") nao e' data incompleta */
        if (td.hasAttribute('data-sem-data')) continue;
        const t = (td.textContent ?? '').trim();
        if (t && t !== '—' && t !== '-' && !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) achados.push({ regra: 'data', texto: `${th.textContent.trim()}: ${t}` });
      }
    });
  }
  return achados;
}
/* roda NA PAGINA: rola cada container ate' o meio e confere o cabecalho preso */
function medirCabecalho(regiao) {
  const achados = [];
  const raiz = (regiao && document.querySelector(regiao)) || document.body;
  /* o scrollport de um elemento: o ancestral mais próximo com overflow */
  const scrollport = (x) => { for (let a = x.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') return a; } return null; };
  for (const c of raiz.querySelectorAll('*')) {
    const cs = getComputedStyle(c);
    if (!/(auto|scroll)/.test(cs.overflowY) || c.scrollHeight <= c.clientHeight + 4) continue;
    const presos = [...c.querySelectorAll('*')].filter((x) => getComputedStyle(x).position === 'sticky' && getComputedStyle(x).top !== 'auto' && parseFloat(getComputedStyle(x).top) < 1
      && scrollport(x) === c && getComputedStyle(x.parentElement ?? x).position !== 'sticky');
    /* o cabeçalho que mora num scrollport que NÃO rola, dentro deste que rola: ele sobe com a página e não fica preso */
    for (const x of c.querySelectorAll('*')) {
      const cx = getComputedStyle(x); if (cx.position !== 'sticky') continue;
      const sp = scrollport(x); if (!sp || sp === c || !c.contains(sp) || sp.scrollHeight > sp.clientHeight + 4) continue;
      achados.push({ regra: 'cabecalho', texto: `cabeçalho não fica preso (o container dele não rola; quem rola é o de fora) "${(x.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` });
    }
    if (!presos.length) continue;
    c.scrollTop = Math.round((c.scrollHeight - c.clientHeight) / 2);
    const rc = c.getBoundingClientRect(); const topo = rc.top + c.clientTop;
    for (const h of presos) {
      const rh = h.getBoundingClientRect(); if (rh.height === 0) continue;
      const nome = (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (rh.top - topo > 0.5) achados.push({ regra: 'cabecalho', texto: `vão de ${(rh.top - topo).toFixed(1)}px acima de "${nome}"` });
      /* fundo opaco: o cabeçalho (ou as células dele) tapa a linha que passa por baixo */
      const opaco = (x) => { const m = getComputedStyle(x).backgroundColor.match(/rgba?\(([^)]+)\)/); if (!m) return false; const v = m[1].split(',').map(Number); return v.length < 4 || v[3] >= 0.99; };
      if (![h, ...h.querySelectorAll('th')].some(opaco)) achados.push({ regra: 'cabecalho', texto: `cabeçalho transparente "${nome}"` });
    }
  }
  return achados;
}

const servidor = await createServer({ configFile: path.join(AQUI, 'ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.config.server.port === 0 ? servidor.httpServer.address().port : servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let codigo = 0;
try {
  /* AUTO-TESTE: o fixture tem os tres defeitos; o detector tem de achar os tres */
  const p0 = await navegador.newPage({ viewport: { width: 800, height: 400 } });
  await p0.setContent(`<div data-testid="campo-moeda" style="position:relative"><span>R$</span><input style="width:50px;padding-left:24px"></div>
<div style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Nome muito comprido demais para caber</div>
    <div style="width:80px;overflow:hidden;white-space:nowrap">Outro nome comprido demais para caber</div>
    <table style="width:40px;table-layout:fixed"><tbody><tr><td style="word-break:break-all">19/10/2026</td></tr></tbody></table>
    <div style="height:120px;overflow:auto;padding-top:8px"><table><thead><tr><th style="position:sticky;top:0;background:rgba(255,255,255,.5)">Data</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>10/09/26</td></tr>').join('')}</tbody></table></div>
    <div style="height:120px;overflow:auto"><div style="overflow-x:auto"><table><thead style="position:sticky;top:0;background:#fff"><tr><th>Nome</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>x</td></tr>').join('')}</tbody></table></div></div>`);
  /* e a rolagem (FIN-CONSORCIO-02): um modal com conteudo mais alto que a caixa tem de ser acusado */
  await p0.evaluate(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.style.cssText = 'height:40px;overflow:hidden';
    d.innerHTML = '<div style="height:120px">alto</div>'; document.body.appendChild(d); });
  const daRolagem0 = await p0.evaluate(medirRolagem, { dentro: '[role="dialog"]', exceto: null });
  /* e a altura: um bloco que cresce com o texto novo tem de ser acusado; o que nao muda, nao */
  await p0.evaluate(() => { const d = document.createElement('div'); d.id = 'cresce'; d.style.width = '60px'; d.textContent = 'curto'; document.body.appendChild(d); });
  const h0 = await alturaDe(p0, '#cresce');
  const semMudar = achadoDaAltura('#cresce', h0, await alturaDe(p0, '#cresce'));
  await p0.evaluate(() => { document.getElementById('cresce').textContent = 'um nome longo que quebra em varias linhas'; });
  const comMudanca = achadoDaAltura('#cresce', h0, await alturaDe(p0, '#cresce'));
  await p0.evaluate(() => {
    const d = document.createElement('div'); d.id = 'tabela-curta'; d.style.cssText = 'height:70px;overflow:auto;width:200px';
    d.innerHTML = '<table><thead style="position:sticky;top:0"><tr style="height:20px"><th>a</th></tr></thead><tbody>'
      + '<tr style="height:20px"><td>1</td></tr>'.repeat(5) + '</tbody><tfoot style="position:sticky;bottom:0"><tr style="height:20px"><td>t</td></tr></tfoot></table>';
    document.body.appendChild(d);
  });
  const daTabela0 = await p0.evaluate(medirTabelaMinima, { sel: '#tabela-curta', linhas: 3 });
  const prova = [...daRolagem0, ...daTabela0, ...(await p0.evaluate(medir)), ...(await p0.evaluate(medirCabecalho)), ...(comMudanca && !semMudar ? [comMudanca] : [])].map((a) => a.regra);
  await p0.close();
  if (!['reticencias', 'corte', 'quebra', 'data', 'cabecalho', 'altura', 'rolagem', 'valor', 'tabela'].every((r) => prova.includes(r)) || prova.filter((r) => r === 'cabecalho').length < 3) { console.error(`check-ui-cortes: AUTO-TESTE FALHOU (achou ${prova.join(',') || 'nada'})`); process.exit(2); }

  const todos = [];
  for (const cen of CENARIOS.filter((c) => !SO || c.nome.startsWith(SO))) for (const [w, h] of (cen.tamanhos && !arg('--tamanhos') ? cen.tamanhos : TAMANHOS)) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const erros = []; p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
    await p.goto(`${base}/index.html?${cen.url}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1300);
    const alturaAntes = cen.alturaFixa ? await alturaDe(p, cen.alturaFixa) : null;
    try { if (cen.antes) await cen.antes(p); } catch (e) { erros.push(`gesto: ${String(e).slice(0, 100)}`); }
    const daAltura = cen.alturaFixa ? achadoDaAltura(cen.alturaFixa, alturaAntes, await alturaDe(p, cen.alturaFixa)) : null;
    const dasAlturas = [];
    if (cen.alturasComo) {
      const pc = await navegador.newPage({ viewport: { width: w, height: h } });
      await pc.goto(`${base}/index.html?${cen.alturasComo}`); await pc.evaluate(() => document.fonts.ready); await pc.waitForTimeout(1300);
      try { if (cen.antes) await cen.antes(pc); } catch (e) { erros.push(`gesto (curto): ${String(e).slice(0, 100)}`); }
      const curto = await alturasDe(pc); await pc.close();
      const longo = await alturasDe(p);
      ALTURAS_DO_MODAL.forEach((s, i) => {
        const a = curto[i], b = longo[i];
        if (!a && !b) return;
        if (!a || !b) { dasAlturas.push({ regra: 'altura', texto: `${s} existe so' com o texto ${a ? 'curto' : 'longo'}` }); return; }
        if (a.caixa !== b.caixa || a.conteudo !== b.conteudo)
          dasAlturas.push({ regra: 'altura', texto: `${s} curto x longo: caixa ${a.caixa} x ${b.caixa}, conteudo ${a.conteudo} x ${b.conteudo}` });
      });
    }
    if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await p.screenshot({ path: path.join(FOTOS, `${cen.nome}_${w}x${h}.png`) }); }
    /* FORN-BUSCA-UNICA-01 — `regiao` (opcional): o cenário varre só o que o seletor pega (a tela inteira sem ele) */
    if (cen.regiao && !(await p.$(cen.regiao))) erros.push(`regiao ${cen.regiao} nao achada`);
    const daRolagem = cen.semRolagem ? await p.evaluate(medirRolagem, cen.semRolagem) : [];
    if (cen.tabelaMinima) daRolagem.push(...(await p.evaluate(medirTabelaMinima, cen.tabelaMinima)));
    const achados = [...daRolagem, ...(await p.evaluate(medir, cen.regiao ?? null)), ...(await p.evaluate(medirCabecalho, cen.regiao ?? null)), ...(daAltura ? [daAltura] : []), ...dasAlturas, ...erros.map((e) => ({ regra: 'erro', texto: e }))];
    for (const a of achados) if (!EXCECOES.some((x) => x.tela === cen.nome && x.regra === a.regra && x.texto === a.texto)) todos.push({ tela: cen.nome, tamanho: `${w}x${h}`, ...a });
    await p.close();
  }
  const unicos = [...new Map(todos.map((a) => [`${a.tela}|${a.regra}|${a.texto}`, a])).values()];
  if (unicos.length) {
    codigo = 1;
    console.error(`check-ui-cortes: ${unicos.length} achado(s) (baseline: ${EXCECOES.length} excecoes):`);
    for (const a of unicos) console.error(`  ${a.tela} [${todos.filter((x) => x.tela === a.tela && x.regra === a.regra && x.texto === a.texto).map((x) => x.tamanho).join(' ')}] ${a.regra}: ${a.texto}`);
  } else console.log(`check-ui-cortes: ${CENARIOS.filter((c) => !SO || c.nome.startsWith(SO)).length} telas, ${CENARIOS.filter((c) => !SO || c.nome.startsWith(SO)).reduce((n, c) => n + (c.tamanhos && !arg('--tamanhos') ? c.tamanhos : TAMANHOS).length, 0)} medicoes, sem reticencias, sem vao no cabecalho preso e com data dd/mm/aaaa (baseline: ${EXCECOES.length} excecoes).`);
} finally { await navegador.close(); await servidor.close(); }
process.exit(codigo);
