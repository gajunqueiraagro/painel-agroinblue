/**
 * PASTO-CADASTRO-GEO-01 (3) — o vai-e-vem cadastro ↔ Geo (OK do Gabriel 11/11 12:28):
 *   P1 a faixa da ficha diz "cadastro × mapa · %" (âmbar a partir de 20%; 0 desenho = "sem desenho"; 2+ = "N desenhos", sem %);
 *   P2 "Ver/editar no mapa" (ou "Desenhar no mapa" sem desenho) — com mudança não salva, pergunta antes de sair; o desenho pedido pela
 *      ficha já nasce LIGADO ao pasto (`criarDoDesenho`);
 *   P3 a mesma ficha aberta no mapa vem SEM o botão do mapa (quem a abre não passa `aoAbrirNoMapa`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) },
}));

import { FichaDoPasto } from './FichaDoPasto';
import { API_FICHA_DO_PASTO, FORM_VAZIO, cadastroXMapa, type ApiFichaDoPasto, type FichaLida } from '@/lib/pastos/fichaDoPasto';
import { criarDoDesenho } from '@/hooks/useEdicaoDoPoligono';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const base = { areaOficial: 76.3, areaMapa: 76.71, difPct: 0.5, nPoligonos: 1 };

describe('P1 — cadastro × mapa na faixa', () => {
  it('um desenho: os dois números e a %; âmbar só a partir de 20%', () => {
    expect(cadastroXMapa(base, fmt)).toEqual({ texto: '76,30 × 76,71 ha · +0,5%', alerta: false });
    expect(cadastroXMapa({ ...base, areaMapa: 95.4, difPct: 25 }, fmt)).toEqual({ texto: '76,30 × 95,40 ha · +25,0%', alerta: true });
    expect(cadastroXMapa({ ...base, areaMapa: 60, difPct: -21.4 }, fmt).alerta).toBe(true);
    expect(cadastroXMapa({ ...base, difPct: 19.9 }, fmt).alerta).toBe(false);
  });
  it('sem desenho e com 2+ desenhos: sem a % (o banco não dá área única)', () => {
    expect(cadastroXMapa({ ...base, areaMapa: null, difPct: null, nPoligonos: 0 }, fmt)).toEqual({ texto: '76,30 ha · sem desenho', alerta: true });
    expect(cadastroXMapa({ ...base, areaMapa: null, difPct: null, nPoligonos: 3 }, fmt)).toEqual({ texto: '76,30 ha · 3 desenhos', alerta: true });
  });
});

describe('P2 — o desenho pedido pela ficha nasce ligado ao pasto', () => {
  it('com o pasto: criar.pasto_id; sem ele, o desenho de sempre (sem pasto)', () => {
    expect(criarDoDesenho({ type: 'Polygon' }, ' P19A ', 'p19a')).toEqual({ geojson: { type: 'Polygon' }, nome_original: 'P19A', pasto_id: 'p19a' });
    expect(criarDoDesenho({ type: 'Polygon' }, 'Novo', null)).toEqual({ geojson: { type: 'Polygon' }, nome_original: 'Novo' });
  });
});

function abrir(lida: Partial<FichaLida>, aoAbrirNoMapa?: (desenhar: boolean) => void) {
  const LIDA: FichaLida = {
    form: { ...FORM_VAZIO, nome: 'P20', tipoUso: 'cria', area: 76.3, areaDesde: '2026-11' }, versao: 1, travaDaArea: null, anoMes: '2026-11',
    resumo: { forrageira: null, reforma: null, avaliacao: null, suporte: null, epoca: null }, ...base, ...lida,
  };
  const api: ApiFichaDoPasto = { ...API_FICHA_DO_PASTO, ler: async () => ({ ok: true, dados: LIDA }), infra: async () => ({ ok: true, dados: [] }) };
  const aoFechar = vi.fn();
  render(<FichaDoPasto pastoId="p20" fazendaId="f1" fazendaNome="PUR · Faz. Pureza" clienteId="c1" mesDeHoje="2026-11" hoje="2026-11-11"
    podeEditar aoFechar={aoFechar} aoGravar={vi.fn()} api={api} aoAbrirNoMapa={aoAbrirNoMapa} />);
  return { aoFechar };
}

describe('P2/P3 — o botão do mapa na ficha', () => {
  it('com desenho: "Ver/editar no mapa" e a faixa cadastro × mapa', async () => {
    const ir = vi.fn();
    abrir({}, ir);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver/editar no mapa' }));
    expect(ir).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('ficha-cadastro-x-mapa').textContent).toBe('76,30 × 76,71 ha · +0,5%');
  });
  it('sem desenho: "Desenhar no mapa" pede o desenho', async () => {
    const ir = vi.fn();
    abrir({ areaMapa: null, difPct: null, nPoligonos: 0 }, ir);
    fireEvent.click(await screen.findByRole('button', { name: 'Desenhar no mapa' }));
    expect(ir).toHaveBeenCalledWith(true);
  });
  it('com mudança não salva, pergunta antes de ir ao mapa', async () => {
    const ir = vi.fn();
    const { aoFechar } = abrir({}, ir);
    await screen.findByDisplayValue('P20');
    fireEvent.click(screen.getByTestId('ficha-aba-infra'));
    fireEvent.click(await screen.findByRole('button', { name: 'Suficiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver/editar no mapa' }));
    expect(ir).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Ir ao mapa sem salvar' }));
    expect(ir).toHaveBeenCalledWith(false);
    expect(aoFechar).not.toHaveBeenCalled();
  });
  it('P3: a ficha aberta no mapa (sem `aoAbrirNoMapa`) não tem o botão', async () => {
    abrir({});
    await screen.findByDisplayValue('P20');
    expect(screen.queryByTestId('ficha-abrir-no-mapa')).toBeNull();
  });
});
