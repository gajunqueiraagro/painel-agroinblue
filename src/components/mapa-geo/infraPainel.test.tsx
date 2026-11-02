/**
 * MAPA-02f-b — a infraestrutura como PONTO: a lib (tipos/rótulos do banco, o pasto onde o ponto caiu, o que vai à fn_infra_salvar) e o
 * painel (prévia antes de gravar; desativar só com motivo; a recusa do banco no painel, nunca toast).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { argumentoDaInfra, contagemPorTipo, pastoNoPonto, TIPOS_INFRA, tipoDePontoPeloRotulo } from '@/lib/mapa/infraestrutura';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => Promise.resolve({ data: [], error: null }) } }));
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign((...a: unknown[]) => toast(...a), { error: toast, success: toast }) }));

import { InfraPainel } from './InfraPainel';

describe('infraestrutura (lib)', () => {
  it('os 14 tipos com os rótulos do banco (_fn_infra_rotulo); a cerca não se coloca como ponto (02f-c)', () => {
    expect(TIPOS_INFRA.map(t => t.rotulo)).toEqual(['Cocho', 'Bebedouro', 'Saleiro', 'Curral', 'Tronco / brete', 'Balança', 'Porteira', 'Cerca',
      'Poço', 'Represa / açude', "Caixa d'água", 'Sede / casa', 'Galpão', 'Energia']);
    expect(tipoDePontoPeloRotulo('Cerca')).toBeNull();
    expect(tipoDePontoPeloRotulo('Tronco / brete')).toBe('tronco_brete');
    expect(TIPOS_INFRA.filter(t => t.ponto)).toHaveLength(13);
  });
  it('o pasto onde o ponto caiu (e fora de pasto = null)', () => {
    const geo = [{ pasto_id: 'p1', geojson: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }];
    expect(pastoNoPonto(0.5, 0.5, geo)).toBe('p1');
    expect(pastoNoPonto(2, 2, geo)).toBeNull();
  });
  it('o p_infra: ao criar leva a fazenda; ao editar, id e versão (sem fazenda); vazio vira null', () => {
    const base = { fazendaId: 'f', tipo: 'cocho' as const, lon: -47, lat: -20, nome: ' ', pastoId: null, bemId: null, observacao: '' };
    expect(argumentoDaInfra(base)).toEqual({ fazenda_id: 'f', tipo: 'cocho', geometria: { type: 'Point', coordinates: [-47, -20] }, nome: null, pasto_id: null, bem_id: null, observacao: null });
    const editar = argumentoDaInfra({ ...base, id: 'i1', versao: 3, nome: 'Cocho A' });
    expect(editar).toMatchObject({ id: 'i1', versao: 3, nome: 'Cocho A' });
    expect('fazenda_id' in editar).toBe(false);
  });
  it('a contagem do filtro só com os tipos presentes', () => {
    expect(contagemPorTipo([{ tipo: 'cocho' }, { tipo: 'cocho' }, { tipo: 'poco' }])).toEqual([{ tipo: 'cocho', rotulo: 'Cocho', n: 2 }, { tipo: 'poco', rotulo: 'Poço', n: 1 }]);
  });
});

function renderiza(infra: Parameters<typeof InfraPainel>[0]['infra'], salvar = vi.fn(), desativar = vi.fn(), criarBem = vi.fn()) {
  const onGravou = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <InfraPainel className="" fazendaId="f" clienteId="c" tipo="cocho" infra={infra} ponto={{ lon: -47, lat: -20 }} pastoSugerido="p1"
      pastos={[{ id: 'p1', nome: 'P_01', ativo: true }]} bens={[]} salvar={salvar} desativar={desativar} criarBem={criarBem}
      onEditando={() => undefined} onGravou={onGravou} onFechar={() => undefined} />
  </QueryClientProvider>);
  return onGravou;
}

describe('InfraPainel', () => {
  it('NOVO: Gravar só depois da prévia (fn_infra_salvar com simular, depois sem); o pasto sugerido já vem escolhido', async () => {
    const salvar = vi.fn((_c: unknown, simular: boolean) => Promise.resolve({ ok: true, dado: simular ? { rotulo: 'Cocho', pasto: { nome: 'P_01' }, avisos: [] } : { ok: true }, motivo: null }));
    const onGravou = renderiza(null, salvar);
    expect(screen.getByText('Veja a prévia antes.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText(/Cocho · no P_01/);
    expect(salvar).toHaveBeenLastCalledWith(expect.objectContaining({ pastoId: 'p1', tipo: 'cocho' }), true);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(onGravou).toHaveBeenCalled());
    expect(salvar).toHaveBeenLastCalledWith(expect.objectContaining({ pastoId: 'p1' }), false);
  });

  const lida = { id: 'i1', fazenda_id: 'f', tipo: 'cocho', geometria: { type: 'Point', coordinates: [-47, -20] }, nome: 'Cocho A', pasto_id: 'p1',
    bem_id: null, observacao: null, versao: 2, criado_em: '2026-10-20T10:00:00Z', criado_por: null };

  it('VER: só leitura; Desativar pede o motivo antes de qualquer chamada', async () => {
    const desativar = vi.fn(() => Promise.resolve({ ok: true, dado: { ok: true }, motivo: null }));
    renderiza(lida, vi.fn(), desativar);
    expect(screen.getByTestId('infra-leitura').textContent).toContain('P_01');
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(screen.getByText('Diga o motivo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver prévia' })).toHaveProperty('disabled', true);
    expect(desativar).not.toHaveBeenCalled();
  });

  it('a recusa do banco aparece no painel (nunca toast)', async () => {
    const salvar = vi.fn(() => Promise.resolve({ ok: false, dado: null, motivo: 'O pasto escolhido não é desta fazenda.' }));
    renderiza(null, salvar);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('O pasto escolhido não é desta fazenda.')).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('InfraPainel — a FICHA e o bem do Patrimônio (INFRA-FICHAS-PATR-01)', () => {
  const comFicha = { id: 'i1', fazenda_id: 'f', tipo: 'cocho', geometria: { type: 'Point', coordinates: [-47, -20] }, nome: 'Cocho A', pasto_id: 'p1',
    bem_id: null, observacao: null, versao: 2, criado_em: '2026-10-20T10:00:00Z', criado_por: null,
    ficha: { material: 'Concreto', comprimento_m: 12, lados: 2, coberto: true, uso: 'Sal mineral' } };

  it('NOVO: lados e coberto pelo Segmentado; os metros úteis aparecem; a ficha vai LIMPA ao banco', async () => {
    const salvar = vi.fn((_c: unknown, simular: boolean) => Promise.resolve({ ok: true, dado: simular ? { rotulo: 'Cocho', avisos: [] } : { ok: true }, motivo: null }));
    renderiza(null, salvar);
    expect(screen.getByTestId('infra-metros-uteis').textContent).toContain('—');
    fireEvent.click(screen.getByRole('button', { name: '2 lados' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenLastCalledWith(expect.objectContaining({ ficha: { lados: 2, coberto: true } }), true);
  });

  it('VER: a ficha lida (com os metros úteis) e, sem bem, "Criar bem no Patrimônio"', () => {
    renderiza(comFicha);
    const ler = screen.getByTestId('infra-ficha-ler').textContent ?? '';
    expect(ler).toContain('Concreto');
    expect(ler).toContain('24,0 m lineares');
    expect(screen.getByTestId('infra-sem-bem')).toBeTruthy();
  });

  it('CRIAR BEM: sem "em uso desde" não chama o banco e diz por quê; com a data, a prévia leva categoria, descrição e vida útil em meses', async () => {
    const criarBem = vi.fn((_i: string, _v: number, _b: Record<string, unknown>, simular: boolean) => Promise.resolve({ ok: true, motivo: null,
      dado: simular ? { bem: { categoria: { nome: 'Instalações' }, vida_util_meses: 240, residual_pct: 0, avisos: [] } } : { ok: true } }));
    const onGravou = renderiza(comFicha, vi.fn(), vi.fn(), criarBem);
    fireEvent.click(screen.getByRole('button', { name: 'Criar bem no Patrimônio' }));
    expect(screen.getByTestId('infra-vida-sugerida').textContent).toContain('20 anos');
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(screen.getAllByText('Informe desde quando está em uso.').length).toBeGreaterThan(0);
    expect(criarBem).not.toHaveBeenCalled();
    const data = screen.getByPlaceholderText('dd/mm/aaaa');
    fireEvent.change(data, { target: { value: '15/03/2024' } });
    fireEvent.blur(data);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText(/Nasce em Instalações/);
    expect(criarBem).toHaveBeenLastCalledWith('i1', 2, expect.objectContaining({ categoria_codigo: 'instalacoes', em_uso_desde: '2024-03-15',
      atividade: 'pecuaria', origem_valor: 'lancamentos', vida_util_meses: 240,
      descricao: 'Cocho de concreto coberto · 12 m · 2 lados (24 m úteis) · sal mineral · P_01' }), true);
    fireEvent.click(screen.getByRole('button', { name: 'Criar bem e ligar' }));
    await waitFor(() => expect(onGravou).toHaveBeenCalled());
    expect(criarBem).toHaveBeenLastCalledWith('i1', 2, expect.anything(), false);
    expect(toast).not.toHaveBeenCalled();
  });
});
