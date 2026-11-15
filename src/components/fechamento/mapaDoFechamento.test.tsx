/**
 * MAPA-LOTES-01 (C2) — o seletor "Cards | Mapa" do Fechamento de pastos: a vista Mapa pinta cada pasto pela MESMA situação do card, o
 * clique abre o MESMO modal (o `abrir` do `useModalDoPasto`), o pasto sem polígono vai para a faixa e abre o card dele, e a escolha
 * guardada no navegador nunca derruba a tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { lerVista, gravarVista, pastosSemDesenho, COR_DA_SITUACAO } from '@/lib/fechamento/vistaDoFechamento';
import type { DadosDoPopupDoPasto } from './PopupDoPasto';
import type { ComponentProps } from 'react';
import type { MapaDosPastos as MapaDosPastosReal } from '@/components/mapa-geo/MapaDosPastos';

const mapa = vi.hoisted(() => ({ props: null as null | ComponentProps<typeof MapaDosPastosReal>, geometrias: [] as unknown[] }));
vi.mock('@/hooks/usePastoGeometrias', () => ({ usePastoGeometrias: () => ({ geometrias: mapa.geometrias, loading: false }) }));
vi.mock('@/components/mapa-geo/MapaDosPastos', () => ({
  MapaDosPastos: (p: ComponentProps<typeof MapaDosPastosReal>) => { mapa.props = p; return <div data-testid="mapa-dos-pastos" />; },
}));
import { MapaDoFechamento } from './MapaDoFechamento';

const QUADRADO: GeoJSON.Geometry = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
const P13 = { id: 'p13', nome: 'P13' };
const P14 = { id: 'p14', nome: 'P14' };
const P_10 = { id: 'p10', nome: 'P_10' };
/* FECH-TOPO-02 — a dica é o popup dos cards: os dados vêm prontos (a mesma conta do card) */
const popupDe = (p: { id: string; nome: string }): DadosDoPopupDoPasto => p.id === 'p13'
  ? { nome: 'P13', lote: 'L-13', totalCab: 27, pesoMedioKg: 290, uaHa: 0.5, categorias: [{ nome: 'Desmama F', cab: 27, pesoMedioKg: 290 }] }
  : { nome: p.nome, lote: null, totalCab: 0, pesoMedioKg: null, uaHa: null, categorias: [] };

beforeEach(() => {
  mapa.props = null;
  mapa.geometrias = [
    { pasto_id: 'p13', tipo: 'pasto', geojson: QUADRADO },
    { pasto_id: 'p14', tipo: 'pasto', geojson: QUADRADO },
    { pasto_id: 'p10', tipo: 'reserva_legal', geojson: QUADRADO },
    { pasto_id: null, tipo: 'area_total', geojson: QUADRADO },
  ];
});

describe('a regra da vista', () => {
  it('sem escolha, escolha estranha ou armazenamento que falha: Cards; só "mapa" abre o Mapa', () => {
    expect(lerVista(() => null)).toBe('cards');
    expect(lerVista(() => 'tabela')).toBe('cards');
    expect(lerVista(() => { throw new Error('bloqueado'); })).toBe('cards');
    expect(lerVista(() => 'mapa')).toBe('mapa');
    expect(() => gravarVista(() => { throw new Error('cheio'); })).not.toThrow();
  });
  it('sem desenho = pasto do mês sem polígono DE PASTO (a reserva com o mesmo id não conta)', () => {
    const sem = pastosSemDesenho([P13, P14, P_10], mapa.geometrias as { tipo: string; pasto_id: string | null }[]);
    expect(sem.map(p => p.id)).toEqual(['p10']);
  });
});

