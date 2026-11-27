/**
 * CAD-CONTAS-BANCARIAS-01 — a lista e o formulario da conta bancaria (logica pura).
 *   K1 celulas: vazio "não inf."/"não informado" (cinza), caixa fisico "não se aplica", sem saldo/inicio em ambar, banco "341 Itaú"
 *   K2 filtros: busca por conta, banco (nome e codigo) e gerente, sem acento; segmento; fazenda; inativas
 *   K3 faixas na ordem CC · INV · Cartao (caixa e tipo estranho em CC), pelo codigo (empate: o nome); rodape "N contas · N ativas" e a soma
 *   K4 so' o que mudou vai ao banco: nada mudou = {}; saldo; caixa = cc + banco Dinheiro; "Sem extrato" e' a marca; conta e digito
 *   K5 larguras: somem Telefone e Inicio, depois Gerente e Agencia, depois Fazenda
 *   K6 conta nova exige a data e o saldo inicial
 *   K8 CONTAS-BANCARIAS-AJUSTES-01 (a) título "N ativas · N inativas" do cadastro inteiro; rodapé "mostrando N de T" só com filtro
 *   K9 (c) o código: 2 dígitos na nova e quando muda (o de hoje intocado não trava); o próximo livre é POR tipo_conta (a permuta é dela)
 */
import { describe, it, expect } from 'vitest';
import {
  celulaAgencia, celulaBanco, celulaConta, celulaGerente, celulaInicio, celulaSaldo, celulaTelefone, colunasEscondidas, faixasDaLista,
  codigoDeDoisDigitos, faltasDoFormulario, filtrarContas, formularioDaConta, mudancas, mudaOSaldoInicial, proximoCodigoLivre, rodapeDaLista,
  resumoDoCadastro, subtituloDaConta, tipoContaDoFormulario,
  type BancoReferencia, type ContaBancariaCadastro,
} from './contasBancarias';

const BANCOS: BancoReferencia[] = [
  { codigo_banco: '341', nome_banco: 'Itaú Unibanco', nome_curto: 'Itaú' },
  { codigo_banco: '237', nome_banco: 'Bradesco', nome_curto: 'Bradesco' },
  { codigo_banco: '000', nome_banco: 'Dinheiro/Caixa', nome_curto: 'Dinheiro' },
];
const conta = (p: Partial<ContaBancariaCadastro> = {}): ContaBancariaCadastro => ({
  id: 'c1', nome_conta: 'Itaú Personalite', nome_exibicao: null, codigo_conta: '01', tipo_conta: 'cc', fazenda_id: 'f1', ativa: true,
  banco: 'Itaú', agencia: '5596', numero_conta: '03722', conta_digito: '5', mes_inicio: '2024-01', saldo_inicial_oficial: 48210.37,
  gerente_nome: 'Gerente Exemplo', gerente_celular: '(18) 99712-4410', ...p,
});
const caixa = conta({ id: 'cx', nome_conta: 'Dinheiro', banco: 'Dinheiro', agencia: null, numero_conta: null, conta_digito: null, gerente_nome: null, gerente_celular: null });

