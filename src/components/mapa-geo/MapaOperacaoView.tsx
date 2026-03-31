import { useState, useEffect, useRef } from 'react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Upload, MapPin, X, ArrowRightLeft, Check, AlertTriangle } from 'lucide-react';
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

function getOpStyle(status: string, isSelected: boolean) {
  if (isSelected) {
    return { color: 'hsl(213, 60%, 35%)', weight: 2.5, fillColor: 'hsl(213, 55%, 50%)', fillOpacity: 0.30 };
  }
  const s = STATUS_STYLES[status] || STATUS_STYLES.sem_ocupacao;
  return { color: s.color, weight: 0.8, fillColor: s.fillColor, fillOpacity: 0.22 };
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
  const [showTransfer, setShowTransfer] = useState(false);
  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('');
  const [ref, setRef] = useState('');
  const [destino, setDestino] = useState('');
  const [saving, setSaving] = useState(false);
  const lastFitKeyRef = useRef('');

  // Categories for selected pasto
  const [selectedCategories, setSelectedCategories] = useState<{ nome: string; quantidade: number; peso_medio_kg: number | null }[]>([]);
  // Recent transfers into this pasto
  const [recentTransfers, setRecentTransfers] = useState<{ nome_cat: string; quantidade: number; data: string; origem: string }[]>([]);

  const {
    mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef,
    status: mapStatus, reportRenderedGeometries,
  } = useStableLeafletMap({ debugName: 'MapaOperacao' });

  const hasGeo = geometrias.length > 0;
  const selectedPasto = selectedGeo?.pasto_id ? pastos.find((p) => p.id === selectedGeo.pasto_id) : null;
  const selectedOc = selectedGeo?.pasto_id ? ocupacoes.get(selectedGeo.pasto_id) : null;
  const geoIdKey = geometrias.map(g => g.id).join(',');

  // Load categories + recent transfers when pasto selected
  useEffect(() => {
    if (!selectedGeo?.pasto_id) { setSelectedCategories([]); setRecentTransfers([]); return; }
    const pastoId = selectedGeo.pasto_id;

    (async () => {
      // Categories
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

      // Recent transfers (last 7 days)
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
          const isSelected = selectedGeo?.id === geo.id;
          const oc = geo.pasto_id ? ocupacoes.get(geo.pasto_id) : null;
          const status = oc?.status || 'sem_ocupacao';

          const layer = L.geoJSON(geo.geojson as GeoJSON.GeoJsonObject, {
            style: getOpStyle(status, isSelected),
          });
          const bounds = layer.getBounds();
          if (!bounds.isValid()) return;

          const shortName = geo.nome_original || '';
          if (shortName) {
            const kgLabel = oc?.kg_ha != null ? `<br/><span class="kg-value">${formatNum(oc.kg_ha, 0)}</span>` : '';
            const label = L.divIcon({
              className: isSelected ? 'pasto-label-selected' : 'pasto-label-small',
              html: `<span>${shortName}${kgLabel}</span>`,
            });

            if (isSelected) {
              L.marker(bounds.getCenter(), { icon: label, interactive: false }).addTo(featureLayer);
            } else {
              L.marker(bounds.getCenter(), { icon: label, interactive: false }).addTo(labelLayer);
            }
          }

          layer.on('click', () => {
            setSelectedGeo(geo);
            setShowTransfer(false);
            resetForm();
          });
          layer.addTo(featureLayer);
          allBounds.push(bounds);
          renderedCount += 1;
        } catch {
          // skip invalid geometry
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
  }, [geometrias, geoIdKey, mapStatus, ocupacoes, reportRenderedGeometries, selectedGeo]);

  const resetForm = () => { setQty(''); setCat(''); setRef(''); setDestino(''); };

  const handleSave = async () => {
    if (!selectedPasto || !qty || Number(qty) <= 0) { toast.error('Preencha a quantidade'); return; }
    if (!destino) { toast.error('Selecione o pasto de destino'); return; }

    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const success = await registrarMovimentacao({
      fazenda_id: fazendaAtual!.id,
      cliente_id: fazendaAtual!.cliente_id,
      pasto_origem_id: selectedPasto.id,
      pasto_destino_id: destino,
      data: today,
      tipo: 'transferencia',
      quantidade: Number(qty),
      categoria: cat || null,
      referencia_rebanho: ref || null,
    });
    setSaving(false);

    if (success) {
      setShowTransfer(false);
      resetForm();
      onRefresh?.();
    }
  };

  const closePanel = () => {
    setSelectedGeo(null);
    setShowTransfer(false);
    resetForm();
  };

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
          {hasGeo && !selectedGeo && !geoLoading && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-0.5 z-10">
              <p className="text-[9px] text-muted-foreground font-medium">Toque em um pasto para operar</p>
            </div>
          )}
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

        {/* Side Panel */}
        {selectedGeo && (
          <Card className="hidden sm:flex flex-col w-56 flex-shrink-0 overflow-hidden border-border/60">
            <div className="p-2 overflow-y-auto flex-1 space-y-1.5">
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

              {/* Metrics */}
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

              {/* Categories breakdown */}
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

              {/* Recent transfers warning */}
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

              {/* Action: only Transfer */}
              {selectedPasto && !showTransfer && (
                <>
                  <Separator />
                  <p className="text-[9px] text-muted-foreground font-medium">O que deseja registrar?</p>
                  <button
                    onClick={() => setShowTransfer(true)}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md border text-[10px] font-medium transition-colors text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                    Transferência de pasto
                  </button>
                </>
              )}

              {/* Transfer form */}
              {selectedPasto && showTransfer && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[8px] h-3.5">Transferência</Badge>
                    <Button variant="ghost" size="sm" className="h-4 text-[8px] text-muted-foreground" onClick={() => { setShowTransfer(false); resetForm(); }}>
                      Voltar
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <Label className="text-[9px]">Quantidade *</Label>
                      <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-7 mt-0.5 text-[10px]" placeholder="Ex: 50" />
                    </div>
                    <div>
                      <Label className="text-[9px]">Categoria</Label>
                      <Select value={cat} onValueChange={setCat}>
                        <SelectTrigger className="h-7 mt-0.5 text-[10px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {categorias.map((categoria) => (
                            <SelectItem key={categoria.id} value={categoria.codigo}>{categoria.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[9px]">Pasto Destino *</Label>
                      <SearchableSelect
                        value={destino}
                        onValueChange={setDestino}
                        options={pastos.filter((p) => p.id !== selectedPasto.id && p.ativo).map((p) => ({ value: p.id, label: p.nome }))}
                        placeholder="Buscar pasto..."
                        allLabel="" allValue=""
                        className="h-7 mt-0.5 text-[10px]"
                      />
                    </div>
                    <div>
                      <Label className="text-[9px]">Referência</Label>
                      <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-7 mt-0.5 text-[10px]" placeholder="Ex: Lote A" />
                    </div>
                    <Button className="w-full h-7 mt-1 text-[10px]" onClick={handleSave} disabled={saving}>
                      <Check className="h-3 w-3 mr-1" />
                      {saving ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                </>
              )}

              {!selectedPasto && (
                <p className="text-[9px] text-muted-foreground">Pasto sem vínculo — não é possível operar.</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Mobile bottom card */}
      {selectedGeo && selectedPasto && (
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
          {!showTransfer ? (
            <button
              onClick={() => setShowTransfer(true)}
              className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-md border text-[10px] font-medium text-blue-700 bg-blue-50 border-blue-200"
            >
              <ArrowRightLeft className="h-3 w-3" />
              Transferência de pasto
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-7 flex-1 text-[10px]" placeholder="Qtd" />
                <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-7 flex-1 text-[10px]" placeholder="Referência" />
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => { setShowTransfer(false); resetForm(); }}>
                  Cancelar
                </Button>
                <Button size="sm" className="flex-1 h-7 text-[10px]" onClick={handleSave} disabled={saving}>
                  <Check className="h-3 w-3 mr-1" />{saving ? '...' : 'Registrar'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
