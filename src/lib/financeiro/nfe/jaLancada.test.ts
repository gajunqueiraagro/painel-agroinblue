/**
 * NOTA-JA-LANCADA-01 — a escolha por parcela (PURO), no molde do NJ de 22/10: duas series parecidas no cliente (341,34 e 341,35/341,33);
 * cada parcela fica com o MAIS proximo, cada lancamento uma vez so'; a outra serie vira "parecidos a mais"; numero/chave entram juntos.
 */
import { describe, it, expect } from 'vitest';
import { canceladosDaNota, casarJaLancados, fracaoDaDescricao, fracaoDaNota, fraseDoAchado, fraseEmParcelas, lerJaLancados, linhasSistemaNota, parcelasParaCasar, type LancamentoJaLancado } from './jaLancada';

const l = (id: string, n: number, difCent: number, difDias = 0, por: LancamentoJaLancado['por'] = ['valor']): LancamentoJaLancado => ({
  id, vencimento: null, pagamento: null, competencia: null, descricao: null, valorCent: 34134 + difCent, status: 'realizado', conciliado: false,
  financiamentoId: null, numeroDocumento: null, fornecedorId: 'f', fornecedorNome: 'F', fornecedorPor: 'nome',
  parcelas: n ? [{ n, difCent, difDias }] : [], por, cancelado: false,
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

/* NOTA-CONTAS-NA-CRIACAO-01 D (P76) — o molde do Agnaldo: os dois lancamentos antigos da nota foram CANCELADOS antes de refazer. */
describe('o cancelado nunca conta', () => {
  const canc = (id: string, venc: string, n = 1): LancamentoJaLancado => ({ ...l(id, n, 0), vencimento: venc, cancelado: true, status: 'programado' });
  it('com vivos: o cancelado nao casa parcela nem e\' alvo; fica em `cancelados`, pela data', () => {
    const r = casarJaLancados(PARC, [canc('c2', '2026-09-10'), l('a1', 1, 0), canc('c1', '2026-08-10')]);
    expect(r?.porParcela.map((x) => x.lancamento?.id ?? null)).toEqual(['a1', null, null, null]);
    expect(r?.alvos.map((a) => a.id)).toEqual(['a1']);
    expect(r?.cancelados.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(r?.outrosParecidos).toBe(0);
  });
  it('so\' cancelados: a nota NAO esta\' lancada (null); `canceladosDaNota` diz quais', () => {
    expect(casarJaLancados(PARC, [canc('c1', '2026-08-10')])).toBeNull();
    expect(canceladosDaNota([canc('c1', '2026-08-10'), l('a1', 1, 0)]).map((c) => c.id)).toEqual(['c1']);
  });
  it('lerJaLancados: `cancelado` so\' com true do banco', () => {
    expect(lerJaLancados([{ id: 'x', cancelado: true }, { id: 'y', cancelado: 'true' }, { id: 'z' }]).map((x) => x.cancelado)).toEqual([true, false, false]);
  });
});


/* P95 — as IRMAS da fracao: o banco as devolve com `por` 'fracao' e `fracao_n`; a nota de uma parcela fica "em parcelas", nada a criar */
describe('P95 — a nota em N parcelas soltas (as irmas da fracao)', () => {
  const linha = (id: string, valor: number, por: string[], fracao: number | null) => ({ id, descricao: `Tinta sintetica - ${id}/3`, valor_cent: valor, por, fracao_n: fracao,
    parcelas: [], cancelado: false, status: 'realizado' });
  it('o leitor: `fracao` e `fracao_n` (ausente = sem fracao)', () => {
    const [a, b] = lerJaLancados([linha('1', 10002, ['fracao'], 3), { id: 'x', valor_cent: 1, por: ['numero'] }]);
    expect([a.por, a.fracaoN]).toEqual([['fracao'], 3]);
    expect(b.fracaoN).toBeNull();
  });
  it('as 3 irmas: alvos, "em parcelas", nada falta; a frase com a soma, a nota e a diferenca', () => {
    const todos = lerJaLancados([linha('1', 10002, ['fracao'], 3), linha('2', 9997, ['numero', 'fracao'], 3), linha('3', 10000, ['fracao'], 3)]);
    const j = casarJaLancados([{ n: 1, vencimento: '2031-04-06', valorCent: 30000 }], todos, 30000);
    expect(j?.alvos.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect([j?.emParcelas, j?.faltam]).toEqual([true, []]);
    expect(j && fraseEmParcelas(j, 30000)).toBe('Esta nota parece já lançada em parcelas: achadas 3 de 3 · soma R$ 299,99 · nota R$ 300,00 · diferença R$ 0,01. Nada será criado em dobro.');
    expect(j && fraseEmParcelas(j)).toBe('Esta nota parece já lançada em parcelas: achadas 3 de 3 (R$ 100,02 cada). Nada será criado em dobro.');
  });
  it('a fracao da descricao (a mesma regra do banco)', () => {
    expect(fracaoDaDescricao('Tinta latex - 3/6')).toEqual({ k: 3, n: 6 });
    expect(fracaoDaDescricao('Parcela 2 / 4 ')).toEqual({ k: 2, n: 4 });
    expect(fracaoDaDescricao('7/6')).toBeNull();
    expect(fracaoDaDescricao('3/6 tinta')).toBeNull();
    expect(fracaoDaDescricao(null)).toBeNull();
  });
});

/* P128a — a TABELA SISTEMA × NOTA e a frase, nos moldes dos 5 casos do briefing (valores e nomes SINTETICOS) */
describe('P128a — tabela sistema × nota e a frase do achado', () => {
  const v = (id: string, valorCent: number, venc: string, o: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
    id, vencimento: venc, pagamento: null, competencia: venc, descricao: `Compra sintetica ${id}`, valorCent, status: 'programado', conciliado: false,
    financiamentoId: null, numeroDocumento: null, fornecedorId: 'f', fornecedorNome: 'F', fornecedorPor: 'cnpj', parcelas: [], por: ['numero'],
    cancelado: false, ...o,
  });
  const pago = { status: 'realizado', pagamento: '2031-01-01', conciliado: true };
  it('caso 1 (pela soma): nota sem duplicata; o parcelamento que soma a nota = em parcelas, nada a criar, sem "parte da nota" inventada', () => {
    const todos = [v('a', 300000, '2031-01-10', { ...pago, por: ['soma'], parcelaN: 1, financiamentoId: 'p' }),
      ...[2, 3, 4, 5].map((k) => v(`s${k}`, 175000, `2031-0${k}-10`, { por: ['soma'], parcelaN: k, financiamentoId: 'p' }))];
    const j = casarJaLancados([{ n: 1, vencimento: '2031-01-10', valorCent: 1000000 }], todos, 1000000);
    expect([j?.emParcelas, j?.faltam]).toEqual([true, []]);
    const linhas = j ? linhasSistemaNota(j, 1000000) : [];
    expect(linhas.map((x) => x.rotulo)).toEqual(['1/5', '2/5', '3/5', '4/5', '5/5']);
    expect(linhas.map((x) => [x.notaValorCent, x.difValor])).toEqual(Array(5).fill([null, false]));
    expect(j && fraseDoAchado(j, linhas, 1000000)).toBe('5 parcelas lançadas num parcelamento desta nota · soma R$ 10.000,00 ✓ · achados pela soma · 1 conciliada · 4 programadas');
  });
  it('caso 2 (N soltos pelo nº + a chave): "soma 5 × R$ 400,00 = R$ 2.000,00 ✓", a parte da nota ao lado, a nota já anexada em um', () => {
    const todos = [1, 2, 3, 4, 5].map((k) => v(`c${k}`, 40000, `2031-0${k}-16`, k < 5 ? { status: 'realizado', pagamento: `2031-0${k}-16`, por: k === 1 ? ['numero', 'chave'] : ['numero'], temEstaNota: k === 1, documentos: k === 1 ? 1 : 0 } : {}));
    const j = casarJaLancados([{ n: 1, vencimento: '2031-01-16', valorCent: 200000 }], todos, 200000);
    const linhas = j ? linhasSistemaNota(j, 200000) : [];
    expect([j?.emParcelas, j?.faltam, linhas.length]).toEqual([true, [], 5]);
    expect(linhas.map((x) => [x.notaValorCent, x.difValor])).toEqual(Array(5).fill([40000, false]));
    expect(linhas.map((x) => x.situacao)).toEqual(['realizada', 'realizada', 'realizada', 'realizada', 'programada']);
    expect(linhas[0].sistema?.temEstaNota).toBe(true);
    expect(j && fraseDoAchado(j, linhas, 200000))
      .toBe('5 lançamentos soltos desta nota · soma 5 × R$ 400,00 = R$ 2.000,00 ✓ · achados pelo CNPJ + nº da nota · pela chave · 4 realizadas · 1 programada');
  });
  const DUP = [1, 2, 3].map((n) => ({ n, vencimento: `2031-0${n + 1}-05`, valorCent: 30000 }));
  it('caso Ferri (dia e centavos diferentes, só pelo nº): cada parcela casa com a de data mais próxima; a diferença marcada, nada falta', () => {
    const todos = [v('f1', 30000, '2031-02-09'), v('f2', 30000, '2031-03-09'), v('f3', 30035, '2031-04-09')];
    const j = casarJaLancados(DUP, todos, 90000);
    const linhas = j ? linhasSistemaNota(j, 90000) : [];
    expect(linhas.map((x) => x.sistema?.id)).toEqual(['f1', 'f2', 'f3']);
    expect(linhas.map((x) => [x.difData, x.difValor])).toEqual([[true, false], [true, false], [true, true]]);
    expect(j?.faltam).toEqual([]);
    expect(j && fraseDoAchado(j, linhas, 90000)).toBe('3 de 3 parcelas desta nota já estão lançadas · soma no sistema R$ 900,35 × nota R$ 900,00 (diferença R$ 0,35) · achados pelo CNPJ + nº da nota · 3 programadas');
  });
  it('caso 4 (a parcela que SOBRA no sistema): o irmão do parcelamento aparece "só no sistema", com o nº da parcela', () => {
    const casados = DUP.map((d, i) => v(`r${d.n}`, 30000, d.vencimento, { por: ['valor'], parcelas: [{ n: d.n, difCent: 0, difDias: 0 }], financiamentoId: 'p', parcelaN: i + 1 }));
    const j = casarJaLancados(DUP, [...casados, v('sobra', 30000, '2031-05-05', { por: ['parcelamento'], financiamentoId: 'p', parcelaN: 4 })], 90000);
    const linhas = j ? linhasSistemaNota(j, 90000) : [];
    expect(linhas.map((x) => [x.rotulo, x.situacao])).toEqual([['1/3', 'programada'], ['2/3', 'programada'], ['3/3', 'programada'], ['4/?', 'so_no_sistema']]);
    expect(j && fraseDoAchado(j, linhas, 90000)).toContain('soma no sistema R$ 1.200,00 × nota R$ 900,00 (diferença R$ 300,00)');
    expect(j && fraseDoAchado(j, linhas, 90000)).toContain('1 só no sistema');    /* o irmão que sobra NUNCA recebe a nota (não é dela): fora dos alvos do "Completar" */
    expect(j?.alvos.map((x) => x.id)).toEqual(['r1', 'r2', 'r3']);
  });
  it('a parcela da nota que o sistema não tem: "só na nota → criar" (e entra no que falta)', () => {
    const j = casarJaLancados(DUP, [v('x1', 30000, '2031-02-05', { por: ['valor'], parcelas: [{ n: 1, difCent: 0, difDias: 0 }] })], 90000);
    const linhas = j ? linhasSistemaNota(j, 90000) : [];
    expect(linhas.map((x) => x.situacao)).toEqual(['programada', 'so_na_nota', 'so_na_nota']);
    expect(j?.faltam.map((f) => f.n)).toEqual([2, 3]);
  });
  it('caso 5 (o leitor): a parcela, a nota já anexada e quantos documentos ("Documento hoje")', () => {
    const [a, b] = lerJaLancados([{ id: 'n1', valor_cent: 1, por: ['numero', 'documento', 'soma', 'parcelamento'], parcela_n: 3, tem_esta_nota: true, documentos: 2 }, { id: 'n2', valor_cent: 1, por: ['x'] }]);
    expect([a.por, a.parcelaN, a.temEstaNota, a.documentos]).toEqual([['numero', 'documento', 'soma', 'parcelamento'], 3, true, 2]);
    expect([b.por, b.parcelaN ?? null, b.temEstaNota ?? false, b.documentos ?? 0]).toEqual([[], null, false, 0]);
  });
});

/* P128c — a âncora da porta 2: o lançamento aberto ('lancamento') recebe a nota; o irmão dele só por 'parcelamento' não */
describe('P128c — o lançamento aberto é alvo', () => {
  it('lido do banco e alvo do Completar; o irmão "só no sistema" fora', () => {
    const [aberto, irmao] = lerJaLancados([{ id: 'aberto', valor_cent: 40877, por: ['lancamento'], parcelas: [] }, { id: 'irmao', valor_cent: 40877, por: ['parcelamento'], parcelas: [] }]);
    expect(aberto.por).toEqual(['lancamento']);
    const j = casarJaLancados([{ n: 1, vencimento: '2026-09-24', valorCent: 40877 }], [aberto, irmao], 40877);
    expect(j?.alvos.map((x) => x.id)).toEqual(['aberto']);
  });
});