describe('CAD-CONTAS-BANCARIAS-01 — a lista', () => {
  it('K1 celulas', () => {
    expect(celulaBanco(conta(), BANCOS)).toEqual({ texto: '341 Itaú', tom: 'normal' });
    expect(celulaConta(conta())).toEqual({ texto: '03722-5', tom: 'normal' });
    const vazia = conta({ agencia: null, numero_conta: null, gerente_nome: null, gerente_celular: null, gerente_telefone: null });
    expect([celulaAgencia(vazia), celulaConta(vazia), celulaTelefone(vazia)].map(c => [c.texto, c.tom])).toEqual([['não inf.', 'vazio'], ['não inf.', 'vazio'], ['não inf.', 'vazio']]);
    expect(celulaGerente(vazia)).toEqual({ texto: 'não informado', tom: 'vazio' });
    expect([celulaBanco(caixa, BANCOS).texto, celulaAgencia(caixa).texto, celulaConta(caixa).texto, celulaGerente(caixa).texto, celulaTelefone(caixa).texto])
      .toEqual(['Caixa físico', 'não se aplica', 'não se aplica', 'não se aplica', 'não se aplica']);
    const semInicio = conta({ mes_inicio: null, saldo_inicial_oficial: null });
    expect([celulaInicio(semInicio), celulaSaldo(semInicio)]).toEqual([{ texto: 'sem início', tom: 'aviso' }, { texto: 'sem saldo', tom: 'aviso' }]);
    expect(celulaInicio(conta()).texto).toBe('01/01/2024');
    expect(celulaSaldo(conta({ saldo_inicial_oficial: '0' })).texto.replace(/\s/g, ' ')).toBe('R$ 0,00');
    expect(celulaTelefone(conta({ gerente_celular: null, gerente_telefone: '(18) 3221-0450' })).texto).toBe('(18) 3221-0450');
    expect(subtituloDaConta(conta(), BANCOS)).toBe('Itaú Personalite · 341 Itaú · ag. 5596 · c/c 03722-5');
  });

  it('K2 filtros', () => {
    const lista = [conta(), conta({ id: 'c2', nome_conta: 'Conta Fazenda', banco: 'Bradesco', gerente_nome: 'Joao', fazenda_id: 'f2' }),
      conta({ id: 'c3', nome_conta: 'Itaú CDI', tipo_conta: 'inv' }), conta({ id: 'c4', nome_conta: 'Velha', ativa: false })];
    const f = (p: Partial<Parameters<typeof filtrarContas>[1]>) => filtrarContas(lista, { busca: '', segmento: 'todas', fazendaId: null, mostrarInativas: false, ...p }, BANCOS).map(c => c.id);
    expect(f({})).toEqual(['c1', 'c2', 'c3']);
    expect(f({ mostrarInativas: true })).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(f({ busca: 'joão' })).toEqual(['c2']);
    expect(f({ busca: '237' })).toEqual(['c2']);
    expect(f({ busca: 'itau' })).toEqual(['c1', 'c3']);
    expect(f({ segmento: 'inv' })).toEqual(['c3']);
    expect(f({ fazendaId: 'f2' })).toEqual(['c2']);
  });

  it('K3 faixas e rodape', () => {
    const lista = [conta({ id: 'b', codigo_conta: '02' }), conta({ id: 'i', tipo_conta: 'inv', codigo_conta: '01', saldo_inicial_oficial: 286904.12 }),
      conta({ id: 'a', codigo_conta: '01' }), caixa, conta({ id: 'p', tipo_conta: 'permuta', codigo_conta: '09', saldo_inicial_oficial: null }),
      conta({ id: 'k', tipo_conta: 'cartao', codigo_conta: '01', ativa: false, saldo_inicial_oficial: 0 })];
    const fx = faixasDaLista(lista);
    expect(fx.map(f => [f.rotulo, f.contas.map(c => c.id)])).toEqual([
      ['Conta corrente', ['cx', 'a', 'b', 'p']], ['Investimento', ['i']], ['Cartão', ['k']]]);
    const r = rodapeDaLista(lista);
    expect(r.texto).toBe('6 contas');
    expect(r.saldo).toBe(Math.round((48210.37 * 3 + 286904.12) * 100) / 100);
  });
});

