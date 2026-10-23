/**
 * PR 4 — o MODAL DE ANÁLISE da Visão Geral (o banco é falso: devolve uma `fn_vg_analise` pronta e guarda cada pedido).
 *   A1 abre na aba e no nível clicados: o pedido leva lado, aba, foco e mês; a aba fica marcada
 *   A2 a tela não soma: valor, meta, Dif. R$, %, KPIs e o centro do donut são os do banco, escritos; sem meta → "—"
 *   A3 critério e unidade vão ao banco; a unidade que não vale fica apagada; a que o novo foco não aceita volta para R$
 *   A4 navegação: linha da direita → item do gráfico; ‹ › → o irmão seguinte; caminho → aba; esquerda → foco
 *   A5 "N lanç. ›" só registra a intenção (não pede nada ao banco nem troca o gráfico)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));

import { ModalAnaliseVG } from './ModalAnaliseVG';
import type { AnaliseVG, LinhaAnaliseVG } from '@/lib/financeiro/visaoGeralAnalise';

const linha = (caminho: (string | null)[], rotulo: string, valor: number | null, meta: number | null, extra: Partial<LinhaAnaliseVG> = {}): LinhaAnaliseVG => ({
  caminho, rotulo, grupo: caminho[0] ?? null, valor, meta, dif: meta == null || valor == null ? null : Math.round((valor - meta) * 100) / 100,
  pct: meta ? 12.3 : null, razao: meta ? 1.123 : null, qtd: 7, unidade_valida: true, faixa: meta ? 'risco' : null, ...extra,
});
const ANALISE: AnaliseVG = {
  lado: 'saida', mes: '2026-09', criterio: 'mes', unidade: 'rs', meses_janela: 1, periodo: { de: '2026-01', ate_mes: '2026-09' },
  abas: [{ grupo: 'Custeio', rotulo: 'Custeio' }, { grupo: 'Juros', rotulo: 'Juros' }],
  unidades: [{ id: 'rs', rotulo: 'R$', valida: true }, { id: 'rs_cab', rotulo: 'R$/cab/mês', valida: true }, { id: 'rs_ha_agri', rotulo: 'R$/ha agricultura', valida: false }],
  resumo: { ...linha(['Custeio'], 'Custeio', 773404.73, 700000), valor_rs: 773404.73, pct_da_raiz: 61.2,
    fatias: [{ caminho: ['Custeio', 'pecuaria'], rotulo: 'Pecuária', grupo: 'Custeio', pct: 90 }, { caminho: ['Custeio', 'agricultura'], rotulo: 'Agricultura', grupo: 'Custeio', pct: 10 }] },
  tabela: { total: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    linhas: [linha(['Custeio', 'pecuaria'], 'Pecuária', 754685.64, null), linha(['Custeio', 'agricultura'], 'Agricultura', 18719.09, 20000)] },
  foco: { total: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    linhas: [linha(['Custeio', 'pecuaria'], 'Pecuária', 754685.64, null), linha(['Custeio', 'agricultura'], 'Agricultura', 18719.09, 20000)] },
  grafico: {
    item: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    caminho: [{ caminho: [], rotulo: 'Saídas' }, { caminho: ['Custeio'], rotulo: 'Custeio' }],
    irmaos: [['Custeio'], ['Juros']],
    serie: [{ am: '2026-08', realizado: 600000, previsto: 0, total: 600000, media: 600000, meta: 700000 },
            { am: '2026-09', realizado: 773404.73, previsto: 0, total: 773404.73, media: 686702.37, meta: 700000 }],
    kpis: { mes: 773404.73, media: 686702.37, vs_meta: 10.5, tendencia: 28.9 },
  },
};
const CTX = { clienteId: 'cli', de: '2026-01-01', ate: '2026-12-31', contas: null, fazendas: null, atividade: null, hoje: '2026-10-23', status: ['previsto'], incluirVencidos: true };

let resposta: AnaliseVG = ANALISE;
beforeEach(() => { (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} }; rpc.mockReset(); resposta = ANALISE; rpc.mockImplementation(async () => ({ data: resposta, error: null })); });
const ultimo = () => rpc.mock.calls[rpc.mock.calls.length - 1][1];
const abrir = async (grupo: string | null = 'Custeio', onLanc = vi.fn()) => {
  render(<ModalAnaliseVG alvo={{ lado: 'saida', grupo, am: '2026-09' }} ctx={CTX} rotuloContas="Caixa + cartões" onFechar={() => {}} onLancamentos={onLanc} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return onLanc;
};

describe('modal de análise', () => {
  it('A1 abre na aba e no nível clicados', async () => {
    await abrir('Custeio');
    expect(rpc).toHaveBeenCalledWith('fn_vg_analise', expect.objectContaining({ p_lado: 'saida', p_aba: 'Custeio', p_foco: ['Custeio'], p_grafico: null, p_mes: '2026-09',
      p_criterio: 'mes', p_unidade: 'rs', p_status: ['previsto'], p_incluir_vencidos: true }));
    expect(screen.getByTestId('analise-aba-Custeio').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('analise-aba-raiz').getAttribute('aria-pressed')).toBe('false');
  });

  it('A2 os números são os do banco; sem meta → —', async () => {
    await abrir();
    expect(screen.getByTestId('analise-resumo-valor').textContent).toBe('R$ 773.404,73');
    expect(screen.getByTestId('analise-resumo-meta').textContent).toBe('R$ 700.000,00');
    expect(screen.getByTestId('analise-donut-centro').textContent).toBe('61,2%');
    expect(screen.getByTestId('analise-kpi-media').textContent).toBe('R$ 686.702,37');
    expect(screen.getByTestId('analise-kpi-tendencia').textContent).toBe('+28,9%');
    const pec = screen.getByTestId('analise-tabela-linha-0');
    expect(pec.textContent).toContain('R$ 754.685,64');
    expect(within(pec).getAllByText('—').length).toBe(3); /* meta, Dif. R$ e % */
    expect(screen.getByTestId('analise-tabela-linha-1').textContent).toContain('−R$ 1.280,91');
    expect(screen.getByTestId('analise-lanc-0').textContent).toBe('7 lanç. ›');
  });

  it('A3 critério e unidade vão ao banco; a que não vale fica apagada', async () => {
    await abrir();
    fireEvent.click(within(screen.getByTestId('analise-tabela')).getByText('Média'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_criterio: 'media' });
    fireEvent.click(screen.getByTestId('analise-unidade'));
    expect((screen.getByTestId('analise-unidade-rs_ha_agri') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('analise-unidade-rs_cab'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_unidade: 'rs_cab', p_criterio: 'media' });
    /* o novo foco não aceita a unidade: volta para R$ */
    resposta = { ...ANALISE, unidades: ANALISE.unidades.map((u) => (u.id === 'rs_cab' ? { ...u, valida: false } : u)) };
    fireEvent.click(screen.getByTestId('analise-aba-raiz'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_unidade: 'rs', p_aba: null, p_foco: [] });
  });

  it('A4 navegação', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('analise-foco-linha-1'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_grafico: ['Custeio', 'agricultura'] });
    fireEvent.click(screen.getByTestId('analise-proximo'));
    await act(async () => { await Promise.resolve(); });
    /* os irmãos do banco são [Custeio], [Juros]: o item (agricultura) não está entre eles → anda a partir do 1º */
    expect(ultimo().p_grafico).toEqual(['Juros']);
    fireEvent.click(screen.getByTestId('analise-caminho-0'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_aba: null, p_foco: [], p_grafico: null });
    fireEvent.click(screen.getByTestId('analise-tabela-linha-0'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_foco: ['Custeio', 'pecuaria'], p_grafico: null });
    fireEvent.click(screen.getByTestId('analise-descer-1'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_foco: ['Custeio', 'agricultura'] });
  });

  it('A5 "N lanç. ›" só registra a intenção', async () => {
    const onLanc = await abrir();
    const n = rpc.mock.calls.length;
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await act(async () => { await Promise.resolve(); });
    expect(onLanc).toHaveBeenCalledWith(['Custeio', 'agricultura'], expect.objectContaining({ aba: 'Custeio' }));
    expect(rpc.mock.calls.length).toBe(n);
    expect(screen.getByTestId('modal-analise').getAttribute('data-intencao-lancamentos')).toBe('["Custeio","agricultura"]');
  });
});
