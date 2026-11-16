/** L1-CARIMBO-SO-COM-BEZERRO-01 (Chat 10/11 20:50; Gabriel, NJ · Faz. Pureza · P10A out/26: 30 vacas, 0 bezerros, caderno "VC MOJADA") —
 *  o "sem carimbo · definir" só aparece quando o pasto do lote tem Mamotes M ou F com cabeça no mês (vaca parida com bezerro ao pé).
 *  Sem bezerro: o nome do caderno (cinza), senão o código; nunca pede carimbo. A mesma fonte (`nomeNaTela`) no modal, no seletor, no
 *  popup e no mapa, no Mapa do rebanho e na lista; a marca vem do `useLotesDaFazenda` (os itens do mês).
 *   B1 P10A (30 V, 0 MM/MF) sem aviso: o caderno; P6 (V + MM/MF) com carimbo 7.1 = 7.1; P6 sem carimbo = o aviso
 *   B2 o bezerro conta pelo pasto (Mamote sem lote no pasto do lote) e o caderno sai sem repetir; sem caderno = o do campeiro, senão o código
 *   B3 o hook: sem a leitura dos itens, nunca o aviso */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { LoteDaLista } from '@/lib/lotes/tipos';

const banco = vi.hoisted(() => ({ erroItens: false }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [
      { id: 'p10a', codigo: 'CRI-VAC-NE-03', situacao: 'ativo', categoria_id: 'vac', raca_id: 'ne', atividade_id: 'cri', numero: 3, versao: 1, formado_em: '2026-01-01' },
      { id: 'p6', codigo: 'CRI-VAC-NE-01', situacao: 'ativo', categoria_id: 'vac', raca_id: 'ne', atividade_id: 'cri', numero: 1, versao: 1, formado_em: '2026-01-01', carimbo: '7.1' },
      { id: 'p6b', codigo: 'CRI-VAC-NE-02', situacao: 'ativo', categoria_id: 'vac', raca_id: 'ne', atividade_id: 'cri', numero: 2, versao: 1, formado_em: '2026-01-01' },
    ], error: null }),
    from: (tabela: string) => ({
      select: () => tabela === 'rebanho_lote_cadastros'
        ? { in: () => Promise.resolve({ data: [
            { id: 'cri', tipo: 'atividade', sigla: 'CRI', nome: 'Cria', categorias_rebanho: [], ordem: 1, ativo: true },
            { id: 'vac', tipo: 'categoria', sigla: 'VAC', nome: 'Vaca', categorias_rebanho: [], ordem: 1, ativo: true },
          ], error: null }) }
        : tabela === 'fechamento_pasto_itens'
          ? { eq: () => ({ eq: () => ({ gt: () => Promise.resolve(banco.erroItens ? { data: null, error: { message: 'x' } } : { data: [
              { fechamento_id: 'P10A', categoria_id: 'vac', quantidade: 30, lote_id: 'p10a', fechamento_pastos: { lote_mes: 'VC MOJADA' } },
              { fechamento_id: 'P6', categoria_id: 'vac', quantidade: 20, lote_id: 'p6b', fechamento_pastos: { lote_mes: 'VC PARIDA' } },
              { fechamento_id: 'P6', categoria_id: 'mmf', quantidade: 8, lote_id: 'p6b', fechamento_pastos: { lote_mes: 'VC PARIDA' } },
            ], error: null }) }) }) }
          : { like: () => Promise.resolve({ data: [{ id: 'mmm', codigo: 'mamotes_m' }, { id: 'mmf', codigo: 'mamotes_f' }], error: null }) },
    }),
  },
}));

import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { FRASE_SEM_CARIMBO, nomeEhDoCaderno, nomeNaTela } from '@/lib/lotes/tipos';
import { marcarBezerro, type ItemDoMes } from '@/lib/lotes/assistente';
import { loteDoPopup, rotuloDoLote, loteDoCard } from '@/lib/lotes/loteDoPasto';
import { loteDoMapa } from '@/lib/mapa/programaDoPasto';
import { opcoesDosLotes } from '@/components/fechamento/CampoLoteDoPasto';

const lote = (id: string, codigo: string, carimbo: string | null, nomeCampeiro: string | null = null): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro, situacao: 'ativo', formadoEm: '2026-01-01', encerradoEm: null, categoriaId: 'vac', racaId: 'ne',
  atividadeId: 'cri', numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo, idadeMediaMeses: null, metaPesoKg: null,
  metaGmdKg: null, metaData: null, versao: 1, anoMesDado: '2026-10', cabecas: 30, pesoMedioKg: 400, gmdKg: null, pastos: [], lancamentos: 1, conferir: null,
  daCria: true,
});
const item = (fechamentoId: string, categoriaId: string, quantidade: number, loteId: string | null, noCaderno: string | null): ItemDoMes =>
  ({ fechamentoId, categoriaId, quantidade, loteId, noCaderno });
const MAMOTES = ['mmm', 'mmf'];

