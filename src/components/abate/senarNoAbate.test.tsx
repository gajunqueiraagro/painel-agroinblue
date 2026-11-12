/**
 * IMPORTAR-ABATE-01 (D5) — o SENAR é retenção PRÓPRIA na tela do abate, nunca dentro do Funrural.
 *
 * O caso: a OC 5d255b74 (EXP, lote 6). O documento do frigorífico retém só SENAR (0,2%): 330,43 no lote 1 e 11,76 no lote 2. Ele
 * estava gravado no par `funrural`; a 117505 o leva para o par `senar`. Depois disso a tela tem de:
 *   - ler e GRAVAR o par senar (o `oc_salvar_abate` grava o que vier: sem a chave, o SENAR vira nulo no próximo Salvar);
 *   - tirar o SENAR do bruto junto com o Funrural (o líquido do lote é o gravado, 164.884,52);
 *   - mostrar a retenção inteira na linha "(−) Funrural e impostos" e o SENAR no campo dele;
 *   - no Rebanho, a mesma retenção de antes (o `descontoFunrural` da lista é a retenção do lote).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { buildAbateCalculation } from '@/lib/calculos/abate';
import { linhaVazia, paraCalculo, totaisDoAbate, type LoteAbate } from '@/components/abate/calculoDoLote';
import { paraPayload, daLinha, type LinhaAbate, type AbateRow } from '@/hooks/useOperacaoAbate';
import { ModalNegociarLote } from '@/components/abate/ModalNegociarLote';
import { BlocoResumoLote } from '@/components/abate/AbaLotesAbate';
import { aplicarEnriquecimentoOC, type EnriquecimentoOC } from '@/lib/oc/enriquecerMovimentosOC';
import type { Lancamento } from '@/types/cattle';

/* O lote 1 do lote 6 (números do acerto; sintético no resto). */
const LOTE1: LoteAbate = { id: 'l1', ordem: 1, categoria: 'vacas', categoriaLabel: 'Vacas', quantidade: 26, pesoMedioKg: 518.59 };
const lote1 = (extra: Partial<LinhaAbate> = {}): LinhaAbate => ({
  ...linhaVazia('l1'),
  pesoCarcacaKg: 7051.5, pesoCarcacaFonte: 'total', precoArroba: 351.4464, precoFonte: 'arroba',
  valorLiquido: 164884.52,
  ...extra,
});
const calc = (l: LinhaAbate) => buildAbateCalculation(paraCalculo(l, LOTE1));

describe('a conta do lote com SENAR', () => {
  it('SENAR em R$ sai do bruto: lote 1 do lote 6 = líquido gravado 164.884,52', () => {
    const c = calc(lote1({ senar: { valor: 330.43, fonte: 'reais' } }));
    expect(c.valorBruto).toBe(165214.95);
    expect(c.senarTotal).toBe(330.43);
    expect(c.funruralTotal).toBe(0);
    expect(c.retencaoTotal).toBe(330.43);
    expect(c.valorLiquido).toBe(164884.52);
  });

  it('SENAR em % incide sobre o bruto, como o Funrural: 0,2% de 165.214,95 = 330,43', () => {
    expect(calc(lote1({ senar: { valor: 0.2, fonte: 'pct' } })).senarTotal).toBe(330.43);
  });

  it('reclassificar não muda o líquido: a mesma retenção no Funrural ou no SENAR dá o mesmo número', () => {
    const antes = calc(lote1({ funrural: { valor: 330.43, fonte: 'reais' } }));
    const depois = calc(lote1({ senar: { valor: 330.43, fonte: 'reais' } }));
    expect(depois.valorLiquido).toBe(antes.valorLiquido);
    expect(depois.retencaoTotal).toBe(antes.retencaoTotal);
    expect([antes.funruralTotal, antes.senarTotal, depois.funruralTotal, depois.senarTotal]).toEqual([330.43, 0, 0, 330.43]);
  });

  it('composta (grupo B, 8c8a864d): Funrural 1.403,34 + SENAR 196,27 = retenção 1.599,61', () => {
    const c = calc(lote1({ funrural: { valor: 1403.34, fonte: 'reais' }, senar: { valor: 196.27, fonte: 'reais' } }));
    expect(c.retencaoTotal).toBe(1599.61);
    expect(c.valorLiquido).toBe(Math.round((c.valorBruto - 1599.61) * 100) / 100);
  });

  it('os totais da operação somam o SENAR à parte e a retenção inteira', () => {
    const l2: LoteAbate = { ...LOTE1, id: 'l2', ordem: 2, quantidade: 1 };
    const linhas = new Map([
      ['l1', calc(lote1({ senar: { valor: 330.43, fonte: 'reais' } }))],
      ['l2', buildAbateCalculation(paraCalculo({ ...linhaVazia('l2'), pesoCarcacaKg: 234.5, pesoCarcacaFonte: 'total',
        precoArroba: 376.09, precoFonte: 'arroba', funrural: { valor: 1, fonte: 'reais' }, senar: { valor: 11.76, fonte: 'reais' } }, l2))],
    ]);
    const t = totaisDoAbate([LOTE1, l2], linhas);
    expect(t.senar).toBeCloseTo(342.19, 2);
    expect(t.funrural).toBeCloseTo(1, 2);
    expect(t.retencoes).toBeCloseTo(343.19, 2);
  });
});

