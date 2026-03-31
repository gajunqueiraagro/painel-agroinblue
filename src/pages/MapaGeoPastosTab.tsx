import { useState, useCallback } from 'react';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Upload, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos } from '@/hooks/usePastos';
import { usePastoOcupacao } from '@/hooks/usePastoOcupacao';
import { MapaGestorView } from '@/components/mapa-geo/MapaGestorView';
import { MapaOperacaoView } from '@/components/mapa-geo/MapaOperacaoView';
import { ValidacaoPoligonosView } from '@/components/mapa-geo/ValidacaoPoligonosView';
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

type ViewMode = 'gestor' | 'operacao' | 'validacao';

export function MapaGeoPastosTab() {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const {
    geometrias, loading: geoLoading, salvarGeometrias, loadGeometrias,
    atualizarGeometria, excluirGeometrias, vincularPasto,
  } = usePastoGeometrias();
  const { ocupacoes, reload: reloadOcupacao } = usePastoOcupacao(pastos);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gestor');
  const [expanded, setExpanded] = useState(false);

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

  const views: { key: ViewMode; label: string }[] = [
    { key: 'gestor', label: 'Gestor' },
    { key: 'operacao', label: 'Operação' },
    { key: 'validacao', label: 'Validação' },
  ];

  const topBar = (
    <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-1.5 border-b border-border bg-background gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {expanded && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setExpanded(false)}>
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <h2 className="text-[11px] font-semibold text-foreground whitespace-nowrap">
          {expanded && fazendaAtual ? fazendaAtual.nome : 'Mapa de Pastos'}
        </h2>
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          {views.map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                viewMode === v.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => loadGeometrias()} title="Atualizar mapa">
          <RefreshCw className="h-3 w-3" />
        </Button>
        {!expanded && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setExpanded(true)} title="Expandir mapa">
            <Maximize2 className="h-3 w-3" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3 w-3 mr-1" />
          {hasGeo ? 'Atualizar' : 'Importar'}
        </Button>
      </div>
    </div>
  );

  const content = (
    <div className="flex-1 min-h-0 p-2 sm:p-3">
      {viewMode === 'gestor' && (
        <MapaGestorView
          geometrias={geometrias}
          pastos={pastos}
          ocupacoes={ocupacoes}
          geoLoading={geoLoading}
          onUpload={() => setUploadOpen(true)}
        />
      )}
      {viewMode === 'operacao' && (
        <MapaOperacaoView
          geometrias={geometrias}
          pastos={pastos}
          categorias={categorias}
          geoLoading={geoLoading}
          onUpload={() => setUploadOpen(true)}
          onRefresh={loadGeometrias}
        />
      )}
      {viewMode === 'validacao' && (
        <ValidacaoPoligonosView
          geometrias={geometrias}
          pastos={pastos}
          geoLoading={geoLoading}
          onUpdate={atualizarGeometria}
          onDelete={excluirGeometrias}
          onLink={vincularPasto}
          onRefresh={loadGeometrias}
        />
      )}
    </div>
  );

  // Expanded mode — fixed overlay above everything except bottom nav
  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 bottom-16 z-40 bg-background flex flex-col">
          {topBar}
          {content}
        </div>
        <KmlUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUpload={handleKmlUpload}
          onRemove={async () => {}}
          pastos={pastos}
          hasExistingMap={hasGeo}
        />
      </>
    );
  }

  // Normal mode
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {topBar}
      {content}
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
