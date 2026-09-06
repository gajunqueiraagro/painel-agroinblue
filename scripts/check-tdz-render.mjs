#!/usr/bin/env node
/**
 * check-tdz-render — acha função chamada ANTES de ser declarada, no mesmo escopo.
 *
 * ⚠ POR QUE ESTE GATE EXISTE. Em 06/09/2026 a aba Financeiro da OC caiu inteira com
 * "Cannot access 'xt' before initialization". A causa: `compromissos.some(c => …
 * entradaDoCompromisso(c))` no CORPO do componente, chamando uma `const` declarada 91
 * linhas ABAIXO. `.some()` executa durante o render e a `const` ainda está em TDZ.
 * ⚠ E NENHUM GATE VIA. O TSC não acusa porque a chamada mora dentro de uma arrow, que ele
 * trata como uso diferido — e é, em 99% das vezes. O build passa. O `madge --circular`
 * passa (não havia ciclo nenhum). Só o navegador reclamava, e só depois de clicar na aba.
 *
 * COMO CLASSIFICA
 *   A = declaração e uso na MESMA indentação, ambos aninhados → mesmo escopo de função,
 *       o uso executa quando aquele corpo executa. É o caso que derruba a tela.
 *   B = indentações diferentes (uso dentro de outra função: handler, effect, callback),
 *       ou declaração no escopo de MÓDULO (avaliado antes de qualquer render).
 *
 * ⚠ É HEURÍSTICA DE INDENTAÇÃO, e a escolha é deliberada: uma pilha de chaves erra em
 * `=> ({…})` (arrow que devolve objeto) e não distingue homônimos como o `cb` de um
 * `for-of`. Os dois casos foram medidos na triagem de 20 ocorrências reais do repo — a
 * indentação acertou todas, a pilha errou três. O repo usa 2 espaços sem exceção.
 * ⚠ FALSO NEGATIVO É POSSÍVEL e é o lado certo para errar: este gate acusa o que derruba
 * a tela, não tudo o que é feio.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Apaga comentários e strings preservando o número e o tamanho das linhas. */
function limpar(texto) {
  const linhas = texto.split('\n');
  let emBloco = false;
  return linhas.map((linha) => {
    let s = linha;
    if (emBloco) {
      const fim = s.indexOf('*/');
      if (fim < 0) return '';
      s = ' '.repeat(fim + 2) + s.slice(fim + 2);
      emBloco = false;
    }
    for (;;) {
      const ini = s.indexOf('/*');
      if (ini < 0) break;
      const fim = s.indexOf('*/', ini + 2);
      if (fim < 0) { s = s.slice(0, ini); emBloco = true; break; }
      s = s.slice(0, ini) + ' '.repeat(fim + 2 - ini) + s.slice(fim + 2);
    }
    s = s.replace(/\/\/.*$/, '');
    s = s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
    return s;
  });
}

const indent = (l) => l.length - l.trimStart().length;

/**
 * Declarações `const nome = (…) => …`, inclusive com a assinatura quebrada em várias
 * linhas — foi assim que um `delta` legítimo virou falso positivo na primeira varredura.
 */
function declaracoes(limpas) {
  const mapa = new Map();
  for (let i = 0; i < limpas.length; i++) {
    const m = /^\s*const\s+([A-Za-z_$][\w$]*)\s*(?::|=)/.exec(limpas[i]);
    if (!m) continue;
    let trecho = limpas[i];
    for (let k = 1; k <= 4 && i + k < limpas.length && !trecho.includes('=>'); k++) trecho += ' ' + limpas[i + k];
    if (!/=>/.test(trecho)) continue;
    if (!mapa.has(m[1])) mapa.set(m[1], { linha: i, ind: indent(limpas[i]) });
  }
  return mapa;
}

function analisar(arquivo, texto) {
  const linhas = texto.split('\n');
  const limpas = limpar(texto);
  const achados = [];
  for (const [nome, decl] of declaracoes(limpas)) {
    if (decl.ind === 0) continue;                       // módulo: avaliado antes do render
    const chamada = new RegExp(`(?<![.\\w$])${nome.replace(/\$/g, '\\$')}\\s*\\(`);
    for (let j = 0; j < decl.linha; j++) {
      if (!chamada.test(limpas[j])) continue;
      if (indent(limpas[j]) !== decl.ind) break;        // outro escopo → uso diferido
      achados.push({ arquivo, nome, uso: j + 1, decl: decl.linha + 1, texto: linhas[j].trim().slice(0, 90) });
      break;
    }
  }
  return achados;
}

/** ⚠ O GATE SE PROVA ANTES DE ACUSAR OS OUTROS: sem isto, "0 achados" pode ser cegueira. */
function autoTeste() {
  const fixture = [
    'export function AbaCompromissosOC({ compromissos }) {',
    '  const plano = usePlanoContasOC();',
    '  /* entradaDoCompromisso() aqui é COMENTÁRIO e não pode contar. */',
    '  const temEntradas = compromissos.some(c => c.status !== "cancelado" && entradaDoCompromisso(c));',
    '  const aoClicar = () => entradaDoCompromisso(compromissos[0]);',
    '  const entradaDoCompromisso = (c) => plano.rows.find(r => r.id === c.planoContaId);',
    '  return <div onClick={aoClicar}>{temEntradas ? "sim" : "nao"}</div>;',
    '}',
  ].join('\n');
  const r = analisar('fixture', fixture);
  const ok = r.length === 1 && r[0].nome === 'entradaDoCompromisso' && r[0].uso === 4;
  if (!ok) {
    console.error('check-tdz-render: AUTO-TESTE FALHOU — o detector não achou o caso conhecido.');
    console.error('  esperado: 1 achado (entradaDoCompromisso, uso na linha 4); obtido:', JSON.stringify(r));
    process.exit(2);
  }
}

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { arquivos(p, acc); continue; }
    if (/\.tsx?$/.test(nome) && !/\.test\./.test(nome) && !/\.d\.ts$/.test(nome)) acc.push(p);
  }
  return acc;
}

autoTeste();
const raiz = process.argv[2] ?? 'src';
const achados = arquivos(raiz).flatMap((f) => analisar(relative(process.cwd(), f), readFileSync(f, 'utf8')));

if (achados.length === 0) {
  console.log('check-tdz-render: nenhuma função chamada antes de declarada no mesmo escopo.');
  process.exit(0);
}
console.error(`check-tdz-render: ${achados.length} caso(s) que executam no render — a tela cai ao montar.\n`);
for (const a of achados) {
  console.error(`  ${a.arquivo}:${a.uso}  chama ${a.nome}(), declarada na linha ${a.decl}`);
  console.error(`      ${a.texto}`);
}
console.error('\nConserto: mover a declaração para ACIMA do primeiro uso. Só ordem, sem mudar lógica.');
process.exit(1);