describe('CAD-CONTAS-BANCARIAS-01 — o formulario', () => {
  it('K4 so o que mudou vai ao banco', () => {
    const orig = formularioDaConta(conta(), 'f1');
    expect(mudancas(orig, { ...orig })).toEqual({});
    expect(mudancas(orig, { ...orig, saldoInicial: 1000 })).toEqual({ saldo_inicial_oficial: 1000 });
    expect(mudaOSaldoInicial(mudancas(orig, { ...orig, saldoEm: '2024-03-01' }))).toBe(true);
    expect(mudancas(orig, { ...orig, saldoEm: '2024-03-01' })).toEqual({ mes_inicio: '2024-03' });
    expect(mudancas(orig, { ...orig, gerenteNome: '' })).toEqual({ gerente_nome: null });
    expect(mudancas(orig, { ...orig, contaComDigito: '1234-X' })).toEqual({ numero_conta: '1234', conta_digito: 'X' });
    expect(mudancas(orig, { ...orig, formato: 'sem_extrato' })).toEqual({ sem_extrato_bancario: true });
    const semExt = formularioDaConta(conta({ sem_extrato_bancario: true }), 'f1');
    expect(semExt.formato).toBe('sem_extrato');
    expect(mudancas(semExt, { ...semExt, formato: 'ofx' })).toEqual({ sem_extrato_bancario: false, formato_extrato: 'ofx' });
    expect(mudancas(orig, { ...orig, tipo: 'caixa' })).toEqual({ banco: 'Dinheiro', agencia: null, numero_conta: null, conta_digito: null });
    expect(formularioDaConta(caixa, 'f1').tipo).toBe('caixa');
    expect(mudancas(orig, { ...orig, nomesReconhecimento: ['ITAU PERSONALITE'] })).toEqual({ aliases: ['ITAU PERSONALITE'] });
    expect(mudancas(orig, { ...orig, contaVinculada: 'inv1' })).toEqual({ conta_interna_id: 'inv1' });
    const inv = formularioDaConta(conta({ tipo_conta: 'inv', consolida_em_conta_id: 'cc9' }), 'f1');
    expect(inv.contaVinculada).toBe('cc9');
    expect(mudancas(inv, { ...inv, contaVinculada: '' })).toEqual({ consolida_em_conta_id: null });
    expect(formularioDaConta(conta(), 'f1', 'inv7').contaVinculada).toBe('inv7');
    const nova = { ...formularioDaConta(null, 'f1'), nome: 'Nova', saldoEm: '2026-01-01', saldoInicial: 0 };
    expect(mudancas(null, nova)).toEqual({ nome_conta: 'Nova', ativa: true, fazenda_id: 'f1', tipo_conta: 'cc', mes_inicio: '2026-01',
      saldo_inicial_oficial: 0, sem_extrato_bancario: false });
  });

  it('K5 larguras', () => {
    expect([...colunasEscondidas(1300)]).toEqual([]);
    expect([...colunasEscondidas(1100)].sort()).toEqual(['inicio', 'telefone']);
    expect([...colunasEscondidas(900)].sort()).toEqual(['agencia', 'gerente', 'inicio', 'telefone']);
    expect(colunasEscondidas(700).has('fazenda')).toBe(true);
    expect(colunasEscondidas(900).has('fazenda')).toBe(false);
  });

  it('K6 conta nova exige data e saldo', () => {
    const vazio = formularioDaConta(null, 'f1');
    expect(faltasDoFormulario({ ...vazio, codigo: '05' }, true)).toEqual(['o nome da conta', 'a data do saldo', 'o saldo inicial']);
    expect(faltasDoFormulario({ ...vazio, codigo: '05', nome: 'X', saldoEm: '2026-01-01', saldoInicial: 0 }, true)).toEqual([]);
    expect(faltasDoFormulario(formularioDaConta(conta({ mes_inicio: null, saldo_inicial_oficial: null }), 'f1'), false)).toEqual([]);
  });

  /* CARTAO-LANCAMENTO-01 (mock aprovado 30/10 18:28): no cartão, Dia de fechamento e Dia de vencimento DIGITADOS (vazio = nulo); nas
     outras contas os dias não existem (vão nulos); dia fora de 1–31 trava o Salvar com a frase */
  it('K7 os dias do cartão', () => {
    const cartao = formularioDaConta(conta({ tipo_conta: 'cartao', dia_fechamento: 3, dia_vencimento: null }), 'f1');
    expect([cartao.diaFechamento, cartao.diaVencimento]).toEqual(['3', '']);
    expect(mudancas(cartao, { ...cartao })).toEqual({});
    expect(mudancas(cartao, { ...cartao, diaVencimento: '10' })).toEqual({ dia_vencimento: 10 });
    expect(mudancas(cartao, { ...cartao, diaFechamento: '' })).toEqual({ dia_fechamento: null });
    expect(mudancas(cartao, { ...cartao, tipo: 'cc' })).toEqual({ tipo_conta: 'cc', dia_fechamento: null });
    const orig = formularioDaConta(conta(), 'f1');
    expect([orig.diaFechamento, orig.diaVencimento]).toEqual(['', '']);
    expect(mudancas(orig, { ...orig, diaVencimento: '10' })).toEqual({});
    expect(faltasDoFormulario({ ...cartao, diaVencimento: '32' }, false)).toEqual(['o dia de vencimento (de 1 a 31)']);
    expect(faltasDoFormulario({ ...cartao, diaFechamento: '3a' }, false)).toEqual(['o dia de fechamento (de 1 a 31)']);
    expect(faltasDoFormulario({ ...orig, diaFechamento: '99' }, false)).toEqual([]);
  });
});

