import { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import '@/hooks/useStableLeafletMap'; // ensures global _leaflet_pos patch is applied
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

const STATUS_STYLES: Record<string, { fillColor: string; color: string; label: string }> = {
  adequado: { fillColor: 'hsl(145, 40%, 68%)', color: 'hsl(145, 35%, 42%)', label: 'Adequado (280–600)' },
  atencao: { fillColor: 'hsl(45, 65%, 70%)', color: 'hsl(45, 50%, 42%)', label: 'Atenção (< 280)' },
  pressao: { fillColor: 'hsl(0, 50%, 68%)', color: 'hsl(0, 40%, 42%)', label: 'Pressão Alta (> 600)' },
  sem_ocupacao: { fillColor: 'hsl(220, 8%, 78%)', color: 'hsl(220, 8%, 55%)', label: 'Sem Ocupação' },
};

function getPolyStyle(status: string, isSelected: boolean) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.sem_ocupacao;
  return {
    color: isSelected ? 'hsl(213, 75%, 35%)' : s.color,
    weight: isSelected ? 2.5 : 0.8,
    fillColor: isSelected ? 'hsl(213, 65%, 50%)' : s.fillColor,
    fillOpacity: isSelected ? 0.45 : 0.22,
  };
}

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  ocupacoes: Map<string, PastoOcupacao>;
  geoLoading: boolean;
  onUpload: () => void;
  onRenderedChange?: (count: number) => void;
}

interface SelectedGeo {
  geo: PastoGeometria;
}

