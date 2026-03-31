import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import L from 'leaflet';
import '@/hooks/useStableLeafletMap';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Upload, X, MapPin, Link2, Unlink } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import type { PastoOcupacao } from '@/hooks/usePastoOcupacao';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import { supabase } from '@/integrations/supabase/client';

/* ── Status visual system (kg/ha based) ── */
const STATUS_STYLES: Record<string, { fill: string; stroke: string; label: string; labelShort: string; textClass: string; bgClass: string }> = {
  adequado:    { fill: 'hsl(145, 38%, 62%)', stroke: 'hsl(145, 30%, 42%)', label: 'Ideal', labelShort: 'Ideal', textClass: 'text-green-800', bgClass: 'bg-green-50 border-green-200 text-green-800' },
  atencao:     { fill: 'hsl(42, 55%, 65%)',  stroke: 'hsl(42, 40%, 42%)',  label: 'Sublotado', labelShort: 'Sub', textClass: 'text-yellow-800', bgClass: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  pressao:     { fill: 'hsl(0, 45%, 62%)',   stroke: 'hsl(0, 35%, 42%)',   label: 'Carga Alta', labelShort: 'Alto', textClass: 'text-red-800', bgClass: 'bg-red-50 border-red-200 text-red-800' },
  sem_ocupacao:{ fill: 'hsl(220, 10%, 78%)', stroke: 'hsl(220, 8%, 56%)', label: 'Vazio', labelShort: 'Vazio', textClass: 'text-muted-foreground', bgClass: 'bg-muted/40 border-border text-muted-foreground' },
};

function polyStyle(status: string, isSelected: boolean) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.sem_ocupacao;
  if (isSelected) {
    return { color: 'hsl(213, 60%, 35%)', weight: 2.5, fillColor: 'hsl(213, 55%, 50%)', fillOpacity: 0.30 };
  }
  return { color: s.stroke, weight: 0.8, fillColor: s.fill, fillOpacity: 0.22 };
}

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  ocupacoes: Map<string, PastoOcupacao>;
  geoLoading: boolean;
  onUpload: () => void;
  onRenderedChange?: (count: number) => void;
  onLink?: (geoId: string, pastoId: string) => Promise<boolean>;
  rebanhoOficial?: number;
}

interface SelectedGeo { geo: PastoGeometria }

