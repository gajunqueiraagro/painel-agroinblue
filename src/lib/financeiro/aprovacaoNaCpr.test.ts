// BPO-FUNCIONAR-01 — as etapas da CPR e o chip da coluna Aprovação (sintético).
import { describe, expect, it } from 'vitest';
import {
  chipDaAprovacao, contarEtapas, entraNaEtapa, etapaDaLinha, lancadoPorTexto, lerEstados, motivoSemSelecao, type AprovacaoDaLinha,
} from './aprovacaoNaCpr';

const est = (o: Partial<AprovacaoDaLinha> & { lancamentoId: string; estado: AprovacaoDaLinha['estado'] }): AprovacaoDaLinha => ({
  motivo: null, observacao: null, decididoPor: null, decididoEm: null, lancadoPor: null, lancadoEm: null, possoDecidir: false,
  temNota: false, temBoleto: false, forma: null, prontoPagar: null, ...o,
});
const linha = (id: string, status: string, tipo = '2-Saídas', valor = 100) => ({ id, status_transacao: status, tipo_operacao: tipo, valor });

describe('lerEstados', () => {
  it('tipa as linhas da fn_aprovacao_estados; estado desconhecido ou sem id sai', () => {
    const m = lerEstados([
      { lancamento_id: 'a', estado: 'aguardando', posso_decidir: true, tem_nota: true, lancado_por: 'u1', lancado_em: '2026-11-20T12:00:00Z' },
      { lancamento_id: 'b', estado: 'inventado' }, { estado: 'aprovado' }, 'lixo',
    ]);
    expect([...m.keys()]).toEqual(['a']);
    expect(m.get('a')).toMatchObject({ estado: 'aguardando', possoDecidir: true, temNota: true, temBoleto: false, lancadoPor: 'u1' });
    expect(lerEstados(null).size).toBe(0);
  });
});

describe('as etapas', () => {
  const e = new Map([
    ['ag', est({ lancamentoId: 'ag', estado: 'aguardando', possoDecidir: true })],
    ['agOutro', est({ lancamentoId: 'agOutro', estado: 'aguardando', possoDecidir: false })],
    ['ap', est({ lancamentoId: 'ap', estado: 'aprovado' })],
    ['rg', est({ lancamentoId: 'rg', estado: 'aprovado_regra' })],
    ['rc', est({ lancamentoId: 'rc', estado: 'recusado', motivo: 'valor errado' })],
    ['fo', est({ lancamentoId: 'fo', estado: 'fora' })],
  ]);
  it('aguardando = Para aprovar; aprovado (e pela regra) = Para pagar; Agendado/Realizado pelo status; recusado e fora só em Tudo', () => {
    expect(etapaDaLinha(linha('ag', 'programado'), e.get('ag'))).toBe('aprovar');
    expect(etapaDaLinha(linha('ap', 'programado'), e.get('ap'))).toBe('pagar');
    expect(etapaDaLinha(linha('rg', 'previsto'), e.get('rg'))).toBe('pagar');
    expect(etapaDaLinha(linha('ap', 'agendado'), e.get('ap'))).toBe('agendados');
    expect(etapaDaLinha(linha('ap', 'realizado'), e.get('ap'))).toBe('pagos');
    expect(etapaDaLinha(linha('rc', 'programado'), e.get('rc'))).toBeNull();
    expect(etapaDaLinha(linha('fo', 'programado'), e.get('fo'))).toBeNull();
    expect(etapaDaLinha(linha('x', 'programado', '1-Entradas'), undefined)).toBeNull();   // entrada nunca
  });
  it('o aprovador vê em "Para aprovar" só o que ELE pode decidir; os outros veem tudo o que aguarda', () => {
    expect(entraNaEtapa('aprovar', linha('agOutro', 'programado'), e.get('agOutro'), true)).toBe(false);
    expect(entraNaEtapa('aprovar', linha('agOutro', 'programado'), e.get('agOutro'), false)).toBe(true);
    expect(entraNaEtapa('tudo', linha('fo', 'programado'), e.get('fo'), true)).toBe(true);
  });
  it('contagens: n e R$ por etapa', () => {
    const ls = [linha('ag', 'programado', '2-Saídas', 1000), linha('agOutro', 'programado', '2-Saídas', 500), linha('ap', 'programado', '2-Saídas', -200),
      linha('rg', 'agendado'), linha('rc', 'programado')];
    const c = contarEtapas(ls, e, true);
    expect(c.aprovar).toEqual({ n: 1, total: 1000 });
    expect(c.pagar).toEqual({ n: 1, total: 200 });
    expect(c.agendados.n).toBe(1);
    expect(c.tudo.n).toBe(5);
    expect(contarEtapas(ls, e, false).aprovar).toEqual({ n: 2, total: 1500 });
  });
});

describe('o chip e quem lançou', () => {
  it('Aguardando · Sem documento · Aprovado · Aprovado · regra · Recusado (motivo no title) · —', () => {
    expect(chipDaAprovacao(est({ lancamentoId: 'a', estado: 'aguardando', temBoleto: true })).texto).toBe('Aguardando');
    expect(chipDaAprovacao(est({ lancamentoId: 'a', estado: 'aguardando' })).texto).toBe('Sem documento');
    expect(chipDaAprovacao(est({ lancamentoId: 'a', estado: 'aprovado' })).tom).toBe('aprovado');
    expect(chipDaAprovacao(est({ lancamentoId: 'a', estado: 'aprovado_regra' })).texto).toBe('Aprovado · regra');
    const r = chipDaAprovacao(est({ lancamentoId: 'a', estado: 'recusado', motivo: 'valor errado' }));
    expect([r.texto, r.titulo]).toEqual(['Recusado', 'Recusado: valor errado']);
    expect(chipDaAprovacao(undefined).texto).toBe('—');
  });
  it('"Amanda · 20/11"; sem autor = "—"; e-mail vira o nome antes do @', () => {
    expect(lancadoPorTexto('Amanda Exemplo', new Date(2026, 10, 20, 9, 14).toISOString())).toBe('Amanda · 20/11');
    expect(lancadoPorTexto('financeiro@exemplo.com', null)).toBe('financeiro');
    expect(lancadoPorTexto(null, null)).toBe('—');
  });
  it('por que não há caixa: não aguarda · quem lançou · não é o aprovador', () => {
    expect(motivoSemSelecao(est({ lancamentoId: 'a', estado: 'aprovado' }), false)).toBe('Só o que está aguardando se aprova');
    expect(motivoSemSelecao(est({ lancamentoId: 'a', estado: 'aguardando', possoDecidir: false }), true)).toBe('Quem lançou não aprova');
    expect(motivoSemSelecao(est({ lancamentoId: 'a', estado: 'aguardando', possoDecidir: false }), false)).toBe('Só quem aprova este cliente decide');
    expect(motivoSemSelecao(est({ lancamentoId: 'a', estado: 'aguardando', possoDecidir: true }), false)).toBeNull();
  });
});
