import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';
import { parseMapaPastosExcel, validateMapaPastos, type MapaImportResult, type MapaImportValidated } from '@/lib/importMapaPastos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pastos: Pasto[];
  categorias: CategoriaRebanho[];
  fazendaId: string;
  clienteId: string;
  anoMes: string;
  onImported: () => void;
}

export function ImportMapaPastos({ open, onOpenChange, pastos, categorias, fazendaId, clienteId, anoMes, onImported }: Props) {
  const [result, setResult] = useState<MapaImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setDone(false);

    const buffer = await file.arrayBuffer();
    const rows = parseMapaPastosExcel(buffer);
    if (rows.length === 0) {
      toast.error('Arquivo vazio ou formato inválido');
      return;
    }
    const validated = validateMapaPastos(rows, pastos, categorias, anoMes);
    setResult(validated);
  };

  const handleImport = async () => {
    if (!result || result.validas.length === 0) return;
    setImporting(true);

    try {
      // Group by anoMes + pastoId
      const byMesPasto = new Map<string, MapaImportValidated[]>();
      for (const v of result.validas) {
        const key = `${v.anoMes}|${v.pastoId}`;
        const list = byMesPasto.get(key) || [];
        list.push(v);
        byMesPasto.set(key, list);
      }

      // Get all unique months
      const meses = [...new Set(result.validas.map(v => v.anoMes))];

      // Load existing fechamentos for all months
      const { data: existingFech } = await supabase
        .from('fechamento_pastos')
        .select('id, pasto_id, ano_mes')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', meses);

      const fechMap = new Map((existingFech || []).map(f => [`${f.ano_mes}|${f.pasto_id}`, f.id]));

      let totalPastos = 0;
      for (const [key, items] of byMesPasto) {
        const [itemAnoMes, pastoId] = key.split('|');
        let fechId = fechMap.get(key);
        const first = items[0];

        if (!fechId) {
          const { data, error } = await supabase
            .from('fechamento_pastos')
            .insert({
              pasto_id: pastoId,
              fazenda_id: fazendaId,
              cliente_id: clienteId,
              ano_mes: itemAnoMes,
              lote_mes: first.lote,
              tipo_uso_mes: first.atividade,
              qualidade_mes: first.qualidade,
            })
            .select('id')
            .single();
          if (error) throw error;
          fechId = data.id;
        } else {
          const updates: Record<string, unknown> = {};
          if (first.atividade) updates.tipo_uso_mes = first.atividade;
          if (first.lote) updates.lote_mes = first.lote;
          if (first.qualidade !== null) updates.qualidade_mes = first.qualidade;
          if (Object.keys(updates).length > 0) {
            await supabase.from('fechamento_pastos').update(updates as any).eq('id', fechId);
          }
        }

        await supabase.from('fechamento_pasto_itens').delete().eq('fechamento_id', fechId);

        const toInsert = items
          .filter(i => i.quantidade > 0)
          .map(i => ({
            fechamento_id: fechId!,
            categoria_id: i.categoriaId,
            quantidade: i.quantidade,
            peso_medio_kg: i.pesoMedioKg,
            lote: i.lote,
            origem_dado: 'import_excel',
          }));

        if (toInsert.length > 0) {
          const { error } = await supabase.from('fechamento_pasto_itens').insert(toInsert);
          if (error) throw error;
        }
        totalPastos++;
      }

      toast.success(`Importação concluída: ${result.validas.length} registros em ${totalPastos} pastos (${meses.length} mês(es))`);
      setDone(true);
      onImported();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao importar dados');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setDone(false);
    if (fileRef.current) fileRef.current.value = '';
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Mapa do Rebanho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se a coluna <strong>Ano_Mes</strong> não estiver preenchida, será usado o período <strong>{anoMes.split('-').reverse().join('/')}</strong> do seletor.
          </p>

          {!done && (
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-primary-foreground"
              />
            </div>
          )}

          {result && !done && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">{result.totalLinhas} linhas</Badge>
                <Badge className="bg-green-100 text-green-800">{result.validas.length} válidas</Badge>
                {result.erros.length > 0 && (
                  <Badge variant="destructive">{result.erros.length} erros</Badge>
                )}
                {result.mesesEncontrados.length > 0 && (
                  <Badge variant="outline">
                    {result.mesesEncontrados.length} mês(es): {result.mesesEncontrados.map(m => m.split('-').reverse().join('/')).join(', ')}
                  </Badge>
                )}
              </div>

              {result.erros.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium flex items-center gap-1 text-destructive">
                    <XCircle className="h-4 w-4" /> Erros encontrados:
                  </p>
                  <ScrollArea className="max-h-40 border rounded p-2">
                    {result.erros.map((e, i) => (
                      <p key={i} className="text-xs text-destructive">
                        Linha {e.linha}: {e.mensagem}
                      </p>
                    ))}
                  </ScrollArea>
                </div>
              )}

              {result.validas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium flex items-center gap-1 text-green-700">
                    <CheckCircle className="h-4 w-4" /> Prévia:
                  </p>
                  <ScrollArea className="max-h-40 border rounded p-2">
                    {result.validas.map((v, i) => (
                      <p key={i} className="text-xs">
                        <span className="text-muted-foreground">{v.anoMes.split('-').reverse().join('/')}</span>{' '}
                        {v.pastoNome} → {v.categoriaNome}: {v.quantidade} cab
                        {v.pesoMedioKg ? ` (${v.pesoMedioKg} kg)` : ''}
                      </p>
                    ))}
                  </ScrollArea>
                </div>
              )}

              {result.erros.length > 0 && result.validas.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Linhas com erro serão ignoradas.
                </p>
              )}

              <Button
                onClick={handleImport}
                disabled={result.validas.length === 0 || importing}
                className="w-full"
              >
                {importing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Importar {result.validas.length} registros</>
                )}
              </Button>
            </div>
          )}

          {done && (
            <div className="text-center py-4 space-y-2">
              <CheckCircle className="h-10 w-10 text-green-600 mx-auto" />
              <p className="text-sm font-medium text-green-700">Importação concluída com sucesso!</p>
              <Button variant="outline" onClick={handleClose}>Fechar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
