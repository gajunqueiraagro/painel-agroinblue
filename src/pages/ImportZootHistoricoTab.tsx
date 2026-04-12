import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Upload, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import {
  parsePlanilha,
  validarLinhas,
  montarInserts,
  gerarTemplateHistorico,
  CAMPOS_OBRIGATORIOS,
  type LinhaValidada,
  type TipoImportavel,
} from '@/lib/importZootHistorico';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import * as XLSX from 'xlsx';

export default function ImportZootHistoricoTab() {
  const { fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const [linhasValidadas, setLinhasValidadas] = useState<LinhaValidada[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inserindo, setInserindo] = useState(false);
  const [importado, setImportado] = useState(false);

  const fazendasMap = useMemo(() => {
    const m: Record<string, string> = {};
    fazendas.forEach((f) => { m[f.nome.toLowerCase()] = f.id; });
    return m;
  }, [fazendas]);

  // ── Download template ────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    const { headers, exemplos } = gerarTemplateHistorico();
    const rows = exemplos.map((ex) =>
      headers.reduce((acc, h) => ({ ...acc, [h]: ex[h] ?? '' }), {} as Record<string, any>)
    );
    triggerXlsxDownload({
      filename: 'template_importacao_zootecnica.xlsx',
      sheets: [{
        name: 'IMPORT_ZOOT_HISTORICO',
        mode: 'json',
        rows,
        cols: headers.map(() => ({ wch: 18 })),
      }],
    });
  };

  // ── Upload e parse ───────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportado(false);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // Usar primeira aba
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      if (!rawRows.length) {
        toast.error('Planilha vazia ou sem dados.');
        setUploading(false);
        return;
      }

      const parsed = parsePlanilha(rawRows);
      const validadas = validarLinhas(parsed, fazendasMap);
      setLinhasValidadas(validadas);
      toast.success(`${validadas.length} linhas lidas. Confira a prévia abaixo.`);
    } catch (err: any) {
      toast.error('Erro ao ler planilha: ' + (err.message || err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ── Estatísticas ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = linhasValidadas.length;
    const validas = linhasValidadas.filter((l) => l.valida).length;
    const erros = total - validas;
    const porTipo: Record<string, number> = {};
    linhasValidadas.forEach((l) => {
      porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1;
    });
    return { total, validas, erros, porTipo };
  }, [linhasValidadas]);

  // ── Insert (carga piloto / completa) ─────────────────────────────────────

  const handleInserir = async (piloto: boolean) => {
    if (!clienteAtual) { toast.error('Selecione um cliente.'); return; }

    const validas = linhasValidadas.filter((l) => l.valida);
    if (!validas.length) { toast.error('Nenhuma linha válida para importar.'); return; }

    const toInsert = piloto ? validas.slice(0, 10) : validas;

    setInserindo(true);
    try {
      const inserts = montarInserts(
        toInsert as LinhaValidada[],
        fazendasMap,
        clienteAtual.id,
      );

      // Inserir em lotes de 200
      const BATCH = 200;
      let inserted = 0;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const batch = inserts.slice(i, i + BATCH);
        const { error } = await supabase.from('lancamentos').insert(batch as any);
        if (error) throw error;
        inserted += batch.length;
      }

      toast.success(`${inserted} lançamentos importados com sucesso${piloto ? ' (piloto)' : ''}.`);
      if (!piloto) setImportado(true);
    } catch (err: any) {
      toast.error('Erro na importação: ' + (err.message || err));
    } finally {
      setInserindo(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importação Histórica Zootécnica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Instruções</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal ml-4 space-y-1 text-sm">
                <li>Baixe o template padrão e preencha com os dados desde 2020.</li>
                <li>Cada linha = 1 evento (saldo_inicial, nascimento, compra, venda, abate, etc.).</li>
                <li>Transferência de entrada é criada automaticamente — <strong>não inclua na planilha</strong>.</li>
                <li>Faça primeiro um teste piloto (10 linhas) antes da carga completa.</li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-1" /> Baixar Template
            </Button>
            <label>
              <Button variant="default" asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Enviar Planilha
                </span>
              </Button>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {linhasValidadas.length > 0 && (
        <>
          {/* Estatísticas */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary">{stats.total} linhas</Badge>
                <Badge className="bg-green-100 text-green-800">{stats.validas} válidas</Badge>
                {stats.erros > 0 && (
                  <Badge variant="destructive">{stats.erros} com erro</Badge>
                )}
                {Object.entries(stats.porTipo).map(([tipo, n]) => (
                  <Badge key={tipo} variant="outline">{tipo}: {n}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Regras de obrigatoriedade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Campos obrigatórios por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(CAMPOS_OBRIGATORIOS).map(([tipo, campos]) => (
                  <div key={tipo}>
                    <span className="font-semibold">{tipo}:</span>{' '}
                    <span className="text-muted-foreground">{(campos as string[]).join(', ')}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Prévia das linhas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Prévia da importação</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Fazenda</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Cat. Dest.</TableHead>
                    <TableHead>Qtde</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasValidadas.slice(0, 100).map((l) => (
                    <TableRow key={l.linha} className={l.valida ? '' : 'bg-red-50'}>
                      <TableCell className="text-xs">{l.linha}</TableCell>
                      <TableCell>
                        {l.valida
                          ? <CheckCircle className="h-4 w-4 text-green-600" />
                          : <XCircle className="h-4 w-4 text-red-600" />
                        }
                      </TableCell>
                      <TableCell className="text-xs font-mono">{l.tipo}</TableCell>
                      <TableCell className="text-xs">{l.data}</TableCell>
                      <TableCell className="text-xs">{l.fazenda}</TableCell>
                      <TableCell className="text-xs">{l.categoria}</TableCell>
                      <TableCell className="text-xs">{l.categoria_destino || '—'}</TableCell>
                      <TableCell className="text-xs">{l.quantidade}</TableCell>
                      <TableCell className="text-xs">{l.peso_medio_kg ?? '—'}</TableCell>
                      <TableCell className="text-xs">{l.valor_total ?? '—'}</TableCell>
                      <TableCell className="text-xs text-red-600 max-w-[200px]">
                        {l.erros.join('; ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {linhasValidadas.length > 100 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Exibindo 100 de {linhasValidadas.length} linhas.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Ações de importação */}
          {!importado && (
            <Card>
              <CardContent className="pt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleInserir(true)}
                  disabled={inserindo || stats.validas === 0}
                >
                  {inserindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  🧪 Teste Piloto (10 primeiras)
                </Button>
                <Button
                  onClick={() => handleInserir(false)}
                  disabled={inserindo || stats.validas === 0}
                >
                  {inserindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  🚀 Importar Todas ({stats.validas} válidas)
                </Button>
              </CardContent>
            </Card>
          )}

          {importado && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Importação concluída</AlertTitle>
              <AlertDescription>
                Todos os lançamentos válidos foram inseridos com origem_registro = "importacao_historica".
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
