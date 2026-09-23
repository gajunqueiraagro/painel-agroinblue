/**
 * O QUE ESTE TESTE TRAVA — a base que o donut escolhe, a cor do Δ contra a meta e o traço da @.
 *
 * ⚠ A BASE DO DONUT É A REGRA DO MODAL, e ela muda com o TIPO da linha: filha contra as irmãs,
 * grupo pela composição das filhas, subtotal contra o VBP. Errar a base não quebra nada — mostra
 * um percentual plausível e errado, que é o pior defeito que uma tela de análise pode ter.
 * ⚠ E A COR DO Δ NÃO SAI DO SINAL DO NÚMERO: "+12%" é boa notícia numa venda e má notícia numa
 * nutrição. É a única regra do modal que um teste de render não pegaria por acidente.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PecHistoricoLinhaModal, baseDoDonut, deltaMeta, deltaEmPontos, abreviar, semPrefixo,
  rotuloCurtoDoAno, PISO_K_TABELA, type RecorteHistoricoPec,
} from '@/components/agri/PecHistoricoLinhaModal';
import { LINHAS_PEC } from '@/components/agri/drePecRegua';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  /* ⚠ AS TRÊS CHAVES DA CASCATA-02: o lucro líquido e os juros repartidos entre próprios e
     rateados. Zero no fixture; quem precisa do número o põe explicitamente. */
  lucro_liquido: 0, juros_proprio: 0, juros_rateado: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 1000 },
  producao: { ha_medio: 2000, at_produzida: 5000, at_desfrutada: 4000, cab_desfrutada: null,
    at_comprada: 500, cab_comprada: null },
  p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  centros: [], centros_juros: [], ...o,
});

/* ⚠ OS NÚMEROS SÃO DESIGUAIS DE PROPÓSITO: VBP 10.000, custo variável 4.000 e três centros de
   2.000 / 1.500 / 500. Com valores iguais, um donut lendo a base errada daria o mesmo percentual
   da base certa e o teste passaria verde. */
const LINHAS_NJ = linhas({
  vbp: 10000, custo_variavel: 4000, margem: 6000, vendas: 8000,
  centros: [
    { bloco: 'variavel', centro: 'Nutrição', valor: 2000, a_pagar: 0 },
    { bloco: 'variavel', centro: 'Pastagem', valor: 1500, a_pagar: 0 },
    { bloco: 'variavel', centro: 'Sanidade', valor: 500, a_pagar: 0 },
  ],
});

const def = (chave: string) => LINHAS_PEC.find(d => d.chave === chave) ?? null;
const recorte = (o: Partial<RecorteHistoricoPec>): RecorteHistoricoPec => ({
  chave: 'custo_variavel', centro: null, rotulo: '(−) Custo variável',
  fazendaId: null, fazendaNome: 'Total', ...o,
});

