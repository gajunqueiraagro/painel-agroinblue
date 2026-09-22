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
import { render, screen, fireEvent } from '@testing-library/react';
import { PecDrePanel, FaixaVisoesPec, colunasDaVisao, type EntradaVisoes, type VisaoPec } from '@/pages/PecDrePanel';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  /* ⚠ JUROS NASCEM `null` — é o que a RPC devolve em toda coluna de fazenda desde a RPC-02. Só o
     Total tem número, e o fixture do Total o põe explicitamente. */
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
  /* ⚠ ÁREA NASCE NULA no fixture, e de propósito: é o estado de quem não tem fechamento de área, e
     a sub-coluna tem de dizer "—". Quem quer número o põe explicitamente. */
  producao: { ha_medio: null, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  sem_p0: false, sem_p1: false, centros: [], centros_juros: [], ...o,
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
        sem_p0: true, sem_p1: true,
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
/* ⚠ OS CASOS ANTIGOS SÃO DA VISÃO "Por fazenda": ela é a grade de antes, sem mudança. */
const montar = () => render(
  <PecDrePanel colunas={colunas('fazenda')} alturaCartao={null} cartaoRef={{ current: null }} />,
);
const linhasDaTabela = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
/* ⚠ O RÓTULO VEM COLADO NA ETIQUETA no `textContent` — "Efeito de mercadoestimado". Comparar por
   igualdade faria as três linhas com etiqueta sumirem do teste, que é o pior resultado: passa
   verde sem olhar justamente as que carregam ressalva. Casa por prefixo. */
const rotulos = () => linhasDaTabela().map(tr => (tr.cells[0]?.textContent ?? '').trim());
const indiceDe = (rot: string) => rotulos().findIndex(r => r.startsWith(rot));
const linhaDe = (rot: string) =>
  linhasDaTabela().find(tr => ((tr.cells[0]?.textContent ?? '').trim()).startsWith(rot));

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
    <PecDrePanel colunas={colunasDaVisao({ visao: 'global', de: '2025-07', ate: '2026-06',
      real: dre, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} unidades={unidades} />,
  );

  it('R$/cab/mês divide pela cabeça média e pelos meses da coluna', () => {
    montarCom(['rs', 'cab']);
    /* 1.000.000 / 500 cab / 12 meses = 166,67. Sem os meses daria 2.000,00. */
    expect(linhaDe('Vendas')?.cells[2]?.textContent).toBe('166,67');
  });

  it('R$/@ usa a @ VENDIDA na receita, a COMPRADA na reposição e a PRODUZIDA no custo', () => {
    montarCom(['rs', 'arroba']);
    /* Receita: 1.000.000 / 2.000 @ vendidas = 500,00 (pela produzida daria 1.000,00). */
    expect(linhaDe('Vendas')?.cells[2]?.textContent).toBe('500,00');
    /* Reposição: 50.000 / 100 @ compradas = 500,00. */
    expect(linhaDe('(−) Reposição')?.cells[2]?.textContent).toBe('500,00');
    /* Custo: 400.000 / 1.000 @ produzidas = 400,00 (pela vendida daria 200,00). */
    expect(linhaDe('(−) Custo variável')?.cells[2]?.textContent).toBe('400,00');
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
    expect(linhaDe('(−) Custo variável')?.cells[2]?.textContent).toBe('—');
    /* A receita continua, porque a base dela (@ vendida) existe. */
    expect(linhaDe('Vendas')?.cells[2]?.textContent).toBe('500,00');
  });

  it('cada chip marcado é uma coluna, na ordem fixa, e o R$ pode ficar de fora', () => {
    const { unmount } = montarCom(['rs', 'ha']);
    expect([...document.querySelectorAll('colgroup col')]).toHaveLength(3);
    unmount();
    montarCom(['ha', 'cab', 'arroba']);
    /* Sem o R$: rótulo + três unidades. */
    const cols = [...document.querySelectorAll('colgroup col')];
    expect(cols).toHaveLength(4);
    expect(document.body.textContent).toContain('R$/ha');
    expect(linhaDe('Vendas')?.cells[1]?.textContent).toBe('1.000,00');
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

  it('com um chip só, o grupo vai ao piso de 104px — nem 64, nem 160', () => {
    montarCom(['arroba']);
    expect(largurasDoColgroup()).toEqual(['200px', '104px']);
  });

  it('duas unidades já passam do piso e ficam como são; o padrão de abertura não muda', () => {
    const { unmount } = montarCom(['ha', 'cab']);
    /* 64 + 64 = 128 ≥ 104 → intactas. Com o piso de 160 elas viravam 80 + 80. */
    expect(largurasDoColgroup()).toEqual(['200px', '64px', '64px']);
    unmount();
    montarCom(['rs', 'ha']);
    expect(largurasDoColgroup()).toEqual(['200px', '96px', '64px']);
  });

  it('acima do piso ninguém é esticado: três unidades somam 192 e ficam como são', () => {
    montarCom(['ha', 'cab', 'arroba']);
    expect(largurasDoColgroup()).toEqual(['200px', '64px', '64px', '64px']);
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
    render(<PecDrePanel colunas={colunasDaVisao({ visao: 'global', de: '2025-07', ate: '2026-06',
      real: COM_RATEIO, meta: null, carregandoMeta: false, anos: [] })}
      alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(linhaDe('(−) Rateio administrativo')?.cells[1]?.textContent).toBe('120.000,00');
    expect(linhaDe('= Resultado operacional')?.cells[1]?.textContent).toBe('680.000,00');
    expect(linhaDe('= Resultado do período')?.cells[1]?.textContent).toBe('680.000,00');
    expect(linhaDe('= Resultado com mercado')?.cells[1]?.textContent).toBe('700.000,00');
    /* O que este caso proíbe: o resultado somado de volta ao rateio (800.000) em qualquer célula. */
    expect(document.body.textContent).not.toContain('800.000,00');
  });
});

describe('a cascata do DRE da pecuária', () => {
  it('as dezoito linhas saem na ordem do DRE, com a seção antes do investimento', () => {
    montar();
    const r = rotulos();
    expect(r[0]).toBe('Vendas');
    expect(indiceDe('= Receita líquida')).toBeLessThan(indiceDe('= VBP'));
    expect(indiceDe('= VBP')).toBeLessThan(indiceDe('= Margem de contribuição'));
    expect(indiceDe('= Resultado do período')).toBeLessThan(indiceDe('Efeito de mercado'));
    /* ⚠ INVESTIMENTO FICA ABAIXO DA LINHA, e a faixa que o anuncia vem imediatamente antes. */
    expect(r[indiceDe('Investimento no período') - 1]).toBe('Abaixo da linha de caixa');
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
    const total = (rot: string) => linhaDe(rot)?.cells[CEL_TOTAL_RS]?.textContent ?? '';
    expect(total('Vendas')).toBe('17.869.000,08');
    expect(total('Variação por produção')).toBe('-193.238,00');
    expect(total('= Resultado do período')).toBe('2.994.408,81');
    expect(total('Efeito de mercado')).toBe('2.618.562,00');
  });

  it('fazenda sem fechamento mostra "—" nas duas variações, nunca zero', () => {
    montar();
    const celula = (rot: string) => linhaDe(rot)?.cells[CEL_FAZ2_RS]?.textContent ?? '';
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
  it('a linha de % usa o VBP como base, sob as três linhas do §3', () => {
    montar();
    const linhasTabela = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const rotulos = linhasTabela.map(tr => tr.cells[0]?.textContent ?? '');
    const pos = (r: string) => rotulos.findIndex(x => x.includes(r));
    /* Uma logo abaixo de cada uma das três — e só três no total. */
    expect(rotulos.filter(r => r.includes('% do VBP'))).toHaveLength(3);
    expect(rotulos[pos('= Margem de contribuição') + 1]).toContain('% do VBP');
    expect(rotulos[pos('= Resultado operacional') + 1]).toContain('% do VBP');
    expect(rotulos[pos('= Resultado com mercado') + 1]).toContain('% do VBP');

    /* ⚠ O NÚMERO, na coluna Total: 9.171.997,33 / 15.841.219,06 = 57,9 %. Sem esta asserção o
       teste provaria só que a frase existe — e a frase certa sobre a conta errada é pior que
       nenhuma frase. */
    const pctMargem = linhasTabela[pos('= Margem de contribuição') + 1]?.cells[CEL_TOTAL_RS];
    expect(pctMargem?.textContent).toBe('57,9 %');
  });

  /**
   * ⚠ VBP ≤ 0 DÁ TRAÇO, NUNCA 0% — a regra do DRE gerencial, trazida inteira. A segunda fazenda
   * do fixture tem VBP zero, e é ela que prova a regra.
   */
  it('sem VBP positivo o percentual é traço, não 0%', () => {
    montar();
    const linhasTabela = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    const rotulos = linhasTabela.map(tr => tr.cells[0]?.textContent ?? '');
    const i = rotulos.findIndex(x => x.includes('= Margem de contribuição'));
    expect(linhasTabela[i + 1]?.cells[CEL_FAZ2_RS]?.textContent).toBe('—');
  });

  /**
   * ⚠ OS GRUPOS NASCEM FECHADOS (§4), e este caso protege o tamanho da grade: com os seis
   * abertos por padrão a cascata de dezoito linhas viraria trinta e tantas, e a tela que o PR-10
   * encolheu com régua tipográfica cresceria de volta por outro caminho.
   */
  it('os grupos de centro nascem fechados, e abrem no clique', () => {
    montar();
    const textos = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      .map(tr => tr.cells[0]?.textContent ?? '');
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
    if (grupo) fireEvent.click(grupo.cells[0]);
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
  it('juros de fazenda é "—", sem R$/cab e sem clique; no Total, número e clique', () => {
    const abrir = vi.fn();
    render(<PecDrePanel colunas={colunas('fazenda')} alturaCartao={null} cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    const juros = linhaDe('(−) Despesas financeiras (juros)');
    expect(juros?.cells[3]?.textContent).toBe('—');
    expect(juros?.cells[4]?.textContent).toBe('');
    expect(juros?.cells[CEL_FAZ2_RS]?.textContent).toBe('—');
    expect(juros?.cells[CEL_TOTAL_RS]?.textContent).toBe('58.633,56');

    if (juros) fireEvent.click(juros.cells[3]);
    expect(abrir).not.toHaveBeenCalled();
    if (juros) fireEvent.click(juros.cells[CEL_TOTAL_RS]);
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
    expect(linhaDe('Vendas')?.cells[4]?.textContent).toBe('3.000,00');
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
    const sub = (rotulo: string) => linhaDe(rotulo)?.cells[2]?.textContent ?? '';
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
    expect(linhaDe('= Resultado do período')?.cells[6]?.textContent).toBe('—');
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

describe('as quatro visões', () => {
  it('Global: uma coluna só, o Total, com o rateio administrativo inteiro', () => {
    render(<PecDrePanel colunas={colunas('global')} alturaCartao={null} cartaoRef={{ current: null }} />);
    const h = cabecalhos();
    expect(h).toHaveLength(2);
    expect(h[1]).toContain('Total');
    expect(h[1]).toContain('10.000 cab');
    expect(linhaDe('= Resultado do período')?.cells[1]?.textContent).toBe('2.994.408,81');
    /* O rateio aparece como linha também no Global: é custo da pecuária, só não se divide aqui. */
    expect(linhaDe('(−) Rateio administrativo')).toBeTruthy();
  });

  it('× Meta: Realizado | Meta | Δ — meta nunca soma, patrimônio sem meta, drill com o cenário', () => {
    const abrir = vi.fn();
    render(<PecDrePanel colunas={colunas('meta', { meta: META })} alturaCartao={null}
      cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    const h = cabecalhos();
    expect(h).toHaveLength(4);
    expect(h[1]).toContain('Realizado');
    expect(h[2]).toContain('Meta');
    expect(h[3]).toContain('real − meta');
    /* ⚠ OS ÍNDICES ANDARAM PORQUE A META GANHOU SUB-COLUNA — TELA-03a. Antes: rótulo 0 ·
       Realizado R$ 1 e R$/cab 2 · Meta R$ 3 · Δ R$ 4 e Δ% 5. Agora: rótulo 0 · Realizado R$ 1 e
       R$/ha 2 · Meta R$ 3 e R$/ha 4 · Δ R$ 5 e Δ% 6. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[3]?.textContent).toBe('451.560,00');
    /* ⚠ A META DIVIDE PELA ÁREA DELA, 4.000 ha: 451.560 / 4.000 = 112,89. Pela área do realizado
       (5.000) daria 90,31 — o número que este caso recusa. */
    expect(vendas?.cells[4]?.textContent).toBe('112,89');
    expect(vendas?.cells[5]?.textContent).toBe('17.417.440,08');
    /* ⚠ A VPB DA META É A MESMA DO REALIZADO NO JSON — e a coluna diz "—" no R$, no R$/ha e no
       delta: traço não vira número ao mudar de unidade. */
    const vpb = linhaDe('Variação por produção');
    expect(vpb?.cells[3]?.textContent).toBe('—');
    expect(vpb?.cells[4]?.textContent).toBe('—');
    expect(vpb?.cells[5]?.textContent).toBe('—');

    if (vendas) fireEvent.click(vendas.cells[3]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ cenario: 'meta', bloco: 'venda', fazendaId: null }));
    /* ⚠ A SUB-COLUNA ABRE O MESMO DRILL DO R$ ao lado — é a mesma linha noutra unidade, e o
       operador clica onde o olho está. */
    abrir.mockClear();
    if (vendas) fireEvent.click(vendas.cells[4]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ cenario: 'meta', bloco: 'venda' }));
    /* ⚠ O DELTA NÃO ABRE NADA, e agora ele é a célula 5 (a Meta ganhou sub-coluna): uma diferença
       não tem lançamento para listar. */
    abrir.mockClear();
    if (vendas) fireEvent.click(vendas.cells[5]);
    expect(abrir).not.toHaveBeenCalled();
  });

  /* ⚠ O SUBTÍTULO ENCURTOU NO 01c e a frase inteira foi para o `title`: com o grupo em 104px,
     "sem meta no período" (100,1px de texto) virava reticências. Encurtar sem guardar o longo
     seria apagar — por isso o teste cobra os DOIS. */
  it('× Meta sem meta no período: a coluna fica, toda em "—", e diz por quê', () => {
    render(<PecDrePanel colunas={colunas('meta', { meta: SEM_META })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(cabecalhos()[2]).toContain('sem meta');
    expect(document.querySelector('[title="sem meta no período"]')).not.toBeNull();
    expect(linhaDe('Vendas')?.cells[3]?.textContent).toBe('—');
    expect(linhaDe('Vendas')?.cells[4]?.textContent).toBe('—');
  });

  it('× Anos: atual primeiro, depois os anteriores; ano sem dado é coluna de "—", não some', () => {
    const abrir = vi.fn();
    const ANO1: DrePecuaria = { ...DRE, total: linhas({ vendas: 15000000 }) };
    render(<PecDrePanel colunas={colunas('anos', { anos: [
      { de: '2024-07', ate: '2025-06', dre: ANO1, carregando: false },
      { de: '2023-07', ate: '2024-06', dre: { ...DRE, fazendas: [] }, carregando: false },
    ] })} alturaCartao={null} cartaoRef={{ current: null }} onAbrirLista={abrir} />);
    expect(cabecalhos().slice(1)).toEqual(['jul/25-jun/26\u00a0', 'jul/24-jun/25\u00a0', 'jul/23-jun/24\u00a0']);
    /* ⚠ AGORA TEM SUB-COLUNA — TELA-03a: cada ano divide pela própria área, e a visão deixou de
       sair só em R$. */
    expect(document.body.textContent).toContain('R$/ha');
    /* ⚠ ÍNDICES REMAPEADOS — cada ano passou a ocupar DUAS células (R$ e R$/ha): atual R$ 1 e
       R$/ha 2 · ano−1 R$ 3 e R$/ha 4 · ano−2 R$ 5 e R$/ha 6. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[1]?.textContent).toBe('17.869.000,08');
    expect(vendas?.cells[2]?.textContent).toBe('3.573,80');
    expect(vendas?.cells[3]?.textContent).toBe('15.000.000,00');
    expect(vendas?.cells[5]?.textContent).toBe('—');
    /* O drill da coluna de um ano abre aquele ano. */
    if (vendas) fireEvent.click(vendas.cells[3]);
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
   * ⚠ OS QUATRO CARDS: um número cada, o selecionado marcado, e carregando é spinner — nunca "—",
   * que diria que o dado não existe.
   */
  it('os cards: quatro, o selecionado pressionado, e o que carrega não mostra "—"', () => {
    const escolher = vi.fn();
    render(<FaixaVisoesPec visao="meta" onVisao={escolher} real={DRE} meta={null} carregandoMeta
      anoAnterior={null} carregandoAnoAnterior={false} nAnos={3} onNAnos={() => {}} />);
    const botoes = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
    expect(botoes).toHaveLength(4);
    expect(botoes.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)).toEqual(['× Meta']);
    /* O de meta está carregando: só o rótulo, nenhum número nem traço. */
    expect(botoes[1]?.textContent).toBe('× Meta');
    expect(botoes[0]?.textContent).toContain('2.994.408,81');
    fireEvent.click(botoes[3]);
    expect(escolher).toHaveBeenCalledWith('fazenda');
  });
  /**
   * ⚠ × ANOS COM CINCO: SEIS COLUNAS, TODAS RESOLVIDAS — o defeito da homologação de 22/09 (anos 2..N
   * presos em esqueleto). A causa era da RPC, não da grade: com a view recursiva cada chamada levava
   * ~8 s, o statement_timeout do papel authenticated é 8 s, e o react-query refazia cada uma até três
   * vezes. Este caso trava o lado da grade: coluna que chegou tem número, ano sem dado tem "—", e
   * nenhuma fica pulsando.
   */
  it('× Anos com cinco anos: seis colunas resolvidas, ano sem dado em "—", nenhum esqueleto', () => {
    const ano = (k: number, vendas: number) => ({
      de: `${2025 - k + 1}-07`, ate: `${2026 - k + 1}-06`,
      dre: { ...DRE, total: linhas({ vendas }) }, carregando: false,
    });
    const anos = [ano(1, 15000000), ano(2, 14000000), ano(3, 13000000), ano(4, 12000000),
      { de: '2020-07', ate: '2021-06', dre: { ...DRE, fazendas: [] }, carregando: false }];
    render(<PecDrePanel colunas={colunas('anos', { anos })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(cabecalhos()).toHaveLength(7);
    /* ⚠ SEIS COLUNAS × DUAS CÉLULAS: o R$ da coluna k (0 = atual) está em 1 + 2k. O ano de
       12.000.000 é a quinta coluna (k = 4) → célula 9; o ano sem dado é k = 5 → célula 11. */
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[9]?.textContent).toBe('12.000.000,00');
    expect(vendas?.cells[11]?.textContent).toBe('—');
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});
