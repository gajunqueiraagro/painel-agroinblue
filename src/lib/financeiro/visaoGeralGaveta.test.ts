/**
 * FIN-VISAO-GERAL-01 PR 5 — a gaveta (lib): o pedido ao banco e os filtros da lista de Lançamentos.
 *   F1 o pedido leva o nó, a janela (mês e critério), o recorte da tela e a página (500 por página)
 *   F2 recarregar relê as páginas já abertas e junta as linhas na ordem (as linhas são do banco)
 *   F3 os filtros da lista: tipo, anos e meses da janela (inclusive a que vira o ano), status com o realizado, conta e fazenda só
 *      quando são UMA, atividade, centro e subcentro do caminho
 *   F4 o nó de transferências abre a lista no tipo "3-Transferências", sem centro nem subcentro (lá a transferência não tem); a
 *      conta vai pelo LADO: saída em Conta Origem, entrada (inclusive a transferência recebida) em CONTA DESTINO (PR 5b)
 *   F5 os avisos do rodapé: só na folha; várias contas, vencidos movidos, transferências entre as contas e a virada do ano, na ordem;
 *      nada → []
 *   F6 a virada do ano (PR 5b): a frase com os meses do caso (nov/25–fev/26 → jan–fev/25 e nov–dez/26); mesmo ano → sem frase; a
 *      janela de mais de um ano e a que não sobra nada
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { AVISOS_DA_LISTA, avisoDaViradaDeAno, avisosDaLista, carregarGavetaVG, filtrosDaLista, recarregarGavetaVG } from './visaoGeralGaveta';

const CTX = { clienteId: 'cli', de: '2025-11-01', ate: '2026-10-31', contas: ['c1'], fazendas: ['f1'], atividade: null, hoje: '2026-10-23',
  status: ['previsto', 'agendado'], comVencidos: false };
const P = { lado: 'saida' as const, caminho: ['Custeio', 'pecuaria', 'Nutrição', 'Sal'], am: '2026-02', criterio: 'acumulado' as const };

beforeEach(() => { rpc.mockReset(); rpc.mockImplementation(async (_: string, a: any) => ({ data: { pagina: a.p_pagina, linhas: [`p${a.p_pagina}`] }, error: null })); });

describe('gaveta (lib)', () => {
  it('F1 o pedido', async () => {
    await carregarGavetaVG(CTX, P, 3);
    expect(rpc).toHaveBeenCalledWith('fn_vg_gaveta', {
      p_cliente: 'cli', p_de: '2025-11-01', p_ate: '2026-10-31', p_mes: '2026-02', p_lado: 'saida', p_caminho: P.caminho, p_criterio: 'acumulado',
      p_contas: ['c1'], p_fazendas: ['f1'], p_atividade: null, p_hoje: '2026-10-23', p_status: ['previsto', 'agendado'], p_incluir_vencidos: false,
      p_pagina: 3, p_por_pagina: 500 });
  });

  it('F2 recarregar relê as páginas abertas', async () => {
    const g = await recarregarGavetaVG(CTX, P, 3);
    expect(rpc.mock.calls.map((c) => c[1].p_pagina)).toEqual([1, 2, 3]);
    expect(g.linhas).toEqual(['p1', 'p2', 'p3']);
    expect(g.pagina).toBe(3);
  });

  it('F3 os filtros da lista', () => {
    expect(filtrosDaLista(CTX, { lado: 'saida', janela: { de: '2025-11-01', ate: '2026-02-28' } }, P.caminho)).toEqual({
      tipo: '2-Saídas', anos: ['2025', '2026'], meses: ['01', '02', '11', '12'], status: ['realizado', 'conciliado_real', 'previsto', 'agendado'],
      fazendaId: 'f1', contaId: 'c1', contaDestinoId: null, atividade: 'pecuaria', centro: 'Nutrição', subcentro: 'Sal' });
    const f = filtrosDaLista({ ...CTX, contas: ['c1', 'c2'], fazendas: null, atividade: 'pecuaria' }, { lado: 'entrada', janela: { de: '2026-02-01', ate: '2026-02-28' } }, []);
    expect(f).toMatchObject({ tipo: '1-Entradas', anos: ['2026'], meses: ['02'], contaId: null, contaDestinoId: null, fazendaId: null, atividade: 'pecuaria', centro: null, subcentro: null });
  });

  it('F4 o nó de transferências', () => {
    const f = filtrosDaLista(CTX, { lado: 'saida', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Outras saídas', null, 'Transferências para outras contas', null]);
    expect(f).toMatchObject({ tipo: '3-Transferências', atividade: null, centro: null, subcentro: null, contaId: 'c1', contaDestinoId: null });
    const e = filtrosDaLista(CTX, { lado: 'entrada', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Outras entradas', null, 'Transferências de outras contas', null]);
    expect(e).toMatchObject({ tipo: '3-Transferências', centro: null, subcentro: null, contaId: null, contaDestinoId: 'c1' });
    /* a entrada comum também: a conta da entrada mora em conta_destino_id */
    expect(filtrosDaLista(CTX, { lado: 'entrada', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Receitas operacionais', 'pecuaria', 'Abates', 'Abates de Fêmeas']))
      .toMatchObject({ tipo: '1-Entradas', contaId: null, contaDestinoId: 'c1', centro: 'Abates', subcentro: 'Abates de Fêmeas' });
    /* um centro de nome parecido COM atividade não é o nó de transferências */
    expect(filtrosDaLista(CTX, { lado: 'saida', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Custeio', 'pecuaria', 'Transferências para outras contas', 'X']).tipo).toBe('2-Saídas');
  });

  it('F5 os avisos', () => {
    const folha = (v: number, t: number, janela = { de: '2026-09-01', ate: '2026-09-30' }) => ({ folha: true, janela, lista: { vencidos_fora: v, transf_internas: t } });
    expect(avisosDaLista({ contas: ['c1'] }, folha(0, 0))).toEqual([]);
    expect(avisosDaLista({ contas: null }, folha(0, 0))).toEqual([]);
    expect(avisosDaLista({ contas: ['c1', 'c2'] }, { folha: false, lista: null, janela: { de: '2025-11-01', ate: '2026-02-28' } })).toEqual([]);
    expect(avisosDaLista({ contas: ['c1'] }, null)).toEqual([]);
    expect(avisosDaLista({ contas: ['c1', 'c2'] }, folha(0, 0))).toEqual([AVISOS_DA_LISTA.contas]);
    expect(avisosDaLista({ contas: null }, folha(3, 0))).toEqual([AVISOS_DA_LISTA.vencidos]);
    expect(avisosDaLista({ contas: null }, folha(0, 6))).toEqual([AVISOS_DA_LISTA.transferencias]);
    expect(avisosDaLista({ contas: ['a', 'b'] }, folha(1, 2))).toEqual([AVISOS_DA_LISTA.contas, AVISOS_DA_LISTA.vencidos, AVISOS_DA_LISTA.transferencias]);
    const virada = folha(1, 0, { de: '2025-11-01', ate: '2026-02-28' });
    expect(avisosDaLista({ contas: null }, virada)).toEqual([AVISOS_DA_LISTA.vencidos, avisoDaViradaDeAno(virada.janela)]);
    /* 5ª: o pagamento da fatura do cartão (111949) — depois das 4, sozinha ou com as outras; 0 ou ausente (banco antigo) = nada */
    const fatura = (f: number | undefined, janela = { de: '2026-10-01', ate: '2026-10-31' }) => ({ folha: true, janela, lista: { vencidos_fora: 0, transf_internas: 0, faturas_cartao: f } });
    expect(avisosDaLista({ contas: ['c1'] }, fatura(1))).toEqual([AVISOS_DA_LISTA.fatura]);
    expect(avisosDaLista({ contas: ['c1'] }, fatura(0))).toEqual([]);
    expect(avisosDaLista({ contas: ['c1'] }, fatura(undefined))).toEqual([]);
    const tudo = { ...fatura(2, { de: '2025-11-01', ate: '2026-02-28' }), lista: { vencidos_fora: 1, transf_internas: 3, faturas_cartao: 2 } };
    expect(avisosDaLista({ contas: ['a', 'b'] }, tudo)).toEqual([AVISOS_DA_LISTA.contas, AVISOS_DA_LISTA.vencidos, AVISOS_DA_LISTA.transferencias,
      avisoDaViradaDeAno(tudo.janela), AVISOS_DA_LISTA.fatura]);
    expect(AVISOS_DA_LISTA.fatura).toBe('A lista mostra o pagamento da fatura como transferência; aqui não entra (a compra já foi a saída).');
  });

  it('F6 a virada do ano', () => {
    expect(avisoDaViradaDeAno({ de: '2025-11-01', ate: '2026-02-28' }))
      .toBe('A lista filtra por ano e mês: o período nov/25–fev/26 traz também jan–fev/25 e nov–dez/26.');
    expect(avisoDaViradaDeAno({ de: '2026-01-01', ate: '2026-09-30' })).toBeNull();
    expect(avisoDaViradaDeAno({ de: '2026-09-01', ate: '2026-09-30' })).toBeNull();
    expect(avisoDaViradaDeAno({ de: '2025-12-01', ate: '2026-01-31' }))
      .toBe('A lista filtra por ano e mês: o período dez/25–jan/26 traz também jan/25 e dez/26.');
    /* três anos: o do meio tem todos os meses; os das pontas, o que sobra */
    expect(avisoDaViradaDeAno({ de: '2024-11-01', ate: '2026-02-28' }))
      .toBe('A lista filtra por ano e mês: o período nov/24–fev/26 traz também jan–out/24 e mar–dez/26.');
    /* jan/25–dez/26: os meses cobrem os dois anos inteiros, nada sobra */
    expect(avisoDaViradaDeAno({ de: '2025-01-01', ate: '2026-12-31' })).toBeNull();
  });
});
