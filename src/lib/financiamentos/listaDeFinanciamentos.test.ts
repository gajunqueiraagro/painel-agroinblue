/**
 * FIN-FINANC-28-P3 — o dono puro da lista de financiamentos: agrupa e soma o que o banco mandou; nunca calcula saldo.
 */
import { describe, expect, it } from 'vitest';
import {
  contratoDaLista, ehCompraParcelada, montarListaDeFinanciamentos, ordenarContratos, pendenciaCurta, somaConhecida, temNumero, textoDasPendencias,
  type ContratoDaLista,
} from './listaDeFinanciamentos';
import { lerSituacaoDoContrato, type SaldoDoContrato } from './situacaoDoContrato';

const saldo = (p: Partial<SaldoDoContrato> = {}): SaldoDoContrato => ({
  aplicaSaldo: true, regra: 'calculado', contratado: 1000, liberado: 1000, liberacoes: 1, amortizado: 200, saldo: 800,
  jurosPagos: 0, jurosPrevistos: 0, foraDasSomas: false, pendencias: [], ...p,
});
const c = (id: string, p: Partial<ContratoDaLista> = {}): ContratoDaLista => ({
  id, numeroContrato: `C-${id}1`, banco: 'Banco A', descricao: `Contrato ${id}`, status: 'ativo', linhaCreditoId: null,
  linhaCreditoNome: null, sucessorNumero: null, saldo: saldo(), proxVencimento: '2026-11-10', data: '2025-01-10', dataOrigem: 'contrato', ...p,
});

describe('montarListaDeFinanciamentos', () => {
  it('saldo NULO fica fora da soma e a soma diz quantos ficaram de fora ("+ ?")', () => {
    const lista = montarListaDeFinanciamentos([
      c('a', { saldo: saldo({ contratado: 1000, liberado: 1000, saldo: 800 }) }),
      c('b', { saldo: saldo({ contratado: 500, liberado: null, saldo: null, pendencias: ['sem_liberacao'] }) }),
    ]);
    expect(lista.total.saldo).toEqual({ valor: 800, aConfirmar: 1, conhecidos: 1 });
    expect(lista.total.liberado).toEqual({ valor: 1000, aConfirmar: 1, conhecidos: 1 });
    expect(lista.total.contratado).toEqual({ valor: 1500, aConfirmar: 0, conhecidos: 2 });
    expect(lista.grupos[0].saldo).toEqual({ valor: 800, aConfirmar: 1, conhecidos: 1 });
  });

  it('sem a chave `saldo` no lote o contrato inteiro é "?" (nunca zero)', () => {
    const lista = montarListaDeFinanciamentos([c('a', { saldo: null })]);
    expect(lista.total.contratado).toEqual({ valor: 0, aConfirmar: 1, conhecidos: 0 });
    expect(lista.total.saldo).toEqual({ valor: 0, aConfirmar: 1, conhecidos: 0 });
    // nenhum conhecido: a soma não existe (a tela diz "?", nunca 0,00)
    expect(somaConhecida(lista.total.saldo)).toBe(false);
    expect(somaConhecida({ valor: 0, aConfirmar: 0, conhecidos: 0 })).toBe(true);
  });

  it('agrupa por linha de crédito quando há; o resto por banco; linhas antes de bancos', () => {
    const lista = montarListaDeFinanciamentos([
      c('a', { banco: 'Banco A' }),
      c('b', { banco: 'Banco B', saldo: saldo({ contratado: 9000 }) }),
      c('c', { banco: 'Banco A', linhaCreditoId: 'L1', linhaCreditoNome: 'PRONAMP 25/26' }),
      c('d', { banco: 'Banco B', linhaCreditoId: 'L1', linhaCreditoNome: 'PRONAMP 25/26' }),
      c('e', { banco: null }),
    ]);
    expect(lista.grupos.map((g) => [g.tipo, g.rotulo, g.contratos.map((x) => x.id).join(',')])).toEqual([
      ['linha', 'PRONAMP 25/26', 'c,d'],
      ['banco', 'Banco B', 'b'],
      ['banco', 'Banco A', 'a'],
      ['banco', 'Sem banco', 'e'],
    ]);
    // subtotal do grupo = soma do grupo; total = soma dos grupos, ao centavo
    expect(lista.grupos[0].contratado.valor).toBe(2000);
    expect(lista.total.contratado.valor).toBe(13000);
  });

  it('encerrados (quitado, rolado, cancelado) ficam à parte, fora do total vigente', () => {
    const lista = montarListaDeFinanciamentos([
      c('a'),
      c('q', { status: 'quitado', saldo: saldo({ saldo: 0 }) }),
      c('r', { status: 'rolado', sucessorNumero: 'C-a1', saldo: saldo({ saldo: 0, foraDasSomas: true }) }),
      c('x', { status: 'cancelado', saldo: saldo({ saldo: 0, foraDasSomas: true }) }),
    ]);
    expect(lista.encerrados.map((e) => e.id).sort()).toEqual(['q', 'r', 'x']);
    expect(lista.grupos.flatMap((g) => g.contratos.map((x) => x.id))).toEqual(['a']);
    expect(lista.total.contratado.valor).toBe(1000);
  });

  it('conta contratos com pendência (rolado/cancelado fora)', () => {
    const lista = montarListaDeFinanciamentos([
      c('a', { saldo: saldo({ pendencias: ['sem_liberacao'] }) }),
      c('b'),
      c('r', { status: 'rolado', saldo: saldo({ foraDasSomas: true, pendencias: ['sem_numero_contrato'] }) }),
    ]);
    expect(lista.comPendencia).toBe(1);
  });

  it('soma em centavos, sem erro de ponto flutuante', () => {
    const lista = montarListaDeFinanciamentos([
      c('a', { saldo: saldo({ saldo: 0.1 }) }), c('b', { saldo: saldo({ saldo: 0.2 }) }),
    ]);
    expect(lista.total.saldo.valor).toBe(0.3);
  });
});

