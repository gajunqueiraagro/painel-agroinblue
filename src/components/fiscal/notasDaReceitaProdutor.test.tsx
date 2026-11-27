/**
 * GATE-ORIGIN-LIMPO-01 — o filtro "Produtor" das Notas da Receita deixou o `<select>` nativo e passou ao seletor da casa COM BUSCA
 * (`SearchableSelect`). A regra não muda: escolher o produtor mostra só as notas dele; "Produtor: todos" (valor vazio) volta a todas.
 * Dados SINTÉTICOS.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NotasDaReceitaDialog } from './NotasDaReceitaDialog';
import { montarLista, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number) => `502611${'12345678000190'}55001${String(n).padStart(9, '0')}1123456780`;
const linha = (n: number, titularId: string): LinhaRecebida => ({
  id: `id-${n}`, titularId, chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190', emitenteNome: `Emitente Exemplo ${n}`,
  emissao: `2026-11-${String(10 + n).padStart(2, '0')}`, valorCent: n * 10000, notaId: null, recebidoEm: null, eventos: [], temXml: false,
});
const dados = (): DadosDaReceita => ({
  lista: montarLista([linha(1, 't1'), linha(2, 't2'), linha(3, 't2')], new Map([['t1', 'Produtora Alfa'], ['t2', 'Produtora Beta']]), new Set()),
  titulares: [{ id: 't1', nome: 'Produtora Alfa' }, { id: 't2', nome: 'Produtora Beta' }], ultimaBusca: null, proximaBusca: null,
});
const linhas = () => screen.getAllByTestId('receita-linha').map((tr) => tr.textContent?.match(/Emitente Exemplo \d/)?.[0]).sort();
const escolher = (rotulo: string) => {
  fireEvent.click(within(screen.getByTestId('receita-produtor')).getAllByRole('button')[0]);
  fireEvent.click(screen.getAllByText(rotulo).at(-1) as HTMLElement);
};

describe('GATE-ORIGIN-LIMPO-01 — o filtro de produtor (seletor da casa)', () => {
  it('sem select nativo; escolher o produtor filtra; "Produtor: todos" volta a todas', () => {
    render(<NotasDaReceitaDialog clienteNome="Cliente Bancada" dados={dados()} carregando={false} erro={null} aoFechar={() => {}}
      aoLancar={() => {}} aoVincular={async () => null} lerXml={async () => '<nfeProc/>'} abrirDanfe={() => null} mostrarNaAba={async () => {}} />);
    expect(screen.getByTestId('notas-da-receita').querySelector('select')).toBeNull();
    expect(screen.getByTestId('receita-produtor').textContent).toContain('Produtor: todos');
    expect(linhas()).toEqual(['Emitente Exemplo 1', 'Emitente Exemplo 2', 'Emitente Exemplo 3']);
    escolher('Produtora Beta');
    expect(linhas()).toEqual(['Emitente Exemplo 2', 'Emitente Exemplo 3']);
    escolher('Produtora Alfa');
    expect(linhas()).toEqual(['Emitente Exemplo 1']);
    escolher('Produtor: todos');
    expect(linhas()).toHaveLength(3);
  });
});