describe('a base do donut — uma por tipo de linha', () => {
  it('filha: ela contra as IRMÃS, e o total é o bloco do pai', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({ centro: 'Nutrição', rotulo: 'Nutrição' }), def('custo_variavel'));
    expect(b?.total).toBe(4000);          // 2.000 + 1.500 + 500 — o bloco, não o VBP
    expect(b?.valorLinha).toBe(2000);
    expect(b?.destaque).toBe('Nutrição');
    expect(b?.fatias.map(f => f.nome)).toEqual(['Nutrição', 'Pastagem', 'Sanidade']);
    /* ⚠ E O CENTRO CRU VIAJA JUNTO — é ele que a navegação usa, não o nome exibido. */
    expect(b?.fatias.map(f => f.centro)).toEqual(['Nutrição', 'Pastagem', 'Sanidade']);
    /* ⚠ A PROPORÇÃO DOS ARCOS É A PROPORÇÃO DOS VALORES: é isso que o donut desenha. */
    const soma = (b?.fatias ?? []).reduce((a, f) => a + f.valor, 0);
    expect(soma).toBe(4000);
    expect((b?.fatias[0].valor ?? 0) / soma).toBeCloseTo(0.5, 5);
    expect((b?.fatias[1].valor ?? 0) / soma).toBeCloseTo(0.375, 5);
  });

  it('grupo: o anel é a composição das filhas, e o centro mede o grupo no VBP', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({}), def('custo_variavel'));
    expect(b?.fatias.map(f => f.nome)).toEqual(['Nutrição', 'Pastagem', 'Sanidade']);
    /* O total é o VBP — o centro diz quanto o custo variável pesa nele (4.000 de 10.000). */
    expect(b?.total).toBe(10000);
    expect(b?.valorLinha).toBe(4000);
    expect(b?.rotuloBase).toBe('= VBP');
  });

  it('subtotal "=": a linha contra o RESTANTE do VBP, em duas fatias', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({ chave: 'margem', rotulo: '= Margem de contribuição' }), def('margem'));
    expect(b?.total).toBe(10000);
    expect(b?.valorLinha).toBe(6000);
    expect(b?.fatias).toEqual([
      { nome: '= Margem de contribuição', valor: 6000 },
      { nome: 'restante do VBP', valor: 4000 },
    ]);
    /* ⚠ O PREFIXO SAI NA APRESENTAÇÃO, não no dado: a fatia guarda o rótulo como a cascata o
       escreve, e quem tira o "=" é `semPrefixo`, na hora de escrever a frase. */
    expect(semPrefixo(b?.fatias[0].nome ?? '')).toBe('Margem de contribuição');
  });

  /* ⚠ SEM LINHAS NÃO HÁ DONUT: ano sem dado não vira anel vazio nem 0% — vira nada. */
  it('ponto sem dado não monta donut nenhum', () => {
    expect(baseDoDonut(null, recorte({}), def('custo_variavel'))).toBeNull();
  });
});

describe('o Δ contra a meta', () => {
  /* ⚠ A MESMA VARIAÇÃO, DUAS LEITURAS: gastar 10% a mais é vermelho; faturar 10% a mais é verde. */
  it('custo acima da meta é vermelho; abaixo, verde', () => {
    expect(deltaMeta(1100, 1000, 'custo')?.cor).toBe('text-red-600');
    expect(deltaMeta(900, 1000, 'custo')?.cor).toBe('text-green-700');
  });

  it('receita acima da meta é verde; abaixo, vermelho', () => {
    expect(deltaMeta(1100, 1000, 'receita')?.cor).toBe('text-green-700');
    expect(deltaMeta(900, 1000, 'receita')?.cor).toBe('text-red-600');
  });

  it('a seta acompanha o sinal, e o percentual é sobre a meta', () => {
    expect(deltaMeta(1100, 1000, 'custo')?.texto).toBe('▲ 10,0 %');
    expect(deltaMeta(900, 1000, 'custo')?.texto).toBe('▼ 10,0 %');
  });

  /* ⚠ META AUSENTE NÃO É META ZERADA: sem base, não há percentual — e sem percentual, traço. */
  it('sem meta, ou meta zero, não há delta', () => {
    expect(deltaMeta(1000, null, 'custo')).toBeNull();
    expect(deltaMeta(1000, 0, 'custo')).toBeNull();
    expect(deltaMeta(null, 1000, 'custo')).toBeNull();
  });
});

