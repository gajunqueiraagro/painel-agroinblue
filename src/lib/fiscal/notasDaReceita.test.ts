/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a regra da lista "Notas da Receita" (dados SINTÉTICOS; nenhuma nota real).
 *   R1 nº e série da chave · R2 situação (nova × já no sistema × resumo × cancelada) · R3 abas e selo (D2) · R4 CPF de emitente mascarado
 *   R5 leitura do banco recusa o que não é do formato · R6 total sem canceladas · R7 busca por emitente/nº/documento
 *   R10 NOTA-RECEITA-CASAR-01: "Pode estar lançada" (mesmo CNPJ / sem fornecedor), pré-marcado só com 1 do mesmo CNPJ, leitura dos candidatos
 *   R9 F34-SITUACAO-01 + NJ-NOTAS-LENTAS: as chaves já lançadas da resposta em lote; formato estranho = null (falha, nunca "Nova")
 */
import { describe, expect, it } from 'vitest';
import {
  ABAS_DA_RECEITA, arquivoDoXml, filtrarBusca, lerLinhasRecebidas, montarLista, numeroDaChave, pedemAcao, serieDaChave, situacaoNaLista,
  candidatoPreMarcado, chavesJaLancadas, comCandidatos, lerCandidatos, precisaConferirLancamento, totalDaLista, type LinhaRecebida, seloDaNota, ROTULO_CURTO,
  lerAtributos, tomDoVenc, vencimentoDaNota, vencidaSemLancamento, dicaDoVenc, lerLigacoes, ligacaoDaNota, fraseDaLigacao, type LigacaoDaDemonstracao } from './notasDaReceita';

/* chave sintética: UF 50, AAMM 2611, CNPJ, mod 55, série 001, nº 000012345, tpEmis 1, código, DV */
const chave = (n: number, cnpj = '12345678000190') => `5026${'11'}${cnpj}55001${String(n).padStart(9, '0')}1${'12345678'}0`.slice(0, 44);
const linha = (o: Partial<LinhaRecebida> & { n?: number } = {}): LinhaRecebida => ({
  id: `id-${o.n ?? 1}`, titularId: 't1', chave: chave(o.n ?? 1), situacao: 'xml', emitenteDocumento: '12345678000190',
  emitenteNome: 'Casa Agro Exemplo Ltda', emissao: '2026-11-14', valorCent: 1834050, notaId: null, recebidoEm: null, eventos: [], temXml: false, ...o,
});
const lista = (ls: LinhaRecebida[], noSistema: string[] = []) => montarLista(ls, new Map([['t1', 'Produtora Exemplo']]), new Set(noSistema));

