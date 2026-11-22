/**
 * NAV-VOLTA-ORIGEM-01 — as camadas da tela (a peça única). Dados SINTÉTICOS.
 *   C1 a pilha (pura): abrir sobre, fechar devolve à de baixo, abrir sobre quem não está aberto recomeça
 *   C2 a camada de baixo NÃO desmonta: fica invisível (o estado e a rolagem ficam) e volta igual; recebe o retorno
 *   C3 Notas da Receita: na volta, a linha de onde saiu fica destacada; se ela saiu da aba (lançou), a PRÓXIMA
 */
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { abrirNaPilha, Camada, cobertaNaPilha, fecharDaPilha, useCamadas, type Camadas } from './camadas';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { NotasDaReceitaDialog } from '@/components/fiscal/NotasDaReceitaDialog';
import { montarLista, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';

type Id = 'lista' | 'xml' | 'nota';
const VAZIA: Camadas<Id> = { pilha: [], origem: {} };

describe('C1 — a pilha', () => {
  it('abrir sobre empilha; fechar devolve o retorno à de baixo; o que estava acima de quem fecha sai junto', () => {
    let c = abrirNaPilha(VAZIA, 'lista');
    c = abrirNaPilha(c, 'xml', 'lista');
    c = abrirNaPilha(c, 'nota', 'xml');
    expect(c.pilha).toEqual(['lista', 'xml', 'nota']);
    expect([cobertaNaPilha(c, 'lista'), cobertaNaPilha(c, 'xml'), cobertaNaPilha(c, 'nota')]).toEqual([true, true, false]);
    const f = fecharDaPilha(c, 'xml');
    expect(f.camadas.pilha).toEqual(['lista']);
    expect(f.volta).toBe('lista');
    expect(fecharDaPilha(f.camadas, 'nota').volta).toBeNull();
  });
  it('abrir sobre quem NÃO está aberto recomeça a pilha (sem origem: ninguém recebe a volta)', () => {
    const c = abrirNaPilha(abrirNaPilha(VAZIA, 'lista'), 'xml', 'nota');
    expect(c.pilha).toEqual(['xml']);
    expect(fecharDaPilha(c, 'xml').volta).toBeNull();
  });
});

describe('C4 — a camada de passagem (Gabriel 22/11: Lançar da Receita → salvar volta à LISTA)', () => {
  const tres = () => abrirNaPilha(abrirNaPilha(abrirNaPilha(VAZIA, 'lista'), 'xml', 'lista', { passagem: true }), 'nota', 'xml');
  it('salvou em cima: a passagem fecha junto e o retorno vai à camada anterior a ela', () => {
    const f = fecharDaPilha(tres(), 'nota', 'salvou');
    expect(f.camadas.pilha).toEqual(['lista']);
    expect(f.volta).toBe('lista');
    expect(f.fechadas).toEqual(['xml']);
  });
  it('fechou sem salvar: volta só um degrau (à passagem)', () => {
    const f = fecharDaPilha(tres(), 'nota', 'fechou');
    expect(f.camadas.pilha).toEqual(['lista', 'xml']);
    expect(f.volta).toBe('xml');
    expect(f.fechadas).toEqual([]);
  });
  it('sem passagem, salvou volta à de baixo como sempre', () => {
    const c = abrirNaPilha(abrirNaPilha(abrirNaPilha(VAZIA, 'lista'), 'xml', 'lista'), 'nota', 'xml');
    const f = fecharDaPilha(c, 'nota', 'salvou');
    expect([f.camadas.pilha, f.volta, f.fechadas]).toEqual([['lista', 'xml'], 'xml', []]);
  });
  it('o hook avisa a tela da camada que fechou junto e entrega o retorno à lista', () => {
    const juntas: Id[] = [];
    const { result } = renderHook(() => useCamadas<Id>({ aoFecharJunto: (id) => { juntas.push(id); } }));
    act(() => { result.current.abrir('lista'); result.current.abrir('xml', 'lista', { passagem: true }); result.current.abrir('nota', 'xml'); });
    act(() => { result.current.fechar('nota', 'salvou', 'k1'); });
    expect(juntas).toEqual(['xml']);
    expect(result.current.pilha).toEqual(['lista']);
    expect(result.current.retornoPara('lista')).toMatchObject({ acao: 'salvou', chave: 'k1' });
  });
});

describe('C2 — a de baixo não desmonta', () => {
  function Host() {
    const camadas = useCamadas<Id>();
    const [aba, setAba] = useState('a');
    return (
      <>
        <button type="button" onClick={() => camadas.abrir('lista')}>abrir lista</button>
        {camadas.aberta('lista') && (
          <Camada coberta={camadas.coberta('lista')}>
            <Dialog open><DialogContent data-testid="lista"><DialogTitle>Lista</DialogTitle>
              <button type="button" onClick={() => setAba('b')}>aba b</button><span data-testid="aba">{aba}</span>
              <span data-testid="volta">{camadas.retornoPara('lista')?.acao ?? '—'}</span>
              <button type="button" onClick={() => camadas.abrir('xml', 'lista')}>abrir xml</button>
            </DialogContent></Dialog>
          </Camada>
        )}
        {camadas.aberta('xml') && (
          <Dialog open><DialogContent data-testid="xml"><DialogTitle>XML</DialogTitle>
            <button type="button" onClick={() => camadas.fechar('xml', 'salvou', 'k1')}>salvar xml</button>
          </DialogContent></Dialog>
        )}
      </>
    );
  }
  it('a lista coberta fica no DOM, invisível, com o estado; a volta a mostra igual e entrega o retorno', () => {
    render(<Host />);
    fireEvent.click(screen.getByText('abrir lista'));
    fireEvent.click(screen.getByText('aba b'));
    fireEvent.click(screen.getByText('abrir xml'));
    const lista = screen.getByTestId('lista');
    expect(lista.hasAttribute('data-camada-coberta')).toBe(true);
    expect(lista.className).toContain('invisible');
    fireEvent.click(screen.getByText('salvar xml'));
    expect(screen.queryByTestId('xml')).toBeNull();
    expect(screen.getByTestId('lista').hasAttribute('data-camada-coberta')).toBe(false);
    expect(screen.getByTestId('aba').textContent).toBe('b');
    expect(screen.getByTestId('volta').textContent).toBe('salvou');
  });
  it('o retorno muda `n` a cada volta (o efeito de quem recebe roda de novo)', () => {
    const { result } = renderHook(() => useCamadas<Id>());
    act(() => { result.current.abrir('lista'); result.current.abrir('xml', 'lista'); });
    act(() => { result.current.fechar('xml'); });
    const n1 = result.current.retornoPara('lista')?.n;
    act(() => { result.current.abrir('xml', 'lista'); });
    act(() => { result.current.fechar('xml', 'salvou'); });
    expect(result.current.retornoPara('lista')).toMatchObject({ acao: 'salvou' });
    expect(result.current.retornoPara('lista')?.n).not.toBe(n1);
  });
});

describe('C3 — Notas da Receita: a linha de origem e a próxima', () => {
  const chave = (n: number) => `5026111234567800019055001${String(n).padStart(9, '0')}1123456780`;
  const L = (n: number, dia: number): LinhaRecebida => ({ id: `i${n}`, titularId: 't', chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190',
    emitenteNome: `Emitente ${n}`, emissao: `2026-11-${String(dia).padStart(2, '0')}`, valorCent: 100, notaId: null, recebidoEm: null, eventos: [], temXml: true });
  const dados = (linhas: LinhaRecebida[]) => ({ lista: montarLista(linhas, new Map([['t', 'P']]), new Set(), new Map(), new Map(), '2026-11-16'), titulares: [], ultimaBusca: null, proximaBusca: null });
  it('lançou a 2ª: na volta ela saiu de "A lançar" e o destaque vai para a de baixo; só fechou: o destaque fica nela', async () => {
    const tres = [L(1, 14), L(2, 13), L(3, 12)];
    const props = { clienteNome: 'C', carregando: false, erro: null, aoFechar: () => {}, aoVincular: async () => null, lerXml: async () => '<nfeProc/>',
      aoLancar: () => {} };
    const { rerender } = render(<NotasDaReceitaDialog {...props} dados={dados(tres)} retorno={null} />);
    fireEvent.click(screen.getByText(/^A lançar/));
    fireEvent.click(screen.getAllByTestId('receita-lancar')[1]);
    /* só fechou: a nota segue na aba e fica destacada */
    rerender(<NotasDaReceitaDialog {...props} dados={dados(tres)} retorno={{ acao: 'fechou', chave: null, n: 1 }} />);
    expect(screen.getAllByTestId('receita-linha').findIndex((r) => r.hasAttribute('data-destaque'))).toBe(1);
    /* lançou: a lista relida não tem mais a 2ª — o destaque vai para a de baixo (a 3ª) */
    rerender(<NotasDaReceitaDialog {...props} dados={dados([L(1, 14), L(3, 12)])} retorno={{ acao: 'salvou', chave: null, n: 2 }} />);
    const linhas = screen.getAllByTestId('receita-linha');
    expect(linhas.find((r) => r.hasAttribute('data-destaque'))?.getAttribute('data-chave')).toBe(chave(3));
  });
});
