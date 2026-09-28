/**
 * OC-VENDA-ENTREGAS-01b/01c — a leitura da conta corrente da venda. O saldo e' do banco (`oc_conta_corrente`); aqui se trava o
 * que a tela faz com ele. Desde o 01c o extrato e' LIDO PELO CAIXA DA FAZENDA: recebimento soma, entrega abate, saldo NEGATIVO
 * = falta receber, POSITIVO = adiantado, ZERO = quitado. O fixture principal e' a 232c05aa real, com os numeros do rollback do
 * 01c (saldo -1.357,89; ajuste de 1.000 no lote 5 + permuta de 357,89 zeram).
 */
import { describe, it, expect } from 'vitest';
import {
  lerContaCorrente, corDoSaldo, rotuloDoSaldo, barraDaDiferenca, rotuloRecebimento, dataCurta, contaComNumero, efeitoNoSaldo,
  totalDoRascunho, type TipoExplicacao,
} from './contaCorrente';

const ent = (data: string, valor: number, saldo: number, lote: number, cab: number, categoria = 'desmama_m') => ({
  tipo: 'entrega', data, parte_id: `e-${data}-${lote}`, lote_ordem: lote, cab, categoria, conta_ordem: 1120,
  conta: 'Venda de Desmama Machos', mov_entrega: -valor, mov_recebido: null, status: 'sem_caixa', no_saldo: true, saldo,
});
const rec = (data: string, valor: number, saldo: number, extra: Record<string, unknown> = {}) => ({
  tipo: 'recebimento', data, parte_id: `r-${data}`, conta_ordem: 3015, conta: 'Adiantamento de Clientes', banco: null,
  mov_entrega: null, mov_recebido: valor, status: 'sem_conta_bancaria', no_saldo: true, saldo, ...extra,
});

/* 232c05aa, Santa Rita 2025 — saldo corrido do caixa da fazenda. */
const HELDER = {
  modelo: 'conta_corrente', versao: 25, valor_acordado: 2366601.26, entregue: 2366601.26, cab_entregue: 779,
  recebido: 2365243.37, programado: 0, devolvido: 0, saldo: -1357.89, explicado: 0, saldo_a_explicar: -1357.89,
  falta_explicar: -1357.89, situacao: 'falta_receber', a_entregar: 0, ultima_entrega: '2025-06-25',
  recebimentos_sem_conta_bancaria: 4, saidas_sem_entrega: 0,
  linhas: [
    ent('2025-03-19', 565521.66, -565521.66, 1, 178),
    ent('2025-03-20', 426616.58, -992138.24, 2, 139),
    rec('2025-04-17', 992140.99, 2.75),
    ent('2025-04-23', 574046.85, -574044.10, 3, 193),
    ent('2025-05-21', 18030.34, -592074.44, 6, 6, 'garrotes'),
    ent('2025-05-21', 549925.25, -1141999.69, 4, 183),
    rec('2025-05-22', 574042.04, -567957.65),
    rec('2025-06-21', 567956.34, -1.31),
    ent('2025-06-25', 207404.34, -207405.65, 5, 69),
    ent('2025-06-25', 25056.24, -232461.89, 7, 11, 'garrotes'),
    rec('2025-07-25', 231104.00, -1357.89),
  ],
  explicacoes: [],
};

