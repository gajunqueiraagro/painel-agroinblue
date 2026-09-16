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
import { PecDrePanel } from '@/pages/PecDrePanel';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: 0, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0 },
  sem_p0: false, sem_p1: false, centros: [], ...o,
});

const DRE: DrePecuaria = {
  periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
  rateio_adm: { pool: 720000, bruto: 2880000, criterio: 'cabecas no fim do periodo' },
  fazendas: [
    {
      fazenda_id: 'f1', nome: 'Pureza',
      linhas: linhas({
        vendas: 9000000, vpb_operacional: 844774.72, resultado_periodo: 1500000,
        custo_variavel: 3000000,
        patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 3000 },
        centros: [{ bloco: 'variavel', centro: 'Nutrição', valor: 3000000, a_pagar: 0 }],
      }),
    },
    /* ⚠ A FAZENDA SEM FECHAMENTO É CASO DE TESTE, não borda rara: sem P0 ou sem P1 as duas
       variações vêm NULAS, e a tela tem de dizer "—" nas duas — nunca 0,00. */
    {
      fazenda_id: 'f2', nome: 'Administrativo',
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
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 12000 },
    /* ⚠ OS CENTROS DO §CHECKS — dois dos sete do NJ, e é a coluna TOTAL que os lista: um centro
       que só existe numa fazenda tem de aparecer para todas, senão a filha some conforme a coluna
       que se olha. */
    centros: [
      { bloco: 'variavel', centro: 'Nutrição', valor: 5145471.65, a_pagar: 0 },
      { bloco: 'variavel', centro: 'Pastagem', valor: 878655.25, a_pagar: 0 },
    ],
  }),
};

const montar = () => render(
  <PecDrePanel dre={DRE} alturaCartao={null} cartaoRef={{ current: null }} />,
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
   * ⚠ VBP ≤ 0 DÁ TRAÇO, NUNCA 0% — a regra do DRE gerencial, trazida inteira. A fazenda
   * "Administrativo" do fixture tem VBP zero, e é ela que prova a regra.
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

  /* ⚠ A COLUNA "Administrativo" APARECE: ela é lançamento de pecuária sem fazenda produtiva, e
     escondê-la faria o Total não fechar com a soma das colunas sem ninguém saber por quê. */
  it('a coluna Administrativo existe e diz o que é', () => {
    montar();
    expect(screen.getByTitle('lançamentos de pecuária sem fazenda produtiva')).toBeTruthy();
  });
});
