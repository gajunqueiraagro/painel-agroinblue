/**
 * NOTA-JA-LANCADA-01 — a escolha por parcela (PURO), no molde do NJ de 22/10: duas series parecidas no cliente (341,34 e 341,35/341,33);
 * cada parcela fica com o MAIS proximo, cada lancamento uma vez so'; a outra serie vira "parecidos a mais"; numero/chave entram juntos.
 */
import { describe, it, expect } from 'vitest';
import { casarJaLancados, fracaoDaNota, fraseEmParcelas, lerJaLancados, parcelasParaCasar, type LancamentoJaLancado } from './jaLancada';

const l = (id: string, n: number, difCent: number, difDias = 0, por: LancamentoJaLancado['por'] = ['valor']): LancamentoJaLancado => ({
  id, vencimento: null, pagamento: null, competencia: null, descricao: null, valorCent: 34134 + difCent, status: 'realizado', conciliado: false,
  financiamentoId: null, numeroDocumento: null, fornecedorId: 'f', fornecedorNome: 'F', fornecedorPor: 'nome',
  parcelas: n ? [{ n, difCent, difDias }] : [], por,
});
const PARC = [1, 2, 3, 4].map((n) => ({ n, vencimento: `2026-0${n + 4}-07`, valorCent: 34134 }));

describe('casarJaLancados', () => {
  it('duas series: cada parcela fica com o exato (341,34); a outra serie conta como 4 parecidos', () => {
    const r = casarJaLancados(PARC, [l('b1', 1, 1), l('a1', 1, 0), l('b2', 2, 1), l('a2', 2, 0), l('a3', 3, 0), l('b3', 3, 1), l('b4', 4, 1), l('a4', 4, 0)]);
    expect(r?.porParcela.map((x) => x.lancamento?.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(r?.outrosParecidos).toBe(4);
    expect(r?.faltam).toEqual([]);
  });
  it('o centavo e os dias: com so\' a serie de 341,35 ela e\' aceita; empate de centavos desempata pelos dias', () => {
    expect(casarJaLancados(PARC, [l('b1', 1, 1), l('b2', 2, 1)])?.porParcela.map((x) => x.lancamento?.id ?? null)).toEqual(['b1', 'b2', null, null]);
    expect(casarJaLancados(PARC.slice(0, 1), [l('longe', 1, 0, 4), l('perto', 1, 0, 1)])?.porParcela[0].lancamento?.id).toBe('perto');
  });
  it('um lancamento so\' cobre uma parcela; faltam as sem lancamento; numero/chave entram como alvos sem parcela', () => {
    const dois: LancamentoJaLancado = { ...l('x', 1, 0), parcelas: [{ n: 1, difCent: 0, difDias: 0 }, { n: 2, difCent: 0, difDias: 3 }] };
    const r = casarJaLancados(PARC, [dois, l('doc', 0, 0, 0, ['numero'])]);
    expect(r?.porParcela.map((x) => x.lancamento?.id ?? null)).toEqual(['x', null, null, null]);
    expect(r?.faltam.map((f) => f.n)).toEqual([2, 3, 4]);
    expect(r?.alvos.map((a) => a.id)).toEqual(['x', 'doc']);
  });
  it('nada achado: null', () => {
    expect(casarJaLancados(PARC, [])).toBeNull();
  });
  it('as parcelas da busca: as duplicatas; sem duplicata, o valor da nota no vencimento', () => {
    expect(parcelasParaCasar([], 136536, '2026-08-07')).toEqual([{ n: 1, vencimento: '2026-08-07', valorCent: 136536 }]);
    expect(parcelasParaCasar([{ vencimento: '2026-08-07', valorCent: 34134 }], 34134, 'x')).toEqual([{ n: 1, vencimento: '2026-08-07', valorCent: 34134 }]);
  });
  it('lerJaLancados: le^ o formato do banco e descarta o resto', () => {
    expect(lerJaLancados([{ id: 'a', valor_cent: 34134, status: 'programado', conciliado: true, parcelas: [{ n: 4, dif_cent: 0, dif_dias: 0 }], por: ['valor', 'x'] }, { semId: 1 }, 7]))
      .toEqual([expect.objectContaining({ id: 'a', valorCent: 34134, conciliado: true, parcelas: [{ n: 4, difCent: 0, difDias: 0 }], por: ['valor'] })]);
    expect(lerJaLancados(null)).toEqual([]);
  });
});

/* NOTA-CONTAS-NA-CRIACAO-01 C (P75) — o molde do Agnaldo (23/10): a nota de 3.284,88 sem duplicata, lancada antes como 821,22 ("NF_000.778.618"). */
describe('a nota ja\' lancada EM PARCELA', () => {
  const parcela = (id: string, valorCent: number): LancamentoJaLancado => ({ ...l(id, 0, 0, 0, ['numero']), valorCent });
  it('fracaoDaNota: 821,22 x 4 = 3.284,88; 1 centavo de folga por parcela; o valor da nota inteira ou maior nao e\' fracao', () => {
    expect(fracaoDaNota(82122, 328488)).toBe(4);
    expect(fracaoDaNota(82123, 328488)).toBe(4);
    expect(fracaoDaNota(82130, 328488)).toBeNull();
    expect(fracaoDaNota(328488, 328488)).toBeNull();
    expect(fracaoDaNota(0, 328488)).toBeNull();
  });
  it('a nota de 1 parcela achada em parcela: "?/4", nenhuma "que falta" (seria a nota inteira em dobro) e a frase', () => {
    const r = casarJaLancados([{ n: 1, vencimento: '2026-08-10', valorCent: 328488 }], [parcela('p1', 82122)], 328488);
    expect(r?.fracoes.get('p1')).toBe(4);
    expect(r?.emParcelas).toBe(true);
    expect(r?.faltam).toEqual([]);
    expect(r?.alvos.map((a) => a.id)).toEqual(['p1']);
    expect(r && fraseEmParcelas(r)).toBe('Esta nota parece já lançada em parcelas: achada 1 de 4 (R$ 821,22 cada). Nada será criado em dobro.');
  });
  it('o achado pelo numero com o valor da nota inteira nao e\' parcela: a que falta continua (o de sempre)', () => {
    const r = casarJaLancados([{ n: 1, vencimento: '2026-08-10', valorCent: 328488 }], [parcela('t', 328400)], 328488);
    expect(r?.fracoes.size).toBe(0);
    expect(r?.emParcelas).toBe(false);
    expect(r?.faltam.map((f) => f.n)).toEqual([1]);
  });
});

