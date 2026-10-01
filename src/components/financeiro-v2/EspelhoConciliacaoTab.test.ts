/**
 * O que estes testes protegem — PR-ESPELHO-07 itens B e D.
 *
 * ⚠ O CABEÇALHO E O FECHAMENTO POR DIA TÊM DE SOMAR O MESMO CONJUNTO. Eles divergiam, e a
 * divergência era invisível porque o topo lia `sistema_completo` cru enquanto a mesa pulava
 * as transferências internas. Medido no Bradesco do Agnaldo em agosto/2026, isso valia
 * 1.206.567,85 de entrada — o operador via "diferença" no topo e "confere" logo abaixo, na
 * mesma tela, e não tinha como saber qual dos dois acreditar.
 *
 * ⚠ E O NÚMERO NÃO É INVENTADO: as proporções abaixo são o caso real reduzido. A regra que
 * a FASE 0 mediu primeiro — "sem par + conta sem extrato no mês" — reproduzia o mesmo total
 * por coincidência, e o teste `interna pareada` é o que separa as duas: com o cadastro, a
 * interna sai mesmo quando alguém a concilia à mão.
 */
import { describe, it, expect } from 'vitest';
import { montarMesa, totaisDoEspelho, sinalDoAplicado, type EspelhadosReais } from './EspelhoConciliacaoTab';

const VAZIO = {
  escopo: { cliente_id: 'c', conta_id: 'x', ano_mes: '2026-08', nome_conta: 'Bradesco' },
  saldos: { inicial: 0, final_oficial: null, periodo_ini: '2026-08-01', periodo_fim: '2026-08-31', extrato_ini: null, extrato_fim: null },
  versao: 't', gerado_em: 'agora',
};

function espelho(p: Partial<EspelhadosReais>): EspelhadosReais {
  return { ...VAZIO, ofx_completo: [], sistema_completo: [], vinculos: [], ...p };
}

const ofx = (id: string, valor: number, data = '2026-08-10') =>
  ({ extrato_id: id, data, historico: id, documento: null, valor, status: 'sem_vinculo' as const, flag_dup: false, flag_investimento: false });

const sis = (id: string, valor: number, data = '2026-08-10') =>
  ({ lancamento_id: id, data, descricao: id, centro: null, subcentro: null, valor_assinado: valor, sinal: null, status: 'sem_vinculo' as const });

const somaSistemaDaMesa = (dias: ReturnType<typeof montarMesa>) => dias.reduce((a, d) => a + d.sistema, 0);

describe('conta interna — item D', () => {
  const dados = espelho({
    ofx_completo: [ofx('e1', 500), ofx('e2', -300)],
    sistema_completo: [sis('l1', 500), sis('l2', -300), sis('interna', 1000), sis('interna2', -800)],
    vinculos: [
      { extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 500, tipo_aprovacao: 'ofx_cru', grupo_id: null },
      { extrato_id: 'e2', lancamento_id: 'l2', valor_aplicado: 300, tipo_aprovacao: 'ofx_cru', grupo_id: null },
    ],
  });
  const internos = new Set(['interna', 'interna2']);

  it('sem a regra, a interna entra no sem par e desiguala os dois lados', () => {
    const dias = montarMesa(dados, new Set());
    expect(dias[0].lancsSemPar.map((s) => s.lancamento_id)).toEqual(['interna', 'interna2']);
    expect(dias[0].internas).toEqual([]);
    expect(somaSistemaDaMesa(dias)).toBe(400);   // 200 do banco + 1000 − 800
    expect(dias[0].banco).toBe(200);
  });

  it('com a regra, sai do sem par, entra no bloco próprio e some da soma do dia', () => {
    const dias = montarMesa(dados, internos);
    expect(dias[0].lancsSemPar).toEqual([]);
    expect(dias[0].internas.map((s) => s.lancamento_id).sort()).toEqual(['interna', 'interna2']);
    expect(somaSistemaDaMesa(dias)).toBe(200);
    expect(somaSistemaDaMesa(dias)).toBe(dias[0].banco);   // o dia fecha
  });

  it('a interna continua VISÍVEL — sai da conta, não da tela', () => {
    const dias = montarMesa(dados, internos);
    expect(dias[0].internas).toHaveLength(2);
    expect(dias[0].internas.map((s) => s.valor_assinado).sort((a, b) => a - b)).toEqual([-800, 1000]);
  });

  it('interna PAREADA também sai — é cadastro, não ausência de par', () => {
    /* ⚠ O teste que separa a regra do cadastro da correlação que a FASE 0 mediu: se a saída
       dependesse de "não ter par", conciliar a interna à mão a traria de volta para a conta. */
    const comPar = espelho({
      ofx_completo: [ofx('e9', 1000)],
      sistema_completo: [sis('interna', 1000)],
      vinculos: [{ extrato_id: 'e9', lancamento_id: 'interna', valor_aplicado: 1000, tipo_aprovacao: 'manual', grupo_id: null }],
    });
    const t = totaisDoEspelho(comPar, new Set(['interna']));
    expect(t.entradasSistema).toBe(0);
    expect(t.entradasBanco).toBe(1000);
  });
});

