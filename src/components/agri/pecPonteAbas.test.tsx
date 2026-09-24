/**
 * O que este teste trava — as quatro coisas da ponte que nenhum outro gate vê.
 *
 * ⚠ A LEI DO GRÁFICO (a RAZÃO) é a primeira: numa ponte, a ALTURA de uma barra tem de ser
 * proporcional ao VALOR dela, e o TOPO de cada movimento tem de ser o acumulado depois dele. Um
 * waterfall em que as barras não encaixam vira um gráfico de barras qualquer, e o olho deixa de
 * ver a conta andando. TSC e build ficam mudos — altura é aritmética dentro de um `rect`.
 *
 * ⚠ A CONCILIAÇÃO COM A GRADE é a segunda, e é a razão de o modal existir: a linha "Variação do
 * estoque" do Resumido é COMPOSTA (`vpb_operacional − reposicao`), e a ponte mostra `v1 − v0`. As
 * quatro linhas do rodapé são a ponte entre os dois números, e o teste trava a conta com os
 * valores MEDIDOS no NJ 25/26 — 2.425.324 − 2.618.562 − 1.866.408,21 = −2.059.646,21.
 *
 * ⚠ AS TRANSFERÊNCIAS QUE SOMEM são a terceira. No Global o que sai de uma fazenda entra na outra,
 * e duas barras de mesma altura em sentidos opostos só ocupam espaço. O caso prova que elas somem
 * quando o líquido é ZERO e FICAM quando não é — afirmar só a ausência passaria verde também se
 * alguém apagasse as duas linhas de vez.
 *
 * ⚠ O "—" DO R$/@ DOS AJUSTES é a quarta, e ela parece cosmética e não é. O valor dos movimentos é
 * a @ ao preço do mês do movimento e o das pontas é a preço da ponta; o ajuste em reais absorve a
 * diferença entre os dois critérios e pode ter SINAL OPOSTO ao das arrobas. No fixture (os números
 * reais do NJ 25/26) isso daria −15.508 R$/@ impresso na tela como se fosse preço.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PecPonteTabela, PecPonteGrafico } from '@/components/agri/PecPonteAbas';
import type { PatrimonioPec, ParcelaMov } from '@/hooks/useDrePecuaria';

const p = (cabecas: number, arrobas: number, valor: number): ParcelaMov => ({ cabecas, arrobas, valor });

/** Os números medidos no NJ 25/26, Global, em 24/09/2026. */
const NJ: PatrimonioPec = {
  p0: '2025-06', p1: '2026-06', p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  categorias: [],
  total: { q0: 5510, v0: 22754807, q1: 5511, v1_p0: 22561569, v1_p1: 25180131,
    vpb: -193238, efeito: 2618562 },
  movimentos: {
    inicio: p(5510, 67927.83, 22754807),
    fim: p(5511, 67460.87, 25180131),
    produzidas: p(0, 39288.01, 15720880.27),
    nascimentos: p(2263, 2263.00, 916860),
    compradas: p(468, 4171.50, 1450082),
    /* ⚠ IGUAIS DE PROPÓSITO: no Global a transferência entre fazendas do mesmo cliente se anula. */
    transf_entrada: p(1642, 16384.51, 6404604.52),
    transf_saida: p(1642, 16384.51, 6404604.52),
    vendas_abates: p(2645, 45515.04, 16954539.79),
    mortes: p(85, 578.53, 195215),
    ajustes: p(0, -95.90, 1487256.52),
  },
};

/* ⚠ SEM MODAL E SEM PORTAL — MODAL-UNICO-01. A ponte deixou de ser um modal e virou duas abas do
   modal da variação, então o teste monta os COMPONENTES DAS ABAS direto. Some com o `fireEvent`
   no botão "Gráfico" (não há mais botão aqui) e com a leitura via `document.body` por causa do
   portal do Radix — o que se lê agora é o `container` do próprio render. */
const montar = (over?: Partial<PatrimonioPec>, reposicao: number | null = 1866408.21) =>
  render(
    <PecPonteTabela m={{ ...NJ, ...over }.movimentos} reposicao={reposicao}
      efeito={{ ...NJ, ...over }.total.efeito} />,
  );
const montarGrafico = (over?: Partial<PatrimonioPec>) =>
  render(<PecPonteGrafico m={{ ...NJ, ...over }.movimentos} />);

/** O texto de uma linha da tabela, pela primeira célula. */
/* ⚠ O GENÉRICO DO `querySelectorAll`, NÃO UM `as`: sem ele o retorno é `Element` e `.cells` não
   existe no tipo — e código novo com cast reprova o PR. */
