/**
 * OC-BOITEL-VALOR-01 A4 — o realizado vence a projecao nas outras linhas da previsao.
 *
 * ⚠ OS NUMEROS SAO DO PROTO (25/09/2026), linha por linha de `zoo_operacao_boitel`:
 *   Vera 7f7de76f — projetado: adiantamento 41.646 + 770 sanitario = 42.416; frete 4.500 e notas
 *     3.000 pelo produtor (7.500). Realizado: adiantamento 46.458,50; frete 3.991,80 e notas
 *     1.952,33 pelo produtor (5.944,13). Despesas do abate ficam no acerto (nao entram).
 *   RRCC da0b8577 — projetado: frete 3.000 e notas 3.000 pelo produtor (6.000); realizado: zero.
 * ⚠ O CASO DA RRCC E' O QUE JUSTIFICA O "ITEM ZERADO": pelo realizado nao ha despesa fora do boitel,
 * e o compromisso de 6.000 que a projecao gerou fica sem linha que o sustente.
 */
import { describe, it, expect } from 'vitest';
import { custosDaVendaBoitel, type BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';
import { boitelVazio } from '@/components/venda/BoitelBlocosModais';
import { avisoDoCompromissoPendente } from '@/hooks/useOperacaoComercial';
import { recusaDaPrincipalManual } from '@/components/compra/AbaCompromissosOC';

const base = (o: Partial<BoitelEdicao>): BoitelEdicao => ({
  ...boitelVazio(), qtdCabecas: 55, pesoInicial: 300, dias: 103, gmd: 1.2,
  rendimentoEntrada: 50, rendimento: 55, precoVendaArroba: 330, custoDiaria: 18.46,
  custoFreteNoBoitel: false, notasEnvioNoBoitel: false, despesasAbateNoBoitel: true, outrosNoBoitel: true,
  ...o,
});

const VERA_PROJ = base({
  possuiAdiantamento: true, valorAdiantamentoDiarias: 41646, valorAdiantamentoSanitario: 770,
  custoFrete: 4500, custoNotasEnvio: 3000, despesasAbate: 4000, dataAdiantamento: '2026-06-01',
});
const VERA_REAL = base({
  possuiAdiantamento: true, valorAdiantamentoDiarias: 46458.5,
  custoFrete: 3991.8, custoNotasEnvio: 1952.33, despesasAbate: 2327.93, dataAdiantamento: '2026-06-01',
  qtdAbatida: 55, valorTotalAbate: 366587,
});
const RRCC_PROJ = base({ qtdCabecas: 74, custoFrete: 3000, custoNotasEnvio: 3000, despesasAbate: 3000 });
const RRCC_REAL = base({ qtdCabecas: 74, custoFrete: 0, custoNotasEnvio: 0, despesasAbate: 0, qtdAbatida: 74, valorTotalAbate: 609890.97 });

describe('custosDaVendaBoitel — qual linha alimenta adiantamento e despesas fora do boitel', () => {
  it('Vera 7f7de76f com realizado aplicado: a linha REALIZADO', () => {
    const c = custosDaVendaBoitel({ realizado: VERA_REAL, projetado: VERA_PROJ });
    expect(c?.fonte).toBe('realizado');
    expect(c?.antecipado).toBe(46458.5);
    expect(c?.foraDoBoitel).toBe(5944.13);
    expect(c?.dados.dataAdiantamento).toBe('2026-06-01');
  });

  it('Vera sem realizado aplicado (so o rascunho): a projecao, e o numero e outro', () => {
    /* O rascunho do realizado e' uma copia da projecao, sem os dois fatos do papel — o mesmo
       predicado do A3 o recusa. E a diferenca de numero prova que a fonte mudou de verdade. */
    const rascunho = { ...VERA_REAL, qtdAbatida: undefined, valorTotalAbate: undefined };
    const c = custosDaVendaBoitel({ realizado: rascunho, projetado: VERA_PROJ });
    expect(c?.fonte).toBe('projetado');
    expect(c?.antecipado).toBe(42416);
    expect(c?.foraDoBoitel).toBe(7500);
  });

  it('RRCC da0b8577: o realizado ZERA as despesas fora do boitel que a projecao dizia 6.000', () => {
    expect(custosDaVendaBoitel({ realizado: RRCC_REAL, projetado: RRCC_PROJ })).toMatchObject({
      fonte: 'realizado', foraDoBoitel: 0, antecipado: 0,
    });
    expect(custosDaVendaBoitel({ realizado: null, projetado: RRCC_PROJ })?.foraDoBoitel).toBe(6000);
  });

  it('despesas do abate descontadas no acerto nao entram — o seletor de lado continua valendo', () => {
    const c = custosDaVendaBoitel({ realizado: { ...VERA_REAL, despesasAbateNoBoitel: false }, projetado: VERA_PROJ });
    expect(c?.foraDoBoitel).toBe(5944.13 + 2327.93);
  });

  it('sem linha nenhuma: nada a dizer', () => {
    expect(custosDaVendaBoitel({ realizado: null, projetado: null })).toBeNull();
  });
});

describe('o revalorar com compromisso pendente vira aviso', () => {
  it('pendente: diz o valor em que ficou e o caminho', () => {
    const t = avisoDoCompromissoPendente({ compromisso: { acao: 'pendente', id: 'c', valor_anterior: 42416, status: 'programado' } });
    expect(t).toMatch(/^O compromisso programado ficou em R\$\s42\.416,00\. Use Atualizar compromisso na aba Financeiro\.$/);
  });

  it('as outras acoes, e a resposta sem o campo, nao avisam nada', () => {
    for (const acao of ['atualizado', 'ja_no_valor', 'sem_compromisso'] as const) {
      expect(avisoDoCompromissoPendente({ compromisso: { acao, id: null, valor_anterior: null, status: null } })).toBeNull();
    }
    expect(avisoDoCompromissoPendente({})).toBeNull();
  });
});

describe('o "+ Novo compromisso" manual recusa a principal na divergencia', () => {
  const BLOQUEIO = 'Acerto do boitel R$ 882.608,62 · reaplique o Realizado';
  it('principal com o bloqueio do A3: recusa com a mesma frase', () => {
    expect(recusaDaPrincipalManual('principal', BLOQUEIO)).toBe(BLOQUEIO);
  });
  it('obrigacao nao obedece; principal sem bloqueio passa', () => {
    expect(recusaDaPrincipalManual('obrigacao', BLOQUEIO)).toBeNull();
    expect(recusaDaPrincipalManual('principal', null)).toBeNull();
  });
});
