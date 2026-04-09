/**
 * Conferência de Importação Financeira
 * Tela intermediária para revisar, corrigir e validar lançamentos antes de salvar.
 */
import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Loader2,
  ChevronLeft, ChevronRight, Wrench, Filter,
} from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/financeiro/documentoHelper';
import type { LinhaImportada } from '@/lib/financeiro/importParser';

// ── Types ──

type RowStatus = 'valid' | 'warning' | 'error';

interface ValidationResult {
  status: RowStatus;
  errors: string[];
  warnings: string[];
}

interface EditableRow extends LinhaImportada {
  _validation: ValidationResult;
  _selected: boolean;
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

// ── Validation ──

function validateRow(row: LinhaImportada, contaIds: Set<string>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row.fazenda && !row.fazendaId) errors.push('Fazenda obrigatória');
  if (!row.fazendaId && row.fazenda) errors.push(`Fazenda "${row.fazenda}" não encontrada`);
  if (row.valor === null || row.valor === undefined || isNaN(row.valor)) errors.push('Valor obrigatório');
  if (!row.tipoOperacao) errors.push('Tipo obrigatório');
  if (!row.contaOrigem) errors.push('Conta obrigatória');

  const isTransf = row.tipoOperacao?.toLowerCase().startsWith('3') || row.tipoOperacao?.toLowerCase().includes('transfer');
  if (isTransf) {
    if (!row.contaDestino) errors.push('Conta Destino obrigatória para transferência');
    if (row.contaOrigem && row.contaDestino && row.contaOrigem.toLowerCase().trim() === row.contaDestino.toLowerCase().trim()) {
      errors.push('Conta origem e destino iguais');
    }
  }

  if (row.tipoDocumento) {
    const valid = (TIPOS_DOCUMENTO as readonly string[]).includes(row.tipoDocumento);
    if (!valid) warnings.push(`Tipo documento "${row.tipoDocumento}" não reconhecido`);
  }

  if (row.numeroDocumento && /[^\d]/.test(row.numeroDocumento)) {
    warnings.push('Número documento contém caracteres não numéricos');
  }

  if (!row.anoMes) errors.push('Competência ausente');

  const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
  return { status, errors, warnings };
}

// ── Component ──

export function ConferenciaImportacaoDialog({ open, onClose, nomeArquivo, linhas, contas, fazendas, onConfirmar }: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() => initRows(linhas, contas));
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all');
  const [bulkOpen, setBulkOpen] = useState(false);

  const contaIds = useMemo(() => new Set(contas.map(c => c.id)), [contas]);
  const contaOptions = useMemo(
    () => contas
      .map(c => ({ value: c.codigo_conta || c.nome_conta || c.id, label: c.nome_exibicao || c.nome_conta }))
      .filter(c => !!c.value),
    [contas],
  );
  const fazendaOptions = useMemo(
    () => fazendas
      .map(f => ({ value: f.codigo || f.id, label: `${f.codigo || f.id} — ${f.nome}` }))
      .filter(f => !!f.value),
    [fazendas],
  );

  // Revalidate all rows
  const revalidate = useCallback((currentRows: EditableRow[]): EditableRow[] => {
    return currentRows.map(r => ({ ...r, _validation: validateRow(r, contaIds) }));
  }, [contaIds]);

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
      const next = prev.map(r => {
        if (r.linha !== linha) return r;
        const updated = { ...r, [field]: value };
        // If fazenda changed, resolve fazendaId
        if (field === 'fazenda') {
          const faz = fazendas.find(f => f.codigo.toLowerCase().trim() === (value || '').toLowerCase().trim());
          updated.fazendaId = faz?.id || null;
        }
        updated._validation = validateRow(updated, contaIds);
        return updated;
      });
      return next;
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

  const bulkReplaceConta = (oldVal: string, newVal: string) => {
    setRows(prev => revalidate(prev.map(r => {
      if (r.contaOrigem?.toLowerCase().trim() === oldVal.toLowerCase().trim()) {
        return { ...r, contaOrigem: newVal };
      }
      return r;
    })));
  };

  const bulkSetTipoDocumento = (tipo: string) => {
    setRows(prev => revalidate(prev.map(r => ({ ...r, tipoDocumento: tipo }))));
    setBulkOpen(false);
  };

  const bulkClearNumeroDocumento = () => {
    setRows(prev => revalidate(prev.map(r => ({ ...r, numeroDocumento: null }))));
    setBulkOpen(false);
  };

  // Import
  const handleImport = async (onlyValid: boolean) => {
    const toImport = onlyValid ? rows.filter(r => r._validation.status !== 'error') : rows;
    if (toImport.some(r => r._validation.status === 'error')) return;

    setImporting(true);
    const clean: LinhaImportada[] = toImport.map(({ _validation, _selected, ...rest }) => rest);
    const ok = await onConfirmar(clean);
    setImporting(false);
    if (ok) onClose();
  };

  const hasErrors = stats.error > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Conferência de Importação
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
        <div className="flex-1 overflow-auto px-4 min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="w-10">Ln</TableHead>
                <TableHead className="w-24">Fazenda</TableHead>
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-24">Conta</TableHead>
                <TableHead className="w-24">Conta Dest.</TableHead>
                <TableHead className="w-20 text-right">Valor</TableHead>
                <TableHead className="w-24">Tipo Doc.</TableHead>
                <TableHead className="w-20">Nº Doc.</TableHead>
                <TableHead>Erro / Alerta</TableHead>
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
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-xs">
                    Nenhuma linha com este filtro
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

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

