import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import '@/hooks/useStableLeafletMap';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, MapPin, X, ArrowRightLeft, Check, AlertTriangle, Target, ArrowRight } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import { usePastoMovimentacoes } from '@/hooks/usePastoMovimentacoes';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import type { PastoOcupacao } from '@/hooks/usePastoOcupacao';
import { toast } from 'sonner';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';

const STATUS_STYLES: Record<string, { fillColor: string; color: string; label: string }> = {
  adequado:    { fillColor: 'hsl(145, 38%, 62%)', color: 'hsl(145, 30%, 42%)', label: 'Ideal' },
  atencao:     { fillColor: 'hsl(42, 55%, 65%)',  color: 'hsl(42, 40%, 42%)',  label: 'Sublotado' },
  pressao:     { fillColor: 'hsl(0, 45%, 62%)',   color: 'hsl(0, 35%, 42%)',   label: 'Carga Alta' },
  sem_ocupacao:{ fillColor: 'hsl(220, 10%, 78%)', color: 'hsl(220, 8%, 56%)', label: 'Vazio' },
};

type TransferMode = 'idle' | 'selecting_dest' | 'confirming';

interface TransferState {
  originGeo: PastoGeometria;
  originPasto: Pasto;
  destGeo?: PastoGeometria;
  destPasto?: Pasto;
}

function getOpStyle(status: string, role: 'normal' | 'selected' | 'origin' | 'dest_candidate' | 'dest_selected') {
  const s = STATUS_STYLES[status] || STATUS_STYLES.sem_ocupacao;
  switch (role) {
    case 'selected':
      return { color: 'hsl(213, 60%, 35%)', weight: 2.5, fillColor: 'hsl(213, 55%, 50%)', fillOpacity: 0.30 };
    case 'origin':
      return { color: 'hsl(25, 70%, 45%)', weight: 3, fillColor: 'hsl(25, 60%, 55%)', fillOpacity: 0.35, dashArray: '6 3' };
    case 'dest_candidate':
      return { color: 'hsl(145, 40%, 40%)', weight: 1.5, fillColor: 'hsl(145, 35%, 60%)', fillOpacity: 0.25 };
    case 'dest_selected':
      return { color: 'hsl(145, 50%, 30%)', weight: 3, fillColor: 'hsl(145, 45%, 50%)', fillOpacity: 0.35 };
    default:
      return { color: s.color, weight: 0.8, fillColor: s.fillColor, fillOpacity: 0.22 };
  }
}

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  categorias: CategoriaRebanho[];
  ocupacoes: Map<string, PastoOcupacao>;
  geoLoading: boolean;
  onUpload: () => void;
  onRefresh?: () => void;
  onRenderedChange?: (count: number) => void;
}