describe('L1-CARIMBO-SO-COM-BEZERRO-01 — B1 o aviso só com bezerro ao pé', () => {
  const lotes = marcarBezerro([lote('p10a', 'CRI-VAC-NE-03', null), lote('p6', 'CRI-VAC-NE-01', '7.1'), lote('p6b', 'CRI-VAC-NE-02', null)], [
    item('P10A', 'vac', 30, 'p10a', 'VC MOJADA'),
    item('P6', 'vac', 20, 'p6', 'VC PARIDA'), item('P6', 'mmm', 6, 'p6', 'VC PARIDA'), item('P6', 'mmf', 5, 'p6', 'VC PARIDA'),
    item('P7', 'vac', 20, 'p6b', 'VC PARIDA 2'), item('P7', 'mmf', 4, 'p6b', 'VC PARIDA 2'),
  ], MAMOTES);
  const [p10a, p6, p6b] = lotes;
  it('P10A (30 V, 0 MM/MF): o caderno "VC MOJADA" em cinza, nunca o aviso; P6 com carimbo = 7.1; P6 sem carimbo = o aviso', () => {
    expect([p10a.comBezerro, nomeNaTela(p10a), nomeEhDoCaderno(p10a)]).toEqual([false, 'VC MOJADA', true]);
    expect([p6.comBezerro, nomeNaTela(p6), nomeEhDoCaderno(p6)]).toEqual([true, '7.1', false]);
    expect([p6b.comBezerro, nomeNaTela(p6b), nomeEhDoCaderno(p6b)]).toEqual([true, FRASE_SEM_CARIMBO, false]);
  });
  it('a mesma fonte no modal (campo e seletor), no popup/mapa e no Mapa do rebanho', () => {
    const itensP10A = [{ categoria_id: 'vac', quantidade: 30, lote_id: 'p10a' }];
    expect(rotuloDoLote(loteDoCard(itensP10A), lotes)).toMatchObject({ texto: 'VC MOJADA', doCaderno: true });
    const r6b = rotuloDoLote(loteDoCard([{ categoria_id: 'vac', quantidade: 20, lote_id: 'p6b' }]), lotes);
    expect([r6b.texto, r6b.doCaderno ?? false]).toEqual([FRASE_SEM_CARIMBO, false]);
    expect(loteDoPopup(itensP10A, lotes)).toBe('VC MOJADA');
    expect(loteDoMapa(['p10a'], lotes)).toBe('VC MOJADA');
    expect(loteDoMapa(['p6'], lotes)).toBe('7.1');
    const [o10, , o6b] = opcoesDosLotes(lotes);
    expect([o10.label, o10.sub, o6b.label]).toEqual(['VC MOJADA', 'CRI-VAC-NE-03', FRASE_SEM_CARIMBO]);
  });
});

describe('L1-CARIMBO-SO-COM-BEZERRO-01 — B2 o bezerro pelo pasto; o caderno', () => {
  it('Mamote SEM lote no pasto do lote conta; Mamote com 0 cabeça não conta; o caderno de 2 pastos sai sem repetir', () => {
    const [a, b] = marcarBezerro([lote('a', 'CRI-VAC-NE-05', null), lote('b', 'CRI-VAC-NE-06', null)], [
      item('X', 'vac', 10, 'a', 'VC X'), item('X', 'mmm', 3, null, 'VC X'),
      item('Y', 'vac', 10, 'b', 'VC Y'), item('Y', 'mmf', 0, 'b', 'VC Y'), item('Z', 'vac', 5, 'b', 'VC Y'), item('W', 'vac', 5, 'b', 'VC W'),
    ], MAMOTES);
    expect([a.comBezerro, nomeNaTela(a)]).toEqual([true, FRASE_SEM_CARIMBO]);
    expect([b.comBezerro, nomeNaTela(b)]).toEqual([false, 'VC Y · VC W']);
  });
  it('sem o caderno: o nome do campeiro; sem nenhum: o código (e o código não é "do caderno")', () => {
    const [c, d] = marcarBezerro([lote('c', 'CRI-VAC-NE-07', null, 'Mojadas'), lote('d', 'CRI-VAC-NE-08', null)], [], MAMOTES);
    expect([nomeNaTela(c), nomeEhDoCaderno(c)]).toEqual(['Mojadas', true]);
    expect([nomeNaTela(d), nomeEhDoCaderno(d)]).toEqual(['CRI-VAC-NE-08', false]);
  });
});

describe('L1-CARIMBO-SO-COM-BEZERRO-01 — B3 useLotesDaFazenda', () => {
  beforeEach(() => { banco.erroItens = false; });
  it('marca o bezerro e o caderno pelos itens do mês', async () => {
    const { result } = renderHook(() => useLotesDaFazenda('faz', '2026-10'));
    await waitFor(() => expect(result.current.lotes.every(l => l.comBezerro !== undefined)).toBe(true));
    expect(result.current.lotes.map(l => [l.id, nomeNaTela(l)])).toEqual([['p10a', 'VC MOJADA'], ['p6', '7.1'], ['p6b', FRASE_SEM_CARIMBO]]);
  });
  it('sem a leitura dos itens: a cria segue marcada, mas nunca o aviso (o código)', async () => {
    banco.erroItens = true;
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useLotesDaFazenda('faz', '2026-10'));
    await waitFor(() => expect(result.current.lotes.every(l => l.daCria === true)).toBe(true));
    expect(result.current.lotes.map(nomeNaTela)).toEqual(['CRI-VAC-NE-03', '7.1', 'CRI-VAC-NE-02']);
    erro.mockRestore();
  });
});