function ConferenciaRow({ row, contaOptions, fazendaOptions, onUpdate }: {
  row: EditableRow;
  contaOptions: { value: string; label: string }[];
  fazendaOptions: { value: string; label: string }[];
  onUpdate: (linha: number, field: keyof LinhaImportada, value: string | null) => void;
}) {
  const v = row._validation;
  const bgClass = v.status === 'error' ? 'bg-red-50/60 dark:bg-red-950/20' : v.status === 'warning' ? 'bg-amber-50/60 dark:bg-amber-950/20' : '';
  const statusIcon = v.status === 'error'
    ? <XCircle className="h-3.5 w-3.5 text-red-500" />
    : v.status === 'warning'
      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;

  const msgs = [...v.errors, ...v.warnings];

  return (
    <TableRow className={bgClass}>
      <TableCell className="py-0.5">{statusIcon}</TableCell>
      <TableCell className="py-0.5 text-[10px] text-muted-foreground tabular-nums">{row.linha}</TableCell>
      <TableCell className="py-0.5">
        <Select value={row.fazenda || ''} onValueChange={v => onUpdate(row.linha, 'fazenda', v || null)}>
          <SelectTrigger className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {fazendaOptions.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5">
        <Select value={row.tipoOperacao || ''} onValueChange={v => onUpdate(row.linha, 'tipoOperacao', v || null)}>
          <SelectTrigger className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_OPERACAO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5">
        <Select value={row.contaOrigem || ''} onValueChange={v => onUpdate(row.linha, 'contaOrigem', v || null)}>
          <SelectTrigger className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5">
        <Select value={row.contaDestino || '__none__'} onValueChange={v => onUpdate(row.linha, 'contaDestino', v === '__none__' ? null : v)}>
          <SelectTrigger className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">— Nenhuma —</SelectItem>
            {contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5 text-right tabular-nums text-[10px] font-bold">
        {row.valor != null ? formatMoeda(row.valor) : '—'}
      </TableCell>
      <TableCell className="py-0.5">
        <Select value={row.tipoDocumento || '__none__'} onValueChange={v => onUpdate(row.linha, 'tipoDocumento', v === '__none__' ? null : v)}>
          <SelectTrigger className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">— Nenhum —</SelectItem>
            {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5">
        <Input
          value={row.numeroDocumento || ''}
          onChange={e => onUpdate(row.linha, 'numeroDocumento', e.target.value || null)}
          className="h-6 text-[10px] px-1 border-0 bg-transparent shadow-none"
          placeholder="—"
        />
      </TableCell>
      <TableCell className="py-0.5">
        {msgs.length > 0 && (
          <div className="space-y-0.5">
            {msgs.map((m, i) => (
              <span key={i} className={`text-[9px] block leading-tight ${v.errors.includes(m) ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {m}
              </span>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Helpers ──

function initRows(linhas: LinhaImportada[], contas: ContaOption[]): EditableRow[] {
  const contaIds = new Set(contas.map(c => c.id));
  return linhas.map(l => ({
    ...l,
    _validation: validateRow(l, contaIds),
    _selected: false,
  }));
}
