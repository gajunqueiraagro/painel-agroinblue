/**
 * CAD-CONTAS-BANCARIAS-01 — a lista e o formulario da conta bancaria (logica pura).
 *   K1 celulas: vazio "não inf."/"não informado" (cinza), caixa fisico "não se aplica", sem saldo/inicio em ambar, banco "341 Itaú"
 *   K2 filtros: busca por conta, banco (nome e codigo) e gerente, sem acento; segmento; fazenda; inativas
 *   K3 faixas na ordem CC · INV · Cartao (caixa e tipo estranho em CC), pelo codigo (empate: o nome); rodape "N contas · N ativas" e a soma
 *   K4 so' o que mudou vai ao banco: nada mudou = {}; saldo; caixa = cc + banco Dinheiro; "Sem extrato" e' a marca; conta e digito
 *   K5 larguras: somem Telefone e Inicio, depois Gerente e Agencia, depois Fazenda
 *   K6 conta nova exige a data e o saldo inicial
 */
import { describe, it, expect } from 'vitest';
import {
  celulaAgencia, celulaBanco, celulaConta, celulaGerente, celulaInicio, celulaSaldo, celulaTelefone, colunasEscondidas, faixasDaLista,
  faltasDoFormulario, filtrarContas, formularioDaConta, mudancas, mudaOSaldoInicial, rodapeDaLista, subtituloDaConta,
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
    expect(r.texto).toBe('6 contas · 5 ativas');
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
    expect(faltasDoFormulario(vazio, true)).toEqual(['o nome da conta', 'a data do saldo', 'o saldo inicial']);
    expect(faltasDoFormulario({ ...vazio, nome: 'X', saldoEm: '2026-01-01', saldoInicial: 0 }, true)).toEqual([]);
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

