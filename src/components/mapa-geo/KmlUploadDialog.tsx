import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileCheck, AlertCircle, Link2 } from 'lucide-react';
import { parseKMLFile, type ParsedPolygon } from '@/lib/kmlParser';
import type { Pasto } from '@/hooks/usePastos';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (polygons: ParsedPolygon[]) => Promise<void>;
  pastos: Pasto[];
}

export function KmlUploadDialog({ open, onOpenChange, onUpload, pastos }: Props) {
  const [polygons, setPolygons] = useState<ParsedPolygon[]>([]);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pastoNames = new Set(pastos.filter(p => p.ativo).map(p => p.nome.trim().toLowerCase()));

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseKMLFile(file);
      if (parsed.length === 0) {
        toast.error('Nenhum polígono encontrado no arquivo');
        return;
      }
      setPolygons(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} polígonos encontrados`);
    } catch (err: any) {
      toast.error(`Erro ao ler arquivo: ${err.message}`);
    }
  }, []);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Mapa KML/KMZ</DialogTitle>
          <DialogDescription>
            Envie um arquivo KML ou KMZ com os polígonos dos pastos. Os nomes serão vinculados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".kml,.kmz"
            className="hidden"
            onChange={handleFile}
          />
          
          <Button
            variant="outline"
            className="w-full h-20 border-dashed"
            onClick={() => inputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm">{fileName || 'Clique para selecionar arquivo KML/KMZ'}</span>
            </div>
          </Button>

          {polygons.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileCheck className="h-3 w-3" />{polygons.length} polígonos
                </Badge>
                <Badge variant="default" className="gap-1 bg-green-600">
                  <Link2 className="h-3 w-3" />{matched.length} vinculados
                </Badge>
                {unmatched.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />{unmatched.length} sem vínculo
                  </Badge>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 text-sm border rounded-md p-2">
                {polygons.map((p, i) => {
                  const isMatched = pastoNames.has(p.name.trim().toLowerCase());
                  return (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className={`w-2 h-2 rounded-full ${isMatched ? 'bg-green-500' : 'bg-red-400'}`} />
                      <span className={isMatched ? 'font-medium' : 'text-muted-foreground'}>
                        {p.name}
                      </span>
                      {!isMatched && <span className="text-[10px] text-muted-foreground">(sem pasto)</span>}
                    </div>
                  );
                })}
              </div>

              {unmatched.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  💡 Polígonos sem vínculo serão salvos mas não exibirão dados de rebanho. 
                  Renomeie-os no KML para coincidir com os nomes dos pastos cadastrados.
                </p>
              )}

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : `Importar ${polygons.length} polígonos`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