const linha = (rot: string) =>
  [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
    .find(tr => tr.cells[0]?.textContent?.trim() === rot);

describe('PecPonteTabela / PecPonteGrafico', () => {
  it('concilia com a linha do DRE Resumido, ao centavo', () => {
    montar();
    /* (v1 − v0) − efeito − reposição = a linha "Variação do estoque" do Resumido. */
    const l = linha('= Variação do estoque (linha do DRE)');
    expect(l).toBeTruthy();
    expect(l!.cells[1].textContent).toBe('-2.059.646');

    /* ⚠ E AS TRÊS PARCELAS TÊM DE ESTAR NA TELA, não só o resultado: um total certo com parcelas
       erradas passaria verde, e é justamente a parcela que o operador veio conferir. */
    expect(linha('Variação do valor (a preços de cada data)')!.cells[1].textContent).toBe('+2.425.324');
    expect(linha('(−) Efeito do preço (mercado)')!.cells[1].textContent).toBe('-2.618.562');
    expect(linha('(−) Reposição comprada')!.cells[1].textContent).toBe('-1.866.408');
  });

  it('sem reposição na coluna, a linha do DRE é traço e nunca zero', () => {
    montar(undefined, null);
    expect(linha('(−) Reposição comprada')!.cells[1].textContent).toBe('—');
    expect(linha('= Variação do estoque (linha do DRE)')!.cells[1].textContent).toBe('—');
  });

  it('a linha de Ajustes não mostra R$/@', () => {
    montar();
    const l = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .find(tr => tr.cells[0]?.textContent?.includes('Ajustes'));
    expect(l).toBeTruthy();
    expect(l!.cells[1].textContent).toBe('-96');     // arrobas
    expect(l!.cells[2].textContent).toBe('—');       // R$/@ — não é preço de nada
    expect(l!.cells[3].textContent).toBe('+1.487.257'); // e o valor tem sinal OPOSTO, de propósito
  });

  it('a transferência some quando o líquido é zero e fica quando não é', () => {
    montar();
    expect(screen.queryByText('(+) Transf. entrada')).toBeNull();
    expect(screen.queryByText('(−) Transf. saída')).toBeNull();

    /* ⚠ E A PROVA DE QUE A BUSCA SABE ACHAR: com líquido diferente de zero as duas aparecem. Sem
       este segundo trecho, o caso acima passaria verde também se as linhas nunca fossem montadas. */
    montar({ movimentos: { ...NJ.movimentos, transf_saida: p(800, 8000, 3000000) } });
    expect(screen.getByText('(+) Transf. entrada')).toBeTruthy();
    expect(screen.getByText('(−) Transf. saída')).toBeTruthy();
  });

  it('a ponte fecha na conta impressa sob o gráfico', () => {
    montarGrafico();
    // 67.928 + 45.723 − 46.094 − 96 = 67.461
    const conta = document.body.textContent ?? '';
    expect(conta).toContain('67.928');
    expect(conta).toContain('67.461');
  });

  it('LEI DO GRÁFICO: a altura é proporcional ao valor e o topo é o acumulado', () => {
    montarGrafico();

    const rects = [...document.querySelectorAll('svg rect')];
    expect(rects.length).toBeGreaterThan(4);

    const alt = (i: number) => Number(rects[i].getAttribute('height'));
    const y = (i: number) => Number(rects[i].getAttribute('y'));

    /* As barras, na ordem: início, produzidas, nascimentos, compradas, vendas, mortes, ajustes, fim.
       (as duas transferências somem — líquido zero) */
    const M = NJ.movimentos;
    const inicio = 0, produzidas = 1, fim = rects.length - 1;

    /* RAZÃO: altura(produzidas) / altura(início) = @produzidas / @início. */
    expect(alt(produzidas) / alt(inicio)).toBeCloseTo(M.produzidas.arrobas / M.inicio.arrobas, 2);

    /* ENCAIXE: o topo de "produzidas" fica ACIMA do topo de "início" (ela empilha sobre ele), e a
       base dela é exatamente o topo do início. Em SVG, y menor = mais alto. */
    expect(y(produzidas)).toBeLessThan(y(inicio));
    expect(y(produzidas) + alt(produzidas)).toBeCloseTo(y(inicio), 1);

    /* ⚠ E A PROVA QUE FECHA A PONTE: a barra do FIM sai do zero, como a do início, e as duas têm a
       mesma BASE. Se a última barra flutuasse, o gráfico não estaria conciliando nada. */
    expect(y(fim) + alt(fim)).toBeCloseTo(y(inicio) + alt(inicio), 1);
    expect(alt(fim) / alt(inicio)).toBeCloseTo(M.fim.arrobas / M.inicio.arrobas, 2);
  });
});
