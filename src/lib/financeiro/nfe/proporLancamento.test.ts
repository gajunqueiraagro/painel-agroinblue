/**
 * FIN-NFE-XML-01d — da nota lida ao lancamento proposto, e o resolvedor do emitente. Puro; fixtures sinteticas do 01a.
 */
import { describe, it, expect } from 'vitest';
import { lerNFe } from './lerNFe';
import type { AvisoNFe, DuplicataNFe, NotaLida } from './tipos';
import { EMITENTE_CNPJ, montarNFe, utf8, type OpcoesNota } from './__fixtures__/notas';
import {
  FORMA_POR_TPAG, fraseParcelasComoNaNota, FRASE_FAZENDA_NAO_IDENTIFICADA, FRASE_NOTA_DE_VENDA, FRASE_SEM_DUPLICATAS,
  FRASE_SEM_PROTOCOLO, descricaoDaNota, duplicatasCabemNoParcelamentoDeHoje, proporLancamento, somarMeses,
  type FazendaComIE, type PropostaDeLancamento, type UltimaClassificacao,
} from './proporLancamento';
import { resolverEmitente, type FornecedorParaResolver, type ResolucaoEmitente } from './resolverEmitente';
import { dataCurta, documentoFormatado, numeroDaNota, numeroFalado, reais } from './formatos';
import { FORMAS_PAGAMENTO_V2 } from '@/lib/financeiro/formasPagamentoV2';

function ler(o: OpcoesNota = {}): { nota: NotaLida; avisos: AvisoNFe[] } {
  const r = lerNFe(utf8(montarNFe(o)));
  if (r.ok === false) throw new Error(`fixture recusada: ${r.motivo}`);
  return { nota: r.nota, avisos: r.avisos };
}
/* As IEs da fixture: emitente 283456789, destinatario 28.987.654-3. */
const FAZ_DEST: FazendaComIE = { id: 'faz-dest', nome: 'Faz. Modelo', ie: '28.987.654-3' };
const FAZ_OUTRA: FazendaComIE = { id: 'faz-outra', nome: 'Faz. Outra', ie: '11.111.111-1' };
const FAZ_EMIT: FazendaComIE = { id: 'faz-emit', nome: 'Faz. Vendedora', ie: '28.345.678-9' };
const FAZ_SEM_IE: FazendaComIE = { id: 'faz-sem', nome: 'Faz. Sem IE', ie: null };
const ACHADO: ResolucaoEmitente = { achadoPor: 'documento', candidatos: [{ id: 'forn-1', nome: 'Agro Exemplo' }], propostoId: 'forn-1', inativo: false, cadastroSemDocumento: false };
const NINGUEM: ResolucaoEmitente = { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false };
const ULTIMA: UltimaClassificacao = { plano_conta_id: 'plano-1', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' };

function propor(o: OpcoesNota = {}, extra: Partial<Parameters<typeof proporLancamento>[0]> = {}): PropostaDeLancamento {
  const { nota, avisos } = ler(o);
  const r = proporLancamento({ nota, avisosDoLeitor: avisos, fazendas: [FAZ_OUTRA, FAZ_DEST], emitente: ACHADO, favorecidoId: 'forn-1', ultima: ULTIMA, ...extra });
  if (r.ok === false) throw new Error(`proposta recusada: ${r.frase}`);
  return r.proposta;
}
const dup = (v: [string, number][]): DuplicataNFe[] => v.map(([vencimento, valorCent], i) => ({ numero: String(i + 1).padStart(3, '0'), vencimento, valorCent }));

describe('duplicatasCabemNoParcelamentoDeHoje — o espelho de fn_parcelamento_cadastrar', () => {
  it('CABEM: valores iguais e vencimentos mensais (as duas notas do caso de teste)', () => {
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 811900], ['2026-12-05', 811900]]))).toBe(true);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 67275], ['2026-12-05', 67275]]))).toBe(true);
  });
  it('CABEM com sobra na ultima: 100,00 em 3 = 33,33 + 33,33 + 33,34', () => {
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-01-10', 3333], ['2026-02-10', 3333], ['2026-03-10', 3334]]))).toBe(true);
    /* a sobra na PRIMEIRA nao e' o que o banco gera */
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-01-10', 3334], ['2026-02-10', 3333], ['2026-03-10', 3333]]))).toBe(false);
  });
  it('CABEM com o dia preso ao fim do mes: 31/01 -> 28/02 -> 31/03 (o make_interval do banco)', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
    expect(somarMeses('2026-11-05', 2)).toBe('2027-01-05');
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-01-31', 5000], ['2026-02-28', 5000], ['2026-03-31', 5000]]))).toBe(true);
  });
  it('NAO CABEM: valores diferentes, datas fora do mensal, 30/60 dias corridos, uma so, 25', () => {
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 900000], ['2026-12-05', 723800]]))).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 811900], ['2026-12-10', 811900]]))).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-10-30', 811900], ['2026-11-29', 811900]]))).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 811900]]))).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje([])).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup(Array.from({ length: 25 }, (_, i): [string, number] => [somarMeses('2026-01-05', i), 1000])))).toBe(false);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup(Array.from({ length: 24 }, (_, i): [string, number] => [somarMeses('2026-01-05', i), 1000])))).toBe(true);
    expect(duplicatasCabemNoParcelamentoDeHoje(dup([['2026-11-05', 811900], ['', 811900]]))).toBe(false);
  });
});

