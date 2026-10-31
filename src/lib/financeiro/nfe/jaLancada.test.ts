/**
 * NOTA-JA-LANCADA-01 — a escolha por parcela (PURO), no molde do NJ de 22/10: duas series parecidas no cliente (341,34 e 341,35/341,33);
 * cada parcela fica com o MAIS proximo, cada lancamento uma vez so'; a outra serie vira "parecidos a mais"; numero/chave entram juntos.
 */
import { describe, it, expect } from 'vitest';
import { canceladosDaNota, casarJaLancados, fracaoDaDescricao, maisMeses, parcelasQueFaltamNoCartao, posicaoDaDescricao, posicoesNoCartao, fracaoDaNota, fraseDoAchado, fraseEmParcelas, lerJaLancados, linhasSistemaNota, parcelasParaCasar, type LancamentoJaLancado } from './jaLancada';

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
/* P162 — a nota SEM duplicata (o molde do NJ: emissão 31/07, pago 10/08, nº "9952") achada pelo NÚMERO com o MESMO valor: é ela, "1 de 1";
   nunca "só na nota → criar" + "só no sistema" (o caminho que DUPLICAVA). Valores SINTÉTICOS. */
describe('P162 — a nota de uma parcela achada pelo número com o mesmo valor', () => {
  const achado = (o: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({ id: 'j', vencimento: '2031-08-10', pagamento: '2031-08-10',
    competencia: '2031-07-31', descricao: 'Combustivel sintetico', valorCent: 415146, status: 'realizado', conciliado: true, financiamentoId: null,
    numeroDocumento: '9952', fornecedorId: 'f', fornecedorNome: 'F', fornecedorPor: 'cnpj', parcelas: [], por: ['numero'], cancelado: false, ...o });
  const NOTA = [{ n: 1, vencimento: '2031-07-31', valorCent: 415146 }];
  it('mesmo valor (até 5 centavos), data longe da emissão: casa a parcela, nada falta, "1 de 1"', () => {
    const j = casarJaLancados(NOTA, [achado()], 415146);
    expect([j?.porParcela.map((x) => x.lancamento?.id ?? null), j?.faltam, j?.alvos.map((x) => x.id)]).toEqual([['j'], [], ['j']]);
    const linhas = j ? linhasSistemaNota(j, 415146) : [];
    expect(linhas.map((x) => x.situacao)).not.toContain('so_na_nota');
    expect(linhas.map((x) => x.situacao)).not.toContain('so_no_sistema');
  });
  it('valor diferente: segue como hoje (a que falta continua; quem decide é a pessoa)', () => {
    expect(casarJaLancados(NOTA, [achado({ valorCent: 415100 })], 415146)?.faltam.map((f) => f.n)).toEqual([1]);
  });
  it('o irmão achado SÓ por ser do parcelamento nunca casa a nota de uma parcela', () => {
    expect(casarJaLancados(NOTA, [achado({ por: ['parcelamento'], financiamentoId: 'p' })], 415146)?.porParcela[0].lancamento).toBeNull();
  });
});

describe('P128c — o lançamento aberto é alvo', () => {
  it('lido do banco e alvo do Completar; o irmão "só no sistema" fora', () => {
    const [aberto, irmao] = lerJaLancados([{ id: 'aberto', valor_cent: 40877, por: ['lancamento'], parcelas: [] }, { id: 'irmao', valor_cent: 40877, por: ['parcelamento'], parcelas: [] }]);
    expect(aberto.por).toEqual(['lancamento']);
    const j = casarJaLancados([{ n: 1, vencimento: '2026-09-24', valorCent: 40877 }], [aberto, irmao], 40877);
    expect(j?.alvos.map((x) => x.id)).toEqual(['aberto']);
  });
});

/* P167 (NOTA-COMPRA-ERRADA-01) — o molde do NJ: DUAS compras do mesmo fornecedor, mesma descrição, 3 × 225,00 cada (a mesma soma). A nota é a
   da compra B; a compra A casa só por "soma"/"fracao" (o valor), a B pelo nº e pelas parcelas (valor e data). A nota nunca se liga às duas. */
describe('P167 — uma compra só', () => {
  const NOTA = [1, 2, 3].map((n) => ({ n, vencimento: `2031-1${n - 1}-10`, valorCent: 22500 }));
  const da = (id: string, fin: string, extra: Partial<LancamentoJaLancado>): LancamentoJaLancado => ({ ...l(id, 0, 0), valorCent: 22500, financiamentoId: fin, ...extra });
  const compraA = [1, 2, 3].map((k) => da(`a${k}`, 'fin-a', { por: ['soma', 'fracao'] }));
  const compraB = [1, 2, 3].map((k) => da(`b${k}`, 'fin-b', { por: ['valor', 'numero'], parcelas: [{ n: k, difCent: 0, difDias: 0 }] }));
  it('sem âncora: a compra de evidência forte (nº + parcelas) leva a nota; a outra fica de fora e é dita', () => {
    const r = casarJaLancados(NOTA, [...compraA, ...compraB], 67500);
    expect(r?.alvos.map((x) => x.id)).toEqual(['b1', 'b2', 'b3']);
    expect(r?.outraCompra.map((x) => x.id)).toEqual(['a1', 'a2', 'a3']);
    expect([r?.compraAmbigua, r?.faltam]).toEqual([false, []]);
  });
  it('a ÂNCORA (a parcela aberta) decide mesmo contra o placar: aberta pela compra A, a nota é da A', () => {
    const ancoraA = [{ ...compraA[0], por: [...compraA[0].por, 'lancamento' as const] }, compraA[1], compraA[2]];
    const r = casarJaLancados(NOTA, [...ancoraA, ...compraB], 67500);
    expect(r?.alvos.every((x) => x.financiamentoId === 'fin-a')).toBe(true);
    expect(r?.outraCompra.map((x) => x.id)).toEqual(['b1', 'b2', 'b3']);
  });
  it('as duas com a MESMA evidência: ambígua — nenhuma recebe a nota e nada se cria; as soltas seguem', () => {
    const iguais = [1, 2, 3].map((k) => da(`c${k}`, 'fin-c', { por: ['soma', 'fracao'] }));
    const solta = { ...l('solta', 0, 0, 0, ['numero']), valorCent: 22500 };
    const r = casarJaLancados(NOTA, [...compraA, ...iguais, solta], 67500);
    expect(r?.compraAmbigua).toBe(true);
    expect(r?.alvos.map((x) => x.id)).toEqual(['solta']);
    expect(r?.faltam).toEqual([]);
  });
  it('um parcelamento só (ou só soltas): nada muda — é a compra da nota', () => {
    const r = casarJaLancados(NOTA, compraB, 67500);
    expect([r?.alvos.length, r?.outraCompra.length, r?.compraAmbigua]).toEqual([3, 0, false]);
  });
  it('o banco diz qual documento desta nota o achado já tem (`nota_documento_id`)', () => {
    expect(lerJaLancados([{ id: 'x', valor_cent: 1, por: ['numero'], parcelas: [], nota_documento_id: 'doc-1' }])[0].notaDocumentoId).toBe('doc-1');
  });
});

/* Caso 3 (Gabriel 29/10 11:33) — a nota À VISTA no CARTÃO em 10× (o molde da M2 Tratores NF 14.222, SINTÉTICO): 3 achadas de 10 */
describe('Caso 3 — a posição de cada achada no cartão', () => {
  const doCartao = (id: string, vencimento: string, descricao: string) => ({ id, vencimento, descricao, valorCent: 147350 });
  const TRES = [doCartao('c1', '2031-08-10', 'Manutencao sintetica 1/3'), doCartao('c2', '2031-09-10', 'Manutencao sintetica - Parc.7 2/3'),
    doCartao('c3', '2031-10-10', 'Parcela 8 - None 3/3')];
  it('a posição pela descrição ("Parcela 8", "Parc.7"); o "k/N" do fim não conta', () => {
    expect(['Parcela 8 - None', 'Manutencao - Parc.7', 'Manutencao sintetica 1/3', 'Parcela 3/5 - None', null].map(posicaoDaDescricao)).toEqual([8, 7, null, null, null]);
  });
  it('as duas leituras: 6/7/8 pela descrição (a sem número pelo mês) × 1/2/3 pela ordem — discordam: a tela pergunta', () => {
    const p = posicoesNoCartao(TRES, 10);
    expect([...(p.pelaDescricao ?? [])]).toEqual([['c1', 6], ['c2', 7], ['c3', 8]]);
    expect([...(p.pelaOrdem ?? [])]).toEqual([['c1', 1], ['c2', 2], ['c3', 3]]);
    expect(p.concordam).toBe(false);
  });
  it('uma numerada só, ou numeradas fora da sequência mensal: a descrição não diz (nunca adivinha)', () => {
    expect(posicoesNoCartao([TRES[0], TRES[2]], 10).pelaDescricao).toBeNull();
    expect(posicoesNoCartao([doCartao('a', '2031-08-10', 'Parcela 2'), doCartao('b', '2031-09-10', 'Parcela 5')], 10).pelaDescricao).toBeNull();
    /* as duas concordam: a 1ª achada é a parcela 1 */
    expect(posicoesNoCartao([doCartao('a', '2031-08-10', 'Parcela 1'), doCartao('b', '2031-09-10', 'Parcela 2')], 10).concordam).toBe(true);
  });
  it('as que faltam nascem no vencimento da fatura (o mesmo dia, mês a mês), no valor da parcela', () => {
    const f = parcelasQueFaltamNoCartao(TRES, new Map([['c1', 6], ['c2', 7], ['c3', 8]]), 10, 147350);
    expect(f.map((x) => [x.n, x.vencimento])).toEqual([[1, '2031-03-10'], [2, '2031-04-10'], [3, '2031-05-10'], [4, '2031-06-10'], [5, '2031-07-10'], [9, '2031-11-10'], [10, '2031-12-10']]);
    expect(f.every((x) => x.valorCent === 147350)).toBe(true);
    expect([maisMeses('2031-01-31', 1), maisMeses('2031-11-10', 2)]).toEqual(['2031-02-28', '2032-01-10']);
    /* com o valor da nota: a última que falta leva os centavos (as 10 fecham a nota exata, nunca passam) */
    const tresDeArredondado = TRES.map((x) => ({ ...x, valorCent: 19666 }));
    const g = parcelasQueFaltamNoCartao(tresDeArredondado, new Map([['c1', 6], ['c2', 7], ['c3', 8]]), 10, 19666, 196656);
    expect([g.slice(0, -1).every((x) => x.valorCent === 19666), g[g.length - 1].valorCent, 3 * 19666 + g.reduce((t, x) => t + x.valorCent, 0)]).toEqual([true, 19662, 196656]);
  });
});

/* NOTA-PAGA-A-VISTA-01 (Gabriel 31/10 05:30, a NF da homologação; aqui SINTÉTICA) — a nota de 3 duplicatas (917,32 + 916,34 + 916,34 =
   2.750,00) paga À VISTA num lançamento só do mesmo fornecedor, com o valor da nota inteira: ele não vira a 1/3, nada "falta" por padrão
   (as duplicatas ficam como informação: "já paga no lançamento acima") e a soma ligada fica a da nota. */
describe('NOTA-PAGA-A-VISTA-01 — a nota inteira paga à vista num lançamento', () => {
  /* a 1ª duplicata a 15 dias do pagamento: hoje (a regra dos 20 dias do P128a) o pago de 2.750,00 vira a 1/3 — o caso da homologação */
  const DUP = [{ n: 1, vencimento: '2031-11-14', valorCent: 91732 }, { n: 2, vencimento: '2031-12-14', valorCent: 91634 }, { n: 3, vencimento: '2032-01-13', valorCent: 91634 }];
  const NOTA = 275000;
  const pago = (id: string, valorCent: number, por: LancamentoJaLancado['por'] = ['numero']): LancamentoJaLancado => ({
    ...l(id, 0, 0, 0, por), valorCent, vencimento: '2031-10-30', pagamento: '2031-10-30', competencia: '2031-10-30', fornecedorPor: 'cnpj' });
  it('A1 o pago de 2.750,00 é a nota à vista: não casa a 1/3, é o único alvo, e as 3 duplicatas ficam sem lançamento', () => {
    const r = casarJaLancados(DUP, [pago('av', 275000)], NOTA);
    expect(r?.aVista?.id).toBe('av');
    expect(r?.porParcela.map((x) => x.lancamento?.id ?? null)).toEqual([null, null, null]);
    expect(r?.alvos.map((a) => a.id)).toEqual(['av']);
    expect(r?.faltam.map((f) => f.n)).toEqual([1, 2, 3]);
  });
  it('A2 ± centavos vale (2.749,97); a 6 centavos não é a nota inteira', () => {
    expect(casarJaLancados(DUP, [pago('av', 274997)], NOTA)?.aVista?.id).toBe('av');
    expect(casarJaLancados(DUP, [pago('av', 274994)], NOTA)?.aVista ?? null).toBeNull();
  });
  it('A3 contraprova (Ferri & Prado): o achado de 917,32 continua casando a 1/3; nada à vista', () => {
    const r = casarJaLancados(DUP, [{ ...pago('p1', 91732), vencimento: '2031-11-14' }], NOTA);
    expect(r?.aVista ?? null).toBeNull();
    expect(r?.porParcela[0].lancamento?.id).toBe('p1');
  });
  it('A4 o cancelado, o irmão só pelo parcelamento e a nota de UMA duplicata nunca são "à vista"; dois candidatos = nenhum (nunca adivinha)', () => {
    expect(casarJaLancados(DUP, [{ ...pago('c', 275000), cancelado: true }, pago('p1', 91732)], NOTA)?.aVista ?? null).toBeNull();
    expect(casarJaLancados(DUP, [pago('irmao', 275000, ['parcelamento']), pago('p1', 91732)], NOTA)?.aVista ?? null).toBeNull();
    expect(casarJaLancados([{ n: 1, vencimento: '2031-10-30', valorCent: NOTA }], [pago('um', 275000)], NOTA)?.aVista ?? null).toBeNull();
    expect(casarJaLancados(DUP, [pago('a', 275000), pago('b', 275000)], NOTA)?.aVista ?? null).toBeNull();
    /* o fornecedor é o critério da busca (`fornecedorPor`): achado sem ele (só pela chave/lançamento aberto) não é "à vista" */
    expect(casarJaLancados(DUP, [{ ...pago('sem', 275000), fornecedorPor: null }], NOTA)?.aVista ?? null).toBeNull();
  });
  it('A5 a tabela: a linha do lançamento à vista primeiro (a nota inteira ao lado, sem diferença), depois as 3 duplicatas; a frase', () => {
    const r = casarJaLancados(DUP, [pago('av', 275000)], NOTA);
    if (!r) throw new Error('sem achado');
    const linhas = linhasSistemaNota(r, NOTA);
    expect(linhas.map((x) => [x.rotulo, x.sistema?.id ?? null, x.situacao, x.notaValorCent, x.difValor])).toEqual([
      ['à vista', 'av', 'realizada', 275000, false], ['1/3', null, 'so_na_nota', 91732, false], ['2/3', null, 'so_na_nota', 91634, false],
      ['3/3', null, 'so_na_nota', 91634, false]]);
    expect(fraseDoAchado(r, linhas, NOTA)).toMatch(/^A nota inteira já está paga à vista num lançamento \(R\$ 2\.750,00 ✓\)/);
  });
});
