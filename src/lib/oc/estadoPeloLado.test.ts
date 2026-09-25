/**
 * OC-STATUS-LADO-01 (ADR-2026-20) — o que a tela faz com o estado pelo lado que a view devolve.
 *
 * ⚠ AS 8 LINHAS SÃO A `vw_oc_operacao_liquidacao` APLICADA NO PROTO (25/09/2026), copiadas da consulta —
 *   não inventadas. O estado é do banco (provado em rollback: estas sete mudaram, nenhuma outra); aqui se
 *   trava a LEITURA: a marca de despesa, o filtro "Despesas pendentes" e o "Paga X%" pelo lado.
 */
import { describe, it, expect } from 'vitest';
import { temDespesaPendente, passaFiltroPagamento, pctPagoPeloLado, FILTRO_DESPESAS_PENDENTES, type LiquidacaoPeloLado } from '@/lib/oc/estadoPeloLado';
import { ehDoLadoDaOperacao } from '@/v2/lib/ocResumo';

const VIEW: Record<string, LiquidacaoPeloLado & { antes: string }> = {
  '8a6295f0': { antes: 'parcial', estado_liquidacao: 'nao_liquidada', base: 107174.97, total_liquidado_valido: 0, despesas_pendentes: 0 },
  '744c520e': { antes: 'parcial', estado_liquidacao: 'quitada', base: 1252460.61, total_liquidado_valido: 1252460.61, despesas_pendentes: 20615 },
  'da0b8577': { antes: 'excedente', estado_liquidacao: 'quitada', base: 466030.10, total_liquidado_valido: 466030.1, despesas_pendentes: 6000 },
  'b58bf556': { antes: 'parcial', estado_liquidacao: 'nao_liquidada', base: 686857.46, total_liquidado_valido: 0, despesas_pendentes: 0 },
  '7f7de76f': { antes: 'parcial', estado_liquidacao: 'nao_liquidada', base: 304269.5, total_liquidado_valido: 0, despesas_pendentes: 32.54 },
  '581d075c': { antes: 'parcial', estado_liquidacao: 'nao_liquidada', base: 275205.9, total_liquidado_valido: 0, despesas_pendentes: 0 },
  '2d39d7e9': { antes: 'parcial', estado_liquidacao: 'nao_liquidada', base: 103006.06, total_liquidado_valido: 0, despesas_pendentes: 0 },
  '02be1a41': { antes: 'nao_liquidada', estado_liquidacao: 'nao_liquidada', base: 367783.4, total_liquidado_valido: 0, despesas_pendentes: 2165.49 },
};
const LEGADO: LiquidacaoPeloLado = { estado_liquidacao: 'parcial', base: 10000, total_liquidado_valido: 4000, despesas_pendentes: null };

describe('as 8 OCs', () => {
  it('sete mudaram de estado e uma (02be1a41) so ganhou o indicador', () => {
    const mudaram = Object.entries(VIEW).filter(([, v]) => v.antes !== v.estado_liquidacao).map(([k]) => k);
    expect(mudaram).toEqual(['8a6295f0', '744c520e', 'da0b8577', 'b58bf556', '7f7de76f', '581d075c', '2d39d7e9']);
  });

  it('despesa pendente: 744c520e (frete 20.615), da0b8577 (frete 6.000), 7f7de76f (o orfao 32,54), 02be1a41', () => {
    const com = Object.entries(VIEW).filter(([, v]) => temDespesaPendente(v)).map(([k]) => k);
    expect(com).toEqual(['744c520e', 'da0b8577', '7f7de76f', '02be1a41']);
    /* Zero e' zero, nao "pendente"; e o centavo e' a tolerancia da regua. */
    expect(temDespesaPendente({ estado_liquidacao: 'x', despesas_pendentes: 0.01 })).toBe(false);
    /* Legado sem compromisso: a view manda NULL — sem lado, sem indicador. */
    expect(temDespesaPendente(LEGADO)).toBe(false);
  });

  it('"Paga X%" pelo lado: b58bf556 e 0%, nao os 14% de antes; c80ebe9e seria 95%', () => {
    expect(pctPagoPeloLado(VIEW.b58bf556)).toBe(0);
    expect(pctPagoPeloLado({ estado_liquidacao: 'parcial', base: 107367.46, total_liquidado_valido: 102311.46 })).toBe(95);
    expect(pctPagoPeloLado({ estado_liquidacao: 'parcial', base: 0, total_liquidado_valido: 5 })).toBeNull();
  });
});

describe('filtro Pagamento', () => {
  it('"Despesas pendentes" pega as quatro, qualquer que seja o estado; os estados seguem filtrando como antes', () => {
    const passa = (f: string) => Object.entries(VIEW).filter(([, v]) => passaFiltroPagamento(f, v)).map(([k]) => k);
    expect(passa(FILTRO_DESPESAS_PENDENTES)).toEqual(['744c520e', 'da0b8577', '7f7de76f', '02be1a41']);
    expect(passa('quitada')).toEqual(['744c520e', 'da0b8577']);
    expect(passa('__all__')).toHaveLength(8);
  });
});

describe('de que lado e a parcela', () => {
  it('venda/abate: entrada e o lado, saida e despesa', () => {
    expect(ehDoLadoDaOperacao('venda', '1-Entradas')).toBe(true);
    expect(ehDoLadoDaOperacao('abate', '2-Saídas')).toBe(false);
  });
  it('compra no espelho: saida e o lado, entrada e despesa', () => {
    expect(ehDoLadoDaOperacao('compra', '2-Saídas')).toBe(true);
    expect(ehDoLadoDaOperacao('compra', '1-Entradas')).toBe(false);
  });
  it('direcao desconhecida fica no lado da operacao, onde sempre esteve', () => {
    expect(ehDoLadoDaOperacao('venda', null)).toBe(true);
  });
});