describe('proporLancamento — F1, a nota inteira', () => {
  const p = propor();
  it('tudo o que o Novo lancamento vai mostrar', () => {
    expect(p).toEqual({
      rotuloNota: 'NF 000.012.345',
      tipoOperacao: '2-Saídas',
      competencia: '2026-09-30',
      favorecidoId: 'forn-1',
      fazendaId: 'faz-dest',
      valorCent: 1623800,
      classificacao: ULTIMA,
      parcelamento: { tipo: 'parcelado', parcelas: 2, primeiroVencimento: '2026-11-05' },
      duplicatas: [{ numero: '001', vencimento: '2026-11-05', valorCent: 811900 }, { numero: '002', vencimento: '2026-12-05', valorCent: 811900 }],
      formaPagamento: 'Boleto',
      numeroDocumento: '12345',
      descricao: 'NF 12.345 · SAL MINERAL 80 P SC 30KG, RACAO ENGORDA 18% SC 40KG · 6 itens',
      documento: {
        numero: '000.012.345', serie: '1', chaveAcesso: p.documento.chaveAcesso, dataEmissao: '2026-09-30', valorCent: 1623800,
        emitenteId: 'forn-1', emitenteNome: 'AGROPECUARIA EXEMPLO LTDA', emitenteDocumento: '11.222.333/0001-81',
      },
      origens: {
        tipo: 'Saída · do XML', competencia: 'emissão', documento: 'do XML', descricao: 'do XML', valor: 'do XML',
        parcelamento: 'Parcelada · 2x · 1º venc. 05/11/26', fazenda: 'IE 289876543', fornecedor: 'pelo CNPJ',
        subcentro: 'último · 14/08/26', forma: 'do XML',
      },
      avisos: [],
    });
    expect(p.documento.chaveAcesso).toMatch(/^\d{44}$/);
  });
  it('decisao 11 — a competencia e a EMISSAO, nao o vencimento', () => {
    expect(p.competencia).toBe('2026-09-30');
    expect(p.competencia).not.toBe(p.duplicatas[0].vencimento);
  });
});

