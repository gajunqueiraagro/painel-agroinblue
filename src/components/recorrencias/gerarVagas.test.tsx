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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RPC = vi.hoisted(() => ({ resposta: null as unknown, erro: null as { message: string } | null, chamadas: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push({ fn, args });
      return Promise.resolve(RPC.erro ? { data: null, error: RPC.erro } : { data: RPC.resposta, error: null });
    },
  },
}));
const TOAST = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: TOAST }));

import { gerarRecorrencia, textoVagas, textoNaoGerados, textoDoGerado, FRASE_NADA_A_GERAR } from '@/hooks/useRecorrencias';
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

/* RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 — o Gerar cria a vigência inteira (passados inclusive) e nunca omite em silêncio. */
describe('a vigência inteira: o que foi gerado e o que NÃO foi, escrito', () => {
  const REC = { id: 'rec', descricao: 'Consultoria', valorBase: -2500, diaVencimento: 10, dataFim: '2027-06-30' } as Recorrencia;
  /* a forma real do retorno novo (ensaio revertido no proto, 10/10/2026) */
  const VAGAS_PASSADAS = { ok: true, gerados: 2, de: '2027-07', ate: '2027-06', simulacao: true,
    vagas: [{ competencia: '2026-07', vencimento: '2026-08-10' }, { competencia: '2026-08', vencimento: '2026-09-10' }],
    nao_gerados: [], gerado_de: '2026-07', gerado_ate: '2026-08' };
  const COM_FECHADO = { ok: true, gerados: 3, de: '2026-07', ate: '2026-11', simulacao: false, vagas: [],
    nao_gerados: [{ competencia: '2026-08', vencimento: '2026-09-10', motivo: 'mês fechado' }], gerado_de: '2026-07', gerado_ate: '2026-11' };

  it('a leitura: pontas e não gerados campo a campo; sem as chaves (RPC antiga), nulo e lista vazia', async () => {
    RPC.resposta = COM_FECHADO;
    const r = await gerarRecorrencia('rec', null, false);
    expect(r).toMatchObject({ gerados: 3, geradoDe: '2026-07', geradoAte: '2026-11',
      naoGerados: [{ competencia: '2026-08', vencimento: '2026-09-10', motivo: 'mês fechado' }] });
    RPC.resposta = { ok: true, gerados: 3, de: '2027-04', ate: '2027-06', nao_gerados: 'torto', gerado_de: 7 };
    expect(await gerarRecorrencia('rec', null, true)).toMatchObject({ geradoDe: null, geradoAte: null, naoGerados: [] });
  });
  it('as frases: "gerou 12: 07/26 a 06/27", uma só, sem pontas, zero; e o não gerado com o motivo', () => {
    expect(textoDoGerado({ gerados: 12, geradoDe: '2026-07', geradoAte: '2027-06' })).toBe('gerou 12: 07/26 a 06/27');
    expect(textoDoGerado({ gerados: 1, geradoDe: '2026-07', geradoAte: '2026-07' })).toBe('gerou 1: 07/26');
    expect(textoDoGerado({ gerados: 3, geradoDe: null, geradoAte: null })).toBe('gerou 3');
    expect(textoDoGerado({ gerados: 0, geradoDe: null, geradoAte: null })).toBe(FRASE_NADA_A_GERAR);
    expect(textoNaoGerados([{ competencia: '2026-08', vencimento: '2026-09-10', motivo: 'mês fechado' }])).toBe('não gerado: 08/26 (venc 10/09/26) — mês fechado');
    expect(textoNaoGerados([{ competencia: '2026-08', vencimento: '2026-09-10', motivo: '' }])).toContain('sem motivo informado');
  });
  it('o lugar da frase existe SEMPRE, com a mesma altura declarada: vazio, com prévia, com resultado e com recusa', async () => {
    RPC.resposta = VAGAS_PASSADAS;
    render(<GerarLancamentosDialog recorrencia={REC} aoFechar={() => {}} aoGerar={() => {}} />);
    const classe = screen.getByTestId('gerar-lugar').className;
    expect(classe).toContain('h-[57px]');
    fireEvent.click(screen.getByRole('button', { name: 'Prévia' }));
    expect(await screen.findByTestId('gerar-vagas')).toHaveTextContent('preenche 07/26 (venc 10/08/26), 08/26 (venc 10/09/26)');
    expect(screen.getByTestId('gerar-previa')).toHaveTextContent('2 lançamentos · inclui meses passados');
    expect(screen.getByTestId('gerar-lugar').className).toBe(classe);
  });
  it('gravar NÃO fecha o diálogo e NÃO usa toast: o resultado e o não gerado ficam escritos', async () => {
    RPC.resposta = COM_FECHADO;
    const aoFechar = vi.fn(); const aoGerar = vi.fn();
    TOAST.success.mockClear(); TOAST.info.mockClear(); TOAST.error.mockClear();
    render(<GerarLancamentosDialog recorrencia={REC} aoFechar={aoFechar} aoGerar={aoGerar} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));
    expect(await screen.findByTestId('gerar-resultado')).toHaveTextContent('gerou 3: 07/26 a 11/26');
    expect(screen.getByTestId('gerar-nao-gerados')).toHaveTextContent('não gerado: 08/26 (venc 10/09/26) — mês fechado');
    expect(RPC.chamadas[0]).toMatchObject({ fn: 'fn_recorrencia_gerar', args: { p_simular: false } });
    await waitFor(() => expect(aoGerar).toHaveBeenCalledTimes(1));
    expect(aoFechar).not.toHaveBeenCalled();
    expect(TOAST.success).not.toHaveBeenCalled(); expect(TOAST.info).not.toHaveBeenCalled(); expect(TOAST.error).not.toHaveBeenCalled();
  });
  it('zero é resposta, escrita; e a prévia que só tem mês fechado diz o motivo', async () => {
    RPC.resposta = { ok: true, gerados: 0, de: '2027-07', ate: '2027-06', simulacao: true, vagas: [],
      nao_gerados: [{ competencia: '2026-08', vencimento: '2026-09-10', motivo: 'mês fechado' }], gerado_de: null, gerado_ate: null };
    render(<GerarLancamentosDialog recorrencia={REC} aoFechar={() => {}} aoGerar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prévia' }));
    expect(await screen.findByTestId('gerar-previa')).toHaveTextContent(FRASE_NADA_A_GERAR);
    expect(screen.getByTestId('gerar-nao-gerados')).toHaveTextContent('mês fechado');
  });
  it('a recusa do banco fica escrita no lugar reservado, sem toast, e não chama o aoGerar', async () => {
    RPC.erro = { message: 'recorrencia cancelada nao gera' };
    const aoGerar = vi.fn(); TOAST.error.mockClear();
    render(<GerarLancamentosDialog recorrencia={REC} aoFechar={() => {}} aoGerar={aoGerar} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));
    expect(await screen.findByTestId('gerar-erro')).toHaveTextContent('Não foi possível gerar. (recorrencia cancelada nao gera)');
    expect(aoGerar).not.toHaveBeenCalled(); expect(TOAST.error).not.toHaveBeenCalled();
    RPC.erro = null;
  });
});

describe('a tela de Recorrências (lida da FONTE): a regra vigente sem lançamento não some', () => {
  const f = readFileSync(resolve(process.cwd(), 'src/v2/pages/V2Recorrencias.tsx'), 'utf8');
  it('o dono recebe as canceladas e os meses fechados; a célula escreve "não gerado" com o motivo no title', () => {
    expect(f).toContain('linhasDoMes(recorrencias, ocorrencias, mes, { canceladas, mesesFechados })');
    expect(f).toContain('title={TITULO_NAO_GERADO[l.naoGerado]}>{ROTULO_NAO_GERADO}</span>');
  });
  it('o Gerar é oferecido a TODA regra ativa (a "gerada até o fim" inclusive), e a tela não decide por situação', () => {
    const trecho = f.slice(f.indexOf('GERAR EM TODA REGRA ATIVA'), f.indexOf('Gerar lançamentos'));
    expect(trecho).toContain('{r.ativo && (');
    expect(f).not.toContain("{r.situacao === 'ativa' && (");
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
