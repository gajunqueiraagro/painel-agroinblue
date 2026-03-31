import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileCheck, AlertCircle, Link2, MapPin, X, Loader2, Trash2, Save, RefreshCw } from 'lucide-react';
import { parseKMLFile, type ParsedPolygon } from '@/lib/kmlParser';
import type { Pasto } from '@/hooks/usePastos';
import { toast } from 'sonner';
import L from 'leaflet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (polygons: ParsedPolygon[]) => Promise<void>;
  onRemove?: () => Promise<void>;
  pastos: Pasto[];
  hasExistingMap?: boolean;
}

export function KmlUploadDialog({ open, onOpenChange, onUpload, onRemove, pastos, hasExistingMap }: Props) {
  const [polygons, setPolygons] = useState<ParsedPolygon[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [parseError, setParseError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewMap = useRef<L.Map | null>(null);
  const previewLayer = useRef<L.LayerGroup | null>(null);

  const pastoNames = new Set(pastos.filter(p => p.ativo).map(p => p.nome.trim().toLowerCase()));

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');

    const ext = file.name.toLowerCase().split('.').pop() || '';
    const formatMap: Record<string, string> = { kml: 'KML', kmz: 'KMZ', geojson: 'GeoJSON', json: 'GeoJSON' };
    setFileFormat(formatMap[ext] || ext.toUpperCase());

    try {
      const parsed = await parseKMLFile(file);
      if (parsed.length === 0) {
        setParseError('Nenhum polígono encontrado no arquivo.');
        setPolygons([]);
        setFileName(file.name);
        return;
      }
      setPolygons(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} polígonos encontrados`);
    } catch (err: any) {
      setParseError('Não foi possível carregar o mapa. Verifique se o arquivo é válido.');
      setPolygons([]);
      setFileName(file.name);
      console.error(err);
    }
  }, []);

  // Init / destroy preview map
  useEffect(() => {
    if (!open) return;
    // Small delay for DOM to mount
    const timer = setTimeout(() => {
      if (!previewRef.current || previewMap.current) return;
      const map = L.map(previewRef.current, {
        center: [-15.8, -47.9],
        zoom: 4,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      previewLayer.current = L.layerGroup().addTo(map);
      previewMap.current = map;
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (previewMap.current) {
        previewMap.current.remove();
        previewMap.current = null;
        previewLayer.current = null;
      }
    };
  }, [open]);

  // Draw polygons on preview
  useEffect(() => {
    if (!previewMap.current || !previewLayer.current) return;
    previewLayer.current.clearLayers();

    if (polygons.length === 0) return;

    const bounds: L.LatLngBounds[] = [];
    polygons.forEach(poly => {
      const isMatched = pastoNames.has(poly.name.trim().toLowerCase());
      const color = isMatched ? '#22c55e' : '#f59e0b';
      const layer = L.geoJSON(poly.geojson as any, {
        style: { color, weight: 2, fillColor: color, fillOpacity: 0.3 },
      });

      const center = layer.getBounds().getCenter();
      const label = L.divIcon({
        className: 'pasto-label',
        html: `<div style="background:rgba(255,255,255,0.9);border:1px solid ${color};border-radius:4px;padding:1px 4px;font-size:10px;font-weight:600;white-space:nowrap;">${poly.name}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(center, { icon: label }).addTo(previewLayer.current!);

      layer.addTo(previewLayer.current!);
      bounds.push(layer.getBounds());
    });

    if (bounds.length > 0) {
      const combined = bounds.reduce((acc, b) => acc.extend(b));
      previewMap.current.fitBounds(combined, { padding: [20, 20] });
    }
  }, [polygons, pastoNames]);

  // invalidateSize when dialog resizes
  useEffect(() => {
    if (!open || !previewMap.current) return;
    const timer = setTimeout(() => previewMap.current?.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [open, polygons]);

  const matched = polygons.filter(p => pastoNames.has(p.name.trim().toLowerCase()));
  const unmatched = polygons.filter(p => !pastoNames.has(p.name.trim().toLowerCase()));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onUpload(polygons);
    } finally {
      setSaving(false);
    }
  }, [polygons, onUpload]);

  const handleRemove = useCallback(async () => {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
      onOpenChange(false);
    } finally {
      setRemoving(false);
    }
  }, [onRemove, onOpenChange]);

  const handleClose = () => {
    setPolygons([]);
    setFileName('');
    setFileFormat('');
    setParseError('');
    if (inputRef.current) inputRef.current.value = '';
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0 z-[1000]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Importar Mapa da Fazenda</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Envie um arquivo KML, KMZ ou GeoJSON</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body — two columns on desktop, stacked on mobile */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-full">
            {/* Left: Upload + info */}
            <div className="p-4 space-y-4 border-b md:border-b-0 md:border-r border-border">
              <input
                ref={inputRef}
                type="file"
                accept=".kml,.kmz,.geojson,.json"
                className="hidden"
                onChange={handleFile}
              />

              <Button
                variant="outline"
                className="w-full h-16 border-dashed gap-2"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">Selecionar arquivo</span>
              </Button>

              {/* File info */}
              {fileName && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground truncate max-w-[200px]">{fileName}</span>
                    {fileFormat && <Badge variant="outline" className="text-[10px] h-5">{fileFormat}</Badge>}
                  </div>

                  {parseError ? (
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p className="text-xs">{parseError}</p>
                    </div>
                  ) : polygons.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                          <FileCheck className="h-3 w-3" />{polygons.length} polígonos
                        </Badge>
                        <Badge className="gap-1 text-[10px] h-5 bg-success text-success-foreground">
                          <Link2 className="h-3 w-3" />{matched.length} vinculados
                        </Badge>
                        {unmatched.length > 0 && (
                          <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                            <AlertCircle className="h-3 w-3" />{unmatched.length} sem vínculo
                          </Badge>
                        )}
                      </div>

                      {/* Polygon list */}
                      <div className="max-h-36 overflow-y-auto space-y-0.5 text-xs border border-border rounded-md p-2 bg-background">
                        {polygons.map((p, i) => {
                          const isM = pastoNames.has(p.name.trim().toLowerCase());
                          return (
                            <div key={i} className="flex items-center gap-1.5 py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isM ? 'bg-success' : 'bg-destructive'}`} />
                              <span className={isM ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                                {p.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {unmatched.length > 0 && (
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          💡 Polígonos sem vínculo serão salvos mas não exibirão dados de rebanho.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {!fileName && (
                <p className="text-xs text-muted-foreground text-center">
                  Formatos aceitos: .kml, .kmz, .geojson
                </p>
              )}
            </div>

            {/* Right: Map preview */}
            <div className="relative min-h-[300px] md:min-h-0">
              <div
                ref={previewRef}
                className="absolute inset-0 overflow-hidden"
                style={{ zIndex: 0 }}
              />
              {polygons.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 pointer-events-none z-10">
                  <MapPin className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum mapa carregado para visualização</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
          <div>
            {hasExistingMap && onRemove && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 text-xs"
                onClick={handleRemove}
                disabled={removing || saving}
              >
                {removing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                Remover mapa atual
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={polygons.length === 0 || saving}
            >
              {saving ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Salvando...</>
              ) : hasExistingMap ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Substituir mapa</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-1" />Salvar mapa</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