describe('a vista Mapa', () => {
  it('cada pasto do mês com a cor da situação do card, a dica é o PopupDoPasto (o mesmo dos cards); clique abre o card daquele pasto', () => {
    const onAbrir = vi.fn();
    const situacao = { p13: 'fechado', p14: 'inconsistente', p10: 'nao_iniciado' } as const;
    render(<MapaDoFechamento pastos={[P13, P14, P_10]} situacaoDe={p => situacao[p.id as keyof typeof situacao]}
      popupDe={popupDe} onAbrir={onAbrir} seletor={<span data-testid="seletor-de-teste">Cards | Mapa</span>} />);
    const p = mapa.props!;
    const corDe = p.corDe as (id: string) => string;
    expect(corDe('p13')).toBe(COR_DA_SITUACAO.fechado);
    expect(corDe('p14')).toBe(COR_DA_SITUACAO.inconsistente);
    const dica = (id: string) => { const d = document.createElement('div'); d.innerHTML = p.dicaDe(id); return d; };
    expect(dica('p13').querySelector('[data-testid="popup-do-pasto-cabecalho"]')?.textContent).toBe('P1327 cab · 290,0 kgLote L-13');
    expect(dica('p13').querySelector('[data-testid="popup-do-pasto-rodape"]')?.textContent).toBe('Lotação0,50 UA/ha');
    expect(dica('p14').querySelector('[data-testid="popup-do-pasto-rodape"]')).toBeNull();
    /* a caixa do Leaflet sem fundo: quem desenha é o popup */
    expect(p.classeDaDica).toContain('!bg-transparent');
    /* adendo 2: o rótulo no pasto = o nome e, embaixo, "27 cab" (sem cabeças, só o nome) */
    const rotuloDe = p.rotuloDe!;
    expect(rotuloDe('p13')).toEqual({ nome: 'P13', sub: '27 cab' });
    expect(rotuloDe('p14')).toEqual({ nome: 'P14', sub: '' });
    expect(rotuloDe('fora')).toBeNull();
    expect([...(p.pastoIds as Set<string>)].sort()).toEqual(['p10', 'p13', 'p14']);
    (p.onPastoClick as (id: string) => void)('p14');
    expect(onAbrir).toHaveBeenCalledWith(P14);
    /* o sem desenho abre o card dele pela faixa */
    fireEvent.click(screen.getByRole('button', { name: 'P_10' }));
    expect(onAbrir).toHaveBeenLastCalledWith(P_10);
    expect(screen.getByTestId('faixa-sem-desenho').textContent).toContain('Sem desenho no mapa (1):');
    /* o seletor abre a linha de 24px, antes da faixa */
    const linha = screen.getByTestId('linha-da-vista');
    expect(linha.firstElementChild?.getAttribute('data-testid')).toBe('seletor-de-teste');
  });
  it('FECH-PASTO-UNIDADE-01: o polígono do PIQUETE pinta e abre o card do PAI (o piquete não tem card) e o pai não vai à faixa', () => {
    mapa.geometrias = [{ pasto_id: 'm1a', tipo: 'pasto', geojson: QUADRADO }, { pasto_id: 'm1b', tipo: 'pasto', geojson: QUADRADO }];
    const onAbrir = vi.fn();
    const M1 = { id: 'm1', nome: 'Módulo 01' };
    render(<MapaDoFechamento pastos={[M1]} situacaoDe={() => 'conciliado'} popupDe={popupDe} onAbrir={onAbrir}
      paiDe={new Map([['m1a', 'm1'], ['m1b', 'm1']])} />);
    const p = mapa.props!;
    expect(p.geometrias.map(g => g.pasto_id)).toEqual(['m1', 'm1']);
    expect((p.corDe as (id: string) => string)('m1')).toBe(COR_DA_SITUACAO.conciliado);
    (p.onPastoClick as (id: string) => void)('m1');
    expect(onAbrir).toHaveBeenCalledWith(M1);
    expect(screen.getByTestId('faixa-sem-desenho').textContent).toBe('');
  });
  it('fazenda sem mapa importado: diz isso no lugar do mapa (nada de mapa em branco)', () => {
    mapa.geometrias = [];
    render(<MapaDoFechamento pastos={[P13]} situacaoDe={() => 'fechado'} popupDe={popupDe} onAbrir={vi.fn()} />);
    expect(mapa.props).toBeNull();
    expect(screen.getByTestId('vista-mapa').textContent).toContain('ainda não tem o mapa importado');
  });
});

