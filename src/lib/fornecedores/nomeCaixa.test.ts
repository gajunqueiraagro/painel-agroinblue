/**
 * FORN-NOME-CAIXA-01 — a regra de maiúscula/minúscula do nome do fornecedor mora SÓ no banco (`_fn_nome_caixa`, chamada pelo gatilho
 * de gravação de `financeiro_fornecedores`). A lista de casos é uma: `nomeCaixa.casos.json`. O teste SQL
 * (`supabase/tests/forn_nome_caixa_01_test.sql`) roda a função do banco contra ela (N1) e prova que o cadastro novo gravado pela tela
 * (papel authenticated) em caixa alta sai padronizado (N2). Aqui: a lista e o teste SQL batem, os casos do pedido estão nela, e
 * nenhuma tela converte o nome por conta própria.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import casos from './nomeCaixa.casos.json';

const raiz = resolve(__dirname, '../../..');
const sql = readFileSync(resolve(raiz, 'supabase/tests/forn_nome_caixa_01_test.sql'), 'utf8');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe('FORN-NOME-CAIXA-01 — a lista única de casos', () => {
  it('todo caso da lista está no teste SQL, e o teste SQL não tem caso fora dela', () => {
    for (const [entrada, esperado] of casos as [string, string][]) expect(sql, entrada).toContain(`(${q(entrada)}, ${q(esperado)})`);
    const bloco = sql.slice(sql.indexOf('from (values'), sql.indexOf(') c(e, s)'));
    expect((bloco.match(/\('/g) ?? []).length).toBe((casos as unknown[]).length);
  });
  it('os casos do pedido estão na lista', () => {
    const mapa = new Map(casos as [string, string][]);
    expect(mapa.get('COMERCIAL JERE DE ALIMENTOS LTDA')).toBe('Comercial Jere de Alimentos Ltda');
    expect(mapa.get('AGROinBLUE')).toBe('AGROinBLUE');
    expect(mapa.get('Pec.3M-COMERCIAL JERE')).toBe('Pec.3M-Comercial Jere');
    expect(mapa.get('MMM COMERCIO DE GAS - EIRELI')).toBe('MMM Comercio de Gas - Eireli');
    expect(mapa.get('AUTO POSTO SP 400 LTDA')).toBe('Auto Posto SP 400 Ltda');
    expect(mapa.get('jose da silva')).toBe('Jose da Silva');
  });
  it('nenhuma tela converte o nome do fornecedor: a regra é do banco', () => {
    const arquivos: string[] = [];
    const andar = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) arquivos.push(p); } };
    andar(resolve(raiz, 'src'));
    const detector = /\b(nomeCaixa|nomeEmCaixa|padronizarCaixa)\w*\s*\(/i;
    expect(detector.test('const x = padronizarCaixaDoNome(nome);')).toBe(true);   /* o detector acha */
    const achados = arquivos.filter((p) => detector.test(readFileSync(p, 'utf8')));
    expect(achados).toEqual([]);
  });
});
