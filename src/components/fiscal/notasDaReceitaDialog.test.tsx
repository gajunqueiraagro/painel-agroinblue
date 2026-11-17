/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a tela "Notas da Receita" e o selo do "+ Novo" (dados SINTÉTICOS).
 *   T1 lista, abas com contagem, rodapé · T2 "Lançar" entrega o XML ao "Da nota fiscal" (D1) · T3 resumo: sem Lançar, PDF desligado
 *   T4 "Ver" abre os dados, sem XML na tela · T5 XML que falha: aviso, nada entregue · T6 selo do "+ Novo" = boletos + notas (D2)
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NotasDaReceitaDialog } from './NotasDaReceitaDialog';
import { montarLista, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import { somaDoSelo, textoDoSelo } from '@/components/financeiro-v2/NovoMenuLancamentos';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number) => `502611${'12345678000190'}55001${String(n).padStart(9, '0')}1123456780`;
const linha = (n: number, o: Partial<LinhaRecebida> = {}): LinhaRecebida => ({
  id: `id-${n}`, titularId: 't1', chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190', emitenteNome: `Emitente Exemplo ${n}`,
  emissao: `2026-11-${String(10 + n).padStart(2, '0')}`, valorCent: n * 10000, notaId: null, recebidoEm: null, eventos: [], temXml: false, ...o,
});
const dados = (): DadosDaReceita => ({
  lista: montarLista([linha(1), linha(2, { situacao: 'resumo' }), linha(3), linha(4, { situacao: 'cancelado_na_sefaz' })],
    new Map([['t1', 'Produtora Exemplo']]), new Set([chave(3)])),
  titulares: [{ id: 't1', nome: 'Produtora Exemplo' }], ultimaBusca: '2026-11-16T22:46:00Z', proximaBusca: null,
});
const abrir = (o: { aoLancar?: (f: File) => void; lerXml?: (id: string) => Promise<string> } = {}) =>
  render(<NotasDaReceitaDialog clienteNome="Cliente Bancada" dados={dados()} carregando={false} erro={null} aoFechar={() => {}}
    aoLancar={o.aoLancar ?? (() => {})} lerXml={o.lerXml ?? (async () => '<nfeProc/>')} />);
const linhaDe = (n: number) => screen.getAllByTestId('receita-linha').find((tr) => tr.textContent?.includes(`Emitente Exemplo ${n}`)) as HTMLElement;

describe('NOTAS-RECEITA F3.4 — a tela', () => {
  it('T1 lista as 4, situações certas, rodapé sem a cancelada', () => {
    abrir();
    expect(screen.getAllByTestId('receita-linha')).toHaveLength(4);
    expect(linhaDe(1).dataset.situacao).toBe('nova');
    expect(linhaDe(2).dataset.situacao).toBe('pede_ciencia');
    expect(linhaDe(3).dataset.situacao).toBe('no_sistema');
    expect(linhaDe(4).dataset.situacao).toBe('cancelada');
    const rodape = screen.getByTestId('receita-rodape').textContent ?? '';
    expect(rodape).toContain('4 notas');
    expect(rodape).toContain('Total R$ 600,00');
    expect(rodape).toContain('1 pedem ciência · 1 a lançar');
  });
  it('T2 "Lançar" lê o XML e entrega UM arquivo ao "Da nota fiscal"', async () => {
    const aoLancar = vi.fn();
    const lerXml = vi.fn(async () => '<nfeProc>sintetico</nfeProc>');
    abrir({ aoLancar, lerXml });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    await waitFor(() => expect(aoLancar).toHaveBeenCalledTimes(1));
    expect(lerXml).toHaveBeenCalledWith('id-1');
    const f = aoLancar.mock.calls[0][0] as File;
    expect(f.name).toBe(`NFe${chave(1)}.xml`);
    const texto = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsText(f); });
    expect(texto).toBe('<nfeProc>sintetico</nfeProc>');
  });
  it('T3 resumo: Lançar escondido e PDF desligado; cancelada e já no sistema sem Lançar', () => {
    abrir();
    expect(within(linhaDe(2)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(2)).getByTestId('receita-lancar').className).toContain('invisible');
    expect(within(linhaDe(2)).getByTestId('receita-pdf')).toBeDisabled();
    expect(within(linhaDe(4)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(3)).getByTestId('receita-lancar')).toBeDisabled();
    expect(within(linhaDe(1)).getByTestId('receita-pdf')).not.toBeDisabled();
  });
  it('T4 "Ver" abre os dados (chave, valor, situação), sem XML', () => {
    abrir();
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-ver'));
    const d = screen.getByTestId('receita-dados');
    expect(d.textContent).toContain('R$ 100,00');
    expect(d.textContent).toContain('Nova');
    expect(d.textContent).not.toContain('<nfeProc');
  });
  it('T5 o XML que não se lê: aviso no rodapé, nada entregue', async () => {
    const aoLancar = vi.fn();
    abrir({ aoLancar, lerXml: async () => { throw new Error('Esta nota ainda não tem o XML completo.'); } });
    fireEvent.click(within(linhaDe(1)).getByTestId('receita-lancar'));
    await waitFor(() => expect(screen.getByTestId('receita-aviso').textContent).toBe('Esta nota ainda não tem o XML completo.'));
    expect(aoLancar).not.toHaveBeenCalled();
  });
  it('T5b aba "A lançar" mostra só a nova; busca por emitente filtra', () => {
    abrir();
    fireEvent.click(screen.getByText('A lançar'));
    expect(screen.getAllByTestId('receita-linha')).toHaveLength(1);
    fireEvent.click(screen.getByText('Todas'));
    fireEvent.change(screen.getByTestId('receita-busca'), { target: { value: 'exemplo 2' } });
    expect(screen.getAllByTestId('receita-linha').map((tr) => tr.dataset.situacao)).toEqual(['pede_ciencia']);
  });
  it('T6 o selo do "+ Novo" soma boletos e notas (D2); nada lido = vazio', () => {
    expect(textoDoSelo(somaDoSelo(3, 2))).toBe('5');
    expect(textoDoSelo(somaDoSelo(null, 2))).toBe('2');
    expect(textoDoSelo(somaDoSelo(null, null))).toBe('');
    expect(textoDoSelo(somaDoSelo(90, 20))).toBe('99+');
  });
});
