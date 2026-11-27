// CONTAS-OF-LINHA-01 — os 5 estados da coluna "Open Finance" de Contas bancárias (sintético).
import { describe, expect, it } from 'vitest';
import { bancoDaConta, estadoNaLinha, finaisDaConta, FRASE_CARTAO_EM_BREVE, FRASE_INVESTIMENTO_SEM_OF, itemPedeOTitular, linkVivo, textoDoEstado } from './openfinanceNaLinha';
import type { EventoDaFila } from './openfinanceTela';

const BANCOS = [
  { codigo_banco: '748', nome_banco: 'Sicredi', nome_curto: 'Sicredi' },
  { codigo_banco: '001', nome_banco: 'Banco do Brasil', nome_curto: 'BB' },
  { codigo_banco: '000', nome_banco: 'Dinheiro', nome_curto: 'Dinheiro' },
  { codigo_banco: '000', nome_banco: 'Outros', nome_curto: 'Outros' },
  { codigo_banco: '104', nome_banco: 'Caixa Econômica Federal', nome_curto: 'Caixa' },
];
const conta = (id: string, banco: string | null, tipo_conta: string | null = 'cc') => ({ id, banco, tipo_conta });
const ev = (evento: string, item_id: string, recebido_em: string): EventoDaFila =>
  ({ evento, item_id, cliente_id: 'c1', client_user_id: 'c1', connector_id: '601', recebido_em });
const AGORA = '2031-11-23T12:00:00.000Z';
const vazio = { bancos: BANCOS, permitidas: [], saldos: [], eventos: [], convites: [], agoraIso: AGORA };

describe('quem é conta de BANCO (a regra da coluna Banco)', () => {
  it('banco da lista com código ≠ 000; caixa físico, permuta, virtual, Pessoal, Dinheiro e sem banco = não', () => {
    expect(bancoDaConta(conta('a', 'Sicredi'), BANCOS)?.codigo_banco).toBe('748');
    expect(bancoDaConta(conta('a', 'BB', 'cartao'), BANCOS)?.codigo_banco).toBe('001');
    expect(bancoDaConta(conta('a', 'Caixa'), BANCOS)?.codigo_banco).toBe('104');   // a Caixa Econômica É banco
    expect(bancoDaConta(conta('a', 'Dinheiro'), [...BANCOS, { codigo_banco: '999', nome_banco: 'x', nome_curto: 'Dinheiro' }])).toBeNull();   // caixa físico (BANCO_CAIXA), mesmo com código
    expect(bancoDaConta(conta('a', 'Permuta', 'permuta'), BANCOS)).toBeNull();
    expect(bancoDaConta(conta('a', 'Virtual'), BANCOS)).toBeNull();
    expect(bancoDaConta(conta('a', 'Pessoal'), BANCOS)).toBeNull();
    expect(bancoDaConta(conta('a', 'Dinheiro'), BANCOS)).toBeNull();          // código 000
    expect(bancoDaConta(conta('a', 'Outros'), BANCOS)).toBeNull();            // código 000 que não é o caixa físico
    expect(bancoDaConta(conta('a', null), BANCOS)).toBeNull();
  });
});

describe('os 5 estados', () => {
  it('—, Conectar, Link enviado', () => {
    expect(estadoNaLinha(conta('a', 'Virtual'), vazio)).toEqual({ tipo: 'nao_se_aplica' });
    expect(estadoNaLinha(conta('a', 'Sicredi'), vazio)).toEqual({ tipo: 'conectar' });
    const convites = [{ expira_em: '2031-11-24T10:00:00Z', usado_em: null, revogado_em: null }];
    expect(estadoNaLinha(conta('a', 'Sicredi'), { ...vazio, convites })).toEqual({ tipo: 'link', ate: '2031-11-24T10:00:00Z' });
    expect(estadoNaLinha(conta('a', 'Virtual'), { ...vazio, convites })).toEqual({ tipo: 'nao_se_aplica' });   // link não vira "Conectar" fora de banco
  });
  it('Conectado (com a última leitura) e Reconectar (o último aviso do item pede o titular)', () => {
    const permitidas = [{ item_id: 'it1', conta_bancaria_id: 'a', final4: '3456', ativo: true }, { item_id: 'it1', conta_bancaria_id: 'b', final4: '1', ativo: false }];
    const saldos = [{ conta_bancaria_id: 'a', lido_em: '2031-11-23T09:00:00Z' }, { conta_bancaria_id: 'a', lido_em: '2031-11-23T10:40:00Z' }];
    const ok = [ev('item/created', 'it1', '2031-11-20T10:00:00Z'), ev('item/updated', 'it1', '2031-11-23T10:39:00Z')];
    expect(estadoNaLinha(conta('a', 'Sicredi'), { ...vazio, permitidas, saldos, eventos: ok }))
      .toEqual({ tipo: 'conectado', itemId: 'it1', atualizadoEm: '2031-11-23T10:40:00Z' });
    expect(estadoNaLinha(conta('b', 'Sicredi'), { ...vazio, permitidas, saldos, eventos: ok })).toEqual({ tipo: 'conectar' });   // desligada
    const ruim = [...ok, ev('item/login_error', 'it1', '2031-11-23T11:00:00Z')];
    expect(estadoNaLinha(conta('a', 'Sicredi'), { ...vazio, permitidas, saldos, eventos: ruim })).toEqual({ tipo: 'reconectar', itemId: 'it1' });
    const voltou = [...ruim, ev('item/login_succeeded', 'it1', '2031-11-23T11:30:00Z')];
    expect(estadoNaLinha(conta('a', 'Sicredi'), { ...vazio, permitidas, saldos, eventos: voltou }).tipo).toBe('conectado');
  });
  it('o aviso que não é de estado (transações, extrato lido) não decide; o de OUTRO item também não', () => {
    const e = [ev('item/waiting_user_input', 'it1', '2031-11-20T09:00:00Z'), ev('item/created', 'it1', '2031-11-20T10:00:00Z'),
      ev('transactions/created', 'it1', '2031-11-23T11:00:00Z'), ev('item/error', 'it2', '2031-11-23T11:10:00Z')];
    expect(itemPedeOTitular('it1', e)).toBe(false);
    expect(itemPedeOTitular('it2', e)).toBe(true);
  });
  it('link vivo: o usado, o revogado e o vencido não contam', () => {
    expect(linkVivo([{ expira_em: '2031-11-24T00:00:00Z', usado_em: '2031-11-23T01:00:00Z', revogado_em: null },
      { expira_em: '2031-11-24T00:00:00Z', usado_em: null, revogado_em: '2031-11-23T01:00:00Z' },
      { expira_em: '2031-11-23T11:59:00Z', usado_em: null, revogado_em: null }], AGORA)).toBeNull();
  });
});

