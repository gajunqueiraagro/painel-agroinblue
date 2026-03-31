import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Upload, Layers, X, AlertTriangle, MapPin, Beef, Maximize2, BarChart3 } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';

// Status-based polygon styles
const STATUS_STYLES: Record<string, { fillColor: string; color: string; label: string }> = {
  adequado: { fillColor: 'hsl(145, 45%, 58%)', color: 'hsl(145, 40%, 35%)', label: 'Adequado' },
  atencao:  { fillColor: 'hsl(45, 75%, 62%)',  color: 'hsl(45, 55%, 38%)',  label: 'Atenção' },
  pressao:  { fillColor: 'hsl(0, 55%, 60%)',   color: 'hsl(0, 45%, 38%)',   label: 'Pressão Alta' },
  descanso: { fillColor: 'hsl(210, 50%, 62%)', color: 'hsl(210, 45%, 38%)', label: 'Descanso' },
  vazio:    { fillColor: 'hsl(220, 8%, 72%)',   color: 'hsl(220, 8%, 50%)',  label: 'Sem Ocupação' },
  default:  { fillColor: 'hsl(213, 50%, 58%)', color: 'hsl(213, 48%, 32%)', label: 'Vinculado' },
};

function getPolyStyle(geo: PastoGeometria, isSelected: boolean) {
  const status = geo.pasto_id ? 'default' : 'vazio';
  const s = STATUS_STYLES[status] || STATUS_STYLES.default;
  return {
    color: isSelected ? 'hsl(213, 80%, 40%)' : s.color,
    weight: isSelected ? 3 : 1.2,
    fillColor: isSelected ? 'hsl(213, 70%, 50%)' : s.fillColor,
    fillOpacity: isSelected ? 0.5 : 0.22,
  };
}

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  geoLoading: boolean;
  onUpload: () => void;
}

interface SelectedGeo {
  geo: PastoGeometria;
  bounds: L.LatLngBounds;
}

export function MapaGestorView({ geometrias, pastos, geoLoading, onUpload }: Props) {
  const [selected, setSelected] = useState<SelectedGeo | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const hasGeo = geometrias.length > 0;

  // Compute KPIs
  const kpis = useMemo(() => {
    const vinculados = geometrias.filter(g => g.pasto_id);
    const linkedPastoIds = new Set(vinculados.map(g => g.pasto_id!));
    const linkedPastos = pastos.filter(p => linkedPastoIds.has(p.id));
    const totalArea = linkedPastos.reduce((s, p) => s + (p.area_produtiva_ha || 0), 0);
    return {
      totalPoligonos: geometrias.length,
      vinculados: vinculados.length,
      pastosOcupados: linkedPastos.filter(p => p.ativo).length,
      areaTotal: totalArea,
    };
  }, [geometrias, pastos]);

  // Init map
  useEffect(() => {
    const el = mapRef.current;
    if (!el || mapInstance.current) return;
    const map = L.map(el, { center: [-15.8, -47.9], zoom: 5, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; layerRef.current = null; };
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
          const layer = L.geoJSON(geo.geojson as any, { style: getPolyStyle(geo, isSelected) });
          const b = layer.getBounds();
          if (!b.isValid()) return;
          // Tooltip on hover
          const pasto = geo.pasto_id ? pastos.find(p => p.id === geo.pasto_id) : null;
          const tipContent = pasto
            ? `<strong>${pasto.nome}</strong><br/>Área: ${pasto.area_produtiva_ha ? formatNum(pasto.area_produtiva_ha, 1) + ' ha' : '—'}`
            : `<em>${geo.nome_original || 'Sem nome'}</em><br/><span style="color:#888">Sem vínculo</span>`;
          layer.bindTooltip(tipContent, { sticky: true, className: 'pasto-tooltip', direction: 'top', offset: [0, -8] });
          // Label
          if (geo.nome_original) {
            const center = b.getCenter();
            const label = L.divIcon({
              className: 'pasto-label',
              html: `<span style="font-size:9px;font-weight:600;color:hsl(222,47%,11%);text-shadow:0 0 3px white,0 0 3px white;">${geo.nome_original}</span>`,
            });
            L.marker(center, { icon: label, interactive: false }).addTo(lg);
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
  }, [geometrias, selected, pastos]);

  const selectedPasto = selected?.geo.pasto_id
    ? pastos.find(p => p.id === selected.geo.pasto_id) : null;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* KPI strip */}
      <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiMini icon={<Layers className="h-3.5 w-3.5" />} label="Polígonos" value={String(kpis.totalPoligonos)} sub={`${kpis.vinculados} vinculados`} />
        <KpiMini icon={<MapPin className="h-3.5 w-3.5" />} label="Pastos Ocupados" value={String(kpis.pastosOcupados)} />
        <KpiMini icon={<Maximize2 className="h-3.5 w-3.5" />} label="Área Mapeada" value={kpis.areaTotal > 0 ? `${formatNum(kpis.areaTotal, 0)} ha` : '—'} />
        <KpiMini icon={<BarChart3 className="h-3.5 w-3.5" />} label="Sem Vínculo" value={String(kpis.totalPoligonos - kpis.vinculados)} accent={kpis.totalPoligonos - kpis.vinculados > 0} />
      </div>

      {/* Main area: map + detail */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Map card */}
        <Card className="flex-1 min-h-0 relative overflow-hidden">
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0 }} />
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-lg">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 bg-card z-10 rounded-lg">
              <MapPin className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Nenhum mapa importado</p>
              <Button size="sm" variant="outline" onClick={onUpload}>
                <Upload className="h-3.5 w-3.5 mr-1" />Importar
              </Button>
            </div>
          )}
          {/* Legend */}
          {hasGeo && (
            <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded-md border border-border px-2 py-1.5 z-10">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {['default', 'vazio'].map(k => (
                  <div key={k} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_STYLES[k].fillColor, border: `1px solid ${STATUS_STYLES[k].color}` }} />
                    <span className="text-[9px] text-muted-foreground">{STATUS_STYLES[k].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Detail panel — desktop */}
        {selected && (
          <Card className="hidden sm:flex flex-col w-72 flex-shrink-0 overflow-hidden">
            <div className="p-3 overflow-y-auto flex-1 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground leading-tight">
                    {selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <Badge variant={selected.geo.pasto_id ? 'secondary' : 'outline'} className="text-[9px] h-4 mt-1">
                    {selected.geo.pasto_id ? 'Vinculado' : 'Sem vínculo'}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setSelected(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Separator />
              {selectedPasto ? (
                <div className="space-y-2">
                  <InfoRow label="Nome" value={selectedPasto.nome} />
                  {selectedPasto.area_produtiva_ha != null && (
                    <InfoRow label="Área (ha)" value={formatNum(selectedPasto.area_produtiva_ha, 1)} />
                  )}
                  <InfoRow label="Tipo de Uso" value={selectedPasto.tipo_uso || '—'} />
                  <InfoRow label="Situação" value={selectedPasto.ativo ? 'Ativo' : 'Inativo'} />
                  {selectedPasto.lote_padrao && <InfoRow label="Lote Padrão" value={selectedPasto.lote_padrao} />}
                  {selectedPasto.observacoes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Observações</p>
                        <p className="text-xs text-foreground leading-relaxed">{selectedPasto.observacoes}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Polígono sem vínculo com pasto cadastrado.</p>
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
    <Card className="px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-base font-bold ${accent ? 'text-warning' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