describe('CONTAS-BANCARIAS-AJUSTES-01', () => {
  const lista = [conta({ id: 'a' }), conta({ id: 'b', ativa: false }), conta({ id: 'c', tipo_conta: 'inv' }), conta({ id: 'd', ativa: false }), conta({ id: 'e' })];

  it('K8 título do cadastro e rodapé da lista: uma regra só', () => {
    expect(resumoDoCadastro(lista).texto).toBe('3 ativas · 2 inativas');
    expect(resumoDoCadastro([conta()]).texto).toBe('1 ativa');
    expect(resumoDoCadastro([conta(), conta({ id: 'z', ativa: false })]).texto).toBe('1 ativa · 1 inativa');
    expect(rodapeDaLista(lista, lista).texto).toBe('5 contas');                                // sem filtro
    const so = filtrarContas(lista, { busca: '', segmento: 'todas', fazendaId: null, mostrarInativas: false });
    expect(rodapeDaLista(so, lista).texto).toBe('mostrando 3 de 5');                           // inativas escondidas = filtro
    const inv = filtrarContas(lista, { busca: '', segmento: 'inv', fazendaId: null, mostrarInativas: true });
    expect(rodapeDaLista(inv, lista).texto).toBe('mostrando 1 de 5');
  });

  it('K9 o código curto', () => {
    expect(['01', '13', ' 07 '].map(codigoDeDoisDigitos)).toEqual([true, true, true]);
    expect(['013', '1', '', 'a1', '1-2'].map(codigoDeDoisDigitos)).toEqual([false, false, false, false, false]);
    const nj = [conta({ id: 'c1', codigo_conta: '01' }), conta({ id: 'c2', codigo_conta: '11' }), conta({ id: 'c3', codigo_conta: '06', ativa: false }),
      conta({ id: 'p1', tipo_conta: 'permuta', codigo_conta: '12' }), conta({ id: 'p2', tipo_conta: 'permuta', codigo_conta: '013' }),
      conta({ id: 'i1', tipo_conta: 'inv', codigo_conta: '04' }), conta({ id: 'x', codigo_conta: null })];
    expect(proximoCodigoLivre(nj, 'cc')).toBe('12');
    expect(proximoCodigoLivre(nj, 'inv')).toBe('05');
    expect(proximoCodigoLivre(nj, 'cartao')).toBe('01');
    expect(proximoCodigoLivre(nj, 'permuta')).toBe('14');
    expect(proximoCodigoLivre(nj, 'permuta', 'p2')).toBe('13');                                 // o Kemp: o próximo depois do 12
    // o tipo no banco: a permuta segue permuta enquanto a tela não troca o tipo; a caixa é cc
    const kemp = nj[4];
    expect(tipoContaDoFormulario(formularioDaConta(kemp, 'f1'), kemp)).toBe('permuta');
    expect(tipoContaDoFormulario({ tipo: 'inv' }, kemp)).toBe('inv');
    expect(tipoContaDoFormulario({ tipo: 'caixa' }, null)).toBe('cc');
    // a trava: a nova e o código que muda conferem; o de hoje, intocado, não trava outro Salvar
    const fk = formularioDaConta(kemp, 'f1');
    expect(faltasDoFormulario(fk, false, { original: '013', sugestao: '13' })).toEqual([]);
    expect(faltasDoFormulario({ ...fk, codigo: '0131' }, false, { original: '013', sugestao: '13' }))
      .toEqual(['o código curto com 2 dígitos (o próximo livre do tipo: 13)']);
    expect(faltasDoFormulario({ ...fk, codigo: '13' }, false, { original: '013', sugestao: '13' })).toEqual([]);
    const nova = { ...formularioDaConta(null, 'f1'), nome: 'X', saldoEm: '2026-01-01', saldoInicial: 0 };
    expect(faltasDoFormulario(nova, true)).toEqual(['o código curto com 2 dígitos']);
    expect(faltasDoFormulario({ ...nova, codigo: '12' }, true)).toEqual([]);
  });
});

