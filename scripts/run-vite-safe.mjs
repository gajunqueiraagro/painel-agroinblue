#!/usr/bin/env node
/**
 * run-vite-safe — valida o alvo Supabase ANTES de iniciar o Vite.
 *
 * MOTIVACAO
 * ─────────
 * O `.env` versionado-localmente aponta para PRODUCAO e vence os defaults do
 * Vite: `vite`, `vite build`, `vite preview` e `--mode development` resolvem
 * todos para producao. So `--mode proto` escapa. Um comando local comum nao
 * pode falar com producao por acidente.
 *
 * POR QUE UM WRAPPER, E NAO UM pre-script
 * ───────────────────────────────────────
 * `npm run dev` dispara `predev` SEM repassar os argumentos do script. Um
 * `predev` separado nao enxerga o `--mode proto` do `dev` e cairia no default
 * `development` — leria o .env de producao e bloquearia justamente o comando
 * seguro. Aqui o MESMO processo valida e inicia, com o MESMO modo: nao existe
 * divergencia possivel entre o que foi validado e o que foi iniciado.
 *
 * REGRAS
 * ──────
 * - Valida o project ref REAL extraido da URL resolvida, nunca o nome do modo.
 *   Modo e rotulo; ref e fato.
 * - `loadEnv` le os arquivos .env* E o process.env — mesmo mecanismo do Vite.
 * - Alvo indefinido, invalido, desconhecido ou producao => aborta ANTES de
 *   qualquer conexao. Falha de configuracao nunca cai silenciosamente em
 *   producao.
 * - Localmente SO Proto e aceito. Nao existe bypass: sem variavel de escape,
 *   sem flag, sem script npm nomeado para producao. Producao continua acessivel
 *   apenas pelo fluxo legitimo `npm run build` (Vercel), que roda com
 *   command === "build" e nao passa por guard de servidor local.
 * - `preview` reconstroi o bundle antes de servir: servir um `dist/` pre-
 *   existente nao prova qual alvo esta embutido nele.
 *
 * USO
 * ───
 *   node scripts/run-vite-safe.mjs dev proto
 *   node scripts/run-vite-safe.mjs build proto
 *   node scripts/run-vite-safe.mjs preview proto
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadEnv } from 'vite';

const PROTO_REF = 'binbcdfbisgscrifztia';
const PROD_REF = 'duttifnbxqtyyybjmouv';
const COMANDOS = new Set(['dev', 'build', 'preview']);

// O campo "exports" do vite nao expoe ./bin/vite.js, entao resolvemos a partir
// de ./package.json (que E exportado) e lemos o "bin" declarado. Assim nao
// dependemos do layout de node_modules nem de shims .cmd do npm.
const require = createRequire(import.meta.url);
const vitePkgPath = require.resolve('vite/package.json');
const viteBinRel = require(vitePkgPath).bin?.vite ?? 'bin/vite.js';
const VITE_BIN = path.join(path.dirname(vitePkgPath), viteBinRel);

function abortar(msg) {
  console.error(`\n[run-vite-safe] ABORTADO\n${msg}\n`);
  process.exit(1);
}

const [, , cmd, mode] = process.argv;

if (!COMANDOS.has(cmd) || !mode) {
  abortar(
    `uso: node scripts/run-vite-safe.mjs <${[...COMANDOS].join('|')}> <mode>\n` +
      `recebido: cmd=${JSON.stringify(cmd)} mode=${JSON.stringify(mode)}`,
  );
}

// Mesma resolucao do Vite: .env, .env.local, .env.[mode], .env.[mode].local + process.env
const env = loadEnv(mode, process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL;

if (!url) {
  abortar(
    `VITE_SUPABASE_URL indefinido no modo "${mode}".\n` +
      `Configure .env.proto.local com as credenciais do Proto (${PROTO_REF}).`,
  );
}

let ref;
try {
  ref = new URL(url).hostname.split('.')[0];
} catch {
  abortar(`VITE_SUPABASE_URL nao e uma URL valida no modo "${mode}".`);
}

if (ref === PROD_REF) {
  abortar(
    `alvo=${ref} e PRODUCAO, e este e um comando LOCAL (${cmd}/${mode}).\n` +
      `Use: npm run dev (Proto). Nao existe bypass local para producao.\n` +
      `Producao so pelo fluxo legitimo de deploy (npm run build na Vercel).`,
  );
}

if (ref !== PROTO_REF) {
  abortar(
    `alvo desconhecido: ${ref} (modo "${mode}").\n` +
      `Esperado Proto (${PROTO_REF}). Alvo nao reconhecido nao e liberado por omissao.`,
  );
}

console.log(`[run-vite-safe] alvo=${ref} (PROTO) · cmd=${cmd} · mode=${mode} — ok`);

/** Executa o binario do Vite herdando stdio; resolve com o exit code. */
function runVite(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [VITE_BIN, ...args], { stdio: 'inherit' });
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

const modeArgs = ['--mode', mode];

if (cmd === 'dev') {
  process.exit(await runVite([...modeArgs]));
}

if (cmd === 'build') {
  process.exit(await runVite(['build', ...modeArgs]));
}

// preview: reconstroi antes de servir — o bundle servido e, por construcao, o
// que acabou de ser gerado neste modo. Build falho nao serve nada.
const buildCode = await runVite(['build', ...modeArgs]);
if (buildCode !== 0) {
  abortar(`build do modo "${mode}" falhou (exit ${buildCode}); preview nao sera servido.`);
}
process.exit(await runVite(['preview', ...modeArgs]));
