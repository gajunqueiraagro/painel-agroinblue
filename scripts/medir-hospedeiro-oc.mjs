#!/usr/bin/env node
/**
 * OC-HOSPEDEIRO-LEVE-01 — `node scripts/medir-hospedeiro-oc.mjs`: a tela propria da OC (o hospedeiro REAL, `V2LancamentosWrapper
 * somenteOperacao`) na bancada (`scripts/ui-cortes/hospedeiro.html`, banco simulado; nada sai da maquina) abrindo uma OC existente pela URL.
 * Por tamanho (1000x600 e 1440x800) e repeticao (3), mede:
 *   - montar -> OC pronta (o modal da Compra na tela), em ms;
 *   - os pedidos ao banco ATE' a OC ficar pronta e os que seguem nos 3 s depois (o "segundo plano");
 *   - o tempo de tarefas longas (> 50 ms) da thread principal no mesmo intervalo;
 *   - o JS baixado (KB, como o servidor de desenvolvimento entrega: so' serve para comparar antes x depois).
 * `--json ARQ` grava as medidas cruas.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const TAMANHOS = [[1000, 600], [1440, 800]];
const REPETICOES = Number(arg("--rep") ?? 3);
/* `--tipo venda|abate` mede a OC desse tipo (padrao: compra) */
const URL_DA_TELA = `v=${arg('--tipo') ?? 'compra'}`;

const servidor = await createServer({ configFile: path.join(AQUI, 'ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();

const medir = async ([w, h]) => {
  const p = await navegador.newPage({ viewport: { width: w, height: h } });
  let bytesJs = 0;
  p.on('response', async (r) => {
    const tipo = r.headers()['content-type'] ?? '';
    if (!/javascript/.test(tipo)) return;
    try { bytesJs += (await r.body()).length; } catch { /* resposta sem corpo */ }
  });
  await p.addInitScript(() => {
    const g = globalThis;
    g.__longas = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) g.__longas.push({ ms: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* sem longtask */ }
    new MutationObserver(() => {
      if (g.__prontoMs == null && document.querySelector('[role="dialog"]')) g.__prontoMs = performance.now();
    }).observe(document, { childList: true, subtree: true });
  });
  await p.goto(`${base}/hospedeiro.html?${URL_DA_TELA}`);
  await p.waitForFunction(() => globalThis.__prontoMs != null || globalThis.__ocFechou, null, { timeout: 60_000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const g = globalThis;
    const pronto = g.__prontoMs;
    const pedidos = (g.__pedidosBancada ?? []).map((x) => ({ ...x, depois: x.ms > pronto }));
    const longas = g.__longas.filter((l) => l.ms >= g.__inicioBancada);
    return { fechou: !!g.__ocFechou, prontoMs: pronto - g.__inicioBancada, pedidos,
      longasAtePronto: longas.filter((l) => l.ms <= pronto).reduce((s, l) => s + l.dur, 0),
      longasDepois: longas.filter((l) => l.ms > pronto).reduce((s, l) => s + l.dur, 0) };
  });
  await p.close();
  return { ...r, kbJs: bytesJs / 1024 };
};

/* aquecimento: o servidor de desenvolvimento transforma os modulos no primeiro pedido; essa carga nao entra na medida */
await medir(TAMANHOS[0]);

const medidas = [];
for (const t of TAMANHOS) for (let i = 0; i < REPETICOES; i++) medidas.push({ tamanho: t.join('x'), rep: i + 1, ...(await medir(t)) });
await navegador.close();
await servidor.close();

const conta = (lista) => { const m = new Map(); for (const x of lista) { const k = `${x.tipo}:${x.nome}`; m.set(k, (m.get(k) ?? 0) + 1); } return m; };
for (const m of medidas) {
  if (m.fechou) { console.log(`${m.tamanho} #${m.rep}: a OC FECHOU (a hidratacao recusou) — medida invalida`); continue; }
  const antes = m.pedidos.filter((x) => !x.depois), depois = m.pedidos.filter((x) => x.depois);
  console.log(`${m.tamanho} #${m.rep}: pronta em ${m.prontoMs.toFixed(0)} ms · ${antes.length} pedidos ate' pronta + ${depois.length} depois · `
    + `tarefas longas ${m.longasAtePronto.toFixed(0)} ms ate' pronta + ${m.longasDepois.toFixed(0)} ms depois · JS ${m.kbJs.toFixed(0)} KB`);
}
const ultima = medidas.at(-1);
if (ultima && !ultima.fechou) {
  console.log('\npedidos ate\' a OC pronta (ultima repeticao):');
  for (const [k, n] of conta(ultima.pedidos.filter((x) => !x.depois))) console.log(`  ${n}x ${k}`);
  console.log('pedidos nos 3 s depois:');
  for (const [k, n] of conta(ultima.pedidos.filter((x) => x.depois))) console.log(`  ${n}x ${k}`);
}
if (ultima && process.argv.includes('--quem')) {
  console.log('\nquem pede (ultima repeticao; pilha do app, do mais proximo ao mais distante):');
  const porOrigem = new Map();
  for (const x of ultima.pedidos) { const k = `${x.tipo}:${x.nome}  <=  ${x.quem.slice(0, 4).join(' < ')}`; porOrigem.set(k, (porOrigem.get(k) ?? 0) + 1); }
  for (const [k, n] of porOrigem) console.log(`  ${n}x ${k}`);
}
const json = arg('--json');
if (json) fs.writeFileSync(json, JSON.stringify(medidas, null, 1));