describe('o modal montado', () => {
  const dre = (l: DrePecLinhas): DrePecuaria => ({
    periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
    rateio_adm: { pool: 0, bruto: 0, criterio: '' },
    fazendas: [], total: l,
  });

  const montar = (meta: DrePecuaria | null) => render(
    <PecHistoricoLinhaModal aberto recorte={recorte({ centro: 'Nutrição', rotulo: 'Nutrição' })}
      atual={dre(LINHAS_NJ)} meta={meta}
      anos={[{ de: '2024-07', ate: '2025-06', dre: dre(LINHAS_NJ), carregando: false }]}
      periodoRotulo="Safra 25/26" clienteNome="NJ Pecuária" unidadeInicial="rs"
      onFechar={() => {}} />,
  );

  /**
   * ⚠ A @ PRODUZIDA DA META VEM NULA DA RPC (medido em 22/09), e emprestar a do realizado faria o
   * custo da meta se ler por uma produção que não é dela. Traço é a resposta honesta — e o rodapé
   * do modal diz por quê, em vez de deixar o operador procurar o número que falta.
   */
  it('meta sem @ produzida: a célula fica em traço e o rodapé explica', () => {
    const semArroba = linhas({
      ...LINHAS_NJ,
      producao: { ...LINHAS_NJ.producao, at_produzida: null },
    });
    montar(dre(semArroba));
    /* ⚠ O `Dialog` VAI PARA UM PORTAL: o `container` do render fica vazio e a busca tem de ser no
       `document`. Procurar no container devolvia `undefined` e a assertiva morria antes de olhar a
       célula — falha certa, pela razão errada. */
    const linhaArroba = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .find(tr => tr.cells[0]?.textContent === 'R$/@');
    expect(linhaArroba).toBeDefined();
    const celulas = [...(linhaArroba?.cells ?? [])].map(c => c.textContent);
    /* 2.000 / 5.000 @ produzidas = 0,40 no realizado; a meta, sem base, é traço. */
    expect(celulas).toContain('0,40');
    expect(celulas[celulas.length - 2]).toBe('—');
  });

  it('o título diz a linha, e o subtítulo diz dentro de quem ela está', () => {
    montar(null);
    expect(screen.getByText('Nutrição · histórico')).toBeDefined();
    /* ⚠ SEM O "(−)": dentro do modal o pai é um nome, não uma linha de cascata. */
    expect(screen.getByText(/dentro de Custo variável/)).toBeDefined();
    expect(screen.getByText(/NJ Pecuária/)).toBeDefined();
  });
});

/* ══════════════ O QUE SE MOSTRA — fix1 da homologação ══════════════ */

/**
 * ⚠ O FORMATADOR NASCE DE SOBREPOSIÇÃO MEDIDA (print da Santa Rita, 19:38): sete barras de 22px com
 * "2.699.794,84" em cima viram uma faixa de números encavalados. Abreviar é para o olho comparar —
 * a tabela embaixo continua com o centavo, e o `title` da barra também.
 */
describe('o valor abreviado da barra', () => {
  it('milhão vira "mi", milhar vira "k", e abaixo de mil nada muda', () => {
    expect(abreviar('1.281.157,87')).toBe('1,3 mi');
    expect(abreviar('439.668,55')).toBe('439,7 k');
    expect(abreviar('971,74')).toBe('971,74');
  });

  /* ⚠ O TRAÇO ATRAVESSA INTEIRO: "sem dado" não é número pequeno. */
  it('traço e texto não numérico passam sem mexer', () => {
    expect(abreviar('—')).toBe('—');
    expect(abreviar('')).toBe('');
  });

  /* ⚠ E O SINAL SOBREVIVE: um resultado negativo abreviado ainda é negativo. */
  it('o negativo continua negativo', () => {
    expect(abreviar('-2.699.794,84')).toBe('-2,7 mi');
    expect(abreviar('-1.500,00')).toBe('-1,5 k');
  });
});

describe('o rótulo curto do eixo', () => {
  /* ⚠ UM ANO CIVIL É UM NÚMERO, UMA SAFRA SÃO DOIS — o critério é o dado, não o modo da tela. */
  it('ano civil vira dois dígitos; safra vira "24/25"', () => {
    expect(rotuloCurtoDoAno('2026-01', '2026-08')).toBe('26');
    expect(rotuloCurtoDoAno('2021-01', '2021-12')).toBe('21');
    expect(rotuloCurtoDoAno('2024-07', '2025-06')).toBe('24/25');
  });
});

describe('o nome da linha dentro do modal', () => {
  it('sai sem o "(−)" e sem o "="', () => {
    expect(semPrefixo('(−) Custo variável')).toBe('Custo variável');
    expect(semPrefixo('= Margem de contribuição')).toBe('Margem de contribuição');
    expect(semPrefixo('= VBP')).toBe('VBP');
    expect(semPrefixo('Nutrição')).toBe('Nutrição');
  });
});

/* ══════════════ NAVEGAR PELO DONUT — adendo do fix1, item 11 ══════════════ */

/**
 * ⚠ O CAMINHO É A PORTA DE VOLTA. Sem ele, entrar numa filha pelo donut seria uma viagem só de ida:
 * o operador teria de fechar e reabrir o modal na linha certa, e perderia a unidade e a safra que
 * tinha escolhido.
 */
