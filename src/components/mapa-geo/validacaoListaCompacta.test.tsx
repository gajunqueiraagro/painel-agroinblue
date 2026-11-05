/* MAPA-LISTA-COMPACTA-01 (Gabriel 03/11 11:01, Validação da Pureza: fonte grande, linha alta, nomes cortados) — a régua da tabela na lista:
   linha de 26 px a 10 px; 4 colunas (o nome ganha a sobra); o nome e a etiqueta do vínculo em dois pedaços (o nome tem a prioridade), o inteiro
   no title; área a 9,5 px; ícones de 12 px; a faixa de ações em 2 linhas de 20 px. (O jsdom não mede: as medidas de verdade estão nas fotos.) */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: () => ({}) } }));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const geo = (id: string, nome: string, pasto_id: string | null, tipo: string) => ({ id, fazenda_id: 'faz', cliente_id: 'cli', pasto_id, tipo, nome_original: nome,
  geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '' });
const GEOS = [geo('a', '12-Retiro', 'p1', 'pasto'), geo('b', 'P_01', 'p2', 'pasto'), geo('c', 'Praça P_16', null, 'outra')];
const PASTOS = [{ id: 'p1', nome: 'P12A' }, { id: 'p2', nome: 'P_01' }];
const abrir = () => render(<ValidacaoPoligonosView geometrias={GEOS as never} pastos={PASTOS as never}
  geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);

beforeEach(() => { cleanup(); sessionStorage.clear(); });

describe('MAPA-LISTA-COMPACTA-01 · a lista da Validação na régua pequena', () => {
  it('a linha: 26 px a 10 px, 4 colunas (o nome sem largura fixa), área a 9,5 px', () => {
    abrir();
    const linhas = screen.getAllByTestId('validacao-linha');
    expect(linhas[0].className).toContain('h-[26px]');
    const tabela = linhas[0].closest('table');
    expect(tabela?.className).toContain('text-[10px]');
    const cols = [...(tabela?.querySelectorAll('col') ?? [])].map(c => c.style.width);
    expect(cols).toEqual(['18px', '', '42px', '50px']);
    expect(within(linhas[0]).getByTestId('validacao-area').className).toContain('text-[9.5px]');
  });
  it('o nome e o vínculo são dois pedaços: o vínculo de outro nome vira etiqueta cinza; o mesmo nome vira "pasto"; o inteiro no title', () => {
    abrir();
    const [a, b, c] = screen.getAllByTestId('validacao-nome');
    expect(within(a).getByTestId('validacao-nome-texto').textContent).toBe('12-Retiro');
    expect(within(a).getByTestId('validacao-selo-pasto').textContent).toBe('P12A');
    expect(within(a).getByTestId('validacao-selo-pasto').className).toContain('text-muted-foreground');
    expect(a.getAttribute('title')).toBe('12-Retiro · Pasto → P12A');
    expect(within(b).getByTestId('validacao-selo-pasto').textContent).toBe('pasto');
    expect(within(c).getByTestId('validacao-selo').textContent).toBe('sem vínculo');
    expect(within(c).getByTestId('validacao-selo').className).toContain('text-orange-600');
    /* o nome tem a prioridade: não encolhe (só corta se não couber sozinho); a etiqueta encolhe primeiro */
    expect(within(a).getByTestId('validacao-nome-texto').className).toContain('flex-none');
    expect(within(a).getByTestId('validacao-selo-pasto').className).toContain('min-w-0');
  });
  it('ícones de 12 px em 15 px (lugar reservado) e a faixa de ações em 2 linhas de 20 px', () => {
    abrir();
    const botoes = within(screen.getAllByTestId('validacao-linha')[0]).getAllByRole('button');
    expect(botoes).toHaveLength(3);
    /* classe exata: a base do Button tem `[&_svg]:size-3.5` (14 px), que contém o texto `[&_svg]:size-3` */
    botoes.forEach(b => { const cl = b.className.split(/\s+/); expect(cl).toContain('h-[15px]'); expect(cl).toContain('w-[15px]'); expect(cl).toContain('[&_svg]:size-3'); });
    expect(screen.getByTestId('validacao-lista-acoes').className).toContain('h-[42px]');
  });
});
