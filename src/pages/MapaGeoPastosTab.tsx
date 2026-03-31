import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { parseKMLFile, type ParsedPolygon } from '@/lib/kmlParser';
import { calcUA, calcUAHa, calcPesoMedioPonderado } from '@/lib/calculos/zootecnicos';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, Map as MapIcon, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { MESES_COLS } from '@/lib/calculos/labels';
import { PastoDetailSheet } from '@/components/mapa-geo/PastoDetailSheet';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface PastoMapData {
  pasto: Pasto;
  geometria: { geojson: GeoJSON.Geometry; cor: string | null } | null;
  totalCabecas: number;
  pesoMedio: number | null;
  uaTotal: number;
  uaHa: number | null;
  lote: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null; categoria_nome: string }>;
  ultimaCondicao: string | null;
}

export function MapaGeoPastosTab() {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { geometrias, loading: geoLoading, salvarGeometrias, removerGeometrias } = usePastoGeometrias();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();

  const curYear = new Date().getFullYear();
  const [anoFiltro, setAnoFiltro] = useState(String(curYear));
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
  const [filtroLote, setFiltroLote] = useState<string>('__all__');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('__all__');
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;

  const [pastosData, setPastosData] = useState<PastoMapData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPasto, setSelectedPasto] = useState<PastoMapData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const layerGroup = useRef<L.LayerGroup | null>(null);

  const hasGeometries = geometrias.length > 0;

  const anosDisp = useMemo(() => {
    const arr: string[] = [];
    for (let y = curYear; y >= curYear - 3; y--) arr.push(String(y));
    return arr;
  }, [curYear]);

  // Load fechamento data
  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  // Build pasto data
  useEffect(() => {
    const build = async () => {
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
      if (pastosAtivos.length === 0) { setPastosData([]); return; }
      setLoading(true);

      const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));
      const allItems = await Promise.all(fechamentos.map(f => loadItens(f.id)));
      const itemsByFechId = new Map(fechamentos.map((f, i) => [f.id, allItems[i]]));
      const geoMap = new Map(geometrias.map(g => [g.pasto_id, g]));

      const pastoIds = pastosAtivos.map(p => p.id);
      const { data: condicoes } = await supabase
        .from('pasto_condicoes')
        .select('pasto_id, condicao, data_registro')
        .in('pasto_id', pastoIds)
        .order('data_registro', { ascending: false });
      const condicaoMap = new Map<string, string>();
      (condicoes || []).forEach(c => {
        if (!condicaoMap.has(c.pasto_id)) condicaoMap.set(c.pasto_id, c.condicao);
      });

      const result: PastoMapData[] = pastosAtivos.map(pasto => {
        const fech = fechMap.get(pasto.id);
        const catMap = new Map<string, { quantidade: number; peso_medio_kg: number | null; categoria_nome: string }>();

        if (fech) {
          const items = itemsByFechId.get(fech.id) || [];
          items.forEach(item => {
            const cat = categorias.find(c => c.id === item.categoria_id);
            catMap.set(item.categoria_id, {
              quantidade: item.quantidade,
              peso_medio_kg: item.peso_medio_kg,
              categoria_nome: cat?.nome || 'Desconhecida',
            });
          });
        }

        const totalCab = Array.from(catMap.values()).reduce((s, v) => s + v.quantidade, 0);
        const pesoMedio = calcPesoMedioPonderado(
          Array.from(catMap.values()).map(v => ({ quantidade: v.quantidade, pesoKg: v.peso_medio_kg }))
        );
        let uaTotal = 0;
        catMap.forEach(v => { uaTotal += calcUA(v.quantidade, v.peso_medio_kg); });
        const uaHa = calcUAHa(uaTotal, pasto.area_produtiva_ha);

        const geo = geoMap.get(pasto.id);

        return {
          pasto,
          geometria: geo ? { geojson: geo.geojson, cor: geo.cor } : null,
          totalCabecas: totalCab,
          pesoMedio,
          uaTotal,
          uaHa,
          lote: fech?.lote_mes ?? null,
          qualidade: fech?.qualidade_mes ?? null,
          categorias: catMap,
          ultimaCondicao: condicaoMap.get(pasto.id) || null,
        };
      });

      setPastosData(result);
      setLoading(false);
    };
    build();
  }, [fechamentos, pastos, geometrias, categorias, loadItens]);

  const lotesDisp = useMemo(() => {
    const set = new Set<string>();
    pastosData.forEach(p => { if (p.lote) set.add(p.lote); });
    return Array.from(set).sort();
  }, [pastosData]);

  const filteredPastos = useMemo(() => {
    return pastosData.filter(p => {
      if (filtroLote !== '__all__' && p.lote !== filtroLote) return false;
      if (filtroCategoria !== '__all__') {
        const hasCat = Array.from(p.categorias.values()).some(v => v.categoria_nome === filtroCategoria);
        if (!hasCat) return false;
      }
      return true;
    });
  }, [pastosData, filtroLote, filtroCategoria]);

  const getColor = useCallback((data: PastoMapData): string => {
    if (data.ultimaCondicao === 'ruim') return '#ef4444';
    if (data.ultimaCondicao === 'regular') return '#f59e0b';
    if (data.ultimaCondicao === 'bom') return '#22c55e';
    if (data.uaHa !== null) {
      if (data.uaHa > 3) return '#ef4444';
      if (data.uaHa > 2) return '#f59e0b';
      return '#22c55e';
    }
    return '#6b7280';
  }, []);

  // Initialize Leaflet map — re-run when mapRef mounts
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    if (!hasGeometries) return;

    const map = L.map(mapRef.current, {
      center: [-15.8, -47.9],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    layerGroup.current = L.layerGroup().addTo(map);
    leafletMap.current = map;

    // Ensure correct sizing after mount
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      leafletMap.current = null;
      layerGroup.current = null;
    };
  }, [hasGeometries]);

  // Update polygons on map
  useEffect(() => {
    if (!leafletMap.current || !layerGroup.current) return;

    // Ensure map knows its container size
    leafletMap.current.invalidateSize();

    layerGroup.current.clearLayers();

    const bounds: L.LatLngBounds[] = [];

    filteredPastos.forEach(data => {
      if (!data.geometria) return;

      const color = getColor(data);
      const layer = L.geoJSON(data.geometria.geojson as any, {
        style: {
          color: color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.35,
        },
      });

      const center = layer.getBounds().getCenter();
      const label = L.divIcon({
        className: 'pasto-label',
        html: `<div style="
          background: rgba(255,255,255,0.9);
          border: 1px solid ${color};
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 600;
          color: #1a1a1a;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        ">${data.pasto.nome}<br/><span style="font-size:10px;font-weight:400;color:#666">${data.totalCabecas} cab</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(center, { icon: label }).addTo(layerGroup.current!);

      layer.on('click', () => {
        setSelectedPasto(data);
        setSheetOpen(true);
      });

      layer.addTo(layerGroup.current!);
      bounds.push(layer.getBounds());
    });

    if (bounds.length > 0) {
      const combined = bounds.reduce((acc, b) => acc.extend(b));
      leafletMap.current.fitBounds(combined, { padding: [30, 30], maxZoom: 17 });
    }
  }, [filteredPastos, getColor]);

  const handleKmlUpload = useCallback(async (polygons: ParsedPolygon[]) => {
    const pastoMap = new Map(pastos.filter(p => p.ativo).map(p => [p.nome.trim().toLowerCase(), p]));

    const items = polygons.map(poly => {
      const matched = pastoMap.get(poly.name.trim().toLowerCase());
      return {
        pasto_id: matched?.id || null,
        nome_original: poly.name,
        geojson: poly.geojson,
      };
    });

    const success = await salvarGeometrias(items);
    if (success) setUploadOpen(false);
  }, [pastos, salvarGeometrias]);

  const handleRemoveMap = useCallback(async () => {
    setRemoving(true);
    await removerGeometrias();
    setConfirmRemoveOpen(false);
    setRemoving(false);
  }, [removerGeometrias]);

  if (isGlobal) {
    return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para ver o mapa.</div>;
  }

  const hasGeometries = geometrias.length > 0;
  const lastUpload = hasGeometries
    ? new Date(geometrias.reduce((latest, g) => g.created_at > latest ? g.created_at : latest, geometrias[0].created_at))
    : null;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Filters bar */}
      <div className="flex-shrink-0 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 z-50">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={anoFiltro} onValueChange={setAnoFiltro}>
              <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES_COLS.map((m, i) => (
                  <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroLote} onValueChange={setFiltroLote}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="Lote" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos Lotes</SelectItem>
                {lotesDisp.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas Cat.</SelectItem>
                {categorias.map(c => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            {hasGeometries && (
              <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                {geometrias.length} polígonos
                {lastUpload && ` · ${lastUpload.toLocaleDateString('pt-BR')}`}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs h-6">
              {filteredPastos.reduce((s, p) => s + p.totalCabecas, 0)} cab
            </Badge>
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setUploadOpen(true)}>
              {hasGeometries ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar Mapa</>
              ) : (
                <><Upload className="h-3.5 w-3.5 mr-1" />Importar Mapa</>
              )}
            </Button>
            {hasGeometries && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmRemoveOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />Remover
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Map or empty state */}
      <div className="flex-1 min-h-0 relative">
        {(loading || geoLoading) && (
          <div className="absolute inset-0 z-20 bg-background/60 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!hasGeometries && !geoLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <MapIcon className="h-16 w-16 text-muted-foreground/30" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Nenhum mapa cadastrado</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Clique em "Importar Mapa" para enviar o arquivo KML, KMZ ou GeoJSON da fazenda.
                Os polígonos serão vinculados automaticamente aos pastos cadastrados.
              </p>
            </div>
            <Button onClick={() => setUploadOpen(true)} className="mt-2">
              <Upload className="h-4 w-4 mr-2" />Importar Mapa
            </Button>
          </div>
        ) : (
          <div ref={mapRef} className="absolute inset-0 overflow-hidden" />
        )}
      </div>

      {/* Detail sheet */}
      <PastoDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        data={selectedPasto}
        anoMes={anoMes}
        categorias={categorias}
        allPastos={pastos}
      />

      {/* Upload dialog */}
      <KmlUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleKmlUpload}
        onRemove={handleRemoveMap}
        pastos={pastos}
        hasExistingMap={hasGeometries}
      />

      {/* Remove confirmation */}
      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover mapa da fazenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os polígonos serão removidos do mapa. Os dados históricos de movimentações e condições dos pastos serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMap}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Remover Mapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
