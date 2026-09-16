/**
 * O QUE ESTE TESTE TRAVA — quais células da grade abrem o quê.
 *
 * ⚠ É A PARTE QUE JÁ QUEBROU DUAS VEZES, e as duas de formas que passam em TSC e build: no PR-02
 * o clique existia só na célula de R$, e as de /ha e /sc eram inertes; no PR-03 um guard de
 * `pool > 0` fazia o clique numa linha de centro não fazer NADA — nem abrir, nem avisar. Nenhum
 * gate pega isso; só exercitar o clique pega.
 * ⚠ SEM SUBIR A APLICAÇÃO: a tela inteira quer sessão, react-query, router e três contextos. A
 * `Grade` é pura — recebe o payload e devolve a tabela —, e é nela que a decisão mora.
 * ⚠ OS NÚMEROS SÃO OS DO NJ 25/26, para o teste falar a língua da homologação.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Grade } from '@/pages/AgriDreLavouraTab';
import type { DreLavoura, DreCultura, DreCentro, DreValor, DreLinhas } from '@/hooks/useDreLavoura';

const v = (valor: number, direto = valor, rateado = 0): DreValor => ({ valor, direto, rateado });

const CHAVES: (keyof DreLinhas)[] = [
  'receita_bruta', 'deducoes', 'receita_liquida', 'custeio', 'pos_colheita',
  'rateio_compartilhado', 'custo_variavel', 'margem_contribuicao', 'custo_fixo',
  'rateio_admin', 'resultado_operacional', 'juros', 'resultado_caixa', 'investimento',
  'depreciacao',
];

const linhas = (receita: number, deducoes: number, juros: number, rateio: number,
  fixo: DreValor, inv: DreValor, opEr: number, caixa: number): DreLinhas => {
  const base = Object.fromEntries(CHAVES.map(k => [k, v(0)])) as unknown as DreLinhas;
  return { ...base, receita_bruta: v(receita), deducoes: v(deducoes), juros: v(juros),
    rateio_compartilhado: v(rateio), custo_fixo: fixo, investimento: inv,
    resultado_operacional: v(opEr), resultado_caixa: v(caixa) };
};

const AMENDOIM: DreCultura = {
  cultura: 'amendoim', area_ha: 185, peso_area: 78.8, producao: 43949.4, produtividade: 237.56,
  /* ⚠ OS NÚMEROS SÃO OS DO NJ 25/26: custo fixo 100% rateado (direto 0) e investimento com
     6.204.906,69 direto + 155.295,94 de rateio. É o caso que fazia o Custo fixo aparecer 0,00. */
  linhas: linhas(2925162.25, 33905.13, 143707.14, 532913.78,
    v(76544.30, 0, 76544.30), v(6360202.63, 6204906.69, 155295.94), 379499.54, 235792.40),
  a_pagar: { operacional: 136277.79, investimento: 0 },
  custo_operacional: 2655464.72, pct_direto: 70,
  equilibrio: { preco_realizado: 66.56, preco_equilibrio: 60.42, produtividade_equilibrio: 215.7 },
};

const INSUMOS: DreCentro = {
  bloco: 'custeio', centro: 'Insumos',
  por_cultura: { amendoim: { valor: 1172900.53, direto: 1121599.85, rateado: 51300.68, a_pagar: 0 } },
  total: { valor: 1234155.85, direto: 1169045.58, rateado: 65110.27, a_pagar: 136277.79 },
};

/* ⚠ UM CENTRO DE INVESTIMENTO ao lado do de custeio: eles vão para a RPC com `p_tipo`
   DIFERENTE, e era o que faltava travar. */
const SOLO: DreCentro = {
  bloco: 'investimento', centro: 'Solo',
  por_cultura: { amendoim: { valor: 351983.4, direto: 351983.4, rateado: 0, a_pagar: 0 } },
  total: { valor: 511037.5, direto: 511037.5, rateado: 0, a_pagar: 0 },
};

