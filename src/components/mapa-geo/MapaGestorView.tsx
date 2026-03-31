import { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import '@/hooks/useStableLeafletMap';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Upload, X, MapPin } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import type { PastoOcupacao } from '@/hooks/usePastoOcupacao';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';

/* ── Status visual system ── */
const STATUS_STYLES: Record<string, { fill: string; stroke: string; label: string }> = {
  adequado: { fill: 'hsl(145, 38%, 62%)', stroke: 'hsl(145, 30%, 38%)', label: 'Adequado' },
  atencao:  { fill: 'hsl(42, 55%, 65%)',  stroke: 'hsl(42, 40%, 38%)',  label: 'Atenção' },
  pressao:  { fill: 'hsl(0, 45%, 62%)',   stroke: 'hsl(0, 35%, 38%)',   label: 'Pressão' },
  sem_ocupacao: { fill: 'hsl(220, 10%, 76%)', stroke: 'hsl(220, 8%, 52%)', label: 'Vazio' },
};

function polyStyle(status: string, isSelected: boolean) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.sem_ocupacao;
  if (isSelected) {
    return { color: 'hsl(213, 60%, 40%)', weight: 2, fillColor: 'hsl(213, 55%, 55%)', fillOpacity: 0.35 };
  }
  return { color: s.stroke, weight: 0.6, fillColor: s.fill, fillOpacity: 0.18 };
}

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  ocupacoes: Map<string, PastoOcupacao>;
  geoLoading: boolean;
  onUpload: () => void;
  onRenderedChange?: (count: number) => void;
}

interface SelectedGeo { geo: PastoGeometria }

