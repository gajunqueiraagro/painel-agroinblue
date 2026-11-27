/**
 * ENTRADA-CENTRAL-01 F1 — o pacote da Lambda `entrada-email`: o esbuild junta o código (a regra, o MIME e o leitor da caixa do app, pelo
 * alias `@` → `../../src`); o jsdom e o pdfjs vão como pastas em `node_modules` (o pdfjs podado: só o build `legacy` que o leitor usa).
 * Uso (de infra/ses-entrada, com `npm install` feito): node build.mjs  →  entrada-email.zip
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(aqui, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
await build({
  entryPoints: [path.join(aqui, 'src/index.ts')], outfile: path.join(dist, 'index.mjs'),
  bundle: true, platform: 'node', target: 'node22', format: 'esm', logLevel: 'warning',
  external: ['@aws-sdk/*', 'jsdom', 'pdfjs-dist', 'pdfjs-dist/*'],
  alias: { '@': path.resolve(aqui, '../../src') },
  /* o `?url` do worker do pdfjs é coisa do Vite (no navegador); aqui o pdfjs vem injetado e o worker é o do próprio Node */
  plugins: [{ name: 'sem-url', setup(b) {
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'sem-url' }));
    b.onLoad({ filter: /.*/, namespace: 'sem-url' }, () => ({ contents: 'export default ""', loader: 'js' }));
  } }],
  /* ESM no Node: o jsdom (CJS) pede `require` */
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
/* as dependências de execução, copiadas do node_modules desta pasta (as versões do package-lock) */
const nm = path.join(aqui, 'node_modules');
const deps = new Set();
const visitar = (nome) => {
  if (deps.has(nome)) return;
  const pj = path.join(nm, nome, 'package.json');
  if (!fs.existsSync(pj)) return;   // opcional ausente (ex.: canvas)
  deps.add(nome);
  const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
  for (const d of Object.keys(p.dependencies ?? {})) visitar(d);
};
visitar('jsdom');
for (const d of deps) fs.cpSync(path.join(nm, d), path.join(dist, 'node_modules', d), { recursive: true });
const pdf = path.join(dist, 'node_modules/pdfjs-dist');
fs.mkdirSync(path.join(pdf, 'legacy/build'), { recursive: true });
for (const f of ['package.json', 'LICENSE', 'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs']) fs.cpSync(path.join(nm, 'pdfjs-dist', f), path.join(pdf, f));
fs.rmSync(path.join(aqui, 'entrada-email.zip'), { force: true });
execFileSync('zip', ['-q', '-r', '-X', '../entrada-email.zip', '.'], { cwd: dist });
console.log(`entrada-email.zip: ${(fs.statSync(path.join(aqui, 'entrada-email.zip')).size / 1048576).toFixed(1)} MB · ${deps.size} pacotes do jsdom + pdfjs (legacy)`);
