/** L1 (Gabriel 09/11 07:58) — a cria mostra o carimbo (7.1 · 7.2 · 7R) no popup do pasto, na lista e no seletor do lote; a cria SEM
 *  carimbo mostra "sem carimbo · definir" (o código ao lado). Fora da cria, o código. Quem é cria: a regra do assistente
 *  (`aceitaCarimbo`), lida pelo `useLotesDaFazenda`; sem essa leitura o lote mostra o código, como antes. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CadastroDoLote, LoteDaLista } from '@/lib/lotes/tipos';

const banco = vi.hoisted(() => ({ erroCadastros: false }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [
      { id: 'a', codigo: 'CRI-VAC-NE-01', situacao: 'ativo', categoria_id: 'vac', raca_id: 'ne', atividade_id: 'cri', numero: 1, versao: 1, formado_em: '2026-01-01', carimbo: '7R' },
      { id: 'b', codigo: 'CRI-VAC-NE-02', situacao: 'ativo', categoria_id: 'vac', raca_id: 'ne', atividade_id: 'cri', numero: 2, versao: 1, formado_em: '2026-01-01' },
      { id: 'c', codigo: 'ENG-BOI-NE-01', situacao: 'ativo', categoria_id: 'boi', raca_id: 'ne', atividade_id: 'eng', numero: 1, versao: 1, formado_em: '2026-01-01' },
    ], error: null }),
    from: (tabela: string) => ({
      select: () => tabela === 'rebanho_lote_cadastros'
        ? { in: () => Promise.resolve(banco.erroCadastros ? { data: null, error: { message: 'x' } } : { data: [
            { id: 'cri', tipo: 'atividade', sigla: 'CRI', nome: 'Cria', categorias_rebanho: [], ordem: 1, ativo: true },
            { id: 'eng', tipo: 'atividade', sigla: 'ENG', nome: 'Engorda', categorias_rebanho: [], ordem: 3, ativo: false },
            { id: 'vac', tipo: 'categoria', sigla: 'VAC', nome: 'Vaca', categorias_rebanho: [], ordem: 1, ativo: true },
            { id: 'boi', tipo: 'categoria', sigla: 'BOI', nome: 'Boi', categorias_rebanho: ['r-bois'], ordem: 2, ativo: true },
          ], error: null }) }
        /* o `like` pode não filtrar (a bancada não filtra): o hook confere o código dos mamotes */
        : { like: () => Promise.resolve({ data: [{ id: 'mam', codigo: 'mamotes_m' }, { id: 'r-bois', codigo: 'bois' }], error: null }) },
    }),
  },
}));

import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { FRASE_SEM_CARIMBO, nomeDoLote, nomeNaTela } from '@/lib/lotes/tipos';
import { marcarDaCria } from '@/lib/lotes/assistente';
import { loteDoPopup, textoDoLoteNoCaderno } from '@/lib/lotes/loteDoPasto';
import { tituloDoCodigo } from '@/lib/lotes/lista';
import { opcoesDosLotes } from '@/components/fechamento/CampoLoteDoPasto';

const lote = (id: string, codigo: string, carimbo: string | null, daCria: boolean | undefined, atividadeId = 'cri', categoriaId = 'vac'): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro: null, situacao: 'ativo', formadoEm: '2026-01-01', encerradoEm: null, categoriaId, racaId: 'ne',
  atividadeId, numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo, idadeMediaMeses: null, metaPesoKg: null,
  metaGmdKg: null, metaData: null, versao: 1, anoMesDado: '2026-11', cabecas: 10, pesoMedioKg: 200, gmdKg: null, pastos: [], lancamentos: 1, conferir: null,
  ...(daCria === undefined ? {} : { daCria }),
});
const item = (lote_id: string) => [{ categoria_id: 'vac', quantidade: 10, lote_id }];

