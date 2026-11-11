/**
 * O que este teste trava — a cascata da pecuária na ordem certa, com os números do NJ.
 *
 * ⚠ ELE NAO PODE CHAMAR A RPC: o papel do MCP de leitura não tem `execute` em
 * `fn_dre_pecuaria`, então os números abaixo são os da HOMOLOGAÇÃO, digitados como fixture. O que
 * o teste prova é o que o front faz com eles — a ordem das linhas, as duas variações separadas,
 * o "—" de quem não tem fechamento e a coluna Total no fim. O casamento com o banco é o item 1
 * da homologação do Gabriel.
 * ⚠ A ORDEM DAS LINHAS É O DRE, e ela mora no front: a RPC devolve um objeto de chaves sem
 * ordem. Se alguém reordenar `LINHAS_PEC`, é aqui que aparece.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PecDrePanel, ComparacaoPec, MaisPec, colunasDaVisao, type EntradaVisoes, type VisaoPec } from '@/pages/PecDrePanel';
import { LINHAS_PEC_RESUMIDO_GRADE } from '@/components/agri/drePecRegua';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

/* DRE-LEVE-01 — a coluna de % (`data-pct`: "% VBP" na pecuária, "% RL" na lavoura) tem prova própria em `dreLeveNumeros.test.tsx`; aqui as
   células de uma linha se leem SEM ela (`semPct`), nas posições de antes, e o que estes testes provam não muda. */
declare global { interface HTMLTableRowElement { readonly semPct: HTMLTableCellElement[] } }
/* DRE-LAYOUT-04 — nas 4 linhas de resultado o % do VBP mora ABAIXO do número, na mesma célula (`data-pct-abaixo`): o número se lê sem ele */
const soNumero = (td?: Element | null) => {
  const sub = td?.querySelector('[data-pct-abaixo]')?.textContent ?? '';
  const t = td?.textContent ?? '';
  return sub && t.endsWith(sub) ? t.slice(0, -sub.length) : t;
};
Object.defineProperty(HTMLTableRowElement.prototype, 'semPct', { configurable: true,
  get(this: HTMLTableRowElement) { return [...this.cells].filter(c => !c.hasAttribute('data-pct')); } });


const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  /* ⚠ JUROS NASCEM `null` — é o que a RPC devolve em toda coluna de fazenda desde a RPC-02. Só o
     Total tem número, e o fixture do Total o põe explicitamente. */
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  /* ⚠ AS TRÊS CHAVES DA CASCATA-02: o lucro líquido e os juros repartidos entre próprios e
     rateados. Zero no fixture; quem precisa do número o põe explicitamente. */
  lucro_liquido: 0, juros_proprio: 0, juros_rateado: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
  /* ⚠ ÁREA NASCE NULA no fixture, e de propósito: é o estado de quem não tem fechamento de área, e
     a sub-coluna tem de dizer "—". Quem quer número o põe explicitamente. */
  producao: { ha_medio: null, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  centros: [], centros_juros: [], ...o,
});

const DRE: DrePecuaria = {
  periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
  rateio_adm: { pool: 720000, bruto: 2880000, criterio: 'cabecas medias no periodo' },
  fazendas: [
    {
      fazenda_id: 'f1', nome: 'Pureza',
      linhas: linhas({
        vendas: 9000000, vpb_operacional: 844774.72, resultado_periodo: 1500000,
        custo_variavel: 3000000,
        /* ⚠ `cab_fim` ≠ `cab_media` DE PROPÓSITO: é o que prova qual dos dois divide o R$/cab.
           Iguais, o teste passaria verde lendo o denominador errado. */
        patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 3000, cab_media: 2500 },
        /* ⚠ A ÁREA É O DIVISOR DO R$/ha e é DIFERENTE da cabeça média de propósito: iguais, o teste
           passaria verde dividindo pelo número errado. 9.000.000 / 3.000 ha = 3.000,00. */
        producao: { ha_medio: 3000, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
        centros: [{ bloco: 'variavel', centro: 'Nutrição', valor: 3000000, a_pagar: 0 }],
      }),
    },
    /* ⚠ A FAZENDA SEM FECHAMENTO É CASO DE TESTE, não borda rara: sem P0 ou sem P1 as duas
       variações vêm NULAS, e a tela tem de dizer "—" nas duas — nunca 0,00. */
    {
      fazenda_id: 'f2', nome: 'Sto. Expedito',
      linhas: linhas({
        resultado_periodo: -3208702.24, vpb_operacional: null, efeito_mercado: null,
        p0_fonte: null, p1_fonte: null,
      }),
    },
  ],
  total: linhas({
    vendas: 17869000.08, vpb_operacional: -193238, resultado_periodo: 2994408.81,
    efeito_mercado: 2618562,
    /**
     * ⚠ ESTES SEIS SÃO INTERNAMENTE COERENTES, e isso é o ponto: `vbp` e `margem` NÃO são números
     * digitados — são a conta dos outros quatro, como a RPC os monta
     * (`vbp = receita_liquida + vpb_operacional − reposicao`; `margem = vbp − custo_variavel`).
     * Um fixture em que a base não fecha com as parcelas provaria um percentual que o banco nunca
     * produziria.
     * ⚠ OS COMPONENTES SÃO OS DO NJ 25/26, MEDIDOS NO BANCO (receita líquida, reposição e custo
     * variável), não estimados: 17.900.865,27 − 193.238,00 − 1.866.408,21 = 15.841.219,06 de VBP,
     * e 15.841.219,06 − 6.669.221,73 = 9.171.997,33 de margem — 57,9 % do VBP.
     */
    receita_liquida: 17900865.27, reposicao: 1866408.21,
    vbp: 15841219.06, custo_variavel: 6669221.73, margem: 9171997.33,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 12000, cab_media: 10000 },
    /* ⚠ 5.000 ha NO TOTAL, e ela não é a soma das fazendas do fixture de propósito: a RPC devolve
       a área do total à parte, e a sub-coluna do Total divide por ELA. */
    producao: { ha_medio: 5000, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
    /* ⚠ OS JUROS SÓ NO TOTAL, com a lista própria — os números do NJ jan-ago/26. */
    juros: 58633.56,
    centros_juros: [{ bloco: 'juros', centro: 'Juros de Financiamento Pecuária', valor: 58633.56, a_pagar: 0 }],
    /* ⚠ OS CENTROS DO §CHECKS — dois dos sete do NJ, e é a coluna TOTAL que os lista: um centro
       que só existe numa fazenda tem de aparecer para todas, senão a filha some conforme a coluna
       que se olha. */
    centros: [
      { bloco: 'variavel', centro: 'Nutrição', valor: 5145471.65, a_pagar: 0 },
      { bloco: 'variavel', centro: 'Pastagem', valor: 878655.25, a_pagar: 0 },
    ],
  }),
};

/** As colunas de uma visão sobre o fixture — a mesma função que a tela usa. */
const colunas = (visao: VisaoPec, extra: Partial<EntradaVisoes> = {}) => colunasDaVisao({
  visao, de: '2025-07', ate: '2026-06', real: DRE, meta: null, carregandoMeta: false, anos: [], ...extra,
});
/* ⚠ A COMPARAÇÃO É UMA VISÃO SÓ DESDE O fix4, com a referência por parâmetro: 'meta' ou o número de
   anos anteriores. Os três atalhos abaixo leem como as três visões antigas para quem conhece a
   tela, mas montam pela MESMA função — que é o ponto do PR. */
const comMeta = (extra: Partial<EntradaVisoes> = {}) =>
  colunas('comparacao', { referencia: 'meta', ...extra });
const comAnos = (n: number, extra: Partial<EntradaVisoes> = {}) =>
  colunas('comparacao', { referencia: n, ...extra });
/* ⚠ OS CASOS ANTIGOS SÃO DA VISÃO "Por fazenda": ela é a grade de antes, sem mudança. */
const montar = () => render(
  <PecDrePanel colunas={colunas('fazenda')} alturaCartao={null} cartaoRef={{ current: null }} />,
);
const linhasDaTabela = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
/* ⚠ O RÓTULO VEM COLADO NA ETIQUETA no `textContent` — "Efeito de mercadoestimado". Comparar por
   igualdade faria as três linhas com etiqueta sumirem do teste, que é o pior resultado: passa
   verde sem olhar justamente as que carregam ressalva. Casa por prefixo. */
const rotulos = () => linhasDaTabela().map(tr => (tr.semPct[0]?.textContent ?? '').trim());
const indiceDe = (rot: string) => rotulos().findIndex(r => r.startsWith(rot));
const linhaDe = (rot: string) =>
  linhasDaTabela().find(tr => ((tr.semPct[0]?.textContent ?? '').trim()).startsWith(rot));
/* ⚠ NO RESUMIDO O CUSTO VARIÁVEL E O CUSTO FIXO MORAM DENTRO DO CUSTEIO, que nasce fechado —
   DRE-RESUMIDO-CUSTEIO-01. Quem precisa deles abre o grupo pelo rótulo, como o operador faz. */
const abrirCusteio = () => {
  const td = linhaDe('(−) Custeio de produção')?.semPct[0];
  if (td) fireEvent.click(td);
};

/* ══════════════ OS CHIPS DE UNIDADE — DRE-UNIDADES-01 ══════════════ */

