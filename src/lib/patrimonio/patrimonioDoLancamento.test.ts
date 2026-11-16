/** LANC-PATRIMONIO-VINCULO-01 — as regras do "Patrimônio" no rodapé do Editar lançamento (D1–D5 do mock v1). */
import { describe, it, expect } from 'vitest';
import {
  atividadeDaConta, bensParaLigar, categoriaSugerida, comOContrato, contaPedeFinanciamento, contaPedePatrimonio, estadoDoBotao,
  fraseDaPrevia, itensParaLigar, motivoDoPrevisto, previaDeixaGravar, tituloDoSemBem, FRASE_LIGA_QUANDO_PAGO,
  type CategoriaComContas, type ParteDoLancamento, type PatrimonioDoLancamentoLido,
} from './patrimonioDoLancamento';
import { n2, type BemDaLista } from './patrimonio';
import type { PreviaLigar } from './patrimonioApi';

const parte = (o: Partial<ParteDoLancamento> = {}): ParteDoLancamento => ({
  parte_ordem: 1, partes_total: 1, valor: 3480, plano_conta_id: 'c-inst', macro_custo: 'Investimento na Fazenda', centro_custo: 'Pecuária',
  subcentro: 'Investimento em Instalações Pecuária', escopo_negocio: 'pecuaria', status_transacao: 'realizado', cancelado: false, fazenda_id: 'f1',
  data_pagamento: '2026-11-08', data_competencia: '2026-11-08', descricao: 'Inversor', de_contrato: false, ...o,
});
const lido = (partes: ParteDoLancamento[], vinculos: PatrimonioDoLancamentoLido['vinculos'] = []): PatrimonioDoLancamentoLido => ({ partes, vinculos });
const previa = (o: Partial<PreviaLigar> = {}): PreviaLigar => ({ ok: true, soma: 3480, n_ligar: 1, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [], ...o });
const bem = (o: Partial<BemDaLista>): BemDaLista => ({
  bem_id: 'b', fazenda_id: 'f1', fazenda_codigo: 'FAZ-A', categoria_id: 'k-ins', categoria_codigo: 'instalacoes', categoria_nome: 'Instalações', deprecia: true,
  tem_mercado: false, tem_pastos: false, codigo: 'INS-001', descricao: 'Bem', marca: null, modelo: null, identificacao: null, numero_proprio: null, placa: null,
  chassi: null, numero_serie: null, renavam: null, situacao: 'em_uso', em_uso_desde: null, baixado_em: null, atividade: 'pecuaria', origem_valor: 'lancamentos',
  valor_extra: 0, valor_lancamentos: 0, aquisicao: 100, a_realizar: 0, n_lancamentos: 1, n_a_realizar: 0, n_a_conferir: 0, n_selo: 0, n_repetidas: 0,
  primeira_data: null, vida_util_meses: 240, residual_pct: 0, depreciacao_acumulada: 0, depreciacao_no_ano: 0, valor_contabil: 0, mercado_valor: null,
  mercado_data: null, mercado_base: null, area_pastos_ha: null, versao: 1, ...o,
});