describe('NOTAS-RECEITA F3.4 — a regra da lista', () => {
  it('R1 nº (pos. 26–34) e série (23–25) saem da chave', () => {
    const c = chave(12345);
    expect(c).toHaveLength(44);
    expect(numeroDaChave(c)).toBe('12.345');
    expect(serieDaChave(c)).toBe('1');
  });
  it('R2 situação: completa nova; chave no sistema; ligada; resumo; manifestado; cancelada (situação ou evento 110111); ignorada', () => {
    expect(situacaoNaLista(linha(), new Set())).toBe('nova');
    expect(situacaoNaLista(linha(), new Set([chave(1)]))).toBe('no_sistema');
    expect(situacaoNaLista(linha({ notaId: 'n1' }), new Set())).toBe('no_sistema');
    expect(situacaoNaLista(linha({ situacao: 'importado' }), new Set())).toBe('no_sistema');
    expect(situacaoNaLista(linha({ situacao: 'resumo' }), new Set())).toBe('pede_ciencia');
    expect(situacaoNaLista(linha({ situacao: 'manifestado' }), new Set())).toBe('esperando_xml');
    expect(situacaoNaLista(linha({ situacao: 'cancelado_na_sefaz' }), new Set())).toBe('cancelada');
    expect(situacaoNaLista(linha({ eventos: [{ tpEvento: '110111', descricao: 'Cancelamento' }] }), new Set([chave(1)]))).toBe('cancelada');
    expect(situacaoNaLista(linha({ situacao: 'ignorado' }), new Set())).toBe('ignorada');
  });
  it('R2b tipo: resumo × completa', () => {
    const [a, b] = lista([linha({ n: 1 }), linha({ n: 2, situacao: 'resumo' })]);
    expect([a.tipo, b.tipo].sort()).toEqual(['completa', 'resumo']);
  });
  it('R3 abas e o selo (D2): pedem ação = a lançar + ciência pendente', () => {
    const l = lista([linha({ n: 1 }), linha({ n: 2, situacao: 'resumo' }), linha({ n: 3 }), linha({ n: 4, situacao: 'cancelado_na_sefaz' })], [chave(3)]);
    const conta = Object.fromEntries(ABAS_DA_RECEITA.map((a) => [a.valor, l.filter(a.filtro).length]));
    expect(conta).toEqual({ lancar: 1, ciencia: 1, no_sistema: 1, vendas: 0, nao_financeiras: 0, canceladas: 1, todas: 4 }); /* + Vendas e Não geram lançamento (SEM-LANCAMENTO-01) */
    expect(pedemAcao(l)).toBe(2);
  });
  it('R4 CNPJ inteiro; CPF de emitente pessoa física mascarado', () => {
    const [cnpj] = lista([linha()]);
    expect(cnpj.emitenteNaTabela).toBe('12.345.678/0001-90');
    const [cpf] = lista([linha({ emitenteDocumento: '52998224725', emitenteNome: 'Produtor Vizinho' })]);
    expect(cpf.emitenteNaTabela).toBe('***.982.247-**');
    expect(JSON.stringify(cpf)).not.toMatch(/emitenteNaTabela":"529/);
  });
  it('R5 a leitura do banco: chave fora de 44 dígitos, situação desconhecida ou sem id ficam de fora; eventos vêm do resumo', () => {
    const ls = lerLinhasRecebidas([
      { id: 'a', titular_id: 't1', chave: chave(1), situacao: 'xml', valor_cent: '1000', resumo: { eventos: [{ tpEvento: '110111', descricao: 'Cancelamento' }] } },
      { id: 'b', titular_id: 't1', chave: '123', situacao: 'xml' },
      { id: 'c', titular_id: 't1', chave: chave(2), situacao: 'outra' },
      { titular_id: 't1', chave: chave(3), situacao: 'xml' },
      null,
    ]);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ id: 'a', valorCent: 1000, eventos: [{ tpEvento: '110111', descricao: 'Cancelamento' }] });
    expect(lerLinhasRecebidas(null)).toEqual([]);
  });
  it('R6 o total não soma canceladas', () => {
    const l = lista([linha({ n: 1, valorCent: 1000 }), linha({ n: 2, valorCent: 500, situacao: 'cancelado_na_sefaz' }), linha({ n: 3, valorCent: 250, situacao: 'resumo' })]);
    expect(totalDaLista(l)).toBe(1250);
  });
  it('R7 busca por emitente, nº e documento; filtro por produtor', () => {
    const l = montarLista([linha({ n: 1 }), linha({ n: 777, emitenteNome: 'Posto Rodovia Exemplo', emitenteDocumento: '23456789000101', titularId: 't2' })],
      new Map([['t1', 'A'], ['t2', 'B']]), new Set());
    expect(filtrarBusca(l, 'posto', null).map((n) => n.numero)).toEqual(['777']);
    expect(filtrarBusca(l, '777', null)).toHaveLength(1);
    expect(filtrarBusca(l, '23456789', null)).toHaveLength(1);
    expect(filtrarBusca(l, '', 't1')).toHaveLength(1);
    expect(filtrarBusca(l, '', null)).toHaveLength(2);
    expect(filtrarBusca(l, 'exemplo 2', null)).toHaveLength(0);
  });
  it('R8 o arquivo do XML: nome pela chave, tipo XML', () => {
    const f = arquivoDoXml(chave(1), '<nfeProc/>');
    expect(f.name).toBe(`NFe${chave(1)}.xml`);
    expect(f.type).toBe('application/xml');
  });
  it('R9 as chaves já lançadas da resposta em lote; formato estranho = null; só nova/ciência perguntam', () => {
    expect([...(chavesJaLancadas([{ chave: 'a', ja_lancada: true, por: ['numero'] }, { chave: 'b', ja_lancada: false, por: [] }]) ?? [])]).toEqual(['a']);
    expect(chavesJaLancadas([])).toEqual(new Set());
    expect(chavesJaLancadas(null)).toBeNull();
    expect(chavesJaLancadas([{ chave: 'a' }])).toBeNull();
    expect(chavesJaLancadas([{ chave: 'a', ja_lancada: 'sim' }])).toBeNull();
    expect(precisaConferirLancamento(linha(), new Set())).toBe(true);
    expect(precisaConferirLancamento(linha({ situacao: 'resumo' }), new Set())).toBe(true);
    expect(precisaConferirLancamento(linha(), new Set([chave(1)]))).toBe(false);
    expect(precisaConferirLancamento(linha({ situacao: 'cancelado_na_sefaz' }), new Set())).toBe(false);
  });
  it('R10 candidatos: "Pode estar lançada" só da Nova com mesmo CNPJ/sem fornecedor; pré-marcado só com 1 do mesmo CNPJ; leitura recusa o estranho', () => {
    const c = (classe: 'mesmo_cnpj' | 'sem_fornecedor' | 'outro_fornecedor', id = 'x') => ({ id, classe, competencia: null, vencimento: null, pagamento: null,
      descricao: null, status: null, conciliado: false, valorCent: 1, conta: null, fornecedorNome: null });
    expect(comCandidatos('nova', [c('mesmo_cnpj')])).toBe('pode_estar');
    expect(comCandidatos('nova', [c('sem_fornecedor')])).toBe('pode_estar');
    expect(comCandidatos('nova', [c('outro_fornecedor')])).toBe('nova');
    expect(comCandidatos('no_sistema', [c('mesmo_cnpj')])).toBe('no_sistema');
    expect(candidatoPreMarcado([c('mesmo_cnpj', 'a')])).toBe('a');
    expect(candidatoPreMarcado([c('sem_fornecedor', 'a')])).toBeNull();
    expect(candidatoPreMarcado([c('mesmo_cnpj', 'a'), c('mesmo_cnpj', 'b')])).toBeNull();
    const m = lerCandidatos([{ chave: 'k', candidatos: [{ id: 'a', classe: 'mesmo_cnpj', valor_cent: 100, conciliado: true, conta: 'Banco' }] }]);
    expect(m?.get('k')?.[0]).toMatchObject({ id: 'a', classe: 'mesmo_cnpj', valorCent: 100, conciliado: true, conta: 'Banco' });
    expect(lerCandidatos([{ chave: 'k', candidatos: [{ id: 'a', classe: 'outra', valor_cent: 1 }] }])).toBeNull();
    expect(lerCandidatos(null)).toBeNull();
    const [p] = lista([linha({ n: 1 })]);
    expect(p.candidatos).toEqual([]);
    expect(pedemAcao(montarLista([linha({ n: 1 })], new Map(), new Set(), new Map([[chave(1), [c('mesmo_cnpj')]]])))).toBe(1);
  });
});