export function MapaGestorView({ geometrias, pastos, ocupacoes, geoLoading, onUpload, onRenderedChange }: Props) {
  const [selected, setSelected] = useState<SelectedGeo | null>(null);
  const lastFitKeyRef = useRef('');

  const {
    mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef,
    status: mapStatus, reportRenderedGeometries,
  } = useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 14 });

  const hasGeo = geometrias.length > 0;

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const linkedIds = new Set(geometrias.filter(g => g.pasto_id).map(g => g.pasto_id!));
    const linkedPastos = pastos.filter(p => linkedIds.has(p.id));
    const totalArea = linkedPastos.reduce((s, p) => s + (p.area_produtiva_ha || 0), 0);
    let totalCab = 0, totalKg = 0, weightedKg = 0, weightedCab = 0;

    linkedIds.forEach(pid => {
      const oc = ocupacoes.get(pid);
      if (!oc) return;
      totalCab += oc.cabecas;
      totalKg += oc.peso_total_kg;
      if (oc.cabecas > 0 && oc.peso_total_kg > 0) { weightedKg += oc.peso_total_kg; weightedCab += oc.cabecas; }
    });

    return {
      totalCabecas: totalCab,
      pesoMedio: weightedCab > 0 ? weightedKg / weightedCab : 0,
      lotacaoKgHa: totalArea > 0 ? totalKg / totalArea : 0,
      areaTotal: totalArea,
      emPressao: Array.from(ocupacoes.values()).filter(o => o.status === 'pressao').length,
    };
  }, [geometrias, ocupacoes, pastos]);

  const selectedPasto = selected?.geo.pasto_id ? pastos.find(p => p.id === selected.geo.pasto_id) : null;
  const selectedOc = selected?.geo.pasto_id ? ocupacoes.get(selected.geo.pasto_id) : null;

  /* ── Draw geometries ── */
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    const map = mapInstanceRef.current;
    const featureLayer = featureLayerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!map || !featureLayer || !labelLayer) return;

    const timer = window.setTimeout(() => {
      featureLayer.clearLayers();
      labelLayer.clearLayers();

      if (geometrias.length === 0) {
        reportRenderedGeometries(0);
        onRenderedChange?.(0);
        return;
      }

      const allBounds = L.latLngBounds([]);
      let rendered = 0;

      geometrias.forEach(geo => {
        try {
          const oc = geo.pasto_id ? ocupacoes.get(geo.pasto_id) : undefined;
          const status = oc?.status || 'sem_ocupacao';
          const isSelected = selected?.geo.id === geo.id;
          const style = polyStyle(status, isSelected);

          const layer = L.geoJSON(geo.geojson as GeoJSON.GeoJsonObject, { style });
          const bounds = layer.getBounds();
          if (bounds.isValid()) { allBounds.extend(bounds); rendered++; }

          layer.on('click', () => setSelected({ geo }));
          layer.addTo(featureLayer);

          // Label — only added to labelLayer (auto-hidden below zoom threshold)
          if (bounds.isValid()) {
            const pasto = geo.pasto_id ? pastos.find(p => p.id === geo.pasto_id) : null;
            const name = pasto?.nome || geo.nome_original || '';
            if (name) {
              L.marker(bounds.getCenter(), {
                icon: L.divIcon({
                  className: 'pasto-label-small',
                  html: `<span>${name}</span>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                }),
                interactive: false,
              }).addTo(labelLayer);
            }
          }
        } catch {
          // skip invalid geometry
        }
      });

      reportRenderedGeometries(rendered);
      onRenderedChange?.(rendered);

      // fitBounds only on first load or geometry set change
      const fitKey = geometrias.map(g => g.id).join(',');
      if (allBounds.isValid() && fitKey !== lastFitKeyRef.current) {
        lastFitKeyRef.current = fitKey;
        try { map.fitBounds(allBounds, { padding: [20, 20], animate: false, maxZoom: 16 }); } catch { /* */ }
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [mapStatus, geometrias, ocupacoes, pastos, selected, mapInstanceRef, featureLayerRef, labelLayerRef, reportRenderedGeometries, onRenderedChange]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-1">
      {/* KPI strip */}
      <div className="flex-shrink-0 flex items-center gap-1 overflow-x-auto px-0.5 pb-0.5">
        <KpiChip label="Cabeças" value={String(kpis.totalCabecas)} sub={kpis.pesoMedio > 0 ? `${formatNum(kpis.pesoMedio, 0)} kg méd` : undefined} />
        <KpiChip label="Lotação" value={kpis.lotacaoKgHa > 0 ? `${formatNum(kpis.lotacaoKgHa, 0)} kg/ha` : '—'} accent={kpis.emPressao > 0} sub={kpis.emPressao > 0 ? `${kpis.emPressao} em pressão` : undefined} />
        <KpiChip label="Área" value={kpis.areaTotal > 0 ? `${formatNum(kpis.areaTotal, 0)} ha` : '—'} />
        {selected && selectedPasto && (
          <KpiChip label={selectedPasto.nome} value={selectedOc?.kg_ha != null ? `${formatNum(selectedOc.kg_ha, 0)} kg/ha` : '—'} active />
        )}
      </div>

      {/* Map + side panel */}
      <div className="flex-1 min-h-0 flex gap-1.5">
        <Card className="flex-1 relative overflow-hidden border-border/60">
          <div className="absolute inset-0">
            <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 0 }} />
          </div>

          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {hasGeo && !geoLoading && mapStatus !== 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <p className="text-[10px] font-medium text-muted-foreground">
                {mapStatus === 'error' ? 'Falha ao inicializar' : 'Preparando…'}
              </p>
            </div>
          )}

          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card z-10">
              <MapPin className="h-8 w-8 text-muted-foreground/15" />
              <p className="text-[10px] text-muted-foreground">Nenhum mapa importado</p>
              <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={onUpload}>
                <Upload className="h-3 w-3 mr-1" /> Importar KML
              </Button>
            </div>
          )}

          {/* Legend */}
          {hasGeo && (
            <div className="absolute bottom-1.5 left-1.5 bg-card/85 backdrop-blur-sm rounded border border-border/50 px-1.5 py-1 z-10">
              <div className="flex flex-col gap-px">
                {(['adequado', 'atencao', 'pressao', 'sem_ocupacao'] as const).map(key => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-[2px]" style={{ backgroundColor: STATUS_STYLES[key].fill, border: `1px solid ${STATUS_STYLES[key].stroke}` }} />
                    <span className="text-[6px] text-muted-foreground leading-none">{STATUS_STYLES[key].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Detail panel */}
        {selected && (
          <Card className="hidden sm:flex flex-col w-52 flex-shrink-0 overflow-hidden border-border/60">
            <div className="p-2 overflow-y-auto flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <h3 className="text-[10px] font-semibold text-foreground leading-tight truncate">
                    {selectedPasto?.nome || selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <Badge variant={selected.geo.pasto_id ? 'secondary' : 'outline'} className="text-[6px] h-3 mt-0.5 px-1">
                    {selectedOc ? STATUS_STYLES[selectedOc.status]?.label || 'Vinculado' : selected.geo.pasto_id ? 'Sem dados' : 'Sem vínculo'}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setSelected(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Separator />
              {selectedPasto ? (
                <div className="space-y-0.5">
                  {selectedPasto.area_produtiva_ha != null && <InfoRow label="Área" value={`${formatNum(selectedPasto.area_produtiva_ha, 1)} ha`} />}
                  <InfoRow label="Cabeças" value={String(selectedOc?.cabecas || 0)} />
                  <InfoRow label="Peso Total" value={selectedOc?.peso_total_kg ? `${formatNum(selectedOc.peso_total_kg, 0)} kg` : '—'} />
                  <InfoRow label="kg/ha" value={selectedOc?.kg_ha != null ? formatNum(selectedOc.kg_ha, 0) : '—'} highlight />
                  <InfoRow label="Uso" value={selectedPasto.tipo_uso || '—'} />
                  {selectedPasto.observacoes && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[8px] text-muted-foreground leading-relaxed">{selectedPasto.observacoes}</p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[8px] text-muted-foreground">Sem vínculo com pasto cadastrado.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */
function KpiChip({ label, value, sub, accent, active }: { label: string; value: string; sub?: string; accent?: boolean; active?: boolean }) {
  return (
    <div className={`flex-shrink-0 rounded-md border px-1.5 py-0.5 min-w-0 ${active ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card'}`}>
      <p className="text-[7px] text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
      <p className={`text-[10px] font-bold leading-tight truncate max-w-[100px] ${accent ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[7px] text-muted-foreground leading-none truncate max-w-[100px]">{sub}</p>}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded px-1.5 py-0.5 ${highlight ? 'bg-primary/8' : 'bg-muted/30'}`}>
      <p className="text-[7px] text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
      <p className={`text-[9px] font-semibold leading-tight ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
