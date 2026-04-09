/**
 * Conferência de Importação Financeira
 * Tela intermediária com diagnóstico detalhado: dados originais × resolvidos × erros.
 */
import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Loader2,
  ChevronLeft, ChevronRight, Wrench, Download, Info,
} from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TIPOS_DOCUMENTO } from '@/lib/financeiro/documentoHelper';
import type { LinhaImportada } from '@/lib/financeiro/importParser';

// ── Types ──

type RowStatus = 'valid' | 'warning' | 'error';

interface FieldDiagnostic {
  campo: string;
  valorRecebido: string;
  motivo: string;
  tipo: 'error' | 'warning';
}

interface ValidationResult {
  status: RowStatus;
  errors: string[];
  warnings: string[];
  diagnostics: FieldDiagnostic[];
}

interface ResolvedInfo {
  contaResolvidaNome: string | null;
  contaDestinoResolvidaNome: string | null;
  subcentroResolvido: boolean;
  fazendaResolvidaNome: string | null;
}

interface EditableRow extends LinhaImportada {
  _validation: ValidationResult;
  _selected: boolean;
  _resolved: ResolvedInfo;
}

interface ContaOption {
  id: string;
  nome_conta: string;
  nome_exibicao?: string | null;
  codigo_conta?: string | null;
}

interface FazendaOption {
  id: string;
  nome: string;
  codigo: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  nomeArquivo: string;
  linhas: LinhaImportada[];
  contas: ContaOption[];
  fazendas: FazendaOption[];
  onConfirmar: (linhas: LinhaImportada[]) => Promise<boolean>;
}

const TIPOS_OPERACAO = ['1-Entradas', '2-Saídas', '3-Transferência'];
const PAGE_SIZE = 50;

// ── Validation with structured diagnostics ──

