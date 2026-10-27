/**
 * P126 (SEGURANÇA, Gabriel 27/10/2026) — NENHUMA EDGE FUNCTION PÕE PEDAÇO DE CHAVE NO LOG. A `extract-caderno` logava os 10 primeiros e
 * os 4 últimos caracteres da ANTHROPIC_API_KEY. Este teste varre `supabase/functions/**`: num `console.*`, nenhuma variável que guarda uma
 * chave (lida de `Deno.env.get('..._KEY' | '..._SECRET' | '..._TOKEN')`, ou derivada dela por `.trim()`) aparece com `.slice`/`.substring`/
 * `.substr`, inteira, ou num template.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '../../supabase/functions');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|js)$/.test(n) ? [p] : [];
  });
}

/** As variáveis que guardam segredo no arquivo: as lidas do ambiente com nome de chave, e as derivadas delas por `.trim()`. */
function variaveisDeSegredo(fonte: string): string[] {
  const nomes = new Set<string>();
  for (const m of fonte.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*Deno\.env\.get\(\s*['"`]\w*(?:KEY|SECRET|TOKEN)\w*['"`]\s*\)/g)) nomes.add(m[1]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const m of fonte.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\.trim\(\)/g)) {
      if (nomes.has(m[2]) && !nomes.has(m[1])) { nomes.add(m[1]); cresceu = true; }
    }
  }
  return [...nomes];
}

/** Os trechos de `console.*(...)` do arquivo (até o `);` que fecha, cobrindo objetos em várias linhas). */
function chamadasDeLog(fonte: string): string[] {
  const saida: string[] = [];
  const re = /console\.(?:log|info|warn|error|debug)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    let nivel = 0; let i = m.index + m[0].length - 1;
    for (; i < fonte.length; i++) {
      if (fonte[i] === '(') nivel++;
      else if (fonte[i] === ')') { nivel--; if (nivel === 0) break; }
    }
    saida.push(fonte.slice(m.index, i + 1));
  }
  return saida;
}

/** O que um log faz com a variável de segredo: usar o valor (inteiro, fatiado, em template) — `.length`/`.startsWith`/comparação não vazam. */
function vaza(log: string, nome: string): boolean {
  const usos = [...log.matchAll(new RegExp(`\\b${nome}\\b(\\s*\\.\\s*\\w+)?`, 'g'))];
  return usos.some((u) => {
    const metodo = (u[1] ?? '').replace(/[\s.]/g, '');
    if (['length', 'startsWith', 'endsWith', 'includes'].includes(metodo)) return false;
    const depois = log.slice((u.index ?? 0) + u[0].length).trimStart();
    if (!metodo && /^(!==|===|!=|==)/.test(depois)) return false;
    const antes = log.slice(0, u.index ?? 0).trimEnd();
    if (!metodo && /(!==|===|!=|==)$/.test(antes)) return false;
    return true;
  });
}

describe('P126 — edge function não loga pedaço de chave', () => {
  const todos = arquivos(RAIZ);
  it('há edge functions para varrer (a extract-caderno entre elas)', () => {
    expect(todos.some((f) => f.includes('extract-caderno'))).toBe(true);
  });
  it.each(todos.map((f) => [path.relative(RAIZ, f), f]))('%s', (_rel, f) => {
    const fonte = readFileSync(f, 'utf8');
    const segredos = variaveisDeSegredo(fonte);
    const vazamentos = chamadasDeLog(fonte).flatMap((log) => segredos.filter((s) => vaza(log, s)).map((s) => `${s} em ${log.slice(0, 80)}`));
    expect(vazamentos).toEqual([]);
  });
  it('o detector acha o vazamento de antes (prefixo e sufixo da chave)', () => {
    const antes = `const K = Deno.env.get('ANTHROPIC_API_KEY'); const t = K.trim();
      console.log('meta', { len: K.length, prefix: t.slice(0, 10), suffix: t.slice(-4), ok: t.startsWith('sk-ant-'), ws: K !== t });`;
    const segredos = variaveisDeSegredo(antes);
    expect(segredos.sort()).toEqual(['K', 't']);
    expect(chamadasDeLog(antes).some((l) => segredos.some((s) => vaza(l, s)))).toBe(true);
    const depois = `const K = Deno.env.get('ANTHROPIC_API_KEY'); const t = K.trim(); console.log('meta', { ws: K !== t, ok: t.startsWith('sk-ant-') });`;
    expect(chamadasDeLog(depois).some((l) => variaveisDeSegredo(depois).some((s) => vaza(l, s)))).toBe(false);
  });
});
