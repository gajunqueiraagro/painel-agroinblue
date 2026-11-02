/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — a barra e a lista do "Criar piquetes": os data-testid que o gate mede, a marca de cromo, os botões que
 * dependem de seleção só com seleção, a pergunta do Cancelar, o rascunho e a seção própria da prévia (praça, corredor, cocho).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ rpc: [] as { fn: string; a: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      estado.rpc.push({ fn, a });
      const piq = Array.isArray(a.p_piquetes) ? a.p_piquetes : [];
      return Promise.resolve({ error: null, data: {
        caso: 'novo', contorno: { area_ha: 97.5 }, soma_ha: 97.3, dif_contorno_ha: 0.2, concluir: { frase: 'frase do banco' },
        piquetes: piq.map((x: { nome: string }) => ({ nome: x.nome, area_ha: 24.3, liga: 'novo' })),
      } });
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));

import { CriarPiquetesNoMapa } from './CriarPiquetes';
import { useCriarPiquetes, type CriarPiquetes } from '@/hooks/useCriarPiquetes';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}
const GEO = retangulo(97.5);
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'Modulo 03', geojson: GEO };
const PASTOS: { id: string; nome: string }[] = [];
const GEOMETRIAS: { id: string; pasto_id: string | null; geojson: GeoJSON.Geometry }[] = [{ id: 'geo-1', pasto_id: 'pasto-1', geojson: GEO }];

let piqAtual: CriarPiquetes;
function Host() {
  const piq = useCriarPiquetes({ mapa: null, pastos: PASTOS, geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} });
  piqAtual = piq;
  return <CriarPiquetesNoMapa piq={piq} />;
}
function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
async function abrir() {
  render(<Host />);
  act(() => piqAtual.abrir(PAI));
  await waitFor(() => expect(piqAtual.grupo.estado).toBe('ok'));
}

/* o jsdom não tem layout: a zona da barra mede `largura` e cada botão `60` (a conta do `arranjarZona` roda de verdade) */
function comLayout(largura: number, botao = 0) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => largura });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => botao });
}
beforeEach(() => { estado.rpc = []; vi.stubGlobal('localStorage', memoria()); comLayout(2000); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth'); Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth'); });

describe('a barra que se acomoda', () => {
  it('sem lugar, os botões vão para "Mais ▾" (nunca o Cancelar e a Prévia, que são fixos); com lugar, ficam na linha', async () => {
    comLayout(300, 60);
    await abrir();
    expect(screen.getByTestId('piquetes-mais')).toBeTruthy();
    expect(screen.getByTestId('piquetes-fixos').contains(screen.getByTestId('piquetes-previa'))).toBe(true);
    expect(screen.getByTestId('piquetes-fixos').contains(screen.getByTestId('piquetes-cancelar'))).toBe(true);
    expect(screen.queryByTestId('piquetes-desfazer')).toBeNull(); // o último botão foi para o menu
    expect(screen.queryByTestId('piquetes-regua')).toBeNull();
    cleanup();
    comLayout(5000, 60);
    await abrir();
    expect(screen.queryByTestId('piquetes-mais')).toBeNull();
    expect(screen.getByTestId('piquetes-igualar')).toBeTruthy();
  });
});

