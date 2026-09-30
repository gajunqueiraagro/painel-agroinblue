/**
 * FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01 — a prévia da propagação mostra a COMPETÊNCIA que a regra recalcula, o que
 * o mês fechado pula e a marca da geração.
 *
 * ⚠ O JSON É O QUE A RPC DEVOLVEU no teste em BEGIN/ROLLBACK do proto (30/09, recorrência "Folha de Pagamento" de
 *   Felipe Pereira dos Santos, NJ): 3 futuros com a competência do próprio mês (venc 05/10 comp 01/10, que a regra
 *   "mês anterior" quer 01/09), marca dez/26 → nov/26, e a próxima geração cria dez/26.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const RPC = vi.hoisted(() => ({ resposta: null as unknown, chamadas: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push(args);
      return Promise.resolve({ data: RPC.resposta, error: null });
    },
  },
}));
const TOAST = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: TOAST }));

import { propagarRecorrencia } from '@/hooks/useRecorrencias';
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';

const FELIPE_SIM = {
  futuros: 4, passados: 0, simulado: true, aplicados_futuros: 0, aplicados_passados: 0,
  competencia: {
    desloc: 1, marca_antes: '2026-12-01', meses_fechados: [],
    futuros: { alteradas: 3, puladas_mes_fechado: 0, lista: [
      { venc: '2026-10-05', comp_nova: '2026-09-01', comp_antiga: '2026-10-01', lancamento_id: '7e63f78e' },
      { venc: '2026-11-05', comp_nova: '2026-10-01', comp_antiga: '2026-11-01', lancamento_id: '00722e1a' },
      { venc: '2026-12-05', comp_nova: '2026-11-01', comp_antiga: '2026-12-01', lancamento_id: 'e59014af' },
    ] },
    passados: { alteradas: 0, puladas_mes_fechado: 0, lista: [] },
    projecao: {
      futuros: { alteradas: 3, marca_depois: '2026-11-01', a_gerar: ['2026-12'], duplicidades: [] },
      todos: { alteradas: 3, marca_depois: '2026-11-01', a_gerar: ['2026-12'], duplicidades: [] },
    },
  },
};

/* Um caso montado para os ramos que o NJ não tem hoje: um passado realizado a recalcular, dois pulados por mês
   fechado (ago/26) e uma competência repetida. */
const COM_FECHADO = {
  futuros: 2, passados: 3, simulado: true, aplicados_futuros: 0, aplicados_passados: 0,
  competencia: {
    desloc: 1, marca_antes: '2026-12-01', meses_fechados: ['2026-08'],
    futuros: { alteradas: 1, puladas_mes_fechado: 0, lista: [
      { venc: '2026-11-05', comp_nova: '2026-10-01', comp_antiga: '2026-11-01', lancamento_id: 'f1' },
    ] },
    passados: { alteradas: 1, puladas_mes_fechado: 2, lista: [
      { venc: '2026-10-05', comp_nova: '2026-09-01', comp_antiga: '2026-10-01', lancamento_id: 'p1' },
    ] },
    projecao: {
      futuros: { alteradas: 1, marca_depois: '2026-12-01', a_gerar: [], duplicidades: [] },
      todos: { alteradas: 2, marca_depois: '2026-12-01', a_gerar: [], duplicidades: [{ competencia: '2026-09', n: 2 }] },
    },
  },
};

beforeEach(() => { RPC.chamadas = []; TOAST.success.mockReset(); TOAST.error.mockReset(); });

async function abrir(resposta: unknown) {
  RPC.resposta = resposta;
  const r = await propagarRecorrencia('rec-felipe', 'futuros', true);
  render(<PropagarRecorrenciaDialog recorrenciaId="rec-felipe" descricao="Folha de Pagamento"
    previa={r.dados} recusa={null} aoFechar={() => {}} />);
  return r;
}

describe('a leitura da RPC', () => {
  it('lê a competência campo a campo; sem a chave (RPC antiga), fica null', async () => {
    const r = await abrir(FELIPE_SIM);
    expect(r.dados?.competencia?.grupos.futuros.alteradas).toBe(3);
    expect(r.dados?.competencia?.projecao.todos.aGerar).toEqual(['2026-12']);
    expect(r.dados?.competencia?.marcaAntes).toBe('2026-12-01');
    RPC.resposta = { futuros: 1, passados: 0, simulado: true };
    const antiga = await propagarRecorrencia('x', 'futuros', true);
    expect(antiga.dados?.competencia).toBeNull();
  });
});