describe('conta corrente da venda — leitura e sinal do caixa', () => {
  it('232c05aa: le o envelope sem somar nada — saldo -1.357,89, falta receber, entrega negativa e recebimento positivo', () => {
    const cc = lerContaCorrente(HELDER);
    expect(cc).not.toBeNull();
    if (!cc) return;
    expect(cc.linhas).toHaveLength(11);
    expect(cc.saldo).toBe(-1357.89);
    expect(cc.situacao).toBe('falta_receber');
    expect(cc.linhas[0].movEntrega).toBe(-565521.66);
    expect(cc.linhas[2].movRecebido).toBe(992140.99);
    expect(cc.linhas[10].saldo).toBe(cc.saldo);
    expect(rotuloDoSaldo(cc.saldo)).toBe('Saldo · falta receber');
    expect(barraDaDiferenca(cc)).toEqual({ frase: 'Recebeu R$ 1.357,89 a menos do que entregou.', valor: -1357.89 });
    expect(rotuloRecebimento(cc.linhas, 'r-2025-05-22')).toBe('Recebimento 2 de 4');
  });

  it('sinal do saldo: negativo vermelho (falta receber), positivo verde (adiantado), zero e meio centavo quitado', () => {
    expect(corDoSaldo(-0.01)).toBe('neg');
    expect(corDoSaldo(2.75)).toBe('pos');
    expect(corDoSaldo(0)).toBe('zero');
    expect(corDoSaldo(0.004)).toBe('zero');
    expect(corDoSaldo(null)).toBe('zero');
    expect(rotuloDoSaldo(2.75)).toBe('Saldo · adiantado pelo comprador');
    expect(rotuloDoSaldo(0)).toBe('Saldo · quitado');
  });

  it('D6: recebimento sem conta bancaria le "sem_conta_bancaria", nunca conciliado; status fora do contrato cai em realizado', () => {
    const cc = lerContaCorrente(HELDER);
    expect(cc?.linhas.filter(l => l.tipo === 'recebimento').map(l => l.status)).toEqual(Array(4).fill('sem_conta_bancaria'));
    const outro = lerContaCorrente({ ...HELDER, linhas: [rec('2025-01-01', 10, 10, { status: 'inventado' })] });
    expect(outro?.linhas[0].status).toBe('realizado');
  });

  it('ADIANTAMENTO: dinheiro antes do gado e\' saldo POSITIVO, e sem entrega nao ha diferenca a explicar', () => {
    const cc = lerContaCorrente({ ...HELDER, entregue: 0, recebido: 1000000, saldo: 1000000, situacao: 'adiantado',
      a_entregar: 2366601.26, falta_explicar: 1000000, linhas: [rec('2025-03-01', 1000000, 1000000)] });
    expect(cc?.situacao).toBe('adiantado');
    expect(cc && corDoSaldo(cc.saldo)).toBe('pos');
    expect(cc && barraDaDiferenca(cc)).toBeNull();
  });

  it("PARCIAL: com gado a entregar o saldo e' andamento, nao diferenca", () => {
    const cc = lerContaCorrente({ ...HELDER, a_entregar: 1374463.02, linhas: HELDER.linhas.slice(0, 2) });
    expect(cc && barraDaDiferenca(cc)).toBeNull();
  });

  it('A MAIS: recebeu mais do que entregou — a frase diz "a mais"', () => {
    const cc = lerContaCorrente({ ...HELDER, saldo: 398.74, saldo_a_explicar: 398.74, falta_explicar: 398.74, situacao: 'adiantado' });
    expect(cc && barraDaDiferenca(cc)).toEqual({ frase: 'Recebeu R$ 398,74 a mais do que entregou.', valor: 398.74 });
  });

  it('COMBINACAO ATE ZERAR: ajuste de 1.000 + permuta de 357,89 explicam os 1.357,89; outra receita e devolucao vao no sentido oposto', () => {
    const rascunho: { tipo: TipoExplicacao; valor: number }[] = [{ tipo: 'ajuste_preco', valor: 1000 }, { tipo: 'permuta_despesa', valor: 357.89 }];
    expect(totalDoRascunho(rascunho)).toBe(1357.89);
    expect(Math.round((-1357.89 + totalDoRascunho(rascunho)) * 100)).toBe(0);
    expect(efeitoNoSaldo('desconto_comercial', 10)).toBe(10);
    expect(efeitoNoSaldo('outra_receita', 10)).toBe(-10);
    expect(efeitoNoSaldo('devolucao_comprador', 10)).toBe(-10);
    /* centavos inteiros: 0,1 + 0,2 nao vira 0,30000000000000004 */
    expect(totalDoRascunho([{ tipo: 'desconto_comercial', valor: 0.1 }, { tipo: 'desconto_comercial', valor: 0.2 }])).toBe(0.3);
  });

  it('explicado pelo banco: com falta_explicar zero a barra some mesmo com saldo_a_explicar; tipo fora do contrato e\' descartado', () => {
    const cc = lerContaCorrente({ ...HELDER, saldo: 0, explicado: 1357.89, falta_explicar: 0, situacao: 'quitado',
      explicacoes: [
        { parte_id: 'x1', tipo: 'ajuste_preco', lote_ordem: 5, valor: 1000, status: 'ajuste' },
        { parte_id: 'x2', tipo: 'permuta_despesa', conta_ordem: 8045, conta: 'Frete', motivo: 'frete do comprador', valor: 357.89, status: 'sem_caixa' },
        { parte_id: 'x3', tipo: 'inventado', valor: 1 },
      ] });
    expect(cc?.explicacoes.map(e => e.tipo)).toEqual(['ajuste_preco', 'permuta_despesa']);
    expect(cc?.saldoAExplicar).toBe(-1357.89);
    if (!cc) return;
    expect(barraDaDiferenca(cc)).toBeNull();
    /* a busca sabe achar: o mesmo fixture com falta diferente de zero tem barra */
    expect(barraDaDiferenca({ ...cc, faltaExplicar: -1 })).not.toBeNull();
  });

  it('padrao de tabela: data dd/mm/aa e conta com o numero do plano', () => {
    expect(dataCurta('2025-03-19')).toBe('19/03/25');
    expect(dataCurta(null)).toBe('—');
    expect(contaComNumero(1120, 'Venda de Desmama Machos')).toBe('1120 Venda de Desmama Machos');
    expect(contaComNumero(null, null)).toBe('—');
  });
});
