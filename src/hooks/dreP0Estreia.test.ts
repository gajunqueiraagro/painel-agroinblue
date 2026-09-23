import { describe, it, expect } from 'vitest';
import { lerLinhas } from './useDrePecuaria';

/**
 * A AUSÊNCIA DO VPB CHEGA À TELA COMO "—", NUNCA COMO ZERO — VPB-INICIO-01.
 *
 * ⚠ ESTE ARQUIVO NASCE DE UM DEFEITO MEDIDO, não de zelo: até a migration
 * `20261027131300_dre_pecuaria_p0_estreia`, a RPC mandava `vpb_operacional: null` para as fazendas
 * sem P0 e o hook passava `vbp`, `margem` e `lucro_liquido` por `num()`, que devolve 0 para
 * qualquer coisa não finita. O Lucro líquido de 2020 do NJ era calculado com VPB zero e a tela
 * mostrava o número como se fosse apurado.
 * ⚠ E NENHUM DOS SETE GATES VIA ISSO. `num()` compila, o build passa, a suíte passava: o defeito
 * só aparecia num cliente cujo histórico começa dentro do período aberto. Por isso a trava é aqui,
 * na função que traduz o JSON, e não numa asserção de tela.
 */

/** Uma linha da RPC com tudo numérico, para o teste sobrescrever só o que interessa. */
const linhaRpc = (o: Record<string, unknown> = {}) => ({
  vendas: 100, outras_receitas: 0, receita_bruta: 100, deducoes: 0, receita_liquida: 100,
  vpb_operacional: 50, reposicao: 10, vbp: 140, custo_variavel: 20, margem: 120,
  custo_fixo: 30, rateio_adm: 5, resultado_operacional: 85, juros: 5, resultado_periodo: 80,
  efeito_mercado: 7, resultado_com_mercado: 87, investimento: 12, lucro_liquido: 75,
  juros_proprio: 5, juros_rateado: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 1, v_fim_p0: 2, v_fim_p1: 3, cab_ini: 4, cab_fim: 5, cab_media: 4 },
  producao: { ha_medio: 10, at_produzida: 1, at_desfrutada: 1, cab_desfrutada: 1, at_comprada: 0, cab_comprada: 0 },
  sem_p0: false, sem_p1: false, p0_origem: 'fechamento',
  centros: [], centros_juros: [],
  ...o,
});

/** As seis chaves que herdam o `null` do VPB. */
const DEPENDENTES = ['vbp', 'margem', 'resultado_operacional', 'resultado_periodo',
  'resultado_com_mercado', 'lucro_liquido'] as const;

describe('o VPB ausente não vira zero na cascata', () => {
  it('com tudo presente, nada é nulo — a busca sabe achar o caso bom', () => {
    const l = lerLinhas(linhaRpc());
    expect(l.vpb_operacional).toBe(50);
    for (const k of DEPENDENTES) expect(l[k]).not.toBeNull();
    expect(l.lucro_liquido).toBe(75);
  });

  /* ⚠ É ESTE O CASO QUE JUSTIFICA O ARQUIVO. Antes do fix, todos estes viravam 0 — e 0 num DRE é
     um número que o operador soma, não uma ausência que ele investiga. */
  it('VPB nulo derruba as seis dependentes para null, nunca para 0', () => {
    const l = lerLinhas(linhaRpc({
      vpb_operacional: null, vbp: null, margem: null, resultado_operacional: null,
      resultado_periodo: null, resultado_com_mercado: null, lucro_liquido: null,
    }));
    expect(l.vpb_operacional).toBeNull();
    for (const k of DEPENDENTES) {
      expect(l[k], `${k} tem de ser null, não 0`).toBeNull();
      expect(l[k]).not.toBe(0);
    }
  });

  /* ⚠ ZERO CONTINUA SENDO ZERO. A regra é "ausência é traço"; ela não pode engolir o número 0,
     que é resposta legítima — uma fazenda pode mesmo não ter variado. */
  it('VPB zero é valor, não ausência', () => {
    const l = lerLinhas(linhaRpc({ vpb_operacional: 0, vbp: 0, lucro_liquido: 0 }));
    expect(l.vpb_operacional).toBe(0);
    expect(l.vbp).toBe(0);
    expect(l.lucro_liquido).toBe(0);
  });

  /* ⚠ O POSTGREST MANDA `numeric` COMO STRING, e é por aí que um "0" viraria `null` se o parse
     fosse feito com um `if (!v)` em vez de comparar com null. */
  it('string numérica da RPC vira número, inclusive "0"', () => {
    const l = lerLinhas(linhaRpc({ vpb_operacional: '-1864951.65', vbp: '0' }));
    expect(l.vpb_operacional).toBeCloseTo(-1864951.65, 2);
    expect(l.vbp).toBe(0);
  });
});

describe('p0_origem diz de onde veio a ponta inicial', () => {
  it('estreia: a fonte é o rebanho de partida e sem_p0 é falso', () => {
    const l = lerLinhas(linhaRpc({ p0_origem: 'estoque_inicial', sem_p0: false }));
    expect(l.p0_origem).toBe('estoque_inicial');
    expect(l.sem_p0).toBe(false);
  });

  it('sem fonte nenhuma: p0_origem nulo', () => {
    const l = lerLinhas(linhaRpc({ p0_origem: null, sem_p0: true, vpb_operacional: null }));
    expect(l.p0_origem).toBeNull();
    expect(l.sem_p0).toBe(true);
  });

  /* ⚠ VALOR DESCONHECIDO NÃO PASSA. `p0_origem` governa o selo e a frase do modal; deixar entrar
     um terceiro valor faria a tela decidir sozinha o que mostrar. */
  it('valor fora do contrato cai para null', () => {
    expect(lerLinhas(linhaRpc({ p0_origem: 'chute' })).p0_origem).toBeNull();
    expect(lerLinhas(linhaRpc({ p0_origem: undefined })).p0_origem).toBeNull();
  });
});

/**
 * O TOTAL FALA OUTRA LÍNGUA — e é por isso que o selo sumia.
 *
 * ⚠ MEDIDO NA TELA, não deduzido: com o parse lendo só `p0_origem`, o DRE do NJ em 2020 mostrava os
 * números certos e NENHUM selo, porque na visão Comparação a coluna é o TOTAL do cliente e a RPC
 * responde ali com `p0_origem_estreia` (booleano), não com a origem. O selo só apareceria na visão
 * Por fazenda — justamente onde o operador não está quando abre a tela.
 */
describe('o total traduz p0_origem_estreia para a mesma chave das fazendas', () => {
  it('total com estreia vira estoque_inicial', () => {
    const l = lerLinhas({ ...linhaRpc(), p0_origem: undefined, p0_origem_estreia: true });
    expect(l.p0_origem).toBe('estoque_inicial');
  });

  it('total sem estreia vira fechamento', () => {
    const l = lerLinhas({ ...linhaRpc(), p0_origem: undefined, p0_origem_estreia: false });
    expect(l.p0_origem).toBe('fechamento');
  });

  /* ⚠ A ORIGEM DA FAZENDA GANHA da flag do total: quando as duas chaves vêm juntas, quem manda é a
     específica — senão uma fazenda 'fechamento' dentro de um total com estreia herdaria o selo. */
  it('p0_origem explícito ganha de p0_origem_estreia', () => {
    const l = lerLinhas({ ...linhaRpc(), p0_origem: 'fechamento', p0_origem_estreia: true });
    expect(l.p0_origem).toBe('fechamento');
  });
});