describe('a navegação para a filha, no mesmo modal', () => {
  const dre = (l: DrePecLinhas): DrePecuaria => ({
    periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
    rateio_adm: { pool: 0, bruto: 0, criterio: '' },
    fazendas: [], total: l,
  });
  const montarGrupo = () => render(
    <PecHistoricoLinhaModal aberto recorte={recorte({})}
      atual={dre(LINHAS_NJ)} meta={null}
      anos={[{ de: '2024-07', ate: '2025-06', dre: dre(LINHAS_NJ), carregando: false }]}
      periodoRotulo="Safra 25/26" clienteNome="NJ Pecuária" unidadeInicial="rs"
      onFechar={() => {}} />,
  );
  /* ⚠ O `h2` PASSOU A CARREGAR O BOTÃO "Voltar" (fix3), e os três casos abaixo falharam por isso —
     falha certa, pela razão certa: o contrato do cabeçalho mudou. O que eles querem ler é o
     CAMINHO, então o controle sai da leitura em vez de os casos serem afrouxados. */
  const titulo = () => (document.querySelector('h2')?.textContent ?? '').replace(/^\s*Voltar/, '');

  it('clicar na legenda de uma filha abre a filha, com o caminho; clicar no pai volta', () => {
    montarGrupo();
    expect(titulo()).toBe('Custo variável · histórico');

    /* A legenda do grupo lista as filhas — "Nutrição" é a maior delas. */
    const item = [...document.querySelectorAll('span')]
      .find(s => s.textContent === 'Nutrição' && s.className.includes('truncate'));
    expect(item).toBeDefined();
    fireEvent.click(item as Element);
    expect(titulo()).toBe('Custo variável›Nutrição · histórico');

    /* E o pai no caminho é um botão: clicar nele desfaz a descida. */
    const voltar = [...document.querySelectorAll('h2 button')]
      .find(b => b.textContent === 'Custo variável');
    expect(voltar).toBeDefined();
    fireEvent.click(voltar as Element);
    expect(titulo()).toBe('Custo variável · histórico');
  });

  /**
   * ⚠ DUAS PORTAS PARA A MESMA VOLTA — fix3. Medido na tela em 23/09: o nome do pai no caminho
   * tinha 60×15px, a mesma cor e o mesmo peso do resto do título; o clique FUNCIONAVA em cima do
   * texto e não fazia nada um pixel fora. Um controle que só existe depois que o ponteiro o
   * encontra é, para quem usa, um controle que não existe — daí o botão "Voltar" ao lado.
   * ⚠ O TESTE COBRA AS DUAS, e o `aria-label` é o contrato: ele é o que um leitor de tela ouve e o
   * que este teste procura, em vez do texto, que é decoração.
   */
  it('as duas portas de volta levam ao mesmo lugar', () => {
    const descer = () => {
      const item = [...document.querySelectorAll('div')]
        .find(d => d.className.includes('cursor-pointer') && d.textContent?.trim() === 'Nutrição');
      fireEvent.click(item as Element);
    };
    const portas = () => [...document.querySelectorAll('h2 button')]
      .filter(b => b.getAttribute('aria-label') === 'Voltar para Custo variável');
    const legendaTem = (n: string) => [...document.querySelectorAll('span')]
      .some(x => x.textContent === n && x.className.includes('truncate'));

    montarGrupo();
    descer();
    expect(titulo()).toBe('Custo variável›Nutrição · histórico');
    /* São duas: o botão "Voltar" e o nome do pai no caminho. */
    expect(portas()).toHaveLength(2);

    fireEvent.click(portas()[0]);
    expect(titulo()).toBe('Custo variável · histórico');
    /* E o pai reabre INTEIRO: a legenda volta a ser a das filhas. */
    expect(legendaTem('Pastagem')).toBe(true);
    expect(legendaTem('Sanidade')).toBe(true);

    descer();
    fireEvent.click(portas()[1]);
    expect(titulo()).toBe('Custo variável · histórico');
    expect(legendaTem('Pastagem')).toBe(true);
  });

  /**
   * ⚠ DE UMA IRMÃ PARA A OUTRA, SEM SUBIR — o conserto do fix2. A regra anterior ("andar de lado
   * não navega") era do Chat e a homologação a derrubou: dentro de Nutrição a legenda lista
   * Sanidade e Pastagem com o nome escrito, e clicar nelas não fazia nada. Quem compara centros vai
   * de um a outro; o dado das duas já está na mesma leitura.
   * ⚠ E A UNIDADE E A SAFRA ATRAVESSAM A TROCA: mudar de irmã é mudar de linha, não recomeçar o
   * modal. Quem estava lendo R$/cab/mês de 24/25 continua ali.
   */
  it('dentro de uma filha, clicar numa irmã troca a folha do caminho', () => {
    montarGrupo();
    const clicarNaLegenda = (nome: string) => {
      const item = [...document.querySelectorAll('div')]
        .find(d => d.className.includes('cursor-pointer') && d.textContent?.trim() === nome);
      expect(item).toBeDefined();
      fireEvent.click(item as Element);
    };
    clicarNaLegenda('Nutrição');
    expect(titulo()).toBe('Custo variável›Nutrição · histórico');

    /* A unidade escolhida DEPOIS de descer tem de sobreviver à troca de irmã. */
    const chip = [...document.querySelectorAll('button')].find(b => b.textContent === 'R$/cab/mês');
    fireEvent.click(chip as Element);

    clicarNaLegenda('Sanidade');
    expect(titulo()).toBe('Custo variável›Sanidade · histórico');
    clicarNaLegenda('Pastagem');
    expect(titulo()).toBe('Custo variável›Pastagem · histórico');
    /* ⚠ O `Segmentado` MARCA COM NAVY, não com `data-state`: quem diz o que está escolhido é a
       classe `bg-primary` — a regra permanente do CLAUDE.md. */
    expect([...document.querySelectorAll('button')]
      .find(b => b.textContent === 'R$/cab/mês')?.className).toContain('bg-primary');

    /* E o pai continua sendo a porta de volta, de qualquer irmã. */
    fireEvent.click([...document.querySelectorAll('h2 button')][0]);
    expect(titulo()).toBe('Custo variável · histórico');
  });

  /**
   * ⚠ O SUBTOTAL DEIXOU DE TER DONUT — DRE-HISTORICO-LINHA-01c, e este caso mudou de contrato por
   * isso: até aqui ele afirmava que a legenda do anel não era clicável; agora não há anel nenhum.
   * Um resultado não tem composição para um anel mostrar, e o que ele pede é dinheiro ao lado do
   * peso no VBP. Falha certa, pela razão certa — o teste foi atualizado, não afrouxado.
   */
  it('subtotal "=": modal de resultado — sem chips, sem donut, com as três linhas', () => {
    render(
      <PecHistoricoLinhaModal aberto
        recorte={recorte({ chave: 'margem', rotulo: '= Margem de contribuição' })}
        atual={dre(LINHAS_NJ)} meta={null} anos={[]}
        periodoRotulo="Safra 25/26" clienteNome="NJ Pecuária" unidadeInicial="rs"
        onFechar={() => {}} />,
    );
    /* Sem anel: nenhuma legenda de fatia. */
    expect([...document.querySelectorAll('div')]
      .filter(d => d.className.includes('text-[9px]') && d.className.includes('items-center'))).toHaveLength(0);
    /* Sem chips de unidade. */
    expect([...document.querySelectorAll('button')].some(b => b.textContent === 'R$/cab/mês')).toBe(false);
    /* E as três linhas, nesta ordem: o dinheiro, o peso e o denominador dele. */
    const rotulos = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .map(tr => tr.cells[0]?.textContent);
    expect(rotulos).toEqual(['R$', '% do VBP', 'VBP']);
  });
});

