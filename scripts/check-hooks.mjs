#!/usr/bin/env node
/**
 * check-hooks — impede que um hook CONDICIONAL derrube a tela.
 *
 * ⚠ POR QUE EXISTE, e a data importa. Em 21/09/2026 DUAS telas caíram em branco no mesmo dia com
 * o React #310 ("Rendered more hooks than during the previous render"): a Colheita da mandioca
 * (`CargaMandiocaModal`, um hook abaixo do `if (!form) return null`) e o gráfico do Fluxo da CPR
 * (`CprFluxoPrevisto`, um `useMemo` abaixo de dois returns antecipados). As duas passaram por
 * TSC, `build:proto`, `check:tdz`, `check:ui-nativo`, `madge` e a suíte inteira — **nenhum dos
 * seis vê ordem de hook** — e só quebraram no navegador do Gabriel.
 * ⚠ E O DETECTOR JÁ ESTAVA NO REPO. `react-hooks/rules-of-hooks` é `error` no `eslint.config.js`
 * desde sempre, e apontou a LINHA EXATA dos dois casos quando finalmente foi rodado. O furo não
 * era falta de ferramenta: era ela não estar na lista de gates. Este arquivo é a lista.
 *
 * ⚠ SÓ ESTA REGRA, e isso é decisão medida. `npm run lint` acusa 1.316 erros no repo, dos quais
 * 1.246 são `@typescript-eslint/no-explicit-any` — o idioma documentado do `(supabase as any).rpc`.
 * Ligar o lint inteiro pararia todo PR e o gate seria desligado na primeira semana, que é como um
 * gate morre. Isolada, a regra tem DUAS ocorrências no repo inteiro.
 *
 * ⚠ BASELINE, COMO O TSC E O `check:ui-nativo`. As duas herdadas ficam registradas abaixo; o gate
 * falha por ocorrência NOVA — arquivo fora da lista, ou arquivo da lista com MAIS do que ela
 * registra. Reduzir é sempre aceito: atualize a baseline no mesmo PR com `--baseline`.
 *
 * ⚠ E ELE SE AUTO-TESTA ANTES DE VARRER, como o `check:tdz`: monta um componente com um hook
 * depois de um early return e exige que o ESLint o encontre. "Zero achados" só vale quando a busca
 * provou que sabe achar — se a regra for desligada, renomeada ou o plugin sumir do
 * `eslint.config.js`, este gate sai com código 2 em vez de mentir que está tudo limpo.
 */
import { ESLint } from 'eslint';

const REGRA = 'react-hooks/rules-of-hooks';

/**
 * arquivo → nº de ocorrências herdadas. Só diminui.
 *
 * ⚠ AS DUAS SÃO PRÉ-EXISTENTES e não têm relação com o incidente de 21/09: já estavam aqui.
 * Elas ficam registradas, não perdoadas — quem mexer em `AbaAuditoriaOC` ganha a chance de
 * baixar este número.
 */
const BASELINE = new Map([
  ['src/components/compra/AbaAuditoriaOC.tsx', 2],
]);

const FIXTURE = `
import { useMemo } from 'react';
export function Fixture({ dados }) {
  if (!dados) return null;
  const x = useMemo(() => dados.length, [dados]);
  return x;
}
`;

/** O caminho a partir de `src/` — é assim que a baseline e as mensagens dos outros gates falam. */
const relativo = (p) => {
  const i = p.lastIndexOf('/src/');
  return i === -1 ? p : p.slice(i + 1);
};

async function ocorrencias(eslint, alvos) {
  const res = await eslint.lintFiles(alvos);
  const porArquivo = new Map();
  const detalhe = [];
  for (const f of res) {
    for (const m of f.messages) {
      if (m.ruleId !== REGRA) continue;
      const rel = relativo(f.filePath);
      porArquivo.set(rel, (porArquivo.get(rel) ?? 0) + 1);
      detalhe.push(`${rel}:${m.line}:${m.column}`);
    }
  }
  return { porArquivo, detalhe };
}

const eslint = new ESLint({ cache: false });

/* ── AUTO-TESTE ─────────────────────────────────────────────────────────────────────────── */
const prova = await eslint.lintText(FIXTURE, { filePath: 'src/__check_hooks_fixture__.tsx' });
const achouOFixture = prova.some((f) => f.messages.some((m) => m.ruleId === REGRA));
if (!achouOFixture) {
  console.error(`check-hooks: O DETECTOR NÃO ACHOU O CASO CONHECIDO — não confie neste resultado.`);
  console.error(`  A regra \`${REGRA}\` deixou de acusar um hook depois de um early return.`);
  console.error('  Confira se o plugin `react-hooks` continua em eslint.config.js e se a regra segue ligada.');
  process.exit(2);
}

const alvo = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';
const { porArquivo, detalhe } = await ocorrencias(eslint, [alvo]);

if (process.argv.includes('--baseline')) {
  const obj = {};
  for (const [f, n] of [...porArquivo].sort()) obj[f] = n;
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}

const novos = [];
for (const [f, n] of porArquivo) {
  const base = BASELINE.get(f) ?? 0;
  if (n > base) novos.push(`${f}: ${n} hook(s) condicional(is) (baseline ${base})`);
}

if (novos.length === 0) {
  const total = [...porArquivo.values()].reduce((a, b) => a + b, 0);
  console.log(`check-hooks: nenhum hook condicional novo (baseline: ${total} herdado(s)).`);
  process.exit(0);
}

console.error('check-hooks: HOOK CONDICIONAL — a tela cai em branco com React #310.\n');
for (const n of novos) console.error(`  ${n}`);
console.error('\nLinhas acusadas:');
for (const d of detalhe) console.error(`  ${d}`);
console.error('\nTodo hook vai ANTES de qualquer `return` — inclusive do `if (!x) return null`.');
console.error('Se o hook precisa de algo que só existe depois do return, condicione o ARGUMENTO');
console.error('(`useAlgo(x?.ids ?? [])`), nunca a CHAMADA. E se ele não protege nada caro, tire-o.');
console.error('Reduzir a baseline é sempre bem-vindo — atualize-a no mesmo PR com `--baseline`.');
process.exit(1);
