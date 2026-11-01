/**
 * MAPA-AREA-TIPO-01 — o gesto "É pasto / É área + tipo / Sem classificação" no painel do polígono da Validação.
 * Grava SÓ pelo escritor `fn_mapa_geometria_classificar` (prévia com p_simular true; gravar com false); a recusa do banco aparece no
 * painel (nunca toast); o botão desabilitado diz por quê; os tipos e rótulos são os do banco.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { argumentosDoEscritor, rotuloDoTipo, TIPOS_DE_AREA } from '@/lib/mapa/tiposDeArea';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
const toast = vi.fn();
vi.mock('sonner', () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: toast, success: toast }) }));

import { ClassificarPoligono } from './ClassificarPoligono';

const geo = { id: 'g1', pasto_id: null, tipo: 'outra', nome_original: 'Curral Velho' };
const pastos = [{ id: 'p1', nome: 'P16', ativo: true }];

function renderiza(tipoInicial: 'curral' | null = null) {
  const onGravou = vi.fn();
  render(<ClassificarPoligono geo={geo} pastos={pastos} geometrias={[geo]} tipoInicial={tipoInicial} onGravou={onGravou} onFechar={() => undefined} />);
  return onGravou;
}

describe('tipos de área (lib)', () => {
  it('os 9 tipos com os rótulos do banco (_fn_mapa_tipo_rotulo); degradada/erosão não são tipo', () => {
    expect(TIPOS_DE_AREA.map(t => t.rotulo)).toEqual(['Área da fazenda', 'Área sem uso (terceiros)', 'Reserva legal / mata nativa', 'APP',
      'Várzea / brejo', 'Sede / benfeitorias', 'Estrada', 'Curral', 'Confinamento']);
    expect(rotuloDoTipo('outra')).toBe('Sem classificação');
    expect(TIPOS_DE_AREA.some(t => /degrad|eros|reforma|recupera/i.test(t.rotulo))).toBe(false);
  });
  it('os argumentos do escritor: o pasto só quando é pasto', () => {
    expect(argumentosDoEscritor('g1', { tipo: 'curral' }, true)).toEqual({ p_geometria: 'g1', p_tipo: 'curral', p_pasto: null, p_motivo: null, p_simular: true });
    expect(argumentosDoEscritor('g1', { tipo: 'pasto', pastoId: 'p1' }, false, ' x ').p_pasto).toBe('p1');
  });
});

describe('ClassificarPoligono (painel da Validação)', () => {
  beforeEach(() => { rpc.mockReset(); toast.mockReset(); });

  it('vindo do Adicionar › Área (curral): a prévia do banco aparece e Gravar chama o escritor SEM simular', async () => {
    rpc.mockImplementation((_n: string, a: { p_simular: boolean }) => Promise.resolve(a.p_simular
      ? { data: { ok: true, simulado: true, de: { rotulo: 'Sem classificação' }, para: { rotulo: 'Curral' } }, error: null }
      : { data: { ok: true, simulado: false }, error: null }));
    const onGravou = renderiza('curral');
    await screen.findByText('Curral');
    expect(rpc).toHaveBeenCalledWith('fn_mapa_geometria_classificar', expect.objectContaining({ p_tipo: 'curral', p_simular: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(onGravou).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith('fn_mapa_geometria_classificar', expect.objectContaining({ p_tipo: 'curral', p_simular: false }));
  });

  it('a recusa do banco aparece no painel (nunca toast) e trava o Gravar', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'O pasto "P16" já está ligado ao polígono "P16". Desvincule lá antes.' } });
    renderiza('curral');
    expect(await screen.findByText(/já está ligado/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gravar' })).toHaveProperty('disabled', true);
    expect(toast).not.toHaveBeenCalled();
  });

  it('sem escolher o tipo: o Gravar fica desabilitado e diz por quê (e nada de área é pedido ao banco)', () => {
    rpc.mockResolvedValue({ data: { ok: true, simulado: true, sem_mudanca: true }, error: null }); // abre em "Sem classificação": nada muda
    renderiza(null);
    fireEvent.click(screen.getByText('É área'));
    expect(screen.getByText('Escolha o tipo de área.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gravar' })).toHaveProperty('disabled', true);
    expect(rpc.mock.calls.every(c => c[1].p_tipo === 'outra')).toBe(true);
  });
});