/* ══════════════ O Δ SELECIONÁVEL E O MODO RESULTADO — 01c ══════════════ */

describe('o Δ em pontos percentuais', () => {
  /* ⚠ 40 % CONTRA 20 % SÃO VINTE PONTOS, não "100 % a mais": a variação relativa de uma razão é
     correta e engana quem compara margens. */
  it('a diferença de dois percentuais sai em pp, com a cor da natureza', () => {
    expect(deltaEmPontos(40, 20, 'receita')?.texto).toBe('▲ 20,0 pp');
    expect(deltaEmPontos(40, 20, 'receita')?.cor).toBe('text-green-700');
    /* Custo que sobe é ruim, mesmo em pontos. */
    expect(deltaEmPontos(40, 20, 'custo')?.cor).toBe('text-red-600');
    expect(deltaEmPontos(20, 40, 'custo')?.texto).toBe('▼ 20,0 pp');
  });

  it('sem uma das pontas não há diferença nenhuma', () => {
    expect(deltaEmPontos(null, 20, 'custo')).toBeNull();
    expect(deltaEmPontos(40, null, 'custo')).toBeNull();
  });
});

describe('a abreviação da tabela', () => {
  /* ⚠ PISO MAIS ALTO QUE O DA BARRA, e é o mesmo formatador: a coluna da tabela tem 72px e
     "87.430,55" cabe inteiro; a barra tem 22 e não cabe. */
  it('a tabela só abrevia a partir de cem mil; a barra, a partir de mil', () => {
    expect(abreviar('2.588.458,09', PISO_K_TABELA)).toBe('2,6 mi');
    expect(abreviar('326.153,40', PISO_K_TABELA)).toBe('326,2 k');
    expect(abreviar('87.430,55', PISO_K_TABELA)).toBe('87.430,55');
    expect(abreviar('87.430,55')).toBe('87,4 k');
  });
});

