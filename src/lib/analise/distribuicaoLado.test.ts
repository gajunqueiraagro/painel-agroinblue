/**
 * OS DOIS LADOS DA DISTRIBUIÇÃO — FIN-PAINEL-SAFRA-02.
 *
 * ⚠ NASCE DE UMA PERGUNTA QUE A TELA CRIAVA SEM RESPONDER: "Entradas R$ 4,99 mi" ao lado de
 * "Receita Operacional R$ 2,74 mi" parece erro de conta. Não é — o resto é captação de
 * financiamento —, mas a tela não tinha onde dizer isso. O `lado` é a resposta, e é a MESMA
 * função: duas contas para a mesma pergunta divergiriam no primeiro ajuste.
 */
import { describe, it, expect } from 'vitest';
import { distribuicaoEconomica } from './analiseAgregacoes';

const it_ = (mov: number, macro: string | null, tipo = mov > 0 ? '1-Entradas' : '2-Saídas',
  centroPlano: string | null = null, escopo: string | null = 'agricultura') =>
  ({ mov, tipo, macro, centroPlano, escopo });

const ITENS = [
  it_(2_742_022, 'Receita Operacional'),
  it_(2_250_000, 'Entrada Financeira'),
  it_(-1_884_526, 'Custeio Produção', '2-Saídas', 'Mão de Obra'),
  it_(-5_747_998, 'Investimento na Fazenda'),
  it_(-999, 'Custeio Produção', '3-Transferências'),   // tesouraria: fora dos dois lados
  it_(500, null, '3-Transferências'),                   // idem
  it_(0, 'Receita Operacional'),                        // zero não é lado nenhum
];

describe('lado do caixa', () => {
  it('o padrão continua sendo saída — nenhum chamador antigo muda', () => {
    const { ranking, totalGeral } = distribuicaoEconomica(ITENS, 'macro');
    expect(ranking.map(r => r.chave)).toEqual(['Investimento na Fazenda', 'Custeio Produção']);
    expect(totalGeral).toBe(1_884_526 + 5_747_998);
  });

  it('o lado da entrada mostra receita e captação separadas', () => {
    const { ranking, totalGeral } = distribuicaoEconomica(ITENS, 'macro', 'entrada');
    expect(ranking.map(r => r.chave)).toEqual(['Receita Operacional', 'Entrada Financeira']);
    expect(ranking.map(r => r.total)).toEqual([2_742_022, 2_250_000]);
    /* O total das entradas é maior que a receita — e é exatamente o que a tela precisava
       poder explicar em vez de deixar o operador conferindo de cabeça. */
    expect(totalGeral).toBe(4_992_022);
    expect(totalGeral).toBeGreaterThan(2_742_022);
  });

  it('transferência fica fora dos DOIS lados', () => {
    const soTransf = [it_(-999, 'X', '3-Transferências'), it_(500, 'Y', '3-Transferências')];
    expect(distribuicaoEconomica(soTransf, 'macro').totalGeral).toBe(0);
    expect(distribuicaoEconomica(soTransf, 'macro', 'entrada').totalGeral).toBe(0);
  });

  it('valor zero não conta em lado nenhum', () => {
    const zero = [it_(0, 'Receita Operacional')];
    expect(distribuicaoEconomica(zero, 'macro').ranking).toEqual([]);
    expect(distribuicaoEconomica(zero, 'macro', 'entrada').ranking).toEqual([]);
  });

  it('a folha só existe do lado da saída — a pergunta não cabe no outro', () => {
    expect(distribuicaoEconomica(ITENS, 'macro').folhaCusteio).toBe(1_884_526);
    expect(distribuicaoEconomica(ITENS, 'macro', 'entrada').folhaCusteio).toBe(0);
  });

  it('por negócio, o lado da entrada usa os mesmos rótulos de atividade', () => {
    const { ranking } = distribuicaoEconomica(ITENS, 'negocio', 'entrada');
    expect(ranking.map(r => r.chave)).toEqual(['Agricultura']);
    expect(ranking[0].total).toBe(4_992_022);
  });
});