const DRE: DreLavoura = {
  versao: 'dre-lavoura-01',
  safra: { id: 's1', codigo: '25/26-Lav', data_inicio: '2025-07-01', data_fim: '2026-06-30' },
  culturas: [AMENDOIM],
  total: {
    area_ha: 234.8,
    linhas: linhas(2932505.88, 34111.57, 144001.02, 676368.40,
      v(97149.20, 0, 97149.20), v(6561060.72, 6363960.79, 197099.93), 380101.10, 236101.20),
    custo_operacional: 3009508.69,
    a_pagar: { operacional: 136277.79, investimento: 0 }, pct_direto: 66,
  },
  centros: [INSUMOS, SOLO],
  rateio_admin: { admin_total: 961411.27, parcela_agricultura: 240352.82, declarado: true },
  pool_compartilhado: { custeio: 676368.4 },
  nao_apropriado: { por_bloco: {}, total: 0 },
  gerado_em: '2026-09-16',
};

/**
 * ⚠ A REGRA DE `valorDaLinha` É COPIADA DA TELA, e tem de ser: é ELA que decide se um grupo
 * mostra `direto` ou `valor`, e o invariante do PR-08 vive exatamente aí. Um teste com uma regra
 * própria provaria o que o teste acha, não o que a tela faz.
 */
const BLOCOS_SEM_LINHA_PROPRIA = ['fixo', 'investimento'];
const valorDaLinhaComoNaTela = (rateioDentro: boolean) =>
  (l: DreValor, def: { bloco?: string }) => {
    if (!def.bloco) return l.valor;
    if (rateioDentro) return l.valor;
    if (BLOCOS_SEM_LINHA_PROPRIA.includes(def.bloco)) return l.valor;
    return l.direto ?? l.valor;
  };

function montar(opts: {
  onDrill?: ReturnType<typeof vi.fn>; abrir?: ReturnType<typeof vi.fn>; rateioDentro?: boolean;
} = {}) {
  const onDrill = opts.onDrill ?? vi.fn();
  const abrir = opts.abrir ?? vi.fn();
  const rateioDentro = opts.rateioDentro ?? false;
  render(
    <Grade dre={DRE} culturas={DRE.culturas} abertos={{ custeio: true, investimento: true, fixo: true }}
      setAbertos={vi.fn()}
      rateioDentro={rateioDentro} mostrarUnitarios colsPorCultura={3}
      centrosDoBloco={b => DRE.centros.filter(c => c.bloco === b)}
      valorDaLinha={valorDaLinhaComoNaTela(rateioDentro)}
      abrir={abrir} onDrill={onDrill} onAbrirCultura={vi.fn()} />,
  );
  return { onDrill, abrir };
}

/** A célula é o `td`; o texto pode estar num `span` dentro dele. */
const celulaCom = (texto: string) => {
  const no = screen.getByText(texto);
  return no.closest('td') as HTMLTableCellElement;
};
const clicar = (el: Element) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

/* ⚠ `querySelectorAll` DEVOLVE `Element`, que não tem `cells` — o seletor tipado é
   `querySelectorAll<HTMLTableRowElement>`. Sem ele são quatro TS2339 e zero `as`. */
const linhasDaTabela = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];

/** O texto de todas as células de R$ da coluna do amendoim, linha a linha. */
const valoresDoAmendoim = () => linhasDaTabela().map(tr => tr.cells[1]?.textContent ?? '');

