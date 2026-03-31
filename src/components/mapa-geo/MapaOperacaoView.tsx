import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, MapPin, X, LogIn, LogOut, ArrowRightLeft, Check } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import { usePastoMovimentacoes } from '@/hooks/usePastoMovimentacoes';
import { useFazenda } from '@/contexts/FazendaContext';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { toast } from 'sonner';

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  categorias: CategoriaRebanho[];
  geoLoading: boolean;
  onUpload: () => void;
  onRefresh?: () => void;
}

type QuickAction = 'entrada' | 'saida' | 'transferencia' | null;

// Soft status colors for operation view
function getOpStyle(geo: PastoGeometria, isSelected: boolean) {
  const linked = !!geo.pasto_id;
  if (isSelected) {
    return { color: 'hsl(213, 75%, 35%)', weight: 2.5, fillColor: 'hsl(213, 65%, 50%)', fillOpacity: 0.4 };
  }
  if (!linked) {
    return { color: 'hsl(220, 8%, 55%)', weight: 0.6, fillColor: 'hsl(220, 8%, 78%)', fillOpacity: 0.12 };
  }
  return { color: 'hsl(145, 35%, 42%)', weight: 0.8, fillColor: 'hsl(145, 40%, 68%)', fillOpacity: 0.15 };
}

