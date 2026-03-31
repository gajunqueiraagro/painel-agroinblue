import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Upload, Map as MapIcon, Loader2 } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos } from '@/hooks/usePastos';
import { parseKMLFile, type ParsedPolygon } from '@/lib/kmlParser';

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

export function MapaGeoPastosTab() {
  const { isGlobal } = useFazenda();
  const { pastos } = usePastos();
  const { geometrias, loading: geoLoading, salvarGeometrias } = usePastoGeometrias();
  const [uploadOpen, setUploadOpen] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const hasGeo = geometrias.length > 0;

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [-15.8, -47.9],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    console.log('[MapaMin] Mapa inicializado');

    return () => {
      map.remove();
      mapInstance.current = null;
      layerRef.current = null;
    };
  }, [hasGeo]); // only mount when we have geometries

  // Draw polygons
  useEffect(() => {
    const map = mapInstance.current;
    const lg = layerRef.current;
    if (!map || !lg) return;

    // Wait a tick for DOM to settle
    const timer = setTimeout(() => {
      map.invalidateSize();
      lg.clearLayers();

      console.log(`[MapaMin] Geometrias disponíveis: ${geometrias.length}`);

      if (geometrias.length === 0) return;

      // Log first geometry for debug
      const first = geometrias[0];
      console.log('[MapaMin] Primeira geometria:', JSON.stringify(first.geojson).slice(0, 200));

      const allBounds: L.LatLngBounds[] = [];

      geometrias.forEach((geo, i) => {
        try {
          const layer = L.geoJSON(geo.geojson as any, {
            style: {
              color: '#000000',
              weight: 2,
              fillColor: '#3b82f6',
              fillOpacity: 0.3,
            },
          });

          const b = layer.getBounds();
          if (!b.isValid()) {
            console.warn(`[MapaMin] Geometria ${i} bounds inválidos, ignorando`);
            return;
          }

          layer.on('click', () => {
            console.log(`[MapaMin] Clique no polígono ${i}: ${geo.nome_original || 'sem nome'}`);
          });

          layer.addTo(lg);
          allBounds.push(b);
        } catch (err) {
          console.error(`[MapaMin] Erro geometria ${i}:`, err);
        }
      });

      console.log(`[MapaMin] Polígonos renderizados: ${allBounds.length}`);

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        console.log(`[MapaMin] Bounds: SW(${combined.getSouthWest().lat.toFixed(4)}, ${combined.getSouthWest().lng.toFixed(4)}) NE(${combined.getNorthEast().lat.toFixed(4)}, ${combined.getNorthEast().lng.toFixed(4)})`);
        map.fitBounds(combined, { padding: [30, 30], maxZoom: 17 });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [geometrias]);

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
    return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para ver o mapa.</div>;
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-background border-b border-border px-3 py-2" style={{ zIndex: 1000 }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Mapa de Pastos (modo estabilização)</span>
          <div className="flex items-center gap-2">
            {hasGeo && <span className="text-xs text-muted-foreground">{geometrias.length} polígonos</span>}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {hasGeo ? 'Atualizar' : 'Importar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 min-h-0 relative" style={{ zIndex: 1 }}>
        {geoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!hasGeo && !geoLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <MapIcon className="h-16 w-16 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum mapa cadastrado</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Clique em "Importar" para enviar o arquivo KML, KMZ ou GeoJSON da fazenda.
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />Importar Mapa
            </Button>
          </div>
        ) : hasGeo ? (
          <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
        ) : null}
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
