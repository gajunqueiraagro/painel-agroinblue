/**
 * UI-GATE-RAPIDO-01 (Gabriel 21/10/2026) — quais telas da bancada o diff toca.
 *
 * O gate de tela completo (`check:ui-cortes`, `check:ui-desloca`) leva muito tempo e trava a máquina com dois Codes rodando junto.
 * O modo rápido (`--rapido` nos dois) mede SO' as telas cuja árvore de imports alcança um arquivo do diff contra o origin/proto.
 *
 *   diff (a partir do merge-base com origin/proto, inclusive o que não foi commitado e os arquivos novos)
 *     -> arquivos -> o grafo de imports de `src/` e da bancada (`scripts/ui-cortes/`, com os apelidos do vite.config.mts)
 *     -> as telas (`?tela=` — cada ramo `tela === '…'` do `telas.tsx`, pelas importações que o ramo usa)
 *
 * MUDANÇA COMPARTILHADA = o modo rápido NÃO decide e manda rodar o completo:
 *   - componente da casa e casca: `src/components/ui/*` (régua de tabela inclusive), `src/index.css`, `tailwind.config.*`, a barra
 *     lateral (`src/v2/components/V2Sidebar*`), `src/components/layout/*`;
 *   - a própria bancada e os detectores: `scripts/ui-cortes/mocks/*`, `scripts/ui-cortes/vite.config.mts`, `scripts/check-ui-*.mjs`,
 *     este arquivo, e o trecho comum do `telas.tsx` (antes do primeiro ramo);
 *   - qualquer arquivo que METADE OU MAIS das telas alcança.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8' });

export const COMPARTILHADOS = [
  /^src\/components\/ui\//, /^src\/index\.css$/, /^tailwind\.config\./, /^src\/v2\/components\/V2Sidebar/, /^src\/components\/layout\//,
  /^scripts\/ui-cortes\/mocks\//, /^scripts\/ui-cortes\/vite\.config\.mts$/, /^scripts\/check-ui-[^/]+\.mjs$/, /^scripts\/ui-gate-rapido\.mjs$/,
];
const TELAS_ARQ = path.join(RAIZ, 'scripts/ui-cortes/telas.tsx');

/* os apelidos da bancada (vite.config.mts): `{ find: /^@\/x$/, replacement: m('arq') }` */
function apelidosDaBancada() {
  const cfg = fs.readFileSync(path.join(RAIZ, 'scripts/ui-cortes/vite.config.mts'), 'utf8');
  const out = [];
  for (const m of cfg.matchAll(/find:\s*\/\^(.+?)\$\/,\s*replacement:\s*m\('([^']+)'\)/g)) {
    out.push([m[1].replace(/\\\//g, '/'), path.join(RAIZ, 'scripts/ui-cortes/mocks', m[2])]);
  }
  return new Map(out);
}
const APELIDOS = apelidosDaBancada();
const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
function resolver(de, esp) {
  if (APELIDOS.has(esp)) return APELIDOS.get(esp);
  let base;
  if (esp.startsWith('@/')) base = path.join(RAIZ, 'src', esp.slice(2));
  else if (esp.startsWith('.')) base = path.resolve(path.dirname(de), esp);
  else return null; /* pacote de node_modules: fora do diff */
  for (const e of EXT) { const f = base + e; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
}
const RE_IMPORTS = [/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s+['"]([^'"]+)['"]/gm];
const cacheDeps = new Map();
function depsDe(f) {
  if (cacheDeps.has(f)) return cacheDeps.get(f);
  const ds = new Set();
  if (/\.(tsx?|jsx?|mjs)$/.test(f)) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const re of RE_IMPORTS) for (const m of txt.matchAll(re)) { const r = resolver(f, m[1]); if (r) ds.add(r); }
  }
  cacheDeps.set(f, ds);
  return ds;
}
function fecho(inicios) {
  const vistos = new Set(); const pilha = [...inicios];
  while (pilha.length) { const f = pilha.pop(); if (vistos.has(f)) continue; vistos.add(f); for (const d of depsDe(f)) pilha.push(d); }
  return vistos;
}

/* As telas do `telas.tsx`: cada ramo `tela === 'x'` (do `if` dele até o próximo), as importações que ele usa — direto ou por um
   ajudante do trecho comum (`const X =` / `function X` antes do primeiro ramo), recursivo. */
export function telasDaBancada() {
  const txt = fs.readFileSync(TELAS_ARQ, 'utf8');
  const linhas = txt.split('\n');
  const importados = new Map(); /* nome -> arquivo */
  for (const m of txt.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const arq = resolver(TELAS_ARQ, m[2]); if (!arq) continue;
    const espec = m[1];
    const ns = espec.match(/\*\s+as\s+(\w+)/); if (ns) importados.set(ns[1], arq);
    const pad = espec.match(/^(\w+)/); if (pad && !ns) importados.set(pad[1], arq);
    const chaves = espec.match(/\{([^}]*)\}/);
    if (chaves) for (const p of chaves[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop()?.trim(); if (n) importados.set(n, arq); }
  }
  const ramos = []; /* { tela, de, ate } em linhas (1-based, inclusivo) */
  linhas.forEach((l, i) => { const m = l.match(/^(?:\} else )?if \(tela === '([^']+)'\)/); if (m) ramos.push({ tela: m[1], de: i + 1 }); });
  ramos.forEach((r, i) => { r.ate = i + 1 < ramos.length ? ramos[i + 1].de - 1 : linhas.length; });
  const inicioDosRamos = ramos[0].de;
  /* ajudantes do trecho comum: o texto de cada declaração de topo até a próxima */
  const prelude = linhas.slice(0, inicioDosRamos - 1);
  const ajudantes = new Map();
  let atual = null;
  prelude.forEach((l) => {
    const m = l.match(/^(?:export\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/);
    if (m) { atual = m[1]; ajudantes.set(atual, ''); }
    if (atual) ajudantes.set(atual, ajudantes.get(atual) + l + '\n');
  });
  const usados = (texto, vistos = new Set()) => {
    const arqs = new Set();
    for (const [tok] of texto.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (importados.has(tok)) arqs.add(importados.get(tok));
      if (ajudantes.has(tok) && !vistos.has(tok)) { vistos.add(tok); for (const a of usados(ajudantes.get(tok), vistos)) arqs.add(a); }
    }
    return arqs;
  };
  /* o import de efeito (o CSS) vale para toda tela */
  const efeitos = [...txt.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => resolver(TELAS_ARQ, m[1])).filter(Boolean);
  const telas = new Map();
  for (const r of ramos) {
    const raizes = new Set([...usados(linhas.slice(r.de - 1, r.ate).join('\n')), ...efeitos]);
    const atual = telas.get(r.tela) ?? { de: r.de, ate: r.ate, arquivos: new Set() };
    for (const f of fecho(raizes)) atual.arquivos.add(rel(f));
    telas.set(r.tela, atual);
  }
  return { telas, inicioDosRamos };
}

/* O diff: do merge-base com a base até a árvore de trabalho, mais os arquivos novos ainda fora do git. */
export function arquivosDoDiff(base = 'origin/proto') {
  const mb = git('merge-base', base, 'HEAD').trim();
  const mudados = git('diff', '--name-only', mb).split('\n').filter(Boolean);
  const novos = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  return { mb, arquivos: [...new Set([...mudados, ...novos])] };
}
function linhasMudadasDoTelas(mb) {
  const out = git('diff', '-U0', mb, '--', 'scripts/ui-cortes/telas.tsx');
  const ls = [];
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const de = Number(m[1]); const n = m[2] === undefined ? 1 : Number(m[2]);
    if (n === 0) ls.push(de); else for (let i = 0; i < n; i++) ls.push(de + i);
  }
  return ls;
}

/** O que o modo rápido mede: `{ compartilhado: [motivos], telas: Set, porArquivo: Map(arquivo -> [telas]) }` */
export function telasDoDiff(base = 'origin/proto') {
  const { mb, arquivos } = arquivosDoDiff(base);
  const { telas, inicioDosRamos } = telasDaBancada();
  const compartilhado = []; const escolhidas = new Set(); const porArquivo = new Map();
  const metade = Math.ceil(telas.size / 2);
  for (const a of arquivos) {
    if (COMPARTILHADOS.some((re) => re.test(a))) { compartilhado.push(`${a} (componente compartilhado ou o proprio gate)`); continue; }
    if (a === 'scripts/ui-cortes/telas.tsx') {
      const ls = linhasMudadasDoTelas(mb);
      if (ls.some((l) => l < inicioDosRamos)) { compartilhado.push(`${a}: o trecho comum da bancada (antes do primeiro ramo)`); continue; }
      const ts = [...telas].filter(([, t]) => ls.some((l) => l >= t.de && l <= t.ate)).map(([n]) => n);
      ts.forEach((t) => escolhidas.add(t)); porArquivo.set(a, ts); continue;
    }
    const ts = [...telas].filter(([, t]) => t.arquivos.has(a)).map(([n]) => n);
    if (ts.length >= metade) { compartilhado.push(`${a} (alcancado por ${ts.length} de ${telas.size} telas)`); continue; }
    ts.forEach((t) => escolhidas.add(t)); porArquivo.set(a, ts);
  }
  return { base, mb, arquivos, compartilhado, telas: escolhidas, porArquivo, totalDeTelas: telas.size };
}

/** A tela de um cenário (o `tela=` da url; sem ele, a de abertura da bancada). */
export const telaDoCenario = (c) => (c.url?.match(/(?:^|&)tela=([^&]+)/)?.[1]) ?? 'mesclar';

/** Para os dois gates: escreve o que vai medir e devolve o filtro dos cenários, ou sai (compartilhado = 3; nada a medir = 0). */
export function filtroRapido(nomeDoGate) {
  const t0 = Date.now();
  const r = telasDoDiff(process.env.UI_GATE_BASE || 'origin/proto');
  console.log(`${nomeDoGate} --rapido: ${r.arquivos.length} arquivo(s) no diff contra ${r.base} (merge-base ${r.mb.slice(0, 8)}), ${Date.now() - t0} ms`);
  for (const [a, ts] of r.porArquivo) if (ts.length) console.log(`  ${a} -> ${ts.join(', ')}`);
  if (r.compartilhado.length) {
    console.log(`${nomeDoGate} --rapido: MUDANCA COMPARTILHADA: rode o completo (npm run ${nomeDoGate.replace('check-', 'check:')}).`);
    for (const m of r.compartilhado) console.log(`  ${m}`);
    process.exit(3);
  }
  if (!r.telas.size) { console.log(`${nomeDoGate} --rapido: nenhuma tela da bancada importa os arquivos do diff — nada a medir.`); process.exit(0); }
  console.log(`${nomeDoGate} --rapido: telas ${[...r.telas].join(', ')} (de ${r.totalDeTelas})`);
  return (c) => r.telas.has(telaDoCenario(c));
}