function validateRow(
  row: LinhaImportada,
  contaIds: Set<string>,
  contaLookup: Map<string, string>,
  fazendaLookup: Map<string, string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: FieldDiagnostic[] = [];

  // Fazenda
  if (!row.fazenda && !row.fazendaId) {
    errors.push('Fazenda obrigatória');
    diagnostics.push({ campo: 'Fazenda', valorRecebido: '(vazio)', motivo: 'Campo obrigatório não preenchido', tipo: 'error' });
  } else if (!row.fazendaId && row.fazenda) {
    errors.push(`Fazenda "${row.fazenda}" não encontrada`);
    diagnostics.push({ campo: 'Fazenda', valorRecebido: row.fazenda, motivo: 'Código não encontrado no cadastro de fazendas', tipo: 'error' });
  }

  // Valor
  if (row.valor === null || row.valor === undefined || isNaN(row.valor)) {
    errors.push('Valor obrigatório');
    diagnostics.push({ campo: 'Valor', valorRecebido: String(row.valor ?? '(vazio)'), motivo: 'Campo obrigatório: valor numérico esperado', tipo: 'error' });
  }

  // Tipo
  if (!row.tipoOperacao) {
    errors.push('Tipo obrigatório');
    diagnostics.push({ campo: 'Tipo', valorRecebido: '(vazio)', motivo: 'Tipo de operação não preenchido (1-Entradas, 2-Saídas, 3-Transferência)', tipo: 'error' });
  }

  // Conta
  if (!row.contaOrigem) {
    errors.push('Conta obrigatória');
    diagnostics.push({ campo: 'Conta', valorRecebido: '(vazio)', motivo: 'Conta bancária de origem obrigatória', tipo: 'error' });
  } else if (!contaLookup.has(row.contaOrigem.toLowerCase().trim())) {
    diagnostics.push({ campo: 'Conta', valorRecebido: row.contaOrigem, motivo: 'Não encontrada no cadastro de contas bancárias ativas', tipo: 'warning' });
  }

  // Transferência
  const isTransf = row.tipoOperacao?.toLowerCase().startsWith('3') || row.tipoOperacao?.toLowerCase().includes('transfer');
  if (isTransf) {
    if (!row.contaDestino) {
      errors.push('Conta Destino obrigatória para transferência');
      diagnostics.push({ campo: 'Conta_Destino', valorRecebido: '(vazio)', motivo: 'Transferências exigem conta destino preenchida', tipo: 'error' });
    } else {
      if (row.contaOrigem && row.contaDestino && row.contaOrigem.toLowerCase().trim() === row.contaDestino.toLowerCase().trim()) {
        errors.push('Conta origem e destino iguais');
        diagnostics.push({ campo: 'Conta_Destino', valorRecebido: row.contaDestino, motivo: `Conta destino é idêntica à origem: "${row.contaOrigem}"`, tipo: 'error' });
      }
      if (!contaLookup.has(row.contaDestino.toLowerCase().trim())) {
        diagnostics.push({ campo: 'Conta_Destino', valorRecebido: row.contaDestino, motivo: 'Não encontrada no cadastro de contas bancárias ativas', tipo: 'warning' });
      }
    }
  }

  // Tipo documento
  if (row.tipoDocumento) {
    const valid = (TIPOS_DOCUMENTO as readonly string[]).includes(row.tipoDocumento);
    if (!valid) {
      warnings.push(`Tipo documento "${row.tipoDocumento}" não reconhecido`);
      diagnostics.push({ campo: 'Tipo_Documento', valorRecebido: row.tipoDocumento, motivo: `Valores aceitos: ${TIPOS_DOCUMENTO.join(', ')}`, tipo: 'warning' });
    }
  }

  // Documento ambíguo — only warn if documentoOriginal has digits that couldn't be extracted
  if (row.documentoOriginal && row.tipoDocumento && !row.numeroDocumento && /\d/.test(row.documentoOriginal)) {
    warnings.push('Número do documento não pôde ser extraído com segurança');
    diagnostics.push({
      campo: 'Documento',
      valorRecebido: row.documentoOriginal,
      motivo: 'Tipo detectado mas número contém texto misturado — verifique manualmente',
      tipo: 'warning',
    });
  }

  // Competência
  if (!row.anoMes) {
    errors.push('Competência ausente');
    diagnostics.push({ campo: 'AnoMes', valorRecebido: '(vazio)', motivo: 'Competência (YYYY-MM) obrigatória', tipo: 'error' });
  }

  // Subcentro check
  if (row.subcentro) {
    // We do a soft warning — actual plano de contas validation is external
  }

  const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
  return { status, errors, warnings, diagnostics };
}

function resolveInfo(
  row: LinhaImportada,
  contaLookup: Map<string, string>,
  fazendaLookup: Map<string, string>,
): ResolvedInfo {
  const contaKey = row.contaOrigem?.toLowerCase().trim() || '';
  const contaDestKey = row.contaDestino?.toLowerCase().trim() || '';
  const fazKey = row.fazenda?.toLowerCase().trim() || '';
  return {
    contaResolvidaNome: contaLookup.get(contaKey) || null,
    contaDestinoResolvidaNome: contaLookup.get(contaDestKey) || null,
    subcentroResolvido: !!row.subcentro,
    fazendaResolvidaNome: fazendaLookup.get(fazKey) || null,
  };
}

// ── Component ──