describe('a barra e a lista', () => {
  it('os testids de sempre, a barra marcada como cromo "cima" e a lista como "sobre o mapa"', async () => {
    await abrir();
    for (const id of ['piquetes-tela', 'barra-piquetes', 'piquetes-zona', 'piquetes-fixos', 'piquetes-linha-2', 'piquetes-lista', 'piquetes-previa', 'piquetes-cancelar']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('barra-piquetes').getAttribute('data-cromo')).toBe('cima');
    expect(screen.getByTestId('piquetes-lista').hasAttribute('data-sobre-o-mapa')).toBe(true);
    expect(screen.getByTestId('piquetes-fixos').contains(screen.getByTestId('piquetes-previa'))).toBe(true);
    expect(screen.getByTestId('piquetes-fixos').contains(screen.getByTestId('piquetes-cancelar'))).toBe(true);
  });

  it('abre em "Praça central" com Losango, 4 divisões, a praça na lista (0,18 ha) e as medidas na 2ª linha', async () => {
    await abrir();
    const zona = screen.getByTestId('piquetes-zona');
    expect(within(zona).getByTestId('piquetes-modo').textContent).toContain('Praça central');
    expect(within(zona).getByTestId('piquetes-praca-botao').textContent).toMatch(/Losango 60 m · 4 · cocho/);
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(4);
    expect(screen.getByTestId('piquetes-linha-praca').textContent).toContain('0,18');
    expect(screen.getByTestId('piquetes-medidas').textContent).toMatch(/4 divisões de 24,\d\d ha em média · praça 0,18 ha/);
    expect(screen.getByTestId('piquetes-previa')).toBeEnabled();
  });

  it('botões de seleção só com seleção: Apagar linha, Tirar ponto e o cadeado aparecem ao selecionar a cerca, com a frase "Cerca 2: …"', async () => {
    await abrir();
    expect(screen.queryByTestId('piquetes-apagar-linha')).toBeNull();
    expect(screen.queryByTestId('piquetes-cadeado')).toBeNull();
    expect(screen.queryByTestId('piquetes-frase-cerca')).toBeNull();
    act(() => piqAtual.setSelecionada('cerca-2'));
    expect(screen.getByTestId('piquetes-apagar-linha')).toBeTruthy();
    expect(screen.getByTestId('piquetes-tirar-ponto')).toBeDisabled();
    expect(screen.getByTestId('piquetes-cadeado').textContent).toContain('Solta');
    expect(screen.getByTestId('piquetes-frase-cerca').textContent).toMatch(/^Cerca 2: [\d.]+ m/);
    fireEvent.click(screen.getByTestId('piquetes-cadeado'));
    expect(screen.getByTestId('piquetes-cadeado').textContent).toContain('Fixa');
    fireEvent.click(screen.getByTestId('piquetes-apagar-linha'));
    expect(screen.queryByTestId('piquetes-apagar-linha')).toBeNull();
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(3);
  });

  it('Cancelar com trabalho pergunta "Descartar o que foi feito?" na 2ª linha; Continuar volta; Descartar fecha', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-cancelar'));
    expect(screen.queryByTestId('piquetes-tela')).toBeNull(); // nada feito: fecha direto
    cleanup();
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-praca-botao'));
    fireEvent.click(within(await screen.findByTestId('piquetes-praca')).getByText('6'));
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(6);
    fireEvent.click(screen.getByTestId('piquetes-cancelar'));
    expect(within(screen.getByTestId('piquetes-linha-2')).getByText('Descartar o que foi feito?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('piquetes-continuar-editando'));
    expect(screen.queryByTestId('piquetes-confirmar-cancelar')).toBeNull();
    fireEvent.click(screen.getByTestId('piquetes-cancelar'));
    fireEvent.click(screen.getByTestId('piquetes-descartar'));
    expect(screen.queryByTestId('piquetes-tela')).toBeNull();
  });

  it('o rascunho guardado aparece como "Continuar o rascunho de HH:MM?" e Continuar restaura', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-praca-botao'));
    fireEvent.click(within(await screen.findByTestId('piquetes-praca')).getByText('8'));
    await waitFor(() => expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).not.toBeNull());
    act(() => piqAtual.fechar());
    act(() => piqAtual.abrir(PAI));
    await waitFor(() => expect(screen.getByTestId('piquetes-rascunho').textContent).toMatch(/Continuar o rascunho de \d\d:\d\d\?/));
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(4);
    fireEvent.click(screen.getByTestId('piquetes-continuar-rascunho'));
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(8);
    expect(screen.queryByTestId('piquetes-rascunho')).toBeNull();
  });

  it('Nomear clicando mostra o prefixo e a próxima letra; a lista segue ordenada pelo nome', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-nomear'));
    expect(screen.getByTestId('piquetes-prefixo')).toHaveValue('Modulo 03-');
    expect(screen.getByTestId('piquetes-dica').textContent).toContain('a próxima é A');
    act(() => piqAtual.nomearDivisao(2));
    expect(screen.getByTestId('piquetes-dica').textContent).toContain('a próxima é B');
    const nomes = screen.getAllByTestId('piquetes-nome').map(x => (x instanceof HTMLInputElement ? x.value : ''));
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })));
    expect(nomes[0]).toBe('Modulo 03-A');
  });

  it('a prévia traz a seção própria (praça, cocho), o tipo e a frase do mock', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-previa'));
    const secao = await screen.findByTestId('piquetes-previa-secao');
    expect(secao.textContent).toContain('Praça de alimentação');
    expect(secao.textContent).toContain('benfeitoria (área da fazenda)');
    expect(secao.textContent).toContain('Cocho');
    expect(secao.textContent).toContain('infraestrutura');
    const frase = screen.getByTestId('piquetes-previa-frase-local').textContent ?? '';
    expect(frase).toContain('4 pastos novos (Modulo 03-A…D, 24,30 ha cada)');
    expect(frase).toContain('Praça de alimentação 0,18 ha (área da fazenda, dentro de Modulo 03)');
    expect(frase).toContain('Cocho no centro da praça (infraestrutura)');
    expect(frase).toContain('o contorno de Modulo 03 fica.');
  });

  it('Grade e N iguais seguem: 2 × 4 = 8 e os campos da grade', async () => {
    await abrir();
    const escolherModo = async (testid: string) => {
      fireEvent.keyDown(screen.getByTestId('piquetes-modo'), { key: 'Enter' });
      fireEvent.click(await screen.findByTestId(testid));
    };
    await escolherModo('piquetes-modo-grade');
    expect(screen.getByTestId('piquetes-grade').textContent).toContain('= 8');
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(8);
    expect(screen.queryByTestId('piquetes-linha-praca')).toBeNull();
    await escolherModo('piquetes-modo-iguais');
    expect(screen.getByTestId('piquetes-iguais')).toBeTruthy();
  });
});
