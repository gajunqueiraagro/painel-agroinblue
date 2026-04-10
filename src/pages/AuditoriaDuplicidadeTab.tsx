/**
 * Auditoria de Duplicidade Financeira
 * Exibe lançamentos que foram sinalizados como duplicados durante importações
 * e permite retroativa comparando registros com mesmo hash no banco.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Search, AlertTriangle, CheckCircle2, XCircle,
  Copy, Eye, RefreshCw, Download, Loader2
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

interface DupLog {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  lote_importacao_id: string | null;
  nome_arquivo: string | null;
  linha_excel: number | null;
  data_competencia: string | null;
  data_pagamento: string | null;
  ano_mes: string | null;
  valor: number;
  tipo_operacao: string | null;
  descricao: string | null;
  fornecedor: string | null;
  numero_documento: string | null;
  observacao: string | null;
  conta_bancaria_id: string | null;
  conta_nome: string | null;
  subcentro: string | null;
  macro_custo: string | null;
  centro_custo: string | null;
  hash_calculado: string | null;
  lancamento_existente_id: string | null;
  status_revisao: string;
  revisado_por: string | null;
  revisado_em: string | null;
  lancamento_inserido_id: string | null;
  observacao_revisao: string | null;
  created_at: string;
}

interface RetroRecord {
  grupo_hash: string;
  lancamento_id: string;
  data_pagamento: string | null;
  ano_mes: string | null;
  fazenda_id: string | null;
  conta_bancaria_id: string | null;
  tipo_operacao: string | null;
  valor: number;
  descricao: string | null;
  fornecedor_nome: string | null;
  numero_documento: string | null;
  observacao: string | null;
  subcentro: string | null;
  lote_importacao_id: string | null;
  created_at: string;
}

interface ExistingLanc {
  id: string;
  data_pagamento: string | null;
  ano_mes: string | null;
  valor: number;
  tipo_operacao: string | null;
  descricao: string | null;
  numero_documento: string | null;
  observacao: string | null;
  subcentro: string | null;
  created_at: string;
}

export function AuditoriaDuplicidadeTab({ onBack }: Props) {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [activeView, setActiveView] = useState<'log' | 'retro'>('log');
  const [loading, setLoading] = useState(false);

  // ── Log view state ──
  const [logs, setLogs] = useState<DupLog[]>([]);
  const [logFilter, setLogFilter] = useState({ status: 'all', search: '', anoMes: '' });
  const [selectedLog, setSelectedLog] = useState<DupLog | null>(null);
  const [existingLanc, setExistingLanc] = useState<ExistingLanc | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<'duplicado_real' | 'legitimo_inserido'>('duplicado_real');
  const [reviewObs, setReviewObs] = useState('');

  // ── Retro view state ──
  const [retroRecords, setRetroRecords] = useState<RetroRecord[]>([]);

  const cid = clienteAtual?.id;
  const fazendaMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fazendas) m.set(f.id, f.nome);
    return m;
  }, [fazendas]);

  // ── Load log data ──
  const loadLogs = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financeiro_duplicidade_log' as any)
      .select('*')
      .eq('cliente_id', cid)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('Error loading dup logs:', error);
      toast.error('Erro ao carregar log de duplicidades');
    }
    setLogs((data || []) as unknown as DupLog[]);
    setLoading(false);
  }, [cid]);

  // ── Load retro data ──
  const loadRetro = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('buscar_duplicados_retroativo', { _cliente_id: cid });
    if (error) {
      console.error('Error loading retro dups:', error);
      toast.error('Erro ao carregar auditoria retroativa');
    }
    setRetroRecords((data || []) as RetroRecord[]);
    setLoading(false);
  }, [cid]);

  useEffect(() => {
    if (activeView === 'log') loadLogs();
    else loadRetro();
  }, [activeView, loadLogs, loadRetro]);

  // ── Filtered logs ──
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (logFilter.status !== 'all') result = result.filter(l => l.status_revisao === logFilter.status);
    if (logFilter.anoMes) result = result.filter(l => l.ano_mes === logFilter.anoMes);
    if (logFilter.search) {
      const s = logFilter.search.toLowerCase();
      result = result.filter(l =>
        (l.descricao || '').toLowerCase().includes(s) ||
        (l.fornecedor || '').toLowerCase().includes(s) ||
        (l.numero_documento || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [logs, logFilter]);

  // ── Retro groups ──
  const retroGroups = useMemo(() => {
    const groups = new Map<string, RetroRecord[]>();
    for (const r of retroRecords) {
      const arr = groups.get(r.grupo_hash) || [];
      arr.push(r);
      groups.set(r.grupo_hash, arr);
    }
    return Array.from(groups.entries()).map(([hash, records]) => ({ hash, records }));
  }, [retroRecords]);

  // ── Stats ──
  const logStats = useMemo(() => {
    let pendente = 0, dupReal = 0, inserido = 0;
    for (const l of logs) {
      if (l.status_revisao === 'pendente') pendente++;
      else if (l.status_revisao === 'duplicado_real') dupReal++;
      else if (l.status_revisao === 'legitimo_inserido') inserido++;
    }
    return { pendente, dupReal, inserido, total: logs.length };
  }, [logs]);

  // ── View existing lancamento ──
  const viewExisting = async (log: DupLog) => {
    setSelectedLog(log);
    setExistingLanc(null);
    if (log.lancamento_existente_id) {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, ano_mes, valor, tipo_operacao, descricao, numero_documento, observacao, subcentro, created_at')
        .eq('id', log.lancamento_existente_id)
        .maybeSingle();
      setExistingLanc(data as ExistingLanc | null);
    }
  };

  // ── Review action ──
  const handleReview = async () => {
    if (!selectedLog) return;
    const { error } = await supabase
      .from('financeiro_duplicidade_log' as any)
      .update({
        status_revisao: reviewStatus,
        observacao_revisao: reviewObs || null,
        revisado_em: new Date().toISOString(),
        revisado_por: (await supabase.auth.getUser()).data.user?.id,
      } as any)
      .eq('id', selectedLog.id);
    if (error) {
      toast.error('Erro ao salvar revisão');
      return;
    }
    toast.success(reviewStatus === 'duplicado_real' ? 'Marcado como duplicado real' : 'Marcado para inserção');
    setReviewOpen(false);
    setSelectedLog(null);
    loadLogs();
  };

  // ── Export CSV ──
  const exportCSV = () => {
    const rows = filteredLogs;
    if (rows.length === 0) return;
    const header = 'Data,Ano/Mês,Fazenda,Valor,Tipo,Descrição,Fornecedor,Documento,Status,Arquivo,Hash';
    const lines = rows.map(r => [
      r.data_pagamento || '', r.ano_mes || '', fazendaMap.get(r.fazenda_id || '') || '',
      r.valor.toFixed(2), r.tipo_operacao || '', `"${(r.descricao || '').replace(/\"/g, '""')}"`,
      `"${(r.fornecedor || '').replace(/\"/g, '""')}"`, r.numero_documento || '',
      r.status_revisao, `"${(r.nome_arquivo || '').replace(/\"/g, '""')}"`, r.hash_calculado || ''
    ].join(','));
    const csv = '\uFEFF' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auditoria_duplicidade_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const statusBadge = (status: string) => {
    if (status === 'pendente') return <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">Pendente</Badge>;
    if (status === 'duplicado_real') return <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">Duplicado Real</Badge>;
    return <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">Legítimo</Badge>;
  };

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Auditoria de Duplicidade</h1>
            <p className="text-[10px] text-muted-foreground">Revisão de lançamentos sinalizados como duplicados</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeView} onValueChange={v => setActiveView(v as any)}>
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="log" className="text-xs">Log de Importações</TabsTrigger>
            <TabsTrigger value="retro" className="text-xs">Auditoria Retroativa</TabsTrigger>
          </TabsList>

          {/* ══════════ LOG VIEW ══════════ */}
          <TabsContent value="log" className="space-y-3 mt-3">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <Card className="cursor-pointer" onClick={() => setLogFilter(f => ({ ...f, status: 'all' }))}>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{logStats.total}</p>
                  <p className="text-[9px] text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer" onClick={() => setLogFilter(f => ({ ...f, status: 'pendente' }))}>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{logStats.pendente}</p>
                  <p className="text-[9px] text-muted-foreground">Pendentes</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer" onClick={() => setLogFilter(f => ({ ...f, status: 'duplicado_real' }))}>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-red-600">{logStats.dupReal}</p>
                  <p className="text-[9px] text-muted-foreground">Duplicados</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer" onClick={() => setLogFilter(f => ({ ...f, status: 'legitimo_inserido' }))}>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-green-600">{logStats.inserido}</p>
                  <p className="text-[9px] text-muted-foreground">Legítimos</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar descrição, fornecedor, documento..."
                  className="pl-7 h-8 text-xs"
                  value={logFilter.search}
                  onChange={e => setLogFilter(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <Input
                type="month"
                className="h-8 text-xs w-[140px]"
                value={logFilter.anoMes}
                onChange={e => setLogFilter(f => ({ ...f, anoMes: e.target.value }))}
              />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadLogs}>
                <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCSV}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nenhum registro de duplicidade encontrado.
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto max-h-[55vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Fazenda</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map(log => (
                      <TableRow key={log.id} className={log.status_revisao === 'pendente' ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                        <TableCell className="whitespace-nowrap">{log.data_pagamento || log.ano_mes}</TableCell>
                        <TableCell className="whitespace-nowrap">{fazendaMap.get(log.fazenda_id || '') || '—'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{log.descricao || '—'}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{log.fornecedor || '—'}</TableCell>
                        <TableCell>{log.numero_documento || '—'}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{formatMoeda(log.valor)}</TableCell>
                        <TableCell className="whitespace-nowrap">{log.tipo_operacao || '—'}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-[9px]">{log.nome_arquivo || '—'}</TableCell>
                        <TableCell>{statusBadge(log.status_revisao)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Comparar com existente"
                              onClick={() => viewExisting(log)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ══════════ RETRO VIEW ══════════ */}
          <TabsContent value="retro" className="space-y-3 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Grupos de lançamentos com mesmo hash no banco ({retroGroups.length} grupos, {retroRecords.length} registros)
              </p>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadRetro}>
                <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : retroGroups.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nenhum grupo de duplicados encontrado no banco.
              </div>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-auto">
                {retroGroups.map(group => (
                  <Card key={group.hash} className="border-amber-200 dark:border-amber-800">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Copy className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-[10px] font-mono text-muted-foreground">Hash: {group.hash?.slice(0, 12)}...</span>
                        <Badge variant="outline" className="text-[9px]">{group.records.length} registros</Badge>
                      </div>
                      <div className="rounded border overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Fazenda</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead>Fornecedor</TableHead>
                              <TableHead>Documento</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Importação</TableHead>
                              <TableHead>Criado em</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.records.map((r, i) => (
                              <TableRow key={r.lancamento_id} className={i === 0 ? 'bg-primary/5' : ''}>
                                <TableCell className="whitespace-nowrap">{r.data_pagamento || r.ano_mes}</TableCell>
                                <TableCell className="whitespace-nowrap">{fazendaMap.get(r.fazenda_id || '') || '—'}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{r.descricao || '—'}</TableCell>
                                <TableCell className="max-w-[140px] truncate">{r.fornecedor_nome || '—'}</TableCell>
                                <TableCell>{r.numero_documento || '—'}</TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">{formatMoeda(r.valor)}</TableCell>
                                <TableCell className="whitespace-nowrap">{r.tipo_operacao || '—'}</TableCell>
                                <TableCell className="text-[9px]">{r.lote_importacao_id ? 'Importado' : 'Manual'}</TableCell>
                                <TableCell className="text-[9px] whitespace-nowrap">{r.created_at ? format(new Date(r.created_at), 'dd/MM/yy HH:mm') : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ══════════ Comparison Dialog ══════════ */}
      <Dialog open={!!selectedLog} onOpenChange={v => { if (!v) { setSelectedLog(null); setExistingLanc(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Comparação de Duplicidade
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Imported (blocked) */}
                <Card className="border-amber-300 dark:border-amber-700">
                  <CardContent className="p-3 space-y-1.5">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">Lançamento Importado (bloqueado)</p>
                    <CompField label="Data" value={selectedLog.data_pagamento || selectedLog.ano_mes} />
                    <CompField label="Fazenda" value={fazendaMap.get(selectedLog.fazenda_id || '') || '—'} />
                    <CompField label="Descrição" value={selectedLog.descricao} />
                    <CompField label="Fornecedor" value={selectedLog.fornecedor} />
                    <CompField label="Documento" value={selectedLog.numero_documento} />
                    <CompField label="Valor" value={formatMoeda(selectedLog.valor)} />
                    <CompField label="Tipo" value={selectedLog.tipo_operacao} />
                    <CompField label="Subcentro" value={selectedLog.subcentro} />
                    <CompField label="Observação" value={selectedLog.observacao} />
                    <CompField label="Conta" value={selectedLog.conta_nome} />
                    <CompField label="Arquivo" value={selectedLog.nome_arquivo} />
                    <CompField label="Hash" value={selectedLog.hash_calculado} mono />
                  </CardContent>
                </Card>

                {/* Existing */}
                <Card className="border-primary/30">
                  <CardContent className="p-3 space-y-1.5">
                    <p className="text-xs font-bold text-primary uppercase">Lançamento Existente (que gerou match)</p>
                    {existingLanc ? (
                      <>
                        <CompField label="ID" value={existingLanc.id.slice(0, 8) + '...'} mono />
                        <CompField label="Data" value={existingLanc.data_pagamento || existingLanc.ano_mes} />
                        <CompField label="Descrição" value={existingLanc.descricao} />
                        <CompField label="Documento" value={existingLanc.numero_documento} />
                        <CompField label="Valor" value={formatMoeda(existingLanc.valor)} />
                        <CompField label="Tipo" value={existingLanc.tipo_operacao} />
                        <CompField label="Subcentro" value={existingLanc.subcentro} />
                        <CompField label="Observação" value={existingLanc.observacao} />
                        <CompField label="Criado" value={existingLanc.created_at ? format(new Date(existingLanc.created_at), 'dd/MM/yy HH:mm') : '—'} />
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        {selectedLog.lancamento_existente_id ? 'Carregando...' : 'Registro existente não rastreado'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Status atual:</span>
                {statusBadge(selectedLog.status_revisao)}
              </div>

              {/* Actions */}
              {selectedLog.status_revisao === 'pendente' && (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setReviewStatus('duplicado_real'); setReviewObs(''); setReviewOpen(true); }}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Duplicado Real
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setReviewStatus('legitimo_inserido'); setReviewObs(''); setReviewOpen(true); }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Legítimo — Inserir
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════ Review confirmation ══════════ */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {reviewStatus === 'duplicado_real' ? 'Confirmar como duplicado' : 'Confirmar como legítimo'}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Observação (opcional)..."
            className="text-xs"
            value={reviewObs}
            onChange={e => setReviewObs(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleReview}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[10px] text-right truncate max-w-[180px] ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}
