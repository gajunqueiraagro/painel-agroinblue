/**
 * FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01 — o Gerar preenche a competência VAGA abaixo da marca, e as duas prévias
 * (Gerar e Propagar) dizem isso com a MESMA frase: "preenche 12/26 (venc 05/01/27)".
 *
 * ⚠ OS NÚMEROS SÃO OS DO NJ (30/09): depois de propagar "Futuros e passados", as Folhas de FGTS, Allison, Zandonadi,
 *   Gustavo Maia e Patrick ficam com a competência 12/26 vaga (venc 20/01/27 na FGTS, 05/01/27 nas outras), e a marca
 *   em jun/27 — a janela de avanço fica vazia ("de 2027-07 até 2027-06") e o Gerar cria só a vaga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Recorrencia } from '@/hooks/useRecorrencias';

const RPC = vi.hoisted(() => ({ resposta: null as unknown, chamadas: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push({ fn, args });
      return Promise.resolve({ data: RPC.resposta, error: null });
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { gerarRecorrencia, textoVagas } from '@/hooks/useRecorrencias';
import { GerarLancamentosDialog } from './GerarLancamentosDialog';
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';
import { propagarRecorrencia } from '@/hooks/useRecorrencias';

beforeEach(() => { RPC.chamadas = []; });

/* A resposta real do gerar simulado depois da propagação (Zandonadi, transação desfeita no proto). */
const GERAR_SO_VAGA = { ok: true, gerados: 1, de: '2027-07', ate: '2027-06', simulacao: true,
  vagas: [{ competencia: '2026-12', vencimento: '2027-01-05' }] };

describe('a leitura e a frase', () => {
  it('gerarRecorrencia lê as vagas; sem a chave (RPC antiga), lista vazia', async () => {
    RPC.resposta = GERAR_SO_VAGA;
    const r = await gerarRecorrencia('rec', null, true);
    expect(r.vagas).toEqual([{ competencia: '2026-12', vencimento: '2027-01-05' }]);
    RPC.resposta = { ok: true, gerados: 3, de: '2027-04', ate: '2027-06' };
    expect((await gerarRecorrencia('rec', null, true)).vagas).toEqual([]);
  });
  it('"preenche 12/26 (venc 05/01/27)"; várias, separadas por vírgula', () => {
    expect(textoVagas([{ competencia: '2026-12', vencimento: '2027-01-05' }])).toBe('preenche 12/26 (venc 05/01/27)');
    expect(textoVagas([{ competencia: '2026-11', vencimento: '2026-12-20' }, { competencia: '2026-12', vencimento: '2027-01-20' }]))
      .toBe('preenche 11/26 (venc 20/12/26), 12/26 (venc 20/01/27)');
  });
});

describe('a prévia do Gerar', () => {
  const REC = { id: 'rec', descricao: 'Folha de Pagamento', valorBase: -3085, diaVencimento: 5, dataFim: '2027-06-30' } as Recorrencia;
  const abrir = async (resposta: unknown) => {
    RPC.resposta = resposta;
    render(<GerarLancamentosDialog recorrencia={REC} aoFechar={() => {}} aoGerar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prévia' }));
    await waitFor(() => expect(RPC.chamadas.length).toBe(1));
  };
  it('só a vaga: "1 lançamento" + "preenche 12/26 (venc 05/01/27)", sem a janela "de jul/27 a jun/27"', async () => {
    await abrir(GERAR_SO_VAGA);
    expect(await screen.findByTestId('gerar-vagas')).toHaveTextContent('preenche 12/26 (venc 05/01/27)');
    expect(screen.queryByText(/de jul\/27 a jun\/27/)).toBeNull();
    expect(RPC.chamadas[0]).toMatchObject({ fn: 'fn_recorrencia_gerar', args: { p_simular: true } });
  });
  it('vaga + avanço: a janela e a vaga aparecem juntas', async () => {
    await abrir({ ok: true, gerados: 4, de: '2027-04', ate: '2027-06', simulacao: true,
      vagas: [{ competencia: '2026-12', vencimento: '2027-01-05' }] });
    expect(await screen.findByText(/de abr\/27 a jun\/27/)).toBeInTheDocument();
    expect(screen.getByTestId('gerar-vagas')).toHaveTextContent('preenche 12/26 (venc 05/01/27)');
  });
  it('sem vaga, nada muda: nenhuma linha de vaga', async () => {
    await abrir({ ok: true, gerados: 3, de: '2027-04', ate: '2027-06', simulacao: true, vagas: [] });
    expect(await screen.findByText(/de abr\/27 a jun\/27/)).toBeInTheDocument();
    expect(screen.queryByTestId('gerar-vagas')).toBeNull();
  });
});

describe('a prévia da Propagação diz a mesma coisa', () => {
  it('FGTS em "Futuros e passados": "A próxima geração preenche 12/26 (venc 20/01/27)"', async () => {
    RPC.resposta = {
      futuros: 9, passados: 1, simulado: true, aplicados_futuros: 0, aplicados_passados: 0,
      competencia: {
        desloc: 1, marca_antes: '2027-06-01', meses_fechados: [],
        futuros: { alteradas: 3, puladas_mes_fechado: 0, lista: [] },
        passados: { alteradas: 1, puladas_mes_fechado: 0, lista: [] },
        projecao: {
          futuros: { alteradas: 3, marca_depois: '2027-06-01', a_gerar: [], duplicidades: [], vagas: [],
            aviso: 'competência 09/26 já ocupada pelo lançamento venc 20/09 — escolha Futuros e passados ou ajuste manual' },
          todos: { alteradas: 4, marca_depois: '2027-06-01', a_gerar: [], duplicidades: [], aviso: null,
            vagas: [{ competencia: '2026-12', vencimento: '2027-01-20' }] },
        },
      },
    };
    const r = await propagarRecorrencia('rec', 'futuros', true);
    render(<PropagarRecorrenciaDialog recorrenciaId="rec" descricao="Folha - FGTS" previa={r.dados} recusa={null} aoFechar={() => {}} />);
    expect(screen.queryByTestId('competencias-vagas')).toBeNull(); // "Só os futuros" não abre vaga
    fireEvent.click(screen.getByLabelText(/Futuros e passados/));
    expect(screen.getByTestId('competencias-vagas').textContent).toBe('A próxima geração preenche 12/26 (venc 20/01/27)');
  });
});
