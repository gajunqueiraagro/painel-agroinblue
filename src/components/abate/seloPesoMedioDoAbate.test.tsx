/**
 * 117541 (IMPORTAR-ABATE-PESO-POR-LOTE-01 parte 2) — o lote importado com vários lotes e só o peso GERAL tem o peso vivo MÉDIO DO
 * ABATE: o RC dele é estimado e o cartão do abate diz isso ("peso médio do abate"). Corrigir o peso do lote apaga o selo.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbaLotesAbate } from '@/components/abate/AbaLotesAbate';
import { linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';
import { comEdicao, pesoEhDaMediaDoAbate, type CompraLotesApi, type LoteForm } from '@/hooks/useCompraLotes';

const lote = (pesoDaMediaDoAbate: boolean): LoteAbate => ({
  id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 36, pesoMedioKg: 550, pesoDaMediaDoAbate,
});
const negociada: LinhaAbate = { ...linhaVazia('l1'), pesoCarcacaKg: 11190.5, pesoCarcacaFonte: 'total', precoArroba: 396.03, precoFonte: 'arroba' };
const api: CompraLotesApi = {
  lotes: [], loading: false, saving: false, adicionarLote: () => 'x', editarLote: () => {}, removerLote: () => {},
  salvar: async () => 1, recarregar: async () => {}, totais: { lotes: 0, animais: 0, pesoTotal: 0, valorNegociado: 0 },
};
const montar = (l: LoteAbate) => render(
  <AbaLotesAbate lotes={[l]} linhas={new Map([['l1', negociada]])} cenario="realizado" cenariosExistentes={['realizado']}
    onCenarioChange={() => {}} lotesApi={api} categoriasDisponiveis={[{ value: 'bois', label: 'Bois' }]} onLinhaChange={() => {}} />,
);
const form: LoteForm = { idLocal: 'a', ordem: 1, categoria: 'bois', quantidade: '36', pesoMedioKg: '550', criterioValor: 'kg',
  valorInformado: '', observacao: '', pesoDaMediaDoAbate: true };

describe('selo "peso médio do abate"', () => {
  it('a fonte do banco: só media_do_abate acende', () => {
    expect(pesoEhDaMediaDoAbate('media_do_abate')).toBe(true);
    expect(pesoEhDaMediaDoAbate('lote')).toBe(false);
    expect(pesoEhDaMediaDoAbate(null)).toBe(false);
  });
  it('o cartão do lote com o peso médio do abate mostra o selo junto do RC', () => {
    montar(lote(true));
    const selo = screen.getByTestId('selo-peso-medio-do-abate');
    expect(selo.textContent).toBe('peso médio do abate');
    expect(selo.previousElementSibling?.textContent).toMatch(/^RC \d/);
  });
  it('o lote com o peso dele não tem selo', () => {
    montar(lote(false));
    expect(screen.queryByTestId('selo-peso-medio-do-abate')).toBeNull();
  });
  it('corrigir o peso na tela apaga o selo; mexer em outro campo (ou repetir o peso) não', () => {
    expect(comEdicao(form, { pesoMedioKg: '562' }).pesoDaMediaDoAbate).toBe(false);
    expect(comEdicao(form, { pesoMedioKg: '550' }).pesoDaMediaDoAbate).toBe(true);
    expect(comEdicao(form, { observacao: 'OC 10770' }).pesoDaMediaDoAbate).toBe(true);
  });
});
