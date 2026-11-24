/**
 * NOTA-LANCAR-SEM-DELAY-01 (Gabriel 23/11: "a nota levava ~3 s para sair de A lançar → risco de lançar 2×") — dados SINTÉTICOS.
 *   L1 a chave sai do nome do XML da Receita (`NFe<chave>.xml`); outro nome = nula
 *   L2 a lançada agora vai a "Já no sistema" com o selo, NA HORA (sem esperar a releitura); as outras não mudam
 *   L3 a tela: no mesmo render em que a chave chega, a linha sai de "A lançar" e mostra "agora"
 *   L4 "lançando…": do clique em Lançar até a volta, o selo aparece e o Lançar fica desligado; a volta limpa
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotasDaReceitaDialog } from './NotasDaReceitaDialog';
import { chaveDoNomeDoXml, marcarLancadasAgora, montarLista, nomeDoXml, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number) => `502611${'12345678000190'}55001${String(n).padStart(9, '0')}1123456780`;
const linha = (n: number, o: Partial<LinhaRecebida> = {}): LinhaRecebida => ({
  id: `id-${n}`, titularId: 't1', chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190', emitenteNome: `Emitente Exemplo ${n}`,
  emissao: `2026-11-${String(10 + n).padStart(2, '0')}`, valorCent: n * 100, notaId: null, recebidoEm: null, eventos: [], temXml: true, ...o,
});
const lista = () => montarLista([linha(1), linha(2), linha(3, { situacao: 'resumo' })], new Map([['t1', 'Produtora Exemplo']]), new Set(), new Map(), new Map(), '2026-11-23');

describe('NOTA-LANCAR-SEM-DELAY-01 — a regra', () => {
  it('L1 a chave pelo nome do XML', () => {
    expect(chaveDoNomeDoXml(nomeDoXml(chave(1)))).toBe(chave(1));
    expect(chaveDoNomeDoXml('nota.xml')).toBeNull();
    expect(chaveDoNomeDoXml(undefined)).toBeNull();
  });
  it('L2 a lançada agora vai a Já no sistema com o selo; as outras não mudam', () => {
    const l = marcarLancadasAgora(lista(), new Set([chave(1)]));
    const por = (n: number) => l.find((x) => x.chave === chave(n));
    expect(por(1)).toMatchObject({ sit: 'no_sistema', lancadaAgora: true, candidatos: [] });
    expect(por(2)?.sit).toBe('nova');
    expect(por(2)?.lancadaAgora).toBeUndefined();
    expect(por(3)?.sit).toBe('pede_ciencia');
    expect(marcarLancadasAgora(lista(), new Set()).map((x) => x.sit)).toEqual(lista().map((x) => x.sit));
  });
});

const dados = (): DadosDaReceita => ({ lista: lista(), titulares: [{ id: 't1', nome: 'Produtora Exemplo' }], ultimaBusca: null, proximaBusca: null });
const linhaDe = (n: number) => screen.getAllByTestId('receita-linha').find((tr) => tr.dataset.chave === chave(n)) as HTMLElement;
const base = { clienteNome: 'Cliente Bancada', carregando: false, erro: null, aoFechar: () => {}, aoVincular: async () => null,
  lerXml: async () => '<nfeProc/>', abrirDanfe: () => null, mostrarNaAba: async () => {} };

describe('NOTA-LANCAR-SEM-DELAY-01 — a tela', () => {
  it('L3 no mesmo render, a linha sai de A lançar e mostra "agora"', () => {
    const d = dados();
    const { rerender } = render(<NotasDaReceitaDialog {...base} dados={d} aoLancar={() => {}} />);
    expect(linhaDe(1).dataset.situacao).toBe('nova');
    rerender(<NotasDaReceitaDialog {...base} dados={d} aoLancar={() => {}} lancadasAgora={new Set([chave(1)])} />);
    expect(linhaDe(1).dataset.situacao).toBe('no_sistema');
    expect(linhaDe(1).querySelector('[data-testid="receita-lancada-agora"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^A lançar\s*1$/ })).toBeTruthy();
  });
  it('L4 "lançando…" do clique até a volta', async () => {
    let aberto = 0;
    const d = dados();
    const { rerender } = render(<NotasDaReceitaDialog {...base} dados={d} aoLancar={() => { aberto += 1; }} retorno={null} />);
    const botao = linhaDe(2).querySelector('[data-testid="receita-lancar"]') as HTMLButtonElement;
    fireEvent.click(botao);
    await waitFor(() => expect(aberto).toBe(1));
    expect(linhaDe(2).querySelector('[data-testid="receita-lancando"]')).not.toBeNull();
    expect((linhaDe(2).querySelector('[data-testid="receita-lancar"]') as HTMLButtonElement).disabled).toBe(true);
    rerender(<NotasDaReceitaDialog {...base} dados={d} aoLancar={() => { aberto += 1; }} retorno={{ n: 1, acao: 'fechou', chave: null }} />);
    await waitFor(() => expect(linhaDe(2).querySelector('[data-testid="receita-lancando"]')).toBeNull());
    expect((linhaDe(2).querySelector('[data-testid="receita-lancar"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
