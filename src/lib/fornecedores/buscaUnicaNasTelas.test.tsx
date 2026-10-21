/**
 * FORN-BUSCA-UNICA-01 — todo seletor / filtro de fornecedor da FASE 0 passa pela MESMA regra: o seletor padrão (`FavorecidoSelect`,
 * que filtra por `recortarOpcoes` -> `buscarPreparados`), a função pura (`buscarFornecedores`) ou a RPC espelho
 * (`buscarFornecedoresNoBanco`). Lido da fonte, com auto-teste do detector; e o chip do filtro não corta o nome.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';

const SRC = resolve(__dirname, '../..');
const ler = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

/** SearchableSelect cujas opções saem de uma lista de fornecedor — o que não pode mais existir. */
const SELETOR_PROPRIO = /<SearchableSelect[\s\S]{0,400}?options=\{\s*(?:abateFornecedores|fornecedores|contrapartes|credores|opcoesFornecedor|frigorificos)\b/;
/** Busca de fornecedor no servidor por `ilike`, fora da RPC. */
const ILIKE_PROPRIO = /from\('financeiro_fornecedores'\)[\s\S]{0,300}?\.or\(`?[^)]*ilike/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe('a busca única nas telas (fonte)', () => {
  it('o detector acha o caso conhecido (auto-teste)', () => {
    expect(SELETOR_PROPRIO.test(`<SearchableSelect\n  value={x}\n  options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}`)).toBe(true);
    expect(ILIKE_PROPRIO.test("from('financeiro_fornecedores')\n .select('id, nome')\n .or(`nome.ilike.%${s}%`)")).toBe(true);
  });
  it('nenhum arquivo de src tem seletor de fornecedor próprio nem busca por ilike fora da RPC', () => {
    const achados = arquivos(SRC).filter((p) => { const t = readFileSync(p, 'utf8'); return SELETOR_PROPRIO.test(t) || ILIKE_PROPRIO.test(t); });
    expect(achados.map((p) => p.slice(SRC.length + 1))).toEqual([]);
  });
  it.each([
    ['pages/FinanceiroV2Tab.tsx', /<FavorecidoSelect[\s\S]{0,200}fornecedores=\{fornecedoresDoFiltro\}[\s\S]{0,40}situacao="todos" nomeInteiro/g, 2],
    ['pages/FinanciamentosListaPage.tsx', /<FavorecidoSelect[\s\S]{0,200}fornecedores=\{credores\} situacao="todos" nomeInteiro/g, 1],
    ['pages/LancamentosTab.tsx', /<FavorecidoSelect \/\* FORN-BUSCA-UNICA-01/g, 3],
    ['components/compra/CompraMetaModalShell.tsx', /<CampoDeFornecedor/g, 1],
    ['components/venda/VendaMetaModalShell.tsx', /<CampoDeFornecedor/g, 1],
    ['components/operacao-comercial/central/CentralOperacoesComerciais.tsx', /buscarFornecedores\(contrapartesBusca, busca, 'todos'\)/g, 1],
    /* FORN-LISTA-01 — a lista vem de `fn_fornecedor_lista` (que casa pela busca única no banco); o aviso dos inativos segue na RPC da busca */
    ['pages/FinV2FornecedoresTab.tsx', /buscarFornecedoresNoBanco<[^>]+>\(clienteId, searchDebounced,/g, 1],
    ['pages/FinV2FornecedoresTab.tsx', /busca: searchDebounced/g, 1],
    ['lib/fornecedores/listaDeFornecedores.ts', /rpc\('fn_fornecedor_lista'/g, 1],
    ['v2/components/mesa/MesaPareamentoModal.tsx', /buscarFornecedoresNoBanco<[^>]+>\(clienteId, buscaDebounced, 'ativos', 50\)/g, 1],
    ['lib/fornecedores/mesclarFornecedores.ts', /buscarFornecedores\(/g, 1],
    ['lib/fornecedores/fornecedorTexto.ts', /buscarPreparados<F, OpcaoDeFornecedor<F>>\(opcoes, busca, situacao\)/g, 1],
    ['lib/fornecedores/fornecedorTexto.ts', /return casaComOTermo\(o, busca\);/g, 1],
  ])('%s usa a busca única', (rel, re, n) => {
    expect(ler(rel).match(re) ?? []).toHaveLength(n);
  });
});

describe('o chip do filtro (FavorecidoSelect com nomeInteiro)', () => {
  const LONGO = 'Sintq Fornecedor de Nome Muito Comprido Comércio de Insumos Agropecuários e Representações Ltda';
  it('mostra o nome inteiro, sem "…", numa linha que rola dentro do campo (FIN-FILTRO-DOC-01: nada empurra a tela)', () => {
    render(<FavorecidoSelect value="a" onChange={() => {}} fornecedores={[{ id: 'a', nome: LONGO, cpf_cnpj: null, ativo: true }]}
      situacao="todos" nomeInteiro limpavel rotuloDoVazio="Todos" linhaDoDocumento={false} />);
    const texto = screen.getByTestId('favorecido-gatilho-texto');
    expect(texto.textContent).toBe(LONGO);
    expect(texto.className).not.toMatch(/truncate|line-clamp|text-ellipsis|whitespace-normal|break-words/);
    expect(texto.className).toContain('uma-linha-que-rola');
    /* o gatilho nao cresce: nada de altura automatica */
    expect(screen.getByRole('combobox').className).not.toMatch(/h-auto|whitespace-normal/);
  });
  it('a regra da linha que rola mora no index.css e vale para todo gatilho do cartao de filtros do V2', () => {
    const css = ler('index.css');
    for (const sel of ['.uma-linha-que-rola', '.filtros-uma-linha button[role="combobox"] > span:first-child', '.filtros-uma-linha button > span.truncate.flex-1:first-child'])
      expect(css).toContain(sel);
    expect(css).toMatch(/white-space: nowrap !important;[\s\S]{0,80}overflow-x: auto !important;/);
    expect(ler('pages/FinanceiroV2Tab.tsx')).toMatch(/data-testid="filtros-da-lista" className="filtros-uma-linha /);
  });
  it('sem nomeInteiro, o campo de formulário segue como era (corta, inteiro no title)', () => {
    render(<FavorecidoSelect value="a" onChange={() => {}} fornecedores={[{ id: 'a', nome: LONGO, cpf_cnpj: null, ativo: true }]} linhaDoDocumento={false} />);
    expect(screen.getByTestId('favorecido-gatilho-texto').className).toContain('truncate');
  });
});
