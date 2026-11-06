/**
 * PIQUETE-VIGENCIA-01 — o diálogo "Mudar mês de início". As respostas das duas funções são as REAIS do banco (gravadas por RAISE no grupo
 * TESTE-PIQ FURO em 06/11, fixture abaixo): o teste antigo devolvia o formato da prévia também na gravação e não viu o bug do P17 (Gabriel
 * 06/11 17:13: gravou e a tela disse "não entende… Nada foi gravado"). O início dos piquetes vem do BANCO (`from('pastos')`), nunca da lista da
 * tela (bug do P9, 17:11: a tela dizia "início 11/2026" com os piquetes já em 10/2026).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

type Linha = { id: string; nome: string; data_inicio: string | null; grupo_id: string; ativo: boolean };
const estado = vi.hoisted(() => ({
  chamadas: [] as { fn: string; a: Record<string, unknown> }[],
  resposta: (_fn: string, _a: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: null, error: null }),
  pastos: [] as Linha[],
  falhaPastos: false,
  toasts: [] as string[],
  reabrir: [] as string[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => { estado.chamadas.push({ fn, a }); return Promise.resolve(estado.resposta(fn, a)); },
    from: () => {
      const q = { select: () => q, eq: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve(estado.falhaPastos ? { data: null, error: { message: 'x' } } : { data: estado.pastos, error: null }).then(ok) };
      return q;
    },
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => { estado.toasts.push(m); }, error: vi.fn() } }));
vi.mock('@/v2/hooks/usePodeAbrir', () => ({ usePodeNaOperacao: () => true }));
vi.mock('@/components/ReabrirP1Dialog', () => ({
  ReabrirP1Dialog: ({ anoMes }: { anoMes: string }) => { estado.reabrir.push(anoMes); return <div data-testid="reabrir-p1">{anoMes}</div>; },
}));

import { MudarInicioDialog } from './PiquetesVolta';

/* as respostas REAIS (06/11 17:15, grupo TESTE-PIQ FURO, por RAISE — nada ficou) */
const REAL_PREVIA = { de: '2026-11-01', ok: true, pai: { id: 'c375275f', nome: 'TESTE-PIQ FURO', fim_antes: '2026-10-31', fim_depois: '2026-09-30' }, para: '2026-10-01', cards: [],
  frase: 'TESTE-PIQ FURO: os 2 piquetes passam a começar em 10/2026; TESTE-PIQ FURO fica encerrado em 30/09/2026; 0 card(s) de TESTE-PIQ FURO (0 cab, 0 kg, 0.0 UA) passam inteiros a TESTE-PIQ FURO-A; lotação do grupo 0.00 UA/ha (89.24 ha), de TESTE-PIQ FURO-A 0.00 UA/ha (44.62 ha).',
  grupo: { id: '161af86a', nome: 'TESTE-PIQ FURO' }, meses: ['2026-10'], alocar: false,
  pastos: [{ id: '5b1724f6', nome: 'TESTE-PIQ FURO-A' }, { id: '73af4864', nome: 'TESTE-PIQ FURO-B' }], direcao: 'antecipar',
  lotacao: { kg: 0, ua: 0.0, cabecas: 0, piquete: 'TESTE-PIQ FURO-A', ua_ha_grupo: 0.00, area_grupo_ha: 89.24, ua_ha_piquete: 0.00, area_piquete_ha: 44.62 },
  piquetes: 2, simulado: true, area_pai_ha: 90, cabecas_antes: 0, card_vai_para: 'TESTE-PIQ FURO-A' };
