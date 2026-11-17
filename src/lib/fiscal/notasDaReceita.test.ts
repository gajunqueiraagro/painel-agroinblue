/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a regra da lista "Notas da Receita" (dados SINTÉTICOS; nenhuma nota real).
 *   R1 nº e série da chave · R2 situação (nova × já no sistema × resumo × cancelada) · R3 abas e selo (D2) · R4 CPF de emitente mascarado
 *   R5 leitura do banco recusa o que não é do formato · R6 total sem canceladas · R7 busca por emitente/nº/documento
 */
import { describe, expect, it } from 'vitest';
import {
  ABAS_DA_RECEITA, arquivoDoXml, filtrarBusca, lerLinhasRecebidas, montarLista, numeroDaChave, pedemAcao, serieDaChave, situacaoNaLista,
  totalDaLista, type LinhaRecebida,
} from './notasDaReceita';

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
    expect(conta).toEqual({ lancar: 1, ciencia: 1, no_sistema: 1, canceladas: 1, todas: 4 });
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
});
