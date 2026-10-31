import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ESTADO_INICIAL_DO_GLOBAL, GeoPastosGlobal, type EstadoDoGlobal, type PropsDoGlobal } from './GeoPastosGlobal';
import type { LinhaDaFazenda, LinhaDoPasto } from '@/lib/mapa/resumoGlobal';

// o jsdom não tem canvas: a medida das colunas cai na estimativa por número de letras
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

const zero = { carga_alta: 0, sublotado: 0, ideal: 0, vazio: 0, sem_fechamento: 0 };
const linha = (id: string, codigo: string, nome: string, kgHa: number): LinhaDaFazenda => ({
  fazenda: { id, codigo, nome }, temMapa: true, pastos: 2, area: 100, cabecas: 100, pesoMedio: 300, kgHa, uaHa: kgHa / 450,
  semFechamento: 0, contagem: { ...zero, ideal: 2 }, areaPorSituacao: { ...zero, ideal: 100 }, serie: [], cabecasPorAtividade: new Map(), cabecasSemMapa: 0,
});
const AA = linha('fa', 'AA', 'Faz. Alfa', 420);
const BB = linha('fb', 'BB', 'Faz. Beta', 310);
const pasto = (id: string, f: LinhaDaFazenda, nome: string, kgHa: number | null, situacao: LinhaDoPasto['situacao']): LinhaDoPasto => ({
  pastoId: id, fazenda: f.fazenda, nome, atividade: 'recria', area: 50, cabecas: kgHa == null ? null : 50, pesoMedio: 300, kgHa, situacao,
});
const PASTOS = [pasto('a1', AA, 'P_01', 650, 'carga_alta'), pasto('b1', BB, 'P_01', 310, 'ideal'), pasto('b2', BB, 'P_02', null, 'sem_fechamento')];

const props = (estado: EstadoDoGlobal, onEstado: (e: EstadoDoGlobal) => void, onAbrir = vi.fn()): PropsDoGlobal => ({
  fazendas: [AA, BB], total: { ...AA, fazenda: { id: '', codigo: '', nome: '' } }, pastos: PASTOS, geometriasPorFazenda: new Map(),
  situacaoDoPasto: () => 'ideal', resumoDoFiltro: () => ({ cabecas: 1, pesoTotalKg: 1, pesoMedio: 1, lotacao: 1, area: 1 }),
  carregando: false, erro: null, seletorDeMes: null, estado, onEstado, onAbrirFazenda: onAbrir,
});

const codigosDaTabela = () => within(screen.getByTestId('global-tabela-fazendas')).getAllByTestId('global-linha-fazenda').map(tr => tr.querySelector('td')?.textContent);

describe('GeoPastosGlobal (D6): a volta acha o Global exatamente como estava', () => {
  it('ordenação, visão e aba do gráfico saem no estado; uma tela nova com esse estado abre igual', () => {
    let guardado: EstadoDoGlobal = ESTADO_INICIAL_DO_GLOBAL;
    const { unmount } = render(<GeoPastosGlobal {...props(guardado, e => { guardado = e; })} />);
    expect(codigosDaTabela()).toEqual(['AA', 'BB']);
    fireEvent.click(within(screen.getByTestId('global-tabela-fazendas')).getByTitle('Ordenar por kg/ha')); // crescente: BB (310) antes de AA (420)
    expect(codigosDaTabela()).toEqual(['BB', 'AA']);
    fireEvent.click(screen.getByRole('button', { name: 'Atividade' }));
    expect(guardado.ordemFazendas).toEqual({ coluna: 'kgHa', direcao: 'asc' });
    expect(guardado.aba).toBe('atividade');
    unmount();                                                     // foi para a fazenda…

    render(<GeoPastosGlobal {...props(guardado, e => { guardado = e; })} />); // …e voltou
    expect(codigosDaTabela()).toEqual(['BB', 'AA']);
    expect(screen.getByTestId('grafico-atividade')).toBeTruthy();
  });

  it('a rolagem guardada não se perde quando depois muda a ordenação', () => {
    let guardado: EstadoDoGlobal = ESTADO_INICIAL_DO_GLOBAL;
    render(<GeoPastosGlobal {...props(guardado, e => { guardado = e; })} />);
    const corpo = screen.getByTestId('global-tabela-atencao');
    corpo.scrollTop = 120;
    fireEvent.scroll(corpo);
    expect(guardado.rolagem.atencao).toBe(120);
    fireEvent.click(within(screen.getByTestId('global-tabela-fazendas')).getByTitle('Ordenar por Cab.'));
    expect(guardado.rolagem.atencao).toBe(120);
  });

  it('a visão Pastos com o filtro também volta como estava', () => {
    let guardado: EstadoDoGlobal = ESTADO_INICIAL_DO_GLOBAL;
    const { unmount } = render(<GeoPastosGlobal {...props(guardado, e => { guardado = e; })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pastos' }));
    fireEvent.click(within(screen.getByTestId('global-chips')).getByRole('button', { name: /Carga alta/ }));
    expect(guardado.visao).toBe('pastos');
    expect(guardado.filtro).toBe('carga_alta');
    unmount();
    render(<GeoPastosGlobal {...props(guardado, e => { guardado = e; })} />);
    expect(screen.getAllByTestId('global-linha-pasto')).toHaveLength(1);
  });

  it('D7: "sem mapa" é um sinal âmbar na célula Cab. com o texto inteiro no title; a UA/ha fica no title do kg/ha', () => {
    const comAviso = { ...BB, cabecasSemMapa: 66 };
    render(<GeoPastosGlobal {...props(ESTADO_INICIAL_DO_GLOBAL, () => {})} fazendas={[AA, comAviso]} />);
    const tabela = screen.getByTestId('global-tabela-fazendas');
    const sinais = within(tabela).getAllByTestId('global-sinal-sem-mapa');
    expect(sinais).toHaveLength(1);
    expect(sinais[0].closest('td')?.getAttribute('title')).toBe('66 cab em pastos sem mapa');
    expect(within(tabela).queryByText(/UA\/ha/)).toBeNull();
  });

  it('clique na fazenda abre a fazenda; clique no pasto abre a fazenda com o pasto', () => {
    const onAbrir = vi.fn();
    render(<GeoPastosGlobal {...props(ESTADO_INICIAL_DO_GLOBAL, () => {}, onAbrir)} />);
    fireEvent.click(screen.getAllByTestId('global-linha-fazenda')[1]);
    expect(onAbrir).toHaveBeenLastCalledWith('fb');
    fireEvent.click(within(screen.getByTestId('global-tabela-atencao')).getAllByTestId('global-linha-pasto')[0]);
    expect(onAbrir).toHaveBeenLastCalledWith('fa', { pastoId: 'a1' });
  });
});
