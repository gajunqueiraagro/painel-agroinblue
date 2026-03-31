import { useState, useCallback } from 'react';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos } from '@/hooks/usePastos';
import { MapaGestorView } from '@/components/mapa-geo/MapaGestorView';
import { MapaOperacaoView } from '@/components/mapa-geo/MapaOperacaoView';
import type { ParsedPolygon } from '@/lib/kmlParser';

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

type ViewMode = 'gestor' | 'operacao';

export function MapaGeoPastosTab() {
  const { isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { geometrias, loading: geoLoading, salvarGeometrias, loadGeometrias } = usePastoGeometrias();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gestor');

  const hasGeo = geometrias.length > 0;

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar with toggle */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Mapa de Pastos</h2>
          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('gestor')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                viewMode === 'gestor'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Gestor
            </button>
            <button
              onClick={() => setViewMode('operacao')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                viewMode === 'operacao'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Operação
            </button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          {hasGeo ? 'Atualizar' : 'Importar'}
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 p-3 sm:p-4">
        {viewMode === 'gestor' ? (
          <MapaGestorView
            geometrias={geometrias}
            pastos={pastos}
            geoLoading={geoLoading}
            onUpload={() => setUploadOpen(true)}
          />
        ) : (
          <MapaOperacaoView
            geometrias={geometrias}
            pastos={pastos}
            categorias={categorias}
            geoLoading={geoLoading}
            onUpload={() => setUploadOpen(true)}
            onRefresh={loadGeometrias}
          />
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
