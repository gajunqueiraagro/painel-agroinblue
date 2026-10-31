/**
 * MAPA-02a — o mapa de pastos em tela cheia (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`, 31/10/2026), SOMENTE LEITURA.
 * Um mês só (D1), escolhido no seletor da barra: todo número vem do `useMapaDoMes` (o fechamento DAQUELE mês; atividade =
 * `tipo_uso_mes`, D3); as faixas de lotação vêm de `faixasLotacao.ts` (D2, 300/500); as camadas e a legenda, de `camadasDoMapa.ts`.
 * Desenho: pastos pela camada; áreas pelo `fazenda_geometrias.tipo`; `area_total` só contorno tracejado, por baixo e sem clique;
 * área que não é pasto mostra o nome ao passar o mouse e não abre o painel. Clique no pasto abre o painel de vidro (286px, fix1 C).
 * Estabilidade visual: barra, KPIs, filtros, painel e legenda têm lugar e largura fixos — trocar camada, mês, filtro ou pasto não move
 * nada. O painel é só leitura (fix1 B): o vínculo do polígono com o pasto fica só na aba Validação.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { itemFunciona, MENU_ADICIONAR } from '@/lib/mapa/menuAdicionar';
import { ChevronDown, ListFilter, MapPin, Plus, Upload, X } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { arrumarRotulos, distanciaABorda, pontoMaisInterno, type Aneis, type Ponto } from '@/lib/mapa/rotulosDoMapa';
import { COR_DA_FAIXA, textoUaHa, uaPorHa } from '@/lib/mapa/faixasLotacao';
import { fechamentoDoMesAberto, mesAbreviado, mesCurtoNumerico, type DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import { CAMADAS, CAMADAS_EM_BREVE, corDaArea, corDoPasto, legendaDaCamada, rotuloDaAtividade, type CamadaDoMapa } from '@/lib/mapa/camadasDoMapa';
import { FUNDOS } from '@/lib/mapa/fundoDoMapa';

interface Props {
  geometrias: FazendaGeometria[];
  pastos: Pasto[];
  /** O mês do mapa ('AAAA-MM'). */
  anoMes: string;
  /** Por pasto vigente no mês (`useMapaDoMes`). */
  dadosDoMes: Map<string, DadosDoPastoNoMes>;
  carregandoMes: boolean;
  erroDoMes: string | null;
  geoLoading: boolean;
  onImportar: () => void;
  onRenderedChange?: (count: number) => void;
  /** O seletor de ano/mês (o mesmo do Fechamento Área, mês compartilhado). */
  seletorDeMes: ReactNode;
  /** A troca de vista (Gestor · Operação · Validação). */
  trocaDeVista: ReactNode;
}

const VIDRO = 'rounded-[10px] border border-white/60 bg-white/[0.78] shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-[14px] backdrop-saturate-[1.2]';
/* fix1 (2): o rótulo do pasto — nome 10px/600, kg/ha 9,5px (o piso da casa) mais claro; tamanho fixo em qualquer zoom */
const ROTULO_NOME_PX = 10;
const ROTULO_SUB_PX = 9.5;
const ROTULO_ALTURA_NOME = 12;
const ROTULO_ALTURA_SUB = 11;
/* o ponto interno e a largura do pasto se medem uma vez, nesta escala fixa; no zoom z vale × 2^(z − ZOOM_DE_MEDIDA) */
const ZOOM_DE_MEDIDA = 20;

interface RotuloDoPasto {
  id: string; nome: string; sub: string; ancora: L.LatLng; folga: number; largura: number; prioridade: number;
  /** Os anéis do pasto na escala de medida (para conferir se a caixa do rótulo fica dentro). */
  aneis: Aneis;
}