const REAL_GRAVOU = { de: '2026-11-01', ok: true, para: '2026-10-01', cards: [], grupo: { id: '161af86a', nome: 'TESTE-PIQ FURO' }, alocar: false, direcao: 'antecipar',
  lotacao: { kg: 0, ua: 0.0, cabecas: 0, piquete: 'TESTE-PIQ FURO-A', ua_ha_grupo: 0.00, area_grupo_ha: 89.24, ua_ha_piquete: 0.00, area_piquete_ha: 44.62 },
  simulado: false, trilha_id: 'efddc735', cabecas_antes: 0, card_vai_para: 'TESTE-PIQ FURO-A', cabecas_depois: 0, pai_encerrado_em: '2026-09-30' };
const REAL_PREVIA_DESFAZER = { de: '2026-10-01', ok: true, pai: { id: 'c375275f', nome: 'TESTE-PIQ FURO', fim_antes: '2026-09-30', fim_depois: '2026-10-31' }, para: '2026-11-01', cards: 0,
  frase: 'Desfaz a mudança de 06/11/2026 17:15: os piquetes (TESTE-PIQ FURO-A, TESTE-PIQ FURO-B) voltam a começar em 11/2026; TESTE-PIQ FURO volta a valer até 31/10/2026; 0 card(s) (0 cab) voltam a TESTE-PIQ FURO.',
  grupo: { id: '161af86a', nome: 'TESTE-PIQ FURO' }, meses: ['2026-10'], cabecas: 0, direcao: 'adiar', simulado: true, trilha_id: 'efddc735',
  gravada_em: '2026-11-06T20:15:19.955701+00:00', motivo_do_gesto: 'teste' };
const REAL_DESFEZ = { de: '2026-10-01', ok: true, para: '2026-11-01', cards: 0, grupo: { id: '161af86a', nome: 'TESTE-PIQ FURO' }, desfez: 'efddc735', cabecas: 0, simulado: false, trilha_id: '81999d66' };

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const HOJE = new Date(2026, 10, 5);
const PIQUETES = [
  { pastoId: 'fb', nome: 'TESTE-PIQ FURO-B', geojson: quad(-54.02, -19.64, -54.01, -19.63) },
  { pastoId: 'fa', nome: 'TESTE-PIQ FURO-A', geojson: quad(-54.03, -19.64, -54.02, -19.63) },
];
const doGrupo = (ini: string, ini2 = ini): Linha[] => [
  { id: 'fa', nome: 'TESTE-PIQ FURO-A', data_inicio: ini, grupo_id: 'g', ativo: true },
  { id: 'fb', nome: 'TESTE-PIQ FURO-B', data_inicio: ini2, grupo_id: 'g', ativo: true },
  { id: 'zz', nome: 'De outro grupo', data_inicio: '2001-01-01', grupo_id: 'outro', ativo: true },
];

beforeEach(() => {
  estado.chamadas = []; estado.toasts = []; estado.reabrir = []; estado.falhaPastos = false; estado.pastos = doGrupo('2026-11-01');
  estado.resposta = (fn, a) => ({ error: null, data: fn === 'fn_piquetes_mudar_inicio_desfazer'
    ? (a.p_simular ? REAL_PREVIA_DESFAZER : REAL_DESFEZ)
    : (a.p_simular ? REAL_PREVIA : REAL_GRAVOU) });
});
const rpcs = (fn: string) => estado.chamadas.filter(c => c.fn === fn);
const recusa = (message: string, hint?: string) => ({ data: null, error: { code: 'P0001', message, hint } });
const botoesDeMes = () => screen.getAllByRole('button').map(b => b.textContent ?? '').filter(t => /^\d{2}\/\d{4}$/.test(t));

function abrir(opcoes: { semDesenho?: boolean } = {}) {
  const aoGravar = vi.fn(), aoFechar = vi.fn();
  render(<MudarInicioDialog grupoId="g" fazendaId="faz" nomeDoPai="TESTE-PIQ FURO" paiPastoId="pai"
    geoDoPai={opcoes.semDesenho ? null : quad(-54.03, -19.64, -54.01, -19.63)}
    piquetes={opcoes.semDesenho ? PIQUETES.map(p => ({ ...p, geojson: null })) : PIQUETES} hoje={HOJE} aoFechar={aoFechar} aoGravar={aoGravar} />);
  return { aoGravar, aoFechar };
}