describe('o invariante do PR-08 — o modo não muda total nenhum', () => {
  /* ⚠ É O DEFEITO QUE ESTE TESTE TRAVA: com o grupo mostrando `direto`, o Custo fixo do NJ
     aparecia 0,00 no modo "Custos diretos" e 76.544,30 no outro — e `margem − 0 − rateio_admin`
     não dava o Resultado operacional impresso na linha de baixo. Um número de APRESENTAÇÃO
     mudando o total é o A23 quebrado e a coluna deixando de fechar. */
  it('custo fixo, investimento e os dois resultados são iguais nos dois modos', () => {
    for (const alvo of ['76.544,30', '6.360.202,63', '379.499,54', '235.792,40']) {
      cleanup(); montar({ rateioDentro: false });
      expect(valoresDoAmendoim(), `${alvo} em Custos diretos`).toContain(alvo);
      cleanup(); montar({ rateioDentro: true });
      expect(valoresDoAmendoim(), `${alvo} com rateio nos centros`).toContain(alvo);
    }
  });

  /* ⚠ TRÊS LINHAS DE RATEIO NO MODO "Custos diretos": a da cascata (custeio + pós) e as duas
     filhas novas, dentro de Custo fixo e de Investimento — os blocos sem linha própria. */
  it('em "Custos diretos" há três linhas de rateio, com os valores do NJ', () => {
    montar({ rateioDentro: false });
    const rateios = linhasDaTabela()
      .filter(tr => (tr.cells[0]?.textContent ?? '').includes('Rateio compartilhado'))
      .map(tr => tr.cells[1]?.textContent ?? '');
    expect(rateios).toEqual(['532.913,78', '76.544,30', '155.295,94']);
  });

  /* ⚠ AS DUAS FILHAS NOVAS ABREM O POOL DO SEU BLOCO (PR-09), e o `p_tipo` é o que diz qual:
     `pool_fixo` e `pool_investimento`. Mandar 'natureza' devolveria o pool de custeio +
     pós-colheita — outro número, sob o rótulo certo, que é o pior tipo de erro. */
  it('as filhas de rateio abrem o pool do bloco, cada uma com o seu p_tipo', () => {
    const { abrir } = montar({ rateioDentro: false });
    /* ⚠ O ALVO É A LINHA, NÃO O TEXTO: o Custo fixo do NJ é 100% rateado, então o grupo e a sua
       filha de rateio mostram o MESMO 76.544,30 — e um `getByText` acha os dois. As três linhas
       de rateio vêm na ordem da cascata: custeio, custo fixo, investimento. */
    const rateios = linhasDaTabela()
      .filter(tr => (tr.cells[0]?.textContent ?? '').includes('Rateio compartilhado'));
    expect(rateios).toHaveLength(3);

    clicar(rateios[1].cells[1]);
    expect(abrir).toHaveBeenCalledWith(
      'pool_fixo', null, '(−) Rateio compartilhado · Custo fixo', 'amendoim');

    clicar(rateios[2].cells[1]);
    expect(abrir).toHaveBeenCalledWith(
      'pool_investimento', null, '(−) Rateio compartilhado · Investimento', 'amendoim');

    /* ⚠ A DA CASCATA CONTINUA PEDINDO 'natureza' com chave nula — o pool de custeio +
       pós-colheita, que é outro bloco e outro número. */
    clicar(rateios[0].cells[1]);
    expect(abrir).toHaveBeenCalledWith(
      'natureza', null, '(−) Rateio compartilhado', 'amendoim');
  });

  /* ⚠ E NENHUMA DELAS NO OUTRO MODO: lá o rateio está dentro das filhas, com o ponto âmbar. */
  it('com rateio nos centros não sobra nenhuma linha de rateio', () => {
    montar({ rateioDentro: true });
    const rateios = linhasDaTabela()
      .filter(tr => (tr.cells[0]?.textContent ?? '').includes('Rateio compartilhado'));
    expect(rateios).toHaveLength(0);
  });
});