describe('L1 — o nome do lote na tela', () => {
  it('cria com carimbo = o carimbo; cria sem carimbo = "sem carimbo · definir"; fora da cria (ou sem a leitura) = o código', () => {
    expect(nomeNaTela(lote('a', 'CRI-VAC-NE-01', '7.2', true))).toBe('7.2');
    expect(nomeNaTela(lote('b', 'CRI-VAC-NE-02', null, true))).toBe('sem carimbo · definir');
    expect(nomeNaTela(lote('b', 'CRI-VAC-NE-02', '  ', true))).toBe(FRASE_SEM_CARIMBO);
    expect(nomeNaTela(lote('c', 'ENG-BOI-NE-01', null, false))).toBe('ENG-BOI-NE-01');
    expect(nomeNaTela(lote('d', 'CRI-VAC-NE-04', null, undefined))).toBe('CRI-VAC-NE-04');
  });

  it('popup do pasto: o carimbo, ou "sem carimbo · definir" com o código no title do campo', () => {
    const lotes = [lote('a', 'CRI-VAC-NE-01', '7R', true), lote('b', 'CRI-VAC-NE-02', null, true), lote('c', 'ENG-BOI-NE-01', null, false)];
    expect(loteDoPopup(item('a'), lotes)).toBe('7R');
    expect(loteDoPopup(item('b'), lotes)).toBe('sem carimbo · definir');
    expect(loteDoPopup(item('c'), lotes)).toBe('ENG-BOI-NE-01');
  });

  it('seletor: rótulo pelo nome na tela, o código em cinza ao lado quando o nome não é ele, busca pelo código', () => {
    const [a, b, c] = opcoesDosLotes([lote('a', 'CRI-VAC-NE-01', '7.1', true), lote('b', 'CRI-VAC-NE-02', null, true), lote('c', 'ENG-BOI-NE-01', null, false)]);
    expect([a.label, a.sub]).toEqual(['7.1', 'CRI-VAC-NE-01']);
    expect([b.label, b.sub]).toEqual(['sem carimbo · definir', 'CRI-VAC-NE-02']);
    expect([c.label, c.sub]).toEqual(['ENG-BOI-NE-01', undefined]);
    expect(b.busca).toContain('CRI-VAC-NE-02');
  });

  it('lista: o title leva o código da cria sem carimbo; o "Usar o lote" do caderno e as frases seguem com o código (nunca a frase)', () => {
    const b = lote('b', 'CRI-VAC-NE-02', null, true);
    expect(tituloDoCodigo(b)).toBe('CRI-VAC-NE-02');
    expect(tituloDoCodigo(lote('c', 'ENG-BOI-NE-01', null, false))).toBeUndefined();
    expect(textoDoLoteNoCaderno(item('b'), [b])).toBe('CRI-VAC-NE-02');
    expect(nomeDoLote(b)).toBe('CRI-VAC-NE-02');
  });
});

describe('L1 — quem é cria (a regra do assistente)', () => {
  const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string, categoriasRebanho: string[] = []): CadastroDoLote =>
    ({ id, tipo, sigla, nome: sigla, categoriasRebanho, ordem: 1, ativo: true });
  it('atividade CRI (ou CR) ou categoria de mamotes leva carimbo; recria e engorda não', () => {
    const cadastros = [cad('cri', 'atividade', 'CRI'), cad('cr', 'atividade', 'CR'), cad('eng', 'atividade', 'ENG'), cad('vac', 'categoria', 'VAC'), cad('bez', 'categoria', 'BEZ', ['mam'])];
    const r = marcarDaCria([lote('1', 'x', null, undefined, 'cri'), lote('2', 'y', null, undefined, 'cr'), lote('3', 'z', null, undefined, 'eng'),
      lote('4', 'w', null, undefined, 'eng', 'bez')], cadastros, ['mam']);
    expect(r.map(l => l.daCria)).toEqual([true, true, false, true]);
  });
});

describe('L1 — useLotesDaFazenda marca a cria', () => {
  beforeEach(() => { banco.erroCadastros = false; });
  it('com a atividade do lote (mesmo inativa) lida do cadastro', async () => {
    const { result } = renderHook(() => useLotesDaFazenda('faz', '2026-11'));
    await waitFor(() => expect(result.current.lotes).toHaveLength(3));
    expect(result.current.lotes.map(l => [l.id, l.daCria, nomeNaTela(l)])).toEqual([['a', true, '7R'], ['b', true, FRASE_SEM_CARIMBO], ['c', false, 'ENG-BOI-NE-01']]);
  });
  it('sem a leitura do cadastro: o código, como antes (nunca "sem carimbo" à toa)', async () => {
    banco.erroCadastros = true;
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useLotesDaFazenda('faz', '2026-11'));
    await waitFor(() => expect(result.current.lotes).toHaveLength(3));
    expect(result.current.lotes.map(nomeNaTela)).toEqual(['7R', 'CRI-VAC-NE-02', 'ENG-BOI-NE-01']);
    erro.mockRestore();
  });
});