/* CONTA-INATIVAR-DATA-01 — "Inativa desde": dia 1º, só com a conta inativa, a prévia do banco lida e dita */
import {
  dadosDoFormulario as dadosI, faltasDoFormulario as faltasI, formularioDaConta as formI, fraseDaPreviaInativar, inativaDesdeValida,
  lerPreviaInativar, listaDaPreviaInativar, primeiroDoMes,
} from './contasBancarias';
describe('CONTA-INATIVAR-DATA-01 — Inativa desde', () => {
  const base = { id: 'c1', nome_conta: 'Bradesco', nome_exibicao: null, codigo_conta: '02', tipo_conta: 'cc', fazenda_id: 'f1', ativa: true, banco: 'Bradesco',
    agencia: null, numero_conta: null, conta_digito: null, mes_inicio: '2020-01', saldo_inicial_oficial: 0 };
  it('I1 a data vale só no dia 1º; qualquer dia escolhido vai ao 1º do mês', () => {
    expect(inativaDesdeValida('2026-02-01')).toBe(true);
    expect(inativaDesdeValida('2026-02-15')).toBe(false);
    expect(inativaDesdeValida('')).toBe(false);
    expect(primeiroDoMes('2026-02-15')).toBe('2026-02-01');
    expect(primeiroDoMes('')).toBe('');
  });
  it('I2 a data vai ao escritor só com a conta inativa; ativa = nulo', () => {
    const f = formI({ ...base, ativa: false, inativa_desde: '2026-02-01' }, '');
    expect(f.inativaDesde).toBe('2026-02-01');
    expect(dadosI(f).inativa_desde).toBe('2026-02-01');
    expect(dadosI({ ...f, ativa: true }).inativa_desde).toBeNull();
  });
  it('I3 inativar sem data (ou dia ≠ 1) falta; a conta nova inativa falta', () => {
    const f = formI(base, '');
    expect(faltasI({ ...f, ativa: false, inativaDesde: '' }, false)).toContain('desde quando a conta está inativa (dia 1º de um mês)');
    expect(faltasI({ ...f, ativa: false, inativaDesde: '2026-02-01' }, false)).not.toContain('desde quando a conta está inativa (dia 1º de um mês)');
    expect(faltasI({ ...formI(null, 'f1'), nome: 'X', codigo: '05', ativa: false, saldoEm: '2026-01-01', saldoInicial: 0 }, true))
      .toContain('a conta nova nasce ativa (inative depois de criada)');
  });
  it('I4 a prévia lida: confere = a frase do saldo; recusa = a frase do banco; a lista no title; fora do contrato = nulo', () => {
    const ok = lerPreviaInativar({ pode: true, frase: null, desde: '2026-02-01', mes_do_saldo: '2026-01', saldo: 0, tem_saldo: true, abertos: 0, realizados: 0, extrato: 0, lancamentos: [] });
    expect(ok && fraseDaPreviaInativar(ok)).toMatch(/^Confere: saldo R\$\s0,00 no fim de 01\/2026 · nenhum lançamento nem extrato a partir de 01\/02\/2026\.$/);
    const nao = lerPreviaInativar({ pode: false, frase: 'A conta tem 2 lançamento(s)…', desde: '2026-02-01', mes_do_saldo: '2026-01', saldo: '0', abertos: 2,
      lancamentos: [{ dia: '2027-09-01', valor: '-22719.29', status: 'programado', descricao: 'Parcela' }] });
    expect(nao?.abertos).toBe(2);
    expect(nao && fraseDaPreviaInativar(nao)).toBe('A conta tem 2 lançamento(s)…');
    expect(nao && listaDaPreviaInativar(nao)).toMatch(/\n01\/09\/2027 · -R\$\s22\.719,29 · programado · Parcela$/);
    expect(lerPreviaInativar({ pode: 'sim' })).toBeNull();
    expect(lerPreviaInativar(null)).toBeNull();
  });
});

/* CONTAS-BANCARIAS-LISTA-01 (mock 26/11) — a régua nova da lista: Banco = código + nome; Agência e Conta próprias; sem dado = "—";
   Situação com "Inativa desde"; rodapé por tipo; a Fazenda e a Agência somem estreitando; a busca acha agência e conta */
