/**
 * PR-CONC-EXCEL-CONTA-STAGING-01 — o de-para de conta chega ao staging.
 *
 * ⚠ O DEFEITO (NJ, set/26, sessão b6955356): o Enriquecer chamava `resolverConta(...)` (que só AGENDA o estado) e
 *   logo depois `popular()`, que lia o `contaMap` da renderização em curso — vazio. 483 de 509 linhas foram para o
 *   staging sem conta, e `fn_classificacao_casar_sessao` as pulou (`sem_conta_para_match`). Agora o mapa vai por
 *   PARÂMETRO e se monta dentro do `popular`, na mesma chamada.
 * ⚠ OS TEXTOS SÃO OS DA PLANILHA REAL do NJ (colunas de conta da sessão b6955356).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ClassificacaoExcelRow, ClassificacaoParseResult } from '@/v2/lib/excelPreview/parserClassificacao';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';

const BB = 'Banco do Brasil - Pecuária Ag. 8974 C/C 25367 7';
const SL = 'Sicredi Lavoura Ag. 0903 C/C 95982 3';
const CARTAO = 'Cartao-BB';

const PARSE = vi.hoisted(() => ({ resultado: null as unknown }));
vi.mock('@/v2/lib/excelPreview/parserClassificacao', () => ({
  parseExcelClassificacao: async () => PARSE.resultado,
}));
const POPULADAS = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('@/v2/hooks/useClassificacaoStaging', () => ({
  useClassificacaoStaging: () => ({
    populate: async ({ rows }: { rows: Array<Record<string, unknown>> }) => {
      POPULADAS.rows = rows;
      return { sessao_id: 's', total_linhas: rows.length, inseridas: rows.length, counts_por_status: {} };
    },
    isPopulating: false,
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: () => undefined }) }));

import { useImportarClassificacao, mapaContasDoGesto, resolucoesPelaMemoria } from './useImportarClassificacao';

function linha(n: number, conta: string): ClassificacaoExcelRow {
  return {
    linha: n, subcentro: 'Folha', fornecedor: null, produto: null, conta_origem: conta, conta_destino: null,
    ano_mes: '2026-09', data: '2026-09-01', data_pagamento: '2026-09-04', data_vencimento: null, valor: 100 + n,
    tipo_operacao: '2-Saídas', fazenda_codigo: null, observacao: null, documento: null,
  };
}
const LOTE: ClassificacaoParseResult = {
  rows: [linha(2, BB), linha(3, BB), linha(4, SL), linha(5, CARTAO)],
  totalLinhas: 4, linhasValidas: 4, linhasComErro: 0, erros: [],
};
/* Catálogo da memória: o apelido é a camada que resolve com certeza (a de `resolverContaPorTexto`). */
const conta = (id: string, nome: string, aliases: string[]): ContaResolvivel => ({
  id, nome_conta: nome, nome_exibicao: nome, banco: null, agencia: null, numero_conta: null, aliases,
});
const CATALOGO = [conta('bb', 'Banco do Brasil', [BB]), conta('sl', 'Sicredi Lavoura', [SL])];

beforeEach(() => { PARSE.resultado = LOTE; POPULADAS.rows = []; });

async function comLote() {
  const h = renderHook(() => useImportarClassificacao('nj'));
  await act(async () => { await h.result.current.selecionarArquivo(new File(['x'], 'nj-set26.xlsx')); });
  return h;
}
const contaDe = (n: number) => POPULADAS.rows.find((r) => r.linha === n)?.conta_origem_id;

describe('popular grava a conta do de-para — na MESMA chamada', () => {
  it('as respostas do passo 1 chegam ao staging sem esperar renderização (o defeito da sessão b6955356)', async () => {
    const h = await comLote();
    await act(async () => {
      await h.result.current.popular({ deParaConta: { [BB]: { valor: 'bb' }, [SL]: { valor: 'sl' } } });
    });
    expect([contaDe(2), contaDe(3), contaDe(4)]).toEqual(['bb', 'bb', 'sl']);
  });

  it('texto sem resposta (Cartao-BB) vai sem conta — ele segue pendente no passo 1, não some', async () => {
    const h = await comLote();
    await act(async () => {
      await h.result.current.popular({ deParaConta: { [BB]: { valor: 'bb' }, [CARTAO]: { valor: null } } });
    });
    expect(contaDe(5)).toBeNull();
  });

  it('a memória (apelido) resolve o que o de-para deixou pendente; a resposta do operador vence a memória', async () => {
    const h = await comLote();
    await act(async () => {
      await h.result.current.popular({
        deParaConta: { [BB]: { valor: 'outra-conta' }, [SL]: { valor: null } },
        contasMemoria: CATALOGO,
      });
    });
    expect(contaDe(2)).toBe('outra-conta'); // operador > memória
    expect(contaDe(4)).toBe('sl');          // pendente no de-para, resolvida pela memória
    expect(contaDe(5)).toBeNull();          // nem de-para nem memória
  });

  it('descartado no passo 1 vai sem conta (ignorar), e a memória não o ressuscita', async () => {
    const h = await comLote();
    await act(async () => {
      await h.result.current.popular({ deParaConta: { [SL]: { valor: null, descartado: true } }, contasMemoria: CATALOGO });
    });
    expect(contaDe(4)).toBeNull();
    expect(contaDe(2)).toBe('bb'); // a memória segue valendo para quem não foi descartado
  });

  it('sem parâmetro, o comportamento de antes: o que já estava no estado', async () => {
    const h = await comLote();
    act(() => { h.result.current.resolverConta(BB, { contaId: 'bb' }); });
    await act(async () => { await h.result.current.popular(); });
    expect(contaDe(2)).toBe('bb');
    expect(contaDe(4)).toBeNull();
  });
});

describe('as funções puras', () => {
  const distintas = [BB, SL, CARTAO].map((texto) => ({ texto, qtd: 1, exemplo: linha(2, texto), primeiraData: null, soma: 0 }));
  it('resolucoesPelaMemoria: só o que resolve com certeza, sem sobrescrever quem já respondeu', () => {
    const r = resolucoesPelaMemoria(distintas, { [BB]: { textoExcel: BB, contaId: 'x' } }, CATALOGO);
    expect(Object.keys(r)).toEqual([SL]);
    expect(r[SL].contaId).toBe('sl');
  });
  it('mapaContasDoGesto: memória < estado < de-para', () => {
    const m = mapaContasDoGesto(distintas, { [SL]: { textoExcel: SL, contaId: 'estado' } }, { [BB]: { valor: 'dp' } }, CATALOGO);
    expect(m[BB].contaId).toBe('dp');
    expect(m[SL].contaId).toBe('estado');
    expect(m[CARTAO]).toBeUndefined();
  });
  it('a mesma conta respondida no estado E no de-para: vale a do de-para (a resposta do passo 1 é a mais nova)', () => {
    const m = mapaContasDoGesto(distintas, { [BB]: { textoExcel: BB, contaId: 'estado' } }, { [BB]: { valor: 'dp' } });
    expect(m[BB].contaId).toBe('dp');
  });
});
