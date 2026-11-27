/**
 * NOTAS-RECEITA-SEM-LANCAMENTO-01 — a classe da nota pelos casos da FASE 0 do NJ (18/11). Sintético nos números.
 */
import { describe, expect, it } from 'vitest';
import { classeDaNota, ehBemDeTerceiro } from './classeDaNota';

const n = (cfops: string[], tpNF = '1', natOp = 'VENDA') => ({ cfops, tpNF, natOp });

describe('classeDaNota — pelo CFOP, nunca pelo tPag 90 sozinho', () => {
  it('o comodato (a Unipetro 117.573, 5908) não gera lançamento e é bem de terceiro', () => {
    const c = classeDaNota(n(['5908'], '1', 'REMESSA BEM P/CONTA CONTR COMODATO'), false);
    expect(c).toEqual({ classe: 'nao_financeira', motivo: 'comodato' });
    expect(ehBemDeTerceiro(c)).toBe(true);
  });
  it('entrega futura: a REMESSA (5116/5117/6116) não gera; o FATURAMENTO (5922/6922) é compra', () => {
    for (const cf of ['5116', '5117', '6116']) expect(classeDaNota(n([cf]), false)).toEqual({ classe: 'nao_financeira', motivo: 'entrega_futura' });
    expect(classeDaNota(n(['5922'], '1', 'SIMPLES FAT. DE VENDA P/ ENTREGA FUTURA'), false)).toEqual({ classe: 'compra' });
  });
  it('a NF referente a cupom (5929) é compra; a nota de débito de juros (5949 "DEBITO") é compra; a garantia (5949) não gera', () => {
    expect(classeDaNota(n(['5929']), false).classe).toBe('compra');
    expect(classeDaNota(n(['5949'], '1', 'NOTA DE DEBITO MULTA E JUROS IBS E CBS'), false).classe).toBe('compra');
    expect(classeDaNota(n(['5949'], '1', 'SUBSTITUICAO DE MERCADORIA EM GARANTIA'), false)).toEqual({ classe: 'nao_financeira', motivo: 'garantia' });
  });
  /* NOTA-ENTREGA-FUTURA-01 (Gabriel 25/11 07:24): serviço que cobra NÃO é remessa — 5932/6932 (transporte de outra UF) e 5933/6933 (ISS)
     geram; o resto do 59xx/69xx segue remessa (o controle: 5920 vasilhame, 5904 retorno de venda fora) */
  it('serviço 5932/5933/6932/6933 é compra; 5920 e 5904 seguem remessa', () => {
    for (const cf of ['5932', '5933', '6932', '6933']) expect(classeDaNota(n([cf]), false).classe, cf).toBe('compra');
    for (const cf of ['5920', '6920', '5904']) expect(classeDaNota(n([cf]), false), cf).toEqual({ classe: 'nao_financeira', motivo: 'outra_remessa' });
  });
  it('venda comum (5102) é compra — mesmo com tPag 90 (não entra na regra)', () => {
    expect(classeDaNota(n(['5102']), false)).toEqual({ classe: 'compra' });
    expect(classeDaNota(n(['5405', '5102']), false)).toEqual({ classe: 'compra' });
  });
  it('bonificação (6910) e devolução (1202) não geram', () => {
    expect(classeDaNota(n(['6910']), false)).toEqual({ classe: 'nao_financeira', motivo: 'bonificacao' });
    expect(classeDaNota(n(['1202'], '0'), false)).toEqual({ classe: 'nao_financeira', motivo: 'devolucao' });
  });
  it('NF de ENTRADA do comprador (tpNF 0, 2101 "compra p/ industrialização") = venda do titular, não compra', () => {
    expect(classeDaNota(n(['2101'], '0', 'COMPRA PARA INDUSTRIALIZACAO'), false)).toEqual({ classe: 'venda_do_titular' });
  });
  it('NOTA-DEMONSTRACAO-01: a demonstração (5912/6912) é bem de terceiro; o RETORNO (5913/6913 e a entrada do fornecedor 1913/2913) fecha', () => {
    for (const cf of ['5912', '6912']) {
      const c = classeDaNota(n([cf], '1', 'DEMONSTACAO FORA DO ESTADO'), false);
      expect(c).toEqual({ classe: 'nao_financeira', motivo: 'demonstracao' });
      expect(ehBemDeTerceiro(c)).toBe(true);
    }
    for (const cf of ['5913', '6913', '1913', '2913']) {
      const c = classeDaNota(n([cf], cf.startsWith('1') || cf.startsWith('2') ? '0' : '1', 'RETORNO DE DEMONSTRACAO'), false);
      expect(c).toEqual({ classe: 'nao_financeira', motivo: 'retorno_demonstracao' });
      expect(ehBemDeTerceiro(c)).toBe(false);
    }
  });
  it('cancelada na Receita manda sobre tudo; sem CFOP (resumo) = compra (a classe só muda com o XML)', () => {
    expect(classeDaNota(n(['5908']), true)).toEqual({ classe: 'cancelada' });
    expect(classeDaNota({ cfops: [], tpNF: null, natOp: null }, false)).toEqual({ classe: 'compra' });
  });
});