describe('pendências, nº do contrato, ordem', () => {
  it('pendências em português, separadas por " · "; código desconhecido aparece como veio', () => {
    expect(textoDasPendencias(['sem_liberacao', 'amortizacao_sem_lancamento', 'liberado_maior_que_contratado',
      'amortizado_maior_que_liberado', 'sem_numero_contrato'])).toBe(
      'liberação não gravada · amortização sem lançamento · liberado maior que o contratado · amortizado maior que o liberado · falta nº do contrato');
    // a coluna estreita: a 1ª curta + "+N" (FIN-FINANC-28-P3-FIX2)
    expect(pendenciaCurta(['sem_liberacao', 'sem_numero_contrato'])).toBe('sem lib. +1');
    expect(pendenciaCurta(['sem_numero_contrato'])).toBe('sem nº');
    expect(pendenciaCurta([])).toBe('');
    expect(textoDasPendencias(['codigo_novo'])).toBe('codigo_novo');
    expect(textoDasPendencias([])).toBe('');
  });

  it('"sem nº": vazio, só espaço ou sem dígito', () => {
    expect(temNumero(null)).toBe(false);
    expect(temNumero('  ')).toBe(false);
    expect(temNumero('Sem dados')).toBe(false);
    expect(temNumero('C_4608772')).toBe(true);
  });

  it('ordena pela coluna pedida, vazio sempre no fim, empate estável', () => {
    const ord = ordenarContratos([
      c('a', { saldo: saldo({ saldo: 300 }) }), c('b', { saldo: saldo({ saldo: null }) }), c('c', { saldo: saldo({ saldo: 900 }) }),
    ], 'saldo', 'desc');
    expect(ord.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    const asc = ordenarContratos(ord, 'saldo', 'asc');
    expect(asc.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('abas e leitura', () => {
  it('só o parcelamento vai para "Compras parceladas"', () => {
    expect(ehCompraParcelada('parcelamento')).toBe(true);
    expect(ehCompraParcelada('financiamento')).toBe(false);
    expect(ehCompraParcelada('emprestimo')).toBe(false);
  });

  it('a linha leva o saldo do lote e o próximo vencimento do helper, sem conta', () => {
    const s = saldo();
    expect(contratoDaLista({
      id: 'f', numeroContrato: null, banco: 'B', descricao: null, status: 'ativo', linhaCreditoId: null, linhaCreditoNome: null,
      sucessorNumero: null, saldo: s, proxVencimento: undefined, dataContrato: '2025-03-01', primeiraLiberacao: null,
    })).toEqual({ id: 'f', numeroContrato: null, banco: 'B', descricao: '', status: 'ativo', linhaCreditoId: null,
      linhaCreditoNome: null, sucessorNumero: null, saldo: s, proxVencimento: null, data: '2025-03-01', dataOrigem: 'contrato' });
    // com liberação gravada, a data é a da 1ª liberação
    expect(contratoDaLista({ id: 'g', numeroContrato: null, banco: null, descricao: 'x', status: 'ativo', linhaCreditoId: null,
      linhaCreditoNome: null, sucessorNumero: null, saldo: s, proxVencimento: null, dataContrato: '2025-03-01',
      primeiraLiberacao: '2025-04-15' })).toMatchObject({ data: '2025-04-15', dataOrigem: 'liberacao' });
  });

  it('o leitor da situação traz a chave `saldo` (NULO quando falta liberação) e recusa a peça torta', () => {
    const base = {
      parcelas: [], cartoes: { valor_contrato: 1, pago: 0, a_vencer: 0, vencido: 0, pagas: 0, parcelas: 0, juros_previstos: 0,
        soma_principal: 0, soma_total: 0, divergentes: 0 },
    };
    const comSaldo = lerSituacaoDoContrato({ ...base, saldo: { aplica_saldo: true, regra: 'calculado', contratado: 150000,
      liberado: null, liberacoes: 0, amortizado: 0, saldo: null, juros_pagos: 0, juros_previstos: 0, fora_das_somas: false,
      pendencias: ['sem_liberacao'] } });
    expect(comSaldo?.saldo?.saldo).toBeNull();
    expect(comSaldo?.saldo?.liberado).toBeNull();
    expect(comSaldo?.saldo?.pendencias).toEqual(['sem_liberacao']);
    expect(lerSituacaoDoContrato(base)?.saldo).toBeNull();
    expect(lerSituacaoDoContrato({ ...base, saldo: { aplica_saldo: 'sim', pendencias: [] } })).toBeNull();
  });
});

describe('FIN-FINANC-28-P3-FIX', () => {
  it('ordem padrão: Data crescente dentro de cada grupo (sem data no fim)', () => {
    const lista = montarListaDeFinanciamentos([
      c('a', { data: '2025-06-01' }), c('b', { data: '2024-02-10' }), c('c', { data: null }), c('d', { data: '2025-01-15' }),
    ]);
    expect(lista.grupos[0].contratos.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});
