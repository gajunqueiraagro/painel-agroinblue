/**
 * O que este teste trava — o cartão "todas as contas" não pode contar a
 * transferência INTERNA como saída, nem esquecer a de UMA PERNA SÓ.
 *
 * ⚠ O DEFEITO VIVEU DOIS DIAS E VALIA MILHÕES. Em `e6360649` o agregado passou a
 * somar `movimentoNaConta(l, '')` linha a linha — e com conta VAZIA não existe
 * perna: o destino nunca era creditado, então toda transferência entre contas do
 * próprio cliente virava saída pura. Medido no NJ/2026 contra a função do banco:
 * janeiro errava por 1.310.270,36, abril por 2.825.906,98, julho por 1.063.065,63
 * — ao centavo, o total transferido em cada mês.
 *
 * ⚠ A FÓRMULA CERTA É A QUE NÃO PRECISA SABER QUAL É QUAL. Somar os cartões por
 * conta — cada um já leu a sua perna — zera a interna POR CONSTRUÇÃO e mantém a
 * de uma perna só, que é dinheiro que saiu de verdade. Nenhum código aqui
 * pergunta "esta transferência é interna?", e é esse o ponto: a pergunta não
 * precisa ser feita, e por isso não pode ser respondida errado.
 *
 * ⚠ AGOSTO NÃO PROVA NADA. É o único mês de 2026 do NJ sem transferência
 * nenhuma, e nele as duas réguas empatam — foi o mês escolhido para homologar, e
 * teria aprovado o defeito. Por isso este teste é sintético: ele constrói o caso
 * que a amostra real pode não ter.
 */
import { describe, it, expect } from 'vitest';
import { buildMonthCards, type LancamentoResumo, type ContaRef } from '@/pages/ConciliacaoBancariaTab';

const A = 'aaaaaaaa-0000-0000-0000-000000000001'; // conta do cliente
const B = 'bbbbbbbb-0000-0000-0000-000000000002'; // outra conta do cliente
const FORA = 'cccccccc-0000-0000-0000-000000000003'; // conta que NÃO é do cliente
const MES = '2026-03';
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ⚠ `sinal` É `number` NESTE TIPO e `text` no banco ('1' / '-1'). A divergência
 * não afeta este teste — o único consumidor de `sinal` no arquivo saiu junto com
 * a régua velha —, mas ela existe e está registrada.
 */
const lanc = (
  p: { valor: number; tipo_operacao: string; conta_bancaria_id?: string | null; conta_destino_id?: string | null },
): LancamentoResumo => ({
  id: `l-${p.tipo_operacao}-${p.valor}-${p.conta_bancaria_id ?? 'x'}-${p.conta_destino_id ?? 'x'}`,
  tipo_operacao: p.tipo_operacao,
  valor: p.valor,
  sinal: p.tipo_operacao.startsWith('1-') ? 1 : -1,
  data_competencia: `${MES}-10`,
  data_pagamento: `${MES}-10`,
  descricao: 'lancamento de teste',
  status_transacao: 'realizado',
  favorecido_id: null,
  numero_documento: null,
  conta_bancaria_id: p.conta_bancaria_id ?? null,
  conta_destino_id: p.conta_destino_id ?? null,
  ano_mes: MES,
  subcentro: null,
  origem_lancamento: null,
  macro_custo: null,
  centro_custo: null,
  cancelado: false,
  cenario: 'realizado',
  sem_movimentacao_caixa: false,
});

const LANCAMENTOS: LancamentoResumo[] = [
  lanc({ tipo_operacao: '1-Entradas', valor: 300, conta_destino_id: A }),
  lanc({ tipo_operacao: '2-Saídas',   valor: 200, conta_bancaria_id: B }),
  /* A DUPLA QUE IMPORTA: a primeira não move o caixa do conjunto; a segunda move. */
  lanc({ tipo_operacao: '3-Transferências', valor: 1000, conta_bancaria_id: A, conta_destino_id: B }),
  lanc({ tipo_operacao: '3-Transferências', valor: 500,  conta_bancaria_id: A, conta_destino_id: FORA }),
  /* Sem conta nenhuma: não pertence a cartão de conta, mas é dinheiro do conjunto. */
  lanc({ tipo_operacao: '1-Entradas', valor: 50 }),
  lanc({ tipo_operacao: '2-Saídas',   valor: 20 }),
];

const conta = (id: string, nome: string): ContaRef => ({
  id, nome_conta: nome, nome_exibicao: null, tipo_conta: 'cc',
  codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: null,
});
/* FORA não é do cliente e por isso não entra na soma — é o que faz a segunda
   transferência continuar sendo saída. */
const CONTAS: ContaRef[] = [conta(A, 'Conta A'), conta(B, 'Conta B')];

/** O cartao agregado de marco, pelo codigo REAL da tela. */
function cartaoAgregado(lancs: LancamentoResumo[] = LANCAMENTOS) {
  const c = buildMonthCards('2026', '__all__', [], lancs, CONTAS).find(x => x.anoMes === MES);
  if (!c) throw new Error('cartao de marco nao veio');
  return c;
}

/** A regua ANTIGA — `movimentoNaConta(l, '')`, que degenerava no sinal. */
function movimentoComoAntes(lancs: LancamentoResumo[] = LANCAMENTOS): number {
  return r2(lancs.reduce((acc, l) => {
    const v = Math.abs(Number(l.valor) || 0);
    return (l.tipo_operacao || '').startsWith('1-') ? acc + v : acc - v;
  }, 0));
}

describe('cartão agregado — a transferência interna não é saída', () => {
  it('soma os cartões por conta: +300 −200 −500(uma perna) +30(sem conta) = −370', () => {
    expect(cartaoAgregado().saldoCalculado).toBe(-370);
  });

  it('a transferência de UMA PERNA SÓ continua saindo — 500 saíram de verdade', () => {
    const semAPernaSolta = LANCAMENTOS.filter(l => l.conta_destino_id !== FORA);
    /* Sem ela: +300 −200 +30 = 130. Com ela: −370. A diferença é os 500. */
    expect(cartaoAgregado(semAPernaSolta).saldoCalculado).toBe(130);
    expect(r2(130 - cartaoAgregado().saldoCalculado)).toBe(500);
  });

  it('a régua antiga erra exatamente o valor da transferência interna', () => {
    /* −1370 contra −370: os 1000 que só trocaram de bolso. */
    expect(movimentoComoAntes()).toBe(-1370);
    expect(r2(cartaoAgregado().saldoCalculado - movimentoComoAntes())).toBe(1000);
  });

  it('sem transferência nenhuma as duas réguas empatam — o caso que enganou agosto', () => {
    const semTransferencia = LANCAMENTOS.filter(l => !l.tipo_operacao.startsWith('3-'));
    expect(cartaoAgregado(semTransferencia).saldoCalculado).toBe(movimentoComoAntes(semTransferencia));
    expect(cartaoAgregado(semTransferencia).saldoCalculado).toBe(130);
  });

  it('o selo do sem-conta continua nomeando os dois lados', () => {
    const c = cartaoAgregado();
    expect(c.semContaEntradas).toBe(50);
    expect(c.semContaSaidas).toBe(20);
  });
});
