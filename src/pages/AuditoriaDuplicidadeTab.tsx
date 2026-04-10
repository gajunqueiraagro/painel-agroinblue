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
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, Search, AlertTriangle, CheckCircle2, XCircle,
  Copy, Eye, RefreshCw, Download, Loader2, Shield, Clock
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
  status_duplicidade?: string;
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

type RetroGroupStatus = 'pendente' | 'resolvido';

export function AuditoriaDuplicidadeTab({ onBack }: Props) {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [activeView, setActiveView] = useState<'log' | 'retro'>('log');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
  const [retroAnoMes, setRetroAnoMes] = useState('');
  const [selectedPrincipal, setSelectedPrincipal] = useState<Record<string, string>>({});
  const [retroConfirmOpen, setRetroConfirmOpen] = useState(false);
  const [retroConfirmAction, setRetroConfirmAction] = useState<{ hash: string; action: 'legitimo' | 'duplicado' | 'revisar' } | null>(null);
  const [retroConfirmObs, setRetroConfirmObs] = useState('');

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
    return Array.from(groups.entries()).map(([hash, records]) => {
      // Determine group status based on individual record statuses
      const allResolved = records.every(r =>
        r.status_duplicidade && r.status_duplicidade !== 'pendente'
      );
      const status: RetroGroupStatus = allResolved ? 'resolvido' : 'pendente';
      return { hash, records, status };
    });
  }, [retroRecords]);

  // ── Retro stats ──
  const retroStats = useMemo(() => {
    let pendente = 0, resolvido = 0;
    for (const g of retroGroups) {
      if (g.status === 'pendente') pendente++;
      else resolvido++;
    }
    return { total: retroGroups.length, pendente, resolvido, registros: retroRecords.length };
  }, [retroGroups, retroRecords]);

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

  // ── Review action (log view) ──
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

  // ══════════ RETRO GROUP ACTIONS ══════════

  const openRetroConfirm = (hash: string, action: 'legitimo' | 'duplicado' | 'revisar') => {
    if (action === 'duplicado') {
      const principal = selectedPrincipal[hash];
      if (!principal) {
        toast.error('Selecione qual registro é o principal antes de marcar duplicados.');
        return;
      }
    }
    setRetroConfirmAction({ hash, action });
    setRetroConfirmObs('');
    setRetroConfirmOpen(true);
  };

  const executeRetroAction = async () => {
    if (!retroConfirmAction || !cid) return;
    const { hash, action } = retroConfirmAction;
    const group = retroGroups.find(g => g.hash === hash);
    if (!group) return;

    setActionLoading(hash);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const ids = group.records.map(r => r.lancamento_id);

    try {
      if (action === 'legitimo') {
        // Mark all as legitimate
        const { error } = await supabase
          .from('financeiro_lancamentos_v2')
          .update({ status_duplicidade: 'legitimo' } as any)
          .in('id', ids);
        if (error) throw error;
        toast.success(`${ids.length} lançamentos marcados como legítimos`);

      } else if (action === 'duplicado') {
        const principalId = selectedPrincipal[hash];
        const duplicadoIds = ids.filter(id => id !== principalId);

        // Mark principal
        const { error: e1 } = await supabase
          .from('financeiro_lancamentos_v2')
          .update({ status_duplicidade: 'principal' } as any)
          .eq('id', principalId);
        if (e1) throw e1;

        // Mark duplicates with reference
        if (duplicadoIds.length > 0) {
          const { error: e2 } = await supabase
            .from('financeiro_lancamentos_v2')
            .update({
              status_duplicidade: 'duplicado',
              duplicado_de_id: principalId,
              cancelado: true,
              cancelado_em: new Date().toISOString(),
              cancelado_por: userId,
            } as any)
            .in('id', duplicadoIds);
          if (e2) throw e2;
        }

        toast.success(`1 principal + ${duplicadoIds.length} duplicados marcados (soft delete)`);

      } else if (action === 'revisar') {
        const { error } = await supabase
          .from('financeiro_lancamentos_v2')
          .update({ status_duplicidade: 'revisar' } as any)
          .in('id', ids);
        if (error) throw error;
        toast.success(`${ids.length} lançamentos marcados para revisão`);
      }

      // Cross-update financeiro_duplicidade_log if matching hash exists
      await supabase
        .from('financeiro_duplicidade_log' as any)
        .update({
          status_revisao: action === 'legitimo' ? 'legitimo_inserido' : action === 'duplicado' ? 'duplicado_real' : 'pendente',
          observacao_revisao: retroConfirmObs || `Decisão via auditoria retroativa: ${action}`,
          revisado_em: new Date().toISOString(),
          revisado_por: userId,
        } as any)
        .eq('cliente_id', cid)
        .eq('hash_calculado', hash);

    } catch (err: any) {
      console.error('Retro action error:', err);
      toast.error('Erro ao executar ação: ' + (err.message || ''));
    } finally {
      setActionLoading(null);
      setRetroConfirmOpen(false);
      setRetroConfirmAction(null);
      loadRetro();
    }
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
    if (status === 'duplicado_real' || status === 'duplicado') return <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">Duplicado</Badge>;
    if (status === 'principal') return <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">Principal</Badge>;
    if (status === 'revisar') return <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">Revisão</Badge>;
    if (status === 'legitimo' || status === 'legitimo_inserido') return <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">Legítimo</Badge>;
    return <Badge variant="outline" className="text-[9px]">{status}</Badge>;
  };

  const dupStatusBadge = (status?: string) => {
    if (!status || status === 'pendente') return <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">Pendente</Badge>;
    return statusBadge(status);
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
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{retroStats.total}</p>
                  <p className="text-[9px] text-muted-foreground">Grupos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{retroStats.pendente}</p>
                  <p className="text-[9px] text-muted-foreground">Pendentes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-green-600">{retroStats.resolvido}</p>
                  <p className="text-[9px] text-muted-foreground">Resolvidos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-muted-foreground">{retroStats.registros}</p>
                  <p className="text-[9px] text-muted-foreground">Registros</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Cada grupo contém lançamentos com mesmo hash. Decida por grupo.
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
              <div className="space-y-4 max-h-[55vh] overflow-auto">
                {retroGroups.map(group => {
                  const isLoading = actionLoading === group.hash;
                  const isPendente = group.status === 'pendente';
                  const principalId = selectedPrincipal[group.hash];

                  return (
                    <Card
                      key={group.hash}
                      className={
                        isPendente
                          ? 'border-amber-200 dark:border-amber-800'
                          : 'border-green-200 dark:border-green-800 opacity-80'
                      }
                    >
                      <CardContent className="p-3 space-y-3">
                        {/* Group header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Copy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="text-[10px] font-mono text-muted-foreground">Hash: {group.hash?.slice(0, 12)}...</span>
                            <Badge variant="outline" className="text-[9px]">{group.records.length} registros</Badge>
                            {!isPendente && (
                              <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                                Resolvido
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Records table */}
                        <div className="rounded border overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {isPendente && <TableHead className="w-[60px]">Principal</TableHead>}
                                <TableHead>Status</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Fazenda</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Fornecedor</TableHead>
                                <TableHead>Documento</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead>Criado em</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.records.map((r) => {
                                const isSelected = principalId === r.lancamento_id;
                                return (
                                  <TableRow
                                    key={r.lancamento_id}
                                    className={
                                      isSelected
                                        ? 'bg-blue-50/70 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                                        : ''
                                    }
                                  >
                                    {isPendente && (
                                      <TableCell>
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={(checked) => {
                                            setSelectedPrincipal(prev => ({
                                              ...prev,
                                              [group.hash]: checked ? r.lancamento_id : ''
                                            }));
                                          }}
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell>{dupStatusBadge(r.status_duplicidade)}</TableCell>
                                    <TableCell className="whitespace-nowrap">{r.data_pagamento || r.ano_mes}</TableCell>
                                    <TableCell className="whitespace-nowrap">{fazendaMap.get(r.fazenda_id || '') || '—'}</TableCell>
                                    <TableCell className="max-w-[180px] truncate">{r.descricao || '—'}</TableCell>
                                    <TableCell className="max-w-[130px] truncate">{r.fornecedor_nome || '—'}</TableCell>
                                    <TableCell>{r.numero_documento || '—'}</TableCell>
                                    <TableCell className="text-right font-mono whitespace-nowrap">{formatMoeda(r.valor)}</TableCell>
                                    <TableCell className="whitespace-nowrap">{r.tipo_operacao || '—'}</TableCell>
                                    <TableCell className="text-[9px]">{r.lote_importacao_id ? 'Importado' : 'Manual'}</TableCell>
                                    <TableCell className="text-[9px] whitespace-nowrap">{r.created_at ? format(new Date(r.created_at), 'dd/MM/yy HH:mm') : '—'}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Actions */}
                        {isPendente && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                              disabled={isLoading}
                              onClick={() => openRetroConfirm(group.hash, 'legitimo')}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Manter Todos (Legítimos)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                              disabled={isLoading || !principalId}
                              onClick={() => openRetroConfirm(group.hash, 'duplicado')}
                              title={!principalId ? 'Selecione o registro principal primeiro' : undefined}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Marcar Duplicados
                              {principalId && <span className="ml-1 opacity-70">({group.records.length - 1} dup)</span>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/30"
                              disabled={isLoading}
                              onClick={() => openRetroConfirm(group.hash, 'revisar')}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              Marcar para Revisão
                            </Button>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ══════════ Comparison Dialog (Log view) ══════════ */}
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Status atual:</span>
                {statusBadge(selectedLog.status_revisao)}
              </div>

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

      {/* ══════════ Review confirmation (Log view) ══════════ */}
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

      {/* ══════════ Retro Action Confirmation ══════════ */}
      <Dialog open={retroConfirmOpen} onOpenChange={setRetroConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {retroConfirmAction?.action === 'legitimo' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Confirmar: Todos Legítimos
                </>
              )}
              {retroConfirmAction?.action === 'duplicado' && (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  Confirmar: Marcar Duplicados
                </>
              )}
              {retroConfirmAction?.action === 'revisar' && (
                <>
                  <Clock className="h-4 w-4 text-purple-600" />
                  Confirmar: Marcar para Revisão
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {retroConfirmAction?.action === 'legitimo' && (
              <p className="text-xs text-muted-foreground">
                Todos os registros deste grupo serão marcados como <strong>legítimos</strong>.
                Nenhum dado será alterado ou excluído.
              </p>
            )}
            {retroConfirmAction?.action === 'duplicado' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  O registro selecionado será marcado como <strong>principal</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Os demais serão marcados como <strong>duplicados</strong> e receberão soft delete (cancelamento lógico).
                  Nenhum dado é apagado fisicamente.
                </p>
              </div>
            )}
            {retroConfirmAction?.action === 'revisar' && (
              <p className="text-xs text-muted-foreground">
                Todos os registros serão marcados para <strong>revisão futura</strong>.
                Nenhum dado financeiro será alterado.
              </p>
            )}

            <Textarea
              placeholder="Observação (opcional)..."
              className="text-xs"
              value={retroConfirmObs}
              onChange={e => setRetroConfirmObs(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRetroConfirmOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={executeRetroAction} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
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
