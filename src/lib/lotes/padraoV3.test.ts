/** LOTE-PADRAO-V3 · L2 — as listas fixas, a categoria por fase, o cadastro que o código usa (espelho da _fn_lote_categoria_fixa) e a idade. */
import { describe, expect, it } from 'vitest';
import { cadastroDaCategoria, categoriasDaFase, ehFemea, idadeMedia, marcadoresLimpos, ORDENS_V3, siglaDaCategoria, temReproducao } from './padraoV3';
import type { CadastroDoLote } from './tipos';

const cad = (id: string, sigla: string, nome: string, reb: string[]): CadastroDoLote => ({ id, tipo: 'categoria', sigla, nome, categoriasRebanho: reb, ordem: 0, ativo: true });
const REB = new Map([['vacas', 'r-va'], ['novilhas', 'r-no'], ['desmama_f', 'r-df'], ['bois', 'r-bo'], ['touros', 'r-to'], ['garrotes', 'r-ga'], ['desmama_m', 'r-dm']]);

describe('LOTE-PADRAO-V3 · L2', () => {
  it('ordem de parto: Sem parto · Primípara · Secundípara · Multípara (sem "Novilha parida", Chat 14:10)', () => {
    expect(ORDENS_V3.map(o => o[1])).toEqual(['Sem parto', 'Primípara', 'Secundípara', 'Multípara']);
  });
  it('categoria por fase; a escolhida nunca some; só fêmeas da cria têm situação e ordem', () => {
    expect(categoriasDaFase('cria', null)).toEqual(['vacas', 'novilhas', 'touros']);
    expect(categoriasDaFase('recria', 'bois')).toEqual(['desmama_f', 'desmama_m', 'garrotes', 'novilhas', 'bois']);
    expect([ehFemea('novilhas'), ehFemea('touros')]).toEqual([true, false]);
    expect([temReproducao('cria', 'vacas'), temReproducao('cria', 'touros'), temReproducao('recria', 'novilhas')]).toEqual([true, false, false]);
  });
  it('o cadastro do código: mesma sigla fixa > mesmo nome (fica a sigla dele) > nenhum (sigla fixa); NJ: BO "Boi" nunca vira o fixo', () => {
    const NJ = [cad('df', 'DF', 'Desmama fêmea', ['r-df']), cad('bo', 'BO', 'Boi', ['r-bo']), cad('vac', 'VAC', 'Vacas', ['r-va']), cad('pp', 'PP', 'Prenha parida', ['r-va', 'r-mf'])];
    expect(cadastroDaCategoria(NJ, REB, 'vacas')?.id).toBe('vac');
    expect(siglaDaCategoria(NJ, REB, 'desmama_f')).toBe('DF');
    expect(cadastroDaCategoria(NJ, REB, 'bois')).toBeNull();
    expect(siglaDaCategoria(NJ, REB, 'bois')).toBe('BOI');
    expect(siglaDaCategoria(NJ, REB, null)).toBeNull();
  });
  it('idade média pelo meio da faixa de nascimento (nunca digitada); marcadores limpos', () => {
    expect(idadeMedia('2024-09-01', '2024-12-31', '2026-11-12')).toBe(24);
    expect(idadeMedia('2025-01-15', '', '2026-11-12')).toBe(22);
    expect(idadeMedia('', '', '2026-11-12')).toBeNull();
    expect(marcadoresLimpos([' Gêmeos ', 'Retiro', 'Gêmeos', ''])).toEqual(['Gêmeos', 'Retiro']);
  });
});
