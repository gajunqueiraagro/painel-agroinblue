/**
 * Conferência de Importação Financeira — Governança Estrutural v4
 * 
 * Princípios:
 * - Toda linha aparece na prévia, nada é descartado silenciosamente
 * - Classificação: NOVO / DUPLICADO_EXATO / SUSPEITA / ERRO
 * - Duplicados e suspeitas mostram registro existente SEMPRE visível
 * - Motivo explícito para cada classificação
 * - Seleção padrão: NOVO=✓, DUPLICADO=✗, SUSPEITA=✗, ERRO=bloqueado
 * - Auditoria pós-importação com contadores completos
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Loader2,
  ChevronLeft, ChevronRight, Wrench, Download, Eye, EyeOff,
  CheckSquare, Square, ShieldCheck, Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TIPOS_DOCUMENTO } from '@/lib/financeiro/documentoHelper';
import type { LinhaImportada } from '@/lib/financeiro/importParser';
import {
  classificarLinha,
  gerarHashImportacao,
  type ClassificacaoImportacao,
  type ResultadoClassificacao,
  type RegistroExistente,
  type LinhaParaClassificar,
  type MotivoConflito,
} from '@/lib/financeiro/duplicidadeImportacao';

// ── Types ──

interface ErroConferencia {
  campo: string;
  mensagem: string;
}

interface EditableRow extends LinhaImportada {
  _classificacao: ClassificacaoImportacao | 'ERRO';
  _erros: ErroConferencia[];
  _resultadoDuplicidade: ResultadoClassificacao | null;
  _registroExistente: RegistroExistente | null;
  _selected: boolean;
  _hashImportacao: string;
  _contaResolvidaId: string | null;
  _contaResolvidaNome: string | null;
  _fornecedorResolvidoId: string | null;
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
  subcentrosOficiais?: Set<string>;
  onConfirmar: (linhas: LinhaImportada[]) => Promise<boolean>;
}

// ── Audit Summary ──

interface AuditSummary {
  totalArquivo: number;
  novosImportados: number;
  duplicadosDescartados: number;
  duplicadosImportadosOverride: number;
  suspeitasDescartadas: number;
  suspeitasImportadasOverride: number;
  errosBloqueados: number;
  linhasImportadas: number[];
  linhasDescartadasManual: number[];
  linhasComOverride: number[];
}

const PAGE_SIZE = 50;

// ── Helpers ──

function norm(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normFornecedor(value: string): string {
  return value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildFornecedorResolver(
  fornecedores: Array<{ id: string; nome: string; nome_normalizado: string | null }>,
): (nomeRaw: string | null) => { id: string | null; nomeResolvido: string | null } {
  const exactMap = new Map<string, { id: string; nome: string }>();
  const entries: Array<{ id: string; nome: string; normalizado: string }> = [];
  for (const f of fornecedores) {
    const n = f.nome ? normFornecedor(f.nome) : '';
    if (f.nome_normalizado) exactMap.set(f.nome_normalizado, { id: f.id, nome: f.nome });
    if (n) exactMap.set(n, { id: f.id, nome: f.nome });
    if (f.nome) exactMap.set(f.nome.toUpperCase().trim(), { id: f.id, nome: f.nome });
    if (n) entries.push({ id: f.id, nome: f.nome, normalizado: n });
  }

  const extractWords = (s: string): string[] => s.split(/\s+/).filter(w => w.length >= 3);

  return (nomeRaw: string | null) => {
    if (!nomeRaw || !nomeRaw.trim()) return { id: null, nomeResolvido: null };
    const nomeNorm = normFornecedor(nomeRaw.trim());
    if (!nomeNorm) return { id: null, nomeResolvido: null };

    const exact = exactMap.get(nomeNorm) || exactMap.get(nomeRaw.trim().toUpperCase());
    if (exact) return { id: exact.id, nomeResolvido: exact.nome };

    for (const e of entries) {
      if (e.normalizado.includes(nomeNorm) || nomeNorm.includes(e.normalizado)) return { id: e.id, nomeResolvido: e.nome };
    }

    const inputWords = extractWords(nomeNorm);
    const primaryKeyword = inputWords.find(w => w.length >= 4);
    if (primaryKeyword) {
      const cands = entries.filter(e => e.normalizado.includes(primaryKeyword));
      if (cands.length === 1) return { id: cands[0].id, nomeResolvido: cands[0].nome };
    }

    let best: { id: string; nome: string; score: number } | null = null;
    for (const e of entries) {
      const ew = extractWords(e.normalizado);
      if (ew.length === 0) continue;
      const shared = inputWords.filter(w => ew.some(x => x.includes(w) || w.includes(x)));
      const score = shared.length / Math.max(inputWords.length, ew.length);
      if (score >= 0.5 && (!best || score > best.score)) best = { id: e.id, nome: e.nome, score };
    }
    if (best) return { id: best.id, nomeResolvido: best.nome };

    return { id: null, nomeResolvido: null };
  };
}

function buildContaLookup(contas: ContaOption[]): Map<string, { id: string; label: string }> {
  const m = new Map<string, { id: string; label: string }>();
  const codigoCount = new Map<string, number>();
  for (const c of contas) {
    if (c.codigo_conta) {
      const ck = norm(c.codigo_conta);
      codigoCount.set(ck, (codigoCount.get(ck) || 0) + 1);
    }
  }
  for (const c of contas) {
    const label = c.nome_exibicao || c.nome_conta;
    const resolved = { label, id: c.id };
    const exibKey = norm(c.nome_exibicao);
    if (exibKey) m.set(exibKey, resolved);
    if (c.codigo_conta) {
      const ck = norm(c.codigo_conta);
      if ((codigoCount.get(ck) || 0) <= 1 && ck) m.set(ck, resolved);
    }
  }
  return m;
}

function isTransf(tipo: string | null): boolean {
  if (!tipo) return false;
  const t = tipo.toLowerCase();
  return t.startsWith('3') || t.includes('transfer') || t.includes('resgate') || t.includes('aplicaç');
}

// ── Validation (structural errors) ──

function validarEstrutura(
  row: LinhaImportada,
  contaLookup: Map<string, { id: string; label: string }>,
  fazendaLookup: Map<string, string>,
  subcentrosOficiais?: Set<string>,
): ErroConferencia[] {
  const erros: ErroConferencia[] = [];

  if (!row.fazenda && !row.fazendaId) erros.push({ campo: 'Fazenda', mensagem: 'Fazenda obrigatória' });
  else if (!row.fazendaId && row.fazenda) erros.push({ campo: 'Fazenda', mensagem: `Fazenda "${row.fazenda}" não encontrada` });

  if (row.valor === null || row.valor === undefined || isNaN(row.valor)) erros.push({ campo: 'Valor', mensagem: 'Valor obrigatório' });

  if (!row.tipoOperacao) erros.push({ campo: 'Tipo', mensagem: 'Tipo de operação obrigatório' });

  const contaKey = norm(row.contaOrigem);
  const contaR = contaKey ? contaLookup.get(contaKey) : null;
  if (!row.contaOrigem) erros.push({ campo: 'Conta', mensagem: 'Conta bancária obrigatória' });
  else if (!contaR) erros.push({ campo: 'Conta', mensagem: `Conta "${row.contaOrigem}" não encontrada` });

  if (isTransf(row.tipoOperacao)) {
    const contaDestKey = norm(row.contaDestino);
    const contaDestR = contaDestKey ? contaLookup.get(contaDestKey) : null;
    if (!row.contaDestino) erros.push({ campo: 'Conta Destino', mensagem: 'Transferência sem conta destino' });
    else if (!contaDestR) erros.push({ campo: 'Conta Destino', mensagem: `Conta destino "${row.contaDestino}" não encontrada` });
    else if (contaR && contaDestR && contaR.id === contaDestR.id) erros.push({ campo: 'Conta Destino', mensagem: 'Conta origem e destino iguais' });
  }

  if (!row.anoMes) erros.push({ campo: 'Competência', mensagem: 'Competência ausente' });

  if (row.subcentro && subcentrosOficiais && subcentrosOficiais.size > 0) {
    // Normalizar para comparação: trim, lowercase, remover acentos, espaços duplicados
    const normSub = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const subNorm = normSub(row.subcentro);
    const found = Array.from(subcentrosOficiais).some(s => normSub(s) === subNorm);
    if (!found) {
      erros.push({ campo: 'Subcentro', mensagem: `Subcentro "${row.subcentro}" não existe no plano oficial` });
    }
  }

  return erros;
}

// ── Classification labels ──

const CLASS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  NOVO: { label: 'Novo', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-950/40', icon: CheckCircle2 },
  DUPLICADO_EXATO: { label: 'Duplicado Exato', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950/40', icon: XCircle },
  SUSPEITA: { label: 'Suspeita', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-950/40', icon: AlertTriangle },
  ERRO: { label: 'Erro', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950/40', icon: XCircle },
};

type StatusFilter = 'all' | 'NOVO' | 'DUPLICADO_EXATO' | 'SUSPEITA' | 'ERRO';

// ── Component ──

export function ConferenciaImportacaoDialog({ open, onClose, nomeArquivo, linhas, excelHeaders, contas, fazendas, clienteId, subcentrosOficiais, onConfirmar }: Props) {
  const contaLookup = useMemo(() => buildContaLookup(contas), [contas]);
  const fazendaLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fazendas) m.set(f.codigo.toLowerCase().trim(), f.nome);
    return m;
  }, [fazendas]);

  const [existingMap, setExistingMap] = useState<Map<string, RegistroExistente[]> | null>(null);
  const [fornecedorResolverFn, setFornecedorResolverFn] = useState<ReturnType<typeof buildFornecedorResolver> | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showOriginal, setShowOriginal] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);

  // Phase 1: Fetch ALL existing records for fazenda+anoMes (NO fornecedor filter)
  useEffect(() => {
    if (!open || !clienteId) { setExistingMap(new Map()); return; }
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      const map = new Map<string, RegistroExistente[]>();

      // Build fornecedor lookup
      const fornecedorIdToName = new Map<string, string>();
      const fornecedorRecords: Array<{ id: string; nome: string; nome_normalizado: string | null }> = [];
      {
        let from = 0;
        while (!cancelled) {
          const { data } = await supabase
            .from('financeiro_fornecedores')
            .select('id, nome, nome_normalizado')
            .eq('cliente_id', clienteId)
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          for (const f of data) {
            fornecedorIdToName.set(f.id, f.nome);
            fornecedorRecords.push({ id: f.id, nome: f.nome, nome_normalizado: f.nome_normalizado });
          }
          if (data.length < 1000) break;
          from += 1000;
        }
      }

      // Build conta lookup (id → name)
      const contaIdToName = new Map<string, string>();
      {
        const { data } = await supabase
          .from('financeiro_contas_bancarias')
          .select('id, nome_conta, nome_exibicao')
          .eq('cliente_id', clienteId);
        if (data) {
          for (const c of data) contaIdToName.set(c.id, c.nome_exibicao || c.nome_conta);
        }
      }

      const resolver = buildFornecedorResolver(fornecedorRecords);

      // Get unique fazenda+anoMes from import
      const fazendaIds = [...new Set(linhas.map(l => l.fazendaId).filter(Boolean))] as string[];
      const anoMeses = [...new Set(linhas.map(l => l.anoMes).filter(Boolean))] as string[];

      // Fetch existing: fazenda + anoMes only (NO fornecedor filter)
      for (const fid of fazendaIds) {
        for (const am of anoMeses) {
          const key = `${fid}|${am}`;
          let from = 0;
          while (!cancelled) {
            const { data } = await supabase
              .from('financeiro_lancamentos_v2')
              .select('id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, numero_documento, descricao, favorecido_id, subcentro, centro_custo, ano_mes, data_competencia')
              .eq('fazenda_id', fid)
              .eq('cliente_id', clienteId)
              .eq('ano_mes', am)
              .eq('cancelado', false)
              .range(from, from + 999);
            if (!data || data.length === 0) break;
            for (const e of data) {
              const rec: RegistroExistente = {
                id: e.id,
                data_pagamento: e.data_pagamento,
                data_competencia: (e as any).data_competencia,
                valor: e.valor,
                fornecedor_id: e.favorecido_id,
                fornecedor_nome: e.favorecido_id ? (fornecedorIdToName.get(e.favorecido_id) || null) : null,
                conta_bancaria_id: e.conta_bancaria_id,
                conta_nome: e.conta_bancaria_id ? (contaIdToName.get(e.conta_bancaria_id) || null) : null,
                subcentro: e.subcentro,
                centro_custo: e.centro_custo,
                descricao: e.descricao,
                numero_documento: e.numero_documento,
                tipo_operacao: e.tipo_operacao,
                ano_mes: e.ano_mes,
              };
              const arr = map.get(key);
              if (arr) arr.push(rec); else map.set(key, [rec]);
            }
            if (data.length < 1000) break;
            from += 1000;
          }
        }
      }

      if (!cancelled) {
        setExistingMap(map);
        setFornecedorResolverFn(() => resolver);
        setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [open, clienteId, linhas]);

  // Phase 2: Classify all rows
  useEffect(() => {
    if (!existingMap || !fornecedorResolverFn) return;

    const classified = linhas.map(l => {
      const erros = validarEstrutura(l, contaLookup, fazendaLookup, subcentrosOficiais);
      const contaKey = norm(l.contaOrigem);
      const contaR = contaKey ? contaLookup.get(contaKey) : null;
      const fornecedorResolved = fornecedorResolverFn(l.fornecedor);

      const hash = gerarHashImportacao(l.dataPagamento, l.valor, l.fornecedor, contaR?.id || null, l.numeroDocumento);

      if (erros.length > 0) {
        return {
          ...l,
          _classificacao: 'ERRO' as const,
          _erros: erros,
          _resultadoDuplicidade: null,
          _registroExistente: null,
          _selected: false, // ERRO = bloqueado
          _hashImportacao: hash,
          _contaResolvidaId: contaR?.id || null,
          _contaResolvidaNome: contaR?.label || null,
          _fornecedorResolvidoId: fornecedorResolved.id,
        };
      }

      // Get existing records for this fazenda+anoMes
      const key = `${l.fazendaId}|${l.anoMes}`;
      const existentes = existingMap.get(key) || [];

      const linhaClassificar: LinhaParaClassificar = {
        dataPagamento: l.dataPagamento,
        anoMes: l.anoMes,
        valor: l.valor,
        fornecedorId: fornecedorResolved.id,
        fornecedorNome: l.fornecedor,
        contaBancariaId: contaR?.id || null,
        subcentro: l.subcentro,
        descricao: l.produto || l.subcentro,
        numeroDocumento: l.numeroDocumento,
        tipoOperacao: l.tipoOperacao,
      };

      const resultado = classificarLinha(linhaClassificar, existentes);

      // Find the full existing record for display
      let registroExistente: RegistroExistente | null = null;
      if (resultado.registroExistenteId) {
        registroExistente = existentes.find(e => e.id === resultado.registroExistenteId) || null;
      }

      const autoSelect = resultado.classificacao === 'NOVO'; // DUPLICADO and SUSPEITA = unchecked

      return {
        ...l,
        _classificacao: resultado.classificacao,
        _erros: [],
        _resultadoDuplicidade: resultado,
        _registroExistente: registroExistente,
        _selected: autoSelect,
        _hashImportacao: hash,
        _contaResolvidaId: contaR?.id || null,
        _contaResolvidaNome: contaR?.label || null,
        _fornecedorResolvidoId: fornecedorResolved.id,
      };
    });

    setRows(classified);
  }, [linhas, existingMap, fornecedorResolverFn, contaLookup, fazendaLookup, subcentrosOficiais]);

  // Stats
  const stats = useMemo(() => {
    let novo = 0, duplicado = 0, suspeita = 0, erro = 0, selected = 0;
    for (const r of rows) {
      if (r._classificacao === 'NOVO') novo++;
      else if (r._classificacao === 'DUPLICADO_EXATO') duplicado++;
      else if (r._classificacao === 'SUSPEITA') suspeita++;
      else erro++;
      if (r._selected) selected++;
    }
    return { novo, duplicado, suspeita, erro, total: rows.length, selected };
  }, [rows]);

  // Filter
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter(r => r._classificacao === statusFilter);
  }, [rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Selection
  const toggleSelect = (linha: number) => {
    setRows(prev => prev.map(r => r.linha === linha && r._classificacao !== 'ERRO' ? { ...r, _selected: !r._selected } : r));
  };

  const bulkSelect = (predicate: (r: EditableRow) => boolean) => {
    setRows(prev => prev.map(r => r._classificacao === 'ERRO' ? r : { ...r, _selected: predicate(r) }));
  };

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.filter(r => r._classificacao !== 'ERRO').every(r => r._selected);
  const toggleFilteredSelection = () => {
    const linhaSet = new Set(filteredRows.map(r => r.linha));
    if (allFilteredSelected) {
      setRows(prev => prev.map(r => linhaSet.has(r.linha) && r._classificacao !== 'ERRO' ? { ...r, _selected: false } : r));
    } else {
      setRows(prev => prev.map(r => linhaSet.has(r.linha) && r._classificacao !== 'ERRO' ? { ...r, _selected: true } : r));
    }
  };

  // Bulk actions
  const bulkFixNegativeValues = () => { setRows(prev => prev.map(r => r.valor < 0 ? { ...r, valor: Math.abs(r.valor) } : r)); setBulkOpen(false); };
  const bulkSetContaDestino = (v: string) => { setRows(prev => prev.map(r => isTransf(r.tipoOperacao) && !r.contaDestino ? { ...r, contaDestino: v } : r)); setBulkOpen(false); };
  const bulkSetTipoDocumento = (v: string) => { setRows(prev => prev.map(r => ({ ...r, tipoDocumento: v }))); setBulkOpen(false); };

  const negativeCount = useMemo(() => rows.filter(r => r.valor < 0).length, [rows]);

  // Export errors
  const exportErrors = () => {
    const errorRows = rows.filter(r => r._classificacao === 'ERRO');
    if (errorRows.length === 0) return;
    const csvLines = ['Linha,Campo,Mensagem'];
    for (const r of errorRows) {
      for (const e of r._erros) {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        csvLines.push(`${r.linha},${esc(e.campo)},${esc(e.mensagem)}`);
      }
    }
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `erros_importacao_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // Import with audit trail
  const handleImport = async () => {
    const toImport = rows.filter(r => r._selected && r._classificacao !== 'ERRO');
    if (toImport.length === 0) return;
    setImporting(true);

    // Build audit summary
    const summary: AuditSummary = {
      totalArquivo: rows.length,
      novosImportados: 0,
      duplicadosDescartados: 0,
      duplicadosImportadosOverride: 0,
      suspeitasDescartadas: 0,
      suspeitasImportadasOverride: 0,
      errosBloqueados: stats.erro,
      linhasImportadas: [],
      linhasDescartadasManual: [],
      linhasComOverride: [],
    };

    for (const r of rows) {
      if (r._classificacao === 'ERRO') continue;
      if (r._selected) {
        summary.linhasImportadas.push(r.linha);
        if (r._classificacao === 'NOVO') summary.novosImportados++;
        else if (r._classificacao === 'DUPLICADO_EXATO') { summary.duplicadosImportadosOverride++; summary.linhasComOverride.push(r.linha); }
        else if (r._classificacao === 'SUSPEITA') { summary.suspeitasImportadasOverride++; summary.linhasComOverride.push(r.linha); }
      } else {
        summary.linhasDescartadasManual.push(r.linha);
        if (r._classificacao === 'DUPLICADO_EXATO') summary.duplicadosDescartados++;
        else if (r._classificacao === 'SUSPEITA') summary.suspeitasDescartadas++;
      }
    }

    const clean: LinhaImportada[] = toImport.map(({ _classificacao, _erros, _resultadoDuplicidade, _registroExistente, _selected, _hashImportacao, _contaResolvidaId, _contaResolvidaNome, _fornecedorResolvidoId, ...rest }) => rest);
    const ok = await onConfirmar(clean);
    setImporting(false);
    if (ok) {
      setAuditSummary(summary);
    }
  };

  const selectedImportable = rows.filter(r => r._selected && r._classificacao !== 'ERRO').length;
  const isLoading = loading || existingMap === null;

  const visibleExcelHeaders = useMemo(() => excelHeaders.filter(h => h && h !== ''), [excelHeaders]);

  const contaOptions = useMemo(() => contas.map(c => ({ value: c.nome_exibicao || c.nome_conta || c.id, label: c.nome_exibicao || c.nome_conta })).filter(c => !!c.value), [contas]);

  // ── Audit Summary Dialog ──
  if (auditSummary) {
    return (
      <Dialog open={open} onOpenChange={() => { setAuditSummary(null); onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Importação Concluída — Auditoria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <AuditCard label="Total no arquivo" value={auditSummary.totalArquivo} />
              <AuditCard label="Importados" value={auditSummary.linhasImportadas.length} color="text-green-700" />
              <AuditCard label="Novos importados" value={auditSummary.novosImportados} color="text-green-600" />
              <AuditCard label="Erros bloqueados" value={auditSummary.errosBloqueados} color="text-red-600" />
              <AuditCard label="Duplicados descartados" value={auditSummary.duplicadosDescartados} color="text-red-600" />
              <AuditCard label="Duplicados (override)" value={auditSummary.duplicadosImportadosOverride} color="text-amber-600" />
              <AuditCard label="Suspeitas descartadas" value={auditSummary.suspeitasDescartadas} color="text-amber-600" />
              <AuditCard label="Suspeitas (override)" value={auditSummary.suspeitasImportadasOverride} color="text-amber-600" />
            </div>
            {auditSummary.linhasComOverride.length > 0 && (
              <div className="border rounded p-2 bg-amber-50 dark:bg-amber-950/20">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠ Linhas importadas com override manual:</p>
                <p className="text-muted-foreground">Linhas: {auditSummary.linhasComOverride.join(', ')}</p>
              </div>
            )}
            {auditSummary.linhasDescartadasManual.length > 0 && (
              <div className="border rounded p-2">
                <p className="font-semibold text-muted-foreground mb-1">Linhas descartadas pelo usuário:</p>
                <p className="text-muted-foreground">{auditSummary.linhasDescartadasManual.length} linhas: {auditSummary.linhasDescartadasManual.slice(0, 20).join(', ')}{auditSummary.linhasDescartadasManual.length > 20 ? '...' : ''}</p>
              </div>
            )}
            <Button className="w-full" onClick={() => { setAuditSummary(null); onClose(); }}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main Dialog ──
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[98vw] w-[98vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Conferência de Importação
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{nomeArquivo} — {stats.total} lançamentos</p>
        </DialogHeader>

        {isLoading && (
          <div className="px-4 pb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando duplicidades no banco...
          </div>
        )}

        {/* Negative values banner */}
        {!isLoading && negativeCount > 0 && (
          <div className="px-4 pb-2 shrink-0">
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-300"><strong>{negativeCount}</strong> valor(es) negativo(s).</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] ml-auto" onClick={bulkFixNegativeValues}>Converter para positivo</Button>
            </div>
          </div>
        )}

        {/* Summary cards — 4 categories */}
        {!isLoading && (
          <div className="px-4 pb-2 shrink-0">
            <div className="grid grid-cols-5 gap-1.5">
              <SummaryCard label="Total" value={stats.total} color="text-foreground" bg="bg-muted" onClick={() => { setStatusFilter('all'); setPage(0); }} active={statusFilter === 'all'} />
              <SummaryCard label="Novos" value={stats.novo} color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" icon={<CheckCircle2 className="h-3 w-3" />} onClick={() => { setStatusFilter('NOVO'); setPage(0); }} active={statusFilter === 'NOVO'} />
              <SummaryCard label="Duplicados" value={stats.duplicado} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" icon={<XCircle className="h-3 w-3" />} onClick={() => { setStatusFilter('DUPLICADO_EXATO'); setPage(0); }} active={statusFilter === 'DUPLICADO_EXATO'} />
              <SummaryCard label="Suspeitas" value={stats.suspeita} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" icon={<AlertTriangle className="h-3 w-3" />} onClick={() => { setStatusFilter('SUSPEITA'); setPage(0); }} active={statusFilter === 'SUSPEITA'} />
              <SummaryCard label="Erros" value={stats.erro} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" icon={<XCircle className="h-3 w-3" />} onClick={() => { setStatusFilter('ERRO'); setPage(0); }} active={statusFilter === 'ERRO'} />
            </div>
          </div>
        )}

        {/* Selection toolbar */}
        {!isLoading && (
          <div className="px-4 pb-2 shrink-0">
            <div className="rounded-lg border bg-muted/30 p-2 flex items-center gap-2 flex-wrap">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Seleção:</span>
              <Badge variant="outline" className="text-[10px] h-5 tabular-nums">{stats.selected}/{stats.total} selecionadas</Badge>
              <div className="flex gap-1 ml-auto flex-wrap">
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(() => true)}>
                  <CheckSquare className="h-3 w-3 mr-0.5" /> Todas
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(() => false)}>
                  <Square className="h-3 w-3 mr-0.5" /> Nenhuma
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(r => r._classificacao === 'NOVO')}>
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Só novos
                </Button>
                {stats.duplicado > 0 && (
                  <Button variant="outline" size="sm" className="h-6 text-[9px] text-red-600" onClick={() => setRows(prev => prev.map(r => r._classificacao === 'DUPLICADO_EXATO' ? { ...r, _selected: false } : r))}>
                    <XCircle className="h-3 w-3 mr-0.5" /> Desmarcar duplicados ({stats.duplicado})
                  </Button>
                )}
                {stats.suspeita > 0 && (
                  <Button variant="outline" size="sm" className="h-6 text-[9px] text-amber-600" onClick={() => setRows(prev => prev.map(r => r._classificacao === 'SUSPEITA' ? { ...r, _selected: false } : r))}>
                    <AlertTriangle className="h-3 w-3 mr-0.5" /> Desmarcar suspeitas ({stats.suspeita})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 pb-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex gap-1.5">
            <Button variant={showOriginal ? 'default' : 'outline'} size="sm" className="h-7 text-[10px]" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              {showOriginal ? 'Ocultar Excel' : 'Mostrar Excel'}
            </Button>
            <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px]"><Wrench className="h-3 w-3 mr-1" /> Ações em massa</Button>
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
                {negativeCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full justify-start text-[11px] h-7 text-amber-600" onClick={bulkFixNegativeValues}>
                    ⚠ Converter {negativeCount} negativo(s) → positivo
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportErrors} disabled={stats.erro === 0}>
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
                  <th className="px-1 py-1.5 text-center w-6 sticky left-0 bg-background z-20">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleFilteredSelection} className="h-3 w-3" />
                  </th>
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-[90px]">Classificação</th>
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-6">Ln</th>
                  {showOriginal && visibleExcelHeaders.map(h => (
                    <th key={`orig-${h}`} className="px-1.5 py-1.5 text-left font-semibold bg-blue-50/60 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 whitespace-nowrap min-w-[60px]">{h}</th>
                  ))}
                  {showOriginal && <th className="w-1 bg-border" />}
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[60px]">Competência</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[70px]">Dt Pagto</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[120px]">Fornecedor</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[100px]">Produto</th>
                  <th className="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap min-w-[70px]">Valor</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[100px]">Centro/Subcentro</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[60px]">Documento</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[70px]">Conta</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold min-w-[180px]">Motivo / Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(row => (
                  <ConferenceRowGroup
                    key={row.linha}
                    row={row}
                    showOriginal={showOriginal}
                    excelHeaders={visibleExcelHeaders}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {pagedRows.length === 0 && (
                  <tr><td colSpan={100} className="text-center py-8 text-muted-foreground text-xs">Nenhuma linha com este filtro</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>Cancelar</Button>
            <span className="text-[10px] text-muted-foreground">
              {stats.selected} selecionadas · {selectedImportable} importáveis
            </span>
          </div>
          <Button size="sm" onClick={handleImport} disabled={importing || selectedImportable === 0 || isLoading}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Importar selecionadas ({selectedImportable})
          </Button>
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

function AuditCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border rounded p-2 text-center">
      <div className={`font-bold text-lg tabular-nums ${color || 'text-foreground'}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ClassBadge({ classificacao }: { classificacao: ClassificacaoImportacao | 'ERRO' }) {
  const cfg = CLASS_CONFIG[classificacao] || CLASS_CONFIG.ERRO;
  const Icon = cfg.icon;
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

/** Shows imported row + existing row below (when applicable) */
function ConferenceRowGroup({ row, showOriginal, excelHeaders, onToggleSelect }: {
  row: EditableRow;
  showOriginal: boolean;
  excelHeaders: string[];
  onToggleSelect: (linha: number) => void;
}) {
  const bgClass = row._classificacao === 'ERRO' ? 'bg-red-50/60 dark:bg-red-950/20'
    : row._classificacao === 'DUPLICADO_EXATO' ? 'bg-red-50/40 dark:bg-red-950/15'
    : row._classificacao === 'SUSPEITA' ? 'bg-amber-50/40 dark:bg-amber-950/15' : '';

  const origCellCls = 'px-1.5 py-0.5 text-muted-foreground font-mono bg-blue-50/20 dark:bg-blue-950/5 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis';
  const hasExisting = row._registroExistente && (row._classificacao === 'DUPLICADO_EXATO' || row._classificacao === 'SUSPEITA');

  return (
    <>
      {/* Main imported row */}
      <tr className={`border-b border-border/50 ${bgClass} ${!row._selected && row._classificacao !== 'ERRO' ? 'opacity-50' : ''} hover:bg-muted/30`}>
        <td className="px-1 py-0.5 text-center sticky left-0 bg-background z-10">
          <Checkbox checked={row._selected} onCheckedChange={() => onToggleSelect(row.linha)} className="h-3 w-3" disabled={row._classificacao === 'ERRO'} />
        </td>
        <td className="px-1 py-0.5"><ClassBadge classificacao={row._classificacao} /></td>
        <td className="px-1 py-0.5 text-muted-foreground tabular-nums">{row.linha}</td>

        {showOriginal && excelHeaders.map(h => (
          <td key={`orig-${h}`} className={origCellCls} title={row.rawExcel?.[h] || ''}>{row.rawExcel?.[h] || ''}</td>
        ))}
        {showOriginal && <td className="w-1 bg-border" />}

        <td className="px-1.5 py-0.5 tabular-nums">{row.anoMes || '—'}</td>
        <td className="px-1.5 py-0.5 tabular-nums">{row.dataPagamento || '—'}</td>
        <td className="px-1.5 py-0.5 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.fornecedor || ''}>{row.fornecedor || <span className="text-muted-foreground italic">vazio</span>}</td>
        <td className="px-1.5 py-0.5 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.produto || ''}>{row.produto || row.subcentro || '—'}</td>
        <td className="px-1.5 py-0.5 text-right tabular-nums font-bold text-[10px]">{row.valor != null ? `R$ ${row.valor.toFixed(2)}` : '—'}</td>
        <td className="px-1.5 py-0.5 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.subcentro || ''}>{row.subcentro || '—'}</td>
        <td className="px-1.5 py-0.5 tabular-nums">{row.numeroDocumento || '—'}</td>
        <td className="px-1.5 py-0.5 text-[8px]">
          {row._contaResolvidaNome ? (
            <span className="text-green-600" title={row._contaResolvidaNome}>✓ {row._contaResolvidaNome.substring(0, 12)}</span>
          ) : (
            <span className="text-red-500">{row.contaOrigem?.substring(0, 12) || '—'}</span>
          )}
        </td>
        <td className="px-1.5 py-0.5">
          {row._classificacao === 'ERRO' && (
            <div className="flex flex-wrap gap-0.5">
              {row._erros.map((e, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 inline-flex items-center gap-0.5">
                      <XCircle className="h-2.5 w-2.5" />{e.campo}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs">{e.mensagem}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
          {row._resultadoDuplicidade && row._classificacao !== 'NOVO' && (
            <div className="text-[8px] text-muted-foreground leading-tight max-w-[250px]">
              {row._resultadoDuplicidade.resumo}
            </div>
          )}
          {row._classificacao === 'NOVO' && <span className="text-[8px] text-green-600">✓ Sem conflito</span>}
        </td>
      </tr>

      {/* Existing record row — ALWAYS VISIBLE for duplicados and suspeitas */}
      {hasExisting && row._registroExistente && (
        <ExistingRecordRow existing={row._registroExistente} imported={row} motivos={row._resultadoDuplicidade?.motivos || []} showOriginal={showOriginal} excelHeaderCount={excelHeaders.length} />
      )}
    </>
  );
}

/** Inline existing bank record shown below the imported row */
function ExistingRecordRow({ existing, imported, motivos, showOriginal, excelHeaderCount }: {
  existing: RegistroExistente;
  imported: EditableRow;
  motivos: MotivoConflito[];
  showOriginal: boolean;
  excelHeaderCount: number;
}) {
  const cmpClass = (match?: boolean) => match ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400 font-semibold';
  const fieldMatch = (campo: string) => motivos.find(m => m.campo === campo);

  return (
    <tr className="border-b border-border/30 bg-muted/40">
      <td className="px-1 py-0.5" />
      <td className="px-1 py-0.5 text-[8px] text-muted-foreground italic" colSpan={2}>↳ existente</td>
      {showOriginal && <td colSpan={excelHeaderCount + 1} />}
      <td className="px-1.5 py-0.5 text-muted-foreground font-mono">{existing.ano_mes || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(fieldMatch('Data Pagamento')?.match)}`}>{existing.data_pagamento || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(fieldMatch('Fornecedor')?.match)}`} title={existing.fornecedor_nome || ''}>{existing.fornecedor_nome || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(fieldMatch('Descrição')?.match)}`} title={existing.descricao || ''}>{(existing.descricao || '—').substring(0, 30)}</td>
      <td className={`px-1.5 py-0.5 text-right tabular-nums font-mono ${cmpClass(fieldMatch('Valor')?.match)}`}>
        {existing.valor != null ? `R$ ${existing.valor.toFixed(2)}` : '—'}
      </td>
      <td className={`px-1.5 py-0.5 font-mono`}>{existing.subcentro || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(fieldMatch('Documento')?.match)}`}>{existing.numero_documento || '—'}</td>
      <td className="px-1.5 py-0.5 text-muted-foreground font-mono text-[8px]">{existing.conta_nome || (existing.conta_bancaria_id ? '✓' : '—')}</td>
      <td className="px-1.5 py-0.5">
        <div className="flex flex-wrap gap-0.5">
          {motivos.filter(m => m.match).map((m, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <span className="text-[7px] px-1 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300">✓ {m.campo}</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">{m.detalhe}</TooltipContent>
            </Tooltip>
          ))}
          {motivos.filter(m => !m.match).map((m, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <span className="text-[7px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">≠ {m.campo}</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">{m.detalhe}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </td>
    </tr>
  );
}
