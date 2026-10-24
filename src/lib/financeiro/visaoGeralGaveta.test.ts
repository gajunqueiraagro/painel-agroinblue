/**
 * FIN-VISAO-GERAL-01 PR 5 — a gaveta (lib): o pedido ao banco e os filtros da lista de Lançamentos.
 *   F1 o pedido leva o nó, a janela (mês e critério), o recorte da tela e a página (500 por página)
 *   F2 recarregar relê as páginas já abertas e junta as linhas na ordem (as linhas são do banco)
 *   F3 os filtros da lista: tipo, anos e meses da janela (inclusive a que vira o ano), status com o realizado, conta e fazenda só
 *      quando são UMA, atividade, centro e subcentro do caminho
 *   F4 o nó de transferências abre a lista no tipo "3-Transferências", sem centro nem subcentro (lá a transferência não tem)
 *   F5 os avisos do rodapé: só na folha; várias contas, vencidos de antes da janela e transferências entre as contas, na ordem; nada → []
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { AVISOS_DA_LISTA, avisosDaLista, carregarGavetaVG, filtrosDaLista, recarregarGavetaVG } from './visaoGeralGaveta';

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
      tipo: '2-Saídas', anos: ['2025', '2026'], meses: ['01', '02', '11', '12'], status: ['realizado', 'previsto', 'agendado'],
      fazendaId: 'f1', contaId: 'c1', atividade: 'pecuaria', centro: 'Nutrição', subcentro: 'Sal' });
    const f = filtrosDaLista({ ...CTX, contas: ['c1', 'c2'], fazendas: null, atividade: 'pecuaria' }, { lado: 'entrada', janela: { de: '2026-02-01', ate: '2026-02-28' } }, []);
    expect(f).toMatchObject({ tipo: '1-Entradas', anos: ['2026'], meses: ['02'], contaId: null, fazendaId: null, atividade: 'pecuaria', centro: null, subcentro: null });
  });

  it('F4 o nó de transferências', () => {
    const f = filtrosDaLista(CTX, { lado: 'saida', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Outras saídas', null, 'Transferências para outras contas', null]);
    expect(f).toMatchObject({ tipo: '3-Transferências', atividade: null, centro: null, subcentro: null, contaId: 'c1' });
    const e = filtrosDaLista(CTX, { lado: 'entrada', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Outras entradas', null, 'Transferências de outras contas', null]);
    expect(e.tipo).toBe('3-Transferências');
    /* um centro de nome parecido COM atividade não é o nó de transferências */
    expect(filtrosDaLista(CTX, { lado: 'saida', janela: { de: '2026-09-01', ate: '2026-09-30' } }, ['Custeio', 'pecuaria', 'Transferências para outras contas', 'X']).tipo).toBe('2-Saídas');
  });

  it('F5 os avisos', () => {
    const folha = (v: number, t: number) => ({ folha: true, lista: { vencidos_fora: v, transf_internas: t } });
    expect(avisosDaLista({ contas: ['c1'] }, folha(0, 0))).toEqual([]);
    expect(avisosDaLista({ contas: null }, folha(0, 0))).toEqual([]);
    expect(avisosDaLista({ contas: ['c1', 'c2'] }, { folha: false, lista: null })).toEqual([]);
    expect(avisosDaLista({ contas: ['c1'] }, null)).toEqual([]);
    expect(avisosDaLista({ contas: ['c1', 'c2'] }, folha(0, 0))).toEqual([AVISOS_DA_LISTA.contas]);
    expect(avisosDaLista({ contas: null }, folha(3, 0))).toEqual([AVISOS_DA_LISTA.vencidos]);
    expect(avisosDaLista({ contas: null }, folha(0, 6))).toEqual([AVISOS_DA_LISTA.transferencias]);
    expect(avisosDaLista({ contas: ['a', 'b'] }, folha(1, 2))).toEqual([AVISOS_DA_LISTA.contas, AVISOS_DA_LISTA.vencidos, AVISOS_DA_LISTA.transferencias]);
  });
});
