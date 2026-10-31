/**
 * MAPA-02a — o mapa de pastos em tela cheia (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`, 31/10/2026), SOMENTE LEITURA.
 * Um mês só (D1), escolhido no seletor da barra: todo número vem do `useMapaDoMes` (o fechamento DAQUELE mês; atividade =
 * `tipo_uso_mes`, D3); as faixas de lotação vêm de `faixasLotacao.ts` (D2, 300/500); as camadas e a legenda, de `camadasDoMapa.ts`.
 * Desenho: pastos pela camada; áreas pelo `fazenda_geometrias.tipo`; `area_total` só contorno tracejado, por baixo e sem clique;
 * área que não é pasto mostra o nome ao passar o mouse e não abre o painel. Clique no pasto abre o painel de vidro (330px).
 * Estabilidade visual: barra, KPIs, filtros, painel e legenda têm lugar e largura fixos — trocar camada, mês, filtro ou pasto não move
 * nada. As ações do rodapé do painel são as que já existiam no Gestor (alterar e remover o vínculo).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Link2, ListFilter, MapPin, Plus, Unlink, Upload, X } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { COR_DA_FAIXA } from '@/lib/mapa/faixasLotacao';
import { mesAbreviado, mesCurtoNumerico, type DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import { CAMADAS, CAMADAS_EM_BREVE, corDaArea, corDoPasto, legendaDaCamada, rotuloDaAtividade, type CamadaDoMapa } from '@/lib/mapa/camadasDoMapa';

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
  /** O rebanho oficial do MESMO mês (null = sem dado). */
  rebanhoOficial: number | null;
  onImportar: () => void;
  onLink?: (geoId: string, pastoId: string) => Promise<boolean>;
  onRenderedChange?: (count: number) => void;
  /** O seletor de ano/mês (o mesmo do Fechamento Área, mês compartilhado). */
  seletorDeMes: ReactNode;
  /** A troca de vista (Gestor · Operação · Validação). */
  trocaDeVista: ReactNode;
}

const VIDRO = 'rounded-[10px] border border-white/60 bg-white/[0.78] shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-[14px] backdrop-saturate-[1.2]';
const MIN_HA_ROTULO = 8;
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

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="w-[88px] flex-none rounded-md bg-white/70 px-2 py-[3px]">
      <div className="text-[9.5px] leading-[12px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[13px] font-semibold leading-[17px] tabular-nums">{valor}</div>
    </div>
  );
}