describe('quais células da grade abrem a lista de lançamentos', () => {
  /* ⚠ AS TRÊS CÉLULAS DA MESMA LINHA, porque são o MESMO número em três unidades. Foi o defeito
     do PR-02: só a de R$ abria, e clicar no /ha ensinava que a tabela é inerte. */
  it('Receita bruta · amendoim abre pelas três células (R$, /ha e /sc)', () => {
    const { onDrill } = montar();
    clicar(celulaCom('2.925.162,25'));
    expect(onDrill).toHaveBeenCalledWith('Receita Agrícola', 'Receita bruta', 'amendoim');

    onDrill.mockClear();
    clicar(celulaCom('15.811,69'));                    // 2.925.162,25 / 185
    expect(onDrill).toHaveBeenCalledWith('Receita Agrícola', 'Receita bruta', 'amendoim');

    onDrill.mockClear();
    clicar(celulaCom('66,56'));                        // 2.925.162,25 / 43.949,40
    expect(onDrill).toHaveBeenCalledWith('Receita Agrícola', 'Receita bruta', 'amendoim');
  });

  it('Deduções e Juros abrem com a chave do plano de contas', () => {
    const { onDrill } = montar();
    clicar(celulaCom('33.905,13'));
    expect(onDrill).toHaveBeenCalledWith('Deduções Agricultura', '(−) Deduções', 'amendoim');

    onDrill.mockClear();
    clicar(celulaCom('143.707,14'));
    expect(onDrill).toHaveBeenCalledWith(
      'Juros de Financiamento Agricultura', '(−) Despesas financeiras (juros)', 'amendoim');
  });

  /* ⚠ A LINHA DE CENTRO ABRE O MODAL, NÃO O DRAWER, e abre SEM depender de rateio — era o guard
     de `pool > 0` do PR-03 que a deixava muda quando o centro não tinha pool. */
  it('a linha de centro abre o modal de rateio com o centro e a cultura', () => {
    const { abrir, onDrill } = montar();
    clicar(celulaCom('1.121.599,85'));
    expect(abrir).toHaveBeenCalledWith('natureza', 'Insumos', 'Insumos', 'amendoim');
    expect(onDrill).not.toHaveBeenCalled();
  });

  /**
   * ⚠ O TIPO MUDA COM O BLOCO, e é o que separa um centro de custeio de um de investimento na
   * `fn_painel_rateio_detalhe`: os dois ramos filtram tabelas diferentes. Mandar 'natureza' para
   * Solo devolveria vazio — o `macro_custo ilike '%investimento%'` está excluído lá.
   * ⚠ ESTE TESTE NÃO PROVA QUE O MODAL DO SOLO ENCHE. A `p_chave` que a grade tem é o
   * `centro_custo` ("Solo"), e o ramo de investimento da RPC filtra por `subcentro`
   * ("Investimento Formação de Área Agrícola"). O vocabulário é que diverge, e isso é do banco —
   * ver o relatório do PR-DRE-LAVOURA-06.
   */
  it('centro de investimento vai com p_tipo investimento, não natureza', () => {
    const { abrir } = montar();
    clicar(celulaCom('351.983,40'));
    expect(abrir).toHaveBeenCalledWith('investimento', 'Solo', 'Solo', 'amendoim');
  });

  /* ⚠ A LINHA DO RATEIO COMPARTILHADO PEDE O POOL, e a chave nula é a assinatura disso: no ramo
     natureza da RPC, `p_chave` nulo significa "todos os centros compartilhados". Passar `''`
     pediria o centro cujo nome é vazio — e a RPC devolveria nada, calada. */
  it('a linha de rateio compartilhado abre o pool, com chave nula', () => {
    const { abrir, onDrill } = montar();
    clicar(celulaCom('532.913,78'));
    expect(abrir).toHaveBeenCalledWith('natureza', null, '(−) Rateio compartilhado', 'amendoim');
    expect(onDrill).not.toHaveBeenCalled();
  });

  /* ⚠ A COLUNA TOTAL NÃO ABRE: `fn_painel_rateio_detalhe` recebe `p_cultura` e não aceita
     "todas". Abrir com uma cultura arbitrária mostraria o detalhe errado sob o número certo. */
  it('a coluna Total não abre nada', () => {
    const { abrir, onDrill } = montar();
    clicar(celulaCom('2.932.505,88'));
    expect(onDrill).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });
});
