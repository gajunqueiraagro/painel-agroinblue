import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, AlertTriangle, CheckCircle, XCircle, Loader2, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import {
  parsePlanilha,
  validarLinhas,
  montarInserts,
  gerarTemplateHistorico,
  computeFileHash,
  CAMPOS_OBRIGATORIOS,
  type LinhaValidada,
} from '@/lib/importZootHistorico';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import * as XLSX from 'xlsx';

type Filtro = 'todos' | 'validas' | 'erros';

export default function ImportZootHistoricoTab() {
  const { fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const [linhasValidadas, setLinhasValidadas] = useState<LinhaValidada[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inserindo, setInserindo] = useState(false);
  const [importado, setImportado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const tabelaRef = useRef<HTMLDivElement>(null);

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
    setFiltro('todos');

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
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

  // ── Linhas filtradas ─────────────────────────────────────────────────────

  const linhasFiltradas = useMemo(() => {
    if (filtro === 'validas') return linhasValidadas.filter((l) => l.valida);
    if (filtro === 'erros') return linhasValidadas.filter((l) => !l.valida);
    return linhasValidadas;
  }, [linhasValidadas, filtro]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const scrollToTabela = () => {
    tabelaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const aplicarFiltro = (f: Filtro) => {
    setFiltro(f);
    setTimeout(() => scrollToTabela(), 100);
  };

  // ── Exportar erros ───────────────────────────────────────────────────────

  const handleExportarErros = () => {
    const erros = linhasValidadas.filter((l) => !l.valida);
    if (!erros.length) { toast.info('Nenhum erro para exportar.'); return; }

    const rows = erros.map((l) => ({
      linha: l.linha,
      tipo: l.tipo,
      data: l.data,
      fazenda: l.fazenda,
      categoria: l.categoria,
      categoria_destino: l.categoria_destino,
      quantidade: l.quantidade,
      peso_medio_kg: l.peso_medio_kg,
      fazenda_destino: l.fazenda_destino,
      motivo_erro: l.erros.join(' | '),
    }));

    triggerXlsxDownload({
      filename: 'erros_importacao_zootecnica.xlsx',
      sheets: [{
        name: 'ERROS',
        mode: 'json',
        rows,
        cols: Object.keys(rows[0]).map(() => ({ wch: 20 })),
      }],
    });
  };

  // ── Insert with governance ────────────────────────────────────────────────

  const handleInserir = async (piloto: boolean) => {
    if (!clienteAtual) { toast.error('Selecione um cliente.'); return; }
    const validas = linhasValidadas.filter((l) => l.valida);
    if (!validas.length) { toast.error('Nenhuma linha válida para importar.'); return; }
    const toInsert = piloto ? validas.slice(0, 10) : validas;

    setInserindo(true);
    try {
      // 1. Check for duplicate import by file hash
      if (fileHash) {
        const { data: existing } = await supabase
          .from('zoot_importacoes')
          .select('id, nome_arquivo, created_at')
          .eq('cliente_id', clienteAtual.id)
          .eq('hash_arquivo', fileHash)
          .neq('status', 'excluido')
          .limit(1);
        if (existing && existing.length > 0) {
          const prev = existing[0];
          toast.error(`Arquivo já importado em ${new Date(prev.created_at).toLocaleDateString('pt-BR')}. Exclua a importação anterior se quiser reimportar.`);
          setInserindo(false);
          return;
        }
      }

      // 2. Identify the primary fazenda for this import
      const fazendaIds = [...new Set(toInsert.map(l => fazendasMap[l.fazenda.toLowerCase()]).filter(Boolean))];
      const primaryFazendaId = fazendaIds[0] || '';

      // 3. Create import record
      const { data: importRecord, error: impError } = await supabase
        .from('zoot_importacoes')
        .insert({
          cliente_id: clienteAtual.id,
          fazenda_id: primaryFazendaId,
          nome_arquivo: fileName || 'arquivo_sem_nome',
          hash_arquivo: fileHash || null,
          total_linhas: linhasValidadas.length,
          linhas_validas: validas.length,
          linhas_erro: linhasValidadas.length - validas.length,
          status: 'processado',
        })
        .select('id')
        .single();
      if (impError) throw impError;

      const loteId = importRecord.id;

      // 4. Insert lancamentos with lote_importacao_id
      const inserts = montarInserts(toInsert as LinhaValidada[], fazendasMap, clienteAtual.id, loteId);
      const BATCH = 200;
      let inserted = 0;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const batch = inserts.slice(i, i + BATCH);
        const { error } = await supabase.from('lancamentos').insert(batch as any);
        if (error) throw error;
        inserted += batch.length;
      }
      toast.success(`${inserted} lançamentos importados${piloto ? ' (piloto)' : ''} com rastreio de lote.`);
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
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </CardContent>
      </Card>

      {linhasValidadas.length > 0 && (
        <>
          {/* Cards de resumo clicáveis */}
          <div className="grid grid-cols-3 gap-3">
            <Card
              className={`cursor-pointer transition-all border-2 ${filtro === 'todos' ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
              onClick={() => aplicarFiltro('todos')}
            >
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">linhas</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all border-2 ${filtro === 'validas' ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
              onClick={() => aplicarFiltro('validas')}
            >
              <CardContent className="pt-4 pb-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <p className="text-2xl font-bold text-primary">{stats.validas}</p>
                </div>
                <p className="text-xs text-muted-foreground">válidas</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all border-2 ${filtro === 'erros' ? 'border-destructive' : 'border-transparent hover:border-muted-foreground/30'}`}
              onClick={() => aplicarFiltro('erros')}
            >
              <CardContent className="pt-4 pb-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <p className="text-2xl font-bold text-destructive">{stats.erros}</p>
                </div>
                <p className="text-xs text-muted-foreground">com erro</p>
              </CardContent>
            </Card>
          </div>

          {/* Tipos breakdown */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.porTipo).map(([tipo, n]) => (
              <Badge key={tipo} variant="outline">{tipo}: {n}</Badge>
            ))}
          </div>

          {/* Tabela de prévia com scroll fixo */}
          <div ref={tabelaRef}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm">
                    Prévia — {linhasFiltradas.length} linhas
                    {filtro !== 'todos' && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({filtro === 'erros' ? 'só erros' : 'só válidas'})
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    {stats.erros > 0 && (
                      <Button variant="outline" size="sm" onClick={handleExportarErros}>
                        <FileWarning className="h-3.5 w-3.5 mr-1" /> Exportar erros
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead className="w-16">Status</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Fazenda</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Cat. Dest.</TableHead>
                          <TableHead className="w-14">Qtde</TableHead>
                          <TableHead className="min-w-[200px]">Motivo do erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhasFiltradas.map((l) => (
                          <TableRow key={l.linha} className={l.valida ? '' : 'bg-destructive/10'}>
                            <TableCell className="text-xs font-mono">{l.linha}</TableCell>
                            <TableCell>
                              {l.valida
                                ? <Badge variant="outline" className="text-primary border-primary/40 text-[10px] px-1.5">OK</Badge>
                                : <Badge variant="destructive" className="text-[10px] px-1.5">Erro</Badge>
                              }
                            </TableCell>
                            <TableCell className="text-xs font-mono">{l.tipo}</TableCell>
                            <TableCell className="text-xs">{l.data}</TableCell>
                            <TableCell className="text-xs">{l.fazenda}</TableCell>
                            <TableCell className="text-xs">{l.categoria}</TableCell>
                            <TableCell className="text-xs">{l.categoria_destino || '—'}</TableCell>
                            <TableCell className="text-xs">{l.quantidade}</TableCell>
                            <TableCell className="text-xs text-destructive">
                              {l.erros.length > 0 ? l.erros.join(' | ') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {linhasFiltradas.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                              Nenhuma linha para exibir com este filtro.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Ações de importação */}
          {!importado && (
            <Card>
              <CardContent className="pt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleInserir(true)} disabled={inserindo || stats.validas === 0}>
                  {inserindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  🧪 Teste Piloto (10 primeiras)
                </Button>
                <Button onClick={() => handleInserir(false)} disabled={inserindo || stats.validas === 0}>
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
