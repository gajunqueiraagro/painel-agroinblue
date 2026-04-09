/**
 * Prévia Completa da Importação Financeira
 * Exibe todas as colunas do Excel com 3 camadas: original → interpretado → final.
 * Permite edição inline, filtros avançados e diagnóstico por linha.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Loader2,
  ChevronLeft, ChevronRight, Wrench, Download, Copy, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TIPOS_DOCUMENTO } from '@/lib/financeiro/documentoHelper';
import type { LinhaImportada } from '@/lib/financeiro/importParser';

// ── Types ──

type RowStatus = 'valid' | 'warning' | 'error' | 'duplicated';
type StatusFilter = 'all' | 'valid' | 'error' | 'warning' | 'duplicated'
  | 'fornecedor_vazio' | 'valor_negativo' | 'conta_nao_encontrada' | 'subcentro_nao_encontrado' | 'fazenda_nao_encontrada';

interface FieldDiagnostic {
  campo: string;
  valorRecebido: string;
  motivo: string;
  tipo: 'error' | 'warning' | 'info';
  categoria?: 'conta' | 'fazenda' | 'transferencia' | 'documento' | 'duplicidade' | 'outros';
}

interface ValidationResult {
  status: RowStatus;
  errors: string[];
  warnings: string[];
  diagnostics: FieldDiagnostic[];
}

interface ResolvedInfo {
  contaResolvidaNome: string | null;
  contaResolvidaId: string | null;
  contaDestinoResolvidaNome: string | null;
  contaDestinoResolvidaId: string | null;
  subcentroResolvido: boolean;
  fazendaResolvidaNome: string | null;
  fornecedorResolvido: string | null;
}

interface EditableRow extends LinhaImportada {
  _validation: ValidationResult;
  _resolved: ResolvedInfo;
  _isDuplicate: boolean;
}

interface ContaOption { id: string; nome_conta: string; nome_exibicao?: string | null; codigo_conta?: string | null; }
interface FazendaOption { id: string; nome: string; codigo: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  nomeArquivo: string;
  linhas: LinhaImportada[];
  excelHeaders: string[];
  contas: ContaOption[];
  fazendas: FazendaOption[];
  clienteId?: string;
  onConfirmar: (linhas: LinhaImportada[]) => Promise<boolean>;
}

const TIPOS_OPERACAO = ['1-Entradas', '2-Saídas', '3-Transferência'];
const PAGE_SIZE = 50;

// ── Helpers ──

function normalizeImportText(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

interface ContaResolved { label: string; id: string; }

function buildContaLookup(contas: ContaOption[]): Map<string, ContaResolved> {
  const m = new Map<string, ContaResolved>();
  const codigoCount = new Map<string, number>();
  for (const c of contas) {
    if (c.codigo_conta) {
      const ck = normalizeImportText(c.codigo_conta);
      codigoCount.set(ck, (codigoCount.get(ck) || 0) + 1);
    }
  }
  for (const c of contas) {
    const label = c.nome_exibicao || c.nome_conta;
    const resolved = { label, id: c.id };
    const exibKey = normalizeImportText(c.nome_exibicao);
    if (exibKey) m.set(exibKey, resolved);
    if (c.codigo_conta) {
      const ck = normalizeImportText(c.codigo_conta);
      if ((codigoCount.get(ck) || 0) <= 1 && ck) m.set(ck, resolved);
    }
  }
  return m;
}

function buildHashImportacao(
  clienteId: string, fazendaId: string, dataPagamento: string | null, valor: number,
  tipoOperacao: string | null, contaBancariaId: string | null,
  numeroDocumento?: string | null, descricao?: string | null, observacao?: string | null,
): string {
  return [clienteId, fazendaId, (dataPagamento || '').trim(), valor.toFixed(2),
    (tipoOperacao || '').trim().toLowerCase(), contaBancariaId || '',
    normalizeImportText(numeroDocumento), normalizeImportText(descricao), normalizeImportText(observacao),
  ].join('|');
}

function isTransf(tipo: string | null): boolean {
  if (!tipo) return false;
  const t = tipo.toLowerCase();
  return t.startsWith('3') || t.includes('transfer') || t.includes('resgate') || t.includes('aplicaç');
}

function validateRow(row: LinhaImportada, contaLookup: Map<string, ContaResolved>, fazendaLookup: Map<string, string>, isDuplicate: boolean): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: FieldDiagnostic[] = [];

  if (isDuplicate) {
    warnings.push('Lançamento duplicado detectado');
    diagnostics.push({ campo: 'Duplicidade', valorRecebido: `${row.dataPagamento || row.anoMes} | ${row.valor} | ${row.tipoOperacao}`, motivo: 'Já existe um lançamento com mesma data, valor, tipo e conta na base.', tipo: 'warning', categoria: 'duplicidade' });
  }

  if (!row.fazenda && !row.fazendaId) {
    errors.push('Fazenda obrigatória');
    diagnostics.push({ campo: 'Fazenda', valorRecebido: '(vazio)', motivo: 'Campo obrigatório não preenchido', tipo: 'error', categoria: 'fazenda' });
  } else if (!row.fazendaId && row.fazenda) {
    errors.push(`Fazenda "${row.fazenda}" não encontrada`);
    diagnostics.push({ campo: 'Fazenda', valorRecebido: row.fazenda, motivo: 'Código não encontrado no cadastro', tipo: 'error', categoria: 'fazenda' });
  }

  if (row.valor === null || row.valor === undefined || isNaN(row.valor)) {
    errors.push('Valor obrigatório');
    diagnostics.push({ campo: 'Valor', valorRecebido: String(row.valor ?? '(vazio)'), motivo: 'Campo obrigatório', tipo: 'error', categoria: 'outros' });
  } else if (row.valor < 0) {
    warnings.push('Valor negativo');
    diagnostics.push({ campo: 'Valor', valorRecebido: String(row.valor), motivo: 'O sistema aplica o sinal conforme o tipo. Converta para positivo.', tipo: 'warning', categoria: 'outros' });
  }

  if (!row.tipoOperacao) {
    errors.push('Tipo obrigatório');
    diagnostics.push({ campo: 'Tipo', valorRecebido: '(vazio)', motivo: 'Tipo de operação não preenchido', tipo: 'error', categoria: 'outros' });
  }

  const contaKey = normalizeImportText(row.contaOrigem);
  const contaResolved = contaKey ? contaLookup.get(contaKey) : null;
  if (!row.contaOrigem) {
    errors.push('Conta obrigatória');
    diagnostics.push({ campo: 'Conta', valorRecebido: '(vazio)', motivo: 'Conta bancária obrigatória', tipo: 'error', categoria: 'conta' });
  } else if (!contaResolved) {
    errors.push(`Conta "${row.contaOrigem}" não reconhecida`);
    diagnostics.push({ campo: 'Conta', valorRecebido: row.contaOrigem, motivo: 'Não encontrada no cadastro', tipo: 'error', categoria: 'conta' });
  }

  const ehTransf = isTransf(row.tipoOperacao);
  if (ehTransf) {
    const contaDestKey = normalizeImportText(row.contaDestino);
    const contaDestResolved = contaDestKey ? contaLookup.get(contaDestKey) : null;
    if (!row.contaDestino) {
      errors.push('Conta Destino obrigatória para transferência');
      diagnostics.push({ campo: 'Conta_Destino', valorRecebido: '(vazio)', motivo: 'Transferências exigem conta destino', tipo: 'error', categoria: 'transferencia' });
    } else if (!contaDestResolved) {
      errors.push(`Conta destino "${row.contaDestino}" não reconhecida`);
      diagnostics.push({ campo: 'Conta_Destino', valorRecebido: row.contaDestino, motivo: 'Não encontrada no cadastro', tipo: 'error', categoria: 'transferencia' });
    } else if (contaResolved && contaDestResolved && contaResolved.id === contaDestResolved.id) {
      errors.push('Conta origem e destino iguais');
      diagnostics.push({ campo: 'Conta_Destino', valorRecebido: row.contaDestino, motivo: `Mesma conta: "${contaResolved.label}"`, tipo: 'error', categoria: 'transferencia' });
    }
  }

  if (row.tipoDocumento) {
    const valid = (TIPOS_DOCUMENTO as readonly string[]).includes(row.tipoDocumento);
    if (!valid) {
      warnings.push(`Tipo documento "${row.tipoDocumento}" não reconhecido`);
      diagnostics.push({ campo: 'Tipo_Documento', valorRecebido: row.tipoDocumento, motivo: `Valores aceitos: ${TIPOS_DOCUMENTO.join(', ')}`, tipo: 'warning', categoria: 'documento' });
    }
  }

  if (!row.anoMes) {
    errors.push('Competência ausente');
    diagnostics.push({ campo: 'AnoMes', valorRecebido: '(vazio)', motivo: 'Competência (YYYY-MM) obrigatória', tipo: 'error', categoria: 'outros' });
  }

  let status: RowStatus;
  if (errors.length > 0) status = 'error';
  else if (isDuplicate) status = 'duplicated';
  else if (warnings.length > 0) status = 'warning';
  else status = 'valid';

  return { status, errors, warnings, diagnostics };
}

function resolveInfo(row: LinhaImportada, contaLookup: Map<string, ContaResolved>, fazendaLookup: Map<string, string>): ResolvedInfo {
  const contaKey = normalizeImportText(row.contaOrigem);
  const contaDestKey = normalizeImportText(row.contaDestino);
  const fazKey = (row.fazenda || '').toLowerCase().trim();
  const contaR = contaKey ? contaLookup.get(contaKey) : null;
  const contaDestR = contaDestKey ? contaLookup.get(contaDestKey) : null;
  return {
    contaResolvidaNome: contaR?.label || null,
    contaResolvidaId: contaR?.id || null,
    contaDestinoResolvidaNome: contaDestR?.label || null,
    contaDestinoResolvidaId: contaDestR?.id || null,
    subcentroResolvido: !!row.subcentro,
    fazendaResolvidaNome: fazendaLookup.get(fazKey) || null,
    fornecedorResolvido: row.fornecedor || null,
  };
}

// ── Resolved columns definition ──

const RESOLVED_COLS = [
  { key: 'fazendaRes', label: 'Fazenda ✓', editable: 'fazenda' as const },
  { key: 'contaRes', label: 'Conta ✓', editable: 'contaOrigem' as const },
  { key: 'contaDestRes', label: 'Conta Dest. ✓', editable: 'contaDestino' as const },
  { key: 'fornecedorRes', label: 'Fornecedor ✓', editable: 'fornecedor' as const },
  { key: 'subcentroRes', label: 'Subcentro ✓', editable: 'subcentro' as const },
  { key: 'tipoDocRes', label: 'Tipo Doc. ✓', editable: 'tipoDocumento' as const },
  { key: 'numDocRes', label: 'Nº Doc. ✓', editable: 'numeroDocumento' as const },
  { key: 'valorFinal', label: 'Valor Final', editable: null },
  { key: 'statusValidacao', label: 'Status', editable: null },
] as const;

// ── FILTER_LABELS ──

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  valid: 'Válidas',
  warning: 'Alertas',
  error: 'Erros',
  duplicated: 'Duplicadas',
  fornecedor_vazio: 'Fornecedor vazio',
  valor_negativo: 'Valor negativo',
  conta_nao_encontrada: 'Conta não encontrada',
  subcentro_nao_encontrado: 'Subcentro vazio',
  fazenda_nao_encontrada: 'Fazenda não encontrada',
};

// ── Component ──

export function ConferenciaImportacaoDialog({ open, onClose, nomeArquivo, linhas, excelHeaders, contas, fazendas, clienteId, onConfirmar }: Props) {
  const contaLookup = useMemo(() => buildContaLookup(contas), [contas]);
  const fazendaLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fazendas) m.set(f.codigo.toLowerCase().trim(), f.nome);
    return m;
  }, [fazendas]);

  const [existingHashes, setExistingHashes] = useState<Set<string> | null>(null);
  const [loadingHashes, setLoadingHashes] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);

  useEffect(() => {
    if (!open || !clienteId) { setExistingHashes(new Set()); return; }
    let cancelled = false;
    const fetchHashes = async () => {
      setLoadingHashes(true);
      const hashes = new Set<string>();
      const fazendaIds = [...new Set(linhas.map(l => l.fazendaId).filter(Boolean))] as string[];
      for (const fid of fazendaIds) {
        let from = 0;
        const batchSize = 1000;
        while (!cancelled) {
          const { data } = await supabase
            .from('financeiro_lancamentos_v2')
            .select('data_pagamento, valor, tipo_operacao, conta_bancaria_id, numero_documento, descricao, observacao')
            .eq('fazenda_id', fid).eq('cliente_id', clienteId).eq('cancelado', false)
            .range(from, from + batchSize - 1);
          if (!data || data.length === 0) break;
          for (const e of data) {
            hashes.add(buildHashImportacao(clienteId, fid, e.data_pagamento, e.valor, e.tipo_operacao, e.conta_bancaria_id, e.numero_documento, e.descricao, e.observacao));
          }
          if (data.length < batchSize) break;
          from += batchSize;
        }
      }
      if (!cancelled) { setExistingHashes(hashes); setLoadingHashes(false); }
    };
    fetchHashes();
    return () => { cancelled = true; };
  }, [open, clienteId, linhas]);

  const checkDuplicate = useCallback((row: LinhaImportada, allRows: LinhaImportada[], existingH: Set<string>): boolean => {
    if (!clienteId || !existingH) return false;
    const contaKey = normalizeImportText(row.contaOrigem);
    const contaR = contaKey ? contaLookup.get(contaKey) : null;
    const hash = buildHashImportacao(clienteId, row.fazendaId || '', row.dataPagamento || '', row.valor, row.tipoOperacao, contaR?.id || null, row.numeroDocumento, row.produto, row.obs);
    if (existingH.has(hash)) return true;
    for (const sibling of allRows) {
      if (sibling.linha >= row.linha) break;
      const sContaKey = normalizeImportText(sibling.contaOrigem);
      const sContaR = sContaKey ? contaLookup.get(sContaKey) : null;
      const sHash = buildHashImportacao(clienteId, sibling.fazendaId || '', sibling.dataPagamento || '', sibling.valor, sibling.tipoOperacao, sContaR?.id || null, sibling.numeroDocumento, sibling.produto, sibling.obs);
      if (sHash === hash) return true;
    }
    return false;
  }, [clienteId, contaLookup]);

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    if (!existingHashes) return;
    setRows(linhas.map(l => {
      const isDup = checkDuplicate(l, linhas, existingHashes);
      return { ...l, _validation: validateRow(l, contaLookup, fazendaLookup, isDup), _resolved: resolveInfo(l, contaLookup, fazendaLookup), _isDuplicate: isDup };
    }));
  }, [linhas, existingHashes, contaLookup, fazendaLookup, checkDuplicate]);

  const contaOptions = useMemo(() => contas.map(c => ({ value: c.nome_exibicao || c.nome_conta || c.id, label: c.nome_exibicao || c.nome_conta })).filter(c => !!c.value), [contas]);
  const fazendaOptions = useMemo(() => fazendas.map(f => ({ value: f.codigo || f.id, label: `${f.codigo} — ${f.nome}` })).filter(f => !!f.value), [fazendas]);

  const revalidateRows = useCallback((currentRows: EditableRow[]): EditableRow[] => {
    if (!existingHashes) return currentRows;
    return currentRows.map(r => {
      const isDup = checkDuplicate(r, currentRows, existingHashes);
      return { ...r, _validation: validateRow(r, contaLookup, fazendaLookup, isDup), _resolved: resolveInfo(r, contaLookup, fazendaLookup), _isDuplicate: isDup };
    });
  }, [contaLookup, fazendaLookup, existingHashes, checkDuplicate]);

  // Stats
  const stats = useMemo(() => {
    let valid = 0, warning = 0, error = 0, duplicated = 0;
    let fornecedorVazio = 0, valorNegativo = 0, contaNaoEncontrada = 0, subcentroVazio = 0, fazendaNaoEncontrada = 0;
    for (const r of rows) {
      if (r._validation.status === 'valid') valid++;
      else if (r._validation.status === 'duplicated') duplicated++;
      else if (r._validation.status === 'warning') warning++;
      else error++;
      if (!r.fornecedor) fornecedorVazio++;
      if (r.valor < 0) valorNegativo++;
      if (r.contaOrigem && !r._resolved.contaResolvidaId) contaNaoEncontrada++;
      if (!r.subcentro) subcentroVazio++;
      if (r.fazenda && !r.fazendaId) fazendaNaoEncontrada++;
    }
    return { valid, warning, error, duplicated, total: rows.length, fornecedorVazio, valorNegativo, contaNaoEncontrada, subcentroVazio, fazendaNaoEncontrada };
  }, [rows]);

  // Filter
  const filteredRows = useMemo(() => {
    switch (statusFilter) {
      case 'all': return rows;
      case 'valid': return rows.filter(r => r._validation.status === 'valid');
      case 'error': return rows.filter(r => r._validation.status === 'error');
      case 'warning': return rows.filter(r => r._validation.status === 'warning');
      case 'duplicated': return rows.filter(r => r._validation.status === 'duplicated');
      case 'fornecedor_vazio': return rows.filter(r => !r.fornecedor);
      case 'valor_negativo': return rows.filter(r => r.valor < 0);
      case 'conta_nao_encontrada': return rows.filter(r => r.contaOrigem && !r._resolved.contaResolvidaId);
      case 'subcentro_nao_encontrado': return rows.filter(r => !r.subcentro);
      case 'fazenda_nao_encontrada': return rows.filter(r => r.fazenda && !r.fazendaId);
      default: return rows;
    }
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Edit
  const updateRow = (linha: number, field: keyof LinhaImportada, value: string | number | null) => {
    setRows(prev => {
      const nextRows = prev.map(r => {
        if (r.linha !== linha) return r;
        const updated = { ...r, [field]: value };
        if (field === 'fazenda') {
          const faz = fazendas.find(f => f.codigo.toLowerCase().trim() === (String(value) || '').toLowerCase().trim());
          updated.fazendaId = faz?.id || null;
        }
        return updated;
      });
      if (!existingHashes) return nextRows;
      return nextRows.map(r => {
        const isDup = checkDuplicate(r, nextRows, existingHashes);
        return { ...r, _validation: validateRow(r, contaLookup, fazendaLookup, isDup), _resolved: resolveInfo(r, contaLookup, fazendaLookup), _isDuplicate: isDup };
      });
    });
  };

  // Bulk actions
  const bulkFixNegativeValues = () => { setRows(prev => revalidateRows(prev.map(r => r.valor < 0 ? { ...r, valor: Math.abs(r.valor) } : r))); setBulkOpen(false); };
  const bulkSetContaDestino = (v: string) => { setRows(prev => revalidateRows(prev.map(r => isTransf(r.tipoOperacao) && !r.contaDestino ? { ...r, contaDestino: v } : r))); setBulkOpen(false); };
  const bulkSetTipoDocumento = (v: string) => { setRows(prev => revalidateRows(prev.map(r => ({ ...r, tipoDocumento: v })))); setBulkOpen(false); };
  const bulkClearNumeroDocumento = () => { setRows(prev => revalidateRows(prev.map(r => ({ ...r, numeroDocumento: null })))); setBulkOpen(false); };

  const negativeCount = useMemo(() => rows.filter(r => r.valor < 0).length, [rows]);

  // Export errors
  const exportErrors = () => {
    const errorRows = rows.filter(r => r._validation.diagnostics.length > 0);
    if (errorRows.length === 0) return;
    const csvLines = ['Linha,Campo,Valor Original,Motivo,Tipo,Categoria'];
    for (const r of errorRows) {
      for (const d of r._validation.diagnostics) {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        csvLines.push(`${r.linha},${esc(d.campo)},${esc(d.valorRecebido)},${esc(d.motivo)},${d.tipo},${d.categoria || 'outros'}`);
      }
    }
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `erros_importacao_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = async (onlyValid: boolean) => {
    const toImport = onlyValid ? rows.filter(r => r._validation.status !== 'error') : rows;
    if (toImport.some(r => r._validation.status === 'error')) return;
    setImporting(true);
    const clean: LinhaImportada[] = toImport.map(({ _validation, _resolved, _isDuplicate, ...rest }) => rest);
    const ok = await onConfirmar(clean);
    setImporting(false);
    if (ok) onClose();
  };

  const hasBlockingErrors = stats.error > 0;
  const importableCount = stats.valid + stats.warning + stats.duplicated;
  const isLoading = loadingHashes || existingHashes === null;

  // Excel headers to show (filter out Tipo_Registro which is always LANCAMENTO at this point)
  const visibleExcelHeaders = useMemo(() => excelHeaders.filter(h => h && h !== ''), [excelHeaders]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[98vw] w-[98vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Prévia Completa da Importação
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{nomeArquivo} — {stats.total} lançamentos</p>
        </DialogHeader>

        {isLoading && (
          <div className="px-4 pb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando duplicidades...
          </div>
        )}

        {/* Negative values banner */}
        {!isLoading && negativeCount > 0 && (
          <div className="px-4 pb-2 shrink-0">
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-300">
                <strong>{negativeCount}</strong> valor(es) negativo(s). O sistema aplica o sinal automaticamente.
              </span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] ml-auto" onClick={bulkFixNegativeValues}>
                Converter todos para positivo
              </Button>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="px-4 pb-2 shrink-0">
          <div className="grid grid-cols-5 gap-1.5">
            <SummaryCard label="Total" value={stats.total} color="text-foreground" bg="bg-muted" onClick={() => { setStatusFilter('all'); setPage(0); }} active={statusFilter === 'all'} />
            <SummaryCard label="Válidas" value={stats.valid} color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" icon={<CheckCircle2 className="h-3 w-3" />} onClick={() => { setStatusFilter('valid'); setPage(0); }} active={statusFilter === 'valid'} />
            <SummaryCard label="Alertas" value={stats.warning} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" icon={<AlertTriangle className="h-3 w-3" />} onClick={() => { setStatusFilter('warning'); setPage(0); }} active={statusFilter === 'warning'} />
            <SummaryCard label="Duplicadas" value={stats.duplicated} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-950/30" icon={<Copy className="h-3 w-3" />} onClick={() => { setStatusFilter('duplicated'); setPage(0); }} active={statusFilter === 'duplicated'} />
            <SummaryCard label="Erros" value={stats.error} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" icon={<XCircle className="h-3 w-3" />} onClick={() => { setStatusFilter('error'); setPage(0); }} active={statusFilter === 'error'} />
          </div>
        </div>

        {/* Filter chips */}
        <div className="px-4 pb-2 shrink-0 flex flex-wrap gap-1">
          {([
            { key: 'fornecedor_vazio' as StatusFilter, count: stats.fornecedorVazio },
            { key: 'valor_negativo' as StatusFilter, count: stats.valorNegativo },
            { key: 'conta_nao_encontrada' as StatusFilter, count: stats.contaNaoEncontrada },
            { key: 'subcentro_nao_encontrado' as StatusFilter, count: stats.subcentroVazio },
            { key: 'fazenda_nao_encontrada' as StatusFilter, count: stats.fazendaNaoEncontrada },
          ]).filter(f => f.count > 0).map(f => (
            <Badge
              key={f.key}
              variant={statusFilter === f.key ? 'default' : 'outline'}
              className="text-[9px] h-5 cursor-pointer"
              onClick={() => { setStatusFilter(statusFilter === f.key ? 'all' : f.key); setPage(0); }}
            >
              {FILTER_LABELS[f.key]}: {f.count}
            </Badge>
          ))}
        </div>

        {/* Toolbar */}
        <div className="px-4 pb-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex gap-1.5">
            <Button variant={showOriginal ? 'default' : 'outline'} size="sm" className="h-7 text-[10px]" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              {showOriginal ? 'Ocultar Excel' : 'Mostrar Excel'}
            </Button>
            <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px]">
                  <Wrench className="h-3 w-3 mr-1" /> Ações em massa
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2 space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Ações rápidas</p>
                {contaOptions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Conta Destino (transferências):</p>
                    <Select onValueChange={bulkSetContaDestino}>
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>{contaOptions.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-muted-foreground">Tipo Documento em lote:</p>
                  <Select onValueChange={bulkSetTipoDocumento}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>{TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start text-[11px] h-7" onClick={bulkClearNumeroDocumento}>
                  Limpar Nº Documento (todos)
                </Button>
                {negativeCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full justify-start text-[11px] h-7 text-amber-600" onClick={bulkFixNegativeValues}>
                    ⚠ Converter {negativeCount} negativo(s) → positivo
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportErrors} disabled={stats.error === 0 && stats.warning === 0}>
              <Download className="h-3 w-3 mr-1" /> Exportar erros
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
          <div className="flex-1 overflow-auto px-1 min-h-0">
            <table className="w-full text-[9px] border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-6 sticky left-0 bg-background z-20">#</th>
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-6">Ln</th>

                  {/* Excel original columns */}
                  {showOriginal && visibleExcelHeaders.map(h => (
                    <th key={`orig-${h}`} className="px-1.5 py-1.5 text-left font-semibold bg-blue-50/60 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 whitespace-nowrap min-w-[60px]">
                      {h}
                    </th>
                  ))}

                  {/* Separator */}
                  {showOriginal && <th className="w-1 bg-border" />}

                  {/* Resolved / system columns */}
                  {RESOLVED_COLS.map(c => (
                    <th key={c.key} className="px-1.5 py-1.5 text-left font-semibold bg-green-50/60 dark:bg-green-950/20 text-green-800 dark:text-green-300 whitespace-nowrap min-w-[70px]">
                      {c.label}
                    </th>
                  ))}

                  {/* Diagnostics */}
                  <th className="px-1.5 py-1.5 text-left font-semibold min-w-[180px]">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(row => (
                  <PreviewRow
                    key={row.linha}
                    row={row}
                    showOriginal={showOriginal}
                    excelHeaders={visibleExcelHeaders}
                    contaOptions={contaOptions}
                    fazendaOptions={fazendaOptions}
                    onUpdate={updateRow}
                  />
                ))}
                {pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={100} className="text-center py-8 text-muted-foreground text-xs">
                      Nenhuma linha com este filtro
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>Cancelar</Button>
          <div className="flex gap-2">
            {hasBlockingErrors && importableCount > 0 && (
              <Button size="sm" onClick={() => handleImport(true)} disabled={importing || isLoading}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Importar válidas ({importableCount})
              </Button>
            )}
            <Button size="sm" onClick={() => handleImport(false)} disabled={importing || hasBlockingErrors || isLoading}>
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
    <button onClick={onClick} className={`rounded-lg p-1.5 text-center transition-all ${bg} ${active ? 'ring-2 ring-primary ring-offset-1' : 'hover:opacity-80'}`}>
      <div className={`font-bold text-base tabular-nums ${color} flex items-center justify-center gap-1`}>{icon}{value}</div>
      <div className="text-muted-foreground text-[9px]">{label}</div>
    </button>
  );
}

function DiagnosticBadge({ d }: { d: FieldDiagnostic }) {
  const isErr = d.tipo === 'error';
  const bgClass = isErr
    ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
    : d.tipo === 'info'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  const Icon = isErr ? XCircle : d.tipo === 'info' ? Copy : AlertTriangle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-start gap-0.5 text-[8px] leading-tight px-1 py-0.5 rounded ${bgClass}`}>
          <Icon className="h-2.5 w-2.5 shrink-0 mt-0.5" />
          <span className="font-semibold">{d.campo}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
        <p><span className="font-semibold">Campo:</span> {d.campo}</p>
        <p><span className="font-semibold">Valor:</span> <code className="bg-muted px-1 rounded text-[10px]">{d.valorRecebido}</code></p>
        <p><span className="font-semibold">Motivo:</span> {d.motivo}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function PreviewRow({ row, showOriginal, excelHeaders, contaOptions, fazendaOptions, onUpdate }: {
  row: EditableRow;
  showOriginal: boolean;
  excelHeaders: string[];
  contaOptions: { value: string; label: string }[];
  fazendaOptions: { value: string; label: string }[];
  onUpdate: (linha: number, field: keyof LinhaImportada, value: string | number | null) => void;
}) {
  const v = row._validation;
  const r = row._resolved;
  const bgClass = v.status === 'error' ? 'bg-red-50/60 dark:bg-red-950/20'
    : v.status === 'duplicated' ? 'bg-blue-50/60 dark:bg-blue-950/20'
    : v.status === 'warning' ? 'bg-amber-50/60 dark:bg-amber-950/20' : '';

  const statusIcon = v.status === 'error' ? <XCircle className="h-3 w-3 text-red-500" />
    : v.status === 'duplicated' ? <Copy className="h-3 w-3 text-blue-500" />
    : v.status === 'warning' ? <AlertTriangle className="h-3 w-3 text-amber-500" />
    : <CheckCircle2 className="h-3 w-3 text-green-500" />;

  const statusLabel = v.status === 'error' ? 'Erro' : v.status === 'duplicated' ? 'Duplicada' : v.status === 'warning' ? 'Alerta' : 'Válida';

  const origCellCls = 'px-1.5 py-0.5 text-muted-foreground font-mono bg-blue-50/20 dark:bg-blue-950/5 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis';
  const resCellCls = 'px-1.5 py-0.5 bg-green-50/20 dark:bg-green-950/5';

  // Editable select for resolved fields
  const editSelect = (field: keyof LinhaImportada, current: string | null, options: { value: string; label: string }[], placeholder = '—') => (
    <Select value={current || ''} onValueChange={val => onUpdate(row.linha, field, val || null)}>
      <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none min-w-[60px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__" className="text-xs">— Nenhum —</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const editInput = (field: keyof LinhaImportada, current: string | null, className = '') => (
    <Input
      className={`h-5 text-[9px] px-1 border-0 bg-transparent shadow-none ${className}`}
      value={current || ''}
      onChange={e => onUpdate(row.linha, field, e.target.value || null)}
    />
  );

  return (
    <tr className={`border-b border-border/50 ${bgClass} hover:bg-muted/30`}>
      <td className="px-1 py-0.5 sticky left-0 bg-background z-10">{statusIcon}</td>
      <td className="px-1 py-0.5 text-muted-foreground tabular-nums">{row.linha}</td>

      {/* Excel original */}
      {showOriginal && excelHeaders.map(h => (
        <td key={`orig-${h}`} className={origCellCls} title={row.rawExcel?.[h] || ''}>
          {row.rawExcel?.[h] || ''}
        </td>
      ))}
      {showOriginal && <td className="w-1 bg-border" />}

      {/* Resolved columns */}
      {/* Fazenda */}
      <td className={resCellCls}>
        {editSelect('fazenda', row.fazenda, fazendaOptions)}
        {r.fazendaResolvidaNome && <span className="text-[7px] text-green-600 block pl-1">✓ {r.fazendaResolvidaNome}</span>}
      </td>
      {/* Conta */}
      <td className={resCellCls}>
        {editSelect('contaOrigem', row.contaOrigem, contaOptions)}
        {r.contaResolvidaNome && <span className="text-[7px] text-green-600 block pl-1">✓ {r.contaResolvidaNome}</span>}
      </td>
      {/* Conta Destino */}
      <td className={resCellCls}>
        {editSelect('contaDestino', row.contaDestino, contaOptions)}
        {r.contaDestinoResolvidaNome && <span className="text-[7px] text-green-600 block pl-1">✓ {r.contaDestinoResolvidaNome}</span>}
      </td>
      {/* Fornecedor */}
      <td className={resCellCls}>
        {editInput('fornecedor', row.fornecedor)}
      </td>
      {/* Subcentro */}
      <td className={resCellCls}>
        {editInput('subcentro', row.subcentro)}
      </td>
      {/* Tipo Documento */}
      <td className={resCellCls}>
        <Select value={row.tipoDocumento || ''} onValueChange={val => onUpdate(row.linha, 'tipoDocumento', val || null)}>
          <SelectTrigger className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none min-w-[50px]">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">—</SelectItem>
            {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      {/* Nº Documento */}
      <td className={resCellCls}>
        {editInput('numeroDocumento', row.numeroDocumento, 'tabular-nums')}
      </td>
      {/* Valor Final */}
      <td className={`${resCellCls} text-right tabular-nums font-bold text-[10px]`}>
        <Input
          className="h-5 text-[9px] px-1 border-0 bg-transparent shadow-none text-right tabular-nums w-[70px]"
          value={row.valor != null ? String(row.valor) : ''}
          onChange={e => {
            const num = parseFloat(e.target.value);
            if (!isNaN(num)) onUpdate(row.linha, 'valor', num);
          }}
        />
      </td>
      {/* Status */}
      <td className={`${resCellCls} font-semibold`}>
        <span className={`text-[8px] ${
          v.status === 'error' ? 'text-red-600' : v.status === 'warning' ? 'text-amber-600' : v.status === 'duplicated' ? 'text-blue-600' : 'text-green-600'
        }`}>{statusLabel}</span>
      </td>

      {/* Diagnostics */}
      <td className="px-1.5 py-0.5">
        {v.diagnostics.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {v.diagnostics.map((d, i) => <DiagnosticBadge key={i} d={d} />)}
          </div>
        ) : (
          <span className="text-[8px] text-green-600">✓ OK</span>
        )}
      </td>
    </tr>
  );
}
