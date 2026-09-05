/**
 * O que este teste trava — os totais da grade do abate e a régua de "a negociar".
 *
 * ⚠ O TOPO E O RESUMO LATERAL MOSTRAM OS MESMOS NÚMEROS LADO A LADO. Enquanto cada um
 * somava por si, bastava um esquecer de proteger a divisão por zero para os dois
 * discordarem na mesma tela — e o operador não teria como saber qual valia. Por isso a
 * conta é uma só, `totaisDoAbate`, e é ela que este teste fixa.
 *
 * ⚠ E A UNIDADE CONTINUA SENDO A ARMADILHA: `pesoCarcacaKg` é o TOTAL do lote, a lib
 * trabalha POR CABEÇA, e `paraCalculo` divide pela quantidade. Se alguém "simplificar"
 * essa fronteira, a carcaça total do topo erra por um fator de quantidade — e a cascata
 * continua fechando consigo mesma, calada.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia, totaisDoAbate, type LoteAbate } from '@/components/abate/calculoDoLote';
import { AbaLotesAbate } from '@/components/abate/AbaLotesAbate';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';

const lote = (id: string, ordem: number, qtd: number, pesoVivo: number): LoteAbate => ({
  id, ordem, categoria: 'bois', categoriaLabel: 'Bois', quantidade: qtd, pesoMedioKg: pesoVivo,
});

/** 10 cab × 500 kg vivo; carcaça 2.500 kg no LOTE = 250/cab → RC 50%; 166,6667 @. */
const negociada = (id: string): LinhaAbate => ({
  ...linhaVazia(id), pesoCarcacaKg: 2500, pesoCarcacaFonte: 'total',
  precoArroba: 300, precoFonte: 'arroba',
});

const calcular = (lotes: LoteAbate[], linhas: Map<string, LinhaAbate>) => {
  const m = new Map<string, AbateCalculation>();
  lotes.forEach(l => m.set(l.id, buildAbateCalculation(paraCalculo(linhas.get(l.id) ?? linhaVazia(l.id), l))));
  return totaisDoAbate(lotes, m);
};

const A = lote('l1', 1, 10, 500);
const B = lote('l2', 2, 10, 500);

describe('totaisDoAbate — uma conta só para o topo e o resumo', () => {
  it('soma cabeças, peso vivo, carcaça e arrobas dos lotes', () => {
    const t = calcular([A, B], new Map([['l1', negociada('l1')], ['l2', negociada('l2')]]));
    expect(t.cabecas).toBe(20);
    expect(t.pesoVivo).toBe(10000);
    /* ⚠ 5.000 kg, não 50.000: a carcaça gravada é o total do LOTE, e `paraCalculo` a
       divide pela quantidade antes de entregar à lib. Se a divisão sumir, este número
       vira dez vezes maior e o RC passa de 50% para 500%. */
    expect(t.carcaca).toBe(5000);
    expect(t.rc).toBe(50);
    expect(t.arrobas).toBeCloseTo(333.3334, 3);
  });

  it('as médias por cabeça saem das somas, não da média das médias', () => {
    /* Um lote de 10 cab a 500 kg e outro de 30 cab a 600 kg: a média ponderada é 575,
       não 550. Média de médias é o erro clássico deste tipo de topo. */
    const G = lote('l3', 3, 30, 600);
    const t = calcular([A, G], new Map());
    expect(t.pesoMedio).toBe(575);
  });

  it('sem lote nenhum, tudo é zero e nada é infinito', () => {
    /* ⚠ Zero aqui é o que permite à tela imprimir "—". Uma divisão desprotegida daria
       `Infinity`/`NaN`, que atravessa a formatação e aparece para o operador. */
    const t = calcular([], new Map());
    expect(t.cabecas).toBe(0);
    expect(t.pesoMedio).toBe(0);
    expect(t.rc).toBe(0);
    expect(Number.isFinite(t.arrobaCab)).toBe(true);
  });

  it('lote sem negociação não soma valor, mas soma animais', () => {
    /* O rebanho existe antes do preço: 20 cabeças continuam 20 cabeças. */
    const t = calcular([A, B], new Map([['l1', negociada('l1')]]));
    expect(t.cabecas).toBe(20);
    expect(t.bruto).toBeGreaterThan(0);
    expect(t.liquido).toBe(t.bruto);
  });
});