export function MapaGestorView({ geometrias, pastos, ocupacoes, geoLoading, onUpload, onRenderedChange }: Props) {
  const [selected, setSelected] = useState<SelectedGeo | null>(null);
  const viewportLockedRef = useRef(false);

  const {
    mapContainerRef,
    mapInstanceRef,
    featureLayerRef,
    labelLayerRef,
    status: mapStatus,
    debugInfo,
    reportRenderedGeometries,
  } = useStableLeafletMap({ debugName: 'MapaGestor' });

  const hasGeo = geometrias.length > 0;

  const kpis = useMemo(() => {
    const vinculados = geometrias.filter((g) => g.pasto_id);
    const linkedPastoIds = new Set(vinculados.map((g) => g.pasto_id!));
    const linkedPastos = pastos.filter((p) => linkedPastoIds.has(p.id));
    const totalArea = linkedPastos.reduce((sum, pasto) => sum + (pasto.area_produtiva_ha || 0), 0);

    let totalCab = 0;
    let totalKg = 0;
    let totalPesoMedio = 0;
    let countPesoMedio = 0;

    linkedPastoIds.forEach((pid) => {
      const oc = ocupacoes.get(pid);
      if (!oc) return;

      totalCab += oc.cabecas;
      totalKg += oc.peso_total_kg;
      if (oc.cabecas > 0 && oc.peso_total_kg > 0) {
        totalPesoMedio += oc.peso_total_kg;
        countPesoMedio += oc.cabecas;
      }
    });

    const lotKgHa = totalArea > 0 ? totalKg / totalArea : 0;
    const emPressao = Array.from(ocupacoes.values()).filter((o) => o.status === 'pressao').length;
    const pesoMedioGeral = countPesoMedio > 0 ? totalPesoMedio / countPesoMedio : 0;

    return {
      totalCabecas: totalCab,
      pesoMedio: pesoMedioGeral,
      lotacaoKgHa: lotKgHa,
      areaTotal: totalArea,
      emPressao,
    };
  }, [geometrias, ocupacoes, pastos]);

  const selectedPasto = selected?.geo.pasto_id ? pastos.find((p) => p.id === selected.geo.pasto_id) : null;
  const selectedOc = selected?.geo.pasto_id ? ocupacoes.get(selected.geo.pasto_id) : null;

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

      geometrias.forEach((geo) => {
        try {
          const oc = geo.pasto_id ? ocupacoes.get(geo.pasto_id) : undefined;
          const status = oc?.status || 'sem_ocupacao';
          const isSelected = selected?.geo.id === geo.id;
          const style = getPolyStyle(status, isSelected);

          const layer = L.geoJSON(geo.geojson as GeoJSON.GeoJsonObject, { style });
          const bounds = layer.getBounds();

          if (bounds.isValid()) {
            allBounds.extend(bounds);
            rendered++;
          }

          layer.on('click', () => setSelected({ geo }));
          layer.addTo(featureLayer);

          // Label at center
          if (bounds.isValid()) {
            const center = bounds.getCenter();
            const pasto = geo.pasto_id ? pastos.find((p) => p.id === geo.pasto_id) : null;
            const labelText = pasto?.nome || geo.nome_original || '';
            if (labelText) {
              L.marker(center, {
                icon: L.divIcon({
                  className: '',
                  html: `<div style="font-size:9px;font-weight:600;color:#1e293b;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;pointer-events:none">${labelText}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                }),
              }).addTo(labelLayer);
            }
          }
        } catch (e) {
          console.warn('[MAP] erro ao renderizar geometria', geo.id, e);
        }
      });

      reportRenderedGeometries(rendered);
      onRenderedChange?.(rendered);

      if (allBounds.isValid()) {
        try {
          map.fitBounds(allBounds, { padding: [30, 30], animate: false, maxZoom: 16 });
        } catch (e) {
          console.warn('[MAP] fitBounds falhou', e);
        }
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [mapStatus, geometrias, ocupacoes, pastos, selected, mapInstanceRef, featureLayerRef, labelLayerRef, reportRenderedGeometries, onRenderedChange]);

  return (
    <div className="flex flex-col gap-1.5 h-full min-h-0">
      <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto px-0.5">
        <KpiChip
          label={selected && selectedPasto ? selectedPasto.nome : 'Pasto'}
          value={selected && selectedOc ? (selectedOc.kg_ha != null ? `${formatNum(selectedOc.kg_ha, 0)} kg/ha` : '—') : '—'}
          sub={selected && selectedPasto ? (selectedPasto.tipo_uso || '—') : undefined}
          muted={!selected}
        />
        <KpiChip
          label="Cabeças"
          value={String(kpis.totalCabecas)}
          sub={kpis.pesoMedio > 0 ? `${formatNum(kpis.pesoMedio, 0)} kg méd` : undefined}
        />
        <KpiChip
          label="Lotação"
          value={kpis.lotacaoKgHa > 0 ? `${formatNum(kpis.lotacaoKgHa, 0)} kg/ha` : '—'}
          sub={kpis.emPressao > 0 ? `${kpis.emPressao} pressão alta` : undefined}
          accent={kpis.emPressao > 0}
        />
        <KpiChip
          label="Nota"
          value={selected && selectedPasto?.observacoes ? selectedPasto.observacoes.slice(0, 30) : '—'}
          muted={!selected || !selectedPasto?.observacoes}
        />
      </div>

      <div className="flex-1 min-h-0 flex gap-1.5 pb-1">
        <Card className="flex-1 min-h-[320px] sm:min-h-[400px] relative overflow-hidden">
          <div className="absolute inset-0 rounded-lg bg-muted/10">
            <div ref={mapContainerRef} className="h-full w-full rounded-lg" style={{ zIndex: 0 }} />
          </div>
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-lg">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {hasGeo && !geoLoading && mapStatus !== 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/72 z-10 rounded-lg px-4">
              <div className="rounded-md border border-border bg-card/95 px-3 py-2 text-center shadow-sm">
                <p className="text-[11px] font-medium text-foreground">
                  {mapStatus === 'error' ? 'Falha ao inicializar o mapa' : 'Preparando mapa...'}
                </p>
              </div>
            </div>
          )}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 bg-card z-10 rounded-lg">
              <MapPin className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">Esta fazenda ainda não possui mapa importado.</p>
              <Button size="sm" variant="outline" onClick={onUpload}>
                <Upload className="h-3.5 w-3.5 mr-1" />
                Importar
              </Button>
            </div>
          )}
          {hasGeo && (
            <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded border border-border px-1.5 py-1 z-10">
              <div className="flex flex-col gap-0.5">
                {(['adequado', 'atencao', 'pressao', 'sem_ocupacao'] as const).map((key) => (
                  <div key={key} className="flex items-center gap-1">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{
                        backgroundColor: STATUS_STYLES[key].fillColor,
                        border: `1px solid ${STATUS_STYLES[key].color}`,
                      }}
                    />
                    <span className="text-[7px] text-muted-foreground">{STATUS_STYLES[key].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {selected && (
          <Card className="hidden sm:flex flex-col w-56 flex-shrink-0 overflow-hidden">
            <div className="p-2 overflow-y-auto flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold text-foreground leading-tight truncate">
                    {selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <Badge variant={selected.geo.pasto_id ? 'secondary' : 'outline'} className="text-[7px] h-3 mt-0.5 px-1">
                    {selectedOc ? STATUS_STYLES[selectedOc.status]?.label || 'Vinculado' : selected.geo.pasto_id ? 'Sem dados' : 'Sem vínculo'}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setSelected(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Separator />
              {selectedPasto ? (
                <div className="space-y-1">
                  <InfoRow label="Nome" value={selectedPasto.nome} />
                  {selectedPasto.area_produtiva_ha != null && (
                    <InfoRow label="Área (ha)" value={formatNum(selectedPasto.area_produtiva_ha, 1)} />
                  )}
                  <InfoRow label="Cabeças" value={String(selectedOc?.cabecas || 0)} />
                  <InfoRow
                    label="Peso Total"
                    value={selectedOc?.peso_total_kg ? `${formatNum(selectedOc.peso_total_kg, 0)} kg` : '—'}
                  />
                  <InfoRow label="kg/ha" value={selectedOc?.kg_ha != null ? formatNum(selectedOc.kg_ha, 0) : '—'} highlight />
                  <InfoRow label="Tipo de Uso" value={selectedPasto.tipo_uso || '—'} />
                  {selectedPasto.observacoes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[8px] text-muted-foreground uppercase tracking-wide mb-0.5">Observações</p>
                        <p className="text-[9px] text-foreground leading-relaxed">{selectedPasto.observacoes}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[9px] text-muted-foreground">Polígono sem vínculo com pasto cadastrado.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiChip({ label, value, sub, accent, muted }: { label: string; value: string; sub?: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={`flex-shrink-0 rounded-md border border-border bg-card px-2 py-0.5 min-w-0 ${muted ? 'opacity-50' : ''}`}>
      <p className="text-[8px] text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
      <p className={`text-[11px] font-bold leading-tight truncate max-w-[120px] ${accent ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-[8px] text-muted-foreground leading-none truncate max-w-[120px]">{sub}</p>}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded px-1.5 py-0.5 ${highlight ? 'bg-primary/10' : 'bg-muted/40'}`}>
      <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-[9px] font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