export function MapaGestorView({ geometrias, pastos, ocupacoes, geoLoading, onUpload, onRenderedChange, onLink, rebanhoOficial }: Props) {
  const [selected, setSelected] = useState<SelectedGeo | null>(null);
  const [linkPastoId, setLinkPastoId] = useState('');
  const [linking, setLinking] = useState(false);
  const lastFitKeyRef = useRef('');

  const {
    mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef,
    status: mapStatus, reportRenderedGeometries,
  } = useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 14 });

  const hasGeo = geometrias.length > 0;

  /* ── Farm-level KPIs ── */
  const farmKpis = useMemo(() => {
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

    const statusCounts = { adequado: 0, atencao: 0, pressao: 0, sem_ocupacao: 0 };
    ocupacoes.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });

    return {
      totalCabecas: totalCab,
      pesoMedio: weightedCab > 0 ? weightedKg / weightedCab : 0,
      lotacaoKgHa: totalArea > 0 ? totalKg / totalArea : 0,
      areaTotal: totalArea,
      statusCounts,
    };
  }, [geometrias, ocupacoes, pastos]);

  const selectedPasto = selected?.geo.pasto_id ? pastos.find(p => p.id === selected.geo.pasto_id) : null;
  const selectedOc = selected?.geo.pasto_id ? ocupacoes.get(selected.geo.pasto_id) : null;
  const selectedStatus = selectedOc?.status || 'sem_ocupacao';

  /* ── Available pastos for linking (not already bound to a geometry) ── */
  const availablePastos = useMemo(() => {
    const boundIds = new Set(geometrias.filter(g => g.pasto_id && g.id !== selected?.geo.id).map(g => g.pasto_id!));
    return pastos
      .filter(p => p.ativo && !boundIds.has(p.id))
      .map(p => ({ value: p.id, label: p.nome }));
  }, [pastos, geometrias, selected?.geo.id]);

  /* ── Categories for selected pasto ── */
  const [selectedCategories, setSelectedCategories] = useState<{ nome: string; quantidade: number; peso_medio_kg: number | null }[]>([]);
  
  useEffect(() => {
    if (!selected?.geo.pasto_id) { setSelectedCategories([]); return; }
    const pastoId = selected.geo.pasto_id;
    
    (async () => {
      const { data: fechamentos } = await supabase
        .from('fechamento_pastos')
        .select('id')
        .eq('pasto_id', pastoId)
        .order('ano_mes', { ascending: false })
        .limit(1);
      
      if (!fechamentos?.length) { setSelectedCategories([]); return; }
      
      const { data: itens } = await supabase
        .from('fechamento_pasto_itens')
        .select('quantidade, peso_medio_kg, categoria_id')
        .eq('fechamento_id', fechamentos[0].id);
      
      if (!itens?.length) { setSelectedCategories([]); return; }
      
      // Get category names
      const catIds = itens.map(i => i.categoria_id);
      const { data: cats } = await supabase
        .from('categorias_rebanho')
        .select('id, nome')
        .in('id', catIds);
      
      const catMap = new Map((cats || []).map(c => [c.id, c.nome]));
      
      setSelectedCategories(itens.map(i => ({
        nome: catMap.get(i.categoria_id) || 'Sem nome',
        quantidade: i.quantidade,
        peso_medio_kg: i.peso_medio_kg,
      })).sort((a, b) => b.quantidade - a.quantidade));
    })();
  }, [selected?.geo.pasto_id]);

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

          // Label
          if (bounds.isValid()) {
            const pasto = geo.pasto_id ? pastos.find(p => p.id === geo.pasto_id) : null;
            const name = pasto?.nome || geo.nome_original || '';
            if (name) {
              const kgLabel = oc?.kg_ha != null ? `<br/><span class="kg-value">${formatNum(oc.kg_ha, 0)}</span>` : '';
              L.marker(bounds.getCenter(), {
                icon: L.divIcon({
                  className: isSelected ? 'pasto-label-selected' : 'pasto-label-small',
                  html: `<span>${name}${kgLabel}</span>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                }),
                interactive: false,
              }).addTo(isSelected ? featureLayer : labelLayer);
            }
          }
        } catch {
          // skip invalid geometry
        }
      });

      reportRenderedGeometries(rendered);
      onRenderedChange?.(rendered);

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
      {/* ── Farm + Pasto KPI Header ── */}
      <div className="flex-shrink-0 overflow-x-auto px-0.5 pb-0.5">
        <div className="flex items-stretch gap-1">
          {/* Farm summary group */}
          <div className="flex items-center gap-1 border-r border-border/50 pr-1.5">
            <span className="text-[6px] font-semibold text-muted-foreground uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 self-center">Fazenda</span>
            <KpiChip label="Alocadas" value={String(farmKpis.totalCabecas)} />
            {rebanhoOficial != null && rebanhoOficial > 0 && (
              <KpiChip label="Oficial" value={String(rebanhoOficial)} />
            )}
            <KpiChip label="Peso Méd." value={farmKpis.pesoMedio > 0 ? `${formatNum(farmKpis.pesoMedio, 0)} kg` : '—'} />
            <KpiChip label="Lotação" value={farmKpis.lotacaoKgHa > 0 ? `${formatNum(farmKpis.lotacaoKgHa, 0)} kg/ha` : '—'} />
            <KpiChip label="Área" value={farmKpis.areaTotal > 0 ? `${formatNum(farmKpis.areaTotal, 0)} ha` : '—'} />
          </div>

          {/* Selected pasto group */}
          {selected && selectedPasto && (
            <div className="flex items-center gap-1">
              <span className="text-[6px] font-semibold text-muted-foreground uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 self-center">Pasto</span>
              <div className={`flex-shrink-0 rounded-md border px-1.5 py-0.5 ${STATUS_STYLES[selectedStatus].bgClass}`}>
                <p className="text-[7px] text-muted-foreground uppercase tracking-wider leading-none">Selecionado</p>
                <p className="text-[11px] font-bold leading-tight text-foreground truncate max-w-[80px]">{selectedPasto.nome}</p>
              </div>
              <KpiChip label="Cabeças" value={String(selectedOc?.cabecas || 0)} active />
              <KpiChip label="Peso Méd." value={selectedOc?.peso_medio_kg ? `${formatNum(selectedOc.peso_medio_kg, 0)} kg` : '—'} active />
              <KpiChip label="Área" value={selectedPasto.area_produtiva_ha ? `${formatNum(selectedPasto.area_produtiva_ha, 1)} ha` : '—'} active />
              <div className={`flex-shrink-0 rounded-md border px-1.5 py-0.5 ${STATUS_STYLES[selectedStatus].bgClass}`}>
                <p className="text-[7px] text-muted-foreground uppercase tracking-wider leading-none">kg/ha</p>
                <p className={`text-[11px] font-bold leading-tight ${STATUS_STYLES[selectedStatus].textClass}`}>
                  {selectedOc?.kg_ha != null ? formatNum(selectedOc.kg_ha, 0) : '—'}
                </p>
                <p className={`text-[6px] font-medium leading-none ${STATUS_STYLES[selectedStatus].textClass}`}>
                  {STATUS_STYLES[selectedStatus].label}
                </p>
              </div>
              {selectedPasto.tipo_uso && (
                <KpiChip label="Atividade" value={selectedPasto.tipo_uso} active />
              )}
              {selectedPasto.lote_padrao && (
                <KpiChip label="Lote" value={selectedPasto.lote_padrao} active />
              )}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground ml-0.5" onClick={() => setSelected(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Map + Side Panel ── */}
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
            <div className="absolute bottom-1.5 left-1.5 bg-card/90 backdrop-blur-sm rounded border border-border/50 px-1.5 py-1 z-10">
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

        {/* ── Detail Panel (Desktop) ── */}
        {selected && (
          <Card className="hidden sm:flex flex-col w-60 flex-shrink-0 overflow-hidden border-border/60">
            <div className="p-2 overflow-y-auto flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <h3 className="text-[11px] font-bold text-foreground leading-tight truncate">
                    {selectedPasto?.nome || selected.geo.nome_original || 'Sem nome'}
                  </h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge
                      variant={selected.geo.pasto_id ? 'secondary' : 'outline'}
                      className={`text-[6px] h-3 px-1 ${selected.geo.pasto_id ? 'bg-green-50 text-green-800 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}
                    >
                      {selected.geo.pasto_id ? '● Vinculado' : '○ Sem vínculo'}
                    </Badge>
                    {selectedPasto?.tipo_uso && (
                      <span className="text-[7px] text-muted-foreground capitalize">{selectedPasto.tipo_uso}</span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setSelected(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* ── Linked pasto: show metrics + change/remove binding ── */}
              {selectedPasto && (
                <>
                  <div className="grid grid-cols-2 gap-1">
                    {selectedPasto.area_produtiva_ha != null && <InfoRow label="Área" value={`${formatNum(selectedPasto.area_produtiva_ha, 1)} ha`} />}
                    <InfoRow label="Cabeças" value={String(selectedOc?.cabecas || 0)} />
                    <InfoRow label="Peso Méd." value={selectedOc?.peso_medio_kg ? `${formatNum(selectedOc.peso_medio_kg, 0)} kg` : '—'} />
                    <InfoRow label="kg/ha" value={selectedOc?.kg_ha != null ? formatNum(selectedOc.kg_ha, 0) : '—'} status={selectedStatus} />
                  </div>

                  {selectedPasto.lote_padrao && (
                    <InfoRow label="Lote" value={selectedPasto.lote_padrao} />
                  )}

                  {/* Categories breakdown */}
                  {selectedCategories.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <div>
                        <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Categorias</p>
                        <div className="space-y-0.5">
                          {selectedCategories.map((cat, i) => (
                            <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-1.5 py-0.5">
                              <span className="text-[8px] text-foreground font-medium truncate max-w-[70px]">{cat.nome}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-semibold text-foreground">{cat.quantidade}</span>
                                {cat.peso_medio_kg && (
                                  <span className="text-[7px] text-muted-foreground">{formatNum(cat.peso_medio_kg, 0)} kg</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedPasto.observacoes && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-[8px] text-muted-foreground leading-relaxed">{selectedPasto.observacoes}</p>
                    </>
                  )}

                  {/* ── Conciliação Rebanho ── */}
                  {rebanhoOficial != null && rebanhoOficial > 0 && (() => {
                    const diff = rebanhoOficial - farmKpis.totalCabecas;
                    const isDivergente = diff !== 0;
                    return (
                      <>
                        <Separator className="my-1" />
                        <div>
                          <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Conciliação Rebanho</p>
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between bg-muted/30 rounded px-1.5 py-0.5">
                              <span className="text-[8px] text-foreground font-medium">Rebanho oficial</span>
                              <span className="text-[8px] font-semibold text-foreground">{rebanhoOficial}</span>
                            </div>
                            <div className="flex items-center justify-between bg-muted/30 rounded px-1.5 py-0.5">
                              <span className="text-[8px] text-foreground font-medium">Alocado em pastos</span>
                              <span className="text-[8px] font-semibold text-foreground">{farmKpis.totalCabecas}</span>
                            </div>
                            <div className={`flex items-center justify-between rounded px-1.5 py-0.5 border ${isDivergente ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                              <span className={`text-[8px] font-medium ${isDivergente ? 'text-amber-800' : 'text-green-800'}`}>Diferença</span>
                              <span className={`text-[8px] font-bold ${isDivergente ? 'text-amber-800' : 'text-green-800'}`}>{diff > 0 ? `+${diff}` : diff}</span>
                            </div>
                            <div className={`flex items-center justify-center rounded px-1.5 py-0.5 ${isDivergente ? 'bg-amber-100 border border-amber-300' : 'bg-green-100 border border-green-300'}`}>
                              <span className={`text-[7px] font-bold uppercase tracking-wider ${isDivergente ? 'text-amber-800' : 'text-green-800'}`}>
                                {isDivergente ? '⚠ Divergente' : '✓ Conciliado'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <Separator className="my-1" />
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Lotação</p>
                      <span className="text-[6px] font-medium text-muted-foreground">kg/ha</span>
                    </div>
                    <HistoricoLotacao pastoId={selected.geo.pasto_id!} areaHa={selectedPasto.area_produtiva_ha || 0} />
                  </div>

                  {/* Change / Remove binding */}
                  {onLink && (
                    <>
                      <Separator className="my-1" />
                      <div className="space-y-1">
                        <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider">Alterar vínculo</p>
                        <SearchableSelect
                          value={linkPastoId}
                          onValueChange={setLinkPastoId}
                          options={availablePastos}
                          placeholder="Buscar pasto..."
                          allLabel="" allValue=""
                          className="h-7 text-[9px]"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="flex-1 h-6 text-[9px]"
                            disabled={!linkPastoId || linking}
                            onClick={async () => {
                              setLinking(true);
                              const ok = await onLink(selected.geo.id, linkPastoId);
                              setLinking(false);
                              if (ok) { setLinkPastoId(''); }
                            }}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            {linking ? '...' : 'Alterar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[9px] text-destructive hover:text-destructive"
                            disabled={linking}
                            onClick={async () => {
                              setLinking(true);
                              const ok = await onLink(selected.geo.id, '');
                              setLinking(false);
                              if (ok) { setLinkPastoId(''); }
                            }}
                          >
                            <Unlink className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Unlinked polygon: link action ── */}
              {!selectedPasto && selected && (
                <div className="space-y-1.5">
                  <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5">
                    <p className="text-[8px] text-orange-800 font-medium">Este polígono não está vinculado a nenhum pasto cadastrado.</p>
                  </div>
                  {onLink && (
                    <>
                      <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider">Vincular a um pasto</p>
                      <SearchableSelect
                        value={linkPastoId}
                        onValueChange={setLinkPastoId}
                        options={availablePastos}
                        placeholder="Buscar pasto..."
                        allLabel="" allValue=""
                        className="h-7 text-[9px]"
                      />
                      <Button
                        size="sm"
                        className="w-full h-7 text-[9px]"
                        disabled={!linkPastoId || linking}
                        onClick={async () => {
                          setLinking(true);
                          const ok = await onLink(selected.geo.id, linkPastoId);
                          setLinking(false);
                          if (ok) { setLinkPastoId(''); }
                        }}
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        {linking ? 'Vinculando...' : 'Vincular pasto'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */
function KpiChip({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`flex-shrink-0 rounded-md border px-1.5 py-0.5 min-w-0 ${active ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-card'}`}>
      <p className="text-[7px] text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
      <p className="text-[10px] font-bold leading-tight truncate max-w-[80px] text-foreground">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, status }: { label: string; value: string; status?: string }) {
  const bg = status ? STATUS_STYLES[status]?.bgClass || 'bg-muted/30' : 'bg-muted/30';
  const textClass = status ? STATUS_STYLES[status]?.textClass || 'text-foreground' : 'text-foreground';
  return (
    <div className={`rounded px-1.5 py-0.5 border ${bg}`}>
      <p className="text-[7px] text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
      <p className={`text-[9px] font-semibold leading-tight ${status ? textClass : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

/* ── Histórico de Lotação – bar chart with status + quality ── */
interface HistData { mes: string; mesLabel: string; kgHa: number; cabecas: number; pesoMedio: number; status: string; qualidade: number | null }

function HistoricoLotacao({ pastoId, areaHa }: { pastoId: string; areaHa: number }) {
  const [data, setData] = useState<HistData[]>([]);

  useEffect(() => {
    if (!pastoId || !areaHa) return;

    (async () => {
      const { data: fechamentos } = await supabase
        .from('fechamento_pastos')
        .select('id, ano_mes, qualidade_mes')
        .eq('pasto_id', pastoId)
        .order('ano_mes', { ascending: false })
        .limit(12);

      if (!fechamentos?.length) { setData([]); return; }

      const fIds = fechamentos.map(f => f.id);
      const { data: itens } = await supabase
        .from('fechamento_pasto_itens')
        .select('fechamento_id, quantidade, peso_medio_kg')
        .in('fechamento_id', fIds);

      if (!itens?.length) { setData([]); return; }

      const agg = new Map<string, { totalKg: number; totalCab: number; weightedKg: number; weightedCab: number }>();
      itens.forEach(item => {
        const cur = agg.get(item.fechamento_id) || { totalKg: 0, totalCab: 0, weightedKg: 0, weightedCab: 0 };
        cur.totalCab += item.quantidade;
        cur.totalKg += item.quantidade * (item.peso_medio_kg || 0);
        if (item.peso_medio_kg) { cur.weightedKg += item.quantidade * item.peso_medio_kg; cur.weightedCab += item.quantidade; }
        agg.set(item.fechamento_id, cur);
      });

      const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      const result = fechamentos.map(f => {
        const a = agg.get(f.id) || { totalKg: 0, totalCab: 0, weightedKg: 0, weightedCab: 0 };
        const kgHa = areaHa > 0 ? a.totalKg / areaHa : 0;
        const monthNum = parseInt(f.ano_mes.slice(5), 10);
        return {
          mes: f.ano_mes.slice(5),
          mesLabel: MONTH_NAMES[monthNum] || f.ano_mes.slice(5),
          kgHa,
          cabecas: a.totalCab,
          pesoMedio: a.weightedCab > 0 ? a.weightedKg / a.weightedCab : 0,
          status: kgHa === 0 ? 'sem_ocupacao' : kgHa < 280 ? 'atencao' : kgHa <= 600 ? 'adequado' : 'pressao',
          qualidade: f.qualidade_mes ?? null,
        };
      }).reverse();

      setData(result);
    })();
  }, [pastoId, areaHa]);

  if (data.length === 0) {
    return <p className="text-[7px] text-muted-foreground italic">Sem dados históricos</p>;
  }

  const maxKg = Math.max(...data.map(d => d.kgHa), 1);
  const withValues = data.filter(d => d.kgHa > 0);
  const avgKg = withValues.length ? withValues.reduce((s, d) => s + d.kgHa, 0) / withValues.length : 0;
  const peakKg = Math.max(...data.map(d => d.kgHa));
  const mesesAlto = data.filter(d => d.status === 'pressao').length;
  const idealRange = 440;
  const desvio = avgKg > 0 ? ((avgKg - idealRange) / idealRange) * 100 : 0;

  const recent = data.slice(-3).filter(d => d.kgHa > 0);
  const older = data.slice(0, 3).filter(d => d.kgHa > 0);
  const recentAvg = recent.length ? recent.reduce((s, d) => s + d.kgHa, 0) / recent.length : 0;
  const olderAvg = older.length ? older.reduce((s, d) => s + d.kgHa, 0) / older.length : 0;
  const trend = recentAvg > olderAvg * 1.05 ? 'subindo' : recentAvg < olderAvg * 0.95 ? 'caindo' : 'estável';

  const STATUS_DOT: Record<string, string> = {
    adequado: 'bg-green-500',
    atencao: 'bg-yellow-400',
    pressao: 'bg-red-500',
    sem_ocupacao: 'bg-muted',
  };

  return (
    <div className="space-y-1.5">
      {/* ── Column chart with kg/ha + status dot + quality ── */}
      <div className="flex items-end gap-[3px]" style={{ height: 72 }}>
        {data.map((d, i) => {
          const barH = Math.max((d.kgHa / maxKg) * 100, 6);
          const s = STATUS_STYLES[d.status] || STATUS_STYLES.sem_ocupacao;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end min-w-0"
              title={`${d.mesLabel}: ${formatNum(d.kgHa, 0)} kg/ha · ${d.cabecas} cab · ${formatNum(d.pesoMedio, 0)} kg`}
              style={{ height: '100%' }}
            >
              {/* kg/ha value on top */}
              <span className="text-[5.5px] font-semibold text-foreground leading-none mb-px truncate w-full text-center">
                {d.kgHa > 0 ? formatNum(d.kgHa, 0) : ''}
              </span>

              {/* Bar */}
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${barH}%`,
                  backgroundColor: s.fill,
                  borderLeft: `0.5px solid ${s.stroke}`,
                  borderRight: `0.5px solid ${s.stroke}`,
                  borderTop: `0.5px solid ${s.stroke}`,
                  minHeight: 3,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Status dots row ── */}
      <div className="flex gap-[3px]">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex justify-center">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[d.status] || 'bg-muted'}`} title={STATUS_STYLES[d.status]?.label || 'Vazio'} />
          </div>
        ))}
      </div>

      {/* ── Quality row ── */}
      <div className="flex gap-[3px]">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className={`text-[5.5px] leading-none ${d.qualidade != null ? 'font-semibold text-foreground' : 'text-muted-foreground/50'}`}>
              {d.qualidade != null ? d.qualidade : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* ── Month labels ── */}
      <div className="flex gap-[3px]">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[5px] text-muted-foreground leading-none">{d.mesLabel}</span>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-2 pt-0.5">
        <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-yellow-400" /><span className="text-[5.5px] text-muted-foreground">Sub</span></div>
        <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[5.5px] text-muted-foreground">Ideal</span></div>
        <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[5.5px] text-muted-foreground">Alto</span></div>
        <span className="text-[5px] text-muted-foreground ml-auto">Nota ↑</span>
      </div>

      {/* ── Summary metrics ── */}
      <div className="grid grid-cols-3 gap-1">
        <div className="bg-muted/30 rounded px-1 py-0.5">
          <p className="text-[6px] text-muted-foreground uppercase">Média</p>
          <p className="text-[8px] font-semibold text-foreground">{formatNum(avgKg, 0)} kg/ha</p>
        </div>
        <div className="bg-muted/30 rounded px-1 py-0.5">
          <p className="text-[6px] text-muted-foreground uppercase">Pico</p>
          <p className="text-[8px] font-semibold text-foreground">{formatNum(peakKg, 0)} kg/ha</p>
        </div>
        <div className="bg-muted/30 rounded px-1 py-0.5">
          <p className="text-[6px] text-muted-foreground uppercase">Tendência</p>
          <p className={`text-[8px] font-semibold ${trend === 'subindo' ? 'text-red-700' : trend === 'caindo' ? 'text-green-700' : 'text-foreground'}`}>
            {trend === 'subindo' ? '↑ Subindo' : trend === 'caindo' ? '↓ Caindo' : '→ Estável'}
          </p>
        </div>
      </div>

      {/* ── Insights ── */}
      <div className="text-[7px] text-muted-foreground leading-relaxed space-y-0.5">
        {mesesAlto > 0 && (
          <p className="text-red-700">⚠ Operou acima do ideal em {mesesAlto} {mesesAlto === 1 ? 'mês' : 'meses'}</p>
        )}
        {avgKg > 0 && (
          <p>Lotação média {desvio > 0 ? `${formatNum(Math.abs(desvio), 0)}% acima` : `${formatNum(Math.abs(desvio), 0)}% abaixo`} do ideal</p>
        )}
      </div>
    </div>
  );
}
