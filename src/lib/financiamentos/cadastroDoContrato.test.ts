/**
 * FIN-FINANC-28 · PASSO 7 — o dono puro do cadastro novo. O que falta sai na ordem e nas palavras da recusa do banco; o pedido
 * ao gerador e ao criar e' montado aqui; a conta do cronograma e' do banco (a tela so' le^, e peca torta = nulo).
 */
import { describe, expect, it } from 'vitest';
import { formVazio, lerCronograma, oQueFalta, pedidoDeCriacao, pedidoDoCronograma, textoDasParcelas } from './cadastroDoContrato';

const cheio = () => ({
  ...formVazio('financiamento'), descricao: 'Custeio 26/27', credorId: 'c1', contaId: 'k1', numeroContrato: 'C-1', dataContrato: '2026-10-01',
  fazendaId: 'f1', valorTotal: 1000, primeiroVencimento: '2027-10-01', n: 4, planoJurosId: 'pj', planoPrincipalId: 'pp',
});

describe('o que falta', () => {
  it('financiamento: na ordem do banco; preenchido, nada', () => {
    expect(oQueFalta(formVazio('financiamento'))).toEqual([
      'descrição', 'credor', 'conta de captação', 'nº do contrato', 'data do contrato', 'fazenda', 'valor contratado', '1º vencimento',
      'plano dos juros', 'plano do principal',
    ]);
    expect(oQueFalta(cheio())).toEqual([]);
  });
  it('parcela única e personalizado não pedem nº de parcelas; SAC com 0 pede', () => {
    expect(oQueFalta({ ...cheio(), n: 0 })).toEqual(['nº de parcelas']);
    expect(oQueFalta({ ...cheio(), n: 0, sistema: 'bullet' })).toEqual([]);
    expect(oQueFalta({ ...cheio(), n: 0, sistema: 'livre' })).toEqual([]);
  });
  it('consórcio fala a língua dele e não pede nº nem data do contrato nem plano do principal', () => {
    expect(oQueFalta(formVazio('consorcio'))).toEqual([
      'descrição', 'administradora', 'conta de pagamento', 'fazenda', 'carta de crédito', 'prazo', '1ª parcela', 'plano da taxa e do seguro',
    ]);
  });
});

describe('os pedidos', () => {
  it('cronograma do crédito leva sistema, taxa, periodicidade e as parcelas digitadas', () => {
    const p = pedidoDoCronograma({ ...cheio(), sistema: 'livre', parcelas: [{ vencimento: '2027-01-01', principal: 500, juros: 10 }] });
    expect(p).toMatchObject({ sistema: 'livre', principal: 1000, n: 4, parcelas: [{ vencimento: '2027-01-01', principal: 500, juros: 10 }] });
  });
  it('cronograma do consórcio vai no modo consórcio, com carta e prazo', () => {
    const p = pedidoDoCronograma({ ...formVazio('consorcio'), valorTotal: 200000, prazo: 80, taxaAdmPct: 15, primeiroVencimento: '2026-11-18' });
    expect(p).toEqual({ modo: 'consorcio', carta: 200000, prazo: 80, taxa_adm_pct: 15, fundo_reserva_pct: 0, seguro_pct_mes: 0, primeiro_vencimento: '2026-11-18' });
  });
  it('criação: cliente, natureza e os dois planos; consórcio sem finalidade; lance zero vai nulo', () => {
    const c = pedidoDeCriacao({ ...cheio(), descricao: '  Custeio  ' }, 'cli');
    expect(c).toMatchObject({ cliente_id: 'cli', natureza: 'financiamento', descricao: 'Custeio', finalidade: 'investimento', plano_juros_id: 'pj', plano_principal_id: 'pp' });
    const k = pedidoDeCriacao({ ...formVazio('consorcio'), lanceValor: 0 }, 'cli');
    expect(k.finalidade).toBeNull();
    expect(k.lance_valor).toBeNull();
  });
});

describe('o leitor do cronograma', () => {
  it('lê o que o banco devolve; peça torta = nulo; o texto das parcelas', () => {
    const c = lerCronograma({ recusa: null, principal_total: 1000, juros_total: 80, total: 1080, parcelas: 2, parcelas_so_juros: 1, vencimento_final: '2028-10-01',
      linhas: [{ numero: 1, vencimento: '2027-10-01', principal: 0, juros: 40, total: 40, saldo_apos: 1000 },
        { numero: 2, vencimento: '2028-10-01', principal: 1000, juros: 40, total: 1040, saldo_apos: 0 }] });
    expect(c?.linhas).toHaveLength(2);
    expect(textoDasParcelas(c)).toBe('1 de principal + 1 só juros');
    expect(lerCronograma({ linhas: [{ numero: 1 }] })).toBeNull();
    expect(lerCronograma('x')).toBeNull();
    expect(textoDasParcelas(null)).toBe('—');
  });
});