describe('o par senar vai e volta do banco', () => {
  it('paraPayload manda senar_valor COM a fonte', () => {
    const p = paraPayload(lote1({ senar: { valor: 330.43, fonte: 'reais' } }));
    expect(p.senar_valor).toBe(330.43);
    expect(p.senar_fonte).toBe('reais');
    expect('funrural_valor' in p).toBe(false);
  });

  it('daLinha lê o senar gravado', () => {
    const cru: AbateRow = {
      operacao_lote_id: 'l1', cenario: 'realizado', peso_carcaca_kg: 7051.5, peso_carcaca_fonte: 'total', rendimento_carcaca_pct: null,
      peso_total_kg_nf: null, preco_arroba: 351.4464, preco_fonte: 'arroba', valor_base_override: null, valor_liquido: 164884.52,
      bonus_precoce_valor: null, bonus_precoce_fonte: null, bonus_qualidade_valor: null, bonus_qualidade_fonte: null,
      bonus_lista_trace_valor: null, bonus_lista_trace_fonte: null, desconto_qualidade_valor: null, desconto_qualidade_fonte: null,
      outros_descontos_valor: null, outros_descontos_fonte: null, funrural_valor: null, funrural_fonte: null,
      senar_valor: 330.43, senar_fonte: 'reais',
    };
    const l = daLinha(cru);
    expect(l.senar).toEqual({ valor: 330.43, fonte: 'reais' });
    /* ida e volta: o Salvar da tela devolve o SENAR, nunca o apaga */
    expect(paraPayload(l).senar_valor).toBe(330.43);
  });
});

describe('a tela mostra o SENAR', () => {
  it('o modal do lote: SENAR no campo dele, Funrural vazio, e a linha da retenção com 330,43', () => {
    render(<ModalNegociarLote lote={LOTE1} linha={lote1({ senar: { valor: 330.43, fonte: 'reais' } })} cenario="realizado"
      onAplicar={vi.fn()} onFechar={vi.fn()} />);
    fireEvent.click(screen.getByText('Bônus, descontos e impostos'));
    const campo = (rotulo: string) => screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL')!.parentElement!.querySelector('input')!;
    expect(campo('SENAR').value.replace(/\s/g, ' ')).toBe('330,43');
    expect(campo('Funrural').value).toBe('');
    const resultado = within(screen.getByTestId('resultado-do-lote'));
    const linhaRet = resultado.getByText('(−) Funrural e impostos').closest('tr')!;
    expect(linhaRet.textContent).toMatch(/330,43/);
    expect(resultado.getByText('Líquido do lote').closest('tr')!.textContent).toMatch(/164\.884,52/);
  });

  it('o Aplicar converte o SENAR em % para R$ e o líquido sai com ele', () => {
    const onAplicar = vi.fn();
    render(<ModalNegociarLote lote={LOTE1} linha={lote1({ senar: { valor: 0.2, fonte: 'pct' } })} cenario="realizado"
      onAplicar={onAplicar} onFechar={vi.fn()} />);
    fireEvent.click(screen.getByText('Aplicar'));
    const l = onAplicar.mock.calls[0][0] as LinhaAbate;
    expect(l.senar).toEqual({ valor: 330.43, fonte: 'reais' });
    expect(l.valorLiquido).toBe(164884.52);
  });

  it('o bloco-resumo do cartão do lote: a retenção inteira na linha "(−) Funrural e impostos"', () => {
    const c = calc(lote1({ funrural: { valor: 100, fonte: 'reais' }, senar: { valor: 330.43, fonte: 'reais' } }));
    render(<BlocoResumoLote c={c} />);
    const rotulo = screen.getByText('(−) Funrural e impostos');
    expect(rotulo.nextElementSibling!.textContent).toMatch(/430,43/);
  });
});

describe('o Rebanho: a retenção do lote é Funrural + SENAR', () => {
  const mk = (over: Partial<Lancamento>): Lancamento => ({
    id: 'm1', tipo: 'abate', quantidade: 13, categoria: 'vacas' as Lancamento['categoria'], data: '2026-10-23', fazendaId: 'f1', ...over,
  } as Lancamento);
  const abate = (funrural: number | null, senar: number | null): EnriquecimentoOC => ({
    fornecedorId: 'c', fornecedorNome: 'Frigorífico', valorLote: null, qtdLote: 26, criterio: null,
    abate: {
      pesoCarcacaKg: 7051.5, precoArroba: 351.4464,
      bonusPrecoce: null, bonusPrecoceFonte: null, bonusQualidade: null, bonusQualidadeFonte: null,
      bonusListaTrace: null, bonusListaTraceFonte: null, descontoQualidade: null, descontoQualidadeFonte: null,
      outrosDescontos: null, outrosDescontosFonte: null,
      funrural, funruralFonte: funrural == null ? null : 'reais',
      senar, senarFonte: senar == null ? null : 'reais',
      valorLiquido: 164884.52, qtdLote: 26,
    },
  });

  it('depois da reclassificação (só SENAR) a lista mostra a mesma retenção de antes, prorrateada', () => {
    const [antes] = aplicarEnriquecimentoOC([mk({})], new Map([['m1', abate(330.43, null)]]));
    const [depois] = aplicarEnriquecimentoOC([mk({})], new Map([['m1', abate(null, 330.43)]]));
    expect(depois.descontoFunrural).toBeCloseTo(330.43 / 2, 2);
    expect(depois.descontoFunrural).toBe(antes.descontoFunrural);
  });

  it('composta: Funrural + SENAR', () => {
    const [r] = aplicarEnriquecimentoOC([mk({ quantidade: 26 })], new Map([['m1', abate(1403.34, 196.27)]]));
    expect(r.descontoFunrural).toBeCloseTo(1599.61, 2);
  });
});
