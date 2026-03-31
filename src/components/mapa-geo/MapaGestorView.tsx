import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Upload, Layers, X, MapPin, Maximize2, BarChart3 } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import type { PastoOcupacao } from '@/hooks/usePastoOcupacao';

const STATUS_STYLES: Record<string, { fillColor: string; color: string; label: string }> = {
  adequado:    { fillColor: 'hsl(145, 40%, 68%)', color: 'hsl(145, 35%, 42%)', label: 'Adequado (280–600)' },
  atencao:     { fillColor: 'hsl(45, 65%, 70%)',  color: 'hsl(45, 50%, 42%)',  label: 'Atenção (< 280)' },
  pressao:     { fillColor: 'hsl(0, 50%, 68%)',   color: 'hsl(0, 40%, 42%)',   label: 'Pressão Alta (> 600)' },
  sem_ocupacao:{ fillColor: 'hsl(220, 8%, 78%)',   color: 'hsl(220, 8%, 55%)',  label: 'Sem Ocupação' },
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
}

interface SelectedGeo {
  geo: PastoGeometria;
  bounds: L.LatLngBounds;
}

export function MapaGestorView({ geometrias, pastos, ocupacoes, geoLoading, onUpload }: Props) {
  const [selected, setSelected] = useState<SelectedGeo | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);

  const hasGeo = geometrias.length > 0;

  const kpis = useMemo(() => {
    const vinculados = geometrias.filter(g => g.pasto_id);
    const linkedPastoIds = new Set(vinculados.map(g => g.pasto_id!));
    const linkedPastos = pastos.filter(p => linkedPastoIds.has(p.id));
    const totalArea = linkedPastos.reduce((s, p) => s + (p.area_produtiva_ha || 0), 0);
    let totalCab = 0;
    let totalKg = 0;
    linkedPastoIds.forEach(pid => {
      const oc = ocupacoes.get(pid);
      if (oc) { totalCab += oc.cabecas; totalKg += oc.peso_total_kg; }
    });
    const lotKgHa = totalArea > 0 ? totalKg / totalArea : 0;
    const emPressao = Array.from(ocupacoes.values()).filter(o => o.status === 'pressao').length;
    return {
      totalPoligonos: geometrias.length,
      vinculados: vinculados.length,
      totalCabecas: totalCab,
      lotacaoKgHa: lotKgHa,
      areaTotal: totalArea,
      emPressao,
    };
  }, [geometrias, pastos, ocupacoes]);

  // Init map
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
      layerRef.current = null;
      labelLayerRef.current = null;
    }
    const map = L.map(el, { center: [-15.8, -47.9], zoom: 5, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    labelLayerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    const updateLabels = () => {
      const zoom = map.getZoom();
      const ll = labelLayerRef.current;
      if (!ll) return;
      if (zoom >= 14) {
        if (!map.hasLayer(ll)) map.addLayer(ll);
      } else {
        if (map.hasLayer(ll)) map.removeLayer(ll);
      }
    };
    map.on('zoomend', updateLabels);

    requestAnimationFrame(() => map.invalidateSize());
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapInstance.current = null;
      layerRef.current = null;
      labelLayerRef.current = null;
    };
  }, []);

  // Draw polygons
  useEffect(() => {
    const map = mapInstance.current;
    const lg = layerRef.current;
    const ll = labelLayerRef.current;
    if (!map || !lg || !ll) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      lg.clearLayers();
      ll.clearLayers();
      if (geometrias.length === 0) return;
      const allBounds: L.LatLngBounds[] = [];
      geometrias.forEach((geo) => {
        try {
          const isSelected = selected?.geo?.id === geo.id;
          const pasto = geo.pasto_id ? pastos.find(p => p.id === geo.pasto_id) : null;
          const oc = geo.pasto_id ? ocupacoes.get(geo.pasto_id) : null;
          const status = oc?.status || (geo.pasto_id ? 'sem_ocupacao' : 'sem_ocupacao');

          const layer = L.geoJSON(geo.geojson as any, { style: getPolyStyle(status, isSelected) });
          const b = layer.getBounds();
          if (!b.isValid()) return;

          // Tooltip with full details
          const kgHaText = oc?.kg_ha != null ? `${formatNum(oc.kg_ha, 0)} kg/ha` : '—';
          const tipContent = pasto
            ? `<strong>${pasto.nome}</strong><br/>
               <span style="color:#666">Área: ${pasto.area_produtiva_ha ? formatNum(pasto.area_produtiva_ha, 1) + ' ha' : '—'}</span><br/>
               <span style="color:#666">Cab: ${oc?.cabecas || 0} · ${kgHaText}</span>`
            : `<em>${geo.nome_original || 'Sem nome'}</em><br/><span style="color:#999">Sem vínculo</span>`;
          layer.bindTooltip(tipContent, { sticky: true, className: 'pasto-tooltip', direction: 'top', offset: [0, -6] });

          // Small label — name + kg/ha at high zoom
          const shortName = geo.nome_original || pasto?.nome || '';
          if (shortName) {
            const kgLabel = oc?.kg_ha != null ? `<br/><span class="kg-value">${formatNum(oc.kg_ha, 0)}</span>` : '';
            const label = L.divIcon({
              className: 'pasto-label-small',
              html: `<span>${shortName}${kgLabel}</span>`,
            });
            L.marker(b.getCenter(), { icon: label, interactive: false }).addTo(ll);
          }

          layer.on('click', () => setSelected({ geo, bounds: b }));
          layer.addTo(lg);
          allBounds.push(b);
        } catch (err) {
          console.error('[MapaGestor] Erro geometria:', err);
        }
      });
      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        map.fitBounds(combined, { padding: [40, 40], maxZoom: 17 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [geometrias, selected, pastos, ocupacoes]);

  const selectedPasto = selected?.geo.pasto_id
    ? pastos.find(p => p.id === selected.geo.pasto_id) : null;
  const selectedOc = selected?.geo.pasto_id
    ? ocupacoes.get(selected.geo.pasto_id) : null;

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* KPI strip */}
      <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <KpiMini icon={<Layers className="h-3 w-3" />} label="Polígonos" value={String(kpis.totalPoligonos)} sub={`${kpis.vinculados} vinculados`} />
        <KpiMini icon={<MapPin className="h-3 w-3" />} label="Cabeças" value={String(kpis.totalCabecas)} />
        <KpiMini icon={<Maximize2 className="h-3 w-3" />} label="Lotação" value={kpis.lotacaoKgHa > 0 ? `${formatNum(kpis.lotacaoKgHa, 0)} kg/ha` : '—'} />
        <KpiMini icon={<BarChart3 className="h-3 w-3" />} label="Pressão Alta" value={String(kpis.emPressao)} accent={kpis.emPressao > 0} />
      </div>

      {/* Map + detail panel */}
      <div className="flex-1 min-h-0 flex gap-2">
        <Card className="flex-1 min-h-0 relative overflow-hidden" style={{ minHeight: '380px' }}>
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0, minHeight: '380px' }} />
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-lg">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 bg-card z-10 rounded-lg">
              <MapPin className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">Nenhum mapa importado</p>
              <Button size="sm" variant="outline" onClick={onUpload}>
                <Upload className="h-3.5 w-3.5 mr-1" />Importar
              </Button>
            </div>
          )}
          {/* Legend */}
          {hasGeo && (
            <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded border border-border px-2 py-1.5 z-10">
              <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">kg/ha</p>
              <div className="flex flex-col gap-0.5">
                {(['adequado', 'atencao', 'pressao', 'sem_ocupacao'] as const).map(k => (
                  <div key={k} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_STYLES[k].fillColor, border: `1px solid ${STATUS_STYLES[k].color}` }} />
                    <span className="text-[8px] text-muted-foreground">{STATUS_STYLES[k].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Detail panel — desktop only */}
        {selected && (
          <Card className="hidden sm:flex flex-col w-64 flex-shrink-0 overflow-hidden">
            <div className="p-2.5 overflow-y-auto flex-1 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-foreground leading-tight">
                    {selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <Badge variant={selected.geo.pasto_id ? 'secondary' : 'outline'} className="text-[8px] h-3.5 mt-0.5 px-1.5">
                    {selectedOc ? STATUS_STYLES[selectedOc.status]?.label || 'Vinculado' : selected.geo.pasto_id ? 'Sem dados' : 'Sem vínculo'}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setSelected(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Separator />
              {selectedPasto ? (
                <div className="space-y-1.5">
                  <InfoRow label="Nome" value={selectedPasto.nome} />
                  {selectedPasto.area_produtiva_ha != null && (
                    <InfoRow label="Área (ha)" value={formatNum(selectedPasto.area_produtiva_ha, 1)} />
                  )}
                  <InfoRow label="Cabeças" value={String(selectedOc?.cabecas || 0)} />
                  <InfoRow label="Peso Total (kg)" value={selectedOc?.peso_total_kg ? formatNum(selectedOc.peso_total_kg, 0) : '—'} />
                  <InfoRow label="kg/ha" value={selectedOc?.kg_ha != null ? formatNum(selectedOc.kg_ha, 0) : '—'} highlight />
                  <InfoRow label="Tipo de Uso" value={selectedPasto.tipo_uso || '—'} />
                  <InfoRow label="Situação" value={selectedPasto.ativo ? 'Ativo' : 'Inativo'} />
                  {selectedPasto.observacoes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Observações</p>
                        <p className="text-[10px] text-foreground leading-relaxed">{selectedPasto.observacoes}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Polígono sem vínculo com pasto cadastrado.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiMini({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className="px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-bold leading-none ${accent ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded px-2 py-1 ${highlight ? 'bg-primary/10' : 'bg-muted/40'}`}>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-[10px] font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
