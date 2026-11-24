/**
 * FORN-CRIAR-DA-NOTA-ERRO (Gabriel 24/11) — TRAVA: toda escrita em `financeiro_fornecedores` (insert/update/upsert) escreve o erro pela
 * `fraseDoErroDoFornecedor` (o campo e o valor; nunca "Erro ao salvar fornecedor" nem o genérico de formato). Escrita nova sem ela
 * derruba este teste. A busca se prova: acha as escritas de hoje (mais de 10) — achar zero seria a busca quebrada, não o código limpo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '../..');
function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__fixtures__' ? [] : arquivos(p);
    return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}
/** cada escrita: o arquivo, a linha e as 40 linhas seguintes (onde o erro é tratado; a importação trata o 23505 antes) */
function escritas() {
  const achadas: { onde: string; trecho: string; perto: string }[] = [];
  for (const f of arquivos(RAIZ)) {
    const linhas = fs.readFileSync(f, 'utf8').split('\n');
    linhas.forEach((l, i) => {
      if (!l.includes("from('financeiro_fornecedores')")) return;
      const trecho = linhas.slice(i, i + 41).join('\n');
      if (/\.(insert|update|upsert)\(/.test(linhas.slice(i, i + 4).join('\n'))) achadas.push({ onde: `${path.relative(RAIZ, f)}:${i + 1}`, trecho, perto: linhas.slice(i, i + 9).join('\n') });
    });
  }
  return achadas;
}

describe('o erro do cadastro do fornecedor tem um dono', () => {
  const todas = escritas();
  it('a busca acha as escritas (auto-teste)', () => expect(todas.length).toBeGreaterThan(10));
  it('toda escrita passa o erro pela fraseDoErroDoFornecedor', () => {
    expect(todas.filter((e) => !e.trecho.includes('fraseDoErroDoFornecedor(')).map((e) => e.onde)).toEqual([]);
  });
  it('nenhuma escreve "Erro ao salvar fornecedor"/"emitente" nem devolve o texto cru do banco', () => {
    expect(todas.filter((e) => /Erro ao salvar (fornecedor|emitente)|return error\.message|new Error\(error\.message\)/.test(e.perto)).map((e) => e.onde)).toEqual([]);
  });
});