describe('as unidades da pecuária', () => {
  /* ⚠ O FIXTURE SEPARA OS QUATRO DIVISORES DE PROPÓSITO — área 1.000 ha, 500 cabeças médias, 12
     meses, 2.000 @ vendidas, 1.000 @ produzidas e 100 @ compradas. Com números iguais, um teste
     passaria verde dividindo pela base errada, que é exatamente o defeito que o R$/@ pode ter. */
  const BASES: DrePecuaria = {
    ...DRE,
    fazendas: [],
    total: linhas({
      vendas: 1000000, custo_variavel: 400000, reposicao: 50000,
      patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 500 },
      producao: { ha_medio: 1000, at_produzida: 1000, at_desfrutada: 2000, cab_desfrutada: null,
        at_comprada: 100, cab_comprada: null },
    }),
  };
  const montarCom = (unidades: readonly ('rs' | 'ha' | 'cab' | 'arroba')[], dre = BASES) => render(
    <PecDrePanel colunas={colunasDaVisao({ visao: 'comparacao', de: '2025-07', ate: '2026-06',
      real: dre, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} unidades={unidades} />,
  );

  it('R$/cab/mês divide pela cabeça média e pelos meses da coluna', () => {
    montarCom(['rs', 'cab']);
    /* 1.000.000 / 500 cab / 12 meses = 166,67. Sem os meses daria 2.000,00. */
    expect(linhaDe('Vendas')?.semPct[2]?.textContent).toBe('166,67');
  });

  it('R$/@ usa a @ VENDIDA na receita, a COMPRADA na reposição e a PRODUZIDA no custo', () => {
    montarCom(['rs', 'arroba']);
    /* Receita: 1.000.000 / 2.000 @ vendidas = 500,00 (pela produzida daria 1.000,00). */
    expect(linhaDe('Vendas')?.semPct[2]?.textContent).toBe('500,00');
    /* Reposição: 50.000 / 100 @ compradas = 500,00. */
    expect(linhaDe('(−) Reposição')?.semPct[2]?.textContent).toBe('500,00');
    /* Custo: 400.000 / 1.000 @ produzidas = 400,00 (pela vendida daria 200,00). */
    expect(linhaDe('(−) Custo variável')?.semPct[2]?.textContent).toBe('400,00');
  });

  /* ⚠ A @ PRODUZIDA DA META VEM NULA DA RPC (medido em 22/09: `prod` só é preenchida no
     realizado), e emprestar a do realizado faria o custo da meta se ler por uma produção que não é
     dela. Traço é a resposta honesta. */
  it('sem @ produzida, o custo sai em traço — nunca com a base de outra coluna', () => {
    const SEM_PRODUZIDA: DrePecuaria = {
      ...BASES,
      total: linhas({ ...BASES.total, producao: { ...BASES.total.producao, at_produzida: null } }),
    };
    montarCom(['rs', 'arroba'], SEM_PRODUZIDA);
    expect(linhaDe('(−) Custo variável')?.semPct[2]?.textContent).toBe('—');
    /* A receita continua, porque a base dela (@ vendida) existe. */
    expect(linhaDe('Vendas')?.semPct[2]?.textContent).toBe('500,00');
  });

  it('cada chip marcado é uma coluna, na ordem fixa, e o R$ pode ficar de fora', () => {
    const { unmount } = montarCom(['rs', 'ha']);
    /* DRE-LAYOUT-04: rótulo + R$ + R$/ha — a coluna "% VBP" saiu (o % é a linha fina abaixo das 4 de resultado). */
    expect([...document.querySelectorAll('colgroup col')]).toHaveLength(3);
    unmount();
    montarCom(['ha', 'cab', 'arroba']);
    /* Sem o R$: rótulo + três unidades. */
    const cols = [...document.querySelectorAll('colgroup col')];
    expect(cols).toHaveLength(4);
    expect(document.body.textContent).toContain('R$/ha');
    expect(linhaDe('Vendas')?.semPct[1]?.textContent).toBe('1.000,00');
  });

  /* ⚠ O PISO DE 104px É DO GRUPO — DRE-UNIDADES-01b, ajustado no 01c. Medido a 1126 antes do
     conserto: com só o R$/@ marcado o grupo caía a 64px e "Faz. Sto. Expedito" (85,9px a
     10px/500) saía cortado em toda coluna. O nome do cabeçalho não depende de quantas unidades o
     produtor quis ver — e 104 é o que ELE precisa (85,9 + 14 de padding + folga), não o padrão de
     abertura: com 160 a coluna ficava larga demais para o número que mostra.
     ⚠ E O TESTE OLHA O `<colgroup>`, não o `th`: com `table-layout: fixed` é ele a única
     autoridade sobre largura, e é onde um piso mal distribuído apareceria. */
  const largurasDoColgroup = () =>
    [...document.querySelectorAll<HTMLTableColElement>('colgroup col')].map(c => c.style.width);

  /* ⚠ DRE-LAYOUT-04: SEM A COLUNA "% VBP" (56px), um chip só volta a ficar abaixo do piso — e o grupo vai a 104px. */
  it('com um chip só, o grupo vai ao piso de 104px', () => {
    montarCom(['arroba']);
    expect(largurasDoColgroup()).toEqual(['200px', '104px']);
  });

  it('duas unidades ficam como são; o padrão de abertura não muda', () => {
    const { unmount } = montarCom(['ha', 'cab']);
    expect(largurasDoColgroup()).toEqual(['200px', '80px', '80px']);
    unmount();
    montarCom(['rs', 'ha']);
    expect(largurasDoColgroup()).toEqual(['200px', '104px', '80px']);
  });

  it('acima do piso ninguém é esticado: três unidades ficam como são', () => {
    montarCom(['ha', 'cab', 'arroba']);
    expect(largurasDoColgroup()).toEqual(['200px', '80px', '80px', '80px']);
  });
});

/* ══════════════ O RATEIO ADMINISTRATIVO — DRE-RATEIO-FIX-01 ══════════════ */

describe('o rateio administrativo da pecuária', () => {
  /* ⚠ NÃO EXISTE MODO QUE TIRE O RATEIO DO RESULTADO, e este caso está aqui porque ele já existiu:
     o 2665e9c7 trouxe da lavoura um "Custos diretos" que somava o rateio de volta aos subtotais —
     e isso mostrava lucro que não existe. O custo administrativo é real e sai do resultado em
     qualquer leitura. Na lavoura o seletor não mexe no resultado: muda só ONDE o custo aparece, e
     a RPC de lá devolve os dois números para isso. Aqui a tela mostra o que a RPC mandou.
     ⚠ O FIXTURE É COERENTE DE PROPÓSITO: 1.000.000 de margem − 200.000 de custo fixo − 120.000 de
     rateio = 680.000, como a RPC o monta. Um fixture em que a conta não fecha deixaria passar
     justamente a soma indevida que este caso recusa. */
  const COM_RATEIO: DrePecuaria = {
    ...DRE,
    fazendas: [],
    total: linhas({
      margem: 1000000, custo_fixo: 200000, rateio_adm: 120000,
      resultado_operacional: 680000, resultado_periodo: 680000,
      efeito_mercado: 20000, resultado_com_mercado: 700000,
      producao: { ha_medio: 1000, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
    }),
  };

  it('o resultado é o da RPC, com o rateio descontado e visível na própria linha', () => {
    render(<PecDrePanel colunas={colunasDaVisao({ visao: 'comparacao', de: '2025-07', ate: '2026-06',
      real: COM_RATEIO, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(linhaDe('(−) Rateio administrativo')?.semPct[1]?.textContent).toBe('120.000,00');
    /* ⚠ SEM ▲ DESDE O DRE-LEVE-01 (D6): o azul cheio saiu, e o número voltou a ter só a cor do sinal. */
    expect(soNumero(linhaDe('= Lucro operacional')?.semPct[1])).toBe('680.000,00');
    expect(soNumero(linhaDe('= Lucro líquido')?.semPct[1])).toBe('680.000,00');
    expect(soNumero(linhaDe('= Resultado econômico')?.semPct[1])).toBe('700.000,00');
    /* O que este caso proíbe: o resultado somado de volta ao rateio (800.000) em qualquer célula. */
    expect(document.body.textContent).not.toContain('800.000,00');
  });
});

describe('a cascata do DRE da pecuária', () => {
  /**
   * ⚠ A CASCATA FECHA NO LUCRO LÍQUIDO — DRE-CASCATA-03a, e este caso mudou de contrato por isso:
   * ele afirmava que a faixa "Abaixo da linha de caixa" vinha logo antes do Investimento. A faixa
   * NÃO EXISTE MAIS — o investimento entrou na conta, e o que vem depois dele é o lucro líquido.
   * Falha certa, pela razão certa; atualizado, nunca afrouxado.
   */
  it('a cascata sai na ordem do DRE e fecha no investimento, sem lucro líquido', () => {
    montar();
    const r = rotulos();
    expect(r[0]).toBe('Vendas');
    expect(indiceDe('= Receita líquida')).toBeLessThan(indiceDe('= VBP'));
    expect(indiceDe('= VBP')).toBeLessThan(indiceDe('= Margem de contribuição'));
    expect(indiceDe('= Lucro líquido')).toBeLessThan(indiceDe('Efeito de mercado'));
    /**
     * ⚠ O LUCRO LÍQUIDO SAIU DA GRADE — DRE-DESTAQUE-01, e o investimento passou a ser a ÚLTIMA
     * linha. Investimento tem payback longo e depreciação: o que sobra depois dele não é o
     * resultado do período, e encerrar a grade ali fazia um ano ser lido pela lente de uma compra
     * que dura dez.
     * ⚠ AFIRMAR SÓ A AUSÊNCIA NÃO BASTA: sem o `indiceDe('= Resultado econômico')` abaixo, este
     * caso passaria verde também se a grade inteira tivesse sumido.
     */
    /* ⚠ A AUSENCIA NAO SE AFIRMA MAIS PELO TEXTO — DRE-DESTAQUE-02: "= Lucro líquido" era o nome
       da linha que o -01 tirou da grade, e passou a ser o nome NOVO de `resultado_periodo`. Ver o
       rótulo aqui provaria o contrário do que o caso quer. O que sobrou de verificável é a FORMA:
       a grade termina no investimento, e o total que o antecede é o resultado econômico. */
    expect(indiceDe('= Resultado econômico')).toBeLessThan(indiceDe('(−) Investimento no período'));
    expect(indiceDe('(−) Investimento no período')).toBe(r.length - 1);
    expect(r.some(x => x === 'Abaixo da linha de caixa')).toBe(false);
    /* ⚠ E O VBP DIZ O QUE É: a sigla vem com o nome por extenso ao lado, não decorada. */
    expect(r.find(x => x.startsWith('= VBP'))).toContain('valor bruto de produção');
  });

  /**
   * ⚠ O TOTAL É A PRIMEIRA COLUNA — PR-DRE-PECUARIA-02 §2a, e este teste é o que trava a ordem.
   *
   * ⚠ ELE MUDOU NESTE PR, e a mudança foi ACUSADA por este mesmo arquivo: a versão anterior lia
   * `cells[length-2]` (o Total era o último) e passou a devolver "0,00", que é o R$ da última
   * fazenda. Falha certa, pela razão certa — o contrato da grade mudou e o teste cobrou.
   * ⚠ A ORDEM É: rótulo, Total R$, Total R$/cab, e então cada fazenda em R$ e R$/cab.
   */
  const CEL_TOTAL_RS = 1;
  const CEL_TOTAL_CAB = 2;
  /** A segunda fazenda: 3 e 4 são a primeira; 5 e 6 são a segunda. */
  const CEL_FAZ2_RS = 5;

  it('o Total é a PRIMEIRA coluna, não a última', () => {
    montar();
    const cabecalhos = Array.from(document.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'))
      .map(th => th.textContent ?? '');
    /* O primeiro é a coluna de rótulos; o segundo tem de ser o Total. */
    expect(cabecalhos[0]).toContain('Fazenda');
    expect(cabecalhos[1]).toContain('Total');
  });

  /* ⚠ OS NÚMEROS DA HOMOLOGAÇÃO, na coluna Total: é o que o Gabriel confere primeiro. */
  it('a coluna Total traz os números do NJ', () => {
    montar();
    const total = (rot: string) => soNumero(linhaDe(rot)?.semPct[CEL_TOTAL_RS]);
    expect(total('Vendas')).toBe('17.869.000,08');
    expect(total('Variação por produção')).toBe('-193.238,00');
    expect(total('= Lucro líquido')).toBe('2.994.408,81');
    expect(total('Efeito de mercado')).toBe('2.618.562,00');
  });

  it('fazenda sem fechamento mostra "—" nas duas variações, nunca zero', () => {
    montar();
    const celula = (rot: string) => linhaDe(rot)?.semPct[CEL_FAZ2_RS]?.textContent ?? '';
    expect(celula('Variação por produção')).toBe('—');
    expect(celula('Efeito de mercado')).toBe('—');
  });

  /**
   * ⚠ A LINHA DE % É LEITURA DE APOIO, NÃO UMA LINHA DO DRE — §3.
   *
   * ⚠ A BASE É O VBP, e o NÚMERO está travado aqui de propósito. Ela já foi receita líquida
   * durante uma rodada deste PR, e a troca tem razão medida: com a receita como base, o Resultado
   * da Atividade deu 203% em janeiro na Santa Rita, porque a variação de estoque entra no
   * numerador e nunca passou pela receita. Trocar a base de volta muda estes números, e é aqui
   * que a mudança aparece em vez de passar calada.
   */
  /* ⚠ DRE-LAYOUT-04 (Gabriel 09/11 + ajuste do Chat 10:25): A COLUNA "% VBP" DO DRE-LEVE-01 SAIU — o % do VBP fica COLADO LOGO ABAIXO do
     número, NA MESMA CÉLULA (`data-pct-abaixo`, acima da régua), só em Margem de contribuição, Lucro operacional, Lucro líquido e
     Resultado econômico; sem linha própria (o rótulo vai no title). A base continua o VBP, e o número continua travado. */
  const pctDe = (rot: string) => {
    const subs = [...(linhaDe(rot)?.querySelectorAll('[data-pct-abaixo]') ?? [])].map(d => d.textContent ?? '');
    return subs.length ? subs : null;
  };
  it('o % do VBP fica abaixo do número, na mesma célula, só nas 4 linhas de resultado', () => {
    montar();
    expect(rotulos().some(r => r.includes('% do VBP'))).toBe(false);
    expect(linhaDe('= Margem de contribuição')?.querySelector('[data-pct-abaixo]')?.getAttribute('title')).toBe('Margem de contribuição em % do VBP desta coluna');
    /* ⚠ O NÚMERO, na coluna Total: 9.171.997,33 / 15.841.219,06 = 57,9 %. */
    expect(pctDe('= Margem de contribuição')?.[0]).toBe('57,9 %');
    expect(pctDe('= Lucro operacional')?.[0]).toMatch(/%$/);
    expect(pctDe('= Lucro líquido')?.[0]).toMatch(/%$/);
    expect(pctDe('= Resultado econômico')?.[0]).toMatch(/%$/);
    /* nas outras, nada */
    expect(pctDe('= VBP')).toBeNull();
    expect(pctDe('Vendas')).toBeNull();
    expect(pctDe('= Receita líquida')).toBeNull();
    /* e nenhuma coluna de % na grade */
    expect(document.querySelectorAll('[data-pct]')).toHaveLength(0);
  });

  /**
   * ⚠ VBP ≤ 0 DÁ TRAÇO, NUNCA 0% — a regra do DRE gerencial, trazida inteira. A segunda fazenda
   * do fixture tem VBP zero, e é ela que prova a regra.
   */
  it('sem VBP positivo o percentual é traço, não 0%', () => {
    montar();
    /* as colunas de % na ordem: Total, a primeira fazenda, a segunda (VBP zero) */
    expect(pctDe('= Margem de contribuição')?.[2]).toBe('—');
  });

  /**
   * ⚠ OS GRUPOS NASCEM FECHADOS (§4), e este caso protege o tamanho da grade: com os seis
   * abertos por padrão a cascata de dezoito linhas viraria trinta e tantas, e a tela que o PR-10
   * encolheu com régua tipográfica cresceria de volta por outro caminho.
   */
  it('os grupos de centro nascem fechados, e abrem no clique', () => {
    montar();
    const textos = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      .map(tr => tr.semPct[0]?.textContent ?? '');
    /* ⚠ FECHADO PRIMEIRO — com os seis grupos abertos por padrão a cascata de dezoito linhas
       viraria trinta e tantas, e a grade que o PR-10 encolheu cresceria de volta por outro
       caminho. */
    expect(textos().some(r => r.includes('Nutrição'))).toBe(false);

    /* ⚠ E AGORA A PROVA DE QUE A BUSCA SABE ACHAR — a lição do `check:tdz`, que se auto-testa
       antes de varrer. Sem este clique, "não achei Nutrição" passaria verde num fixture sem
       centro nenhum, e o teste não estaria medindo nada. */
    /* ⚠ `fireEvent`, NÃO `element.click()`: o clique cru dispara fora do `act()` do React, e o
       re-render não acontece antes da asserção — o teste diria "não abriu" sobre um componente
       que abriu. Foi exatamente o que aconteceu na primeira rodada deste caso. */
    const grupo = linhaDe('(−) Custo variável');
    if (grupo) fireEvent.click(grupo.semPct[0]);
    expect(textos().some(r => r.includes('Nutrição'))).toBe(true);
    expect(textos().some(r => r.includes('Pastagem'))).toBe(true);
  });

  /**
   * ⚠ A COLUNA "Administrativo" SAIU COM A RPC-02 — e com ela o `title` que a explicava.
   *
   * Ela entrava por juros carimbados na fazenda e por lançamentos cancelados; a RPC deixou de
   * devolvê-la. Este caso trava que a tela não volte a marcar coluna nenhuma como "sem fazenda
   * produtiva": se a frase reaparecer, é porque alguém trouxe de volta a explicação de uma coluna
   * que não existe mais.
   */
  it('nenhuma coluna é marcada como "sem fazenda produtiva"', () => {
    montar();
    expect(screen.queryByTitle('lançamentos de pecuária sem fazenda produtiva')).toBeNull();
    /* A prova de que a busca sabe achar: o cabeçalho das fazendas está lá. */
    expect(screen.getByText('Sto. Expedito')).toBeTruthy();
  });

  /**
   * ⚠ JUROS SÃO DA ATIVIDADE — DRE-PEC-RPC-02. Nas fazendas a RPC devolve `null`, e a célula diz
   * "—" (ausência), nunca "0,00" (valor). O R$/cab fica vazio e a célula não abre lista: no
   * Total, o número e o clique continuam.
   */
  /**
   * ⚠ OS JUROS PASSARAM A TER NÚMERO POR FAZENDA — DRE-CASCATA-02/03a, e este caso mudou com eles:
   * ele afirmava que a célula da fazenda era "—" porque a RPC mandava `null`. Agora ela manda o
   * valor (próprio + a parcela rateada do Administrativo), e o traço voltaria a ser mentira.
   * ⚠ O FIXTURE NÃO TEM JUROS POR FAZENDA (segue `null`), e é isso que este caso continua travando:
   * sem dado, traço — o que mudou é que agora é O DADO que decide, não a linha.
   */
  it('juros: a célula segue o dado da coluna — traço quando não há, número quando há', () => {
    const abrir = vi.fn();
    render(<PecDrePanel colunas={colunas('fazenda')} alturaCartao={null} cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    const juros = linhaDe('(−) Despesas financeiras');
    expect(juros?.semPct[3]?.textContent).toBe('—');
    expect(juros?.semPct[4]?.textContent).toBe('');
    expect(juros?.semPct[CEL_FAZ2_RS]?.textContent).toBe('—');
    expect(juros?.semPct[CEL_TOTAL_RS]?.textContent).toBe('58.633,56');

    if (juros) fireEvent.click(juros.semPct[3]);
    expect(abrir).not.toHaveBeenCalled();
    if (juros) fireEvent.click(juros.semPct[CEL_TOTAL_RS]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ fazendaId: null, bloco: 'juros' }));
  });

  /**
   * ⚠ O R$/ha DIVIDE PELA ÁREA DA PRÓPRIA COLUNA — TELA-03a, e o fixture separa os números de
   * propósito: a Pureza tem 3.000 ha e 2.500 cabeças médias, então 9.000.000 de vendas dão
   * 3.000,00 por hectare. Pela cabeça média daria 3.600,00 e, com o divisor de meses do R$/cab
   * antigo, 300,00 — são esses dois números que este caso recusa.
   * ⚠ E NÃO DIVIDE PELOS MESES: hectare é do período inteiro.
   */
  it('R$/ha divide pela área da coluna, sem dividir pelos meses', () => {
    montar();
    expect(linhaDe('Vendas')?.semPct[4]?.textContent).toBe('3.000,00');
    expect(document.body.textContent).toContain('R$/ha');
    expect(document.body.textContent).not.toContain('R$/cab');
  });

  /**
   * ⚠ A CASCATA TEM DE FECHAR NA SUB-COLUNA, e fecha porque o divisor é UM SÓ para todas as
   * linhas: VBP = receita líquida + variação por produção − reposição, e dividir os quatro pelo
   * mesmo hectare preserva a identidade. Com 5.000 ha no Total:
   * 3.580,17 − 38,65 − 373,28 = 3.168,24 — o mesmo que 15.841.219,06 / 5.000.
   */
  it('R$/ha: a cascata fecha na sub-coluna (VBP = receita líquida + variação − reposição)', () => {
    montar();
    const sub = (rotulo: string) => linhaDe(rotulo)?.semPct[2]?.textContent ?? '';
    expect(sub('= Receita líquida')).toBe('3.580,17');
    expect(sub('Variação por produção')).toBe('-38,65');
    expect(sub('(−) Reposição')).toBe('373,28');
    expect(sub('= VBP')).toBe('3.168,24');
    /* A identidade, nos números crus: o arredondamento da soma bate com a soma arredondada. */
    expect(Number((17900865.27 - 193238 - 1866408.21) / 5000).toFixed(2)).toBe('3168.24');
  });

  /**
   * ⚠ COLUNA SEM ÁREA DIZ "—", NUNCA UM NÚMERO EMPRESTADO: a fazenda sem fechamento de área tem
   * `ha_medio` nulo, e dividir pela área da vizinha faria o R$/ha falar de outra terra. É a mesma
   * regra do `null` das variações — ausência é traço.
   */
  it('R$/ha: coluna sem área mostra traço em vez de número', () => {
    montar();
    /* Sto. Expedito: `producao.ha_medio` nulo no fixture. */
    expect(linhaDe('= Lucro líquido')?.semPct[6]?.textContent).toBe('—');
  });
});

/* ══════════════ AS QUATRO VISÕES — DRE-PEC-TELA-02 ══════════════ */

/** A meta do fixture: vendas de fevereiro do NJ e um resultado planejado. ⚠ A variação de rebanho
    vem IGUAL à do realizado, como a RPC a devolve (patrimônio não tem cenário) — é ela que prova que
    a coluna Meta a esconde. */
const META: DrePecuaria = {
  ...DRE,
  fazendas: [],
  rateio_adm: { pool: 0, bruto: 0, criterio: 'cabecas medias no periodo' },
  total: linhas({
    vendas: 451560, resultado_periodo: 400000, vpb_operacional: -193238, juros: 0,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 12000, cab_media: 10000 },
    /* ⚠ A ÁREA DA META É DIFERENTE DA DO REALIZADO (4.000 contra 5.000) DE PROPÓSITO: é o que
       prova que a coluna Meta divide pela área DELA. Com a do realizado o R$/ha daria 90,31;
       com a dela, 112,89 — e é esse o número que o caso exige. */
    producao: { ha_medio: 4000, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  }),
};
const SEM_META: DrePecuaria = { ...META, total: linhas({ juros: 0 }) };

const cabecalhos = () => Array.from(document.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'))
  .map(th => th.textContent ?? '');

/**
 * A SEGUNDA LINHA DO CABEÇALHO — os rótulos de sub-coluna ("R$", "R$/ha", "Δ R$", "Δ %").
 *
 * ⚠ ELE EXISTE PORQUE O GRUPO DO Δ EMUDECEU no fix7: afirmar só que o grupo está vazio passaria
 * verde também se a coluna inteira tivesse sumido. Os casos afirmam as DUAS coisas — o grupo sem
 * texto E o rótulo "Δ R$" presente —, que é a mesma lição do auto-teste do `check:tdz`.
 */
const rotulosDeSlot = () => Array.from(document.querySelectorAll<HTMLTableCellElement>('thead tr:nth-child(2) th'))
  .map(th => th.textContent ?? '');

describe('as duas visões', () => {
  /* ⚠ SEM ANO ANTERIOR NA RESPOSTA, a comparação por anos mostra só o período da tela — e é o
     estado em que a grade nasce enquanto a lista de anos não chegou. */
  it('comparação sem ano anterior: uma coluna só, com o rateio administrativo inteiro', () => {
    render(<PecDrePanel colunas={comAnos(1)} alturaCartao={null} cartaoRef={{ current: null }} />);
    const h = cabecalhos();
    expect(h).toHaveLength(2);
    expect(h[1]).toContain('jul/25-jun/26');
    /* ⚠ O "10.000 cab med." SAIU DO CABEÇALHO — 03b-fix1/adendo item 9: ele custava uma LINHA de
       cabeçalho em toda coluna para responder uma pergunta que não é a do DRE. O caso continua
       cobrando o que restou (o nome da coluna) e passou a AFIRMAR a ausência, para que devolvê-lo
       ao cabeçalho por engano falhe aqui. `cab_media` segue lida — o rateio administrativo é por
       cabeça média, e o caso do rateio, logo abaixo, é quem prova isso. */
    expect(h[1]).not.toContain('cab med.');
    expect(soNumero(linhaDe('= Lucro líquido')?.semPct[1])).toBe('2.994.408,81');
    /* O rateio aparece como linha também no Global: é custo da pecuária, só não se divide aqui. */
    expect(linhaDe('(−) Rateio administrativo')).toBeTruthy();
  });

  /* ⚠ A REFERÊNCIA FICA À ESQUERDA DO ATUAL desde o fix4 — era "Realizado | Meta | Δ" e virou
     "Meta | Atual | Δ", a mesma lei do A28: a comparação vem DEPOIS do que compara. Os índices
     andaram com ela, e este caso foi atualizado para o contrato novo, nunca afrouxado. */
  it('referência Meta: Meta | Atual | Δ — meta nunca soma, patrimônio da meta, drill com o cenário', () => {
    const abrir = vi.fn();
    render(<PecDrePanel colunas={comMeta({ meta: META, deltas: ['rs', 'pct'] })} alturaCartao={null}
      cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    const h = cabecalhos();
    expect(h).toHaveLength(4);
    expect(h[1]).toContain('Meta');
    expect(h[2]).toContain('Atual');
    /* ⚠ CONTRATO NOVO — fix7 item B: o grupo do Δ não tem mais nome nem sub. "Δ" e "real − meta"
       repetiam o que as colunas ao lado já dizem ("Meta", "Atual"), em três linhas de cabeçalho.
       O rótulo da sub-coluna ("Δ R$", "Δ %") é quem nomeia a célula, e é o único que ficou. */
    expect(h[3]).toBe('');
    expect(rotulosDeSlot()).toContain('Δ R$');
    /* rótulo 0 · Meta R$ 1 e R$/ha 2 · Atual R$ 3 e R$/ha 4 · Δ R$ 5 e Δ% 6. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[1]?.textContent).toBe('451.560,00');
    /* ⚠ A META DIVIDE PELA ÁREA DELA, 4.000 ha: 451.560 / 4.000 = 112,89. Pela área do realizado
       (5.000) daria 90,31 — o número que este caso recusa. */
    expect(vendas?.semPct[2]?.textContent).toBe('112,89');
    expect(vendas?.semPct[3]?.textContent).toBe('17.869.000,08');
    /* O Δ é a diferença: 17.869.000,08 − 451.560,00. */
    expect(vendas?.semPct[5]?.textContent).toBe('17.417.440,08');
    /* ⚠ CONTRATO NOVO — DRE-META-PATRIMONIO-01-fix1: a meta TEM variação de rebanho desde o
       DRE-META-PATRIMONIO-01 (P0 real, P1 da meta validada), e a coluna Meta a lê como a Atual. Era
       "—" nas três células; agora é o número, o R$/ha pela área DELA (−193.238 / 4.000 = −48,31) e o
       Δ (real − meta = −193.238 − (−193.238) = 0). */
    const vpb = linhaDe('Variação por produção');
    expect(vpb?.semPct[1]?.textContent).toBe('-193.238,00');
    expect(vpb?.semPct[2]?.textContent).toBe('-48,31');
    expect(vpb?.semPct[5]?.textContent).toBe('0,00');

    if (vendas) fireEvent.click(vendas.semPct[1]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ cenario: 'meta', bloco: 'venda', fazendaId: null }));
    /* ⚠ A SUB-COLUNA ABRE O MESMO DRILL DO R$ ao lado — é a mesma linha noutra unidade, e o
       operador clica onde o olho está. */
    abrir.mockClear();
    if (vendas) fireEvent.click(vendas.semPct[2]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ cenario: 'meta', bloco: 'venda' }));
    /* ⚠ O DELTA NÃO ABRE NADA, e agora ele é a célula 5 (a Meta ganhou sub-coluna): uma diferença
       não tem lançamento para listar. */
    abrir.mockClear();
    if (vendas) fireEvent.click(vendas.semPct[5]);
    expect(abrir).not.toHaveBeenCalled();
  });

  /* ⚠ O SUBTÍTULO ENCURTOU NO 01c e a frase inteira foi para o `title`: com o grupo em 104px,
     "sem meta no período" (100,1px de texto) virava reticências. Encurtar sem guardar o longo
     seria apagar — por isso o teste cobra os DOIS. */
  it('referência Meta sem meta no período: a coluna fica, toda em "—", e diz por quê', () => {
    render(<PecDrePanel colunas={comMeta({ meta: SEM_META })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(cabecalhos()[1]).toContain('sem meta');
    expect(document.querySelector('[title="sem meta no período"]')).not.toBeNull();
    expect(linhaDe('Vendas')?.semPct[1]?.textContent).toBe('—');
    expect(linhaDe('Vendas')?.semPct[2]?.textContent).toBe('—');
  });

  /* ⚠ ORDEM CRONOLÓGICA — DRE-PERIODO-01: o mais ANTIGO à esquerda e o período da tela à direita,
     como se lê uma série temporal e como o modal de histórico já fazia. Era o contrário, e o teste
     que travava a ordem antiga foi atualizado para o contrato novo, nunca afrouxado. */
  it('referência 2 anos: cronológico — o mais antigo à esquerda, o atual à direita; ano sem dado é "—"', () => {
    const abrir = vi.fn();
    const ANO1: DrePecuaria = { ...DRE, total: linhas({ vendas: 15000000 }) };
    render(<PecDrePanel colunas={comAnos(2, { anos: [
      { de: '2024-07', ate: '2025-06', dre: ANO1, carregando: false },
      { de: '2023-07', ate: '2024-06', dre: { ...DRE, fazendas: [] }, carregando: false },
    ] })} alturaCartao={null} cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    /* ⚠ O `\u00a0` DE CADA CABEÇALHO ERA A LINHA DE SUBTÍTULO VAZIA, e ela não existe mais (item
       9): sem nenhuma coluna com subtítulo, a linha inteira deixa de ser renderizada. O que este
       caso trava é a ORDEM CRONOLÓGICA, e ela continua inteira aqui. */
    expect(cabecalhos().slice(1)).toEqual(['jul/23-jun/24', 'jul/24-jun/25', 'jul/25-jun/26']);
    /* ⚠ AGORA TEM SUB-COLUNA — TELA-03a: cada ano divide pela própria área, e a visão deixou de
       sair só em R$. */
    expect(document.body.textContent).toContain('R$/ha');
    /* ⚠ ÍNDICES REMAPEADOS COM A ORDEM — cada ano ocupa DUAS células: ano−2 (sem dado) R$ 1 ·
       ano−1 R$ 3 · atual R$ 5 e R$/ha 6. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[1]?.textContent).toBe('—');
    expect(vendas?.semPct[3]?.textContent).toBe('15.000.000,00');
    expect(vendas?.semPct[5]?.textContent).toBe('17.869.000,08');
    expect(vendas?.semPct[6]?.textContent).toBe('3.573,80');
    /* O drill da coluna de um ano abre aquele ano — e o ano−1 agora é a terceira coluna. */
    if (vendas) fireEvent.click(vendas.semPct[3]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ de: '2024-07', ate: '2025-06', cenario: 'realizado' }));
  });

  it('Por fazenda: Total + uma coluna por fazenda, R$ e R$/cab em cada', () => {
    montar();
    const h = cabecalhos();
    expect(h).toHaveLength(4);
    expect(h[2]).toContain('Pureza');
    expect(h[3]).toContain('Sto. Expedito');
  });

  /**
   * DRE-LEVE-01 (D5a): OS CARDS "Comparação" E "Por fazenda" SAÍRAM — viraram botões nas faixas de filtro. A referência é o "Comparar" da
   * 1ª faixa (`ComparacaoPec`) e o "Por fazenda", o rateio e o Δ moram no "Mais ▾" da 2ª (`MaisPec`). Os três casos do card antigo passaram
   * para cá, com o mesmo conteúdo: as seis referências, um gesto um escritor, a Meta sem meta no período clicável com o porquê, e a Meta
   * apagada com o motivo para quem não vê meta.
   */
  const ativo = () => Array.from(document.querySelectorAll('[data-testid="dre-comparar"] button'))
    .filter(b => b.className.includes('bg-primary')).map(b => b.textContent);
  it('o Comparar: as seis referências, a escolhida marcada; escolher chama só a referência; por fazenda, nenhuma marcada', () => {
    const escolherRef = vi.fn();
    const { unmount } = render(<ComparacaoPec visao="comparacao" referencia={1} onReferencia={escolherRef} meta={null}
      carregandoMeta anoAnterior={null} carregandoAnoAnterior={false} motivoSemMeta={null} />);
    const refs = Array.from(document.querySelectorAll('[data-testid="dre-comparar"] button')).map(b => b.textContent);
    expect(refs).toEqual(['Meta', '1 ano', '2', '3', '4', '5']);
    expect(ativo()).toEqual(['1 ano']);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(escolherRef).toHaveBeenCalledWith(3);
    /* ⚠ SEM O RESULTADO DO PERÍODO NO CONTROLE: ele está na grade. */
    expect(document.body.textContent).not.toContain('2.994.408,81');
    unmount();
    render(<ComparacaoPec visao="fazenda" referencia={1} onReferencia={() => {}} meta={null}
      carregandoMeta anoAnterior={null} carregandoAnoAnterior={false} motivoSemMeta={null} />);
    expect(ativo()).toEqual([]);
    const comparar = screen.getByTestId('dre-comparar');
    expect(comparar.className).toContain('opacity-50');
    expect(comparar.getAttribute('title')).toContain('Por fazenda ligado');
  });

  it('o Mais ▾: rateio, Δ e "Ver por fazenda" num menu; a marca do botão muda de cor, nunca de texto', () => {
    const onVisao = vi.fn();
    const onDeltas = vi.fn();
    const props = { rateioNosGrupos: false, onRateioNosGrupos: () => {}, deltas: [], onDeltas, deltaIndisponivel: false,
      onVisao, nFazendas: 2 };
    const { unmount } = render(<MaisPec {...props} visao="comparacao" />);
    const textoDesligado = screen.getByTestId('dre-mais').textContent;
    expect(textoDesligado).toBe('Mais ▾rateio · Δ · por fazenda');
    fireEvent.keyDown(screen.getByTestId('dre-mais'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Ver por fazenda · 2 fazendas/ }));
    expect(onVisao).toHaveBeenCalledWith('fazenda');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Δ %' }));
    expect(onDeltas).toHaveBeenCalledWith(['pct']);
    unmount();
    render(<MaisPec {...props} visao="fazenda" />);
    expect(screen.getByTestId('dre-mais').textContent).toBe(textoDesligado);
    expect(screen.getByText('por fazenda').className).toContain('text-primary');
    /* na visão por fazenda o Δ não se aplica: apagado, com o porquê */
    fireEvent.keyDown(screen.getByTestId('dre-mais'), { key: 'Enter' });
    const delta = screen.getByRole('menuitemcheckbox', { name: 'Δ R$' });
    expect(delta.getAttribute('aria-disabled')).toBe('true');
    expect(delta.getAttribute('title')).toBe('Disponível na comparação de períodos');
  });

  /* ⚠ SEM META NO PERÍODO A OPÇÃO CONTINUA CLICÁVEL, e o `title` é que avisa: escondê-la faria a
     pergunta sumir junto com a resposta, e a coluna em traço é o sentinela certo para "não sei". */
  it('sem meta no período, a opção Meta fica e o title diz por quê', () => {
    render(<ComparacaoPec visao="comparacao" referencia="meta" onReferencia={() => {}} meta={null}
      carregandoMeta={false} anoAnterior={null} carregandoAnoAnterior={false} motivoSemMeta={null} />);
    const meta = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Meta');
    expect(meta).toBeTruthy();
    expect(meta?.getAttribute('title')).toBe('sem meta no período');
    expect(meta?.hasAttribute('disabled')).toBe(false);
  });
  /* ACESSOS-FIN-02 — quem nao ve^ meta: a opcao Meta CONTINUA, apagada, com o motivo no `title`, e o clique nao escolhe. */
  it('com `motivoSemMeta`, a opção Meta fica apagada com o motivo e não escolhe; as outras escolhem', () => {
    const escolherRef = vi.fn();
    const MOTIVO = 'meta: só para quem tem o Planejamento';
    render(<ComparacaoPec visao="comparacao" referencia={1} onReferencia={escolherRef} meta={null}
      carregandoMeta={false} anoAnterior={null} carregandoAnoAnterior={false} motivoSemMeta={MOTIVO} />);
    const botao = (t: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === t);
    expect(botao('Meta')?.hasAttribute('disabled')).toBe(true);
    expect(botao('Meta')?.getAttribute('title')).toBe(MOTIVO);
    fireEvent.click(botao('Meta')!);
    expect(escolherRef).not.toHaveBeenCalled();
    /* a busca sabe achar: as outras referencias seguem escolhendo */
    fireEvent.click(botao('2')!);
    expect(escolherRef).toHaveBeenCalledWith(2);
  });
  /**
   * ⚠ × ANOS COM CINCO: SEIS COLUNAS, TODAS RESOLVIDAS — o defeito da homologação de 22/09 (anos 2..N
   * presos em esqueleto). A causa era da RPC, não da grade: com a view recursiva cada chamada levava
   * ~8 s, o statement_timeout do papel authenticated é 8 s, e o react-query refazia cada uma até três
   * vezes. Este caso trava o lado da grade: coluna que chegou tem número, ano sem dado tem "—", e
   * nenhuma fica pulsando.
   */
  it('referência 5 anos: seis colunas resolvidas, ano sem dado em "—", nenhum esqueleto', () => {
    const ano = (k: number, vendas: number) => ({
      de: `${2025 - k + 1}-07`, ate: `${2026 - k + 1}-06`,
      dre: { ...DRE, total: linhas({ vendas }) }, carregando: false,
    });
    const anos = [ano(1, 15000000), ano(2, 14000000), ano(3, 13000000), ano(4, 12000000),
      { de: '2020-07', ate: '2021-06', dre: { ...DRE, fazendas: [] }, carregando: false }];
    render(<PecDrePanel colunas={comAnos(5, { anos })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(cabecalhos()).toHaveLength(7);
    /* ⚠ SEIS COLUNAS × DUAS CÉLULAS, EM ORDEM CRONOLÓGICA: a coluna 0 é o ano MAIS ANTIGO (o sem
       dado) e a última é o período da tela. O R$ da coluna k está em 1 + 2k: o ano sem dado é k=0
       → célula 1; o de 12.000.000 (ano−4) é k=1 → célula 3; o atual é k=5 → célula 11. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[1]?.textContent).toBe('—');
    expect(vendas?.semPct[3]?.textContent).toBe('12.000.000,00');
    expect(vendas?.semPct[11]?.textContent).toBe('17.869.000,08');
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});

/* ══════════════ RESUMIDO × DETALHADO — DRE-CASCATA-03b ══════════════ */

/**
 * ⚠ O RESUMIDO SOMA, NÃO RECALCULA, e é isto que este bloco trava: as duas linhas compostas
 * ("Variação do estoque por produção" e "(−) Custo fixo") têm de dar exatamente o que o Detalhado
 * mostra em duas linhas. Se alguém as transformar num subtotal próprio, o DRE passa a ter duas
 * verdades e a diferença aparece aqui.
 */
describe('o DRE resumido', () => {
  /* ⚠ OS NÚMEROS SÃO DESIGUAIS DE PROPÓSITO: com valores iguais, uma soma trocada daria o mesmo. */
  const BASE: DrePecuaria = {
    ...DRE,
    fazendas: [],
    total: linhas({
      vendas: 1000, outras_receitas: 300, receita_bruta: 1300,
      vpb_operacional: 900, reposicao: 200,
      custo_fixo: 500, rateio_adm: 120,
      producao: { ha_medio: 100, at_produzida: 10, at_desfrutada: 10, cab_desfrutada: null,
        at_comprada: 1, cab_comprada: null },
    }),
  };
  const montarModo = (modo: 'resumido' | 'detalhado') => render(
    <PecDrePanel modo={modo} colunas={colunasDaVisao({ visao: 'comparacao', de: '2025-07', ate: '2026-06',
      real: BASE, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />,
  );

  /* ⚠ ERAM QUINZE — DRE-RESUMIDO-CUSTEIO-01: a Margem saiu e Custo variável/Custo fixo viraram filhas do
     Custeio, que nasce fechado. A contagem é a das defs que não moram num grupo. */
  it('as linhas do Resumido, com o Custeio fechado, e as de detalhe não aparecem', () => {
    montarModo('resumido');
    const r = rotulos().filter(x => x !== '% do VBP' && x !== 'por hectare');
    expect(r).toHaveLength(LINHAS_PEC_RESUMIDO_GRADE.filter(d => !d.grupo).length);
    expect(r.some(x => x === 'Vendas')).toBe(false);
    expect(r.some(x => x === '(−) Reposição')).toBe(false);
    expect(r.some(x => x.startsWith('(−) Rateio administrativo'))).toBe(false);
    expect(r[0]).toBe('Receita bruta');
  });

  it('a linha composta da variação é a variação MENOS a reposição', () => {
    montarModo('resumido');
    /* 900 − 200 = 700, e não 900 (só a variação) nem 1.100 (somando). */
    expect(linhaDe('Variação do estoque')?.semPct[1]?.textContent).toBe('700,00');
  });

  it('o custo fixo do resumido inclui o rateio administrativo', () => {
    montarModo('resumido');
    abrirCusteio();
    /* 500 + 120 = 620 — o mesmo que o Detalhado mostra em duas linhas. */
    expect(linhaDe('(−) Custo fixo')?.semPct[1]?.textContent).toBe('620,00');
    const { unmount } = { unmount: () => {} };
    unmount();
  });

  it('no detalhado as duas voltam a ser duas, e a soma bate', () => {
    montarModo('detalhado');
    expect(linhaDe('Variação por produção')?.semPct[1]?.textContent).toBe('900,00');
    expect(linhaDe('(−) Reposição')?.semPct[1]?.textContent).toBe('200,00');
    expect(linhaDe('(−) Custo fixo')?.semPct[1]?.textContent).toBe('500,00');
    expect(linhaDe('(−) Rateio administrativo')?.semPct[1]?.textContent).toBe('120,00');
  });

  /* ⚠ E A RECEITA BRUTA DO RESUMIDO NÃO É SOMA DO FRONT: ela é a chave `receita_bruta`, que a RPC
     já devolve. Somar vendas + outras receitas aqui criaria a segunda dona do mesmo número. */
  it('a receita bruta vem da RPC, não de uma soma da tela', () => {
    montarModo('resumido');
    expect(linhaDe('Receita bruta')?.semPct[1]?.textContent).toBe('1.300,00');
  });
});

/* ══════════════ O RATEIO ADM. NOS GRUPOS — DRE-MODAL-VALOR-01b ══════════════ */

/**
 * ⚠ OS NÚMEROS SÃO OS DO NJ 07/2025–06/2026, MEDIDOS NO BANCO em 27/09/2026 (`fn_dre_pecuaria`,
 * coluna Total): custo fixo 2.905.958,83 em seis centros, rateio administrativo 1.153.283,72 em cinco
 * grupos — quatro com centro de mesmo nome e o Financeiro sem par. A soma dos grupos é o rateio ao
 * centavo, como a RPC promete.
 * ⚠ O RESULTADO OPERACIONAL É DE FIXTURE, e o que importa nele é não mudar com o botão.
 */
describe('o rateio adm. nos grupos', () => {
  const NJ: DrePecuaria = {
    ...DRE,
    fazendas: [],
    total: linhas({
      margem: 9171997.33, custo_fixo: 2905958.83, rateio_adm: 1153283.72,
      resultado_operacional: 5112754.78, resultado_periodo: 5054121.22,
      centros: [
        { bloco: 'fixo', centro: 'Administração', valor: 182264.64, a_pagar: 0 },
        { bloco: 'fixo', centro: 'Impostos', valor: 98698.88, a_pagar: 55000 },
        { bloco: 'fixo', centro: 'Manutenção Fazenda', valor: 591414.62, a_pagar: 10753.52 },
        { bloco: 'fixo', centro: 'Mão de Obra', valor: 1249894.56, a_pagar: 0 },
        { bloco: 'fixo', centro: 'Máquinas', valor: 733224.73, a_pagar: 859.84 },
        { bloco: 'fixo', centro: 'Outros', valor: 50461.4, a_pagar: 0 },
      ],
      rateio_adm_grupos: [
        { grupo: 'Administração', valor: 444505.69 },
        { grupo: 'Financeiro', valor: 11705.73 },
        { grupo: 'Impostos', valor: 666.67 },
        { grupo: 'Mão de Obra', valor: 508689.71 },
        { grupo: 'Máquinas', valor: 187715.92 },
      ],
    }),
  };
  const montarNJ = (modo: 'resumido' | 'detalhado', rateioNosGrupos: boolean) => render(
    <PecDrePanel modo={modo} rateioNosGrupos={rateioNosGrupos}
      colunas={colunasDaVisao({ visao: 'comparacao', de: '2025-07', ate: '2026-06',
        real: NJ, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />,
  );
  const valor = (rot: string) => linhaDe(rot)?.semPct[1]?.textContent ?? null;
  const abrirCustoFixo = () => {
    const td = linhaDe('(−) Custo fixo')?.semPct[0];
    if (td) fireEvent.click(td);
  };
  /* A soma das filhas VISÍVEIS do custo fixo, lida da tela — do rótulo da mãe até o próximo "=". */
  const somaDasFilhas = () => {
    const rs = linhasDaTabela();
    const i = rs.findIndex(tr => (tr.semPct[0]?.textContent ?? '').startsWith('(−) Custo fixo'));
    let soma = 0;
    for (const tr of rs.slice(i + 1)) {
      const rot = (tr.semPct[0]?.textContent ?? '').trim();
      if (rot.startsWith('=') || rot.startsWith('(−)') || rot === '% do VBP' || rot === 'por hectare') break;
      soma += Number((tr.semPct[1]?.textContent ?? '0').replace(/\./g, '').replace(',', '.'));
    }
    return Math.round(soma * 100) / 100;
  };

  it('o botão não muda o custo fixo total nem o resultado — nos dois modos', () => {
    montarNJ('resumido', false);
    abrirCusteio();
    const cfOff = valor('(−) Custo fixo'); const roOff = valor('= Lucro operacional');
    cleanup();
    montarNJ('resumido', true);
    abrirCusteio();
    expect(valor('(−) Custo fixo')).toBe(cfOff);
    expect(cfOff).toBe('4.059.242,55');
    expect(valor('= Lucro operacional')).toBe(roOff);
    cleanup();
    /* No Detalhado a linha do rateio SAI e o custo fixo passa a ser a soma das duas: o total do custo
       fixo com rateio (custo fixo + rateio) e o resultado são os mesmos. */
    montarNJ('detalhado', false);
    expect(valor('(−) Custo fixo')).toBe('2.905.958,83');
    expect(valor('(−) Rateio administrativo')).toBe('1.153.283,72');
    const roDet = valor('= Lucro operacional');
    cleanup();
    montarNJ('detalhado', true);
    expect(valor('(−) Custo fixo')).toBe('4.059.242,55');
    expect(linhaDe('(−) Rateio administrativo')).toBeUndefined();
    expect(valor('= Lucro operacional')).toBe(roDet);
    expect(roDet).toBe(roOff);
  });

  it('ligado: cada grupo soma o seu rateio, o Financeiro vira filha "só rateio adm." e a soma fecha na mãe', () => {
    montarNJ('resumido', true);
    abrirCusteio();
    abrirCustoFixo();
    /* 1.249.894,56 direto + 508.689,71 de rateio. */
    expect(valor('Mão de Obra')).toBe('1.758.584,27');
    expect(valor('Máquinas')).toBe('920.940,65');
    /* Centro sem grupo de rateio fica como era. */
    expect(valor('Manutenção Fazenda')).toBe('591.414,62');
    const fin = linhaDe('Financeiro');
    expect(fin?.semPct[0]?.textContent).toContain('só rateio adm.');
    expect(fin?.semPct[1]?.textContent).toBe('11.705,73');
    /* A filha do rateio total sumiu — ele está dentro dos grupos. */
    expect(linhaDe('Rateio administrativo')).toBeUndefined();
    expect(somaDasFilhas()).toBe(4059242.55);
  });

  it('desligado: exatamente como antes — a filha do rateio total no Resumido, nenhum "só rateio"', () => {
    montarNJ('resumido', false);
    abrirCusteio();
    abrirCustoFixo();
    expect(valor('Mão de Obra')).toBe('1.249.894,56');
    expect(valor('Rateio administrativo')).toBe('1.153.283,72');
    expect(linhaDe('Financeiro')).toBeUndefined();
    expect(somaDasFilhas()).toBe(4059242.55);
  });

  it('a célula leva os números dela para o modal (direto, rateio do grupo, cabeças e meses)', () => {
    const onAbrirLista = vi.fn();
    render(<PecDrePanel modo="resumido" rateioNosGrupos onAbrirLista={onAbrirLista}
      colunas={colunasDaVisao({ visao: 'comparacao', de: '2025-07', ate: '2026-06',
        real: NJ, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />);
    abrirCusteio();
    abrirCustoFixo();
    const td = linhaDe('Mão de Obra')?.semPct[1];
    if (td) fireEvent.click(td);
    expect(onAbrirLista).toHaveBeenCalledWith(expect.objectContaining({
      bloco: 'fixo', centro: 'Mão de Obra',
      celula: expect.objectContaining({ direto: 1249894.56, rateio: 508689.71, grupo: 'Mão de Obra', comRateio: true, meses: 12 }),
    }));
    const tdFin = linhaDe('Financeiro')?.semPct[1];
    if (tdFin) fireEvent.click(tdFin);
    expect(onAbrirLista).toHaveBeenLastCalledWith(expect.objectContaining({
      soRateio: true, centro: 'Financeiro', celula: expect.objectContaining({ direto: null, rateio: 11705.73 }),
    }));
  });
});

/* ══════════════ O CUSTEIO DE PRODUÇÃO DO RESUMIDO — DRE-RESUMIDO-CUSTEIO-01 ══════════════ */

/**
 * ⚠ OS NÚMEROS SÃO OS DO RRCC GLOBAL 2021 do mock v4 (VBP 1.530.489,47, custo variável 249.420,35, custo
 * fixo com rateio 438.113,50, Lucro operacional 842.955,62, 339,2 ha). A divisão do custo fixo entre o
 * direto e o rateio é de fixture, desigual de propósito: o que se afirma é que a soma com o rateio é a
 * do Resumido de antes.
 * ⚠ O LUCRO OPERACIONAL É A CHAVE DA RPC, coerente com as parcelas como a RPC as monta; o teste prova que
 * a tela não o recalcula e que VBP − Custeio fecha nele ao centavo.
 */
describe('o custeio de produção do Resumido', () => {
  const RRCC21: DrePecuaria = {
    ...DRE,
    fazendas: [],
    total: linhas({
      receita_bruta: 2874203.08, deducoes: 61675.28, receita_liquida: 2812527.80,
      vpb_operacional: -1282038.33, reposicao: 0, vbp: 1530489.47,
      custo_variavel: 249420.35, margem: 1281069.12,
      custo_fixo: 300000.00, rateio_adm: 138113.50,
      resultado_operacional: 842955.62, juros: 0, resultado_periodo: 842955.62,
      producao: { ha_medio: 339.2, at_produzida: null, at_desfrutada: null, cab_desfrutada: null,
        at_comprada: null, cab_comprada: null },
      centros: [
        { bloco: 'variavel', centro: 'Nutrição', valor: 249420.35, a_pagar: 0 },
        { bloco: 'fixo', centro: 'Mão de Obra', valor: 300000.00, a_pagar: 0 },
      ],
    }),
  };
  const montarRRCC = (o: { modo?: 'resumido' | 'detalhado'; rateioNosGrupos?: boolean; unidades?: readonly ('rs' | 'ha')[];
    dre?: DrePecuaria; onAbrirLista?: () => void } = {}) => render(
    <PecDrePanel modo={o.modo ?? 'resumido'} rateioNosGrupos={o.rateioNosGrupos ?? false}
      unidades={o.unidades ?? ['rs', 'ha']} onAbrirLista={o.onAbrirLista}
      colunas={colunasDaVisao({ visao: 'comparacao', de: '2021-01', ate: '2021-12',
        real: o.dre ?? RRCC21, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />,
  );
  const num = (t: string | null | undefined) => Number((t ?? '').replace(/[^0-9,-]/g, '').replace(',', '.'));
  const rs = (rot: string) => { const td = linhaDe(rot)?.semPct[1]; return td ? soNumero(td) : null; };

  it('VBP − Custeio = Lucro operacional ao centavo, com o botão de rateio ligado e desligado', () => {
    for (const rateioNosGrupos of [false, true]) {
      montarRRCC({ rateioNosGrupos });
      expect(rs('(−) Custeio de produção')).toBe('687.533,85');
      const conta = Math.round((num(rs('= VBP')) - num(rs('(−) Custeio de produção'))) * 100);
      expect(conta).toBe(Math.round(num(rs('= Lucro operacional')) * 100));
      expect(rs('= Lucro operacional')).toContain('842.955,62');
      cleanup();
    }
  });

  it('nasce fechado; aberto mostra Custo variável e Custo fixo como filhas, que abrem os centros', () => {
    montarRRCC();
    expect(linhaDe('(−) Custo variável')).toBeUndefined();
    expect(linhaDe('(−) Custo fixo')).toBeUndefined();
    expect(linhaDe('= Margem de contribuição')).toBeUndefined();
    abrirCusteio();
    /* ⚠ A BUSCA PROVA QUE SABE ACHAR: as duas filhas aparecem depois do clique, com os números do Resumido. */
    expect(rs('(−) Custo variável')).toBe('249.420,35');
    expect(rs('(−) Custo fixo')).toBe('438.113,50');
    expect(indiceDe('(−) Custo variável')).toBeGreaterThan(indiceDe('(−) Custeio de produção'));
    expect(indiceDe('(−) Custo fixo')).toBeLessThan(indiceDe('= Lucro operacional'));
    const td = linhaDe('(−) Custo variável')?.semPct[0];
    if (td) fireEvent.click(td);
    expect(rs('Nutrição')).toBe('249.420,35');
  });

  /* ⚠ DRE-LAYOUT-04: o % do VBP é só das 4 linhas de resultado — VBP e Custeio não têm; a sublinha "por hectare" é subitem (sem fundo
     próprio). O Lucro operacional, logo abaixo do Custeio, tem a linha de %. */
  it('VBP e Custeio ganham "por hectare" (subitem, sem %); o Lucro operacional tem a linha de %', () => {
    montarRRCC({ unidades: ['rs'] });
    const rot = rotulos();
    const iVbp = rot.findIndex(r => r.startsWith('= VBP'));
    const iCusteio = rot.findIndex(r => r.startsWith('(−) Custeio de produção'));
    expect(rot[iVbp + 1]).toBe('por hectare');
    expect(rot[iCusteio + 1]).toBe('por hectare');
    expect(rot[iCusteio + 2]).toBe('= Lucro operacional');
    const linhas = linhasDaTabela();
    expect(linhas[iVbp + 1].semPct[1].textContent).toContain('R$ 4.512,06/ha');
    expect(linhas[iCusteio + 1].semPct[1].textContent).toContain('R$ 2.026,93/ha');
    /* Sem fundo próprio (o mock é branco) e na régua do subitem (13px). */
    expect(linhas[iVbp + 1].className).toContain('bg-card');
    expect(linhas[iCusteio].className).toContain('bg-card');
    expect(linhas[iVbp + 1].style.height).toBe('13px');
    expect(linhas[iCusteio + 2].querySelector('[data-pct-abaixo]')?.textContent).toMatch(/^\d+,\d %$/);
    /* as filhas do Custeio (Custo variável e Custo fixo) são subitens: sem linha de % */
    abrirCusteio();
    const temPct = (rot: string) => !!linhaDe(rot)?.querySelector('[data-pct-abaixo]');
    expect(temPct('(−) Custo variável')).toBe(false);
    expect(temPct('(−) Custo fixo')).toBe(false);
  });

  /* ⚠ DRE-LEVE-01 (D6): AS CORES DO MOCK — custo e negativo em vermelho, o resto na tinta da casa, o resultado-chave (Lucro operacional) em
     navy; o "por hectare" em cinza (vermelho no custo). Não há mais verde de receita nem branco de faixa. */
  it('cores do mock: tinta no positivo, vermelho no custo e no negativo, navy no resultado-chave', () => {
    montarRRCC({ unidades: ['rs'] });
    const cor = (rot: string) => linhaDe(rot)?.semPct[1]?.className ?? '';
    expect(cor('Receita bruta')).toContain('text-foreground');
    expect(cor('= Receita líquida')).toContain('text-foreground');
    expect(cor('= VBP')).toContain('text-foreground');
    expect(cor('(−) Custeio de produção')).toContain('text-red-600');
    expect(cor('= Lucro líquido')).toContain('text-foreground');
    expect(cor('= Lucro operacional')).toContain('text-primary');
    expect(document.body.textContent).not.toMatch(/[▲▼]/);
    const rot = rotulos();
    const linhas = linhasDaTabela();
    expect(linhas[rot.findIndex(r => r.startsWith('= VBP')) + 1].semPct[1].className).toContain('text-muted-foreground');
    expect(linhas[rot.findIndex(r => r.startsWith('(−) Custeio')) + 1].semPct[1].className).toContain('text-red-600');
    cleanup();
    /* Prejuízo: o Lucro líquido negativo vira vermelho. E o Detalhado tem as mesmas cores. */
    montarRRCC({ unidades: ['rs'], dre: { ...RRCC21, total: { ...RRCC21.total, resultado_periodo: -5000 } } });
    expect(cor('= Lucro líquido')).toContain('text-red-600');
    cleanup();
    montarRRCC({ modo: 'detalhado', unidades: ['rs'] });
    expect(cor('= VBP')).toContain('text-foreground');
    expect(cor('= VBP')).not.toContain('text-green-700');
  });

  it('o Custeio não abre modal nem histórico — só abre e fecha', () => {
    const onAbrirLista = vi.fn();
    montarRRCC({ onAbrirLista });
    const linha = linhaDe('(−) Custeio de produção');
    if (linha?.semPct[1]) fireEvent.click(linha.semPct[1]);
    expect(onAbrirLista).not.toHaveBeenCalled();
    expect(linha?.semPct[0]?.querySelector('button[aria-label="Ver histórico"]')?.className).toContain('invisible');
    /* As filhas mantêm o modal delas: a busca prova que o clique sabe chegar. */
    abrirCusteio();
    const cf = linhaDe('(−) Custo fixo')?.semPct[1];
    if (cf) fireEvent.click(cf);
    expect(onAbrirLista).toHaveBeenCalledWith(expect.objectContaining({ bloco: 'fixo' }));
  });
});

/* ══════════════ O Δ NA VISÃO GLOBAL — adendo do 03b ══════════════ */

/**
 * ⚠ A ORDEM É A LEI DO TEMPO (A28): a referência à ESQUERDA, o realizado à direita, o Δ depois. Com
 * a meta à direita, o olho lia a diferença antes do número que a produziu.
 * ⚠ E OS NÚMEROS SÃO OS DA ANTIGA VISÃO "× Meta": ela deixou de existir como card, não como
 * resposta — é isso que este bloco prova.
 */
describe('a comparação, por referência', () => {
  const META: DrePecuaria = { ...DRE, total: linhas({ vendas: 10000000, resultado_periodo: 2000000 }) };
  const ANOS = [
    { de: '2024-07', ate: '2025-06', dre: { ...DRE, total: linhas({ vendas: 12000000 }) }, carregando: false },
    { de: '2023-07', ate: '2024-06', dre: { ...DRE, total: linhas({ vendas: 11000000 }) }, carregando: false },
    { de: '2022-07', ate: '2023-06', dre: { ...DRE, total: linhas({ vendas: 10500000 }) }, carregando: false },
  ];
  const montar = (referencia: 'meta' | number, deltas: readonly ('rs' | 'pct')[] = []) => render(
    <PecDrePanel colunas={colunasDaVisao({
      visao: 'comparacao', de: '2025-07', ate: '2026-06', real: DRE, meta: META, carregandoMeta: false,
      anos: ANOS, deltas, referencia,
    })} alturaCartao={null} cartaoRef={{ current: null }} />,
  );

  /* ⚠ A REFERÊNCIA SEMPRE À ESQUERDA, O Δ SEMPRE DEPOIS DO ATUAL — fix4, e é a correção de um
     defeito de leitura: na visão x Anos o Δ nascia COLADO ao ano que comparava, no meio da grade,
     e com um ano só a tela ficava "2025 | Δ | 2026" — a diferença antes do número que a produziu. */
  it('Meta: Meta | Atual | Δ, nesta ordem', () => {
    montar('meta', ['rs']);
    const cab = cabecalhos();
    expect(cab[1]).toContain('Meta');
    expect(cab[2]).toContain('Atual');
    /* fix7 item B: o grupo do Δ é mudo; quem diz "Δ R$" é o rótulo da sub-coluna. */
    expect(cab[3]).toBe('');
    expect(rotulosDeSlot()).toContain('Δ R$');
    /* Vendas: meta 10.000.000, atual 17.869.000,08, Δ = 7.869.000,08. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[1]?.textContent).toBe('10.000.000,00');
    expect(vendas?.semPct[3]?.textContent).toBe('17.869.000,08');
    expect(vendas?.semPct[5]?.textContent).toBe('7.869.000,08');
  });

  it('1 ano: o anterior | o atual | Δ, e o Δ é contra aquele ano', () => {
    montar(1, ['rs']);
    const cab = cabecalhos();
    expect(cab[1]).toContain('jul/24-jun/25');
    expect(cab[2]).toContain('jul/25-jun/26');
    /* fix7 item B: sem "Δ" e sem "atual − jul/24-jun/25" — a referência já está no cabeçalho ao
       lado, e repeti-la custava 12px de altura em TODA a grade. */
    expect(cab[3]).toBe('');
    expect(rotulosDeSlot()).toContain('Δ R$');
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[1]?.textContent).toBe('12.000.000,00');
    /* 17.869.000,08 − 12.000.000 = 5.869.000,08 — e não os 7,8 mi da meta. */
    expect(vendas?.semPct[5]?.textContent).toBe('5.869.000,08');
  });

  /**
   * O PATRIMÔNIO TEM Δ CONTRA O ANO, E NÃO TEM CONTRA A META — fix7 item C.
   *
   * ⚠ NASCE DE UM TRAÇO COM OS DOIS NÚMEROS NA TELA. As três linhas de patrimônio saíam em "—" na
   * coluna de Δ SEMPRE, porque a RPC não filtra patrimônio por cenário — regra certa para a META,
   * que não tem variação de rebanho. O fix4 trocou a referência padrão para o ANO ANTERIOR e a
   * regra ficou onde estava: no Agnaldo, o Efeito de mercado mostrava "—" tendo -1.738.199,93 de
   * um lado e -567.053,09 do outro.
   * ⚠ OS DOIS CASOS ANDAM JUNTOS DE PROPÓSITO: afirmar só o número novo passaria verde também se
   * alguém apagasse a regra inteira, e aí a coluna Meta voltaria a mentir que há meta de rebanho.
   */
  const comAnoAnterior = (efeitoAnterior: number, referencia: 'meta' | number) => render(
    <PecDrePanel colunas={colunasDaVisao({
      visao: 'comparacao', de: '2025-07', ate: '2026-06', real: DRE,
      meta: { ...DRE, total: linhas({ vendas: 10000000, efeito_mercado: 999999 }) }, carregandoMeta: false,
      anos: [{ de: '2024-07', ate: '2025-06', carregando: false,
        dre: { ...DRE, total: linhas({ vendas: 12000000, efeito_mercado: efeitoAnterior }) } }],
      deltas: ['rs'], referencia,
    })} alturaCartao={null} cartaoRef={{ current: null }} />,
  );

  it('contra o ano anterior, o Δ do Efeito de mercado é número, não traço', () => {
    comAnoAnterior(1000000, 1);
    const efeito = linhaDe('Efeito de mercado');
    /* o ano anterior traz 1.000.000 e o atual 2.618.562 — a diferença é subtraível. */
    expect(efeito?.semPct[1]?.textContent).toBe('1.000.000,00');
    expect(efeito?.semPct[3]?.textContent).toBe('2.618.562,00');
    expect(efeito?.semPct[5]?.textContent).toBe('1.618.562,00');
    expect(efeito?.semPct[5]?.textContent).not.toBe('—');
  });

  /* ⚠ CONTRATO NOVO — DRE-META-PATRIMONIO-01-fix1: era "contra a meta, o Δ do Efeito de mercado
     continua em traço". A meta passou a ter efeito de mercado (P1 da meta − rebanho da meta a preço
     P0), e a coluna e o Δ o leem como qualquer linha. */
  it('contra a meta, o Efeito de mercado da meta aparece e o Δ é a diferença', () => {
    comAnoAnterior(1000000, 'meta');
    const efeito = linhaDe('Efeito de mercado');
    expect(efeito?.semPct[1]?.textContent).toBe('999.999,00');
    /* 2.618.562 − 999.999 = 1.618.563 */
    expect(efeito?.semPct[5]?.textContent).toBe('1.618.563,00');
  });

  /* ⚠ O CASO DA HOMOLOGAÇÃO — Raul Juliato, 25/26 meta: a RPC devolve produção 46.765,75 e mercado
     123.677,03, e a tela mostrava "—" nas duas. Com Δ R$ e Δ %, as duas células de Δ são número. */
  it('meta com produção e mercado (Raul 25/26): a coluna Meta mostra os dois e o Δ % calcula', () => {
    render(<PecDrePanel colunas={colunasDaVisao({
      visao: 'comparacao', de: '2025-07', ate: '2026-06', real: DRE, carregandoMeta: false, anos: [],
      meta: { ...DRE, total: linhas({ vendas: 10000000, vpb_operacional: 46765.75, efeito_mercado: 123677.03 }) },
      deltas: ['rs', 'pct'], referencia: 'meta',
    })} alturaCartao={null} cartaoRef={{ current: null }} />);
    const vpb = linhaDe('Variação por produção');
    const efeito = linhaDe('Efeito de mercado');
    expect(vpb?.semPct[1]?.textContent).toBe('46.765,75');
    expect(efeito?.semPct[1]?.textContent).toBe('123.677,03');
    /* Δ R$ = real − meta: −193.238 − 46.765,75 e 2.618.562 − 123.677,03 */
    expect(vpb?.semPct[5]?.textContent).toBe('-240.003,75');
    expect(efeito?.semPct[5]?.textContent).toBe('2.494.884,97');
    expect(vpb?.semPct[6]?.textContent).toContain('%');
    expect(efeito?.semPct[6]?.textContent).toContain('%');
  });

  /* ⚠ SEM P1 VALIDADO A RPC DEVOLVE NULO (sem_p1), e o "—" sai do dado, não de uma trava. */
  it('meta sem P1 validado: a variação da meta é "—" e o Δ também', () => {
    render(<PecDrePanel colunas={colunasDaVisao({
      visao: 'comparacao', de: '2025-07', ate: '2026-06', real: DRE, carregandoMeta: false, anos: [],
      meta: { ...DRE, total: linhas({ vendas: 10000000, vpb_operacional: null, efeito_mercado: null }) },
      deltas: ['rs'], referencia: 'meta',
    })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(linhaDe('Variação por produção')?.semPct[1]?.textContent).toBe('—');
    expect(linhaDe('Variação por produção')?.semPct[5]?.textContent).toBe('—');
    expect(linhaDe('Vendas')?.semPct[1]?.textContent).toBe('10.000.000,00');
  });

  /**
   * ⚠ COM DOIS OU MAIS ANOS NÃO HÁ Δ, e não é esquecimento: "a diferença" precisa de UMA
   * referência. Com três anos seriam três colunas de Δ intercaladas — exatamente como o Δ passou a
   * nascer no meio da grade antes do fix4. Os chips ficam desabilitados na tela, e este caso trava
   * o lado das colunas.
   */
  it('3 anos: quatro colunas cronológicas e nenhuma de Δ, mesmo com os chips ligados', () => {
    montar(3, ['rs', 'pct']);
    expect(cabecalhos().slice(1)).toEqual([
      'jul/22-jun/23', 'jul/23-jun/24', 'jul/24-jun/25', 'jul/25-jun/26',
    ]);
    expect(cabecalhos().filter(c => c.includes('Δ'))).toHaveLength(0);
  });

  /* ⚠ O CHIP Δ % NÃO É OUTRA UNIDADE DO MESMO NÚMERO: ele é a segunda célula da coluna de Δ. */
  it('os dois chips dão duas células de Δ na mesma coluna', () => {
    montar('meta', ['rs', 'pct']);
    const vendas = linhaDe('Vendas');
    expect(vendas?.semPct[5]?.textContent).toBe('7.869.000,08');
    expect(vendas?.semPct[6]?.textContent).toContain('%');
  });
});

/* ══════════════ A COR E A FAIXA DOS TOTAIS — 03b-fix1, itens 10, 12 e 13 ══════════════ */

/**
 * ⚠ ESTE BLOCO NASCE DE TRÊS CORREÇÕES SEGUIDAS NA MESMA REGRA, e é por isso que ele existe: no
 * 03b o total ficou PRETO ("a faixa já destaca"), e um prejuízo de milhões saía da cor de um lucro;
 * no fix1 ele ganhou verde e vermelho, e o verde brigou com a cor da natureza "receita"; no adendo
 * ele virou azul escuro e vermelho, com o azul cheio respondendo por marcador. Cada volta dessas
 * passou pelos sete gates sem que nenhum dissesse nada — cor não tem gate. Estes casos são o gate.
 */
describe('a cor e a faixa de um total', () => {
  const montar = (l: Partial<DrePecLinhas>) => {
    const dre: DrePecuaria = { ...DRE, fazendas: [],
      total: linhas({ vbp: 1000000, producao: { ...linhas({}).producao, ha_medio: 1000 }, ...l }) };
    render(<PecDrePanel colunas={colunas('comparacao', { real: dre })}
      alturaCartao={null} cartaoRef={{ current: null }} unidades={['rs', 'ha']} />);
  };

  /* ⚠ DRE-LEVE-01 (Gabriel 31/10, mock opção B): AS FAIXAS SAÍRAM. O resultado se marca pelo NEGRITO e por uma régua escura de 1,5px
     embaixo — sem azul cheio, sem branco, sem ▲/▼; o número tem a cor do sinal (vermelho no negativo, tinta no positivo). As três linhas-chave
     (Margem, Lucro operacional, Resultado econômico) têm o fundo azul-claro, que substitui o fundo da célula também na coluna Total
     (`sticky`), e o valor a 10px. Os casos antigos (branco + ▲/▼ no t4, faixa de cabo a rabo) foram trocados por estes. */
  it('o resultado é negrito com a régua escura — sem faixa, sem ▲/▼, negativo em vermelho', () => {
    montar({ resultado_com_mercado: -1959802.35 });
    const tr = linhaDe('= Resultado econômico')!;
    expect(tr.className).toContain('font-bold');
    expect(tr.className).toContain('[background-size:100%_1.5px]');
    expect(tr.semPct[1].className).toContain('text-red-600');
    expect(tr.textContent).not.toMatch(/[▲▼]/);
    expect(tr.className).not.toContain('bg-primary');
  });

  it('as três linhas-chave: fundo azul-claro em toda célula (nem a Total tem fundo inline) e o valor a 10px', () => {
    montar({ resultado_com_mercado: 1200000 });
    for (const rot of ['= Margem de contribuição', '= Lucro operacional', '= Resultado econômico']) {
      const tr = linhaDe(rot)!;
      expect(tr.className, rot).toContain('bg-[#f1f5fa]');
      for (const td of tr.semPct.slice(1)) {
        expect(td.style.backgroundColor, rot).toBe('');
        expect(td.className, rot).toContain('bg-[#f1f5fa]');
      }
      expect(tr.semPct[1].style.fontSize, rot).toBe('10px');
    }
    /* os outros resultados ficam a 9px, sem o azul-claro */
    expect(linhaDe('= Lucro líquido')!.className).not.toContain('bg-[#f1f5fa]');
    expect(linhaDe('= Lucro líquido')!.semPct[1].style.fontSize).toBe('9px');
  });

  it('fora das linhas-chave o total tem a tinta da casa no positivo e o vermelho no negativo', () => {
    montar({ resultado_periodo: 2994408.81, receita_liquida: -1400000 });
    expect(linhaDe('= Lucro líquido')!.semPct[1].className).toContain('text-foreground');
    expect(linhaDe('= Lucro líquido')!.semPct[1].className).not.toContain('text-green');
    expect(linhaDe('= Receita líquida')!.semPct[1].className).toContain('text-red');
  });

  /* ⚠ O "por hectare" É SUBITEM do total de cima (D6): a régua da filha (13px), sem fundo e sem ▲/▼; o negativo segue vermelho. */
  it('"por hectare" é subitem do total a que pertence', () => {
    const real: DrePecuaria = { ...DRE, fazendas: [],
      total: linhas({ resultado_com_mercado: -1959802.35,
        producao: { ...linhas({}).producao, ha_medio: 4803 } }) };
    render(<PecDrePanel colunas={colunas('comparacao', { real })}
      alturaCartao={null} cartaoRef={{ current: null }} unidades={['rs']} />);
    const apoios = linhasDaTabela().filter(tr => (tr.semPct[0]?.textContent ?? '').trim().startsWith('por hectare'));
    expect(apoios).toHaveLength(2);
    for (const ap of apoios) {
      expect(ap.className).toContain('bg-card');
      expect(ap.style.height).toBe('13px');
      expect(ap.textContent).not.toMatch(/[▲▼]/);
    }
    /* O segundo é o do Resultado econômico, que no fixture é negativo. */
    expect(apoios[1].semPct[1].className).toContain('text-red-600');
  });
});

/* ══════════════ A COLUNA DO ÍCONE — item 6 ══════════════ */

/**
 * ⚠ O jsdom NÃO TEM LAYOUT, então não dá para medir o x do ícone aqui — a medição está no relatório
 * (15 ícones, todos em x=232). O que este caso trava é a CAUSA do desalinhamento: o ícone era o
 * primeiro filho de uma célula cujo `padding-left` mudava com o recuo da linha, então ele andava
 * com o nome. Agora o padding é o mesmo em toda linha e o recuo vive num `span` depois do ícone.
 */
describe('a coluna do ícone de histórico', () => {
  /* DRE-LEVE-01 (item 5): o ícone só aparece ao passar o mouse na linha (ou no foco do teclado) — o lugar segue reservado. */
  it('o ícone fica invisível até o mouse passar na linha', () => {
    render(<PecDrePanel colunas={colunas('comparacao')} alturaCartao={null} cartaoRef={{ current: null }}
      onAbrirHistorico={() => {}} />);
    const botoes = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Ver histórico"]')];
    expect(botoes.length).toBeGreaterThan(5);
    for (const b of botoes) {
      expect(b.className).toContain('opacity-0');
      expect(b.className).toContain('group-hover:opacity-100');
      expect(b.closest('tr')?.className).toContain('group');
    }
  });

  it('toda célula de rótulo começa no mesmo padding, com ou sem ícone', () => {
    render(<PecDrePanel colunas={colunas('comparacao')} alturaCartao={null} cartaoRef={{ current: null }}
      onAbrirHistorico={() => {}} />);
    const rotulos = linhasDaTabela().map(tr => tr.semPct[0]).filter(Boolean);
    const comIcone = rotulos.filter(td => td.querySelector('button[aria-label="Ver histórico"]'));
    expect(comIcone.length).toBeGreaterThan(5);
    /* Os 7px do padding da célula — o mesmo no subtotal, no grupo e na linha solta. */
    for (const td of comIcone) expect(td.style.paddingLeft).toBe('7px');
    /* E quem não tem ícone reserva a coluna dele: 7 + 14. */
    const semIcone = rotulos.filter(td => !td.querySelector('button[aria-label="Ver histórico"]'));
    for (const td of semIcone) expect(td.style.paddingLeft).not.toBe('7px');
  });
});