describe('NOTAS-RECEITA-SEM-LANCAMENTO-01 — a classe da nota na lista (automática pelo XML)', () => {
  const atr = (cfops: string[], tpNF = '1', natOp = 'VENDA', refs: string[] = []) => ({ cfops, tpNF, natOp, refs, dups: [], tpags: [] });
  it('comodato e entrega futura saem do "A lançar" para "Não geram lançamento"; a venda do titular para "Vendas"; compra fica', () => {
    const ls = [linha({ n: 1, situacao: 'xml', temXml: true }), linha({ n: 2, situacao: 'xml', temXml: true }),
      linha({ n: 3, situacao: 'xml', temXml: true }), linha({ n: 4, situacao: 'xml', temXml: true })];
    const at = new Map([[ls[0].chave, atr(['5908'], '1', 'REMESSA BEM P/CONTA CONTR COMODATO')], [ls[1].chave, atr(['6116'], '1', 'REMESSA', [chave(8568045)])],
      [ls[2].chave, atr(['2101'], '0', 'COMPRA PARA INDUSTRIALIZACAO')], [ls[3].chave, atr(['5102'])]]);
    const l = montarLista(ls, new Map(), new Set(), new Map(), at);
    const por = (n: number) => l.find((x) => x.chave === ls[n].chave)!;
    expect(por(0).sit).toBe('nao_financeira');
    expect(seloDaNota(por(0)).rotulo).toBe('Comodato');
    expect(por(1).sit).toBe('nao_financeira');
    expect(seloDaNota(por(1)).rotulo).toBe('Entrega futura');
    expect(por(1).citadas).toEqual(['8.568.045']);
    expect(seloDaNota(por(1)).dica).toContain('8.568.045');
    expect(por(2).sit).toBe('venda_titular');
    expect(seloDaNota(por(2)).rotulo).toBe('Sua venda');
    expect(por(3).sit).toBe('nova');
    expect(l.filter(ABAS_DA_RECEITA.find((a) => a.valor === 'lancar')!.filtro)).toHaveLength(1);
    expect(l.filter(ABAS_DA_RECEITA.find((a) => a.valor === 'nao_financeiras')!.filtro)).toHaveLength(2);
    expect(l.filter(ABAS_DA_RECEITA.find((a) => a.valor === 'vendas')!.filtro)).toHaveLength(1);
  });
  it('sem os atributos (a função ainda não no ar): a lista de sempre — tudo "compra"', () => {
    const ls = [linha({ n: 1, situacao: 'xml', temXml: true })];
    expect(montarLista(ls, new Map(), new Set()).map((x) => x.sit)).toEqual(['nova']);
  });
  it('a cancelada diz a substituta: a nota VIVA do mesmo emitente e do mesmo valor', () => {
    const ls = [linha({ n: 73007, situacao: 'xml', temXml: true, valorCent: 28050000 }), linha({ n: 73006, situacao: 'cancelado_na_sefaz', valorCent: 28050000 })];
    const canc = montarLista(ls, new Map(), new Set()).find((x) => x.sit === 'cancelada')!;
    expect(canc.substituta).toBe('73.007');
    expect(seloDaNota(canc).dica).toContain('substituída pela NF 73.007');
  });
  it('os rótulos curtos nunca passam de 14 caracteres (cabem no selo; o resto vai no ⓘ)', () => {
    for (const r of Object.values(ROTULO_CURTO)) expect(r.length).toBeLessThanOrEqual(14);
  });
});

