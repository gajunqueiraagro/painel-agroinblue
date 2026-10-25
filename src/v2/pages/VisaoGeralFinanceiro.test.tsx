/**
 * FIN-VISAO-GERAL-01 PR 3 — a tela "Visão Geral" (render-only).
 *   V1 A TELA NÃO SOMA (SPEC §7.4): o banco devolve totais, média, %, % do mês, vs média, resultado e saldos propositalmente "errados"
 *      (que não fecham com os meses) e a tela escreve EXATAMENTE esses — se ela somasse ou dividisse, o número mudaria
 *   V2 abre em Entradas × saídas, Ano e no mês vigente, e pede ao banco jan → o mês vigente (P100 item 6: o mês escolhido é o fim)
 *   V17 a grade ampliada com o cabeçalho e o resumo do mês (o mesmo modelo do PDF)
 *   V16 o gráfico ampliado com o painel do mês (do banco)
 *   V14 o critério escreve a série do banco (card e grade), sem novo pedido; V15 no acumulado, o saldo de cima é o do período
 *   V3 clicar num total ou grupo (grade ou card) abre o MODAL DE ANÁLISE (PR 4) no lado, na aba e no mês clicados
 *   V4 "Sem classificação" e "Transferências para outras contas" aparecem quando o banco as manda; o vencido marca o mês vigente
 *   V5 trocar o mês pela pílula pede ao banco o novo período (Ano: jan → o mês) e o card mostra o mês
 *   V18 P100 item 6 — o MÊS ESCOLHIDO É O FIM DO PERÍODO (o banco falso devolve só os meses pedidos, como o real): Ano com AGO →
 *       jan–ago (8 colunas na grade e no gráfico, nada depois); Últ. 12 → set/25–ago/26; 6 + 6 → inalterado (6 antes, 6 depois);
 *       DEZ (futuro) → jan–dez com nov e dez previstos; o modal abre com o mesmo período
 *   V19 P100 item 7 — a grade: cabeçalho preso em cima e "Resultado" + "Saldo final" CONGELADAS no rodapé (tfoot preso embaixo, fora
 *       do corpo que rola), com a borda de cima; as mesmas colunas (TOTAL, MÉDIA, %)
 *   V6 P79: os chips (a mesma peça da CPR) só REPASSAM ao banco: padrão os três status e vencidos; desligar Programado pede sem ele;
 *      desligar Vencidos pede p_incluir_vencidos = false
 *   V7 P79: o aviso do que ficou fora vem do ECO do banco (status / incluir_vencidos), não do estado da tela
 *   V8 P79: o card mostra "vencidos R$ x" no total do lado, do banco, só quando há
 *   V9 P82: a linha "Pagamento de cartão (transferência)" vem do banco e fica entre as saídas e o RESULTADO; não abre análise
 *   V10 P83: no card, os grupos sem valor no mês ficam numa linha só ("+ N grupos sem valor no mês"); no ampliado, todos à vista
 *   V11 P83: o MESMO "ampliar" nos três blocos abre o modal com o bloco inteiro (a grade sem rolagem)
 *   V12 P83: saldo SÓ por conta — com fazenda ou atividade o banco diz `sem_saldo` e nenhum saldo aparece (card, grade, legenda do
 *       gráfico); o aviso fica no lugar. A Safra saiu: o pedido não leva p_safra
 *   V13 P83: no TOTAL da grade, o saldo inicial e o saldo final DO PERÍODO vêm do banco (`total` das linhas de saldo) — propositalmente
 *       "errados" aqui, para provar que a grade não soma nem pega o 1º/último mês sozinha
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as renderCru, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));

import { VisaoGeralFinanceiro } from './VisaoGeralFinanceiro';
import { filtrosVG } from '@/lib/financeiro/visaoGeral';

const M = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
const z = (v: number | null = 0) => M.map(() => v);
const TELA = {
  mes_atual: '2026-02',
  meses: M.map((am) => ({ am, previsto: am > '2026-02', vigente: am === '2026-02' })),
  linhas: [
    { chave: 'saldo_inicial', tipo: 'saldo', rotulo: 'SALDO INICIAL', valores: M.map((_, i) => 1000 + i) },
    { chave: 'entrada:total::', tipo: 'total', lado: 'entrada', rotulo: 'ENTRADAS', valores: M.map((_, i) => 100 * (i + 1)), vencidos: z(), pct_mes: z(100), vs_media: z(), total: 999, media: 123, pct: null,
      valores_acum: z(4444), valores_media: z(2222) },
    { chave: 'entrada:grupo:Receitas operacionais:', tipo: 'grupo', lado: 'entrada', grupo: 'Receitas operacionais', rotulo: 'Receitas operacionais', valores: M.map((_, i) => 60 * (i + 1)), vencidos: z(), pct_mes: z(33.3), vs_media: z(12.5), total: 555, media: 44, pct: 77.7 },
    { chave: 'entrada:grupo:Sem classificação:', tipo: 'grupo', lado: 'entrada', grupo: 'Sem classificação', rotulo: 'Sem classificação', valores: M.map((_, i) => 40 * (i + 1)), vencidos: z(), pct_mes: z(66.6), vs_media: z(-3), total: 444, media: 37, pct: 22.2 },
    { chave: 'saida:total::', tipo: 'total', lado: 'saida', rotulo: 'SAÍDAS TOTAIS', valores: z(80), vencidos: M.map((am) => (am === '2026-02' ? 30 : 0)), pct_mes: z(100), vs_media: z(), total: 888, media: 74, pct: null },
    { chave: 'saida:grupo:Custeio:', tipo: 'grupo', lado: 'saida', grupo: 'Custeio', rotulo: 'Custeio', valores: z(50), vencidos: M.map((am) => (am === '2026-02' ? 30 : 0)), pct_mes: z(11.1), vs_media: z(25), total: 600, media: 50, pct: 61.6,
      /* P90 — séries do critério que NÃO fecham com os meses: a tela escreve as do banco */
      valores_acum: z(777), valores_media: z(333), pct_acum: z(44.4) },
    { chave: 'saida:grupo:Outras saídas:', tipo: 'grupo', lado: 'saida', grupo: 'Outras saídas', rotulo: 'Outras saídas', valores: z(30), vencidos: z(), pct_mes: z(88.8), vs_media: z(-40), total: 288, media: 24, pct: 38.4 },
    { chave: 'saida:transf:Outras saídas:Transferências para outras contas', tipo: 'transf', lado: 'saida', grupo: 'Outras saídas', rotulo: 'Transferências para outras contas', valores: z(10), vencidos: z(), pct_mes: z(5), vs_media: z(), total: 120, media: 10, pct: 13.5 },
    { chave: 'resultado', tipo: 'resultado', rotulo: 'RESULTADO', valores: M.map((_, i) => 7 + i), total: 42, media: 3 },
    { chave: 'saldo_final', tipo: 'saldo', rotulo: 'SALDO FINAL', valores: M.map((_, i) => 5000 + i) },
  ],
  grafico: { entrada: { media_acumulada: z(null), meta: z(null) }, saida: { media_acumulada: z(null), meta: z(null) } },
  conciliado_ate: '2026-02-11', conciliado_saldo: 1_234_567.89,
  contas_sem_ancora: [],
  status: ['previsto', 'programado', 'agendado'],
  incluir_vencidos: true,
};