function Cel({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-md px-2 py-1 ${destaque ? 'bg-[#FFF6D6]' : 'bg-white/75'}`}>
      <div className="text-[9.5px] leading-[12px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[13px] font-semibold leading-[17px] tabular-nums">{valor}</div>
    </div>
  );
}

function LinhaFiltro({ rotulo, marcado, onChange, n }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void; n?: number }) {
  return (
    <label className="flex h-[22px] cursor-pointer items-center gap-1.5 text-[11px]">
      <Checkbox checked={marcado} onCheckedChange={v => onChange(v === true)} className="h-3 w-3 rounded-[2px] [&_svg]:h-2.5 [&_svg]:w-2.5" />
      <span className="min-w-0 flex-1 truncate" title={rotulo}>{rotulo}</span>
      {n != null ? <span className="w-7 flex-none text-right text-[10px] tabular-nums text-[#5A6472]">{n}</span> : null}
    </label>
  );
}

export function MapaGestorView({
  geometrias, pastos, anoMes, dadosDoMes, carregandoMes, erroDoMes, geoLoading, rebanhoOficial, onImportar, onLink, onRenderedChange,
  seletorDeMes, trocaDeVista,
}: Props) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [camada, setCamada] = useState<CamadaDoMapa>('situacao');
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [linkPastoId, setLinkPastoId] = useState('');
  const [linking, setLinking] = useState(false);
  const enquadrouRef = useRef('');
  const camadasRef = useRef(new Map<string, L.GeoJSON>());

  const { mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef, status: mapStatus, reportRenderedGeometries } =
    useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 0 });

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
    };
  }, [geoPastos, dadosDoMes, pastoPorId]);

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
          if (areaEmHectares(g.geojson) >= MIN_HA_ROTULO && filtros.nomes && b.isValid()) {
            L.marker(b.getCenter(), {
              interactive: false,
              icon: L.divIcon({
                className: '',
                iconSize: [0, 0],
                html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;text-align:center;color:#fff;font-size:10px;font-weight:600;line-height:12px;text-shadow:0 1px 2px #000,0 0 2px #000">${nome}<div style="font-weight:400;font-size:9.5px">${sub}</div></div>`,
              }),
            }).addTo(rotulos);
          } else {
            camadaGeo.bindTooltip(`${nome} · ${sub}`, { sticky: true });
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
    reportRenderedGeometries(desenhados);
    onRenderedChange?.(desenhados);
    const chave = geometrias.map(x => x.id).join(',');
    if (limites.isValid() && enquadrouRef.current !== chave) {
      enquadrouRef.current = chave;
      try { mapa.fitBounds(limites, { paddingTopLeft: [240, 70], paddingBottomRight: [20, 60], animate: false, maxZoom: 16 }); } catch { /* */ }
    }
  }, [mapStatus, geometrias, dadosDoMes, camada, filtros, selecionadoId, pastoPorId, mapInstanceRef, featureLayerRef, labelLayerRef,
    reportRenderedGeometries, onRenderedChange]);

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

  const pastosLivres = useMemo(() => {
    const ligados = new Set(geometrias.filter(g => g.pasto_id && g.id !== selecionadoId).map(g => g.pasto_id!));
    return pastos.filter(p => p.ativo && !ligados.has(p.id)).map(p => ({ value: p.id, label: p.nome }));
  }, [pastos, geometrias, selecionadoId]);

  const vincular = async (pastoId: string) => {
    if (!onLink || !geoSelecionada) return;
    setLinking(true);
    const ok = await onLink(geoSelecionada.id, pastoId);
    setLinking(false);
    if (ok) setLinkPastoId('');
  };

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
      <div className="relative z-[600] flex h-10 flex-none items-center gap-1.5 border-b border-[#D9DEE5] bg-white px-2.5" data-testid="mapa-barra">
        <Button type="button" variant="outline" size="sm" onClick={() => setFiltrosAbertos(v => !v)}
          className={`h-[26px] w-[72px] flex-none gap-1 px-2 text-[11px] ${filtrosAbertos ? 'border-[#1B2A44] bg-[#1B2A44] text-white hover:bg-[#1B2A44] hover:text-white' : ''}`}>
          <ListFilter className="h-3 w-3" /> Filtros
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-[26px] w-[100px] flex-none gap-1 bg-[#2F7D4F] px-2 text-[11px] text-white hover:bg-[#2F7D4F]/90">
              <Plus className="h-3 w-3" /> Adicionar <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${MENU_ACIMA} w-[220px]`}>
            <DropdownMenuLabel>Arquivo</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onImportar}><Upload className="mr-1.5 h-3 w-3" />Importar mapa (KML/KMZ)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" title={`Camadas: ${nomeCamada}`}
              className="h-[26px] w-[184px] flex-none justify-between gap-1 bg-[#2B6CB0] px-2 text-[11px] text-white hover:bg-[#2B6CB0]/90">
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
            {CAMADAS_EM_BREVE.map(gr => (
              <div key={gr.grupo}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{gr.grupo}</DropdownMenuLabel>
                {gr.itens.map(i => (
                  <DropdownMenuItem key={i} disabled className="justify-between">
                    <span>{i}</span><span className="rounded-full bg-white/15 px-1.5 text-[9px]">em breve</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0 flex-1" />
        <div className="flex flex-none items-center gap-1">{seletorDeMes}</div>
        <Button type="button" variant="outline" size="sm" className="h-[26px] w-[92px] flex-none px-1.5 text-[11px]" onClick={fazendaInteira}>
          Fazenda inteira
        </Button>
        <div className="w-[124px] flex-none">
          <SearchableSelect value={pastoSelecionado?.id ?? ''} onValueChange={v => { if (v) irParaPasto(v); else setSelecionadoId(null); }}
            options={opcoesBusca} allLabel="Buscar pasto…" allValue="" semTodos placeholder="Buscar pasto…"
            contentClassName={MENU_ACIMA} triggerClassName="h-[26px] text-[11px]" />
        </div>
        <div className="flex-none">{trocaDeVista}</div>
      </div>

      {/* Mapa + vidros */}
      <div className={`relative min-h-0 flex-1 bg-[#3a4436] [&_.leaflet-bottom.leaflet-right]:bottom-[60px] ${selecionadoId ? '[&_.leaflet-bottom.leaflet-right]:right-[346px]' : ''}`}>
        <div className="absolute inset-0">
          <div ref={mapContainerRef} className="h-full w-full" data-testid="mapa-gestor-mapa" />
        </div>

        {hasGeo && (
          <div className={`absolute left-3 top-3 z-[500] flex gap-1.5 p-1.5 ${VIDRO}`} data-testid="mapa-kpis">
            <Kpi rotulo="Alocadas" valor={numero(kpis.cabecas)} />
            <Kpi rotulo="Oficial" valor={numero(rebanhoOficial)} />
            <Kpi rotulo="Peso méd." valor={numero(kpis.pesoMedio, 0, ' kg')} />
            <Kpi rotulo="Lotação" valor={numero(kpis.lotacao, 0, ' kg/ha')} />
            <Kpi rotulo="Área pastos" valor={numero(kpis.area, 1, ' ha')} />
          </div>
        )}

        {hasGeo && filtrosAbertos && (
          <div className={`absolute bottom-[64px] left-3 top-[70px] z-[500] w-[220px] overflow-y-auto px-3 py-2.5 ${VIDRO}`} data-testid="mapa-filtros">
            <div className="mb-1 flex items-center justify-between text-[12px] font-semibold">
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
          <div className={`absolute bottom-[64px] right-3 top-3 z-[500] flex w-[330px] flex-col overflow-hidden ${VIDRO}`} data-testid="mapa-painel">
            <div className="flex-none border-b border-black/[0.08] px-3 pb-2 pt-2.5">
              <div className="flex items-center gap-2">
                <b className="min-w-0 truncate text-[15px]" title={pastoSelecionado.nome}>{pastoSelecionado.nome}</b>
                <span className="flex-none rounded-lg bg-[#E3F2E8] px-1.5 py-px text-[9.5px] font-semibold text-[#2F6E45]">Vinculado</span>
                <button type="button" aria-label="Fechar" className="ml-auto flex-none text-[#4A5361] hover:text-[#1d232b]" onClick={() => setSelecionadoId(null)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-0.5 h-[14px] truncate text-[10.5px] leading-[14px] text-[#4A5361]" title={subtitulo}>{subtitulo}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <Cel rotulo="Área" valor={numero(pastoSelecionado.area_produtiva_ha, 1, ' ha')} />
                <Cel rotulo="Cabeças" valor={numero(dadosSelecionado?.cabecas)} />
                <Cel rotulo="Peso méd." valor={numero(dadosSelecionado?.pesoMedioKg, 0, ' kg')} />
                <Cel rotulo="Lotação kg/ha" valor={numero(dadosSelecionado?.kgHa)} destaque />
              </div>
              <div className="mb-1 mt-3 text-[9.5px] font-semibold text-[#4A5361]">Categorias</div>
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup><col /><col style={{ width: 44 }} /><col style={{ width: 60 }} /></colgroup>
                <tbody>
                  {(dadosSelecionado?.categorias ?? []).map(c => (
                    <tr key={c.nome}>
                      <td className="h-[18px] truncate px-1 text-[10.5px]" title={c.nome}>{c.nome}</td>
                      <td className="h-[18px] px-1 text-right text-[10.5px] font-semibold tabular-nums">{formatNum(c.quantidade, 0)}</td>
                      <td className="h-[18px] px-1 text-right text-[10px] tabular-nums text-[#5A6472]">{numero(c.peso_medio_kg, 0, ' kg')}</td>
                    </tr>
                  ))}
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
                    <span className="mb-px block text-center text-[8px] leading-[10px] tabular-nums">{h.kgHa == null ? '—' : formatNum(h.kgHa, 0)}</span>
                    {h.kgHa != null && (
                      <div className="w-full rounded-t-[2px]" style={{ height: Math.max(2, (h.kgHa / maxHist) * 60), background: h.faixa ? COR_DA_FAIXA[h.faixa] : COR_DA_FAIXA.vazio }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-0.5 flex gap-1">
                {hist.map(h => <div key={h.anoMes} className="min-w-0 flex-1 text-center text-[8px] text-[#5A6472]">{mesAbreviado(h.anoMes)}</div>)}
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
            {onLink && (
              <div className="flex flex-none items-center gap-1.5 border-t border-black/[0.08] px-3 py-2" data-testid="mapa-painel-rodape">
                <div className="min-w-0 flex-1">
                  <SearchableSelect value={linkPastoId} onValueChange={setLinkPastoId} options={pastosLivres} placeholder="Buscar pasto…"
                    allLabel="Alterar vínculo" allValue="" semTodos contentClassName={MENU_ACIMA} triggerClassName="h-[26px] text-[11px]" />
                </div>
                <Button type="button" size="sm" variant="outline" className="h-[26px] w-[70px] flex-none gap-1 bg-white/85 px-2 text-[11px]"
                  disabled={!linkPastoId || linking} onClick={() => vincular(linkPastoId)}>
                  <Link2 className="h-3 w-3" /> Alterar
                </Button>
                <Button type="button" size="sm" variant="outline"
                  className="h-[26px] w-[80px] flex-none gap-1 bg-white/85 px-2 text-[11px] text-destructive hover:text-destructive"
                  disabled={linking} onClick={() => vincular('')}>
                  <Unlink className="h-3 w-3" /> Remover
                </Button>
              </div>
            )}
          </div>
        )}

        {hasGeo && (
          <div className={`absolute bottom-3 left-3 right-3 z-[500] flex h-10 items-center gap-3.5 overflow-hidden px-3.5 text-[10.5px] ${VIDRO}`} data-testid="mapa-legenda">
            <b className="flex-none whitespace-nowrap text-[11px]">{nomeCamada}</b>
            {legenda.map(i => (
              <span key={i.rotulo} className="flex flex-none items-center gap-1.5 whitespace-nowrap">
                <i className="inline-block h-3.5 w-3.5 rounded-[3px]" style={{ background: i.cor }} />{i.rotulo}
              </span>
            ))}
            <span className="ml-auto flex-none whitespace-nowrap text-[#4A5361]">
              {erroDoMes ? <span className="text-[#B03A2E]">{erroDoMes}</span> : carregandoMes ? 'Lendo o mês…' : `Mês ${mesDoMapa}`}
            </span>
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