describe('cabeçalho — item B', () => {
  const dados = espelho({
    ofx_completo: [ofx('e1', 2000), ofx('e2', -1500)],
    sistema_completo: [
      sis('cru', 21),           // cru de entrada: SEMPRE esteve dentro, e continua
      sis('l1', 1979),
      sis('l2', -1500),
      sis('interna', 900),
    ],
    vinculos: [
      { extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 1979, tipo_aprovacao: 'ofx_cru', grupo_id: null },
      { extrato_id: 'e2', lancamento_id: 'l2', valor_aplicado: 1500, tipo_aprovacao: 'ofx_cru', grupo_id: null },
    ],
  });

  it('o cru de entrada NÃO é filtrado — a premissa de que o cabeçalho o excluía era falsa', () => {
    const t = totaisDoEspelho(dados, new Set(['interna']));
    expect(t.entradasSistema).toBe(2000);   // 21 do cru + 1979
    expect(t.entradasBanco).toBe(2000);
    expect(t.difEntradas).toBe(0);
    expect(t.difSaidas).toBe(0);
  });

  it('sem excluir a interna, o topo acusa diferença que o dia não tem', () => {
    const t = totaisDoEspelho(dados, new Set());
    expect(t.entradasSistema).toBe(2900);
    expect(t.difEntradas).toBe(-900);
  });

  it('topo e fechamento por dia somam o MESMO conjunto', () => {
    const internos = new Set(['interna']);
    const t = totaisDoEspelho(dados, internos);
    const dias = montarMesa(dados, internos);
    expect(t.entradasSistema + t.saidasSistema).toBe(somaSistemaDaMesa(dias));
    expect(t.entradasBanco + t.saidasBanco).toBe(dias.reduce((a, d) => a + d.banco, 0));
  });
});

/**
 * CONC-MESA-SINAL-01 — o valor aplicado leva o sinal do LANÇAMENTO, não o do extrato.
 * O caso real: NJ Sicredi Lavoura 06/04/2026, depósito +402.395,07 = Venda +428.386,40 − Senar 856,76 − Descontos
 * 25.134,57, casado em bloco. Com o sinal do extrato para todos, a mesa somava as deduções e o dia mostrava −51.982,66
 * (= 2 × 25.991,33) onde o caixa do banco fecha igual ao extrato.
 */
describe('CONC-MESA-SINAL-01 — sinal do aplicado', () => {
  const v = (e: string, l: string, ap: number, grupo: string | null = 'b1') =>
    ({ extrato_id: e, lancamento_id: l, valor_aplicado: ap, tipo_aprovacao: 'agrupamento_manual', grupo_id: grupo });
  const deposito = espelho({
    ofx_completo: [ofx('dep', 402395.07, '2026-04-06')],
    sistema_completo: [sis('venda', 428386.40, '2026-04-06'), sis('senar', -856.76, '2026-04-06'), sis('desc', -25134.57, '2026-04-06')],
    vinculos: [v('dep', 'venda', 428386.40), v('dep', 'senar', 856.76), v('dep', 'desc', 25134.57)],
  });

  it('depósito com filhas de sinal oposto: o dia soma o líquido e fecha com o banco (diferença 0)', () => {
    const [d] = montarMesa(deposito, new Set());
    expect(d.sistema).toBeCloseTo(402395.07, 2);
    expect(d.banco - d.sistema).toBeCloseTo(0, 2);
    const [p] = d.pareados;
    expect(p.soma).toBeCloseTo(402395.07, 2);
    expect(p.diferenca).toBeCloseTo(0, 2);
  });

  it('a dedução tem sinal negativo dentro do depósito; a venda, positivo', () => {
    const [d] = montarMesa(deposito, new Set());
    const sinais = d.pareados[0].filhas.map((f) => [f.lancamento_id, sinalDoAplicado(f.sis, 402395.07)]);
    expect(Object.fromEntries(sinais)).toEqual({ venda: 1, senar: -1, desc: -1 });
  });

  it('saída com um estorno de sinal oposto: o mesmo cálculo, na direção do extrato', () => {
    const dados = espelho({
      ofx_completo: [ofx('s', -900)],
      sistema_completo: [sis('pag', -1000), sis('estorno', 100)],
      vinculos: [v('s', 'pag', 1000), v('s', 'estorno', 100)],
    });
    const [d] = montarMesa(dados, new Set());
    expect(d.sistema).toBeCloseTo(-900, 2);
    expect(d.pareados[0].soma).toBeCloseTo(900, 2);        // na direção do extrato, como sempre
    expect(d.pareados[0].diferenca).toBeCloseTo(0, 2);
  });

  it('N:1 inalterado: o lançamento conta pelo valor dele, uma vez', () => {
    const dados = espelho({
      ofx_completo: [ofx('a', -60), ofx('b', -40)],
      sistema_completo: [sis('t', -100)],
      vinculos: [v('a', 't', 60, null), v('b', 't', 40, null)],
    });
    const [d] = montarMesa(dados, new Set());
    expect(d.paredosN1).toHaveLength(1);
    expect(d.sistema).toBe(-100);
    expect(d.paredosN1[0].diferenca).toBe(0);
  });

  it('fallback: lançamento fora do sistema_completo leva o sinal do extrato (a regra de antes)', () => {
    const dados = espelho({
      ofx_completo: [ofx('e', -300)],
      sistema_completo: [],
      vinculos: [v('e', 'fora', 300, null)],
    });
    const [d] = montarMesa(dados, new Set());
    expect(d.sistema).toBe(-300);
    expect(sinalDoAplicado(undefined, -300)).toBe(-1);
    expect(sinalDoAplicado({ valor_assinado: 0 }, 50)).toBe(1);
  });
});
