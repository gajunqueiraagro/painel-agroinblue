/**
 * Tela de importação financeira via Excel.
 * Importação global: cada linha é vinculada à fazenda pelo codigo_importacao.
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import { downloadModeloExcel } from '@/lib/financeiro/excelTemplate';
import {
  parseExcel, resolverFazendas, validarCentrosCusto,
  type LinhaImportada, type ErroImportacao, type CentroCustoOficial, type FazendaMap,
} from '@/lib/financeiro/importParser';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { ImportacaoRecord } from '@/hooks/useFinanceiro';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  importacoes: ImportacaoRecord[];
  centrosCusto: CentroCustoOficial[];
  fazendas: FazendaMap[];
  onConfirmar: (nomeArquivo: string, linhas: LinhaImportada[], totalLinhas: number, totalErros: number) => Promise<boolean>;
  onExcluir: (importacaoId: string) => Promise<boolean>;
}

export function ImportacaoFinanceira({ importacoes, centrosCusto, fazendas, onConfirmar, onExcluir }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    nomeArquivo: string;
    linhas: LinhaImportada[];
    erros: ErroImportacao[];
    totalLinhas: number;
    resumoFazendas: { codigo: string; nome: string; qtd: number }[];
  } | null>(null);
  const [importando, setImportando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<ImportacaoRecord | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const result = parseExcel(buffer);

    // Resolve fazendas by codigo_importacao
    const errosFazenda = resolverFazendas(result.linhasValidas, fazendas);
    const errosCentro = validarCentrosCusto(result.linhasValidas, centrosCusto);

    // Build summary by fazenda
    const fazendaCount = new Map<string, number>();
    for (const l of result.linhasValidas) {
      if (l.fazenda) {
        fazendaCount.set(l.fazenda, (fazendaCount.get(l.fazenda) || 0) + 1);
      }
    }
    const fazendaMapByCode = new Map(fazendas.map(f => [f.codigo.toLowerCase().trim(), f]));
    const resumoFazendas = Array.from(fazendaCount.entries()).map(([codigo, qtd]) => {
      const faz = fazendaMapByCode.get(codigo.toLowerCase().trim());
      return { codigo, nome: faz?.nome || '❌ Não encontrada', qtd };
    }).sort((a, b) => b.qtd - a.qtd);

    setPreview({
      nomeArquivo: file.name,
      linhas: result.linhasValidas,
      erros: [...result.erros, ...errosFazenda, ...errosCentro],
      totalLinhas: result.totalLinhas,
      resumoFazendas,
    });

    if (fileRef.current) fileRef.current.value = '';
  };

  const handleConfirmar = async () => {
    if (!preview) return;

    // Block if any line has unresolved fazenda
    const linhasComFazenda = preview.linhas.filter(l => l.fazendaId);
    const linhasSemFazenda = preview.linhas.filter(l => !l.fazendaId);

    if (linhasSemFazenda.length > 0) {
      // Can't import if there are unresolved fazendas
      return;
    }

    setImportando(true);
    const errosBloqueantes = preview.erros.filter(e => e.campo !== 'Centro de Custo');
    const ok = await onConfirmar(
      preview.nomeArquivo,
      linhasComFazenda,
      preview.totalLinhas,
      errosBloqueantes.length,
    );
    if (ok) setPreview(null);
    setImportando(false);
  };

  const handleExcluir = async () => {
    if (!confirmExcluir) return;
    setExcluindo(confirmExcluir.id);
    await onExcluir(confirmExcluir.id);
    setExcluindo(null);
    setConfirmExcluir(null);
  };

  const temErrosFazenda = preview?.erros.some(e => e.campo === 'Fazenda') || false;
  const errosCentro = preview?.erros.filter(e => e.campo === 'Centro de Custo') || [];
  const hasCentroErrors = errosCentro.length > 0;

  return (
    <div className="space-y-4">
      {/* Ações */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={downloadModeloExcel} className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Baixar Modelo
        </Button>
        <Button onClick={() => fileRef.current?.click()} className="flex-1">
          <Upload className="h-4 w-4 mr-2" />
          Importar Excel
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Prévia */}
      {preview && (
        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Prévia: {preview.nomeArquivo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted rounded-lg p-2 text-center">
                <div className="font-bold text-lg">{preview.totalLinhas}</div>
                <div className="text-muted-foreground text-xs">Total linhas</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center">
                <div className="font-bold text-lg text-green-700 dark:text-green-400">{preview.linhas.filter(l => l.fazendaId).length}</div>
                <div className="text-muted-foreground text-xs">Prontas</div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                <div className="font-bold text-lg text-red-600 dark:text-red-400">{preview.erros.length}</div>
                <div className="text-muted-foreground text-xs">Com erro</div>
              </div>
            </div>

            {/* Resumo fazendas */}
            {preview.resumoFazendas.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground">Distribuição por fazenda:</p>
                {preview.resumoFazendas.map(f => (
                  <div key={f.codigo} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold">{f.codigo}</span>
                      <span className="text-muted-foreground">→ {f.nome}</span>
                    </div>
                    <span className="font-bold">{f.qtd} linhas</span>
                  </div>
                ))}
              </div>
            )}

            {/* Erros */}
            {preview.erros.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Erros encontrados:
                </p>
                {preview.erros.slice(0, 20).map((e, i) => (
                  <div key={i} className="text-xs bg-destructive/5 rounded px-2 py-1">
                    <span className="font-bold">Linha {e.linha}</span> — {e.campo}: {e.mensagem}
                  </div>
                ))}
                {preview.erros.length > 20 && (
                  <div className="text-xs text-muted-foreground">
                    ... e mais {preview.erros.length - 20} erros
                  </div>
                )}
              </div>
            )}

            {/* Preview table */}
            {preview.linhas.length > 0 && (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-1 text-left">Fazenda</th>
                      <th className="p-1 text-left">Data</th>
                      <th className="p-1 text-left">Produto</th>
                      <th className="p-1 text-right">Valor</th>
                      <th className="p-1 text-left">AnoMes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.linhas.slice(0, 10).map((l, i) => (
                      <tr key={i} className={`border-b ${!l.fazendaId ? 'bg-destructive/5' : ''}`}>
                        <td className="p-1 font-mono font-bold">{l.fazenda || '-'}</td>
                        <td className="p-1">{l.dataRealizacao}</td>
                        <td className="p-1 truncate max-w-[100px]">{l.produto || '-'}</td>
                        <td className="p-1 text-right font-bold">{formatMoeda(l.valor)}</td>
                        <td className="p-1">{l.anoMes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.linhas.length > 10 && (
                  <p className="text-xs text-muted-foreground p-1">
                    Mostrando 10 de {preview.linhas.length} linhas
                  </p>
                )}
              </div>
            )}

            {/* Centro de custo warnings */}
            {hasCentroErrors && (
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errosCentro.length} linha(s) com hierarquia não cadastrada
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirmar}
                disabled={importando || temErrosFazenda || preview.linhas.filter(l => l.fazendaId).length === 0}
              >
                {importando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
                ) : temErrosFazenda ? (
                  <><AlertTriangle className="h-4 w-4 mr-2" /> Corrija os erros de fazenda</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar ({preview.linhas.filter(l => l.fazendaId).length} linhas)</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {importacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Histórico de Importações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {importacoes.map(imp => (
                <div key={imp.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg p-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold truncate">{imp.nome_arquivo}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(imp.data_importacao), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-bold">{imp.total_validas} linhas</p>
                      <div className="flex items-center gap-1">
                        {imp.status === 'processada' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                        <span className="text-muted-foreground capitalize">{imp.status}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmExcluir(imp)}
                      disabled={excluindo === imp.id}
                    >
                      {excluindo === imp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmExcluir} onOpenChange={(open) => !open && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá permanentemente <span className="font-bold">{confirmExcluir?.total_validas} lançamentos</span> vinculados
              ao arquivo <span className="font-bold">{confirmExcluir?.nome_arquivo}</span>.
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir {confirmExcluir?.total_validas} lançamentos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
