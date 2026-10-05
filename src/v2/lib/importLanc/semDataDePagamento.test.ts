import { describe, it, expect } from 'vitest';
import {
  avaliarLinha, montarPrevia, fraseDoMotivoNaPrevia, MOTIVO_LABEL,
  type DeParaCompleto, type DeParaMap,
} from './importLancamentosView';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';

/**
 * FIN-IMPORT-EXCEL-STATUS-01a — a linha sem data de pagamento aparece na prévia, com o motivo, e NÃO ENTRA.
 * A decisão é de `statusParaImportar`; aqui se prova que a prévia a obedece e o que ela conta.
 */
const FAZ = 'faz-1';
const linha = (over: Partial<LancamentoExcelRow>): LancamentoExcelRow => ({
  linha: 2, data_competencia: '2026-10-01', valor: 100, tipo_operacao: '2-Saídas',
  conta_plano_texto: 'COMBUSTIVEL', fazenda_texto: 'SR', fornecedor_texto: null,
  conta_bancaria_texto: null, data_vencimento: '2026-10-10', data_pagamento: '2026-10-05',
  descricao: 'Diesel', numero_documento: null, tipo_documento: null, forma_pagamento: null,
  observacao: null, status: null, safra_texto: null, id_lancamento: null,
  ...over,
} as LancamentoExcelRow);
const mapa = (o: Partial<Record<string, unknown>> = {}): DeParaMap => o as DeParaMap;
const dp = (fazendaResolvida = true): DeParaCompleto => ({
  subcentro: mapa({ COMBUSTIVEL: { texto: 'COMBUSTIVEL', qtd: 1, valor: 'Diesel', origem: 'manual', rotulo: 'Diesel' } }),
  fazenda: mapa({ SR: { texto: 'SR', qtd: 1, valor: fazendaResolvida ? FAZ : null, origem: fazendaResolvida ? 'cadastro' : 'pendente', rotulo: fazendaResolvida ? 'Santa Rita' : null } }),
  fornecedor: {}, conta: {}, safra: {},
} as DeParaCompleto);
const avaliar = (row: LancamentoExcelRow, opts: { veste?: boolean; alvos?: Map<string, { id: string; travado: boolean }>; dpx?: DeParaCompleto; fechados?: Set<string> } = {}) =>
  avaliarLinha(row, opts.dpx ?? dp(), opts.fechados ?? new Set(), null, null, null, false, 0,
    opts.alvos as never, null, opts.veste);

describe('a linha da planilha e a data de pagamento', () => {
  it('com data: entra, e o status que vai gravar é realizado', () => {
    const r = avaliar(linha({}));
    expect(r.entra).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.statusAGravar).toBe('realizado');
  });
  it('sem data: fica de fora com o motivo, e não grava status nenhum', () => {
    const r = avaliar(linha({ data_pagamento: null }));
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('sem_data_pagamento');
    expect(r.statusAGravar).toBeNull();
  });
  it('"pago" na coluna Status sem data: fica de fora do mesmo jeito', () => {
    const r = avaliar(linha({ data_pagamento: null, status: 'realizado' }));
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('sem_data_pagamento');
  });
  it('"a pagar" com data: fica de fora com o motivo próprio', () => {
    const r = avaliar(linha({ status: 'previsto' }));
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('a_pagar_com_data');
    expect(r.statusAGravar).toBeNull();
  });
  /* A contagem "N sem data" é a da planilha: o de-para pendente e o mês fechado não a roubam. */
  it('sem data vem ANTES de fazenda não resolvida e de mês fechado', () => {
    expect(avaliar(linha({ data_pagamento: null }), { dpx: dp(false) }).motivo).toBe('sem_data_pagamento');
    expect(avaliar(linha({ data_pagamento: null }), { fechados: new Set([`${FAZ}|2026-10`]) }).motivo).toBe('sem_data_pagamento');
    /* e a prova de que a busca sabe achar os outros dois: COM data, eles aparecem */
    expect(avaliar(linha({}), { dpx: dp(false) }).motivo).toBe('fazenda_nao_resolvida');
    expect(avaliar(linha({}), { fechados: new Set([`${FAZ}|2026-10`]) }).motivo).toBe('mes_fechado');
  });
  /* Atualizar por ID com uma linha sem data gravaria realizado sem pagamento num lançamento que já existe. */
  it('vale também para a linha que ATUALIZA por ID', () => {
    const alvos = new Map([['abc', { id: 'abc', travado: false }]]);
    const r = avaliar(linha({ id_lancamento: 'abc', data_pagamento: null }), { alvos });
    expect(r.modo).toBe('atualizar');
    expect(r.entra).toBe(false);
    expect(r.motivo).toBe('sem_data_pagamento');
    expect(avaliar(linha({ id_lancamento: 'abc' }), { alvos }).entra).toBe(true);
  });
  it('no modo veste a linha sem par continua dizendo "sem par no extrato"', () => {
    expect(avaliar(linha({ data_pagamento: null }), { veste: true }).motivo).toBe('sem_par_no_extrato');
  });
  it('linha que fica de fora por outro motivo não promete status', () => {
    expect(avaliar(linha({ tipo_operacao: '3-Transferências' })).statusAGravar).toBeNull();
  });
});

describe('a prévia conta as recusadas e soma o valor delas', () => {
  const rows = [
    linha({ linha: 2, valor: 10 }),
    linha({ linha: 3, valor: 20 }),
    linha({ linha: 4, valor: 30.5 }),
    linha({ linha: 5, valor: 1000, data_pagamento: null }),
    linha({ linha: 6, valor: 2000.25, data_pagamento: null, status: 'realizado' }),
  ];
  const p = montarPrevia(rows, dp(), new Set(), null, null);
  it('3 entram, 2 ficam de fora por falta de data, com a soma', () => {
    expect(p.totais.entram).toEqual({ qtd: 3, valor: 60.5 });
    expect(p.totais.ficamDeFora).toEqual({ qtd: 2, valor: 3000.25 });
    expect(p.totais.porMotivo).toEqual([{ motivo: 'sem_data_pagamento', qtd: 2, valor: 3000.25 }]);
    expect(p.linhas.map((l) => l.statusAGravar)).toEqual(['realizado', 'realizado', 'realizado', null, null]);
  });
  it('a frase do bloco de totais diz a contagem e o porquê', () => {
    expect(fraseDoMotivoNaPrevia('sem_data_pagamento', 226))
      .toBe('226 linhas sem data de pagamento não serão importadas — previsão do mês ainda não entra por esta tela.');
    expect(fraseDoMotivoNaPrevia('sem_data_pagamento', 1))
      .toBe('1 linha sem data de pagamento não será importada — previsão do mês ainda não entra por esta tela.');
    expect(fraseDoMotivoNaPrevia('a_pagar_com_data', 2))
      .toBe('2 linhas "a pagar" com data de pagamento não serão importadas — previsão do mês ainda não entra por esta tela.');
  });
  it('os demais motivos seguem com o rótulo de sempre', () => {
    expect(fraseDoMotivoNaPrevia('mes_fechado', 3)).toBe(MOTIVO_LABEL.mes_fechado);
  });
  it('planilha só com datas: nenhuma linha recusada, todas realizado', () => {
    const q = montarPrevia(rows.slice(0, 3), dp(), new Set(), null, null);
    expect(q.totais.ficamDeFora.qtd).toBe(0);
    expect(q.linhas.every((l) => l.entra && l.statusAGravar === 'realizado')).toBe(true);
  });
});
