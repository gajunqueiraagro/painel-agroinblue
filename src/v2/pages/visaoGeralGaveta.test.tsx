/**
 * FIN-VISAO-GERAL-01 PR 5 — a página e a GAVETA (o modal de análise e o modal padrão do lançamento são dublês: aqui se prova a ligação).
 *   P1 o clique num lançamento da gaveta abre o modal padrão pelo `lancamento_id`; salvou (o `editarLancamento` avisa o canal com o
 *      id salvo, P73) → a versão sobe UMA vez: a Visão Geral relê (`fn_vg_tela` de novo), o modal de análise recebe a versão nova e
 *      continua aberto; fechar volta para a gaveta (o modal de análise nunca desmontou)
 *   P2 "Ver na lista de Lançamentos ›" leva os filtros e o LUGAR (período, mês, critério, alvo, estado do modal, nó da gaveta); a volta
 *      (`retorno`) reabre o modal com o estado e a gaveta
 *   P3 o dividir/voltar para uma conta de dentro do modal padrão não passa pelo salvar: avisa o canal (com o id, ou sem ids no cadastro
 *      de N parcelas) e a Visão Geral relê do mesmo jeito; desmontada, deixa de ouvir
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.hoisted(() => vi.fn());
const montagens = vi.hoisted(() => ({ modal: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/components/financeiro-v2/visaoGeral/ModalAnaliseVG', async () => {
  const { useEffect } = await import('react');
  return {
    ModalAnaliseVG: (p: any) => {
      useEffect(() => { montagens.modal += 1; }, []);
      return (
        <div data-testid="modal-analise" data-versao={p.versao} data-inicial={JSON.stringify(p.inicial ?? null)}>
          <button data-testid="dublê-abrir" onClick={() => p.onAbrirLancamento('l9', { chave: 'l9#2' })} />
          <button data-testid="dublê-lista" onClick={() => p.onVerNaLista({ tipo: '2-Saídas', subcentro: 'Sementes' },
            { estado: { lado: 'saida', aba: 'Custeio', foco: ['Custeio'], grafico: null, am: '2026-02', criterio: 'mes', unidade: 'rs' }, gaveta: ['Custeio', 'agricultura', 'Insumos', 'Sementes'] })} />
        </div>
      );
    },
  };
});
vi.mock('@/components/financeiro-v2/visaoGeral/LancamentoDaGavetaVG', () => ({
  LancamentoDaGavetaVG: (p: any) => (p.lancamentoId ? (
    <div data-testid="lancamento-padrao" data-id={p.lancamentoId}>
      <button data-testid="dublê-salvar" onClick={() => notificarLancamentosMudaram('cli', null, [p.lancamentoId])} />
      <button data-testid="dublê-fechar" onClick={p.onFechar} />
    </div>
  ) : null),
}));

import { VisaoGeralFinanceiro } from './VisaoGeralFinanceiro';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { filtrosVG } from '@/lib/financeiro/visaoGeral';

const M = ['2026-01', '2026-02', '2026-03'];
const TELA = {
  mes_atual: '2026-02', meses: M.map((am) => ({ am, previsto: am > '2026-02', vigente: am === '2026-02' })),
  linhas: [
    { chave: 'saida:total::', tipo: 'total', lado: 'saida', rotulo: 'SAÍDAS TOTAIS', valores: [1, 2, 3], vencidos: [0, 0, 0], pct_mes: [100, 100, 100], vs_media: [0, 0, 0], total: 6, media: 2, pct: null },
    { chave: 'saida:grupo:Custeio:', tipo: 'grupo', lado: 'saida', grupo: 'Custeio', rotulo: 'Custeio', valores: [1, 2, 3], vencidos: [0, 0, 0], pct_mes: [100, 100, 100], vs_media: [0, 0, 0], total: 6, media: 2, pct: 100 },
  ],
  grafico: null, conciliado_ate: null, contas_sem_ancora: [], status: ['previsto', 'programado', 'agendado'], incluir_vencidos: true,
};
const pedidosTela = () => rpc.mock.calls.filter((c) => c[0] === 'fn_vg_tela').length;
const passar = () => act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });

beforeEach(() => {
  rpc.mockReset(); montagens.modal = 0;
  rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_vg_tela' ? TELA : { contas: [], atividades: [], safras: [] }, error: null }));
  filtrosVG.mudar({ contas: null, fazenda: null, safra: null, atividade: null, clienteId: null, lista: null });
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
});

describe('Visão Geral × gaveta', () => {
  it('P1 abre pelo lancamento_id; salvou → a Visão Geral e o modal releem; fechar volta à gaveta', async () => {
    render(<MemoryRouter><VisaoGeralFinanceiro hoje="2026-02-15" /></MemoryRouter>);
    await screen.findByTestId('grade-vg');
    fireEvent.click(screen.getByTestId('grade-linha-saida:grupo:Custeio:'));
    expect(screen.getByTestId('modal-analise').getAttribute('data-versao')).toBe('0');
    fireEvent.click(screen.getByTestId('dublê-abrir'));
    expect(screen.getByTestId('lancamento-padrao').getAttribute('data-id')).toBe('l9');
    const antes = pedidosTela();
    fireEvent.click(screen.getByTestId('dublê-salvar'));
    await passar();
    expect(pedidosTela()).toBe(antes + 1);
    expect(screen.getByTestId('modal-analise').getAttribute('data-versao')).toBe('1');
    fireEvent.click(screen.getByTestId('dublê-fechar'));
    expect(screen.queryByTestId('lancamento-padrao')).toBeNull();
    expect(screen.getByTestId('modal-analise')).toBeTruthy();
    expect(montagens.modal).toBe(1);
  });

  it('P2 "Ver na lista" leva os filtros e o lugar; a volta reabre o modal e a gaveta', async () => {
    const onVer = vi.fn();
    const r = render(<MemoryRouter><VisaoGeralFinanceiro hoje="2026-02-15" onVerNaLista={onVer} /></MemoryRouter>);
    await screen.findByTestId('grade-vg');
    fireEvent.click(screen.getByTestId('grade-linha-saida:grupo:Custeio:'));
    fireEvent.click(screen.getByTestId('dublê-lista'));
    const [filtros, volta] = onVer.mock.calls[0];
    expect(filtros).toEqual({ tipo: '2-Saídas', subcentro: 'Sementes' });
    expect(volta).toMatchObject({ modo: 'flx', sel: '2026-02', faixa: 'ano', criterio: 'mes', alvo: { lado: 'saida', grupo: 'Custeio', am: '2026-02' },
      gaveta: ['Custeio', 'agricultura', 'Insumos', 'Sementes'] });
    r.unmount();
    render(<MemoryRouter><VisaoGeralFinanceiro hoje="2026-02-15" retorno={volta} /></MemoryRouter>);
    await screen.findByTestId('grade-vg');
    expect(JSON.parse(screen.getByTestId('modal-analise').getAttribute('data-inicial')!)).toEqual({ estado: volta.estado, gaveta: volta.gaveta });
  });

  it('P3 o aviso do canal (dividir/voltar, com ou sem ids) também relê; desmontada, não ouve mais', async () => {
    const r = render(<MemoryRouter><VisaoGeralFinanceiro hoje="2026-02-15" /></MemoryRouter>);
    await screen.findByTestId('grade-vg');
    const antes = pedidosTela();
    await act(async () => { notificarLancamentosMudaram('cli', null, ['l7']); });
    await passar();
    expect(pedidosTela()).toBe(antes + 1);
    await act(async () => { notificarLancamentosMudaram('cli'); });
    await passar();
    expect(pedidosTela()).toBe(antes + 2);
    await act(async () => { notificarLancamentosMudaram('outro-cliente', null, ['l7']); });
    await passar();
    expect(pedidosTela()).toBe(antes + 2);
    r.unmount();
    notificarLancamentosMudaram('cli', null, ['l7']);
    expect(pedidosTela()).toBe(antes + 2);
  });
});