/* NOTAS-RECEITA-VENC-01 (Gabriel 19/11 07:36) — a coluna "Venc." pelas duplicatas da nota (cobr/dup), hoje = 16/11/2026 */
describe('NOTAS-RECEITA-VENC-01 — o vencimento pelas duplicatas', () => {
  const D = (n: string, v: string, c = 100) => ({ numero: n, vencimento: v, valorCent: c });
  it('V1 a próxima = a 1ª que vence hoje ou depois (na ordem da data, qualquer que seja a do XML); "k/N" pela posição', () => {
    const v = vencimentoDaNota([D('003', '2026-12-20'), D('001', '2026-10-30'), D('002', '2026-11-20')], [], '2026-11-16');
    expect(v.proxima?.numero).toBe('002');
    expect([v.indice, v.todas.length, v.dias]).toEqual([2, 3, 4]);
    expect(vencimentoDaNota([D('001', '2026-11-16')], [], '2026-11-16').dias).toBe(0);
  });
  it('V2 todas vencidas = a última (o atraso mais curto); sem duplicata: "à vista" só com tPag 01/03/04/17', () => {
    const v = vencimentoDaNota([D('001', '2026-10-01'), D('002', '2026-11-02')], [], '2026-11-16');
    expect([v.proxima?.numero, v.indice, v.dias]).toEqual(['002', 2, -14]);
    expect(vencimentoDaNota([], ['17'], '2026-11-16')).toMatchObject({ proxima: null, aVista: true });
    expect(vencimentoDaNota([], ['15'], '2026-11-16')).toMatchObject({ proxima: null, aVista: false });
    expect(vencimentoDaNota([], ['90'], '2026-11-16').aVista).toBe(false);
  });
  it('V3 a cor só na que ainda não está lançada: vencida = vermelho; até 7 dias = âmbar; já no sistema = sem cor', () => {
    const venc = (dias: number) => ({ todas: [], proxima: D('001', 'x'), indice: 1, aVista: false, dias });
    expect(tomDoVenc({ sit: 'nova', venc: venc(-1) })).toBe('vencida');
    expect(tomDoVenc({ sit: 'pode_estar', venc: venc(7) })).toBe('perto');
    expect(tomDoVenc({ sit: 'nova', venc: venc(8) })).toBeNull();
    expect(tomDoVenc({ sit: 'no_sistema', venc: venc(-30) })).toBeNull();
    expect(vencidaSemLancamento({ sit: 'nova', venc: venc(-3) })).toBe(true);
    expect(vencidaSemLancamento({ sit: 'nao_financeira', venc: venc(-3) })).toBe(false);
    expect(dicaDoVenc({ sit: 'nova', venc: venc(-14) })).toBe('Venceu há 14 dias — confira se já pagou.');
    expect(dicaDoVenc({ sit: 'nova', venc: venc(0) })).toBe('Vence hoje.');
  });
  it('V4 o banco devolve as duplicatas (n · venc · valor em reais) e o tPag; fora do formato fica de fora', () => {
    const m = lerAtributos([{ chave: 'k', cfops: [], tpnf: '1', natop: 'VENDA', refs: [],
      dups: [{ n: '001', venc: '2026-12-10', valor: '1234.56' }, { n: '002', venc: null, valor: '1' }, 'lixo'], tpags: ['15', 3] }]);
    expect(m.get('k')?.dups).toEqual([{ numero: '001', vencimento: '2026-12-10', valorCent: 123456 }]);
    expect(m.get('k')?.tpags).toEqual(['15']);
  });
});

