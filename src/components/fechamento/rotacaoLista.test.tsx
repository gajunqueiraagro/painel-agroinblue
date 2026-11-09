/**
 * ROTACAO-LISTA-01 (Gabriel 08/11) — caso real: Vera · BG · out/26. O P_01 (cria, 204 cab) usou o P_01 e o P_02; o P_02 fechou o mês VEDADO
 * (card em rascunho, uso do mês vedado) e não aparecia em "Também esteve em". Agora a lista mostra TODOS os pastos vigentes do mês, menos o
 * próprio, com o texto curto do que acontece ao salvar; o banco faz a troca (117495). Depois do salvar, 1 linha diz o que mudou.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OndeOLoteEsteve, notaDoDestino, type ContextoDoLote } from './OndeOLoteEsteve';
import { fraseDosDestinosMudados } from '@/lib/fechamento/loteNoGrupo';

const P01 = { id: 'p01', nome: 'P_01', grupo_id: null, area: 30 };
const P02 = { id: 'p02', nome: 'P_02', grupo_id: null, area: 25 };
const P03 = { id: 'p03', nome: 'P_03', grupo_id: null, area: 20 };
const P04 = { id: 'p04', nome: 'P_04', grupo_id: null, area: 18 };
/* o P_02 vedado no mês, o P_03 fechado, o P_04 livre */
const CTX: ContextoDoLote = { proprio: P01, nomeDoGrupo: null, membros: [], outrosPastos: [P02, P03, P04],
  impedidos: new Map([['p02', 'vedado'], ['p03', 'fechado']]), gravada: null };

function abrir(escolhidos: string[] = ['p01']) {
  const onChange = vi.fn();
  render(<OndeOLoteEsteve pasto={P01} contexto={CTX} escolhidos={escolhidos} onChange={onChange} uaDoCard={180} atividadeDoMes="Cria" />);
  fireEvent.click(screen.getByTestId('lote-onde'));
  return onChange;
}
const botoesDaLista = () => within(screen.getByTestId('searchable-select-painel')).getAllByRole('button');
const opcoesDaLista = () => {
  fireEvent.click(within(screen.getByTestId('lote-quadro')).getByRole('button', { name: /Adicionar pasto/ }));
  return botoesDaLista().map(o => o.textContent ?? '');
};

describe('"Também esteve em" — BG out/26, P_01 → P_02', () => {
  it('lista TODOS os pastos do mês (o vedado e o fechado inclusive), cada um com o que acontece ao salvar', () => {
    abrir();
    const ops = opcoesDaLista();
    expect(ops.some(t => t.includes('P_02') && t.includes('vedado · passa a Cria ao salvar'))).toBe(true);
    expect(ops.some(t => t.includes('P_03') && t.includes('fechado · reabre ao salvar'))).toBe(true);
    expect(ops.some(t => t.includes('P_04') && !t.includes('ao salvar'))).toBe(true);
    expect(ops.some(t => t.includes('P_01'))).toBe(false);
  });

  it('escolher o P_02 põe ele na rotação; a ficha diz que ele passa a Cria ao salvar', () => {
    const onChange = abrir();
    opcoesDaLista();
    fireEvent.click(botoesDaLista().find(o => (o.textContent ?? '').includes('P_02'))!);
    expect(onChange).toHaveBeenLastCalledWith(['p01', 'p02']);
  });

  it('com o P_02 escolhido, a ficha da rotação mostra o nome e a nota', () => {
    abrir(['p01', 'p02']);
    expect(within(screen.getByTestId('lote-extras')).getByTestId('lote-extra').textContent).toBe('P_02 · vedado · passa a Cria ao salvar');
  });

  it('a nota: vedado passa à atividade, fechado reabre, livre não diz nada', () => {
    expect(notaDoDestino('vedado', 'Recria')).toBe('vedado · passa a Recria ao salvar');
    expect(notaDoDestino('fechado', 'Cria')).toBe('fechado · reabre ao salvar');
    expect(notaDoDestino(undefined, 'Cria')).toBeNull();
  });
});

describe('o aviso de 1 linha depois do salvar (o que o banco devolve em destinos_mudados)', () => {
  it('vedado que passou à atividade e fechado que reabriu; nada mudou = nenhum aviso', () => {
    expect(fraseDosDestinosMudados([{ pasto: 'P_02', de: 'vedado', para: 'cria' }, { pasto: 'P_03', reaberto: true }])).toBe('P_02 passa a Cria; P_03 reabriu.');
    expect(fraseDosDestinosMudados([])).toBeNull();
    expect(fraseDosDestinosMudados(undefined)).toBeNull();
  });
});