import {
  agenciaNaLista, bancoNaLista, colunasDaListaEscondidas, contaNaLista, filtrarContas as filtrarL, rodapeDosTipos, situacaoNaLista,
} from './contasBancarias';
import { linhasDaExportacao } from '@/components/financeiro-v2/ContasExportMenu';
describe('CONTAS-BANCARIAS-LISTA-01 — a lista', () => {
  const B = [{ codigo_banco: '001', nome_banco: 'Banco do Brasil S.A.', nome_curto: 'Banco do Brasil' }, { codigo_banco: '000', nome_banco: 'Dinheiro', nome_curto: 'Dinheiro' }];
  const k = (o: Record<string, unknown> = {}) => ({ id: 'k', nome_conta: 'BB', nome_exibicao: null, codigo_conta: '01', tipo_conta: 'cc', fazenda_id: 'f1', ativa: true,
    banco: 'Banco do Brasil', agencia: '0897', numero_conta: '25367', conta_digito: '7', mes_inicio: '2020-01', saldo_inicial_oficial: 0, ...o });
  it('L1 Banco = o código + o nome; caixa físico e permuta em cinza; sem banco = "—"', () => {
    expect(bancoNaLista(k(), B)).toEqual({ codigo: '001', nome: 'Banco do Brasil', cinza: false });
    expect(bancoNaLista(k({ banco: 'Dinheiro' }), B)).toEqual({ codigo: '', nome: 'Caixa físico', cinza: true });
    expect(bancoNaLista(k({ tipo_conta: 'permuta', banco: 'Permuta' }), B)).toEqual({ codigo: '', nome: 'Permuta', cinza: true });
    expect(bancoNaLista(k({ banco: null }), B)).toEqual({ codigo: '', nome: '—', cinza: true });
    /* banco do catálogo com código 000 que não é caixa ("Outros"): só o nome, sem o código */
    expect(bancoNaLista(k({ banco: 'Outros' }), [...B, { codigo_banco: '000', nome_banco: 'Outros', nome_curto: 'Outros' }])).toEqual({ codigo: '', nome: 'Outros', cinza: false });
  });
  it('L2 Agência e Conta: o número; sem dado = "—"; cartão = "final NNNN"', () => {
    expect([agenciaNaLista(k()), contaNaLista(k())]).toEqual(['0897', '25367-7']);
    expect([agenciaNaLista(k({ agencia: null })), contaNaLista(k({ numero_conta: null }))]).toEqual(['—', '—']);
    expect(contaNaLista(k({ tipo_conta: 'cartao', numero_conta: '4984 0000 0000 3146', conta_digito: null }))).toBe('final 3146');
    expect([agenciaNaLista(k({ banco: 'Dinheiro' })), contaNaLista(k({ banco: 'Dinheiro' }))]).toEqual(['—', '—']);
  });
  it('L3 Situação: Ativa · Inativa desde dd/mm/aaaa · Inativa', () => {
    expect(situacaoNaLista({ ativa: true, inativa_desde: null }).texto).toBe('Ativa');
    expect(situacaoNaLista({ ativa: false, inativa_desde: '2026-02-01' }).texto).toBe('Inativa desde 01/02/2026');
    expect(situacaoNaLista({ ativa: false, inativa_desde: null }).texto).toBe('Inativa');
  });
  it('L4 o rodapé por tipo; com filtro, "mostrando N de T"', () => {
    const todas = [k(), k({ id: 'b' }), k({ id: 'i', tipo_conta: 'inv' }), k({ id: 'c', tipo_conta: 'cartao' })];
    expect(rodapeDosTipos(todas, todas)).toBe('4 contas · 2 conta corrente · 1 investimento · 1 cartão');
    expect(rodapeDosTipos(todas.slice(0, 2), todas)).toBe('mostrando 2 de 4 · 2 conta corrente · 0 investimento · 0 cartão');
  });
  it('L5 estreitando, some a Fazenda e depois a Agência (com e sem a coluna Open Finance)', () => {
    expect([...colunasDaListaEscondidas(960, true)]).toEqual([]);
    expect([...colunasDaListaEscondidas(850, true)]).toEqual(['fazenda']);
    expect([...colunasDaListaEscondidas(700, true)].sort()).toEqual(['agencia', 'fazenda']);
    expect([...colunasDaListaEscondidas(850, false)]).toEqual([]);
    expect([...colunasDaListaEscondidas(574, true)].sort()).toEqual(['agencia', 'fazenda', 'openFinance']);
    expect([...colunasDaListaEscondidas(574, false)].sort()).toEqual(['agencia', 'fazenda']);
  });
  it('L6 a busca acha a agência e o número da conta', () => {
    const f = { segmento: 'todas' as const, fazendaId: null, mostrarInativas: false };
    expect(filtrarL([k()], { ...f, busca: '0897' }, B)).toHaveLength(1);
    expect(filtrarL([k()], { ...f, busca: '25367' }, B)).toHaveLength(1);
    expect(filtrarL([k()], { ...f, busca: '9999' }, B)).toHaveLength(0);
  });
  it('L7 a exportação sai com o mesmo texto da lista ("—" sem dado)', () => {
    expect(linhasDaExportacao([k({ agencia: null })], B, () => 'Administrativo')).toEqual([
      ['01', 'BB', 'Conta corrente', '001 Banco do Brasil', '—', '25367-7', 'Administrativo', 'Ativa']]);
  });
});
