import { describe, it, expect } from 'vitest';
import { avaliarLinha, contarPendentes, type DeParaCompleto, type DeParaMap } from './importLancamentosView';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';

/**
 * O que este teste protege — B-40 itens 1a e 6.
 *
 * ⚠ NOVE VALORES SEGURAVAM 409 LINHAS. A linha sem classificação passou a
 * ENTRAR, e há dois caminhos para isso: a célula vazia (o cliente não informou)
 * e a decisão explícita do operador sobre um valor. Confundir os dois faz a
 * importação entrar crua em silêncio — o oposto do que o de-para existe para
 * evitar — ou faz a célula vazia virar pendência, contrariando o modelo.
 */

const FAZ = 'faz-1';

/**
 * ⚠ `valor` POSITIVO É A FORMA CERTA AQUI, e por um motivo diferente do banco:
 * esta não é a linha da TABELA, é a linha da PLANILHA. `LancamentoExcelRow.valor`
 * é documentado como "sempre absoluto (positivo)" no parser, que normaliza na
 * leitura; o sentido vem de `tipo_operacao`. Conferido em FIXTURES-VS-BANCO-01:
 * o fixture casa com o contrato do parser, e não precisou mudar.
 */
const linha = (over: Partial<LancamentoExcelRow>): LancamentoExcelRow => ({
  linha: 2, data_competencia: '2026-08-01', valor: 100, tipo_operacao: '2-Saídas',
  conta_plano_texto: 'COMBUSTIVEL', fazenda_texto: 'SR', fornecedor_texto: 'POSTO',
  conta_bancaria_texto: 'Itau', data_vencimento: null, data_pagamento: '2026-08-10',
  descricao: null, numero_documento: null, tipo_documento: null, forma_pagamento: null,
  observacao: null, status: null, safra_texto: null, id_lancamento: null,
  ...over,
} as LancamentoExcelRow);

const mapa = (o: Partial<Record<string, unknown>> = {}): DeParaMap => o as DeParaMap;

const dp = (sub: DeParaMap): DeParaCompleto => ({
  subcentro: sub,
  fazenda: mapa({ SR: { texto: 'SR', qtd: 1, valor: FAZ, origem: 'cadastro', rotulo: 'Santa Rita' } }),
  fornecedor: {}, conta: {}, safra: {},
} as DeParaCompleto);

const avaliar = (row: LancamentoExcelRow, sub: DeParaMap) =>
  avaliarLinha(row, dp(sub), new Set(), null, null, null, false, 0, undefined, null);

describe('a linha crua entra — B-40 item 1a', () => {
  it('conta mapeada: entra classificada, como sempre', () => {
    const r = avaliar(linha({}), mapa({
      COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: 'Diesel', origem: 'manual', rotulo: 'Diesel' },
    }));
    expect(r.entra).toBe(true);
    expect(r.subcentro).toBe('Diesel');
  });

  /* ⚠ O DEFEITO ORIGINAL: texto presente, não mapeado → fica de fora. Continua
     ficando, e tem de continuar: há o que perguntar. */
  it('texto presente e NÃO mapeado continua de fora', () => {
    const r = avaliar(linha({}), mapa({
      COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: null, origem: 'pendente', rotulo: null },
    }));
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('subcentro_nao_resolvido');
  });

  it('marcado "sem classificação" pelo operador: ENTRA, sem subcentro', () => {
    const r = avaliar(linha({}), mapa({
      COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: null, origem: 'pendente', rotulo: null, semClassificacao: true },
    }));
    expect(r.entra).toBe(true);
    expect(r.subcentro).toBeNull();
  });

  /* ⚠ A PROMESSA DO MODELO — item 6. Célula vazia não gera item no de-para, e
     por isso precisa de caminho próprio: sem ele, a instrução mentiria. */
  it('célula VAZIA entra crua, sem precisar de decisão nenhuma', () => {
    expect(avaliar(linha({ conta_plano_texto: null }), {}).entra).toBe(true);
    expect(avaliar(linha({ conta_plano_texto: '   ' }), {}).entra).toBe(true);
    expect(avaliar(linha({ conta_plano_texto: null }), {}).subcentro).toBeNull();
  });

  /* ⚠ DESCARTAR CONTINUA JOGANDO FORA. É a diferença entre as duas saídas, e
     confundi-las levaria as linhas junto — o defeito que originou o item. */
  it('descartado continua de fora, com motivo próprio', () => {
    const r = avaliar(linha({}), mapa({
      COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: null, origem: 'pendente', rotulo: null, descartado: true },
    }));
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('campo_obrigatorio_descartado');
  });

  it('sem fazenda a linha continua fora — "sem classificação" não afrouxa o resto', () => {
    const r = avaliarLinha(
      linha({ fazenda_texto: 'XX' }),
      dp(mapa({ COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: null, origem: 'pendente', rotulo: null, semClassificacao: true } })),
      new Set(), null, null, null, false, 0, undefined, null);
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('fazenda_nao_resolvida');
  });
});

describe('contarPendentes — decisão tomada não é pendência', () => {
  const comp = (sub: DeParaMap): DeParaCompleto => dp(sub);

  it('pendente de verdade conta', () => {
    expect(contarPendentes(comp(mapa({
      A: { texto: 'A', qtd: 1, valor: null, origem: 'pendente', rotulo: null },
    }))).subcentro).toBe(1);
  });

  it('descartado e "sem classificação" NÃO contam', () => {
    expect(contarPendentes(comp(mapa({
      A: { texto: 'A', qtd: 1, valor: null, origem: 'pendente', rotulo: null, descartado: true },
      B: { texto: 'B', qtd: 1, valor: null, origem: 'pendente', rotulo: null, semClassificacao: true },
    }))).subcentro).toBe(0);
  });
});