describe('o texto da célula e os finais da conta', () => {
  const agora = new Date(2031, 10, 23, 12, 0);
  it('hoje = hh:mm; outro dia = dd/mm (a hora inteira no title); sem leitura = só "Conectado"', () => {
    expect(textoDoEstado({ tipo: 'conectado', itemId: 'i', atualizadoEm: new Date(2031, 10, 23, 7, 40).toISOString() }, agora).texto).toBe('● Conectado · 07:40');
    expect(textoDoEstado({ tipo: 'conectado', itemId: 'i', atualizadoEm: new Date(2031, 10, 22, 7, 5).toISOString() }, agora).texto).toBe('● Conectado · 22/11');
    expect(textoDoEstado({ tipo: 'conectado', itemId: 'i', atualizadoEm: new Date(2031, 10, 22, 7, 5).toISOString() }, agora).titulo).toContain('22/11 07:05');
    expect(textoDoEstado({ tipo: 'link', ate: new Date(2031, 10, 24, 18, 10).toISOString() }, agora).texto).toBe('Link enviado · 24/11');
    expect(textoDoEstado({ tipo: 'conectado', itemId: 'i', atualizadoEm: null }, agora).texto).toBe('● Conectado');
    expect(textoDoEstado({ tipo: 'reconectar', itemId: 'i' }, agora).texto).toBe('⚠ Reconectar');
    expect(textoDoEstado({ tipo: 'nao_se_aplica' }, agora).texto).toBe('—');
    expect(textoDoEstado({ tipo: 'em_breve' }, agora)).toEqual({ texto: 'em breve', titulo: FRASE_CARTAO_EM_BREVE });
    expect(textoDoEstado({ tipo: 'nao_se_aplica', motivo: 'investimento' }, agora)).toEqual({ texto: '—', titulo: FRASE_INVESTIMENTO_SEM_OF });
  });
  it('finais com e sem o dígito; curto demais = nada', () => {
    expect(finaisDaConta({ numero_conta: '25367', conta_digito: '7' })).toEqual(['3677', '5367']);
    expect(finaisDaConta({ numero_conta: '74.495', conta_digito: '6' })).toEqual(['4956', '4495']);
    expect(finaisDaConta({ numero_conta: '12', conta_digito: '3' })).toEqual([]);
    expect(finaisDaConta({ numero_conta: null, conta_digito: null })).toEqual([]);
  });
});

/* CONTAS-BANCARIAS-AJUSTES-01 (b) — "Conectar" só em conta corrente/poupança de banco; cartão = "Em breve"; investimento = "—" */
describe('o tipo da conta manda no Conectar', () => {
  const convites = [{ expira_em: '2031-11-24T10:00:00Z', usado_em: null, revogado_em: null }];
  it('cc de banco conecta; cartão de banco em breve; investimento e caixa —', () => {
    expect(estadoNaLinha(conta('a', 'Sicredi', 'cc'), vazio)).toEqual({ tipo: 'conectar' });
    expect(estadoNaLinha(conta('a', 'Sicredi', null), vazio)).toEqual({ tipo: 'conectar' });
    expect(estadoNaLinha(conta('a', 'BB', 'cartao'), vazio)).toEqual({ tipo: 'em_breve' });
    expect(estadoNaLinha(conta('a', 'BB', 'cartao'), { ...vazio, convites })).toEqual({ tipo: 'em_breve' });   // link vivo não vira "Link" no cartão
    expect(estadoNaLinha(conta('a', 'Sicredi', 'inv'), vazio)).toEqual({ tipo: 'nao_se_aplica', motivo: 'investimento' });
    expect(estadoNaLinha(conta('a', 'Dinheiro', 'cc'), vazio)).toEqual({ tipo: 'nao_se_aplica' });           // a cc-004 depois do conserto
    expect(estadoNaLinha(conta('a', 'Permuta', 'permuta'), vazio)).toEqual({ tipo: 'nao_se_aplica' });
  });
  it('ligada segue mostrando o estado da ligação, qualquer que seja o tipo', () => {
    const permitidas = [{ item_id: 'it1', conta_bancaria_id: 'k', final4: '1234', ativo: true }];
    expect(estadoNaLinha(conta('k', 'BB', 'cartao'), { ...vazio, permitidas }).tipo).toBe('conectado');
  });
});
