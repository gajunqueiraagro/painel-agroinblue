/**
 * O detector de "É parcela de financiamento ▾" — 133i-c item 3.
 *
 * ⚠ ESTE TESTE NASCEU DE UM FALSO POSITIVO MEDIDO NO PROTO, não de zelo abstrato. A regra
 * proposta no briefing era `valor_principal <= extrato <= valor_total * 1,5`; rodando-a em
 * SQL, um pagamento de ITR de R$ 13.750 casou com uma parcela de R$ 612.000 — basta a
 * parcela ter principal pequeno e juros grandes para o piso desabar. O caso do 612k está
 * abaixo, com nome, para que o piso nunca volte a ser o principal.
 */
import { describe, it, expect } from 'vitest';
import { candidatasParaExtrato, type ParcelaCandidata } from './useParcelasFinanciamento';

/** `valor_total` é sempre derivado: a fonte real o calcula no map da query, e um teste que
    aceitasse um total incoerente com as partes testaria uma parcela que não existe. */
function parcela(over: Partial<ParcelaCandidata> = {}): ParcelaCandidata {
  const principal = over.valor_principal ?? 1000;
  const juros = over.valor_juros ?? 0;
  return {
    parcela_id: 'p1', financiamento_id: 'f1',
    numero_parcela: 1, total_parcelas: 10,
    data_vencimento: '2026-08-20',
    contrato_descricao: 'Contrato', natureza: 'financiamento', credor_nome: null,
    ...over,
    valor_principal: principal,
    valor_juros: juros,
    valor_total: principal + juros,
  };
}

describe('candidatasParaExtrato — janela de dias', () => {
  it('aceita o pagamento no dia do vencimento', () => {
    const r = candidatasParaExtrato({ data: '2026-08-20', valor: 1000 }, [parcela()]);
    expect(r).toHaveLength(1);
  });

  it('aceita 10 dias antes e 10 depois', () => {
    expect(candidatasParaExtrato({ data: '2026-08-10', valor: 1000 }, [parcela()])).toHaveLength(1);
    expect(candidatasParaExtrato({ data: '2026-08-30', valor: 1000 }, [parcela()])).toHaveLength(1);
  });

  it('recusa no 11º dia', () => {
    expect(candidatasParaExtrato({ data: '2026-08-09', valor: 1000 }, [parcela()])).toHaveLength(0);
    expect(candidatasParaExtrato({ data: '2026-08-31', valor: 1000 }, [parcela()])).toHaveLength(0);
  });
});

describe('candidatasParaExtrato — faixa de valor', () => {
  it('aceita o pagamento pontual dentro de 2%', () => {
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: 1020 }, [parcela()])).toHaveLength(1);
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: 980 }, [parcela()])).toHaveLength(1);
  });

  it('recusa abaixo da faixa pontual — pagar menos não é pagar a parcela', () => {
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: 900 }, [parcela()])).toHaveLength(0);
  });

  it('aceita o atraso até 1,5x do total (juros de mora)', () => {
    expect(candidatasParaExtrato({ data: '2026-08-25', valor: 1400 }, [parcela()])).toHaveLength(1);
    expect(candidatasParaExtrato({ data: '2026-08-25', valor: 1500 }, [parcela()])).toHaveLength(1);
  });

  it('recusa acima de 1,5x', () => {
    expect(candidatasParaExtrato({ data: '2026-08-25', valor: 1501 }, [parcela()])).toHaveLength(0);
  });

  /** O caso medido no proto: piso no principal engolia qualquer pagamento pequeno. */
  it('NÃO casa um pagamento de 13.750 com uma parcela de 612.000', () => {
    const gorda = parcela({ valor_principal: 12000, valor_juros: 600000, data_vencimento: '2026-10-01' });
    expect(gorda.valor_total).toBe(612000);
    const r = candidatasParaExtrato({ data: '2026-09-30', valor: 13750 }, [gorda]);
    expect(r).toHaveLength(0);
  });
});

describe('candidatasParaExtrato — entradas inválidas', () => {
  it('sem data ou sem valor não devolve nada', () => {
    expect(candidatasParaExtrato({ data: null, valor: 1000 }, [parcela()])).toHaveLength(0);
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: null }, [parcela()])).toHaveLength(0);
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: 0 }, [parcela()])).toHaveLength(0);
  });

  it('usa o valor absoluto — saída chega negativa em algumas fontes', () => {
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: -1000 }, [parcela()])).toHaveLength(1);
  });

  it('parcela sem valor não é candidata', () => {
    const zero = parcela({ valor_principal: 0, valor_juros: 0 });
    expect(candidatasParaExtrato({ data: '2026-08-20', valor: 1000 }, [zero])).toHaveLength(0);
  });
});