const loteForm = (idLocal: string, observacao: string) => ({
  idLocal, ordem: 1, categoria: 'bois', quantidade: '10', pesoMedioKg: '500',
  criterioValor: 'kg' as const, valorInformado: '', observacao,
});

const lotesApiFalso = (lotes: ReturnType<typeof loteForm>[] = []): CompraLotesApi => ({
  lotes, loading: false, saving: false,
  adicionarLote: () => 'x', editarLote: () => {}, removerLote: () => {},
  salvar: async () => 1, recarregar: async () => {},
  totais: { lotes: 0, animais: 0, pesoTotal: 0, valorNegociado: 0 },
});

describe('a grade — o que o operador vê antes de negociar', () => {
  const montar = (linhas: Map<string, LinhaAbate>, formLotes: ReturnType<typeof loteForm>[] = []) => render(
    <AbaLotesAbate lotes={[A]} linhas={linhas} cenario="realizado"
      cenariosExistentes={['realizado']} onCenarioChange={() => {}}
      lotesApi={lotesApiFalso(formLotes)} categoriasDisponiveis={[{ value: 'bois', label: 'Bois' }]}
      onLinhaChange={() => {}} />,
  );

  it('lote sem preço aparece como "A negociar", e o líquido é traço', () => {
    /* ⚠ ESPELHA A GUARDA DO BANCO: `oc_salvar_abate` recusa lote sem preço e sem carcaça.
       Mostrar R$ 0,00 ali faria o lote parecer negociado por nada. */
    montar(new Map());
    /* Duas vezes, e as duas contam: a pílula do topo (nenhum lote negociado ainda) e a do
       cartão. Se o topo deixasse de refletir o estado dos lotes, sobraria uma só. */
    expect(screen.getAllByText('A negociar')).toHaveLength(2);
    expect(screen.getByText('Líquido do lote')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('lote negociado mostra o líquido do lote e o por-arroba', () => {
    /* ⚠ O CARTÃO PERDEU A CASCATA em ABATE-UX-01i: as seis linhas vivem só no modal. O
       que o cartão responde é "quanto rendeu este lote", que é o que se compara entre os
       quatro lado a lado. */
    montar(new Map([['l1', negociada('l1')]]));
    expect(screen.getAllByText('Negociado').length).toBeGreaterThanOrEqual(2);
    /* 166,6667 @ × R$ 300 = R$ 50.000, sem bônus nem desconto. */
    expect(screen.getAllByText('R$ 50.000,00').length).toBeGreaterThan(0);
    /* Duas vezes: o líquido/@ do cartão e o do bloco de topo — e é a mesma conta. */
    expect(screen.getAllByText('R$ 300,00/@').length).toBeGreaterThan(0);
  });

  it('o cabeçalho conta os lotes e as cabeças', () => {
    montar(new Map());
    expect(screen.getByText('1 · 10 cab')).toBeInTheDocument();
  });

  it('a observação do lote vira a linha de contexto do cartão', () => {
    /* ⚠ É O NÚMERO DA OC DO FRIGORÍFICO — como o produtor reconhece o lote no papel que
       recebe. Sem ele, quatro lotes de "Bois · 10 cab" ficam indistinguíveis na grade. */
    montar(new Map(), [loteForm('l1', 'OC 7914')]);
    expect(screen.getByText('OC 7914')).toBeInTheDocument();
  });

  it('sem observação a linha some — nunca vira "—"', () => {
    /* Traço afirmaria que falta um dado que ninguém pediu: a observação é opcional. */
    const { container } = montar(new Map(), [loteForm('l1', '   ')]);
    expect(container.textContent).not.toContain('OC ');
  });
});
