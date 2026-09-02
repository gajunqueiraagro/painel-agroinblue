import { describe, it, expect } from 'vitest';
import {
  casarLinhasSemId, chaveCasamento, dataDoCasamento,
  type CandidatoCasamento,
} from './importLancamentosView';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';
import type { DeParaCompleto } from './importLancamentosView';

/**
 * O que este teste protege — B-41.
 *
 * ⚠ ESTA RÉGUA DECIDE SE DINHEIRO DUPLICA. Errar para o lado frouxo faz uma
 * linha atualizar o lançamento errado; errar para o lado apertado faz o arquivo
 * do cliente criar um segundo mês inteiro. Nenhum dos dois aparece na hora — os
 * dois aparecem no fechamento.
 *
 * ⚠ E O CASAMENTO É INFERÊNCIA, não declaração. É por isso que ambíguo existe:
 * na dúvida ele NÃO escolhe. Cada caso abaixo que espera 'ambiguo' é um caso em
 * que chutar teria passado despercebido.
 */

const CONTA_A = 'conta-aaa';
const CONTA_B = 'conta-bbb';

/** Uma linha de planilha com o mínimo que o casamento olha. */
const linha = (over: Partial<LancamentoExcelRow>): LancamentoExcelRow => ({
  linha: 2, data_competencia: '2026-08-01', valor: 100, tipo_operacao: '2-Saídas',
  conta_plano_texto: 'COMBUSTIVEL', fazenda_texto: 'SR', fornecedor_texto: 'POSTO',
  conta_bancaria_texto: 'Itau', data_vencimento: null, data_pagamento: '2026-08-10',
  descricao: null, numero_documento: null, tipo_documento: null, forma_pagamento: null,
  observacao: null, status: null, safra_texto: null, id_lancamento: null,
  ...over,
} as LancamentoExcelRow);

const cand = (over: Partial<CandidatoCasamento>): CandidatoCasamento => ({
  id: 'l1', contaBancariaId: CONTA_A, valor: 100, data: '2026-08-10',
  travado: false, subcentroAtual: null, descricaoAtual: null, safraAtual: null,
  ...over,
});

/** De-para com a conta "Itau" resolvida, que é o que o casamento consome. */
const dp = (contaResolvida: string | null = CONTA_A): DeParaCompleto => ({
  subcentro: {}, fazenda: {}, fornecedor: {}, safra: {},
  conta: contaResolvida
    ? { Itau: { texto: 'Itau', qtd: 1, valor: contaResolvida, origem: 'cadastro', rotulo: 'Itaú' } }
    : {},
} as DeParaCompleto);

describe('chaveCasamento — faltar peça é NÃO casar', () => {
  it('monta a chave com valor absoluto e duas casas', () => {
    expect(chaveCasamento(CONTA_A, -100.005, '2026-08-10')).toBe(`${CONTA_A}|100.01|2026-08-10`);
    expect(chaveCasamento(CONTA_A, 100, '2026-08-10T03:00:00')).toBe(`${CONTA_A}|100.00|2026-08-10`);
  });

  it('sem conta, sem data ou com valor zero não há chave', () => {
    expect(chaveCasamento(null, 100, '2026-08-10')).toBeNull();
    expect(chaveCasamento(CONTA_A, 100, null)).toBeNull();
    expect(chaveCasamento(CONTA_A, 0, '2026-08-10')).toBeNull();
  });
});

describe('dataDoCasamento — pagamento, vencimento como recurso', () => {
  it('prefere o pagamento', () => {
    expect(dataDoCasamento(linha({ data_pagamento: '2026-08-10', data_vencimento: '2026-08-05' })))
      .toBe('2026-08-10');
  });
  it('cai no vencimento quando não há pagamento', () => {
    expect(dataDoCasamento(linha({ data_pagamento: null, data_vencimento: '2026-08-05' })))
      .toBe('2026-08-05');
  });
  it('sem nenhuma das duas, não oferece data', () => {
    expect(dataDoCasamento(linha({ data_pagamento: null, data_vencimento: null }))).toBeNull();
  });
});

describe('casarLinhasSemId', () => {
  it('par único dos dois lados casa', () => {
    const r = casarLinhasSemId([linha({})], dp(), [cand({})]);
    expect(r.get(0)).toMatchObject({ id: 'l1' });
  });

  /* ⚠ O CASO REAL DA HOMOLOGAÇÃO: dois boletos iguais no mesmo dia. */
  it('dois candidatos iguais → ambíguo, nunca escolhe', () => {
    const r = casarLinhasSemId([linha({})], dp(), [cand({ id: 'l1' }), cand({ id: 'l2' })]);
    expect(r.get(0)).toBe('ambiguo');
  });

  it('duas linhas iguais disputando um candidato → ambíguo nas duas', () => {
    const r = casarLinhasSemId([linha({}), linha({ linha: 3 })], dp(), [cand({})]);
    expect(r.get(0)).toBe('ambiguo');
    expect(r.get(1)).toBe('ambiguo');
  });

  it('sem par não entra no mapa — a linha segue para criação', () => {
    const r = casarLinhasSemId([linha({ valor: 999 })], dp(), [cand({})]);
    expect(r.has(0)).toBe(false);
  });

  it('data diferente não casa — a régua não tem tolerância', () => {
    const r = casarLinhasSemId([linha({ data_pagamento: '2026-08-11' })], dp(), [cand({})]);
    expect(r.has(0)).toBe(false);
  });

  it('conta diferente não casa, mesmo com valor e data iguais', () => {
    const r = casarLinhasSemId([linha({})], dp(), [cand({ contaBancariaId: CONTA_B })]);
    expect(r.has(0)).toBe(false);
  });

  /* ⚠ Sem o de-para de conta resolvido não há chave: o casamento só acontece
     depois de o operador mapear a conta, e antes disso não chuta. */
  it('conta não resolvida no de-para não casa', () => {
    const r = casarLinhasSemId([linha({})], dp(null), [cand({})]);
    expect(r.has(0)).toBe(false);
  });

  /* ⚠ ID VENCE CASAMENTO: declaração do operador sobrepõe inferência nossa. */
  it('linha COM id não participa do casamento', () => {
    const r = casarLinhasSemId([linha({ id_lancamento: 'outro' })], dp(), [cand({})]);
    expect(r.size).toBe(0);
  });

  /* ⚠ E o lançamento reclamado por ID sai da mesa: senão duas linhas do mesmo
     arquivo atualizariam o mesmo lançamento, a segunda por cima da primeira. */
  it('candidato já reclamado por ID não é oferecido a uma linha sem id', () => {
    const r = casarLinhasSemId(
      [linha({ linha: 2, id_lancamento: 'l1' }), linha({ linha: 3 })],
      dp(), [cand({ id: 'l1' })]);
    expect(r.has(1)).toBe(false);
  });

  it('candidato sem data nunca casa', () => {
    const r = casarLinhasSemId([linha({})], dp(), [cand({ data: null })]);
    expect(r.has(0)).toBe(false);
  });

  it('o sinal do lançamento não impede o casamento — a chave usa o módulo', () => {
    const r = casarLinhasSemId([linha({ valor: 100 })], dp(), [cand({ valor: -100 })]);
    expect(r.get(0)).toMatchObject({ id: 'l1' });
  });
});