/* o filtro de status mora na URL (`useFiltroUrl`): a tela precisa do roteador */
const render = (el: ReactElement) => renderCru(<MemoryRouter>{el}</MemoryRouter>);
const celula = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, ' ').trim();

/* o banco devolve SÓ os meses pedidos (p_de → p_ate), como o real: corta as séries pelo mesmo intervalo */
const SERIES = ['valores', 'vencidos', 'pct_mes', 'vs_media', 'valores_acum', 'valores_media', 'pct_acum'] as const;
function recorte(a: { p_de: string; p_ate: string }) {
  const i0 = Math.max(0, M.indexOf(a.p_de.slice(0, 7))), i1 = M.indexOf(a.p_ate.slice(0, 7));
  const fim = i1 < 0 ? M.length : i1 + 1;
  const corta = (x: any) => (Array.isArray(x) ? x.slice(i0, fim) : x);
  return { ...TELA, meses: TELA.meses.slice(i0, fim),
    linhas: TELA.linhas.map((l: any) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, (SERIES as readonly string[]).includes(k) ? corta(v) : v]))),
    grafico: { entrada: { media_acumulada: corta(TELA.grafico.entrada.media_acumulada), meta: corta(TELA.grafico.entrada.meta) },
               saida: { media_acumulada: corta(TELA.grafico.saida.media_acumulada), meta: corta(TELA.grafico.saida.meta) } } };
}
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, a: any) => ({ data: fn === 'fn_vg_tela' ? recorte(a) : { contas: [], atividades: [], safras: [] }, error: null }));
  filtrosVG.mudar({ contas: null, fazenda: null, safra: null, atividade: null, clienteId: null, lista: null });
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
});