let reguaDoTexto: CanvasRenderingContext2D | null = null;
function larguraDoTexto(texto: string, px: number, peso: number): number {
  if (typeof document === 'undefined') return texto.length * px * 0.6;
  reguaDoTexto ??= document.createElement('canvas').getContext('2d');
  if (!reguaDoTexto) return texto.length * px * 0.6;
  reguaDoTexto.font = `${peso} ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(reguaDoTexto.measureText(texto).width) + 2;
}

/** Os anéis do maior polígono da geometria (Polygon ou MultiPolygon), em pixels na escala de medida. */
function aneisEmPixels(mapa: L.Map, geo: FazendaGeometria['geojson']): Aneis | null {
  const para = (anel: number[][]): Ponto[] => anel.map(([lng, lat]) => { const pt = mapa.project(L.latLng(lat, lng), ZOOM_DE_MEDIDA); return [pt.x, pt.y]; });
  const areaDe = (a: Ponto[]) => Math.abs(a.reduce((s, [x, y], i) => { const [x2, y2] = a[(i + 1) % a.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  if (geo.type === 'Polygon') return geo.coordinates.map(para);
  if (geo.type === 'MultiPolygon') {
    let melhor: Aneis | null = null; let maior = -1;
    for (const pol of geo.coordinates) { const a = pol.map(para); const ar = a[0] ? areaDe(a[0]) : 0; if (ar > maior) { maior = ar; melhor = a; } }
    return melhor;
  }
  return null;
}
const MENU_ACIMA = 'z-[1100]';
const SEM_ATIVIDADE = '__sem__';

type Filtros = {
  pastos: boolean; areas: boolean; semUso: boolean; nomes: boolean;
  atividadesOcultas: Set<string>; comAnimais: boolean; vazio: boolean; semFechamento: boolean;
};
const FILTROS_INICIAIS: Filtros = {
  pastos: true, areas: true, semUso: true, nomes: true, atividadesOcultas: new Set(), comAnimais: true, vazio: true, semFechamento: true,
};

function numero(v: number | null | undefined, casas = 0, sufixo = ''): string {
  return v == null ? '—' : `${formatNum(v, casas)}${sufixo}`;
}

function Kpi({ rotulo, valor, unidade, largura = 88 }: { rotulo: string; valor: string; unidade?: string | null; largura?: number }) {
  return (
    <div className="flex-none rounded-md bg-white/70 px-2 py-[3px]" style={{ width: largura }}>
      <div className="text-[9.5px] leading-[12px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[13px] font-semibold leading-[17px] tabular-nums">
        {valor}{unidade ? <span className="ml-0.5 text-[10px] font-normal text-[#4A5361]">{unidade}</span> : null}
      </div>
    </div>
  );
}

function Cel({ rotulo, valor, destaque, unidade }: { rotulo: string; valor: string; destaque?: boolean; unidade?: string | null }) {
  return (
    <div className={`rounded-md px-1.5 py-[3px] ${destaque ? 'bg-[#FFF6D6]' : 'bg-white/75'}`}>
      <div className="text-[9.5px] leading-[12px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[12px] font-semibold leading-[16px] tabular-nums">
        {valor}{unidade ? <span className="ml-1 text-[9.5px] font-normal text-[#4A5361]">{unidade}</span> : null}
      </div>
    </div>
  );
}

function LinhaFiltro({ rotulo, marcado, onChange, n }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void; n?: number }) {
  return (
    <label className="flex h-[20px] cursor-pointer items-center gap-1.5 text-[10px]">
      <Checkbox checked={marcado} onCheckedChange={v => onChange(v === true)} className="h-3 w-3 rounded-[2px] [&_svg]:h-2.5 [&_svg]:w-2.5" />
      <span className="min-w-0 flex-1 truncate" title={rotulo}>{rotulo}</span>
      {n != null ? <span className="w-6 flex-none text-right text-[9.5px] tabular-nums text-[#5A6472]">{n}</span> : null}
    </label>
  );
}

/** Põe os rótulos no zoom atual: cada pasto mostra nome + kg/ha, só o nome ou nada (fica no hover); nunca dois se sobrepõem. */
function desenharRotulos(mapa: L.Map, camada: L.LayerGroup, lista: readonly RotuloDoPasto[]) {
  camada.clearLayers();
  if (lista.length === 0) return;
  const escala = Math.pow(2, mapa.getZoom() - ZOOM_DE_MEDIDA);
  const porId = new Map(lista.map(r => [r.id, r]));
  const modos = arrumarRotulos(lista.map(r => {
    const pt = mapa.project(r.ancora, mapa.getZoom());
    return {
      id: r.id, x: pt.x, y: pt.y, folga: r.folga * escala, larguraDoPasto: r.largura * escala,
      larguraNome: larguraDoTexto(r.nome, ROTULO_NOME_PX, 600), alturaNome: ROTULO_ALTURA_NOME,
      larguraSub: larguraDoTexto(r.sub, ROTULO_SUB_PX, 400), alturaSub: ROTULO_ALTURA_SUB, prioridade: r.prioridade,
      dentro: (x: number, y: number) => distanciaABorda(x / escala, y / escala, r.aneis) >= 0,
    };
  }));
  modos.forEach((modo, id) => {
    const r = porId.get(id);
    if (!r || modo === 'oculto') return;
    const sub = modo === 'completo'
      ? `<div style="font-weight:400;font-size:${ROTULO_SUB_PX}px;line-height:${ROTULO_ALTURA_SUB}px;opacity:.88">${escaparHtml(r.sub)}</div>` : '';
    L.marker(r.ancora, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div data-rotulo-pasto="${modo}" style="transform:translate(-50%,-50%);white-space:nowrap;text-align:center;color:#fff;font-size:${ROTULO_NOME_PX}px;font-weight:600;line-height:${ROTULO_ALTURA_NOME}px;text-shadow:0 1px 2px #000,0 0 2px #000">${escaparHtml(r.nome)}${sub}</div>`,
      }),
    }).addTo(camada);
  });
}

