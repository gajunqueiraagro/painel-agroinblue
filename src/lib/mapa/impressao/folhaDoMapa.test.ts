import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import type { Pasto } from '@/hooks/usePastos';
import {
  arrumarNaFolha, enquadrar, escalaGrafica, escolherEscala, gradeDaFolha, hachura, layoutDaFolha, poligonosDe, textoDaEscala,
} from './folhaDoMapa';
import { classeDaArea, classeDoPasto } from './classesDaFolha';
import { resumoDeAreas } from './resumoDeAreas';
import { chaveEsri, lerEstilo, lerFundo, MAX_PX, MAX_TILES, MOTIVO_FALHOU, MOTIVO_SEM_CHAVE, pixelMercator, planoDaImagem, urlDoTile } from './imagemDoFundo';
import { deUtm } from './utm';
import { montarFolha } from './montarFolha';
import { entradaDaFolha, type PoligonoLido } from './dadosDaFolha';
import { lerCadastroLido } from './cadastroDaFazenda';
import { nomeDoArquivo } from './gerarPdfDoMapa';

/* um quadrado de ~1 km perto de Santa Rita do Rio Pardo (fuso 22S) */
const quadrado = (lon: number, lat: number, d = 0.01) => ({
  type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});
const pasto = (id: string, nome: string, area: number | null, extra: Partial<Pasto> = {}): Pasto => ({
  id, fazenda_id: 'f', nome, lote_padrao: null, area_produtiva_ha: area, tipo_uso: 'cria', qualidade: null, entra_conciliacao: true, ativo: true,
  observacoes: null, ordem_exibicao: 0, data_inicio: null, data_fim: null, grupo_id: null, created_at: '', updated_at: '', ...extra,
});