describe('a prévia mostra a competência antes de aplicar', () => {
  it('Felipe: "3 competências recalculadas (ex.: venc 05/10: 01/10 → 01/09)" e a marca dez/26 → nov/26, cria dez/26', async () => {
    await abrir(FELIPE_SIM);
    expect(screen.getByTestId('competencias-recalculadas').textContent)
      .toBe('3 competências recalculadas (ex.: venc 05/10: 01/10 → 01/09)');
    expect(screen.getByTestId('competencias-marca').textContent)
      .toBe('Marca da geração: dez/26 → nov/26 · a próxima geração cria dez/26');
    expect(screen.queryByTestId('competencias-puladas')).toBeNull();
    expect(screen.queryByTestId('competencias-duplicadas')).toBeNull();
  });

  it('o texto que mentia saiu: "datas, tipo e sinal nunca mudam" virou o que é verdade', async () => {
    await abrir(FELIPE_SIM);
    expect(screen.queryByText(/datas, tipo e sinal nunca mudam/)).toBeNull();
    expect(screen.getByText(/Vencimento, pagamento e valor pago não mudam; a competência segue/)).toBeInTheDocument();
    expect(screen.queryByText(/datas e valor deles ficam/)).toBeNull();
  });

  it('mês fechado: só "Futuros" não pula nada; "Futuros e passados" mostra 2 puladas (ago/26) e a repetida', async () => {
    await abrir(COM_FECHADO);
    expect(screen.getByTestId('competencias-recalculadas').textContent).toContain('1 competência recalculada');
    expect(screen.queryByTestId('competencias-puladas')).toBeNull();
    expect(screen.queryByTestId('competencias-marca')).toBeNull(); // marca não muda neste caso
    fireEvent.click(screen.getByLabelText(/Futuros e passados/));
    expect(screen.getByTestId('competencias-recalculadas').textContent).toContain('2 competências recalculadas');
    expect(screen.getByTestId('competencias-puladas').textContent).toBe('2 puladas por mês fechado (ago/26)');
    expect(screen.getByTestId('competencias-duplicadas').textContent).toContain('set/26 (2)');
  });

  it('"Não propagar" esconde o bloco da competência', async () => {
    await abrir(FELIPE_SIM);
    fireEvent.click(screen.getByLabelText(/Não propagar/));
    expect(screen.queryByTestId('propagar-competencia')).toBeNull();
  });

  it('nada a recalcular: diz que todas já seguem a regra, sem marca', async () => {
    const semMudanca = { ...FELIPE_SIM, competencia: { ...FELIPE_SIM.competencia,
      futuros: { alteradas: 0, puladas_mes_fechado: 0, lista: [] },
      projecao: { futuros: { alteradas: 0, marca_depois: '2026-12-01', a_gerar: [], duplicidades: [] },
        todos: { alteradas: 0, marca_depois: '2026-12-01', a_gerar: [], duplicidades: [] } } } };
    await abrir(semMudanca);
    expect(screen.getByText('Nenhuma competência muda: todas já seguem a regra.')).toBeInTheDocument();
    expect(screen.queryByTestId('competencias-marca')).toBeNull();
  });
});

describe('ao propagar', () => {
  it('chama a MESMA RPC com o escopo escolhido e p_simular=false; o aviso de sucesso diz as competências', async () => {
    await abrir(FELIPE_SIM);
    RPC.resposta = { ...FELIPE_SIM, simulado: false, aplicados_futuros: 4,
      competencia: { ...FELIPE_SIM.competencia, aplicadas: 3, marca_depois: '2026-11-01', a_gerar: ['2026-12'] } };
    fireEvent.click(screen.getByRole('button', { name: 'Propagar' }));
    await waitFor(() => expect(TOAST.success).toHaveBeenCalled());
    expect(RPC.chamadas.at(-1)).toEqual({ p_recorrencia_id: 'rec-felipe', p_escopo: 'futuros', p_simular: false });
    expect(TOAST.success).toHaveBeenCalledWith('4 lançamentos atualizados · 3 competências recalculadas.');
  });
});
