/**
 * FORN-BUSCA-UNICA-01 — a função da tela contra a LISTA ÚNICA de casos (`buscaDeFornecedor.casos.json`). A mesma lista roda contra a
 * RPC `fn_fornecedor_buscar` pelo teste SQL GERADO dela; aqui também se confere que o SQL gravado é o que o gerador produz agora.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import casos from './buscaDeFornecedor.casos.json';
import { buscarFornecedores, digitosDaBusca, digitosDoDocumento, normalizarNome, type SituacaoDaBusca } from './buscaDeFornecedor';

const lista = casos.fornecedores.map((f) => ({
  id: f.chave, nome: f.nome, nome_fantasia: f.nome_fantasia ?? null, cpf_cnpj: f.cpf_cnpj ?? null, ativo: f.ativo,
  fundido_em_id: f.fundido_em ?? null, aliases_norm: f.aliases ?? [], uso: f.uso,
  /* FORN-FILIAL-01 — a cidade da filial (a busca também acha por ela) */
  municipio: 'municipio' in f ? f.municipio : null, uf: 'uf' in f ? f.uf : null,
}));

describe('a lista única de casos, contra a função da tela', () => {
  it.each(casos.normalizacao)('normalização de "$entrada"', ({ entrada, saida }) => {
    expect(normalizarNome(entrada)).toBe(saida);
  });
  it.each(casos.digitosDaBusca)('dígitos da busca "$entrada"', ({ entrada, saida }) => {
    expect(digitosDaBusca(entrada)).toBe(saida);
  });
  it.each(casos.digitosDoDocumento)('dígitos do documento $entrada', ({ entrada, saida }) => {
    expect(digitosDoDocumento(entrada)).toBe(saida);
  });
  it.each(casos.buscas)('$caso', ({ busca, situacao, esperado }) => {
    expect(buscarFornecedores(lista, busca, situacao as SituacaoDaBusca).map((f) => f.id)).toEqual(esperado);
  });
});

describe('o teste SQL é o desta lista', () => {
  it('o .sql gravado é exatamente o que o gerador produz agora (mudou a lista e não regerou = cai)', () => {
    const raiz = resolve(__dirname, '../../..');
    const gerado = execFileSync('node', [resolve(raiz, 'scripts/gerar-teste-busca-fornecedor.mjs'), '--stdout'], { encoding: 'utf8' });
    const gravado = readFileSync(resolve(raiz, 'supabase/tests/forn_busca_unica_01_test.sql'), 'utf8');
    expect(gravado).toBe(gerado);
    for (const b of casos.buscas) expect(gravado).toContain(`'${b.caso.replace(/'/g, "''")}'`);
  });
});
