/**
 * OC-VENDA-ENTREGAS-01b/01c — a leitura da conta corrente da venda. O saldo e' do banco (`oc_conta_corrente`); aqui se trava o
 * que a tela faz com ele. Desde o 01c o extrato e' LIDO PELO CAIXA DA FAZENDA: recebimento soma, entrega abate, saldo NEGATIVO
 * = falta receber, POSITIVO = adiantado, ZERO = quitado. O fixture principal e' a 232c05aa real, com os numeros do rollback do
 * 01c (saldo -1.357,89; ajuste de 1.000 no lote 5 + permuta de 357,89 zeram).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lerContaCorrente, corDoSaldo, rotuloDoSaldo, barraDaDiferenca, rotuloRecebimento, dataCurta, contaComNumero, efeitoNoSaldo,
  totalDoRascunho, sinalDaFazenda, linhaNaTela, saldoNaTela, totaisNaTela, noSinalDaFazenda, corDoSaldoNaTela, classeDoSaldoNaTela,
  classeDaEntregaNaTela, classeDoDinheiroNaTela, classeDoAjusteNaTela, COR_SINAL, type TipoExplicacao, type ContaCorrente,
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
    /* OC-CC-SINAL-FAZENDA-01 — o rotulo recebe o saldo NA TELA, e a barra devolve o que falta na tela (positivo = falta) */
    expect(rotuloDoSaldo(saldoNaTela(cc, 'venda'))).toBe('Saldo · falta receber');
    expect(barraDaDiferenca(cc)).toEqual({ frase: 'Recebeu R$ 1.357,89 a menos do que entregou.', valor: 1357.89 });
    expect(rotuloRecebimento(cc.linhas, 'r-2025-05-22')).toBe('Receb. 2/4');
  });

  it('sinal do saldo: negativo vermelho (falta receber), positivo verde (adiantado), zero e meio centavo quitado', () => {
    expect(corDoSaldo(-0.01)).toBe('neg');
    expect(corDoSaldo(2.75)).toBe('pos');
    expect(corDoSaldo(0)).toBe('zero');
    expect(corDoSaldo(0.004)).toBe('zero');
    expect(corDoSaldo(null)).toBe('zero');
    /* OC-CC-SINAL-FAZENDA-01 — `rotuloDoSaldo` recebe o saldo NA TELA: positivo falta, negativo adiantado */
    expect(rotuloDoSaldo(-2.75)).toBe('Saldo · adiantado pelo comprador');
    expect(rotuloDoSaldo(2.75)).toBe('Saldo · falta receber');
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
    expect(cc && barraDaDiferenca(cc)).toEqual({ frase: 'Recebeu R$ 398,74 a mais do que entregou.', valor: -398.74 });
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

/* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — os rotulos GERADOS do extrato: curtos, de UM lugar, e cabem na Descricao (92px uteis,
   medido em Inter 10px: o maior e' "Devol. fornecedor", 84,9). */
import { descricaoDoEvento, rotuloCurtoExplicacao } from './contaCorrente';
describe('rotulos curtos do extrato (fix2)', () => {
  const linha = (extra: Record<string, unknown>) => lerContaCorrente({ modelo: 'conta_corrente', linhas: [extra] })?.linhas[0];
  const cat = (s: string | null) => (s === 'desmama_m' ? 'Desmama M' : s ?? '—');
  it('entrega: a categoria (o Evento ja diz Entrega/Entrada; "Compra Desmama M" pedia 99,3px)', () => {
    const l = linha({ tipo: 'entrega', data: '2026-03-25', parte_id: 'e', categoria: 'desmama_m', saldo: 0 });
    expect(l && descricaoDoEvento(l, [l], 'compra', cat)).toBe('Desmama M');
  });
  it('explicacao: o nome curto, dos dois lados; o dialogo segue com o longo', () => {
    const tipos: TipoExplicacao[] = ['ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador'];
    expect(tipos.map(t => rotuloCurtoExplicacao(t))).toEqual(['Ajuste de preço', 'Desconto', 'Permuta/desp.', 'Outra receita', 'Devol. comprador']);
    expect(rotuloCurtoExplicacao('devolucao_comprador', 'compra')).toBe('Devol. fornecedor');
    const l = linha({ tipo: 'explicacao', subtipo: 'permuta_despesa', data: '2026-03-25', parte_id: 'x', saldo: 0 });
    expect(l && descricaoDoEvento(l, [l], 'venda', cat)).toBe('Permuta/desp.');
  });
  it('recebimento: "Receb. n/N", pagamento "Pgto. n/N"', () => {
    const rs = ['a', 'b', 'c', 'd'].map(id => linha({ tipo: 'recebimento', data: '2021-06-15', parte_id: id, saldo: 0 }))
      .filter((x): x is NonNullable<typeof x> => !!x);
    expect(descricaoDoEvento(rs[1], rs, 'venda', cat)).toBe('Receb. 2/4');
    expect(descricaoDoEvento(rs[3], rs, 'compra', cat)).toBe('Pgto. 4/4');
  });
});

/* OC-CC-SINAL-FAZENDA-01 — o extrato le' pelo lado da FAZENDA. Numeros MEDIDOS no banco (14/10/2026, so' leitura): abate 02be1a41
   e 26fd02c1 (Vera), compra fcdbe0bb (Agnaldo). A tela so' multiplica cada numero do banco pelo fator do lado. */
const ccDe = (linhas: unknown[], extra: Record<string, unknown>) => {
  const cc = lerContaCorrente({ entregue: 0, recebido: 0, saldo: 0, situacao: 'quitado', a_entregar: 0, cab_entregue: 0,
    saldo_a_explicar: 0, explicado: 0, falta_explicar: 0, saidas_sem_entrega: 0, linhas, explicacoes: [], ...extra });
  if (!cc) throw new Error('envelope nao leu');
  return cc;
};
describe('OC-CC-SINAL-FAZENDA-01 — o dono do sinal de apresentacao', () => {
  it('os fatores por lado: venda e abate viram entrega e saldo; a compra vira o dinheiro', () => {
    expect(sinalDaFazenda('venda')).toEqual({ entrega: -1, dinheiro: 1, saldo: -1 });
    expect(sinalDaFazenda('abate')).toEqual({ entrega: -1, dinheiro: 1, saldo: -1 });
    expect(sinalDaFazenda('compra')).toEqual({ entrega: 1, dinheiro: -1, saldo: 1 });
  });

  it('abate 02be1a41: entrega +373.877,60, Funrural −6.094,20, recebido +367.783,40, saldo 0 quitado', () => {
    const cc = ccDe([
      { tipo: 'entrega', data: '2026-09-02', parte_id: 'e', lote_ordem: 1, cab: 60, mov_entrega: -373877.6, mov_recebido: null, status: 'sem_caixa', no_saldo: true, saldo: -373877.6 },
      { tipo: 'deducao', subtipo: 'funrural', data: '2026-09-02', parte_id: 'd', lote_ordem: 1, mov_entrega: 6094.2, mov_recebido: null, status: 'sem_caixa', no_saldo: true, saldo: -367783.4 },
      { tipo: 'recebimento', data: '2026-09-10', parte_id: 'r', mov_entrega: null, mov_recebido: 367783.4, status: 'conciliado', no_saldo: true, saldo: 0 },
    ], { entregue: 373877.6, recebido: 367783.4, deduzido: 6094.2, saldo: 0 });
    expect(cc.linhas.map(l => linhaNaTela(l, 'abate'))).toEqual([
      { entrega: 373877.6, dinheiro: null, saldo: 373877.6 },
      { entrega: -6094.2, dinheiro: null, saldo: 367783.4 },
      { entrega: null, dinheiro: 367783.4, saldo: 0 },
    ]);
    expect(totaisNaTela(cc, 'abate')).toEqual({ entrega: 373877.6, dinheiro: 367783.4, saldo: 0 });
    expect(noSinalDaFazenda(6094.2, 'abate')).toBe(-6094.2);
    expect(Object.is(saldoNaTela(cc, 'abate'), 0)).toBe(true); // nunca −0
    expect(rotuloDoSaldo(saldoNaTela(cc, 'abate'), 'abate')).toBe('Saldo · quitado');
    expect(classeDaEntregaNaTela(373877.6, 'abate', 'entrega')).toBe(COR_SINAL.pos);
    expect(classeDaEntregaNaTela(-6094.2, 'abate', 'deducao')).toBe(COR_SINAL.neg);
    expect(classeDoDinheiroNaTela(367783.4, 'abate')).toBe(COR_SINAL.pos);
  });

  it('abate 26fd02c1: saldo do banco −212.449,03 vira +212.449,03 na tela = falta receber, vermelho', () => {
    const cc: ContaCorrente = ccDe([], { entregue: 215969.33, recebido: 0, deduzido: 3520.3, saldo: -212449.03, situacao: 'falta_receber' });
    expect(saldoNaTela(cc, 'abate')).toBe(212449.03);
    expect(corDoSaldoNaTela(saldoNaTela(cc, 'abate'))).toBe('falta');
    expect(classeDoSaldoNaTela(saldoNaTela(cc, 'abate'))).toBe(COR_SINAL.neg);
    expect(rotuloDoSaldo(saldoNaTela(cc, 'abate'), 'abate', cc.situacao)).toBe('Saldo · falta receber');
  });

  it('compra fcdbe0bb: entradas +35.000 / +29.440 iguais, pago −63.440 vira +63.440 vermelho, saldo +1.000 = falta pagar', () => {
    const cc = ccDe([
      { tipo: 'entrega', data: '2026-09-01', parte_id: 'e1', mov_entrega: 35000, mov_recebido: null, status: 'sem_caixa', no_saldo: true, saldo: 35000 },
      { tipo: 'entrega', data: '2026-09-01', parte_id: 'e2', mov_entrega: 29440, mov_recebido: null, status: 'sem_caixa', no_saldo: true, saldo: 64440 },
      { tipo: 'recebimento', data: '2026-09-05', parte_id: 'p', mov_entrega: null, mov_recebido: -63440, status: 'realizado', no_saldo: true, saldo: 1000 },
    ], { entregue: 64440, recebido: 63440, saldo: 1000, situacao: 'falta_receber' });
    expect(cc.linhas.map(l => linhaNaTela(l, 'compra'))).toEqual([
      { entrega: 35000, dinheiro: null, saldo: 35000 },
      { entrega: 29440, dinheiro: null, saldo: 64440 },
      { entrega: null, dinheiro: 63440, saldo: 1000 },
    ]);
    expect(totaisNaTela(cc, 'compra')).toEqual({ entrega: 64440, dinheiro: 63440, saldo: 1000 });
    expect(classeDaEntregaNaTela(35000, 'compra', 'entrega')).toBe(COR_SINAL.neg); // custo
    expect(classeDoDinheiroNaTela(63440, 'compra')).toBe(COR_SINAL.neg);            // pago = saida de caixa
    expect(classeDoDinheiroNaTela(-500, 'compra')).toBe(COR_SINAL.pos);             // devolucao do fornecedor
    expect(rotuloDoSaldo(saldoNaTela(cc, 'compra'), 'compra')).toBe('Saldo · falta pagar');
    expect(rotuloDoSaldo(-1000, 'compra')).toBe('Saldo · adiantado ao fornecedor');
    expect(classeDoSaldoNaTela(1000)).toBe(COR_SINAL.neg);
  });

  it("a explicacao que reduz e' negativa vermelha; a que aumenta, positiva verde; o adiantado e' verde; o quitado sem cor", () => {
    expect(noSinalDaFazenda(efeitoNoSaldo('desconto_comercial', 100), 'venda')).toBe(-100);
    expect(classeDoAjusteNaTela(-100)).toBe(COR_SINAL.neg);
    expect(noSinalDaFazenda(efeitoNoSaldo('outra_receita', 100), 'venda')).toBe(100);
    expect(classeDoAjusteNaTela(100)).toBe(COR_SINAL.pos);
    expect(classeDoSaldoNaTela(-5)).toBe(COR_SINAL.pos);
    expect(classeDoSaldoNaTela(0.004)).toBe('');
    expect(corDoSaldoNaTela(null)).toBe('quitado');
  });
});

/* OC-CC-SINAL-FAZENDA-01 — o sinal de apresentacao tem UM dono. Nenhum arquivo de `src` (fora do dono) escreve o fator a' mao:
   nem o antigo `sinalEntrega`, nem o dinheiro virado por "-cc.recebido" / "-contaCorrente.recebido". */
const SINAL_A_MAO = /\bsinalEntrega\b|[-−]\s*\(?\s*(?:cc|contaCorrente)\??\.recebido\b/;
const fontesDeSrc = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = join(dir, d.name);
  if (d.isDirectory()) return fontesDeSrc(p);
  return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
});
describe('OC-CC-SINAL-FAZENDA-01 — ninguem escreve o sinal de apresentacao fora do dono', () => {
  it('o detector sabe achar (auto-teste)', () => {
    for (const caso of ['const sinalEntrega = 1;', 'valor={-cc.recebido}', 'formatMoeda(-contaCorrente.recebido)', 'num2(- cc.recebido)',
      'x = -(cc.recebido)', 'formatMoeda(−contaCorrente?.recebido)']) expect(SINAL_A_MAO.test(caso), caso).toBe(true);
    for (const caso of ['cc.recebido', 'totaisNaTela(cc, lado).dinheiro', 'a - b.recebido', 'formatMoeda(r.valor)']) expect(SINAL_A_MAO.test(caso), caso).toBe(false);
  });
  it('nenhum arquivo de src, fora do dono', () => {
    const arquivos = fontesDeSrc('src').filter(f => !f.endsWith(join('lib', 'oc', 'contaCorrente.ts')));
    expect(arquivos.length).toBeGreaterThan(500);
    expect(arquivos.filter(f => SINAL_A_MAO.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