describe('folha (MAPA-IMPRESSAO-01)', () => {
  it('F1: A3/A1/A0 paisagem; A1 e A0 são a A3 ampliada', () => {
    const a3 = layoutDaFolha('A3'); const a0 = layoutDaFolha('A0');
    expect([a3.largura, a3.altura]).toEqual([420, 297]);
    expect([layoutDaFolha('A1').largura, layoutDaFolha('A1').altura]).toEqual([841, 594]);
    expect([a0.largura, a0.altura]).toEqual([1189, 841]);
    expect(a3.quadro.x + a3.quadro.w + 6 + a3.painel.w + 8).toBeCloseTo(420, 6);
    expect(a0.painel.w / a3.painel.w).toBeCloseTo(1189 / 420, 6);
  });
  it('F2: a escala é a maior redonda em que cabe (2% de folga de cada lado)', () => {
    const q = layoutDaFolha('A3').quadro; // 292 × 281 mm
    /* (largura, altura): a Sta. Rita tem ~6,9 km × 10,5 km; 281 mm × 96% × 40 m/mm = 10.790 m de altura cabe, 10.800 não */
    expect(escolherEscala(6900, 10500, q)).toBe(40000);
    expect(escolherEscala(6900, 10800, q)).toBe(50000);
    expect(escolherEscala(1000, 800, q)).toBe(5000);
    expect(textoDaEscala(40000)).toBe('1:40.000');
  });
  it('F3: enquadrar: fuso pelo centro, quadro centrado nas geometrias, nada → null', () => {
    const l = layoutDaFolha('A3');
    expect(enquadrar([], l)).toBeNull();
    expect(enquadrar([{ type: 'Point', coordinates: [1, 2] }], l)).toBeNull();
    const e = enquadrar([quadrado(-52.62, -21.27), quadrado(-52.6, -21.25)], l);
    expect(e?.fuso.epsg).toBe(31982);
    expect(e?.escala).toBe(12500); // ~3,3 km de altura em 281 mm
    expect(e && (e.extensao.e1 - e.extensao.e0) / e.mPorMm).toBeCloseTo(l.quadro.w, 6);
  });
  it('F4: grade E/N redonda (≤ 7 linhas no lado maior) e escala gráfica de 4 trechos', () => {
    const l = layoutDaFolha('A3');
    const e = enquadrar([quadrado(-52.64, -21.31, 0.07), quadrado(-52.6, -21.22, 0.005)], l);
    if (!e) throw new Error('sem enquadramento');
    const g = gradeDaFolha(e, l);
    expect(g.intervalo).toBe(2000);
    expect(g.linhas.filter((x) => x.eixo === 'E').every((x) => x.valor % 2000 === 0)).toBe(true);
    expect(g.linhas.find((x) => x.eixo === 'N')?.rotulo).toMatch(/^N \d\.\d{3}\.000$/);
    const s = escalaGrafica(e, l);
    expect(s.metros).toBe(2000);
    expect(s.marcas.map((m) => m.rotulo)).toEqual(['0', '0,5', '1', '1,5', '2 km']);
    expect(s.mm).toBeCloseTo(2000 / e.mPorMm, 6);
  });
  it('F5: a hachura é recortada pelo polígono e respeita o furo', () => {
    const anel: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const furo: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    const linhas = hachura([[anel, furo]], 1);
    expect(linhas.length).toBeGreaterThan(10);
    for (const [x1, y1, x2, y2] of linhas) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(10 + 1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(10 + 1e-9); }
      const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
      expect(mx > 4 && mx < 6 && my > 4 && my < 6).toBe(false); // nenhum trecho com o meio dentro do furo
    }
    expect(hachura([], 1)).toEqual([]);
  });
  it('F6: rótulo que não cabe fica oculto (o painel diz); dois rótulos nunca se sobrepõem', () => {
    const grande = [[[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]]] as [number, number][][];
    const pequeno = [[[50, 0], [52, 0], [52, 2], [50, 2], [50, 0]]] as [number, number][][];
    const r = arrumarNaFolha([
      { id: 'g', poligonos: [grande], nome: '15-A', sub: '96,83 ha', prioridade: 2 },
      { id: 'p', poligonos: [pequeno], nome: 'CONF.07', sub: '0,19 ha', prioridade: 1 },
    ], 2.5, 2.1);
    expect(r.find((x) => x.id === 'g')?.modo).toBe('completo');
    expect(r.find((x) => x.id === 'p')?.modo).toBe('oculto');
  });
  it('F7: polígono torto não quebra (só Polygon/MultiPolygon de verdade viram desenho)', () => {
    expect(poligonosDe({ type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] })).toEqual([]);
    expect(poligonosDe({ type: 'MultiPolygon', coordinates: [quadrado(0, 0).coordinates, 'x'] })).toHaveLength(1);
    expect(poligonosDe({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toEqual([]);
  });
});

describe('classes da folha (D5)', () => {
  it('C1: APP e reserva separadas; o resto cai numa classe, nunca some', () => {
    expect(classeDaArea('app')).toBe('app');
    expect(classeDaArea('reserva_legal')).toBe('reserva');
    expect(classeDaArea('lagoa')).toBe('agua');
    expect(classeDaArea('confinamento')).toBe('estruturas');
    expect(classeDaArea('area_total')).toBe('limite');
    expect(classeDaArea('tipo_que_nao_existe')).toBe('outras');
    expect(classeDoPasto('cria')).toBe('pastagem');
    expect(classeDoPasto('reserva')).toBe('reserva');
    expect(classeDoPasto('app')).toBe('app');
    expect(classeDoPasto('agricultura')).toBe('lavoura');
    expect(classeDoPasto('eucalipto')).toBe('silvicultura');
    expect(classeDoPasto('benfeitorias')).toBe('estruturas');
    expect(classeDoPasto(null)).toBe('pastagem');
  });
});

describe('resumo de áreas (fonte única, mês)', () => {
  /* o caso da Sta. Rita: pai até 09/2026, piquetes desde 10/2026 — nunca os dois no mesmo mês */
  const pastos = [
    pasto('pai', '20A-1', 70.81, { data_fim: '2026-09-30' }),
    pasto('pa', '20A-1-A', 38.91, { data_inicio: '2026-10-01', grupo_id: 'g' }),
    pasto('pb', '20A-1-B', 40.39, { data_inicio: '2026-10-01', grupo_id: 'g' }),
    pasto('r', 'Reserva', 100, { tipo_uso: 'reserva' }),
    pasto('b', 'Sede', 10, { tipo_uso: 'benfeitorias' }),
    pasto('x', 'Antigo', 999, { ativo: false }),
    pasto('d', 'Divergência', 0, { tipo_uso: 'divergencia' }),
  ];
  it('R1: pai OU piquetes conforme o mês; inativo não conta; APP sem pasto = "—" (null)', () => {
    const set = resumoDeAreas({ pastos, anoMes: '2026-09', areaDe: () => undefined, matricula: 180.81, desenho: { reserva: 0, app: 0 } });
    const out = resumoDeAreas({ pastos, anoMes: '2026-10', areaDe: () => undefined, matricula: 180.81, desenho: { reserva: 0, app: 0 } });
    expect(set.linhas.find((l) => l.chave === 'pastagem')?.ha).toBe(70.81);
    expect(out.linhas.find((l) => l.chave === 'pastagem')?.ha).toBe(79.3);
    expect(set.soma).toBe(180.81);
    expect(set.confere).toBe(true);
    expect(out.diferenca).toBe(8.49);
    expect(out.confere).toBe(false);
    expect(out.linhas.find((l) => l.chave === 'app')?.ha).toBeNull();
    expect(out.linhas.find((l) => l.chave === 'reserva')?.ha).toBe(100);
    expect(out.linhas.some((l) => l.chave === 'sem_uso')).toBe(false); // a linha opcional que soma zero não entra
  });
  it('R2: a área DO MÊS manda (areaDe), não a de hoje; sem matrícula = diferença null', () => {
    const r = resumoDeAreas({ pastos, anoMes: '2026-10', areaDe: (id) => (id === 'pa' ? 50 : undefined), matricula: null, desenho: { reserva: 12.345, app: 0 } });
    expect(r.linhas.find((l) => l.chave === 'pastagem')?.ha).toBe(90.39);
    expect(r.diferenca).toBeNull();
    expect(r.confere).toBe(false);
    expect(r.desenho.reserva).toBe(12.35);
  });
});

describe('imagem do fundo (D1: Esri pelo serviço oficial, com a chave)', () => {
  const fuso = { numero: 22, sul: true, epsg: 31982, meridianoCentral: -51 };
  /* o quadro da Sta. Rita em A3 a 1:40.000 (~11,7 × 11,2 km) */
  const ext = { e0: 327000, n0: 7641500, e1: 338680, n1: 7652740 };
  const ESTILO = {
    sources: {
      imagem: { type: 'raster', tiles: ['https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=T'],
        tileSize: 256, maxzoom: 23, attribution: 'Source: Esri, Vantor, and the GIS User Community' },
      vetor: { type: 'vector', tiles: ['https://basemaps-api.arcgis.com/x/{z}/{y}/{x}.pbf'] },
    },
  };
  it('I1: o estilo oficial dá o modelo dos tiles (com o token), as fontes, 256 px e o zoom máximo (teto 19)', () => {
    expect(lerEstilo(ESTILO, 'K')).toEqual({
      modelo: 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=T',
      fontes: 'Esri, Vantor, and the GIS User Community', tamanho: 256, maxZoom: 19,
    });
    const semToken = { sources: { a: { type: 'raster', tiles: ['https://x/tile/{z}/{y}/{x}'] } } };
    expect(lerEstilo(semToken, 'K K')?.modelo).toBe('https://x/tile/{z}/{y}/{x}?token=K%20K');
    expect(lerEstilo({ sources: { v: ESTILO.sources.vetor } }, 'K')).toBeNull();
    expect(lerEstilo(null, 'K')).toBeNull();
    expect(urlDoTile('https://h/{z}/{y}/{x}?token=T', 15, 11587, 18350)).toBe('https://h/15/18350/11587?token=T');
  });
  it('I2: o plano — zoom pela resolução da folha, blocos ≤ 4.096 px, a afim Mercator → UTM erra menos de MEIO PIXEL na folha (A3 e A0)', () => {
    const a3 = layoutDaFolha('A3').quadro; const a0 = layoutDaFolha('A0').quadro;
    const p3 = planoDaImagem({ fuso, extensao: ext, quadroMm: { w: a3.w, h: a3.h }, tamanho: 256, maxZoom: 19 });
    expect(p3.z).toBe(15); // 1:40.000 a 200 dpi = 5,1 m/px; z15 ≈ 4,5 m/px na latitude
    expect(p3.blocos).toHaveLength(1);
    expect(p3.tiles.length).toBeGreaterThan(50);
    expect(p3.tiles.length).toBeLessThan(MAX_TILES);
    /* o erro que importa é o da FOLHA: meio pixel a 200 dpi = 0,064 mm (A3 a 1:40.000: ~2 m no terreno = 0,05 mm) */
    const meioPixelMm = 25.4 / 200 / 2;
    const mPorMm3 = (ext.e1 - ext.e0) / a3.w; const mPorMm0 = (ext.e1 - ext.e0) / a0.w;
    for (const b of p3.blocos) { expect(b.erroM / mPorMm3).toBeLessThan(meioPixelMm); expect(b.pxW).toBeLessThanOrEqual(MAX_PX); }
    const p0 = planoDaImagem({ fuso, extensao: ext, quadroMm: { w: a0.w, h: a0.h }, tamanho: 256, maxZoom: 19 });
    expect(p0.blocos).toHaveLength(4);
    for (const b of p0.blocos) { expect(b.erroM / mPorMm0).toBeLessThan(meioPixelMm); expect(Math.max(b.pxW, b.pxH)).toBeLessThanOrEqual(MAX_PX); }
    expect(p0.blocos.reduce((s, b) => s + b.w * b.h, 0)).toBeCloseTo(a0.w * a0.h, 3);
    /* a afim leva o canto de cima à esquerda do bloco 0 (UTM e0, n1) ao pixel (0, 0) */
    const b = p3.blocos[0]; const [a, bb, c, d, e, f] = b.afim;
    const ll = deUtm(ext.e0, ext.n1, fuso);
    const [X, Y] = pixelMercator(ll.lon, ll.lat, p3.z, 256);
    const u = a * (X - p3.origem[0]) + c * (Y - p3.origem[1]) + e; const v = bb * (X - p3.origem[0]) + d * (Y - p3.origem[1]) + f;
    expect(Math.hypot(u, v)).toBeLessThan(0.5); // o resíduo da afim, menos de meio pixel
    expect(Math.abs(Math.atan2(bb, a) * 180 / Math.PI)).toBeGreaterThan(0.3); // a rotação da convergência está na afim
  });
  it('I3: sem pedir = papel sem motivo; sem chave = papel com o motivo; falha do estilo ou dos tiles = papel; Google nunca', async () => {
    const base = { fuso, extensao: ext, quadroMm: { w: 100, h: 100 } };
    const compor = async (p: { blocos: unknown[] }) => p.blocos.map(() => 'data:image/jpeg;base64,AA');
    expect(await lerFundo({ ...base, querImagem: false, chave: 'K', lerEstiloJson: async () => ESTILO, compor })).toEqual({ tipo: 'papel', motivo: null });
    expect(await lerFundo({ ...base, querImagem: true, chave: null, lerEstiloJson: async () => ESTILO, compor })).toEqual({ tipo: 'papel', motivo: MOTIVO_SEM_CHAVE });
    expect(await lerFundo({ ...base, querImagem: true, chave: 'K', lerEstiloJson: async () => { throw new Error('rede'); }, compor })).toEqual({ tipo: 'papel', motivo: MOTIVO_FALHOU });
    expect(await lerFundo({ ...base, querImagem: true, chave: 'K', lerEstiloJson: async () => ESTILO, compor: async () => { throw new Error('tile'); } })).toEqual({ tipo: 'papel', motivo: MOTIVO_FALHOU });
    const urls: string[] = [];
    const ok = await lerFundo({ ...base, querImagem: true, chave: 'K', lerEstiloJson: async (u) => { urls.push(u); return ESTILO; }, compor });
    expect(ok.tipo === 'imagem' && ok.fontes).toBe('Esri, Vantor, and the GIS User Community');
    expect(urls[0]).toBe('https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery?token=K');
    expect(urls.some((u) => u.includes('google') || u.includes('server.arcgisonline'))).toBe(false);
  });
  it('I4: a chave vem da variável do build (sem ela, null)', () => {
    vi.stubEnv('VITE_ESRI_API_KEY', '');
    try {
      expect(chaveEsri()).toBeNull();
      vi.stubEnv('VITE_ESRI_API_KEY', ' CHAVE-DE-TESTE ');
      expect(chaveEsri()).toBe('CHAVE-DE-TESTE');
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('a folha montada (entrada → folha)', () => {
  const pastos = [
    pasto('p1', '11A', 67.75), pasto('p2', '22TP1', null),
    pasto('pai', '20A-1', 70.81, { data_fim: '2026-09-30' }),
    pasto('pa', '20A-1-A', 38.91, { data_inicio: '2026-10-01', grupo_id: 'g' }),
    pasto('pb', '20A-1-B', 40.39, { data_inicio: '2026-10-01', grupo_id: 'g' }),
    pasto('velho', 'IND.05', 34.8, { data_fim: '2025-05-31', tipo_uso: 'agricultura' }),
  ];
  const poligonos: PoligonoLido[] = [
    { id: 'g1', tipo: 'pasto', pasto_id: 'p1', nome_original: '11A', geojson: quadrado(-52.62, -21.27) },
    { id: 'g2', tipo: 'pasto', pasto_id: 'p2', nome_original: '22TP1', geojson: quadrado(-52.6, -21.27) },
    { id: 'gpai', tipo: 'pasto', pasto_id: 'pai', nome_original: '20A-1', geojson: quadrado(-52.62, -21.25, 0.02) },
    { id: 'gpa', tipo: 'pasto', pasto_id: 'pa', nome_original: '20A-1-A', geojson: quadrado(-52.62, -21.25) },
    { id: 'gpb', tipo: 'pasto', pasto_id: 'pb', nome_original: '20A-1-B', geojson: quadrado(-52.61, -21.25) },
    { id: 'gvelho', tipo: 'pasto', pasto_id: 'velho', nome_original: 'IND.05', geojson: quadrado(-52.58, -21.25) },
    { id: 'grl', tipo: 'reserva_legal', pasto_id: null, nome_original: 'Mata', geojson: quadrado(-52.58, -21.27, 0.015) },
  ];
  const entrada = (anoMes: string) => entradaDaFolha({
    tamanho: 'A3', anoMes, pastos, grupos: [{ id: 'g', nome: '20A-1', pasto_origem_id: 'pai', ativo: true }], poligonos,
    areaDe: () => undefined, usoNoFechamento: () => null, hoje: '2026-11-03',
    cadastro: { cliente: 'Cliente', fazenda: 'Faz. Teste', municipio: 'Santa Rita do Rio Pardo ', uf: 'MS', matricula: 500, matriculaConferidaEm: '2026-08-21' },
  });
  it('M1: a unidade do mês (pai em 09, Σ piquetes em 10, piquetes = divisões sem rótulo); pasto encerrado vira "outra área"', () => {
    const set = entrada('2026-09'); const out = entrada('2026-10');
    expect(set.unidades.get('pai')?.areaHa).toBe(70.81);
    expect(out.unidades.get('pai')?.areaHa).toBe(79.3);
    expect(set.divisoes).toHaveLength(0);
    expect(out.divisoes).toHaveLength(2);
    expect(out.poligonos.map((p) => p.id)).not.toContain('gpa');
    expect(out.poligonos.find((p) => p.id === 'gvelho')).toMatchObject({ tipo: 'outra', pastoId: null });
    expect(out.unidades.get('p2')?.areaHa).toBeNull();
  });
  it('M2: rótulos — área do cadastro, "—" sem área, "≈ x ha" (itálico) para o desenho; identificação dd/mm/aaaa, UTM e escala', () => {
    const f = montarFolha(entrada('2026-10'));
    if (!f) throw new Error('sem folha');
    const r = (id: string) => f.rotulos.find((x) => x.id === id);
    expect(r('g1')?.sub).toBe('67,75 ha');
    expect(r('g2')?.sub).toBe('—');
    expect(r('gpai')?.sub).toBe('79,30 ha');
    expect(r('grl')?.sub).toMatch(/^≈ \d+,\d ha$/);
    expect(f.medidas.has('grl')).toBe(true);
    expect(f.medidas.has('g1')).toBe(false);
    const id = Object.fromEntries(f.identificacao);
    expect(id['Município']).toBe('Santa Rita do Rio Pardo – MS');
    expect(id['Matrícula']).toBe('500,00 ha (conferida em 21/08/2026)');
    expect(id['Data']).toBe('03/11/2026');
    expect(id['Dados de']).toBe('out/2026');
    expect(id['Projeção']).toBe('UTM, SIRGAS 2000, fuso 22S');
    expect(f.legenda).toEqual(['pastagem', 'reserva', 'outras']);
    expect(f.norte.frase).toMatch(/^Convergência meridiana: 0°\d\d′ a oeste/);
  });
  it('M3: sem polígono não há folha; sem cadastro o "—"', () => {
    expect(montarFolha({ ...entrada('2026-10'), poligonos: [] })).toBeNull();
    const e = entrada('2026-10');
    const f = montarFolha({ ...e, identificacao: { ...e.identificacao, municipio: null, matricula: null, matriculaConferidaEm: null } });
    const id = Object.fromEntries(f?.identificacao ?? []);
    expect(id['Município']).toBe('—');
    expect(id['Matrícula']).toBe('—');
  });
  it('M4: o cadastro lido (null nunca vira zero) e o nome do arquivo', () => {
    expect(lerCadastroLido(null)).toEqual({ municipio: null, uf: null, matricula: null, matriculaConferidaEm: null });
    expect(lerCadastroLido({ municipio: ' Terenos ', estado: 'MS', area_total_ha: '339.21', matricula_conferida_em: '2026-08-21 19:33:49+00' }))
      .toEqual({ municipio: 'Terenos', uf: 'MS', matricula: 339.21, matriculaConferidaEm: '2026-08-21' });
    expect(nomeDoArquivo('Faz. Sta. Rita', 'A1', '2026-10')).toBe('mapa_faz_sta_rita_A1_2026-10.pdf');
  });
});
