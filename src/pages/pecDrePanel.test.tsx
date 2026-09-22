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
   * ⚠ O R$/cab DIVIDE PELA CABEÇA MÉDIA, não pela do fim — o denominador da RPC e do PC-100 — e
   * pelos MESES do período (DRE-PEC-TELA-02b). Pureza: 9.000.000 / 2.500 / 12 = 300,00. Por
   * `cab_fim` (3.000) daria 250,00, e sem os meses 3.600,00: são esses os números que este caso
   * recusa. O cabeçalho mostra a mesma média.
   */
  it('R$/cab/mês e o cabeçalho usam cab_media', () => {
    montar();
    expect(linhaDe('Vendas')?.cells[4]?.textContent).toBe('300,00');
    expect(screen.getByText('2.500 cab med.')).toBeTruthy();
    expect(screen.queryByText('3.000 cab med.')).toBeNull();
    expect(screen.getByText('10.000 cab med.')).toBeTruthy();
  });

  /**
   * ⚠ O DIVISOR DE MESES É O DA COLUNA — `periodo.meses` do JSON. Oito meses, mil cabeças, oito mil
   * reais: um real por cabeça por mês. É o número que o PC-100 mostra e o único que se compara entre
   * períodos de tamanhos diferentes.
   */
  it('R$/cab/mês divide pelos meses do período da coluna', () => {
    const OITO: DrePecuaria = {
      ...DRE,
      periodo: { de: '2026-01', ate: '2026-08', p0: '2025-12', meses: 8 },
      total: linhas({ vendas: 8000,
        patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 1000 } }),
    };
    render(<PecDrePanel colunas={colunasDaVisao({ visao: 'global', de: '2026-01', ate: '2026-08', real: OITO,
      meta: null, carregandoMeta: false, anos: [] })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(linhaDe('Vendas')?.cells[2]?.textContent).toBe('1,00');
    expect(document.body.textContent).toContain('R$/cab/mês');
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
    /* rótulo 0 · Realizado R$ 1 e R$/cab 2 · Meta R$ 3 · Δ R$ 4 e Δ% 5 */
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[3]?.textContent).toBe('451.560,00');
    expect(vendas?.cells[4]?.textContent).toBe('17.417.440,08');
    /* ⚠ A VPB DA META É A MESMA DO REALIZADO NO JSON — e a coluna diz "—", o delta também. */
    const vpb = linhaDe('Variação por produção');
    expect(vpb?.cells[3]?.textContent).toBe('—');
    expect(vpb?.cells[4]?.textContent).toBe('—');

    if (vendas) fireEvent.click(vendas.cells[3]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ cenario: 'meta', bloco: 'venda', fazendaId: null }));
    abrir.mockClear();
    if (vendas) fireEvent.click(vendas.cells[4]);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('× Meta sem meta no período: a coluna fica, toda em "—", e diz por quê', () => {
    render(<PecDrePanel colunas={colunas('meta', { meta: SEM_META })} alturaCartao={null} cartaoRef={{ current: null }} />);
    expect(cabecalhos()[2]).toContain('sem meta no período');
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
    /* Só R$: sem sub-coluna por cabeça nesta visão. */
    expect(document.body.textContent).not.toContain('R$/cab/mês');
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[1]?.textContent).toBe('17.869.000,08');
    expect(vendas?.cells[2]?.textContent).toBe('15.000.000,00');
    expect(vendas?.cells[3]?.textContent).toBe('—');
    /* O drill da coluna de um ano abre aquele ano. */
    if (vendas) fireEvent.click(vendas.cells[2]);
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
    const vendas = linhaDe('Vendas');
    expect(vendas?.cells[5]?.textContent).toBe('12.000.000,00');
    expect(vendas?.cells[6]?.textContent).toBe('—');
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});
