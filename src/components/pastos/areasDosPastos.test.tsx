/**
 * PASTO-AREA-OFICIAL-01 · tela — o modo "Áreas" com a API INJETADA (nada fala com o banco).
 *   A1 a tabela: as colunas, a ordem padrão (diferença % mais negativa primeiro), a última mudança, o rodapé com as somas; travado e
 *      sem polígono com a caixa apagada e o motivo no `title`
 *   A2 marcar: o botão conta os marcados; "marcar todos" marca só os que podem
 *   A3 "Usar área do mapa": a prévia do banco (simular, o mês escolhido) pasto a pasto com a lotação antes × depois; sem motivo, o campo
 *      fica vermelho e nada vai ao banco; com motivo grava só os marcados e relê
 *   A4 prévia com recusa: o gravar fica apagado e a frase diz por quê
 *   A5 o mês anterior: relê a comparação do mês e limpa os marcados
 *   A6 desfazer: a prévia ("volta de X para Y") e, com motivo, o desfazer da última mudança
 *   P1 as contas puras: quem pode ser marcado e por quê não; os meses oferecidos (janeiro → dezembro do ano anterior); a leitura tolerante
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { AreasDosPastos } from './AreasDosPastos';
import { lerLinhas, mesesOferecidos, podeUsarMapa, porQueNaoMarca, type ApiAreaOficial, type LinhaDeArea } from '@/lib/pastos/areaOficial';

const linha = (p: Partial<LinhaDeArea>): LinhaDeArea => ({
  pastoId: 'x', nome: 'X', ativo: true, oficial: 100, mapa: 90, nPoligonos: 1, difHa: -10, difPct: -10, ultimaId: null, ultimaOrigem: null,
  ultimaDesde: null, ultimaAnterior: null, trava: null, ...p,
});
const LINHAS: LinhaDeArea[] = [
  linha({ pastoId: 'p12a', nome: 'P12A', oficial: 126.4, mapa: 45.22, difHa: -81.18, difPct: -64.2 }),
  linha({ pastoId: 'p3', nome: 'P3', oficial: 50, mapa: 52, difHa: 2, difPct: 4 }),
  linha({ pastoId: 'p7', nome: 'P7 fechado', oficial: 30, mapa: 33, difHa: 3, difPct: 10, trava: 'o pasto está fechado em 11/2026' }),
  linha({ pastoId: 'p9', nome: 'P9 sem mapa', oficial: 20, mapa: null, nPoligonos: 0, difHa: null, difPct: null }),
  linha({ pastoId: 'p5', nome: 'P5', oficial: 40, mapa: 40, difHa: 0, difPct: 0, ultimaId: 'v5', ultimaOrigem: 'mapa', ultimaDesde: '2026-11-01', ultimaAnterior: 44 }),
];

let comparar: ReturnType<typeof vi.fn>;
let usarMapa: ReturnType<typeof vi.fn>;
let desfazer: ReturnType<typeof vi.fn>;
const api = (): ApiAreaOficial => ({ comparar: (...a) => comparar(...a), usarMapa: (...a) => usarMapa(...a), desfazer: (...a) => desfazer(...a) });
const aoGravar = vi.fn();
const montar = () => render(<AreasDosPastos fazendaId="f1" fazendaCodigo="EXS" podeEditar api={api()} hoje="2026-11-01" aoGravar={aoGravar} />);
const linhaDe = (nome: string) => screen.getAllByTestId('areas-linha').find((tr) => tr.textContent?.includes(nome))!;

beforeEach(() => {
  cleanup(); aoGravar.mockReset();
  comparar = vi.fn(async () => ({ ok: true, dados: LINHAS }));
  usarMapa = vi.fn(async (ids: string[]) => ({ ok: true, dados: {
    ok: true, nMuda: ids.length, nIgual: 0, nRecusa: 0,
    itens: ids.map((id) => ({ pastoId: id, nome: id.toUpperCase(), situacao: 'muda', motivo: null, antes: 126.4, mapa: 45.22, difHa: -81.18, difPct: -64.2,
      lotacaoMes: '2026-11', uaHaAntes: 1.2, uaHaDepois: 3.35 })),
  } }));
  desfazer = vi.fn(async (_ids: string[], _m: string, _s: boolean) => ({ ok: true, dados: { ok: true, itens: [{ vigenciaId: 'v5', nome: 'P5', area: 40, voltaPara: 44, recusa: null }] } }));
});

describe('PASTO-AREA-OFICIAL-01 — o modo "Áreas"', () => {
  it('A1 a tabela: colunas, ordem pela diferença %, última mudança, rodapé; travado e sem polígono apagados com o motivo', async () => {
    montar();
    await screen.findAllByTestId('areas-linha');
    expect(comparar).toHaveBeenCalledWith('f1', '2026-11');
    const cab = within(screen.getByTestId('areas-tabela')).getAllByRole('columnheader').map((th) => th.textContent?.replace(/[↑↓↕]/g, '').trim());
    expect(cab.slice(1)).toEqual(['Pasto', 'Oficial (ha)', 'Mapa (ha)', 'Dif. (ha)', 'Dif. (%)', 'Última mudança']);
    expect(screen.getAllByTestId('areas-linha')[0].textContent).toContain('P12A');
    expect(linhaDe('P12A').textContent).toContain('-64,2%');
    expect(linhaDe('P5').textContent).toContain('do mapa · desde 11/2026');
    expect(screen.getByTestId('areas-rodape').textContent).toContain('5 pastos');
    expect(screen.getByTestId('areas-rodape').textContent).toContain('266,40');
    const caixaFechado = within(linhaDe('P7 fechado')).getByTestId('areas-marcar');
    expect(caixaFechado.hasAttribute('disabled')).toBe(true);
    expect(caixaFechado.getAttribute('title')).toBe('A área não muda: o pasto está fechado em 11/2026.');
    expect(within(linhaDe('P9 sem mapa')).getByTestId('areas-marcar').getAttribute('title')).toBe('O pasto não tem polígono no mapa.');
    expect(within(linhaDe('P5')).getByTestId('areas-marcar').getAttribute('title')).toBe('A área oficial já é a do mapa.');
  });

  it('A2 marcar: o botão conta; "marcar todos" marca só os que podem', async () => {
    montar();
    await screen.findAllByTestId('areas-linha');
    expect((screen.getByTestId('areas-usar-mapa') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(linhaDe('P3')).getByTestId('areas-marcar'));
    expect(screen.getByTestId('areas-usar-mapa').textContent).toBe('Usar área do mapa · 1');
    fireEvent.click(screen.getByTestId('areas-marcar-todos'));
    expect(screen.getByTestId('areas-usar-mapa').textContent).toBe('Usar área do mapa · 2');
    fireEvent.click(screen.getByTestId('areas-marcar-todos'));
    expect((screen.getByTestId('areas-usar-mapa') as HTMLButtonElement).disabled).toBe(true);
  });

  it('A3 "Usar área do mapa": a prévia do banco, o motivo obrigatório e a gravação dos marcados', async () => {
    montar();
    await screen.findAllByTestId('areas-linha');
    fireEvent.click(within(linhaDe('P12A')).getByTestId('areas-marcar'));
    fireEvent.click(screen.getByTestId('areas-usar-mapa'));
    const linhaPrevia = await screen.findByTestId('areas-previa-linha');
    expect(usarMapa).toHaveBeenCalledWith(['p12a'], '2026-11', 'prévia', true);
    expect(linhaPrevia.textContent).toContain('1,20');
    expect(linhaPrevia.textContent).toContain('3,35');
    expect(screen.getByTestId('areas-previa-frase').textContent).toBe('1 pasto passa a usar a área do mapa de 11/2026 em diante; os meses antes não mudam.');
    fireEvent.click(screen.getByTestId('areas-gravar'));
    expect(usarMapa).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('areas-motivo').className).toContain('border-destructive');
    fireEvent.change(screen.getByTestId('areas-motivo'), { target: { value: ' o mapa foi medido com GPS ' } });
    fireEvent.click(screen.getByTestId('areas-gravar'));
    await waitFor(() => expect(usarMapa).toHaveBeenCalledTimes(2));
    expect(usarMapa.mock.calls[1]).toEqual([['p12a'], '2026-11', 'o mapa foi medido com GPS', false]);
    await waitFor(() => expect(aoGravar).toHaveBeenCalled());
    expect(comparar).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('areas-dialog')).toBeNull();
  });

  it('A4 prévia com recusa: gravar apagado e a frase diz por quê', async () => {
    usarMapa = vi.fn(async () => ({ ok: true, dados: { ok: false, nMuda: 1, nIgual: 0, nRecusa: 1, itens: [
      { pastoId: 'p3', nome: 'P3', situacao: 'recusa', motivo: 'A área não muda: o pasto está fechado em 11/2026.', antes: 50, mapa: 52, difHa: 2, difPct: 4, lotacaoMes: null, uaHaAntes: null, uaHaDepois: null }] } }));
    montar();
    await screen.findAllByTestId('areas-linha');
    fireEvent.click(within(linhaDe('P3')).getByTestId('areas-marcar'));
    fireEvent.click(screen.getByTestId('areas-usar-mapa'));
    await screen.findByTestId('areas-previa-linha');
    expect((screen.getByTestId('areas-gravar') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('areas-previa-frase').textContent).toBe('1 pasto não pode usar a área do mapa (veja a linha). Desmarque e tente de novo.');
    expect(screen.getByTestId('areas-previa-linha').textContent).toContain('o pasto está fechado em 11/2026');
  });

  it('A5 o mês anterior relê a comparação e limpa os marcados', async () => {
    montar();
    await screen.findAllByTestId('areas-linha');
    fireEvent.click(within(linhaDe('P3')).getByTestId('areas-marcar'));
    fireEvent.click(screen.getByRole('button', { name: '10/2026' }));
    await waitFor(() => expect(comparar).toHaveBeenLastCalledWith('f1', '2026-10'));
    expect((screen.getByTestId('areas-usar-mapa') as HTMLButtonElement).disabled).toBe(true);
  });

  it('A6 desfazer: a prévia e o desfazer da última mudança com motivo', async () => {
    montar();
    await screen.findAllByTestId('areas-linha');
    fireEvent.click(within(linhaDe('P5')).getByTestId('areas-desfazer'));
    await waitFor(() => expect(screen.getByTestId('areas-desfazer-frase').textContent).toBe('P5 volta de 40,00 ha para 44,00 ha desde 11/2026. A mudança fica na trilha.'));
    expect(desfazer).toHaveBeenCalledWith(['v5'], 'prévia', true);
    fireEvent.click(screen.getByTestId('areas-desfazer-gravar'));
    expect(desfazer).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId('areas-desfazer-motivo'), { target: { value: 'adotei por engano' } });
    fireEvent.click(screen.getByTestId('areas-desfazer-gravar'));
    await waitFor(() => expect(desfazer).toHaveBeenCalledTimes(2));
    expect(desfazer.mock.calls[1]).toEqual([['v5'], 'adotei por engano', false]);
    await waitFor(() => expect(aoGravar).toHaveBeenCalled());
  });
});

describe('PASTO-AREA-OFICIAL-01 — as contas puras', () => {
  it('P1 quem pode ser marcado, por quê não; os meses; a leitura tolerante', () => {
    expect(podeUsarMapa(linha({}))).toBe(true);
    expect(podeUsarMapa(linha({ trava: 'x' }))).toBe(false);
    expect(podeUsarMapa(linha({ mapa: 0 }))).toBe(false);
    expect(podeUsarMapa(linha({ mapa: 100 }))).toBe(false);
    expect(porQueNaoMarca(linha({ nPoligonos: 0, mapa: null }))).toBe('O pasto não tem polígono no mapa.');
    expect(porQueNaoMarca(linha({ mapa: 0 }))).toBe('O polígono do mapa não tem área.');
    expect(porQueNaoMarca(linha({}))).toBeNull();
    expect(mesesOferecidos('2026-11-01')).toEqual(['2026-10', '2026-11']);
    expect(mesesOferecidos('2027-01-15')).toEqual(['2026-12', '2027-01']);
    expect(lerLinhas([{ pasto_id: 'a', nome: 'A', area_oficial_ha: '10.5', area_mapa_ha: null, n_poligonos: 0, ultima_origem: 'outra' }, 'lixo', { nome: 'sem id' }]))
      .toEqual([linha({ pastoId: 'a', nome: 'A', oficial: 10.5, mapa: null, nPoligonos: 0, difHa: null, difPct: null })]);
  });
});
