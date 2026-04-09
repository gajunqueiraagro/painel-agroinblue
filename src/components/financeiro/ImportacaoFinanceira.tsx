/**
 * Tela de importação financeira via Excel — aba única EXPORT_APP_UNICO.
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2, Ban, ShieldCheck } from 'lucide-react';
import { ConferenciaImportacaoDialog } from '@/components/financeiro-v2/ConferenciaImportacaoDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useCliente } from '@/contexts/ClienteContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadModeloExcel } from '@/lib/financeiro/excelTemplate';
import {
  parseExcel, resolverFazendas, resolverFazendasExtras, validarCentrosCusto, validarEstruturaExcel,
  type LinhaImportada, type SaldoBancarioImportado,
  type ResumoCaixaImportado, type ErroImportacao, type CentroCustoOficial, type FazendaMap,
  type ValidacaoEstrutura,
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
  mesFechado?: boolean;
  contasBancarias?: { id: string; nome_conta: string; nome_exibicao?: string | null; codigo_conta?: string | null }[];
  onConfirmar: (
    nomeArquivo: string,
    linhas: LinhaImportada[],
    totalLinhas: number,
    totalErros: number,
    saldosBancarios?: SaldoBancarioImportado[],
    contas?: never[],
    resumoCaixa?: ResumoCaixaImportado[],
    tipoImportacao?: string,
  ) => Promise<boolean>;
  onExcluir: (importacaoId: string) => Promise<boolean>;
}

interface PreviewState {
  nomeArquivo: string;
  lancamentos: LinhaImportada[];
  saldosBancarios: SaldoBancarioImportado[];
  resumoCaixa: ResumoCaixaImportado[];
  erros: ErroImportacao[];
  totalLinhas: number;
  resumoFazendas: { codigo: string; nome: string; qtd: number }[];
  erroEstrutura?: ValidacaoEstrutura;
}

export function ImportacaoFinanceira({ importacoes, centrosCusto, fazendas, mesFechado, contasBancarias = [], onConfirmar, onExcluir }: Props) {
  const { perfil } = usePermissions();
  const podeCancelar = ['admin_agroinblue', 'gestor_cliente', 'financeiro'].includes(perfil || '');
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [importando, setImportando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<ImportacaoRecord | null>(null);
  const [tipoImportacao, setTipoImportacao] = useState<string>('importacao_incremental');
  const [conferenciaOpen, setConferenciaOpen] = useState(false);


  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();

    const validacao = validarEstruturaExcel(buffer);
    if (!validacao.valido) {
      setPreview({
        nomeArquivo: file.name,
        lancamentos: [], saldosBancarios: [], resumoCaixa: [],
        erros: [], totalLinhas: 0, resumoFazendas: [],
        erroEstrutura: validacao,
      });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const result = parseExcel(buffer);

    const errosFazenda = resolverFazendas(result.lancamentos, fazendas);
    const errosFazendaExtras = resolverFazendasExtras(result.saldosBancarios, result.resumoCaixa, fazendas);
    const errosCentro = validarCentrosCusto(result.lancamentos, centrosCusto);

    // Build summary by fazenda (from all record types)
    const fazendaCount = new Map<string, number>();
    for (const l of result.lancamentos) {
      if (l.fazenda) fazendaCount.set(l.fazenda, (fazendaCount.get(l.fazenda) || 0) + 1);
    }
    for (const s of result.saldosBancarios) {
      if (s.fazenda) fazendaCount.set(s.fazenda, (fazendaCount.get(s.fazenda) || 0) + 1);
    }
    for (const r of result.resumoCaixa) {
      if (r.fazenda) fazendaCount.set(r.fazenda, (fazendaCount.get(r.fazenda) || 0) + 1);
    }

    const fazendaMapByCode = new Map(fazendas.map(f => [f.codigo.toLowerCase().trim(), f]));
    const resumoFazendas = Array.from(fazendaCount.entries()).map(([codigo, qtd]) => {
      const faz = fazendaMapByCode.get(codigo.toLowerCase().trim());
      return { codigo, nome: faz?.nome || '❌ Não encontrada', qtd };
    }).sort((a, b) => b.qtd - a.qtd);

    setPreview({
      nomeArquivo: file.name,
      lancamentos: result.lancamentos,
      saldosBancarios: result.saldosBancarios,
      resumoCaixa: result.resumoCaixa,
      erros: [...result.erros, ...errosFazenda, ...errosFazendaExtras, ...errosCentro],
      totalLinhas: result.totalLinhas,
      resumoFazendas,
    });

    if (fileRef.current) fileRef.current.value = '';
  };

  const handleConfirmar = async () => {
    if (!preview) return;

    const linhasComFazenda = preview.lancamentos.filter(l => l.fazendaId);
    const linhasSemFazenda = preview.lancamentos.filter(l => !l.fazendaId);
    if (linhasSemFazenda.length > 0 && preview.lancamentos.length > 0) return;

    setImportando(true);
    const errosBloqueantes = preview.erros.filter(e => e.campo !== 'Centro de Custo');
    const resumoComFazenda = preview.resumoCaixa.filter(r => r.fazendaId);

    const ok = await onConfirmar(
      preview.nomeArquivo,
      linhasComFazenda,
      preview.totalLinhas,
      errosBloqueantes.length,
      preview.saldosBancarios,
      [],
      resumoComFazenda,
      tipoImportacao,
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

  const temErrosFazenda = preview?.lancamentos.some(l => !l.fazendaId) || false;
  const errosCentro = preview?.erros.filter(e => e.campo === 'Centro de Custo') || [];
  const hasCentroErrors = errosCentro.length > 0;
  const lancamentosReady = preview?.lancamentos.filter(l => l.fazendaId).length || 0;
  const totalReady = lancamentosReady + (preview?.saldosBancarios.length || 0) + (preview?.resumoCaixa.length || 0);

  return (
    <div className="space-y-4">
      {mesFechado && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs border bg-destructive/5 border-destructive/20">
          <span className="text-destructive font-semibold">🔒 Mês fechado — importação bloqueada.</span>
        </div>
      )}
      {/* Ações */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={downloadModeloExcel} className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Baixar Modelo
        </Button>
        <Button onClick={() => fileRef.current?.click()} className="flex-1" disabled={!!mesFechado}>
          <Upload className="h-4 w-4 mr-2" />
          Importar Excel
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
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
            {/* Erro de estrutura */}
            {preview.erroEstrutura && !preview.erroEstrutura.valido && (
              <div className="space-y-2">
                {preview.erroEstrutura.abasFaltando.length > 0 && (
                  <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-bold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Aba obrigatória ausente:
                    </p>
                    {preview.erroEstrutura.abasFaltando.map(aba => (
                      <div key={aba} className="text-xs bg-destructive/5 rounded px-2 py-1 font-mono">{aba}</div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-1">
                      O arquivo deve conter uma aba chamada <span className="font-mono font-bold">EXPORT_APP_UNICO</span>
                    </p>
                  </div>
                )}
                {preview.erroEstrutura.colunasFaltando.length > 0 && (
                  <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-bold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Colunas obrigatórias ausentes:
                    </p>
                    {preview.erroEstrutura.colunasFaltando.map(item => (
                      <div key={item.aba} className="text-xs bg-destructive/5 rounded px-2 py-1">
                        {item.colunas.join(', ')}
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={() => setPreview(null)}>Fechar</Button>
              </div>
            )}

            {/* Conteúdo normal */}
            {(!preview.erroEstrutura || preview.erroEstrutura.valido) && <>
            {/* Tipo de importação */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo de importação</label>
              <Select value={tipoImportacao} onValueChange={setTipoImportacao}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="importacao_inicial" className="text-xs">📦 Importação Inicial (primeira carga)</SelectItem>
                  <SelectItem value="importacao_historica" className="text-xs">📚 Histórico (2020–2024, somente leitura)</SelectItem>
                  <SelectItem value="importacao_incremental" className="text-xs">➕ Incremental (novos dados)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Proteção de deduplicação */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-foreground">Importação incremental protegida</p>
                <p className="text-muted-foreground">Duplicados são ignorados automaticamente pela chave estável cliente + fazenda + data_pagamento + valor + tipo + conta bancária, com trava adicional no banco.</p>
              </div>
            </div>

            {/* Resumo por tipo de registro */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted rounded-lg p-2 text-center">
                <div className="font-bold text-lg">{preview.lancamentos.length}</div>
                <div className="text-muted-foreground text-xs">Lançamentos</div>
              </div>
              <div className="bg-muted rounded-lg p-2 text-center">
                <div className="font-bold text-lg">{preview.saldosBancarios.length}</div>
                <div className="text-muted-foreground text-xs">Saldos</div>
              </div>
              <div className="bg-muted rounded-lg p-2 text-center">
                <div className="font-bold text-lg">{preview.resumoCaixa.length}</div>
                <div className="text-muted-foreground text-xs">Resumos</div>
              </div>
            </div>

            {/* Status */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-muted rounded-lg p-2 text-center">
                <div className="font-bold text-lg">{preview.totalLinhas}</div>
                <div className="text-muted-foreground text-xs">Total linhas</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center">
                <div className="font-bold text-lg text-green-700 dark:text-green-400">{totalReady}</div>
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
            {preview.erros.length > 0 && (() => {
              const errosTransf = preview.erros.filter(e => e.campo === 'Conta_Destino');
              const errosOutros = preview.erros.filter(e => e.campo !== 'Conta_Destino' && e.campo !== 'Centro de Custo');
              return (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {errosTransf.length > 0 && (
                    <div className="bg-destructive/10 rounded-lg p-2 mb-1">
                      <p className="text-xs font-bold text-destructive flex items-center gap-1 mb-1">
                        <AlertTriangle className="h-3 w-3" /> {errosTransf.length} transferência(s) bloqueada(s) — conta destino ausente ou inválida
                      </p>
                      {errosTransf.slice(0, 10).map((e, i) => (
                        <div key={`t${i}`} className="text-xs bg-destructive/5 rounded px-2 py-0.5 mt-0.5">
                          <span className="font-bold">Linha {e.linha}</span> — {e.mensagem}
                        </div>
                      ))}
                      {errosTransf.length > 10 && (
                        <div className="text-xs text-muted-foreground mt-0.5">... e mais {errosTransf.length - 10}</div>
                      )}
                    </div>
                  )}
                  {errosOutros.length > 0 && (
                    <>
                      <p className="text-xs font-bold text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Erros encontrados:
                      </p>
                      {errosOutros.slice(0, 20).map((e, i) => (
                        <div key={i} className="text-xs bg-destructive/5 rounded px-2 py-1">
                          <span className="font-bold">Linha {e.linha}</span> — {e.campo}: {e.mensagem}
                        </div>
                      ))}
                      {errosOutros.length > 20 && (
                        <div className="text-xs text-muted-foreground">... e mais {errosOutros.length - 20} erros</div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Preview table - lancamentos */}
            {preview.lancamentos.length > 0 && (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-1 text-left">Fazenda</th>
                      <th className="p-1 text-left">AnoMes</th>
                      <th className="p-1 text-left">Produto</th>
                      <th className="p-1 text-right">Valor</th>
                      <th className="p-1 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lancamentos.slice(0, 10).map((l, i) => (
                      <tr key={i} className={`border-b ${!l.fazendaId ? 'bg-destructive/5' : ''}`}>
                        <td className="p-1 font-mono font-bold">{l.fazenda || '-'}</td>
                        <td className="p-1">{l.anoMes}</td>
                        <td className="p-1 truncate max-w-[100px]">{l.produto || '-'}</td>
                        <td className="p-1 text-right font-bold">{formatMoeda(l.valor)}</td>
                        <td className="p-1">{l.statusTransacao || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.lancamentos.length > 10 && (
                  <p className="text-xs text-muted-foreground p-1">Mostrando 10 de {preview.lancamentos.length} lançamentos</p>
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
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>Cancelar</Button>
              {preview.lancamentos.length > 0 && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConferenciaOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" /> Revisar e Corrigir
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={handleConfirmar}
                disabled={importando || temErrosFazenda || totalReady === 0}
              >
                {importando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
                ) : temErrosFazenda ? (
                  <><AlertTriangle className="h-4 w-4 mr-2" /> Corrija os erros de fazenda</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar ({totalReady} registros)</>
                )}
              </Button>
            </div>
            </>}
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
                      <p className="text-muted-foreground">{format(new Date(imp.data_importacao), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-bold">{imp.total_validas} registros</p>
                      <div className="flex items-center gap-1">
                        {imp.status === 'processada' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                        <span className="text-muted-foreground capitalize">{imp.status}</span>
                      </div>
                    </div>
                    {imp.status !== 'cancelada' && podeCancelar && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => setConfirmExcluir(imp)}
                        disabled={excluindo === imp.id}
                        title="Cancelar importação"
                      >
                        {excluindo === imp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm cancel dialog */}
      <AlertDialog open={!!confirmExcluir} onOpenChange={(open) => !open && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar importação?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a inativar todos os <span className="font-bold">{confirmExcluir?.total_validas} lançamentos</span> do arquivo <span className="font-bold">{confirmExcluir?.nome_arquivo}</span>.
              <br /><br />Os dados não serão apagados, mas deixarão de aparecer nas análises.
              <br /><br />Lançamentos conciliados ou editados manualmente bloqueiam o cancelamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar Importação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferência de Importação */}
      {preview && conferenciaOpen && (
        <ConferenciaImportacaoDialog
          open={conferenciaOpen}
          onClose={() => setConferenciaOpen(false)}
          nomeArquivo={preview.nomeArquivo}
          linhas={preview.lancamentos}
          contas={contasBancarias}
          fazendas={fazendas.map(f => ({ id: f.id, nome: f.nome, codigo: f.codigo }))}
          onConfirmar={async (linhasCorrigidas) => {
            setImportando(true);
            const ok = await onConfirmar(
              preview.nomeArquivo,
              linhasCorrigidas,
              preview.totalLinhas,
              0,
              preview.saldosBancarios,
              [],
              preview.resumoCaixa.filter(r => r.fazendaId),
              tipoImportacao,
            );
            if (ok) {
              setPreview(null);
              setConferenciaOpen(false);
            }
            setImportando(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}