describe('proporLancamento — as decisoes', () => {
  it('5 — duplicatas somando diferente da nota: o lancamento vale a SOMA, e a diferenca fica escrita', () => {
    const p = propor({ duplicatas: [['001', '2026-11-05', '8119.00'], ['002', '2026-12-05', '8000.00']] });
    expect(p.valorCent).toBe(1611900);
    expect(p.documento.valorCent).toBe(1623800);
    expect(p.origens.valor).toBe('soma das duplicatas');
    expect(p.avisos).toContain('Duplicatas 16.119,00 · nota 16.238,00. Lançamento = 16.119,00 · diferença −119,00');
    /* valores diferentes entre si: entram como PARCELAS LIVRES, como estao na nota (PARC-LIVRES-01) */
    expect(p.parcelamento).toEqual({ tipo: 'livres', parcelas: 2 });
    expect(p.origens.parcelamento).toBe('Parcelas livres · 2 · como na nota');
  });
  it('6 — sem duplicatas: lancamento unico, vencimento VAZIO, valor da nota, aviso', () => {
    const p = propor({ duplicatas: null });
    expect(p.parcelamento).toEqual({ tipo: 'unico', vencimento: '' });
    expect(p.valorCent).toBe(1623800);
    expect(p.origens.valor).toBe('do XML');
    expect(p.avisos).toEqual([FRASE_SEM_DUPLICATAS]);
    expect(p.origens.parcelamento).toBeUndefined();
  });
  it('uma duplicata so: lancamento unico com o vencimento DELA', () => {
    const p = propor({ duplicatas: [['001', '2026-10-30', '16238.00']] });
    expect(p.parcelamento).toEqual({ tipo: 'unico', vencimento: '2026-10-30' });
    expect(p.origens.vencimento).toBe('duplicata');
    expect(p.avisos).toEqual([]);
  });
  it('duplicatas fora do padrao mensal: PARCELAS LIVRES como na nota, sem aviso de recusa (PARC-LIVRES-01)', () => {
    const p = propor({ duplicatas: [['001', '2026-10-30', '8119.00'], ['002', '2026-11-29', '8119.00']] });
    expect(p.parcelamento).toEqual({ tipo: 'livres', parcelas: 2 });
    expect(p.valorCent).toBe(1623800);
    expect(p.avisos).toEqual([]);
    expect(fraseParcelasComoNaNota(2)).toBe('A nota trouxe 2 parcelas com valores ou datas próprias: entram como estão na nota.');
    expect(p.duplicatas).toHaveLength(2);
  });
  it('8 e 9 — IE do EMITENTE = IE de uma fazenda do cliente: recusa, com a frase', () => {
    const { nota, avisos } = ler();
    expect(proporLancamento({ nota, avisosDoLeitor: avisos, fazendas: [FAZ_DEST, FAZ_EMIT], emitente: ACHADO, favorecidoId: 'forn-1', ultima: null }))
      .toEqual({ ok: false, frase: 'Nota de venda entra pela Operação Comercial.' });
    expect(FRASE_NOTA_DE_VENDA).toBe('Nota de venda entra pela Operação Comercial.');
  });
  it('9 — IE do destinatario casa (comparando so digitos): compra, e propoe ESSA fazenda', () => {
    expect(propor().fazendaId).toBe('faz-dest');
    expect(propor({}, { fazendas: [FAZ_SEM_IE, { ...FAZ_DEST, ie: '289876543' }] }).fazendaId).toBe('faz-dest');
  });
  it('9 — nenhuma IE casa: segue como compra, fazenda VAZIA, com o aviso', () => {
    const p = propor({}, { fazendas: [FAZ_OUTRA, FAZ_SEM_IE] });
    expect(p.fazendaId).toBeNull();
    expect(p.origens.fazenda).toBeUndefined();
    expect(p.avisos).toEqual([FRASE_FAZENDA_NAO_IDENTIFICADA]);
    /* fazenda sem IE nunca casa com nota sem IE */
    expect(propor({}, { fazendas: [] }).fazendaId).toBeNull();
  });
  it('12 — classificacao do ultimo lancamento do fornecedor; sem historico, vazia', () => {
    expect(propor().classificacao).toEqual(ULTIMA);
    const sem = propor({}, { ultima: null });
    expect(sem.classificacao).toBeNull();
    expect(sem.origens.subcentro).toBeUndefined();
  });
  it('13 — a descricao resume os itens', () => {
    expect(descricaoDaNota(ler().nota)).toBe('NF 12.345 · SAL MINERAL 80 P SC 30KG, RACAO ENGORDA 18% SC 40KG · 6 itens');
    expect(descricaoDaNota({ ...ler().nota, numero: '178766', itens: ler().nota.itens.slice(0, 1) })).toBe('NF 178.766 · SAL MINERAL 80 P SC 30KG');
    expect(descricaoDaNota({ ...ler().nota, itens: [] })).toBe('NF 12.345');
  });
  it('sem protocolo: aviso com a frase exata', () => {
    expect(propor({ cStat: null }).avisos).toEqual([FRASE_SEM_PROTOCOLO]);
    expect(FRASE_SEM_PROTOCOLO).toBe('Nota sem protocolo de autorização.');
  });
  it('fornecedor nao achado: favorecido vazio e sem origem; achado pelo nome: "pelo nome"; emitente CPF: "pelo CPF"', () => {
    const sem = propor({}, { emitente: NINGUEM, favorecidoId: null });
    expect([sem.favorecidoId, sem.origens.fornecedor, sem.documento.emitenteId]).toEqual([null, undefined, null]);
    expect(propor({}, { emitente: { ...ACHADO, achadoPor: 'nome' } }).origens.fornecedor).toBe('pelo nome');
    expect(propor({ emitenteCpf: true }).origens.fornecedor).toBe('pelo CPF');
  });
  it('tPag: mapa FECHADO e so com formas que existem no sistema; o que nao mapeia fica vazio', () => {
    for (const f of Object.values(FORMA_POR_TPAG)) expect(FORMAS_PAGAMENTO_V2).toContain(f);
    expect(FORMA_POR_TPAG).toEqual({ '01': 'Dinheiro', '03': 'Cartão', '04': 'Cartão', '15': 'Boleto', '17': 'PIX', '18': 'Transferência' });
    const { nota, avisos } = ler();
    const r = proporLancamento({ nota: { ...nota, pagamentos: [{ tPag: '90', valorCent: 0 }] }, avisosDoLeitor: avisos, fazendas: [FAZ_DEST], emitente: ACHADO, favorecidoId: 'forn-1', ultima: null });
    if (r.ok === false) throw new Error('recusou');
    expect([r.proposta.formaPagamento, r.proposta.origens.forma]).toEqual(['', undefined]);
  });
});

