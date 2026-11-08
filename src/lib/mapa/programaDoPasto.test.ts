/**
 * MAPA-REBANHO-02 — a coluna "Programa" do Mapa do rebanho: o programa do lote pela fonte única (itens do fechamento → lote → cadastro).
 * Dados SINTÉTICOS (o caso do adendo: só o lote da inseminação tem programa).
 */
import { describe, expect, it } from 'vitest';
import { lotesDoPasto, programaDoPasto } from './programaDoPasto';
import { mapaDoCadastro } from '@/lib/lotes/lista';
import type { CadastroDoLote } from '@/lib/lotes/tipos';

const cad = (id: string, nome: string): CadastroDoLote => ({ id, tipo: 'programa', sigla: null, nome, categoriasRebanho: [], ordem: 1, ativo: true });
const NOMES = mapaDoCadastro([cad('pg-ins', '1ª inseminação'), cad('pg-iatf', 'IATF')]);
const LOTES = [{ id: 'l-ins', programaId: 'pg-ins' }, { id: 'l-cri', programaId: null }, { id: 'l-iatf', programaId: 'pg-iatf' }, { id: 'l-ins2', programaId: 'pg-ins' }];

describe('os lotes do pasto no mês', () => {
  it('só os itens COM cabeça, sem repetir, na ordem; item sem lote não conta', () => {
    expect(lotesDoPasto([{ quantidade: 9, lote_id: 'l-ins' }, { quantidade: 0, lote_id: 'l-cri' }, { quantidade: 4, lote_id: 'l-ins' },
      { quantidade: 3, lote_id: null }, { quantidade: 2 }, { quantidade: 5, lote_id: 'l-iatf' }])).toEqual(['l-ins', 'l-iatf']);
    expect(lotesDoPasto([])).toEqual([]);
  });
});

describe('o programa do pasto', () => {
  it('o lote com programa: o nome do cadastro', () => {
    expect(programaDoPasto(['l-ins'], LOTES, NOMES)).toBe('1ª inseminação');
  });
  it('sem lote, lote sem programa, lote que a leitura não trouxe ou programa fora do cadastro: null (a tela escreve "—")', () => {
    expect(programaDoPasto([], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-cri'], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-sumiu'], LOTES, NOMES)).toBeNull();
    expect(programaDoPasto(['l-ins'], LOTES, mapaDoCadastro([]))).toBeNull();
  });
  it('mais de um programa no pasto: os nomes, sem repetir', () => {
    expect(programaDoPasto(['l-ins', 'l-cri', 'l-iatf', 'l-ins2'], LOTES, NOMES)).toBe('1ª inseminação · IATF');
  });
});