/** O número em cima da barra do histórico: até 999 inteiro; de 1.000 em diante "1,1k" (a barra tem ~18px; o valor inteiro fica no title). */
function valorDaBarra(v: number): string {
  return v >= 999.5 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatNum(v, 0);
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function MapaGestorView({
  geometrias, pastos, anoMes, dadosDoMes, carregandoMes, erroDoMes, geoLoading, onImportar, onRenderedChange,
  seletorDeMes, trocaDeVista,
}: Props) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [camada, setCamada] = useState<CamadaDoMapa>('situacao');
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const enquadrouRef = useRef('');
  const camadasRef = useRef(new Map<string, L.GeoJSON>());
  const rotulosRef = useRef<RotuloDoPasto[]>([]);

  const { mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef, status: mapStatus, reportRenderedGeometries,
    fundo, trocarFundo } = useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 0 });

  const pastoPorId = useMemo(() => new Map(pastos.map(p => [p.id, p])), [pastos]);
  const hasGeo = geometrias.length > 0;
  const geoPastos = useMemo(() => geometrias.filter(g => g.tipo === 'pasto' && !!g.pasto_id), [geometrias]);
  const geoSelecionada = selecionadoId ? geoPastos.find(g => g.id === selecionadoId) ?? null : null;
  const pastoSelecionado = geoSelecionada?.pasto_id ? pastoPorId.get(geoSelecionada.pasto_id) ?? null : null;
  const dadosSelecionado = pastoSelecionado ? dadosDoMes.get(pastoSelecionado.id) ?? null : null;

  // o polígono deixou de ser pasto (vínculo removido) ou sumiu: o painel fecha
  useEffect(() => {
    if (selecionadoId && !geoPastos.some(g => g.id === selecionadoId)) setSelecionadoId(null);
  }, [selecionadoId, geoPastos]);

  /* ── KPIs da fazenda no mês: os pastos com polígono, vigentes no mês ── */
  const kpis = useMemo(() => {
    let cab = 0; let pesoTotal = 0; let area = 0; let algum = false;
    for (const g of geoPastos) {
      const d = dadosDoMes.get(g.pasto_id!);
      if (!d) continue;
      area += pastoPorId.get(g.pasto_id!)?.area_produtiva_ha ?? 0;
      if (!d.temFechamento) continue;
      algum = true;
      cab += d.cabecas ?? 0;
      pesoTotal += d.pesoTotalKg ?? 0;
    }
    return {
      cabecas: algum ? cab : null,
      pesoMedio: algum && cab > 0 ? pesoTotal / cab : null,
      lotacao: algum && area > 0 ? pesoTotal / area : null,
      area: area > 0 ? area : null,
      uaHa: algum ? uaPorHa(cab, cab > 0 ? pesoTotal / cab : null, area) : null,
    };
  }, [geoPastos, dadosDoMes, pastoPorId]);

  /* fix1 E: o fechamento de pastos do mês ainda não está fechado (algum pasto do mapa com status ≠ 'fechado') */
  const fechamentoAberto = useMemo(() => fechamentoDoMesAberto(dadosDoMes, geoPastos.map(g => g.pasto_id!)), [dadosDoMes, geoPastos]);

  /* ── Contagens dos filtros ── */
  const contagens = useMemo(() => {
    const atividades = new Map<string, number>();
    let comAnimais = 0; let vazio = 0; let semFechamento = 0;
    for (const g of geoPastos) {
      const d = dadosDoMes.get(g.pasto_id!);
      if (!d || !d.temFechamento) { semFechamento++; continue; }
      if ((d.cabecas ?? 0) > 0) comAnimais++; else vazio++;
      const a = d.atividade ?? SEM_ATIVIDADE;
      atividades.set(a, (atividades.get(a) ?? 0) + 1);
    }
    return {
      pastos: geoPastos.length,
      areas: geometrias.filter(g => g.tipo !== 'pasto' && g.tipo !== 'area_sem_uso' && g.tipo !== 'area_total').length,
      semUso: geometrias.filter(g => g.tipo === 'area_sem_uso').length,
      atividades: [...atividades.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      comAnimais, vazio, semFechamento,
    };
  }, [geoPastos, geometrias, dadosDoMes]);

  const atividadesDoMes = useMemo(() => contagens.atividades.map(([a]) => a).filter(a => a !== SEM_ATIVIDADE), [contagens]);
  const legenda = useMemo(() => legendaDaCamada(camada, atividadesDoMes), [camada, atividadesDoMes]);

  /* ── Desenho ── */
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    const rotulos = labelLayerRef.current;
    if (!mapa || !grupo || !rotulos) return;
    grupo.clearLayers();
    rotulos.clearLayers();
    camadasRef.current.clear();

    const dadoDe = (g: FazendaGeometria) => (g.pasto_id ? dadosDoMes.get(g.pasto_id) ?? null : null);
    const visivel = (g: FazendaGeometria): boolean => {
      if (g.tipo === 'area_total') return filtros.areas;
      if (g.tipo === 'area_sem_uso') return filtros.semUso;
      if (g.tipo !== 'pasto' || !g.pasto_id) return filtros.areas;
      if (!filtros.pastos) return false;
      const d = dadoDe(g);
      if (!d || !d.temFechamento) return filtros.semFechamento;
      if ((d.cabecas ?? 0) > 0 ? !filtros.comAnimais : !filtros.vazio) return false;
      return !filtros.atividadesOcultas.has(d.atividade ?? SEM_ATIVIDADE);
    };
    const nomeDe = (g: FazendaGeometria) => (g.pasto_id ? pastoPorId.get(g.pasto_id)?.nome : null) ?? g.nome_original ?? 'Sem nome';

    const limites = L.latLngBounds([]);
    let desenhados = 0;
    const candidatos: RotuloDoPasto[] = [];
    // área total por baixo de tudo; depois as áreas; os pastos por cima
    const peso = (g: FazendaGeometria) => (g.tipo === 'area_total' ? 0 : g.tipo === 'pasto' ? 2 : 1);
    for (const g of [...geometrias].sort((a, b) => peso(a) - peso(b))) {
      if (!visivel(g)) continue;
      try {
        const ehPasto = g.tipo === 'pasto' && !!g.pasto_id;
        const sel = g.id === selecionadoId;
        const d = ehPasto ? dadoDe(g) : null;
        const estilo: L.PathOptions = g.tipo === 'area_total'
          ? { color: '#ffffff', weight: 1.5, dashArray: '6 4', fill: false }
          : ehPasto
            ? {
              color: sel ? '#ffffff' : 'rgba(255,255,255,0.85)', weight: sel ? 3 : 1, fillOpacity: sel ? 0.65 : 0.45,
              fillColor: corDoPasto(camada, {
                temFechamento: !!d?.temFechamento, kgHa: d?.kgHa ?? null, cabecas: d?.cabecas ?? null, faixa: d?.faixa ?? null,
                atividade: d?.atividade ?? null,
              }),
            }
            : { color: 'rgba(255,255,255,0.85)', weight: 1, fillColor: corDaArea(g.tipo), fillOpacity: 0.45 };
        const camadaGeo = L.geoJSON(g.geojson, { style: estilo, interactive: g.tipo !== 'area_total' });
        const b = camadaGeo.getBounds();
        if (b.isValid()) { limites.extend(b); desenhados++; }
        const nome = nomeDe(g);
        if (ehPasto) {
          camadaGeo.on('click', () => setSelecionadoId(g.id));
          const sub = !d || !d.temFechamento ? '—' : (d.cabecas ?? 0) === 0 ? 'vazio' : `${formatNum(d.kgHa ?? 0, 0)} kg/ha`;
          // o hover mostra sempre o nome e o kg/ha (é onde fica o rótulo que não coube)
          camadaGeo.bindTooltip(`${nome} · ${sub}`, { sticky: true });
          if (filtros.nomes && b.isValid()) {
            const aneis = aneisEmPixels(mapa, g.geojson);
            if (aneis && aneis[0]?.length >= 3) {
              const polo = pontoMaisInterno(aneis, 2);
              const xs = aneis[0].map(pt => pt[0]);
              candidatos.push({
                id: g.id, nome, sub, ancora: mapa.unproject(L.point(polo.x, polo.y), ZOOM_DE_MEDIDA), folga: polo.folga,
                largura: Math.max(...xs) - Math.min(...xs), prioridade: areaEmHectares(g.geojson), aneis,
              });
            }
          }
        } else if (g.tipo !== 'area_total') {
          camadaGeo.bindTooltip(nome, { sticky: true });
        }
        camadaGeo.addTo(grupo);
        camadasRef.current.set(g.id, camadaGeo);
      } catch {
        /* polígono inválido: fica de fora */
      }
    }
    rotulosRef.current = candidatos;
    reportRenderedGeometries(desenhados);
    onRenderedChange?.(desenhados);
    const chave = geometrias.map(x => x.id).join(',');
    if (limites.isValid() && enquadrouRef.current !== chave) {
      enquadrouRef.current = chave;
      try { mapa.fitBounds(limites, { paddingTopLeft: [240, 70], paddingBottomRight: [20, 60], animate: false, maxZoom: 16 }); } catch { /* */ }
    }
    // depois do enquadramento: os rótulos se arrumam no zoom em que o mapa vai ficar
    desenharRotulos(mapa, rotulos, candidatos);
  }, [mapStatus, geometrias, dadosDoMes, camada, filtros, selecionadoId, pastoPorId, mapInstanceRef, featureLayerRef, labelLayerRef,
    reportRenderedGeometries, onRenderedChange]);

  /* fix1 (2): o rótulo tem tamanho fixo na tela, então a colisão se refaz a cada zoom */
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    const mapa = mapInstanceRef.current;
    const rotulos = labelLayerRef.current;
    if (!mapa || !rotulos) return;
    const refazer = () => desenharRotulos(mapa, rotulos, rotulosRef.current);
    mapa.on('zoomend', refazer);
    return () => { mapa.off('zoomend', refazer); };
  }, [mapStatus, mapInstanceRef, labelLayerRef]);

  const enquadrar = (limites: L.LatLngBounds, comPainel: boolean) => {
    const mapa = mapInstanceRef.current;
    if (!mapa || !limites.isValid()) return;
    mapa.fitBounds(limites, { paddingTopLeft: [filtrosAbertos ? 240 : 20, 70], paddingBottomRight: [comPainel ? 352 : 20, 60], maxZoom: 16 });
  };
  const fazendaInteira = () => {
    const l = L.latLngBounds([]);
    camadasRef.current.forEach(c => { const b = c.getBounds(); if (b.isValid()) l.extend(b); });
    enquadrar(l, !!selecionadoId);
  };
  const irParaPasto = (pastoId: string) => {
    const g = geoPastos.find(x => x.pasto_id === pastoId);
    if (!g) return;
    setSelecionadoId(g.id);
    enquadrar((camadasRef.current.get(g.id) ?? L.geoJSON(g.geojson)).getBounds(), true);
  };

  const opcoesBusca = useMemo(() => geoPastos
    .map(g => ({ value: g.pasto_id!, label: pastoPorId.get(g.pasto_id!)?.nome ?? g.nome_original }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })), [geoPastos, pastoPorId]);

  const camadaAtual = CAMADAS.find(c => c.valor === camada);
  const nomeCamada = camadaAtual?.rotulo ?? '';
  const nomeCurtoCamada = camadaAtual?.curto ?? nomeCamada;
  const mesDoMapa = mesCurtoNumerico(anoMes);
  let subtitulo = '';
  if (pastoSelecionado) {
    if (!dadosSelecionado) subtitulo = `Fora da vigência em ${mesDoMapa}`;
    else if (!dadosSelecionado.temFechamento) {
      subtitulo = `Sem fechamento em ${mesDoMapa}${dadosSelecionado.ultimoFechamento ? ` · último fechamento ${mesCurtoNumerico(dadosSelecionado.ultimoFechamento)}` : ''}`;
    } else subtitulo = `${rotuloDaAtividade(dadosSelecionado.atividade)} · fechamento ${mesDoMapa}`;
  }
  const hist = dadosSelecionado?.historico ?? [];
  const maxHist = Math.max(1, ...hist.map(h => h.kgHa ?? 0));

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="mapa-gestor">
      {/* Barra 40px */}
      <div className="relative z-[600] flex h-[34px] flex-none items-center gap-1.5 border-b border-[#D9DEE5] bg-white px-2.5" data-testid="mapa-barra">
        <Button type="button" variant="outline" size="sm" onClick={() => setFiltrosAbertos(v => !v)}
          className={`h-[24px] w-[72px] flex-none gap-1 px-2 text-[11px] ${filtrosAbertos ? 'border-[#1B2A44] bg-[#1B2A44] text-white hover:bg-[#1B2A44] hover:text-white' : ''}`}>
          <ListFilter className="h-3 w-3" /> Filtros
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-[24px] w-[100px] flex-none gap-1 bg-[#2F7D4F] px-2 text-[11px] text-white hover:bg-[#2F7D4F]/90">
              <Plus className="h-3 w-3" /> Adicionar <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${MENU_ACIMA} w-[230px]`} data-testid="menu-adicionar">
            {MENU_ADICIONAR.map((gr, gi) => (
              <div key={gr.grupo ?? gi}>
                {gr.grupo && <><DropdownMenuSeparator /><DropdownMenuLabel>{gr.grupo}</DropdownMenuLabel></>}
                {gr.itens.map(item => item.itens ? (
                  <DropdownMenuSub key={item.rotulo}>
                    <DropdownMenuSubTrigger className="justify-between">
                      <span>{item.rotulo}</span><span className="ml-auto mr-1 rounded-full bg-white/15 px-1.5 text-[9.5px]">em breve</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={`${MENU_ACIMA} max-h-[70vh] w-[220px] overflow-y-auto`}>
                      {item.itens.map((sub, si) => (
                        <div key={sub.rotulo}>
                          {sub.grupo && sub.grupo !== item.itens?.[si - 1]?.grupo && <DropdownMenuLabel>{sub.grupo}</DropdownMenuLabel>}
                          <DropdownMenuItem disabled>{sub.rotulo}</DropdownMenuItem>
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : itemFunciona(item) ? (
                  <DropdownMenuItem key={item.rotulo} onSelect={onImportar}><Upload className="mr-1.5 h-3 w-3" />{item.rotulo}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.rotulo} disabled className="justify-between">
                    <span>{item.rotulo}</span><span className="rounded-full bg-white/15 px-1.5 text-[9.5px]">em breve</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" title={`Camadas: ${nomeCamada}`}
              className="h-[24px] w-[184px] flex-none justify-between gap-1 bg-[#2B6CB0] px-2 text-[11px] text-white hover:bg-[#2B6CB0]/90">
              <span className="truncate">Camadas: <b className="font-semibold">{nomeCurtoCamada}</b></span>
              <ChevronDown className="h-3 w-3 flex-none" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${MENU_ACIMA} w-[250px]`}>
            <DropdownMenuLabel>Rebanho</DropdownMenuLabel>
            {CAMADAS.map(c => (
              <DropdownMenuItem key={c.valor} onSelect={() => setCamada(c.valor)} className={c.valor === camada ? 'font-semibold' : ''}>
                {c.rotulo}
              </DropdownMenuItem>
            ))}
            {/* MAPA-02b (D5): o fundo do mapa — a escolha fica salva por usuário (todos os mapas da casa a seguem, P2) */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Fundo</DropdownMenuLabel>
            {FUNDOS.map(f => (
              <DropdownMenuItem key={f.valor} onSelect={() => trocarFundo(f.valor)} className={f.valor === fundo ? 'font-semibold' : ''}
                data-testid={`mapa-fundo-${f.valor}`}>
                {f.rotulo}
              </DropdownMenuItem>
            ))}
            {CAMADAS_EM_BREVE.map(gr => (
              <div key={gr.grupo}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{gr.grupo}</DropdownMenuLabel>
                {gr.itens.map(i => (
                  <DropdownMenuItem key={i} disabled className="justify-between">
                    <span>{i}</span><span className="rounded-full bg-white/15 px-1.5 text-[9.5px]">em breve</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0 flex-1" />
        <div className="flex flex-none items-center gap-1">{seletorDeMes}</div>
        <Button type="button" variant="outline" size="sm" className="h-[24px] w-[92px] flex-none px-1.5 text-[11px]" onClick={fazendaInteira}>
          Fazenda inteira
        </Button>
        <div className="w-[124px] flex-none" data-testid="mapa-busca">
          {/* a busca só leva ao pasto (mostra sempre "Buscar pasto…"): o escolhido aparece no painel, e um nome longo cortado aqui seria "…" fora de tabela */}
          <SearchableSelect value="" onValueChange={v => { if (v) irParaPasto(v); }}
            options={opcoesBusca} allLabel="Buscar pasto…" allValue="" semTodos placeholder="Buscar pasto…"
            contentClassName={MENU_ACIMA} triggerClassName="h-[24px] text-[11px]" />
        </div>
        <div className="flex-none">{trocaDeVista}</div>
      </div>

      {/* Mapa + vidros */}
      {/* o zoom (e os créditos) ficam SEMPRE à esquerda da coluna do painel: abrir ou fechar o pasto não move nada (UI-SEM-DESLOCAR-01) */}
      <div className="relative min-h-0 flex-1 bg-[#3a4436] [&_.leaflet-bottom.leaflet-right]:bottom-[50px] [&_.leaflet-bottom.leaflet-right]:right-[302px]">
        <div className="absolute inset-0">
          {/* fix1 (1): o Chrome desenhava um retângulo azul (contorno de foco) no polígono clicado (Gabriel, proto, 31/10 08:27): sem contorno
              de foco SÓ nos polígonos do mapa; o foco de teclado do resto da tela continua */}
          <div ref={mapContainerRef} className="h-full w-full [&_path.leaflet-interactive:focus]:outline-none" data-testid="mapa-gestor-mapa" />
        </div>

        {hasGeo && (
          <div className={`absolute left-3 top-3 z-[500] flex gap-[3px] p-[3px] ${VIDRO}`} data-testid="mapa-kpis">
            <Kpi rotulo="Alocadas" valor={numero(kpis.cabecas)} unidade={kpis.cabecas == null ? undefined : 'cab.'} />
            <Kpi rotulo="Peso méd." valor={numero(kpis.pesoMedio, 0, ' kg')} />
            <Kpi rotulo="Lotação" valor={numero(kpis.lotacao, 0, ' kg/ha')} unidade={textoUaHa(kpis.uaHa)} largura={140} />
            <Kpi rotulo="Área pastos" valor={numero(kpis.area, 1, ' ha')} />
            {/* fix1 E: o aviso tem lugar reservado (aparecer não move nada) */}
            <div className={`flex w-[74px] flex-none items-center text-[9.5px] leading-[12px] text-[#8A5A00] ${fechamentoAberto ? '' : 'invisible'}`}
              data-testid="mapa-fechamento-aberto" aria-hidden={!fechamentoAberto}>
              fechamento de {mesDoMapa} aberto
            </div>
          </div>
        )}

        {hasGeo && filtrosAbertos && (
          <div className={`absolute bottom-[50px] left-3 top-[59px] z-[500] w-[190px] overflow-y-auto px-2.5 py-2 ${VIDRO}`} data-testid="mapa-filtros">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
              Filtros
              <button type="button" className="text-[10.5px] font-normal text-[#2B6CB0]" onClick={() => setFiltrosAbertos(false)}>Ocultar</button>
            </div>
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Mostrar no mapa</div>
            <LinhaFiltro rotulo="Pastos" marcado={filtros.pastos} n={contagens.pastos} onChange={v => setFiltros(f => ({ ...f, pastos: v }))} />
            <LinhaFiltro rotulo="Áreas da fazenda" marcado={filtros.areas} n={contagens.areas} onChange={v => setFiltros(f => ({ ...f, areas: v }))} />
            <LinhaFiltro rotulo="Área sem uso (terceiros)" marcado={filtros.semUso} n={contagens.semUso} onChange={v => setFiltros(f => ({ ...f, semUso: v }))} />
            <LinhaFiltro rotulo="Nomes dos pastos" marcado={filtros.nomes} onChange={v => setFiltros(f => ({ ...f, nomes: v }))} />
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Atividade ({mesDoMapa})</div>
            {contagens.atividades.length === 0 ? <div className="text-[10.5px] text-[#5A6472]">—</div> : contagens.atividades.map(([a, n]) => (
              <LinhaFiltro key={a} rotulo={a === SEM_ATIVIDADE ? 'Sem atividade' : rotuloDaAtividade(a)} marcado={!filtros.atividadesOcultas.has(a)} n={n}
                onChange={v => setFiltros(f => {
                  const s = new Set(f.atividadesOcultas);
                  if (v) s.delete(a); else s.add(a);
                  return { ...f, atividadesOcultas: s };
                })} />
            ))}
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Situação</div>
            <LinhaFiltro rotulo="Com animais" marcado={filtros.comAnimais} n={contagens.comAnimais} onChange={v => setFiltros(f => ({ ...f, comAnimais: v }))} />
            <LinhaFiltro rotulo="Vazio" marcado={filtros.vazio} n={contagens.vazio} onChange={v => setFiltros(f => ({ ...f, vazio: v }))} />
            <LinhaFiltro rotulo="Sem fechamento no mês" marcado={filtros.semFechamento} n={contagens.semFechamento}
              onChange={v => setFiltros(f => ({ ...f, semFechamento: v }))} />
          </div>
        )}

        {geoSelecionada && pastoSelecionado && (
          <div className={`absolute bottom-3 right-3 top-3 z-[500] flex w-[286px] flex-col overflow-hidden ${VIDRO}`} data-testid="mapa-painel">
            <div className="flex-none border-b border-black/[0.08] px-3 pb-2 pt-2.5">
              <div className="flex items-start gap-2">
                <b className="min-w-0 break-words text-[13px] leading-[16px]">{pastoSelecionado.nome}</b>
                <span className="flex-none rounded-lg bg-[#E3F2E8] px-1.5 py-px text-[9.5px] font-semibold text-[#2F6E45]">Vinculado</span>
                <button type="button" aria-label="Fechar" className="ml-auto flex-none text-[#4A5361] hover:text-[#1d232b]" onClick={() => setSelecionadoId(null)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* duas linhas reservadas: o subtítulo longo quebra (fora de tabela, nada de "…") e nada abaixo se desloca */}
              <div className="mt-0.5 h-[26px] overflow-hidden text-[10.5px] leading-[13px] text-[#4A5361]">{subtitulo}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Cel rotulo="Área" valor={numero(pastoSelecionado.area_produtiva_ha, 1, ' ha')} />
                <Cel rotulo="Cabeças" valor={numero(dadosSelecionado?.cabecas)} />
                <Cel rotulo="Peso méd." valor={numero(dadosSelecionado?.pesoMedioKg, 0, ' kg')} />
                <Cel rotulo="Lotação kg/ha" valor={numero(dadosSelecionado?.kgHa)} destaque
                  unidade={textoUaHa(dadosSelecionado?.temFechamento ? uaPorHa(dadosSelecionado.cabecas, dadosSelecionado.pesoMedioKg, pastoSelecionado.area_produtiva_ha) : null)} />
              </div>
              <div className="mb-1 mt-3 text-[9.5px] font-semibold text-[#4A5361]">Categorias</div>
              {/* tabela: uma linha por categoria, o nome longo com "…" e o inteiro no title (a regra de reticências do gate confere o title) */}
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} data-reticencias-com-title>
                <colgroup><col /><col style={{ width: 44 }} /><col style={{ width: 60 }} /></colgroup>
                <tbody>
                  {(dadosSelecionado?.categorias ?? []).map(c => (
                    <tr key={c.nome}>
                      <td className="h-[18px] truncate px-1 text-[10.5px]" title={c.nome}>{c.nome}</td>
                      <td className="h-[18px] px-1 text-right text-[10.5px] font-semibold tabular-nums">{formatNum(c.quantidade, 0)}</td>
                      <td className="h-[18px] px-1 text-right text-[10px] tabular-nums text-[#5A6472]">{numero(c.peso_medio_kg, 0, ' kg')}</td>
                    </tr>
                  ))}
                  {(dadosSelecionado?.categorias.length ?? 0) > 1 && (
                    <tr className="border-t border-black/[0.12]" data-testid="mapa-painel-total">
                      <td className="h-[18px] px-1 text-[10.5px] font-semibold">Total</td>
                      <td className="h-[18px] px-1 text-right text-[10.5px] font-semibold tabular-nums">{numero(dadosSelecionado?.cabecas)}</td>
                      <td className="h-[18px] px-1 text-right text-[10px] font-semibold tabular-nums">{numero(dadosSelecionado?.pesoMedioKg, 0, ' kg')}</td>
                    </tr>
                  )}
                  {(dadosSelecionado?.categorias.length ?? 0) === 0 && (
                    <tr><td colSpan={3} className="h-[18px] px-1 text-[10.5px] text-[#5A6472]">
                      {dadosSelecionado?.temFechamento ? 'Sem animais no fechamento do mês' : '—'}
                    </td></tr>
                  )}
                </tbody>
              </table>
              <div className="mb-1 mt-3 flex justify-between text-[9.5px] font-semibold text-[#4A5361]">
                <span>Histórico de lotação</span><span className="font-normal">kg/ha</span>
              </div>
              <div className="flex h-[84px] items-end gap-1 pt-1" data-testid="mapa-historico">
                {hist.map(h => (
                  <div key={h.anoMes} className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    title={`${mesAbreviado(h.anoMes)}/${h.anoMes.slice(2, 4)}: ${h.kgHa == null ? 'sem fechamento' : `${formatNum(h.kgHa, 0)} kg/ha`}`}>
                    <span className="mb-px block text-center text-[9.5px] leading-[11px] tabular-nums">{h.kgHa == null ? '—' : valorDaBarra(h.kgHa)}</span>
                    {h.kgHa != null && (
                      <div className="w-full rounded-t-[2px]" style={{ height: Math.max(2, (h.kgHa / maxHist) * 60), background: h.faixa ? COR_DA_FAIXA[h.faixa] : COR_DA_FAIXA.vazio }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-0.5 flex gap-1">
                {hist.map(h => <div key={h.anoMes} className="min-w-0 flex-1 text-center text-[9.5px] text-[#5A6472]">{mesAbreviado(h.anoMes)}</div>)}
              </div>
              {pastoSelecionado.observacoes && (
                <>
                  <div className="mb-1 mt-3 text-[9.5px] font-semibold text-[#4A5361]">Observações</div>
                  <p className="text-[10.5px] leading-[14px] text-[#1d232b]">{pastoSelecionado.observacoes}</p>
                </>
              )}
              <div className="mb-1 mt-3 text-[9.5px] font-semibold text-[#4A5361]">Satélite (vigor do capim)</div>
              <div className="text-[10.5px] text-[#5A6472]">Em breve.</div>
            </div>
          </div>
        )}

        {hasGeo && (
          /* fix1 (4): a legenda tem o tamanho do conteúdo, à esquerda, e nunca passa por baixo do painel do pasto */
          <div className={`absolute bottom-3 left-3 z-[500] flex h-[30px] w-fit items-center gap-2.5 overflow-hidden px-2.5 text-[9.5px] ${VIDRO}`}
            style={{ maxWidth: selecionadoId ? 'calc(100% - 322px)' : 'calc(100% - 24px)' }} data-testid="mapa-legenda">
            <b className="flex-none whitespace-nowrap text-[10px]">{nomeCamada}</b>
            {legenda.map(i => (
              <span key={i.rotulo} className="flex flex-none items-center gap-1 whitespace-nowrap">
                <i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: i.cor }} />{i.rotulo}
              </span>
            ))}
            {/* o mês já está no seletor da barra: aqui só a leitura em curso ou o erro */}
            {(erroDoMes || carregandoMes) && (
              <span className="flex-none whitespace-nowrap text-[#4A5361]">
                {erroDoMes ? <span className="text-[#B03A2E]">{erroDoMes}</span> : 'Lendo o mês…'}
              </span>
            )}
          </div>
        )}

        {geoLoading && (
          <div className="absolute inset-0 z-[700] flex items-center justify-center bg-background/50">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!hasGeo && !geoLoading && (
          <div className="absolute inset-0 z-[700] flex flex-col items-center justify-center gap-2 bg-card">
            <MapPin className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">Nenhum mapa importado</p>
            <Button size="sm" variant="outline" className="h-[26px] text-[11px]" onClick={onImportar}>
              <Upload className="mr-1 h-3 w-3" /> Importar mapa (KML/KMZ)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