describe('o encaixe no Fechamento', () => {
  it('FECH-TOPO-02: o seletor mora no bloco de baixo (a linha acima da grade e do mapa, o MESMO lugar nas duas vistas); o Mapa sem a Divergência do Campeiro e com o popup dos cards', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    const lugar = f.indexOf('data-testid="lugar-seletor-cards-mapa"');
    expect(lugar).toBeGreaterThan(0);
    expect(f.slice(lugar, lugar + 300)).toContain('<Segmentado valor={vista} onEscolher={escolherVista}');
    /* fora do topo: o seletor é um só (`seletorDaVista`) e entra nas duas vistas */
    expect(f.indexOf('data-testid="topo-do-fechamento"')).toBeGreaterThan(0);
    expect(f.match(/data-testid="lugar-seletor-cards-mapa"/g)).toHaveLength(1);
    expect(f).toContain('<div className={`flex h-6 flex-none items-center gap-2 ${CLASSE_LINHA_PRESA}`} data-testid="linha-da-vista">{seletorDaVista}</div>');
    /* FECH-PASTO-UNIDADE-01 (merge): o piquete pinta o pai (`paiDe`) */
    expect(f).toContain("<MapaDoFechamento pastos={pastosDoMapa} situacaoDe={getPastoStatus} paiDe={paiDoPiquete}\n            onAbrir={handleOpenPasto} popupDe={dadosDoPopupDe} seletor={seletorDaVista} />");
    expect(f).toContain('const pastosDoMapa = useMemo(() => pastosAtivos.filter(p => !isPastoDivergencia(p.tipo_uso)), [pastosAtivos]);');
    expect(f).toContain('<PopupDoPasto d={dadosDoPopupDe(p)} />');
    expect(f).toContain('const handleOpenPasto = modalDoPasto.abrir;');
  });
});

describe('FECH-TOPO-02 adendo 2 — o mapa do Fechamento usa o que é do Geo (uma implementação só)', () => {
  const dos = readFileSync('src/components/mapa-geo/MapaDosPastos.tsx', 'utf8');
  const geo = readFileSync('src/components/mapa-geo/MapaGestorView.tsx', 'utf8');
  const camada = readFileSync('src/lib/mapa/camadaDeRotulos.ts', 'utf8');
  it('o foco sem o retângulo azul: a MESMA classe do Geo (MAPA-02a-fix1) no container dos dois mapas', () => {
    const conserto = '[&_path.leaflet-interactive:focus]:outline-none';
    expect(geo).toContain(conserto);
    expect(dos).toContain(`<div ref={mapContainerRef} className="h-full w-full ${conserto}" data-testid="mapa-dos-pastos" />`);
  });
  it('o selecionado e o hover = só o contorno branco de peso 3 (o do Geo)', () => {
    expect(geo).toContain("weight: sel ? 3 : 1");
    expect(dos).toContain('const PESO_SELECIONADO = 3;');
    expect(dos).toContain("camada.on('click', () => { setSelecionadoId(id); aoClicar.current(id); });");
    expect(dos).toContain("camada.on('mouseover', () => camada.setStyle({ weight: PESO_SELECIONADO }));");
  });
  it('os rótulos: UMA camada (camadaDeRotulos), usada pelo Geo e pelo Fechamento; nenhum dos dois desenha rótulo por conta própria', () => {
    expect(camada).toContain('function desenharRotulos(mapa: L.Map, camada: L.LayerGroup, lista: readonly RotuloDoPasto[]) {');
    expect(geo).toContain("import { aneisEmPixels, desenharRotulos, ZOOM_DE_MEDIDA, type RotuloDoPasto } from '@/lib/mapa/camadaDeRotulos';");
    expect(dos).toContain("import { candidatoDoRotulo, desenharRotulos, type RotuloDoPasto } from '@/lib/mapa/camadaDeRotulos';");
    for (const f of [geo, dos]) {
      expect(f).not.toContain('function desenharRotulos');
      expect(f).not.toContain('data-rotulo-pasto');
      expect(f).not.toContain('function aneisEmPixels');
    }
    expect(dos).toContain('if (rotulos) desenharRotulos(mapa, rotulos, candidatos);');
    expect(dos).toContain('candidatoDoRotulo(mapa, g.pasto_id, r.nome, r.sub, g.geojson, areaEmHectares(g.geojson))');
    /* e o zoom refaz a colisão nos dois */
    expect(dos).toContain("mapa.on('zoomend', refazer);");
  });
});