export function MapaOperacaoView({ geometrias, pastos, categorias, geoLoading, onUpload, onRefresh }: Props) {
  const { fazendaAtual } = useFazenda();
  const { registrarMovimentacao } = usePastoMovimentacoes();

  const [selectedGeo, setSelectedGeo] = useState<PastoGeometria | null>(null);
  const [action, setAction] = useState<QuickAction>(null);

  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('');
  const [ref, setRef] = useState('');
  const [destino, setDestino] = useState('');
  const [saving, setSaving] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const hasGeo = geometrias.length > 0;
  const selectedPasto = selectedGeo?.pasto_id ? pastos.find(p => p.id === selectedGeo.pasto_id) : null;

  // Init map
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
      layerRef.current = null;
    }
    const map = L.map(el, { center: [-15.8, -47.9], zoom: 5, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapInstance.current = null;
      layerRef.current = null;
    };
  }, []);

  // Draw polygons — clean, minimal labels
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
          const isSel = selectedGeo?.id === geo.id;
          const layer = L.geoJSON(geo.geojson as any, { style: getOpStyle(geo, isSel) });
          const b = layer.getBounds();
          if (!b.isValid()) return;
          // Minimal label — only selected gets full name on map
          if (geo.nome_original && isSel) {
            const label = L.divIcon({
              className: 'pasto-label-selected',
              html: `<span>${geo.nome_original}</span>`,
            });
            L.marker(b.getCenter(), { icon: label, interactive: false }).addTo(lg);
          }
          layer.on('click', () => {
            setSelectedGeo(geo);
            setAction(null);
            resetForm();
          });
          layer.addTo(lg);
          allBounds.push(b);
        } catch (err) {
          console.error('[MapaOp] Erro:', err);
        }
      });
      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        map.fitBounds(combined, { padding: [30, 30], maxZoom: 17 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [geometrias, selectedGeo]);

  const resetForm = () => {
    setQty(''); setCat(''); setRef(''); setDestino('');
  };

  const handleSave = async () => {
    if (!selectedPasto || !action || !qty || Number(qty) <= 0) {
      toast.error('Preencha a quantidade');
      return;
    }
    if (action === 'transferencia' && !destino) {
      toast.error('Selecione o pasto de destino');
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const success = await registrarMovimentacao({
      fazenda_id: fazendaAtual!.id,
      cliente_id: fazendaAtual!.cliente_id,
      pasto_origem_id: action === 'entrada' ? null : selectedPasto.id,
      pasto_destino_id: action === 'entrada' ? selectedPasto.id : action === 'transferencia' ? destino : null,
      data: today,
      tipo: action,
      quantidade: Number(qty),
      categoria: cat || null,
      referencia_rebanho: ref || null,
    });
    setSaving(false);
    if (success) {
      setAction(null);
      resetForm();
      onRefresh?.();
    }
  };

  const closePanel = () => {
    setSelectedGeo(null);
    setAction(null);
    resetForm();
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 min-h-0 flex gap-2">
        {/* Map card */}
        <Card className="flex-1 min-h-0 relative overflow-hidden" style={{ minHeight: '400px' }}>
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0, minHeight: '400px' }} />
          {geoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-lg">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!hasGeo && !geoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card z-10 rounded-lg">
              <MapPin className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">Importe o mapa para começar</p>
              <Button size="sm" onClick={onUpload}><Upload className="h-3.5 w-3.5 mr-1" />Importar</Button>
            </div>
          )}
          {hasGeo && !selectedGeo && !geoLoading && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-1 z-10">
              <p className="text-[10px] text-muted-foreground font-medium">Toque em um pasto para registrar movimentação</p>
            </div>
          )}
        </Card>

        {/* Action panel — desktop side */}
        {selectedGeo && (
          <Card className="hidden sm:flex flex-col w-64 flex-shrink-0 overflow-hidden">
            <div className="p-2.5 overflow-y-auto flex-1 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xs font-bold text-foreground">
                    {selectedPasto?.nome || selectedGeo.nome_original || 'Sem nome'}
                  </h3>
                  {selectedPasto?.area_produtiva_ha && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatNum(selectedPasto.area_produtiva_ha, 1)} ha
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closePanel}>
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {!selectedPasto ? (
                <p className="text-[10px] text-muted-foreground">Pasto sem vínculo — não é possível registrar movimentação.</p>
              ) : !action ? (
                <>
                  <Separator />
                  <p className="text-[10px] text-muted-foreground font-medium">O que deseja registrar?</p>
                  <div className="space-y-1.5">
                    <ActionButton icon={<LogIn className="h-3.5 w-3.5" />} label="Entrada" color="text-green-700 bg-green-50 border-green-200 hover:bg-green-100" onClick={() => setAction('entrada')} />
                    <ActionButton icon={<LogOut className="h-3.5 w-3.5" />} label="Saída" color="text-red-700 bg-red-50 border-red-200 hover:bg-red-100" onClick={() => setAction('saida')} />
                    <ActionButton icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Transferência" color="text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" onClick={() => setAction('transferencia')} />
                  </div>
                </>
              ) : (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[9px] h-4 capitalize">{action}</Badge>
                    <Button variant="ghost" size="sm" className="h-4 text-[9px] text-muted-foreground" onClick={() => { setAction(null); resetForm(); }}>
                      Voltar
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[10px]">Quantidade *</Label>
                      <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="h-8 mt-0.5 text-xs" placeholder="Ex: 50" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Categoria</Label>
                      <Select value={cat} onValueChange={setCat}>
                        <SelectTrigger className="h-8 mt-0.5 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {categorias.map(c => (
                            <SelectItem key={c.id} value={c.codigo}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {action === 'transferencia' && (
                      <div>
                        <Label className="text-[10px]">Pasto Destino *</Label>
                        <Select value={destino} onValueChange={setDestino}>
                          <SelectTrigger className="h-8 mt-0.5 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {pastos.filter(p => p.id !== selectedPasto.id && p.ativo).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-[10px]">Referência</Label>
                      <Input value={ref} onChange={e => setRef(e.target.value)} className="h-8 mt-0.5 text-xs" placeholder="Ex: Lote A" />
                    </div>
                    <Button className="w-full h-8 mt-1 text-xs" onClick={handleSave} disabled={saving}>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {saving ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Mobile bottom panel */}
      {selectedGeo && selectedPasto && (
        <Card className="sm:hidden flex-shrink-0 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">{selectedPasto.nome}</h3>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closePanel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {!action ? (
            <div className="flex gap-1.5">
              <ActionButton icon={<LogIn className="h-3.5 w-3.5" />} label="Entrada" color="text-green-700 bg-green-50 border-green-200" onClick={() => setAction('entrada')} />
              <ActionButton icon={<LogOut className="h-3.5 w-3.5" />} label="Saída" color="text-red-700 bg-red-50 border-red-200" onClick={() => setAction('saida')} />
              <ActionButton icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Transfer." color="text-blue-700 bg-blue-50 border-blue-200" onClick={() => setAction('transferencia')} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} className="h-8 flex-1 text-xs" placeholder="Qtd" />
                <Input value={ref} onChange={e => setRef(e.target.value)} className="h-8 flex-1 text-xs" placeholder="Referência" />
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setAction(null); resetForm(); }}>Cancelar</Button>
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSave} disabled={saving}>
                  <Check className="h-3 w-3 mr-1" />{saving ? '...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ActionButton({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${color}`}
    >
      {icon}
      {label}
    </button>
  );
}