describe('D1 — onde aparece "Patrimônio"', () => {
  it('Investimento na Fazenda fora do RH: sim; RH e outros macros: não', () => {
    expect(contaPedePatrimonio({ macro_custo: 'Investimento na Fazenda', centro_custo: 'Pecuária' })).toBe(true);
    expect(contaPedePatrimonio({ macro_custo: 'Investimento na Fazenda', centro_custo: 'RH' })).toBe(false);
    expect(contaPedePatrimonio({ macro_custo: 'Custeio Produção', centro_custo: 'Pecuária' })).toBe(false);
    expect(contaPedePatrimonio(null)).toBe(false);
  });
  it('o estado do rodapé: sem bem / ligado / nada (cancelado, conta comum, RH)', () => {
    expect(estadoDoBotao(lido([parte()])).tipo).toBe('sem_bem');
    expect(estadoDoBotao(lido([parte()], [{ bem_id: 'b1', codigo: 'IMP-014', descricao: 'Roçadeira', parte_ordem: 1 }]))).toEqual(
      { tipo: 'ligado', vinculos: [{ bem_id: 'b1', codigo: 'IMP-014', descricao: 'Roçadeira', parte_ordem: 1 }], faltam: 0 });
    expect(estadoDoBotao(lido([parte({ cancelado: true })])).tipo).toBe('nada');
    expect(estadoDoBotao(lido([parte({ macro_custo: 'Custeio Produção' })])).tipo).toBe('nada');
    expect(estadoDoBotao(lido([parte({ centro_custo: 'RH' })])).tipo).toBe('nada');
    expect(estadoDoBotao(null).tipo).toBe('nada');
  });
  it('dividido: liga só a PARTE de investimento sem vínculo', () => {
    const l = lido([parte({ parte_ordem: 1, partes_total: 2 }), parte({ parte_ordem: 2, partes_total: 2, macro_custo: 'Custeio Produção' })]);
    expect(itensParaLigar(l, 'L1')).toEqual([{ lancamento_id: 'L1', parte_ordem: 1 }]);
    const ligada = lido([parte({ parte_ordem: 1, partes_total: 2 }), parte({ parte_ordem: 2, partes_total: 2 })], [{ bem_id: 'b', codigo: 'X', descricao: '', parte_ordem: 1 }]);
    expect(itensParaLigar(ligada, 'L1')).toEqual([{ lancamento_id: 'L1', parte_ordem: 2 }]);
    expect(estadoDoBotao(ligada)).toMatchObject({ tipo: 'ligado', faltam: 1 });
  });
});

describe('D3 — "Financiamento" (vincular) só nas contas de financiamento', () => {
  it.each([
    ['Juros de Financiamento Pecuária', true], ['Amortização Financiamento Agricultura', true], ['Consórcio a contemplar', true],
    ['Entrada de Financiamento Silvicultura', true], ['Despesas Financeiras Administrativo', true],
    ['Investimento em Instalações Pecuária', false], ['Vacinas e Vermífugos', false], [null, false],
  ])('%s → %s', (s, esperado) => { expect(contaPedeFinanciamento(s)).toBe(esperado); });
});

describe('D2 — previsto liga quando pago (exceto parcela de contrato)', () => {
  it('previsto comum: o motivo; realizado/conciliado e parcela de contrato: nada', () => {
    expect(motivoDoPrevisto([parte({ status_transacao: 'previsto' })])).toBe(FRASE_LIGA_QUANDO_PAGO);
    expect(motivoDoPrevisto([parte({ status_transacao: 'agendado' })])).toBe(FRASE_LIGA_QUANDO_PAGO);
    expect(motivoDoPrevisto([parte({ status_transacao: 'realizado' })])).toBeNull();
    expect(motivoDoPrevisto([parte({ status_transacao: 'conciliado' })])).toBeNull();
    expect(motivoDoPrevisto([parte({ status_transacao: 'previsto', de_contrato: true })])).toBeNull();
  });
});