describe('a coluna Δ e o modal de resultado', () => {
  const dreDe = (l: DrePecLinhas): DrePecuaria => ({
    periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
    rateio_adm: { pool: 0, bruto: 0, criterio: '' },
    fazendas: [], total: l,
  });
  /* ⚠ OS TRÊS NÚMEROS SÃO DIFERENTES DE PROPÓSITO: atual 6.000, ano anterior 4.000 e meta 5.000.
     Com dois iguais, um Δ lendo a referência errada daria o mesmo resultado do certo. */
  const ATUAL = linhas({ ...LINHAS_NJ, margem: 6000 });
  const ANTERIOR = linhas({ ...LINHAS_NJ, margem: 4000 });
  const META = linhas({ ...LINHAS_NJ, margem: 5000 });

  const montarResultado = () => render(
    <PecHistoricoLinhaModal aberto
      recorte={recorte({ chave: 'margem', rotulo: '= Margem de contribuição' })}
      atual={dreDe(ATUAL)} meta={dreDe(META)}
      anos={[{ de: '2024-07', ate: '2025-06', dre: dreDe(ANTERIOR), carregando: false }]}
      periodoRotulo="Safra 25/26" clienteNome="NJ Pecuária" unidadeInicial="rs"
      onFechar={() => {}} />,
  );
  const linhaR$ = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
    .find(tr => tr.cells[0]?.textContent === 'R$');
  /* ⚠ O Δ É A ÚLTIMA CÉLULA, lida por posição a partir do fim: o número de colunas muda com o de
     anos, e um índice fixo leria a Meta em um cenário e o Δ noutro. */
  const deltaDaLinha = () => { const c = linhaR$()?.cells; return c ? c[c.length - 1].textContent : ''; };

  it('abre em Δ meta e troca para o ano anterior pelo cabeçalho', () => {
    montarResultado();
    const cabecalho = () => [...document.querySelectorAll('thead button')]
      .find(b => b.textContent?.includes('Δ'));
    expect(cabecalho()?.textContent).toContain('Δ meta');
    /* 6.000 contra a meta 5.000 = +20 %. */
    expect(deltaDaLinha()).toContain('20,0 %');

    /* ⚠ O MENU ABRE PELO TECLADO NESTE HARNESS, e isso foi MEDIDO, não escolhido: o `DropdownMenu`
       do Radix abre no `pointerdown`, e o jsdom não entrega `PointerEvent` com o que ele espera —
       depois do `fireEvent.pointerDown` o gatilho continua `data-state="closed"`. Com `Enter` ele
       abre. O caminho do teclado é o mesmo do mouse do lado de cá: o item recebe o clique e o
       estado muda. */
    fireEvent.keyDown(cabecalho() as Element, { key: 'Enter' });
    const opcao = [...document.querySelectorAll('[role=menuitem]')]
      .find(x => x.textContent?.includes('ano ant.'));
    expect(opcao).toBeDefined();
    fireEvent.click(opcao as Element);

    expect(cabecalho()?.textContent).toContain('Δ ano ant.');
    /* 6.000 contra o ano anterior 4.000 = +50 %, e não mais os 20 % da meta. */
    expect(deltaDaLinha()).toContain('50,0 %');
  });
});