describe('resolverEmitente — documento primeiro, nome depois', () => {
  const E = { documento: EMITENTE_CNPJ, nome: 'AGROPECUARIA EXEMPLO LTDA' };
  const f = (id: string, extra: Partial<FornecedorParaResolver> = {}): FornecedorParaResolver => ({ id, nome: `Fornecedor ${id}`, cpf_cnpj: null, ativo: true, ...extra });
  it('pelo DOCUMENTO, comparando so digitos (cadastro com mascara)', () => {
    expect(resolverEmitente(E, [f('a'), f('b', { cpf_cnpj: '11.222.333/0001-81' })], null))
      .toEqual({ achadoPor: 'documento', candidatos: [f('b', { cpf_cnpj: '11.222.333/0001-81' })], propostoId: 'b', inativo: false, cadastroSemDocumento: false });
  });
  it('pelo documento VENCE o nome', () => {
    const r = resolverEmitente(E, [f('a'), f('b', { cpf_cnpj: '11222333000181' })], 'a');
    expect([r.propostoId, r.achadoPor, r.inativo, r.cadastroSemDocumento]).toEqual(['b', 'documento', false, false]);
  });
  it('DOIS ATIVOS com o mesmo documento: nenhum proposto, os dois na lista — o operador escolhe', () => {
    const r = resolverEmitente(E, [f('a', { cpf_cnpj: '11.222.333/0001-81' }), f('b', { cpf_cnpj: '11222333000181' }), f('c', { cpf_cnpj: '11.222.333/0001-81', ativo: false })], null);
    expect([r.achadoPor, r.propostoId, r.candidatos.map((c) => c.id), r.inativo]).toEqual(['documento', null, ['a', 'b'], false]);
  });
  it('um ativo e um inativo: o ATIVO, sem aviso', () => {
    const r = resolverEmitente(E, [f('a', { cpf_cnpj: '11.222.333/0001-81', ativo: false }), f('b', { cpf_cnpj: '11222333000181' })], null);
    expect([r.propostoId, r.inativo]).toEqual(['b', false]);
  });
  it('SO INATIVO: propoe e avisa', () => {
    const r = resolverEmitente(E, [f('a', { cpf_cnpj: '11.222.333/0001-81', ativo: false })], null);
    expect([r.achadoPor, r.propostoId, r.inativo]).toEqual(['documento', 'a', true]);
  });
  it('pelo NOME, um candidato, cadastro SEM documento: oferece gravar o do XML', () => {
    expect(resolverEmitente(E, [f('a'), f('b')], 'a')).toEqual({ achadoPor: 'nome', candidatos: [f('a')], propostoId: 'a', inativo: false, cadastroSemDocumento: true });
  });
  it('pelo nome, cadastro COM outro documento: propoe, e nao oferece gravar', () => {
    const r = resolverEmitente(E, [f('a', { cpf_cnpj: '99.999.999/0001-99' })], 'a');
    expect([r.achadoPor, r.propostoId, r.cadastroSemDocumento]).toEqual(['nome', 'a', false]);
  });
  it('NENHUM: nada proposto (a tela oferece criar); id do banco que nao esta na lista tambem e nenhum', () => {
    const nada = { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false };
    expect(resolverEmitente(E, [f('a')], null)).toEqual(nada);
    expect(resolverEmitente(E, [f('a')], 'fantasma')).toEqual(nada);
    expect(resolverEmitente({ documento: '', nome: 'X' }, [f('a', { cpf_cnpj: '' })], null)).toEqual(nada);
  });
});

describe('formatos', () => {
  it('numero, documento, reais e data', () => {
    expect([numeroDaNota('178766'), numeroDaNota('7'), numeroFalado('178766'), numeroFalado('000000012')]).toEqual(['000.178.766', '000.000.007', '178.766', '12']);
    expect([documentoFormatado('11222333000181'), documentoFormatado('52998224725'), documentoFormatado('123')]).toEqual(['11.222.333/0001-81', '529.982.247-25', '123']);
    expect([reais(1623800), reais(67275), reais(5), reais(0), reais(-11900), reais(100000000)]).toEqual(['16.238,00', '672,75', '0,05', '0,00', '−119,00', '1.000.000,00']);
    expect([dataCurta('2026-09-30'), dataCurta(''), dataCurta(null)]).toEqual(['30/09/26', '—', '—']);
  });
});