describe('a categoria e a lista de bens', () => {
  const cats: CategoriaComContas[] = [
    { id: 'k-ins', cliente_id: null, codigo: 'instalacoes', nome: 'Instalações', vida_util_anos: 20, residual_pct: 0, deprecia: true, tem_mercado: false,
      base_mercado: null, tem_pastos: false, ordem: 1, ativo: true, prefixo: 'INS', contas_sugeridas: ['c-inst'] },
  ];
  it('sugerida pela conta; conta sem sugestão = nula (nunca chutada)', () => {
    expect(categoriaSugerida(cats, 'c-inst')?.codigo).toBe('instalacoes');
    expect(categoriaSugerida(cats, 'c-solo')).toBeNull();
    expect(categoriaSugerida(cats, null)).toBeNull();
  });
  it('primeiro a mesma categoria E fazenda, depois a categoria, depois a fazenda; baixado fora; busca sem acento', () => {
    const bs = [bem({ bem_id: 'x', categoria_id: 'k-eqp', fazenda_id: 'f2', codigo: 'EQP-007' }), bem({ bem_id: 'y', categoria_id: 'k-eqp', fazenda_id: 'f1' }),
      bem({ bem_id: 'z', categoria_id: 'k-ins', fazenda_id: 'f2' }), bem({ bem_id: 'w', categoria_id: 'k-ins', fazenda_id: 'f1' }),
      bem({ bem_id: 'v', situacao: 'baixado' })];
    expect(bensParaLigar(bs, 'k-ins', 'f1', '').map((b) => b.bem_id)).toEqual(['w', 'z', 'y', 'x']);
    expect(bensParaLigar([bem({ descricao: 'Curral de manejo' })], null, null, 'CURRAL').length).toBe(1);
    expect(bensParaLigar([bem({ descricao: 'Inversor solar' })], null, null, 'inversôr').length).toBe(1);
  });
  it('a atividade pela conta', () => {
    expect(atividadeDaConta('pecuaria', null)).toBe('pecuaria');
    expect(atividadeDaConta(null, 'Investimento em Máquinas Agricultura')).toBe('lavoura');
    expect(atividadeDaConta('administrativo', 'Investimento Administrativo')).toBe('compartilhado');
  });
});

describe('a prévia do banco', () => {
  it('deixa gravar só limpa: recusa, contrato faltando, repetida sem confirmação, ok=false param', () => {
    expect(previaDeixaGravar(previa(), false)).toBe(true);
    expect(previaDeixaGravar(previa({ n_recusas: 1 }), false)).toBe(false);
    expect(previaDeixaGravar(previa({ ok: false }), false)).toBe(false);
    expect(previaDeixaGravar(previa({ n_repetidas: 1 }), false)).toBe(false);
    expect(previaDeixaGravar(previa({ n_repetidas: 1 }), true)).toBe(true);
    expect(previaDeixaGravar(previa({ contratos: [{ financiamento_id: 'f', descricao: null, n_parcelas: 5, n_faltam: 4, valor_total: 210000, faltam: [] }] }), false)).toBe(false);
  });
  it('a frase: a recusa do banco; "passa de X para Y"; o contrato inteiro', () => {
    expect(fraseDaPrevia(previa({ n_recusas: 1, itens: [{ lancamento_id: 'a', parte_ordem: 1, situacao: 'recusa', motivo: 'Já está em EQP-007.', repetida: false, valor: null, descricao: null }] }), null, n2))
      .toBe('Já está em EQP-007.');
    expect(fraseDaPrevia(previa(), { codigo: 'INS-031', aquisicaoAntes: 18650 }, n2)).toBe('INS-031 passa de 18.650,00 para 22.130,00 de aquisição · nada muda no lançamento');
    expect(fraseDaPrevia(previa({ contratos: [{ financiamento_id: 'f', descricao: 'Compra', n_parcelas: 5, n_faltam: 4, valor_total: 210000, faltam: [] }] }), null, n2))
      .toBe('Liga as 5 parcelas da compra (R$ 210.000,00) — o bem entra pelo contrato inteiro.');
  });
  it('D4: as parcelas que faltam entram na escolha, sem repetir', () => {
    const p = previa({ contratos: [{ financiamento_id: 'f', descricao: null, n_parcelas: 3, n_faltam: 2, valor_total: 3, faltam: [{ lancamento_id: 'b', parte_ordem: 1 }, { lancamento_id: 'a', parte_ordem: 1 }] }] });
    expect(comOContrato([{ lancamento_id: 'a', parte_ordem: 1 }], p)).toEqual([{ lancamento_id: 'a', parte_ordem: 1 }, { lancamento_id: 'b', parte_ordem: 1 }]);
  });
  it('o selo diz o crédito de IBS/CBS (contribuinte = o padrão); o não contribuinte sem a frase', () => {
    expect(tituloDoSemBem()).toContain('crédito de IBS/CBS');
    expect(tituloDoSemBem(false)).not.toContain('IBS/CBS');
  });
});
