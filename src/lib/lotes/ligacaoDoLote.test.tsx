/**
 * L1 LIGAÇÃO fechamento↔lote (Chat 12/11 15:05) — a sugestão do campo Lote (das MESMAS opções do seletor) e o indicador "Lotes N/M".
 * Caso Santa Rita (nomes genéricos): o 20R-2 com caderno "L20 F1+SP C10" e o lote "L20 SP+F1" (10.1) — 1 sugestão; um pasto onde
 * estiveram 2 lotes no mês anterior — 2 sugestões; um pasto sem nada — nenhuma (nunca inventa).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoLoteDoPasto } from '@/components/fechamento/CampoLoteDoPasto';
import { opcoesDosLotesNoPasto, type MesAnteriorDoLote } from './buscaDoLote';
import { ligacaoDoMes, sugestaoDoLote, textoDaLigacao } from './ligacaoDoLote';
import type { LoteDaLista } from './tipos';

const lote = (id: string, codigo: string, carimbo: string | null, nomeCampeiro: string | null): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro, situacao: 'ativo', formadoEm: '2026-10-01', encerradoEm: null, categoriaId: 'c', racaId: 'r',
  atividadeId: 'a', numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo, idadeMediaMeses: null,
  metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1, anoMesDado: null, cabecas: null, pesoMedioKg: null, gmdKg: null,
  pastos: [], lancamentos: 0, conferir: null, daCria: carimbo !== null,
});
const L20 = lote('l20', 'C-PRE-NEL-10.1', '10.1', 'L20 SP+F1');
const L7 = lote('l7', 'C-VAC-NEL-7.3', '7.3', 'L7 PRIM+SEC C7/8');
const L9 = lote('l9', 'C-VAC-NEL-8.1', '8.1', 'L9VC NEL C7/8');
const TODOS = [L20, L7, L9];
const mes: MesAnteriorDoLote = { porLote: new Map([['l7', { pastos: ['20A-1'], cabecas: 80 }], ['l9', { pastos: ['20A-1'], cabecas: 90 }]]), textos: [] };
const semCab = [{ categoria_id: 'vacas', quantidade: 0, lote_id: null }];
const semLote = [{ categoria_id: 'vacas', quantidade: 69, lote_id: null }, { categoria_id: 'mamotes', quantidade: 0, lote_id: null }];

describe('L1 (b) — a sugestão do campo Lote', () => {
  it('Santa Rita 20R-2: o caderno "L20 F1+SP C10" sugere o L20 (1 = Usar)', () => {
    const s = sugestaoDoLote(opcoesDosLotesNoPasto(TODOS, { pastoNome: '20R-2', textoDoCaderno: 'L20 F1+SP C10', mesAnterior: mes }), semLote);
    expect(s?.opcoes.map(o => o.value)).toEqual(['l20']);
    expect(s?.porque).toBe('pelo nome no caderno');
  });
  it('2 lotes no mesmo pasto no mês anterior = 2 sugestões; nada no caderno nem no pasto = nenhuma', () => {
    const s = sugestaoDoLote(opcoesDosLotesNoPasto(TODOS, { pastoNome: '20A-1', textoDoCaderno: '', mesAnterior: mes }), semLote);
    expect(s?.opcoes.map(o => o.value).sort()).toEqual(['l7', 'l9']);
    expect(s?.porque).toBe('neste pasto no mês anterior');
    expect(sugestaoDoLote(opcoesDosLotesNoPasto(TODOS, { pastoNome: '19B', textoDoCaderno: '', mesAnterior: mes }), semLote)).toBeNull();
  });
  it('sem cabeça, ou com algum lote já ligado: nenhuma sugestão', () => {
    const ops = opcoesDosLotesNoPasto(TODOS, { pastoNome: '20R-2', textoDoCaderno: 'L20 F1+SP C10', mesAnterior: mes });
    expect(sugestaoDoLote(ops, semCab)).toBeNull();
    expect(sugestaoDoLote(ops, [{ quantidade: 69, lote_id: 'l7' }, { quantidade: 5, lote_id: null }])).toBeNull();
  });
  it('na tela: "Usar 10.1" liga todas as categorias com cabeça em 1 clique; com 2, "2 sugestões" abre o painel', () => {
    const onChange = vi.fn();
    const { unmount } = render(<CampoLoteDoPasto comRotulo itens={semLote} lotes={TODOS} nomeDaCategoria={() => 'Vacas'} onNovoLote={vi.fn()} onChange={onChange}
      contexto={{ pastoNome: '20R-2', textoDoCaderno: 'L20 F1+SP C10', mesAnterior: mes }} />);
    fireEvent.click(screen.getByTestId('lote-sugestao-usar'));
    expect(screen.getByTestId('lote-sugestao-usar').textContent).toBe('Usar 10.1');
    expect(onChange.mock.calls[0][0].filter((i: { quantidade: number }) => i.quantidade > 0).map((i: { lote_id: string }) => i.lote_id)).toEqual(['l20']);
    unmount();
    render(<CampoLoteDoPasto comRotulo itens={semLote} lotes={TODOS} nomeDaCategoria={() => 'Vacas'} onNovoLote={vi.fn()} onChange={vi.fn()}
      contexto={{ pastoNome: '20A-1', textoDoCaderno: '', mesAnterior: mes }} />);
    expect(screen.getByTestId('lote-sugestao-varias').textContent).toBe('2 sugestões');
    fireEvent.click(screen.getByTestId('lote-sugestao-varias'));
    expect(screen.getByTestId('painel-lote-do-pasto')).toBeTruthy();
  });
});

describe('L1 (c) — "Itens com lote N/M" no topo do Fechamento', () => {
  it('conta só os itens com cabeça; completo = sem âmbar; sem item com cabeça = nada', () => {
    const l = ligacaoDoMes([[{ quantidade: 69, lote_id: 'l20' }, { quantidade: 0, lote_id: null }], [{ quantidade: 90, lote_id: null }, { quantidade: 5, lote_id: 'l9' }]]);
    expect(l).toEqual({ com: 2, total: 3 });
    expect(textoDaLigacao(l)).toEqual({ texto: 'Itens com lote 2/3', title: '2 de 3 itens com cabeça têm lote neste mês (não impede fechar)', completo: false });
    expect(textoDaLigacao({ com: 3, total: 3 })?.completo).toBe(true);
    expect(textoDaLigacao({ com: 0, total: 0 })).toBeNull();
  });
});
