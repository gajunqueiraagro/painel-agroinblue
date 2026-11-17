/**
 * OPENFINANCE-P3b — as regras da tela do extrato pelo Open Finance, com fixture SINTÉTICA (nenhuma chamada à Pluggy).
 */
import { describe, expect, it } from 'vitest';
import {
  conferirComSistema, contaSugerida, diaEHoraEmBrasilia, diasUteisEntre, extratoDoSistemaNoDia, fonteDaBusca, fraseDaConferencia, fraseDoCorte,
  lerBuscaDoBanco, nomeDaBusca, saldoBancoXSistema,
} from './extratoDoBanco';

const tx = (id: string, date: string, amount: number, status = 'POSTED') =>
  ({ id, accountId: 'acc', description: `MOV ${id}`, amount, date, status, type: amount < 0 ? 'DEBIT' : 'CREDIT', providerId: `p-${id}`, currencyCode: 'BRL' });
const corpo = (extra: Record<string, unknown> = {}) => ({
  ok: true, acao: 'buscar', de: '2026-11-14', ate: '2026-11-16', hoje: '2026-11-16', corte: '2026-11-14', ultimoDia: '2026-11-13',
  conta: { id: 'acc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 100, currencyCode: 'BRL', saldoEm: '2026-11-16T21:00:00.000Z' },
  transacoes: [tx('a', '2026-11-13T15:00:00Z', -5), tx('b', '2026-11-14T15:00:00Z', -10), tx('c', '2026-11-15T15:00:00Z', 20), tx('d', '2026-11-16T15:00:00Z', 7, 'PENDING')],
  saldoGravado: true, ...extra,
});

describe('a resposta da borda → a fonte da prévia', () => {
  it('lê o contrato e devolve a MESMA fonte do OFX, com o corte (o antes conta e não entra; pendente fica fora)', () => {
    const b = lerBuscaDoBanco(corpo());
    if (!b) throw new Error('nulo');
    const r = fonteDaBusca(b);
    if (r.ok === false) throw new Error(r.motivo);
    expect(r.fonte.formato).toBe('OPEN_FINANCE');
    expect(r.fonte.movimentos.map((m) => [m.data, m.valor, m.documento])).toEqual([['2026-11-14', -10, 'p-b'], ['2026-11-15', 20, 'p-c']]);
    expect(r.relatorio).toMatchObject({ antesDoCorte: 1, pendentes: 1, entram: 2 });
    expect(r.fonte.saldoDeclarado).toBe(100);
    expect(r.fonte.periodoDeclaradoInicio).toBe('2026-11-14');
  });
  it('a conferência NÃO aplica o corte (lê o período inteiro pedido)', () => {
    const b = lerBuscaDoBanco(corpo({ acao: 'conferir', de: '2026-11-01', ate: '2026-11-13' }));
    if (!b) throw new Error('nulo');
    const r = fonteDaBusca(b);
    if (r.ok === false) throw new Error(r.motivo);
    expect(r.relatorio.antesDoCorte).toBe(0);
    expect(r.fonte.movimentos.some((m) => m.data === '2026-11-13')).toBe(true);
  });
  it('fora do contrato = nulo; transação ilegível sai sozinha', () => {
    expect(lerBuscaDoBanco(corpo({ acao: 'apagar' }))).toBeNull();
    expect(lerBuscaDoBanco(corpo({ conta: null }))).toBeNull();
    expect(lerBuscaDoBanco(corpo({ de: '14/11/2026' }))).toBeNull();
    expect(lerBuscaDoBanco(corpo({ transacoes: 'x' }))).toBeNull();
    expect(lerBuscaDoBanco(corpo({ transacoes: [tx('a', '2026-11-14', -1), { id: 'x', amount: '1', date: '2026-11-14' }] }))?.transacoes).toHaveLength(1);
  });
  it('as frases do corte e o nome do lote', () => {
    expect(fraseDoCorte({ corte: '2026-11-14', ultimoDia: '2026-11-13', de: '2026-11-14' })).toBe('Corte: 14/11/2026 (o extrato no sistema vai até 13/11/2026; o antes não entra).');
    expect(fraseDoCorte({ corte: null, ultimoDia: null, de: '2026-08-18' })).toBe('Conta sem extrato no sistema: busquei desde 18/08/2026.');
    expect(nomeDaBusca('2026-11-16')).toBe('Open Finance · 16/11/2026');
  });
});

describe('a conferência (só leitura): banco × sistema por dia + valor', () => {
  const m = (data: string, valor: number) => ({ data, valor, tipo: valor < 0 ? 'debito' as const : 'credito' as const, descricao: 'x', documento: null });
  const s = (data: string, valor: number) => ({ data, valor, descricao: 'y' });
  it('casa um a um: dois iguais no mesmo dia casam com dois; o terceiro sobra', () => {
    const r = conferirComSistema([m('2026-11-03', -10), m('2026-11-03', -10), m('2026-11-03', -10), m('2026-11-04', 5)],
      [s('2026-11-03', -10), s('2026-11-03', -10), s('2026-11-05', 1)]);
    expect(r.casam).toBe(2);
    expect(r.soNoBanco.map((x) => [x.data, x.valor])).toEqual([['2026-11-03', -10], ['2026-11-04', 5]]);
    expect(r.soNoSistema.map((x) => [x.data, x.valor])).toEqual([['2026-11-05', 1]]);
  });
  it('o sinal conta e o centavo conta; o documento não', () => {
    const r = conferirComSistema([m('2026-11-03', 10), m('2026-11-03', -10.01)], [s('2026-11-03', -10), s('2026-11-03', -10.01)]);
    expect(r.casam).toBe(1);
    expect(r.soNoBanco).toHaveLength(1);
  });
  it('as frases', () => {
    expect(fraseDaConferencia({ casam: 3, outraData: [], soNoBanco: [], soNoSistema: [] }, '2026-11-01', '2026-11-13'))
      .toBe('01/11/2026 a 13/11/2026: os 3 movimentos do banco casam com o extrato do sistema. Nada a mais, nada a menos.');
    expect(fraseDaConferencia({ casam: 2, outraData: [], soNoBanco: [m('2026-11-01', 1)], soNoSistema: [] }, '2026-11-01', '2026-11-13'))
      .toBe('01/11/2026 a 13/11/2026: 2 casam · 1 só no banco · 0 só no sistema. Nada foi gravado.');
    expect(fraseDaConferencia({ casam: 39, outraData: [{ banco: m('2026-11-01', -1), sistema: s('2026-11-03', -1), diasUteis: 1 }], soNoBanco: [], soNoSistema: [s('2026-11-13', 1)] }, '2026-11-01', '2026-11-13'))
      .toBe('01/11/2026 a 13/11/2026: 39 casam (1 com outra data) · 0 só no banco · 1 só no sistema. Nada foi gravado.');
  });
});

describe('OF-CONFERIR-CASAMENTO-01 — a data do banco × a data do extrato (até 3 dias úteis depois)', () => {
  const m = (data: string, valor: number) => ({ data, valor, tipo: valor < 0 ? 'debito' as const : 'credito' as const, descricao: `banco ${data}`, documento: null });
  const s = (data: string, valor: number) => ({ data, valor, descricao: `extrato ${data}` });
  it('dias úteis: sáb 31/10 → ter 03/11 = 1 (dom, e seg 02/11 é Finados); sex 06 → qui 12 = 4; mesmo dia = 0; antes = -1', () => {
    expect(diasUteisEntre('2026-10-31', '2026-11-03')).toBe(1);
    expect(diasUteisEntre('2026-11-01', '2026-11-03')).toBe(1);
    expect(diasUteisEntre('2026-11-06', '2026-11-12')).toBe(4);
    expect(diasUteisEntre('2026-11-13', '2026-11-13')).toBe(0);
    expect(diasUteisEntre('2026-11-13', '2026-11-12')).toBe(-1);
    expect(diasUteisEntre('2026-11-19', '2026-11-23')).toBe(1);   // qui 19 → seg 23: sex 20 é Consciência Negra
  });
  it('o caso da Vera (01–13/11): os 5 Pix de dom 01/11 e do feriado 02/11 que o OFX lança na terça 03/11 casam com a outra data', () => {
    const banco = [m('2026-11-01', -6000), m('2026-11-01', -6000), m('2026-11-02', -6000), m('2026-11-02', -65000), m('2026-11-02', -1650), m('2026-11-03', -12.5)];
    const sistema = [s('2026-11-03', -6000), s('2026-11-03', -6000), s('2026-11-03', -6000), s('2026-11-03', -65000), s('2026-11-03', -1650), s('2026-11-03', -12.5)];
    const r = conferirComSistema(banco, sistema);
    expect(r.casam).toBe(6);
    expect(r.outraData).toHaveLength(5);
    expect(r.soNoBanco).toHaveLength(0);
    expect(r.soNoSistema).toHaveLength(0);
    expect(r.outraData.map((x) => [x.banco.data, x.sistema.data, x.banco.valor])[0]).toEqual(['2026-11-01', '2026-11-03', -6000]);
  });
  it('o extrato ANTES da data do banco nunca casa; mais de 3 dias úteis não casa', () => {
    expect(conferirComSistema([m('2026-11-05', -10)], [s('2026-11-04', -10)]).casam).toBe(0);
    expect(conferirComSistema([m('2026-11-06', -10)], [s('2026-11-12', -10)]).casam).toBe(0);   // sex 06 → qui 12 = 4 úteis
    expect(conferirComSistema([m('2026-11-06', -10)], [s('2026-11-11', -10)]).casam).toBe(1);   // sex 06 → qua 11 = 3 úteis
  });
  it('o mesmo dia vem primeiro; depois o par MAIS PRÓXIMO; um a um', () => {
    const r = conferirComSistema([m('2026-11-03', -100), m('2026-10-30', -100), m('2026-11-01', -100)], [s('2026-11-03', -100), s('2026-11-03', -100)]);
    expect(r.casam).toBe(2);
    expect(r.outraData.map((x) => x.banco.data)).toEqual(['2026-11-01']);   // dom 01 (2 dias corridos) ganha da sex 30/10 (4)
    expect(r.soNoBanco.map((x) => x.data)).toEqual(['2026-10-30']);
  });
  it('o valor tem de ser igual ao centavo, com o sinal', () => {
    expect(conferirComSistema([m('2026-11-01', -10)], [s('2026-11-03', 10)]).casam).toBe(0);
    expect(conferirComSistema([m('2026-11-01', -10)], [s('2026-11-03', -10.01)]).casam).toBe(0);
  });
});

describe('saldo do banco × extrato do sistema (só aviso)', () => {
  it('o dia e a hora do banco em Brasília', () => {
    expect(diaEHoraEmBrasilia('2026-11-17T01:30:00.000Z')).toEqual({ dia: '2026-11-16', hora: '22:30' });
    expect(diaEHoraEmBrasilia('lixo')).toBeNull();
    expect(diaEHoraEmBrasilia(null)).toBeNull();
  });
  it('o sistema no fim do dia do banco = abertura do mês + linhas do mês até o dia; fora do mês ou sem abertura = nulo', () => {
    const linhas = [{ data: '2026-11-03', valor: -10 }, { data: '2026-11-16', valor: 5 }, { data: '2026-11-17', valor: 100 }, { data: '2026-10-31', valor: 999 }];
    expect(extratoDoSistemaNoDia(1000, '2026-11', linhas, '2026-11-16')).toBe(995);
    expect(extratoDoSistemaNoDia(1000, '2026-10', linhas, '2026-11-16')).toBeNull();
    expect(extratoDoSistemaNoDia(null, '2026-11', linhas, '2026-11-16')).toBeNull();
    expect(extratoDoSistemaNoDia(1000, '2026-11', linhas, null)).toBeNull();
  });
  it('diverge a partir de R$ 0,01; sem sistema não diverge (é "—")', () => {
    expect(saldoBancoXSistema(100, 100.004)).toMatchObject({ diferenca: 0, diverge: false });
    expect(saldoBancoXSistema(100, 99.99)).toMatchObject({ diferenca: 0.01, diverge: true });
    expect(saldoBancoXSistema(100, null)).toMatchObject({ diferenca: null, diverge: false });
  });
});

describe('a sugestão da conta do sistema pelo final', () => {
  const c = (id: string, numero: string | null, digito: string | null, tipo = 'cc', ativa = true) => ({ id, numero_conta: numero, conta_digito: digito, tipo_conta: tipo, ativa });
  it('nº + dígito termina no final 7225 → sugere; empate, cartão, inativa ou nenhum = sem sugestão', () => {
    expect(contaSugerida('7225', [c('itau', '3722', '5'), c('bb', '1234', '0')])).toBe('itau');
    expect(contaSugerida('7225', [c('itau', '3722', '5'), c('outra', '9-37225', null)])).toBeNull();
    expect(contaSugerida('7225', [c('cartao', '3722', '5', 'cartao')])).toBeNull();
    expect(contaSugerida('7225', [c('velha', '3722', '5', 'cc', false)])).toBeNull();
    expect(contaSugerida(null, [c('itau', '3722', '5')])).toBeNull();
  });
});

