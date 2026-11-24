// APROVAR-PAGAMENTOS-V3 — as regras da tela do aprovador (sem React): o pronto em UM texto humano, a sigla da forma, o nº da NF, os dias,
// as abas e o filtro, e o "confere" do CPF/CNPJ de quem recebe.
import { describe, expect, it } from 'vitest';
import {
  comRegraDoDebitoAutomatico, conferirFavorecido, contarAbas, ultimosPorFornecedor, variacaoDoDa, contarFiltro, filtrarV3, lerLinhasV3, motivoSemDecidir, numeroDaNf, periodoDoMes, porDiaV3, siglaDaForma, textoDoPronto,
} from './aprovacaoV3';

const crua = (o: Record<string, unknown>) => ({
  lancamento_id: 'a', vencimento: '2026-12-04', status: 'programado', aba: 'aprovar', fornecedor: 'Aguimar S. F. e Cia Ltda', favorecido_id: 'f1',
  descricao: 'Eixo interno', valor: -1176, forma: 'PIX', nf: '000078728', conta: 'Itaú Personalite', subcentro: 'Manutenção', financiamento_id: null,
  recorrencia_id: null, estado: 'aguardando', motivo: null, posso_decidir: true, lancado_por: 'u2', lancado_em: '2026-10-19T12:00:00Z',
  documento_pedido: 'nota', pronto: 'pronto',
  pagamento: { forma: 'PIX', chave: '00196816000132', tipo_chave: 'CNPJ', titular: 'Aguimar S. F. e Cia Ltda', doc_pagamento: '00.196.816/0001-32',
    doc_fornecedor: '00.196.816/0001-32', boleto_anexado: false, emitente_nf_doc: '00196816000132' },
  ...o,
});

describe('lerLinhasV3', () => {
  it('lê a linha do banco (valor sempre positivo; o pagamento em camelCase; sem id = fora)', () => {
    const [l, ...resto] = lerLinhasV3([crua({}), { fornecedor: 'sem id' }, null]);
    expect(resto).toHaveLength(0);
    expect(l).toMatchObject({ id: 'a', aba: 'aprovar', valor: 1176, possoDecidir: true, pronto: 'pronto' });
    expect(l.pagamento).toMatchObject({ chave: '00196816000132', tipoChave: 'CNPJ', emitenteNfDoc: '00196816000132', boletoAnexado: false });
  });
  it('aba desconhecida vira nula (a linha não entra em aba nenhuma)', () => {
    expect(lerLinhasV3([crua({ aba: 'outra' })])[0].aba).toBeNull();
  });
});

describe('textoDoPronto — UM texto humano, nunca o código', () => {
  it('traduz cada código do banco', () => {
    expect(textoDoPronto('pronto')).toBe('pronto ✓');
    expect(textoDoPronto('falta_boleto')).toBe('falta boleto');
    expect(textoDoPronto('falta_guia')).toBe('falta guia');
    expect(textoDoPronto('falta_recibo')).toBe('falta recibo');
    expect(textoDoPronto('falta_holerite')).toBe('falta holerite');
    expect(textoDoPronto('falta_chave')).toBe('falta chave Pix');
  });
  it('código desconhecido ou nulo = "—" (o erro de 11:26: "falta_boleto" cru no painel)', () => {
    expect(textoDoPronto('codigo_novo')).toBe('—');
    expect(textoDoPronto(null)).toBe('—');
  });
});

describe('siglaDaForma e numeroDaNf', () => {
  it('as siglas do mock', () => {
    expect(siglaDaForma('Boleto').sigla).toBe('Bol');
    expect(siglaDaForma('PIX').sigla).toBe('Pix');
    expect(siglaDaForma('Transferência').sigla).toBe('TED');
    expect(siglaDaForma('Débito Automático').sigla).toBe('DA');
    expect(siglaDaForma(null).sigla).toBe('—');
  });
  it('o nº da NF sem zeros e com milhar; sem NF = "—"', () => {
    expect(numeroDaNf('000018112')).toBe('18.112');
    expect(numeroDaNf('178768')).toBe('178.768');
    expect(numeroDaNf('A-12')).toBe('A-12');
    expect(numeroDaNf(null)).toBe('—');
  });
});

