import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Upload, Map as MapIcon, Loader2, Layers, X } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos } from '@/hooks/usePastos';
import { parseKMLFile, type ParsedPolygon } from '@/lib/kmlParser';
import { formatNum } from '@/lib/calculos/formatters';

export interface PastoMapData {
  pasto: any;
  geometria: any;
  totalCabecas: number;
  pesoMedio: number | null;
  uaTotal: number;
  uaHa: number | null;
  lote: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null; categoria_nome: string }>;
  ultimaCondicao: string | null;
}

// Status-based colors for polygons
const STATUS_STYLES: Record<string, { fillColor: string; color: string }> = {
  adequado:  { fillColor: 'hsl(145, 50%, 55%)', color: 'hsl(145, 50%, 35%)' },
  atencao:   { fillColor: 'hsl(45, 80%, 60%)',  color: 'hsl(45, 60%, 40%)' },
  pressao:   { fillColor: 'hsl(0, 60%, 60%)',   color: 'hsl(0, 50%, 40%)' },
  descanso:  { fillColor: 'hsl(210, 55%, 60%)', color: 'hsl(210, 50%, 40%)' },
  vazio:     { fillColor: 'hsl(220, 10%, 70%)', color: 'hsl(220, 10%, 50%)' },
  default:   { fillColor: 'hsl(213, 52%, 55%)', color: 'hsl(213, 52%, 30%)' },
};

function getPolyStyle(geo: any, selected: boolean) {
  const status = geo.pasto_id ? 'default' : 'vazio';
  const s = STATUS_STYLES[status] || STATUS_STYLES.default;
  return {
    color: selected ? 'hsl(213, 80%, 40%)' : s.color,
    weight: selected ? 3 : 1.5,
    fillColor: selected ? 'hsl(213, 70%, 50%)' : s.fillColor,
    fillOpacity: selected ? 0.45 : 0.25,
  };
}

interface SelectedPasto {
  geo: any;
  bounds: L.LatLngBounds;
}

export function MapaGeoPastosTab() {
  const { isGlobal } = useFazenda();
  const { pastos } = usePastos();
  const { geometrias, loading: geoLoading, salvarGeometrias } = usePastoGeometrias();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedPasto | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const hasGeo = geometrias.length > 0;
  const vinculados = geometrias.filter(g => g.pasto_id).length;

  // Init map
  useEffect(() => {
    const el = mapRef.current;
    if (!el || mapInstance.current) return;

    const map = L.map(el, {
      center: [-15.8, -47.9],
      zoom: 5,
      zoomControl: false,
    });

    // Discrete zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      layerRef.current = null;
    };
  }, []);

  // Draw polygons
  useEffect(() => {
    const map = mapInstance.current;
    const lg = layerRef.current;
    if (!map || !lg) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
      lg.clearLayers();

      if (geometrias.length === 0) return;

      const allBounds: L.LatLngBounds[] = [];

      geometrias.forEach((geo) => {
        try {
          const isSelected = selected?.geo?.id === geo.id;
          const layer = L.geoJSON(geo.geojson as any, {
            style: getPolyStyle(geo, isSelected),
          });

          const b = layer.getBounds();
          if (!b.isValid()) return;

          // Label
          if (geo.nome_original) {
            const center = b.getCenter();
            const label = L.divIcon({
              className: 'pasto-label',
              html: `<span style="font-size:10px;font-weight:600;color:hsl(222,47%,11%);text-shadow:0 0 3px white,0 0 3px white;">${geo.nome_original}</span>`,
            });
            L.marker(center, { icon: label, interactive: false }).addTo(lg);
          }

          layer.on('click', () => {
            setSelected({ geo, bounds: b });
          });

          layer.addTo(lg);
          allBounds.push(b);
        } catch (err) {
          console.error('[Mapa] Erro geometria:', err);
        }
      });

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        map.fitBounds(combined, { padding: [40, 40], maxZoom: 17 });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [geometrias, selected]);

  const handleKmlUpload = useCallback(async (polygons: ParsedPolygon[]) => {
    const pastoMap = new Map(pastos.filter(p => p.ativo).map(p => [p.nome.trim().toLowerCase(), p]));
    const items = polygons.map(poly => ({
      pasto_id: pastoMap.get(poly.name.trim().toLowerCase())?.id || null,
      nome_original: poly.name,
      geojson: poly.geojson,
    }));
    const success = await salvarGeometrias(items);
    if (success) setUploadOpen(false);
  }, [pastos, salvarGeometrias]);

  if (isGlobal) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Selecione uma fazenda para ver o mapa.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 h-full overflow-y-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Mapa de Pastos</h2>
          <p className="text-[11px] text-muted-foreground">Visualização georreferenciada da fazenda</p>
        </div>
        <div className="flex items-center gap-2">
          {hasGeo && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                <Layers className="h-3 w-3" />
                {geometrias.length} polígonos
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5">
                {vinculados} vinculados
              </Badge>
            </div>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {hasGeo ? 'Atualizar' : 'Importar'}
          </Button>
        </div>
      </div>

      {/* Main content: map + optional detail panel */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Map card */}
        <Card className="flex-1 min-h-0 relative overflow-hidden">
          <div
            ref={mapRef}
            className="absolute inset-0 rounded-lg"
            style={{ zIndex: 0 }}
          />

          {/* Loading overlay */}
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-lg">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* Empty state overlay */}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 bg-card z-10 rounded-lg">
              <MapIcon className="h-12 w-12 text-muted-foreground/25" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Nenhum mapa cadastrado</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Importe um arquivo KML, KMZ ou GeoJSON para visualizar os pastos.
                </p>
              </div>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" />Importar Mapa
              </Button>
            </div>
          )}
        </Card>

        {/* Detail side panel — desktop only */}
        {selected && (
          <Card className="hidden sm:flex flex-col w-72 flex-shrink-0 overflow-y-auto">
            <div className="p-3 space-y-3">
              {/* Panel header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground leading-tight">
                    {selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {selected.geo.pasto_id ? 'Vinculado' : 'Sem vínculo'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => setSelected(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Separator />

              {/* Info from linked pasto */}
              {selected.geo.pasto_id ? (
                <PastoLinkedInfo pastoId={selected.geo.pasto_id} pastos={pastos} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Este polígono não está vinculado a nenhum pasto cadastrado.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>

      <KmlUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleKmlUpload}
        onRemove={async () => {}}
        pastos={pastos}
        hasExistingMap={hasGeo}
      />
    </div>
  );
}

/** Mini info panel for a linked pasto */
function PastoLinkedInfo({ pastoId, pastos }: { pastoId: string; pastos: any[] }) {
  const pasto = pastos.find(p => p.id === pastoId);
  if (!pasto) {
    return <p className="text-xs text-muted-foreground">Pasto não encontrado no cadastro.</p>;
  }

  return (
    <div className="space-y-2">
      <InfoItem label="Nome" value={pasto.nome} />
      {pasto.area_produtiva_ha && (
        <InfoItem label="Área (ha)" value={formatNum(pasto.area_produtiva_ha, 1)} />
      )}
      <InfoItem label="Situação" value={pasto.situacao || 'ativo'} />
      {pasto.referencia_rebanho && (
        <InfoItem label="Ref. Rebanho" value={pasto.referencia_rebanho} />
      )}
      {pasto.observacoes && (
        <>
          <Separator />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Observações</p>
            <p className="text-xs text-foreground">{pasto.observacoes}</p>
          </div>
        </>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