/* NOTA-DEMONSTRACAO-01 (Gabriel 19/11 08:03) — a demonstração ligada à compra/ao retorno que veio depois (o banco liga; a tela mostra) */
describe('NOTA-DEMONSTRACAO-01 — a ligação da demonstração', () => {
  const D = chave(7891), C = chave(8001), R = chave(8002);
  it('L1 o banco → as ligações (fora do formato fica de fora; força desconhecida = "fornecedor", a mais fraca)', () => {
    expect(lerLigacoes([{ demo: D, nota: C, tipo: 'compra', por: 'item' }, { demo: D, nota: R, tipo: 'devolvida' }, 'x', { demo: R, nota: D, tipo: 'retorno', por: '?' }]))
      .toEqual([{ demo: D, nota: C, tipo: 'compra', por: 'item' }, { demo: R, nota: D, tipo: 'retorno', por: 'fornecedor' }]);
  });
  it('L2 os dois lados: a demonstração vê "Comprado pela NF"; a compra vê "do bem em demonstração NF"; o só-fornecedor diz "confira"', () => {
    const lig: LigacaoDaDemonstracao[] = [{ demo: D, nota: C, tipo: 'compra', por: 'item' }];
    const naDemo = ligacaoDaNota(D, lig); const naCompra = ligacaoDaNota(C, lig);
    expect(naDemo).toEqual({ papel: 'demo', tipo: 'compra', outra: '8.001', outraChave: C, por: 'item' });
    expect(naCompra).toEqual({ papel: 'compra', tipo: 'compra', outra: '7.891', outraChave: D, por: 'item' });
    if (!naDemo || !naCompra) throw new Error('sem ligação');
    expect(fraseDaLigacao(naDemo)).toBe('Comprado pela NF 8.001 (o mesmo item).');
    expect(fraseDaLigacao(naCompra)).toBe('Esta compra é do bem em demonstração NF 7.891 (o mesmo item).');
    expect(fraseDaLigacao({ papel: 'retorno', tipo: 'retorno', outra: '7.891', outraChave: D, por: 'fornecedor' }))
      .toBe('Fecha a demonstração NF 7.891 — só pelo fornecedor: confira se é o mesmo bem.');
    expect(ligacaoDaNota(chave(1), lig)).toBeNull();
  });
});