describe('Visão Geral — render-only', () => {
  it('V1 a tela escreve os totais, médias, % e saldos do banco, mesmo quando eles NÃO fecham com os meses', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    /* os meses de entrada somam 7.800, mas o banco disse 999: a tela mostra 999 */
    expect(celula('grade-total-entrada:total::')).toBe('999');
    expect(celula('grade-media-entrada:total::')).toBe('123');
    expect(celula('grade-pct-entrada:grupo:Receitas operacionais:')).toBe('77,7%');
    /* resultado de fev: entradas 200 - saídas 80 seriam 120; o banco disse 8 */
    expect(celula('grade-celula-resultado-2026-02')).toBe('8');
    expect(celula('grade-total-resultado')).toBe('42');
    expect(celula('grade-celula-saldo_final-2026-02')).toBe('5.001');
    /* o card: o mês vigente (fev), os valores e os % do mês do banco */
    expect(celula('card-valor-entrada')).toBe('R$ 200,00');
    expect(celula('card-resultado')).toBe('R$ 8,00');
    expect(celula('card-saldo-inicial')).toBe('R$ 1.001,00');
    expect(celula('card-saldo-final')).toBe('R$ 5.001,00');
    expect(within(screen.getByTestId('card-grupo-entrada:grupo:Receitas operacionais:')).getByText('33,3%')).toBeTruthy();
    expect(screen.getByTestId('card-conciliado').textContent).toContain('Conciliado até 11/02');
    /* P70 — o saldo das contas no dia do conciliado, o número do banco */
    expect(screen.getByTestId('card-conciliado-saldo').textContent).toBe('R$ 1.234.567,89');
  });

  it('V2 abre em Entradas × saídas, Ano e no mês vigente, e pede jan → o mês vigente ao banco', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.getByTestId('card-vg-titulo').textContent).toBe('Entradas e saídas · fev/26');
    const pedido = rpc.mock.calls.find((c) => c[0] === 'fn_vg_tela')![1];
    expect(pedido).toMatchObject({ p_cliente: 'cli', p_de: '2026-01-01', p_ate: '2026-02-28', p_contas: null, p_atividade: null, p_hoje: '2026-02-15',
      p_status: ['previsto', 'programado', 'agendado'], p_incluir_vencidos: true });
  });

  it('V3 clicar em total ou grupo abre o modal de análise no lado, na aba e no mês clicados', async () => {
    const onAnalisar = vi.fn();
    render(<VisaoGeralFinanceiro hoje="2026-02-15" onAnalisar={onAnalisar} />);
    await screen.findByTestId('grade-vg');
    expect(screen.queryByTestId('modal-analise')).toBeNull();
    fireEvent.click(screen.getByTestId('grade-linha-saida:grupo:Custeio:'));
    expect(onAnalisar.mock.calls.map((c) => c[0])).toEqual([{ lado: 'saida', grupo: 'Custeio', am: '2026-02' }]);
    expect(screen.getByTestId('modal-analise')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('fn_vg_analise', expect.objectContaining({ p_lado: 'saida', p_aba: 'Custeio', p_foco: ['Custeio'], p_mes: '2026-02' }));
  });

  it('V4 Sem classificação e a transferência aparecem; o vencido marca o mês vigente', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.getByTestId('grade-linha-entrada:grupo:Sem classificação:')).toBeTruthy();
    expect(screen.getByTestId('grade-linha-saida:transf:Outras saídas:Transferências para outras contas').textContent).toContain('Transferências para outras contas');
    const marcas = screen.getAllByTestId('marca-vencido');
    expect(marcas).toHaveLength(2);
    expect(screen.getByTestId('grade-celula-saida:grupo:Custeio:-2026-02').getAttribute('title')).toContain('R$ 30,00 de previsto vencido');
  });

  it('V5 trocar o mês pela pílula pede o novo período ao banco e o card mostra o mês', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    fireEvent.click(screen.getByTestId('vg-mes-4'));
    await waitFor(() => expect(screen.getByTestId('card-vg-titulo').textContent).toBe('Entradas e saídas · abr/26 (previsto)'));
    expect(celula('card-valor-entrada')).toBe('R$ 400,00');
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_de: '2026-01-01', p_ate: '2026-04-30' });
  });

  it('V18 o mês escolhido é o fim do período: Ano AGO = jan–ago (8 colunas); Últ. 12; 6 + 6 inalterado; DEZ com o previsto', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-10-15" inicial={{ sel: '2026-08' }} />);
    await screen.findByTestId('grade-vg');
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_de: '2026-01-01', p_ate: '2026-08-31' });
    await waitFor(() => expect(screen.getByTestId('grade-celula-saldo_final-2026-08')).toBeTruthy());
    expect(screen.queryByTestId('grade-celula-saldo_final-2026-09')).toBeNull();
    expect(document.querySelectorAll('[data-testid^="grade-celula-saldo_final-"]')).toHaveLength(8);
    /* o card: o saldo final é o do fim de ago (o do banco) */
    expect(celula('card-saldo-final')).toBe('R$ 5.007,00');
    /* Últ. 12 → set/25–ago/26 */
    fireEvent.click(screen.getByText('Últ. 12'));
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_de: '2025-09-01', p_ate: '2026-08-31' }));
    /* 6 + 6 → inalterado: 6 antes e 6 depois do mês (a projeção) */
    fireEvent.click(screen.getByText('6 + 6'));
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_de: '2026-03-01', p_ate: '2027-02-28' }));
    /* Ano com DEZ (futuro) → jan–dez, nov e dez previstos */
    fireEvent.click(screen.getByText('Ano'));
    fireEvent.click(screen.getByTestId('vg-mes-12'));
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_de: '2026-01-01', p_ate: '2026-12-31' }));
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="grade-celula-saldo_final-"]')).toHaveLength(12));
  });

  const ultimoPedido = () => rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1];
  it('V6 os chips só repassam ao banco: desligar Programado tira o status do pedido', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.getByTestId('vg-status-programado').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('vg-status-programado'));
    await waitFor(() => expect(ultimoPedido()).toMatchObject({ p_status: ['previsto', 'agendado'], p_incluir_vencidos: true }));
  });
  it('V6 desligar Vencidos pede p_incluir_vencidos = false', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.getByTestId('vg-status-vencidos').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('vg-status-vencidos'));
    await waitFor(() => expect(ultimoPedido()).toMatchObject({ p_status: ['previsto', 'programado', 'agendado'], p_incluir_vencidos: false }));
    expect(screen.getByTestId('vg-status-vencidos').getAttribute('aria-pressed')).toBe('false');
  });

  it('V7 o aviso vem do eco do banco', async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? { ...TELA, status: [], incluir_vencidos: false } : { contas: [], atividades: [], safras: [] }, error: null }));
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    const aviso = screen.getByTestId('vg-status-aviso').textContent ?? '';
    expect(aviso).toBe('só o realizado nas somas · vencidos antes de 15/02 fora das somas e do saldo');
    /* a tela pediu os padrões; quem disse que ficou de fora foi o banco */
    expect(ultimoPedido()).toMatchObject({ p_status: ['previsto', 'programado', 'agendado'], p_incluir_vencidos: true });
  });
  it('V7 com o eco padrão, nenhum aviso', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.getByTestId('vg-status-aviso').textContent).toBe('');
  });

  it('V8 o card mostra o vencido do mês no total do lado, do banco', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(celula('card-vencido-saida')).toBe('vencidos R$ 30,00');
    expect(screen.queryByTestId('card-vencido-entrada')).toBeNull();
  });

  it('V9 a linha do pagamento de cartão: do banco, entre as saídas e o resultado, sem análise', async () => {
    const onAnalisar = vi.fn();
    const linhas = [...TELA.linhas];
    linhas.splice(linhas.findIndex((l) => l.chave === 'resultado'), 0,
      { chave: 'cartao', tipo: 'cartao', rotulo: 'PAGAMENTO DE CARTÃO (transferência)', valores: M.map((_, i) => 31 + i), total: 77, media: 6 } as any);
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? { ...TELA, linhas } : { contas: [], atividades: [], safras: [] }, error: null }));
    render(<VisaoGeralFinanceiro hoje="2026-02-15" onAnalisar={onAnalisar} />);
    await screen.findByTestId('grade-vg');
    const tipos = Array.from(document.querySelectorAll('[data-testid^="grade-linha-"]')).map((tr) => tr.getAttribute('data-tipo'));
    expect(tipos.slice(-3)).toEqual(['cartao', 'resultado', 'saldo']);
    expect(celula('grade-celula-cartao-2026-02')).toBe('32');
    expect(celula('grade-total-cartao')).toBe('77');
    fireEvent.click(screen.getByTestId('grade-linha-cartao'));
    expect(onAnalisar).not.toHaveBeenCalled();
  });

  it('V10 os grupos sem valor no mês ficam numa linha só; ampliado, todos à vista', async () => {
    const linhas = TELA.linhas.map((l) => (l.chave === 'saida:grupo:Outras saídas:' ? { ...l, valores: z(0) } : l));
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? { ...TELA, linhas } : { contas: [], atividades: [], safras: [] }, error: null }));
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(screen.queryByTestId('card-grupo-saida:grupo:Outras saídas:')).toBeNull();
    expect(screen.getByTestId('card-zerados-saida').textContent).toContain('+ 1 grupo sem valor no mês');
    expect(screen.getByTestId('card-grupo-saida:grupo:Custeio:')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ampliar-card'));
    const modal = await screen.findByTestId('modal-ampliado-card');
    expect(within(modal).getByTestId('card-grupo-saida:grupo:Outras saídas:')).toBeTruthy();
    expect(within(modal).queryByTestId('card-zerados-saida')).toBeNull();
  });

  it('V11 o mesmo ampliar nos três blocos; a grade ampliada não rola', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    for (const b of ['card', 'grafico', 'grade']) expect(screen.getByTestId(`ampliar-${b}`).getAttribute('aria-label')).toMatch(/^Ampliar /);
    fireEvent.click(screen.getByTestId('ampliar-grade'));
    const modal = await screen.findByTestId('modal-ampliado-grade');
    expect(within(modal).getByTestId('grade-vg-ampliada').className).not.toContain('overflow');
    expect(within(modal).getByTestId('grade-linha-saldo_final')).toBeTruthy();
  });

  it('V12 com fazenda ou atividade, nenhum saldo; o aviso no lugar; sem safra no pedido', async () => {
    const semSaldo = { ...TELA, sem_saldo: true, conciliado_ate: null, linhas: TELA.linhas.filter((l) => l.tipo !== 'saldo') };
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? semSaldo : { contas: [], atividades: [], safras: [] }, error: null }));
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    act(() => filtrosVG.mudar({ fazenda: 'faz-1' }));
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).toMatchObject({ p_fazendas: ['faz-1'] }));
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').at(-1)![1]).not.toHaveProperty('p_safra');
    for (const id of ['card-saldo-inicial', 'card-saldo-final', 'card-conciliado', 'legenda-saldo', 'grade-linha-saldo_inicial', 'grade-linha-saldo_final']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(screen.getByTestId('card-sem-saldo').textContent).toBe('Saldo existe só por conta — escolha contas para ver o saldo');
    expect(screen.getByTestId('legenda-sem-saldo')).toBeTruthy();
    /* entradas, saídas e resultado continuam */
    expect(celula('card-valor-entrada')).toBe('R$ 200,00');
    expect(celula('card-resultado')).toBe('R$ 8,00');
  });

  it('V14 o critério (mês · média · acumulado) escreve a série do banco no card e na grade, sem pedir de novo', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" inicial={{ modo: 'sai' }} />);
    await screen.findByTestId('grade-vg');
    const pedidos = rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').length;
    const custeio = () => screen.getByTestId('card-grupo-saida:grupo:Custeio:').textContent ?? '';
    expect(custeio()).toContain('R$ 50,00');
    fireEvent.click(within(screen.getByTestId('vg-criterio')).getByText('Acumulado'));
    expect(custeio()).toContain('R$ 777,00');
    expect(custeio()).toContain('44,4%');
    expect(screen.getByTestId('card-vs-media-saida:grupo:Custeio:').textContent).toBe('—');
    expect(celula('grade-celula-saida:grupo:Custeio:-2026-02')).toBe('777');
    expect(celula('grade-celula-saldo_inicial-2026-02')).toBe('1.001');
    fireEvent.click(within(screen.getByTestId('vg-criterio')).getByText('Média'));
    expect(custeio()).toContain('R$ 333,00');
    expect(celula('grade-celula-saida:grupo:Custeio:-2026-02')).toBe('333');
    /* nenhuma marca de vencido fora de "mês" */
    expect(screen.queryAllByTestId('marca-vencido').length).toBe(0);
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').length).toBe(pedidos);
  });

  it('V15 no acumulado, o saldo de cima é o inicial do PERÍODO (o do 1º mês, do banco)', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    fireEvent.click(within(screen.getByTestId('vg-criterio')).getByText('Acumulado'));
    expect(screen.getByTestId('card-saldo-inicial-rotulo').textContent).toBe('Saldo inicial · jan/26');
    expect(screen.getByTestId('card-saldo-inicial').textContent).toBe('R$ 1.000,00');
  });

  it('V16 o gráfico ampliado traz o PAINEL DO MÊS escolhido, com o mês, o acumulado e a média do banco', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    fireEvent.click(screen.getByTestId('ampliar-grafico'));
    const painel = await screen.findByTestId('painel-mes');
    expect(within(painel).getByTestId('painel-mes-titulo').textContent).toBe('Fevereiro 2026');
    expect(within(painel).getByTestId('painel-mes-entradas').textContent).toBe('R$ 200,00');
    expect(within(painel).getByTestId('painel-acum-entradas').textContent).toBe('R$ 4.444,00');
    expect(within(painel).getByTestId('painel-media-entradas').textContent).toBe('R$ 2.222,00');
    expect(within(painel).getByTestId('painel-saldo-final').textContent).toBe('R$ 5.001,00');
  });

  it('V17 a grade ampliada traz o cabeçalho (cliente, contas, chips, critério) e o resumo do mês, do banco, e o botão PDF', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    fireEvent.click(screen.getByTestId('ampliar-grade'));
    const cab = await screen.findByTestId('grade-ampliada-cabecalho');
    expect(within(cab).getByTestId('grade-ampliada-cliente').textContent).toBe('Cliente');
    expect(within(cab).getByTestId('grade-ampliada-contexto').textContent).toContain('Realizado + Previsto, Programado, Agendado, Vencidos');
    expect(within(cab).getByTestId('grade-ampliada-resumo').textContent).toContain('R$ 200,00');
    expect(within(cab).getByTestId('grade-ampliada-resumo').textContent).toContain('R$ 5.001,00');
    expect(screen.getByTestId('vg-pdf')).toBeTruthy();
  });

  it('V13 o TOTAL dos saldos é o do banco (a grade não soma)', async () => {
    const linhas = TELA.linhas.map((l) => (l.chave === 'saldo_inicial' ? { ...l, total: 4321 } : l.chave === 'saldo_final' ? { ...l, total: 8765 } : l));
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? { ...TELA, linhas } : { contas: [], atividades: [], safras: [] }, error: null }));
    render(<VisaoGeralFinanceiro hoje="2026-02-15" />);
    await screen.findByTestId('grade-vg');
    expect(celula('grade-total-saldo_inicial')).toBe('4.321');
    expect(celula('grade-total-saldo_final')).toBe('8.765');
  });

  it('V19 a grade: cabeçalho preso; Resultado e Saldo final congelados no rodapé, FORA da área que rola, com as mesmas colunas', async () => {
    render(<VisaoGeralFinanceiro hoje="2026-10-15" inicial={{ sel: '2026-10' }} />);
    await screen.findByTestId('grade-vg');
    const rolagem = screen.getByTestId('grade-vg-rolagem');
    expect(rolagem.querySelector('thead')!.className).toContain('sticky');
    const rodape = screen.getByTestId('grade-rodape');
    expect(rolagem.contains(rodape)).toBe(false);
    expect([...rodape.querySelectorAll('tr')].map((tr) => tr.getAttribute('data-testid'))).toEqual(['grade-linha-resultado', 'grade-linha-saldo_final']);
    expect(rolagem.querySelector('[data-testid="grade-linha-resultado"]')).toBeNull();
    expect(rolagem.querySelector('[data-testid="grade-linha-saldo_final"]')).toBeNull();
    expect(rolagem.querySelector('[data-testid="grade-linha-saldo_inicial"]')).toBeTruthy();
    /* a borda de cima do rodapé e as MESMAS colunas (o mesmo colgroup) */
    expect(screen.getByTestId('grade-linha-resultado').className).toContain('shadow-[inset_0_2px_0');
    const cols = (t: Element) => [...t.querySelectorAll('col')].map((c) => (c as HTMLElement).style.width);
    expect(cols(screen.getByTestId('grade-rodape-quadro').querySelector('table')!)).toEqual(cols(screen.getByTestId('grade-vg')));
    expect(screen.getByTestId('grade-linha-resultado').children.length).toBe(screen.getByTestId('grade-linha-saldo_inicial').children.length);
    /* rolar de lado leva o rodapé junto (o jsdom não rola: a posição é posta à mão) */
    const quadro = screen.getByTestId('grade-rodape-quadro');
    Object.defineProperty(quadro, 'scrollLeft', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(rolagem, 'scrollLeft', { configurable: true, value: 37 });
    fireEvent.scroll(rolagem);
    expect(quadro.scrollLeft).toBe(37);
  });
});