describe('dias, abas e filtro', () => {
  const linhas = lerLinhasV3([
    crua({ lancamento_id: 'a', vencimento: '2026-12-04', valor: -1176 }),
    crua({ lancamento_id: 'b', vencimento: '2026-12-05', valor: -3006.5 }),
    crua({ lancamento_id: 'c', vencimento: '2026-12-05', valor: -437.67, pronto: 'falta_recibo' }),
    crua({ lancamento_id: 'd', vencimento: '2026-12-06', valor: -100, aba: 'aprovados', estado: 'aprovado' }),
  ]);
  it('a linha do dia: "sex · 04/12 · 1 conta" e o total', () => {
    const dias = porDiaV3(linhas.slice(0, 3));
    expect(dias.map((d) => d.rotulo)).toEqual(['sex · 04/12 · 1 conta', 'sáb · 05/12 · 2 contas']);
    expect(dias[1].total).toBeCloseTo(3444.17, 2);
  });
  it('as abas contam N e o total; o filtro Prontos · Faltando é o da coluna', () => {
    const c = contarAbas(linhas);
    expect(c.aprovar.n).toBe(3);
    expect(c.aprovar.total).toBeCloseTo(4620.17, 2);
    expect(c.aprovados.n).toBe(1);
    const daAba = linhas.filter((l) => l.aba === 'aprovar');
    expect(contarFiltro(daAba)).toEqual({ todos: 3, prontos: 2, faltando: 1 });
    expect(filtrarV3(linhas, 'aprovar', 'faltando').map((l) => l.id)).toEqual(['c']);
  });
});

describe('conferirFavorecido — o CPF/CNPJ de quem recebe × o emitente da NF', () => {
  const [l] = lerLinhasV3([crua({})]);
  it('igual (a raiz do CNPJ) = confere, citando a NF', () => {
    expect(conferirFavorecido(l.pagamento.docPagamento, l.pagamento, l.nf)).toEqual({ tom: 'ok', texto: 'confere ✓ igual ao fornecedor da NF 78.728' });
  });
  it('outro CNPJ = diferente; sem documento = "—"', () => {
    expect(conferirFavorecido('11.222.333/0001-81', l.pagamento, l.nf).tom).toBe('diferente');
    expect(conferirFavorecido(null, l.pagamento, l.nf)).toEqual({ tom: 'sem', texto: '—' });
  });
  it('sem NF, confere contra o cadastro do fornecedor', () => {
    const p = { ...l.pagamento, emitenteNfDoc: null };
    expect(conferirFavorecido('00196816000132', p, null).texto).toBe('confere ✓ igual ao cadastro do fornecedor');
  });
});

describe('periodoDoMes', () => {
  it('dezembro/2026 = 01/12 a 31/12', () => {
    expect(periodoDoMes(2026, 11)).toEqual({ de: '2026-12-01', ate: '2026-12-31', rotulo: 'dezembro/2026' });
  });
});

describe('DÉBITO AUTOMÁTICO — já autorizado no banco (Gabriel 24/11 17:40)', () => {
  const linhas = lerLinhasV3([
    crua({ lancamento_id: 'da', forma: 'Débito Automático', valor: -1300, favorecido_id: 'fda', vencimento: '2026-12-07' }),
    crua({ lancamento_id: 'pix', forma: 'PIX', valor: -100 }),
    crua({ lancamento_id: 'da-pago', forma: 'Débito Automático', aba: 'pagos', estado: 'aprovado', posso_decidir: false }),
  ]);
  const comRegra = comRegraDoDebitoAutomatico(linhas);
  it('o DA de "Para aprovar" vai para Aprovados como "aprovado · DA" (sem caixa, fora do total); o resto não muda', () => {
    expect(comRegra.map((l) => [l.id, l.aba, l.daPelaRegra, l.possoDecidir])).toEqual([
      ['da', 'aprovados', true, false], ['pix', 'aprovar', false, true], ['da-pago', 'pagos', false, false]]);
    const c = contarAbas(comRegra);
    expect(c.aprovar).toEqual({ n: 1, total: 100 });
    expect(motivoSemDecidir(comRegra[0])).toContain('Débito automático');
  });
  it('o último pagamento por fornecedor = o 1º de cada um na ordem lida', () => {
    const m = ultimosPorFornecedor([{ favorecido_id: 'fda', data_pagamento: '2026-11-07', valor: -1000 },
      { favorecido_id: 'fda', data_pagamento: '2026-10-07', valor: -900 }, { favorecido_id: null, data_pagamento: '2026-11-01', valor: 1 }]);
    expect([...m.entries()]).toEqual([['fda', { data: '2026-11-07', valor: 1000 }]]);
  });
  it('variou MAIS de 20% = aviso "mês passado R$ X"; 20% exato ou não DA = nada', () => {
    const v = variacaoDoDa(comRegra[0], { data: '2026-11-07', valor: 1000 });
    expect(v?.selo).toBe('+30%');
    expect(v?.texto).toBe('mês passado R$ 1.000,00');
    expect(v?.titulo).toContain('07/11/2026');
    expect(variacaoDoDa(comRegra[0], { data: '2026-09-07', valor: 2000 })?.texto).toBe('em 09/2026 R$ 2.000,00');
    expect(variacaoDoDa(comRegra[0], { data: '2026-09-07', valor: 2000 })?.selo).toBe('−35%');
    expect(variacaoDoDa({ ...comRegra[0], valor: 1200 }, { data: '2026-11-07', valor: 1000 })).toBeNull();
    expect(variacaoDoDa(comRegra[1], { data: '2026-11-07', valor: 10 })).toBeNull();
    expect(variacaoDoDa(comRegra[0], undefined)).toBeNull();
  });
});