export function ConferenciaImportacaoDialog({ open, onClose, nomeArquivo, linhas, contas, fazendas, onConfirmar }: Props) {
  const contaLookup = useMemo(() => {
    const m = new Map<string, string>();
    // Track codigo_conta uniqueness
    const codigoCount = new Map<string, number>();
    for (const c of contas) {
      if (c.codigo_conta) {
        const ck = c.codigo_conta.toLowerCase().trim();
        codigoCount.set(ck, (codigoCount.get(ck) || 0) + 1);
      }
    }
    for (const c of contas) {
      const label = c.nome_exibicao || c.nome_conta;
      // Primary key: nome_exibicao (what the user sees)
      const exibKey = (c.nome_exibicao || '').toLowerCase().trim();
      if (exibKey) m.set(exibKey, label);
      // Secondary key: codigo_conta ONLY if unique
      if (c.codigo_conta) {
        const ck = c.codigo_conta.toLowerCase().trim();
        if ((codigoCount.get(ck) || 0) <= 1 && ck) {
          m.set(ck, label);
        }
      }
    }
    return m;
  }, [contas]);

  const fazendaLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fazendas) {
      m.set(f.codigo.toLowerCase().trim(), f.nome);
    }
    return m;
  }, [fazendas]);

  const contaIds = useMemo(() => new Set(contas.map(c => c.id)), [contas]);

  const [rows, setRows] = useState<EditableRow[]>(() => initRows(linhas, contaIds, contaLookup, fazendaLookup));
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all');
  const [bulkOpen, setBulkOpen] = useState(false);

  const contaOptions = useMemo(
    () => contas
      .map(c => ({ value: c.nome_exibicao || c.nome_conta || c.id, label: c.nome_exibicao || c.nome_conta }))
      .filter(c => !!c.value),
    [contas],
  );
  const fazendaOptions = useMemo(
    () => fazendas
      .map(f => ({ value: f.codigo || f.id, label: `${f.codigo || f.id} — ${f.nome}` }))
      .filter(f => !!f.value),
    [fazendas],
  );

  const revalidate = useCallback((currentRows: EditableRow[]): EditableRow[] => {
    return currentRows.map(r => ({
      ...r,
      _validation: validateRow(r, contaIds, contaLookup, fazendaLookup),
      _resolved: resolveInfo(r, contaLookup, fazendaLookup),
    }));
  }, [contaIds, contaLookup, fazendaLookup]);

  // Stats
  const stats = useMemo(() => {
    let valid = 0, warning = 0, error = 0;
    for (const r of rows) {
      if (r._validation.status === 'valid') valid++;
      else if (r._validation.status === 'warning') warning++;
      else error++;
    }
    return { valid, warning, error, total: rows.length };
  }, [rows]);

  // Filtered + paginated
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter(r => r._validation.status === statusFilter);
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Edit a single cell
  const updateRow = (linha: number, field: keyof LinhaImportada, value: string | null) => {
    setRows(prev => {
      return prev.map(r => {
        if (r.linha !== linha) return r;
        const updated = { ...r, [field]: value };
        if (field === 'fazenda') {
          const faz = fazendas.find(f => f.codigo.toLowerCase().trim() === (value || '').toLowerCase().trim());
          updated.fazendaId = faz?.id || null;
        }
        updated._validation = validateRow(updated, contaIds, contaLookup, fazendaLookup);
        updated._resolved = resolveInfo(updated, contaLookup, fazendaLookup);
        return updated;
      });
    });
  };

  // Bulk actions
  const bulkSetContaDestino = (contaCodigo: string) => {
    setRows(prev => revalidate(prev.map(r => {
      const isTransf = r.tipoOperacao?.toLowerCase().startsWith('3') || r.tipoOperacao?.toLowerCase().includes('transfer');
      if (isTransf && !r.contaDestino) return { ...r, contaDestino: contaCodigo };
      return r;
    })));
    setBulkOpen(false);
  };

  const bulkSetTipoDocumento = (tipo: string) => {
    setRows(prev => revalidate(prev.map(r => ({ ...r, tipoDocumento: tipo }))));
    setBulkOpen(false);
  };

  const bulkClearNumeroDocumento = () => {
    setRows(prev => revalidate(prev.map(r => ({ ...r, numeroDocumento: null }))));
    setBulkOpen(false);
  };

  // Export errors as CSV
  const exportErrors = () => {
    const errorRows = rows.filter(r => r._validation.diagnostics.length > 0);
    if (errorRows.length === 0) return;
    const csvLines = ['Linha,Campo,Valor Original,Motivo,Tipo'];
    for (const r of errorRows) {
      for (const d of r._validation.diagnostics) {
        const escaped = (s: string) => `"${s.replace(/"/g, '""')}"`;
        csvLines.push(`${r.linha},${escaped(d.campo)},${escaped(d.valorRecebido)},${escaped(d.motivo)},${d.tipo}`);
      }
    }
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erros_importacao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = async (onlyValid: boolean) => {
    const toImport = onlyValid ? rows.filter(r => r._validation.status !== 'error') : rows;
    if (toImport.some(r => r._validation.status === 'error')) return;
    setImporting(true);
    const clean: LinhaImportada[] = toImport.map(({ _validation, _selected, _resolved, ...rest }) => rest);
    const ok = await onConfirmar(clean);
    setImporting(false);
    if (ok) onClose();
  };

  const hasErrors = stats.error > 0;

  // Error summary by field
  const errorSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      for (const d of r._validation.diagnostics) {
        if (d.tipo === 'error') map.set(d.campo, (map.get(d.campo) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[98vw] w-[98vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Conferência de Importação — Diagnóstico
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{nomeArquivo}</p>
        </DialogHeader>

        {/* Summary cards */}
        <div className="px-4 pb-2 shrink-0">
          <div className="grid grid-cols-4 gap-2">
            <SummaryCard label="Total" value={stats.total} color="text-foreground" bg="bg-muted" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
            <SummaryCard label="Válidas" value={stats.valid} color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setStatusFilter('valid')} active={statusFilter === 'valid'} />
            <SummaryCard label="Alertas" value={stats.warning} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" icon={<AlertTriangle className="h-3.5 w-3.5" />} onClick={() => setStatusFilter('warning')} active={statusFilter === 'warning'} />
            <SummaryCard label="Erros" value={stats.error} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setStatusFilter('error')} active={statusFilter === 'error'} />
          </div>
        </div>

        {/* Error summary by field */}
        {errorSummary.length > 0 && (
          <div className="px-4 pb-2 shrink-0 flex flex-wrap gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium self-center">Erros por campo:</span>
            {errorSummary.map(([campo, count]) => (
              <Badge key={campo} variant="destructive" className="text-[9px] h-5">
                {campo}: {count}
              </Badge>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 pb-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex gap-1.5">
            <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Wrench className="h-3.5 w-3.5 mr-1" /> Ações em massa
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Ações rápidas</p>
                {contaOptions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Definir Conta Destino (transferências sem conta):</p>
                    <Select onValueChange={v => bulkSetContaDestino(v)}>
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
                      <SelectContent>
                        {contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-muted-foreground">Alterar Tipo Documento em lote:</p>
                  <Select onValueChange={v => bulkSetTipoDocumento(v)}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecionar tipo..." /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start text-[11px] h-7" onClick={bulkClearNumeroDocumento}>
                  Limpar Número Documento (todos)
                </Button>
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" onClick={exportErrors} disabled={errorSummary.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar erros
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{filteredRows.length} linhas</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>{page + 1}/{totalPages}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Grid */}
        <TooltipProvider delayDuration={200}>
          <div className="flex-1 overflow-auto px-2 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="w-8">Ln</TableHead>
                  {/* Original columns */}
                  <TableHead className="w-16 bg-blue-50/50 dark:bg-blue-950/20">Data (orig)</TableHead>
                  <TableHead className="w-20 bg-blue-50/50 dark:bg-blue-950/20">Conta (orig)</TableHead>
                  <TableHead className="w-20 bg-blue-50/50 dark:bg-blue-950/20">Conta Dest. (orig)</TableHead>
                  <TableHead className="w-24 bg-blue-50/50 dark:bg-blue-950/20">Subcentro (orig)</TableHead>
                  <TableHead className="w-20 bg-blue-50/50 dark:bg-blue-950/20">Doc. Original</TableHead>
                  <TableHead className="w-16 bg-blue-50/50 dark:bg-blue-950/20 text-right">Valor (orig)</TableHead>
                  <TableHead className="w-20 bg-blue-50/50 dark:bg-blue-950/20">Produto (orig)</TableHead>
                  <TableHead className="w-20 bg-blue-50/50 dark:bg-blue-950/20">Fornecedor (orig)</TableHead>
                  {/* Resolved columns */}
                  <TableHead className="w-20 bg-green-50/50 dark:bg-green-950/20">Fazenda</TableHead>
                  <TableHead className="w-20 bg-green-50/50 dark:bg-green-950/20">Conta (sist.)</TableHead>
                  <TableHead className="w-20 bg-green-50/50 dark:bg-green-950/20">Conta Dest. (sist.)</TableHead>
                  <TableHead className="w-16 bg-green-50/50 dark:bg-green-950/20">Tipo Doc.</TableHead>
                  <TableHead className="w-16 bg-green-50/50 dark:bg-green-950/20">Nº Doc.</TableHead>
                  <TableHead className="w-20 bg-green-50/50 dark:bg-green-950/20">Tipo</TableHead>
                  <TableHead className="w-16 bg-green-50/50 dark:bg-green-950/20 text-right">Valor (sist.)</TableHead>
                  {/* Diagnostics */}
                  <TableHead className="min-w-[200px]">Diagnóstico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map(row => (
                  <ConferenciaRow
                    key={row.linha}
                    row={row}
                    contaOptions={contaOptions}
                    fazendaOptions={fazendaOptions}
                    onUpdate={updateRow}
                  />
                ))}
                {pagedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={18} className="text-center py-8 text-muted-foreground text-xs">
                      Nenhuma linha com este filtro
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {hasErrors && (
              <Button size="sm" onClick={() => handleImport(true)} disabled={importing || stats.valid + stats.warning === 0}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Importar apenas válidas ({stats.valid + stats.warning})
              </Button>
            )}
            <Button size="sm" onClick={() => handleImport(false)} disabled={importing || hasErrors}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Importar todas ({stats.total})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──

function SummaryCard({ label, value, color, bg, icon, onClick, active }: {
  label: string; value: number; color: string; bg: string; icon?: React.ReactNode; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg p-2 text-center transition-all ${bg} ${active ? 'ring-2 ring-primary ring-offset-1' : 'hover:opacity-80'}`}
    >
      <div className={`font-bold text-lg tabular-nums ${color} flex items-center justify-center gap-1`}>
        {icon}
        {value}
      </div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
    </button>
  );
}

function DiagnosticBadge({ d }: { d: FieldDiagnostic }) {
  const isErr = d.tipo === 'error';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-start gap-1 text-[9px] leading-tight px-1.5 py-0.5 rounded ${
          isErr
            ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        }`}>
          {isErr ? <XCircle className="h-3 w-3 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />}
          <span className="font-semibold">{d.campo}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
        <p><span className="font-semibold">Campo:</span> {d.campo}</p>
        <p><span className="font-semibold">Valor recebido:</span> <code className="bg-muted px-1 rounded text-[10px]">{d.valorRecebido}</code></p>
        <p><span className="font-semibold">Motivo:</span> {d.motivo}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ConferenciaRow({ row, contaOptions, fazendaOptions, onUpdate }: {
  row: EditableRow;
  contaOptions: { value: string; label: string }[];
  fazendaOptions: { value: string; label: string }[];
  onUpdate: (linha: number, field: keyof LinhaImportada, value: string | null) => void;
}) {
  const v = row._validation;
  const r = row._resolved;
  const bgClass = v.status === 'error' ? 'bg-red-50/60 dark:bg-red-950/20' : v.status === 'warning' ? 'bg-amber-50/60 dark:bg-amber-950/20' : '';
  const statusIcon = v.status === 'error'
    ? <XCircle className="h-3.5 w-3.5 text-red-500" />
    : v.status === 'warning'
      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;

  const origCellClass = 'py-0.5 text-[9px] text-muted-foreground font-mono bg-blue-50/30 dark:bg-blue-950/10';
  const resCellClass = 'py-0.5 text-[9px] font-medium bg-green-50/30 dark:bg-green-950/10';

  return (
    <TableRow className={bgClass}>
      <TableCell className="py-0.5">{statusIcon}</TableCell>
      <TableCell className="py-0.5 text-[10px] text-muted-foreground tabular-nums">{row.linha}</TableCell>

      {/* ── Original columns ── */}
      <TableCell className={origCellClass}>{row.dataPagamento || row.anoMes || '—'}</TableCell>
      <TableCell className={origCellClass}>{row.contaOrigem || '—'}</TableCell>
      <TableCell className={origCellClass}>{row.contaDestino || '—'}</TableCell>
      <TableCell className={origCellClass} title={row.subcentro || undefined}>{row.subcentro ? (row.subcentro.length > 20 ? row.subcentro.slice(0, 20) + '…' : row.subcentro) : '—'}</TableCell>
      <TableCell className={origCellClass} title={row.documentoOriginal || undefined}>{row.documentoOriginal || '—'}</TableCell>
      <TableCell className={`${origCellClass} text-right tabular-nums`}>{row.valor != null ? formatMoeda(row.valor) : '—'}</TableCell>
      <TableCell className={origCellClass}>{row.produto || '—'}</TableCell>
      <TableCell className={origCellClass}>{row.fornecedor || '—'}</TableCell>

      {/* ── Resolved columns ── */}
      <TableCell className={resCellClass}>
        <Select value={row.fazenda || ''} onValueChange={val => onUpdate(row.linha, 'fazenda', val || null)}>
          <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {fazendaOptions.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {r.fazendaResolvidaNome && <span className="text-[8px] text-green-600 block pl-1">✓ {r.fazendaResolvidaNome}</span>}
      </TableCell>
      <TableCell className={resCellClass}>
        <Select value={row.contaOrigem || ''} onValueChange={val => onUpdate(row.linha, 'contaOrigem', val || null)}>
          <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {r.contaResolvidaNome && <span className="text-[8px] text-green-600 block pl-1">✓ {r.contaResolvidaNome}</span>}
      </TableCell>
      <TableCell className={resCellClass}>
        <Select value={row.contaDestino || '__none__'} onValueChange={val => onUpdate(row.linha, 'contaDestino', val === '__none__' ? null : val)}>
          <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">— Nenhuma —</SelectItem>
            {contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {r.contaDestinoResolvidaNome && <span className="text-[8px] text-green-600 block pl-1">✓ {r.contaDestinoResolvidaNome}</span>}
      </TableCell>
      <TableCell className={resCellClass}>
        <span className="text-[9px]">{row.tipoDocumento || '—'}</span>
      </TableCell>
      <TableCell className={resCellClass}>
        <span className="text-[9px] tabular-nums">{row.numeroDocumento || '—'}</span>
      </TableCell>
      <TableCell className={resCellClass}>
        <Select value={row.tipoOperacao || ''} onValueChange={val => onUpdate(row.linha, 'tipoOperacao', val || null)}>
          <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_OPERACAO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className={`${resCellClass} text-right tabular-nums font-bold text-[10px]`}>
        {row.valor != null ? formatMoeda(row.valor) : '—'}
      </TableCell>

      {/* ── Diagnostics ── */}
      <TableCell className="py-0.5">
        {v.diagnostics.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {v.diagnostics.map((d, i) => (
              <DiagnosticBadge key={i} d={d} />
            ))}
          </div>
        ) : (
          <span className="text-[9px] text-green-600">✓ OK</span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Helpers ──

function initRows(
  linhas: LinhaImportada[],
  contaIds: Set<string>,
  contaLookup: Map<string, string>,
  fazendaLookup: Map<string, string>,
): EditableRow[] {
  return linhas.map(l => ({
    ...l,
    _validation: validateRow(l, contaIds, contaLookup, fazendaLookup),
    _selected: false,
    _resolved: resolveInfo(l, contaLookup, fazendaLookup),
  }));
}