export function MapaOperacaoView({ geometrias, pastos, categorias, ocupacoes, geoLoading, onUpload, onRefresh, onRenderedChange }: Props) {
  const { fazendaAtual } = useFazenda();
  const { registrarMovimentacao } = usePastoMovimentacoes();

  const [selectedGeo, setSelectedGeo] = useState<PastoGeometria | null>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>('idle');
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('');
  const [refField, setRefField] = useState('');
  const [saving, setSaving] = useState(false);
  const lastFitKeyRef = useRef('');

  const [selectedCategories, setSelectedCategories] = useState<{ nome: string; quantidade: number; peso_medio_kg: number | null }[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<{ nome_cat: string; quantidade: number; data: string; origem: string }[]>([]);

  const {
    mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef,
    status: mapStatus, reportRenderedGeometries,
  } = useStableLeafletMap({ debugName: 'MapaOperacao' });

  const hasGeo = geometrias.length > 0;
  const selectedPasto = selectedGeo?.pasto_id ? pastos.find((p) => p.id === selectedGeo.pasto_id) : null;
  const selectedOc = selectedGeo?.pasto_id ? ocupacoes.get(selectedGeo.pasto_id) : null;
  const geoIdKey = geometrias.map(g => g.id).join(',');

  // Max qty validation
  const maxQty = useMemo(() => {
    if (!transfer?.originPasto) return 999999;
    const oc = ocupacoes.get(transfer.originPasto.id);
    return oc?.cabecas || 999999;
  }, [transfer?.originPasto, ocupacoes]);

  // Load categories + recent transfers
  useEffect(() => {
    if (!selectedGeo?.pasto_id) { setSelectedCategories([]); setRecentTransfers([]); return; }
    const pastoId = selectedGeo.pasto_id;

    (async () => {
      const { data: fechamentos } = await supabase
        .from('fechamento_pastos')
        .select('id')
        .eq('pasto_id', pastoId)
        .order('ano_mes', { ascending: false })
        .limit(1);

      if (fechamentos?.length) {
        const { data: itens } = await supabase
          .from('fechamento_pasto_itens')
          .select('quantidade, peso_medio_kg, categoria_id')
          .eq('fechamento_id', fechamentos[0].id);

        if (itens?.length) {
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
        } else {
          setSelectedCategories([]);
        }
      } else {
        setSelectedCategories([]);
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: transfers } = await supabase
        .from('pasto_movimentacoes')
        .select('quantidade, categoria, data, pasto_origem_id')
        .eq('pasto_destino_id', pastoId)
        .eq('tipo', 'transferencia')
        .gte('data', sevenDaysAgo.toISOString().slice(0, 10))
        .order('data', { ascending: false })
        .limit(10);

      if (transfers?.length) {
        const origemIds = [...new Set(transfers.filter(t => t.pasto_origem_id).map(t => t.pasto_origem_id!))];
        let origemNames = new Map<string, string>();
        if (origemIds.length) {
          const { data: ps } = await supabase.from('pastos').select('id, nome').in('id', origemIds);
          (ps || []).forEach(p => origemNames.set(p.id, p.nome));
        }
        setRecentTransfers(transfers.map(t => ({
          nome_cat: t.categoria || 'Geral',
          quantidade: t.quantidade,
          data: t.data,
          origem: t.pasto_origem_id ? (origemNames.get(t.pasto_origem_id) || '?') : '?',
        })));
      } else {
        setRecentTransfers([]);
      }
    })();
  }, [selectedGeo?.pasto_id]);

  // Handle map click based on transfer mode
  const handleGeoClick = (geo: PastoGeometria) => {
    if (transferMode === 'selecting_dest' && transfer) {
      // Clicking on a destination
      if (geo.id === transfer.originGeo.id) return; // can't transfer to self
      if (!geo.pasto_id) { toast.error('Pasto sem vínculo'); return; }
      const destPasto = pastos.find(p => p.id === geo.pasto_id);
      if (!destPasto) return;
      setTransfer({ ...transfer, destGeo: geo, destPasto });
      setTransferMode('confirming');
      return;
    }
    // Normal selection
    setSelectedGeo(geo);
    cancelTransfer();
  };

  // Draw geometries
  useEffect(() => {
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

      const allBounds: L.LatLngBounds[] = [];
      let renderedCount = 0;

      geometrias.forEach((geo) => {
        try {
          const oc = geo.pasto_id ? ocupacoes.get(geo.pasto_id) : null;
          const status = oc?.status || 'sem_ocupacao';

          // Determine visual role
          let role: 'normal' | 'selected' | 'origin' | 'dest_candidate' | 'dest_selected' = 'normal';
          if (transferMode === 'selecting_dest' && transfer) {
            if (geo.id === transfer.originGeo.id) role = 'origin';
            else if (geo.pasto_id && geo.pasto_id !== transfer.originPasto.id) role = 'dest_candidate';
          } else if (transferMode === 'confirming' && transfer) {
            if (geo.id === transfer.originGeo.id) role = 'origin';
            else if (geo.id === transfer.destGeo?.id) role = 'dest_selected';
          } else if (selectedGeo?.id === geo.id) {
            role = 'selected';
          }

          const layer = L.geoJSON(geo.geojson as GeoJSON.GeoJsonObject, {
            style: getOpStyle(status, role),
          });
          const bounds = layer.getBounds();
          if (!bounds.isValid()) return;

          const shortName = geo.nome_original || '';
          if (shortName) {
            const kgLabel = oc?.kg_ha != null ? `<br/><span class="kg-value">${formatNum(oc.kg_ha, 0)}</span>` : '';
            const labelClass = role === 'origin' ? 'pasto-label-origin' :
                               role === 'dest_selected' ? 'pasto-label-dest' :
                               role === 'selected' ? 'pasto-label-selected' : 'pasto-label-small';
            const labelIcon = L.divIcon({
              className: labelClass,
              html: `<span>${shortName}${kgLabel}</span>`,
            });
            const targetLayer = ['origin', 'dest_selected', 'selected'].includes(role) ? featureLayer : labelLayer;
            L.marker(bounds.getCenter(), { icon: labelIcon, interactive: false }).addTo(targetLayer);
          }

          layer.on('click', () => handleGeoClick(geo));
          layer.addTo(featureLayer);
          allBounds.push(bounds);
          renderedCount += 1;
        } catch {
          // skip
        }
      });

      reportRenderedGeometries(renderedCount);
      onRenderedChange?.(renderedCount);

      if (allBounds.length > 0 && geoIdKey !== lastFitKeyRef.current) {
        lastFitKeyRef.current = geoIdKey;
        const combinedBounds = allBounds.reduce((acc, b) => acc.extend(b));
        try { map.fitBounds(combinedBounds, { padding: [20, 20], animate: false, maxZoom: 16 }); } catch { /* */ }
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [geometrias, geoIdKey, mapStatus, ocupacoes, reportRenderedGeometries, selectedGeo, transferMode, transfer]);

  const startTransfer = () => {
    if (!selectedGeo || !selectedPasto) return;
    setTransfer({ originGeo: selectedGeo, originPasto: selectedPasto });
    setTransferMode('selecting_dest');
    setQty('');
    setCat('');
    setRefField('');
  };

  const cancelTransfer = () => {
    setTransferMode('idle');
    setTransfer(null);
    setQty('');
    setCat('');
    setRefField('');
  };

  const handleSave = async () => {
    if (!transfer?.originPasto || !transfer?.destPasto) return;
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { toast.error('Preencha a quantidade'); return; }
    if (qtyNum > maxQty) { toast.error(`Máximo disponível: ${maxQty} cabeças`); return; }

    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const success = await registrarMovimentacao({
      fazenda_id: fazendaAtual!.id,
      cliente_id: fazendaAtual!.cliente_id,
      pasto_origem_id: transfer.originPasto.id,
      pasto_destino_id: transfer.destPasto.id,
      data: today,
      tipo: 'transferencia',
      quantidade: qtyNum,
      categoria: cat || null,
      referencia_rebanho: refField || null,
    });
    setSaving(false);

    if (success) {
      toast.success(`${qtyNum} cab transferidos: ${transfer.originPasto.nome} → ${transfer.destPasto.nome}`);
      cancelTransfer();
      setSelectedGeo(null);
      onRefresh?.();
    }
  };

  const closePanel = () => {
    setSelectedGeo(null);
    cancelTransfer();
  };

  // Transfer mode banner for the map
  const transferBanner = transferMode === 'selecting_dest' && transfer ? (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground rounded-full px-4 py-1 shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
      <Target className="h-3.5 w-3.5 animate-pulse" />
      <span className="text-[10px] font-semibold">Clique no pasto de destino</span>
      <span className="text-[9px] opacity-75">Origem: {transfer.originPasto.nome}</span>
      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={cancelTransfer}>
        Cancelar
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5">
      <div className="flex-1 min-h-0 flex gap-1.5">
        {/* Map */}
        <Card className="flex-1 relative overflow-hidden border-border/60">
          <div className="absolute inset-0">
            <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 0 }} />
          </div>
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {hasGeo && !geoLoading && mapStatus !== 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/72 z-10 px-4">
              <div className="rounded-md border border-border bg-card/95 px-3 py-2 text-center shadow-sm">
                <p className="text-[11px] font-medium text-foreground">
                  {mapStatus === 'error' ? 'Falha ao inicializar o mapa' : 'Preparando mapa...'}
                </p>
              </div>
            </div>
          )}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card z-10">
              <MapPin className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">Esta fazenda ainda não possui mapa importado.</p>
              <Button size="sm" onClick={onUpload}><Upload className="h-3.5 w-3.5 mr-1" /> Importar</Button>
            </div>
          )}
          {hasGeo && !selectedGeo && transferMode === 'idle' && !geoLoading && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-0.5 z-10">
              <p className="text-[9px] text-muted-foreground font-medium">Toque em um pasto para operar</p>
            </div>
          )}
          {transferBanner}

          {/* Legend */}
          {hasGeo && (
            <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded border border-border px-1.5 py-1 z-10">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {(['adequado', 'atencao', 'pressao', 'sem_ocupacao'] as const).map((key) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATUS_STYLES[key].fillColor, border: `1px solid ${STATUS_STYLES[key].color}` }} />
                    <span className="text-[7px] text-muted-foreground">{STATUS_STYLES[key].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ── Side Panel ── */}
        {(selectedGeo || transferMode === 'confirming') && (
          <Card className="hidden sm:flex flex-col w-60 flex-shrink-0 overflow-hidden border-border/60">
            <div className="p-2 overflow-y-auto flex-1 space-y-1.5">

              {/* ── IDLE: normal pasto detail ── */}
              {transferMode === 'idle' && selectedGeo && (
                <>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-bold text-foreground truncate">
                        {selectedPasto?.nome || selectedGeo.nome_original || 'Sem nome'}
                      </h3>
                      {selectedPasto && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {selectedPasto.area_produtiva_ha && (
                            <span className="text-[9px] text-muted-foreground">{formatNum(selectedPasto.area_produtiva_ha, 1)} ha</span>
                          )}
                          {selectedOc?.kg_ha != null && (
                            <Badge variant="secondary" className="text-[7px] h-3 px-1">
                              {formatNum(selectedOc.kg_ha, 0)} kg/ha
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closePanel}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {selectedOc && (
                    <div className="rounded bg-muted/40 px-1.5 py-1 grid grid-cols-2 gap-1">
                      <div>
                        <p className="text-[7px] text-muted-foreground uppercase">Cabeças</p>
                        <p className="text-[9px] font-semibold text-foreground">{selectedOc.cabecas}</p>
                      </div>
                      <div>
                        <p className="text-[7px] text-muted-foreground uppercase">Peso Méd.</p>
                        <p className="text-[9px] font-semibold text-foreground">
                          {selectedOc.peso_medio_kg ? `${formatNum(selectedOc.peso_medio_kg, 0)} kg` : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedCategories.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Categorias no pasto</p>
                        <div className="space-y-0.5">
                          {selectedCategories.map((c, i) => (
                            <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-1.5 py-0.5">
                              <span className="text-[8px] text-foreground font-medium truncate max-w-[70px]">{c.nome}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-semibold">{c.quantidade}</span>
                                {c.peso_medio_kg && <span className="text-[7px] text-muted-foreground">{formatNum(c.peso_medio_kg, 0)} kg</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {recentTransfers.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <AlertTriangle className="h-2.5 w-2.5 text-yellow-600" />
                          <p className="text-[7px] font-semibold text-yellow-700 uppercase tracking-wider">Recém-transferidos</p>
                        </div>
                        <div className="space-y-0.5">
                          {recentTransfers.map((t, i) => (
                            <div key={i} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">
                              <div className="min-w-0">
                                <span className="text-[8px] text-yellow-800 font-medium">{t.quantidade} cab</span>
                                <span className="text-[7px] text-yellow-600 ml-1">({t.nome_cat})</span>
                              </div>
                              <span className="text-[6px] text-yellow-600 whitespace-nowrap">de {t.origem} · {t.data.slice(5)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedPasto && (
                    <>
                      <Separator />
                      <button
                        onClick={startTransfer}
                        className="flex items-center gap-1.5 w-full px-2 py-2 rounded-md border text-[10px] font-semibold transition-colors text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Transferir animais
                      </button>
                      <p className="text-[7px] text-muted-foreground text-center">Clique e depois selecione o destino no mapa</p>
                    </>
                  )}

                  {!selectedPasto && (
                    <p className="text-[9px] text-muted-foreground">Pasto sem vínculo — não é possível operar.</p>
                  )}
                </>
              )}

              {/* ── SELECTING_DEST: waiting for destination click ── */}
              {transferMode === 'selecting_dest' && transfer && (
                <>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] h-4">Transferência</Badge>
                    <Button variant="ghost" size="sm" className="h-5 text-[8px] text-muted-foreground" onClick={cancelTransfer}>
                      Cancelar
                    </Button>
                  </div>

                  <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-[9px] font-semibold text-foreground">Origem: {transfer.originPasto.nome}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full border-2 border-green-500 bg-transparent animate-pulse" />
                      <span className="text-[9px] text-muted-foreground">Clique no pasto de destino...</span>
                    </div>
                  </div>

                  {selectedCategories.length > 0 && (
                    <div>
                      <p className="text-[7px] text-muted-foreground uppercase tracking-wider mb-0.5">Disponível para transferir:</p>
                      <div className="space-y-0.5">
                        {selectedCategories.map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-1.5 py-0.5">
                            <span className="text-[8px] text-foreground font-medium">{c.nome}</span>
                            <span className="text-[8px] font-semibold">{c.quantidade} cab</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── CONFIRMING: origin + dest selected, fill qty ── */}
              {transferMode === 'confirming' && transfer?.destPasto && (
                <>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-green-50 text-green-800 border-green-200 text-[8px] h-4">Confirmar Transferência</Badge>
                    <Button variant="ghost" size="sm" className="h-5 text-[8px] text-muted-foreground" onClick={cancelTransfer}>
                      Cancelar
                    </Button>
                  </div>

                  {/* Visual route */}
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="text-center min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-0.5" />
                        <p className="text-[8px] font-bold text-foreground truncate">{transfer.originPasto.nome}</p>
                        <p className="text-[6px] text-muted-foreground">Origem</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="text-center min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-0.5" />
                        <p className="text-[8px] font-bold text-foreground truncate">{transfer.destPasto.nome}</p>
                        <p className="text-[6px] text-muted-foreground">Destino</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div>
                      <Label className="text-[9px]">Quantidade * <span className="text-muted-foreground font-normal">(máx: {maxQty})</span></Label>
                      <Input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={qty}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > maxQty) { setQty(String(maxQty)); } else { setQty(e.target.value); }
                        }}
                        className="h-7 mt-0.5 text-[10px]"
                        placeholder="Ex: 50"
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label className="text-[9px]">Categoria</Label>
                      <Select value={cat} onValueChange={setCat}>
                        <SelectTrigger className="h-7 mt-0.5 text-[10px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {categorias.map((categoria) => (
                            <SelectItem key={categoria.id} value={categoria.codigo}>{categoria.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[9px]">Referência</Label>
                      <Input value={refField} onChange={(e) => setRefField(e.target.value)} className="h-7 mt-0.5 text-[10px]" placeholder="Ex: Lote A" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sticky footer for confirmation */}
            {transferMode === 'confirming' && transfer?.destPasto && (
              <div className="flex-shrink-0 border-t border-border bg-background px-2 py-1.5 flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={cancelTransfer}>
                  Cancelar
                </Button>
                <Button size="sm" className="flex-1 h-7 text-[10px]" onClick={handleSave} disabled={saving || !qty || Number(qty) <= 0}>
                  <Check className="h-3 w-3 mr-1" />{saving ? 'Salvando...' : 'Confirmar'}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Mobile bottom card */}
      {transferMode === 'idle' && selectedGeo && selectedPasto && (
        <Card className="sm:hidden flex-shrink-0 p-2 space-y-1.5 mb-1">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-bold text-foreground">{selectedPasto.nome}</h3>
              {selectedOc?.kg_ha != null && (
                <span className="text-[9px] text-muted-foreground">
                  {formatNum(selectedOc.kg_ha, 0)} kg/ha · {selectedOc?.cabecas || 0} cab
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closePanel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <button
            onClick={startTransfer}
            className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-md border text-[10px] font-medium text-blue-700 bg-blue-50 border-blue-200"
          >
            <ArrowRightLeft className="h-3 w-3" />
            Transferir animais
          </button>
        </Card>
      )}

      {/* Mobile: transfer mode banner */}
      {transferMode === 'selecting_dest' && (
        <Card className="sm:hidden flex-shrink-0 p-2 mb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="text-[10px] font-semibold text-foreground">Toque no destino</span>
            </div>
            <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={cancelTransfer}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* Mobile: confirmation */}
      {transferMode === 'confirming' && transfer?.destPasto && (
        <Card className="sm:hidden flex-shrink-0 p-2 space-y-1.5 mb-1">
          <div className="flex items-center gap-1 text-[9px] font-semibold text-foreground">
            <span>{transfer.originPasto.nome}</span>
            <ArrowRight className="h-3 w-3 text-primary" />
            <span>{transfer.destPasto.nome}</span>
          </div>
          <div className="flex gap-1.5">
            <Input type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(e.target.value)} className="h-7 flex-1 text-[10px]" placeholder="Qtd" />
            <Input value={refField} onChange={(e) => setRefField(e.target.value)} className="h-7 flex-1 text-[10px]" placeholder="Ref." />
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={cancelTransfer}>Cancelar</Button>
            <Button size="sm" className="flex-1 h-7 text-[10px]" onClick={handleSave} disabled={saving || !qty}>
              <Check className="h-3 w-3 mr-1" />{saving ? '...' : 'Confirmar'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