describe('Mudar mês de início', () => {
  it('D1: o início vem do BANCO; oferece os últimos 4 meses sem o do início; a prévia chama com p_simular true e sem alocar', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('mudar-inicio-hoje').textContent).toBe('início 11/2026'));
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('passam a começar em 10/2026'));
    expect(botoesDeMes()).toEqual(['08/2026', '09/2026', '10/2026']);
    const c = rpcs('fn_piquetes_mudar_inicio');
    expect(c).toHaveLength(1);
    expect(c[0].a).toMatchObject({ p_grupo: 'g', p_mes: '2026-10-01', p_simular: true, p_alocar: false });
  });

  it('bug do P9: o banco diz 10/2026 (a lista da tela pode estar velha) — o diálogo diz "início 10/2026" e NÃO oferece 10/2026', async () => {
    estado.pastos = doGrupo('2026-10-01');
    abrir();
    await waitFor(() => expect(screen.getByTestId('mudar-inicio-hoje').textContent).toBe('início 10/2026'));
    await waitFor(() => expect(rpcs('fn_piquetes_mudar_inicio')).toHaveLength(1));
    expect(botoesDeMes()).toEqual(['08/2026', '09/2026', '11/2026']);
    expect(rpcs('fn_piquetes_mudar_inicio')[0].a.p_mes).toBe('2026-11-01');
  });

  it('a prévia NÃO é pedida antes de ler o início no banco; leitura que falha diz e oferece "Tentar de novo"', async () => {
    estado.falhaPastos = true;
    abrir();
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toBe('Não consegui ler o início dos piquetes.'));
    expect(rpcs('fn_piquetes_mudar_inicio')).toHaveLength(0);
    estado.falhaPastos = false;
    fireEvent.click(screen.getByTestId('mudar-inicio-tentar'));
    await waitFor(() => expect(rpcs('fn_piquetes_mudar_inicio')).toHaveLength(1));
  });

  it('piquetes desencontrados: cada um com o seu início (tabela) e "inícios diferentes" no alto', async () => {
    estado.pastos = doGrupo('2026-10-01', '2026-11-01');
    estado.resposta = () => recusa('Os piquetes de TESTE-PIQ FURO não começam todos no mesmo mês. Nada foi gravado.');
    abrir();
    await waitFor(() => expect(screen.getByTestId('mudar-inicio-hoje').textContent).toBe('inícios diferentes'));
    await waitFor(() => expect(document.querySelector('tr[data-piquete="TESTE-PIQ FURO-B"]')).not.toBeNull());
    const linhas = [...document.querySelectorAll('tr[data-piquete]')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    expect(linhas).toEqual([['TESTE-PIQ FURO-A', '10/2026'], ['TESTE-PIQ FURO-B', '11/2026']]);
  });

  it('a tabela: um dado por coluna — Mês · Antes · ha · Depois · ha (antecipar: antes o pai, depois os piquetes)', async () => {
    abrir();
    await waitFor(() => expect(document.querySelector('tr[data-mes="2026-10"]')).not.toBeNull());
    const cel = [...document.querySelectorAll('tr[data-mes="2026-10"] td')].map(td => td.textContent);
    expect(cel).toEqual(['10/2026', 'TESTE-PIQ FURO', '90,00', 'TESTE-PIQ FURO-A–TESTE-PIQ FURO-B (2)', '89,24']);
  });

  it('a frase da prévia em pt-BR (a do banco vem com ponto decimal: "0.00 UA/ha", "89.24 ha")', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('passam a começar em 10/2026'));
    const f = screen.getByTestId('volta-frase').textContent ?? '';
    expect(f).toContain('lotação do grupo 0,00 UA/ha (89,24 ha), de TESTE-PIQ FURO-A 0,00 UA/ha (44,62 ha).');
    expect(f).toContain('(0 cab, 0 kg, 0,0 UA)');
    expect(f).toContain('fica encerrado em 30/09/2026');
    expect(f).not.toMatch(/\d\.\d/);
  });

  it('bug do P17: gravar com a resposta REAL da gravação = avisa, relê a tela e fecha (antes: "não entende… Nada foi gravado")', async () => {
    const { aoGravar, aoFechar } = abrir();
    await waitFor(() => expect(screen.getByTestId('volta-bloqueio').textContent).toBe('Diga o motivo para gravar.'));
    const botao = screen.getByTestId('volta-gravar');
    expect(botao.textContent).toBe('Mudar para 10/2026');
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'entra em out.' } });
    fireEvent.click(botao);
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    const gravou = rpcs('fn_piquetes_mudar_inicio').filter(c => c.a.p_simular === false);
    expect(gravou).toHaveLength(1);
    expect(gravou[0].a).toMatchObject({ p_mes: '2026-10-01', p_motivo: 'entra em out.', p_alocar: false });
    expect(aoFechar).toHaveBeenCalled();
    expect(estado.toasts).toEqual(['Mês de início mudado.']);
    expect(screen.getByTestId('volta-recusa').textContent).toBe('');
  });

  it('D3: mês fechado = a frase do banco NO diálogo + o link do Reabrir (no mês do HINT); nada grava', async () => {
    estado.resposta = () => recusa('Os piquetes de TESTE-PIQ FURO não mudam para 09/2026: o fechamento de 09/2026 está fechado. Nada foi gravado.', 'fechamento:2026-09');
    const { aoGravar } = abrir();
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('o fechamento de 09/2026 está fechado'));
    expect(screen.getByTestId('volta-abaixo-da-recusa').textContent).toContain('09/2026 está fechado:');
    expect(screen.getByTestId('volta-gravar')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('reabrir-mes'));
    await waitFor(() => expect(screen.getByTestId('reabrir-p1').textContent).toBe('2026-09'));
    expect(aoGravar).not.toHaveBeenCalled();
    expect(rpcs('fn_piquetes_mudar_inicio').every(c => c.a.p_simular === true)).toBe(true);
  });

  it('recusa SEM mês fechado: a frase vai, o link não (a linha fica reservada e vazia)', async () => {
    estado.resposta = () => recusa('Os piquetes de TESTE-PIQ FURO não mudam para 10/2026: TESTE-PIQ FURO-A já tem card antes de 11/2026. Nada foi gravado.');
    abrir();
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('já tem card'));
    expect(screen.getByTestId('volta-abaixo-da-recusa').textContent).toBe('');
    expect(screen.queryByTestId('reabrir-mes')).toBeNull();
  });

  it('o caminho de volta: "Desfazer a última mudança" — prévia e gravação com as respostas REAIS', async () => {
    const { aoGravar } = abrir();
    await waitFor(() => expect(rpcs('fn_piquetes_mudar_inicio')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a última mudança' }));
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('voltam a começar em 11/2026'));
    expect(rpcs('fn_piquetes_mudar_inicio_desfazer')[0].a).toMatchObject({ p_grupo: 'g', p_simular: true });
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'era 11 mesmo' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    expect(rpcs('fn_piquetes_mudar_inicio_desfazer').filter(c => c.a.p_simular === false)).toHaveLength(1);
    expect(estado.toasts).toEqual(['Mudança de início desfeita.']);
  });

  it('sem nenhum desenho: o lugar do mapa diz isso (antes abria o Brasil inteiro)', async () => {
    abrir({ semDesenho: true });
    expect(screen.getByTestId('mudar-inicio-sem-desenho').textContent).toContain('não têm desenho no mapa');
    expect(screen.queryByTestId('previa-com-mapa')).toBeNull();
  });
});
