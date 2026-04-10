/**
 * Conferência de Importação Financeira — Modelo Profissional v3
 * 
 * Fase 1: Busca de candidatos por (fazenda + anoMes + fornecedor)
 * Fase 2: Classificação D1/D2/D3/NOVO comparando todos os campos
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Loader2,
  ChevronLeft, ChevronRight, Wrench, Download, Copy, Eye, EyeOff,
  ChevronDown, ChevronUp, CheckSquare, Square, Filter, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

/** Record from the database used for comparison */
interface ExistingRecord {
  id: string;
  descricao: string | null;
  numero_documento: string | null;
  favorecido_id: string | null;
  favorecido_nome: string | null;
  subcentro: string | null;
  data_pagamento: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  conta_bancaria_id: string | null;
  centro_custo: string | null;
  ano_mes: string | null;
}

type NivelDuplicidade = 'D1' | 'D2' | 'D3' | 'LEGITIMO';

interface EditableRow extends LinhaImportada {
  _validation: ValidationResult;
  _resolved: ResolvedInfo;
  _isDuplicate: boolean;
  _nivelDuplicidade?: NivelDuplicidade | null;
  _selected: boolean;
  _existingMatch?: ExistingRecord | null;
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

const PAGE_SIZE = 50;

// ── Helpers ──

function norm(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

interface ContaResolved { label: string; id: string; }

function buildContaLookup(contas: ContaOption[]): Map<string, ContaResolved> {
  const m = new Map<string, ContaResolved>();
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

/**
 * Phase 1 key: fazenda + anoMes + fornecedor (resolved ID)
 * This is the BROAD search key — value is NOT included.
 */
function buildCandidateKey(fazendaId: string, anoMes: string, favorecidoId: string | null): string {
  return [fazendaId, anoMes, favorecidoId || ''].join('|');
}

/**
 * Phase 2: Classification based on field-by-field comparison.
 * Called only when a candidate was found (same fazenda + anoMes + fornecedor).
 */
function classificarNivel(
  imported: { dataPagamento?: string | null; valor: number; tipoOperacao?: string | null; contaBancariaId?: string | null; descricao?: string | null; numeroDocumento?: string | null; subcentro?: string | null },
  existing: ExistingRecord,
): NivelDuplicidade {
  let diffCount = 0;
  let docDiverge = false;

  // 1. Data pagamento
  const dp1 = (imported.dataPagamento || '').trim();
  const dp2 = (existing.data_pagamento || '').trim();
  if (dp1 !== dp2 && (dp1 || dp2)) diffCount++;

  // 2. Valor
  const v1 = Math.round((imported.valor || 0) * 100);
  const v2 = Math.round((existing.valor || 0) * 100);
  if (v1 !== v2) diffCount++;

  // 3. Descrição/Produto
  const nd = norm(imported.descricao);
  const ed = norm(existing.descricao);
  if (nd !== ed && (nd || ed)) diffCount++;

  // 4. Subcentro
  const ns = norm(imported.subcentro);
  const es = norm(existing.subcentro);
  if (ns !== es && (ns || es)) diffCount++;

  // 5. Número documento
  const nDoc = norm(imported.numeroDocumento);
  const eDoc = norm(existing.numero_documento);
  if (nDoc && eDoc && nDoc !== eDoc) {
    docDiverge = true;
    diffCount++;
  }

  // 6. Tipo operação (lightweight)
  const nt = norm(imported.tipoOperacao);
  const et = norm(existing.tipo_operacao);
  if (nt !== et && (nt || et)) diffCount++;

  // 7. Conta bancária
  const nc = (imported.contaBancariaId || '').trim();
  const ec = (existing.conta_bancaria_id || '').trim();
  if (nc !== ec && (nc || ec)) diffCount++;

  if (diffCount === 0) return 'D1';
  if (diffCount === 1 && !docDiverge) return 'D2';
  if (diffCount <= 2) return 'D2';
  if (diffCount <= 3) return 'D3';
  return 'LEGITIMO';
}

function isTransf(tipo: string | null): boolean {
  if (!tipo) return false;
  const t = tipo.toLowerCase();
  return t.startsWith('3') || t.includes('transfer') || t.includes('resgate') || t.includes('aplicaç');
}

function validateRow(row: LinhaImportada, contaLookup: Map<string, ContaResolved>, fazendaLookup: Map<string, string>, isDuplicate: boolean, subcentrosOficiais?: Set<string>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: FieldDiagnostic[] = [];

  if (isDuplicate) {
    warnings.push('Lançamento duplicado detectado');
    diagnostics.push({ campo: 'Duplicidade', valorRecebido: `${row.dataPagamento || row.anoMes} | ${row.valor} | ${row.fornecedor}`, motivo: 'Existe lançamento similar no banco (mesmo fornecedor e competência).', tipo: 'warning', categoria: 'duplicidade' });
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

  const contaKey = norm(row.contaOrigem);
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
    const contaDestKey = norm(row.contaDestino);
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

  if (row.subcentro && subcentrosOficiais && subcentrosOficiais.size > 0 && !subcentrosOficiais.has(row.subcentro)) {
    errors.push(`Subcentro "${row.subcentro}" não existe no plano oficial`);
    diagnostics.push({ campo: 'Subcentro', valorRecebido: row.subcentro, motivo: 'Não encontrado no plano de contas oficial.', tipo: 'error', categoria: 'outros' });
  }

  let status: RowStatus;
  if (errors.length > 0) status = 'error';
  else if (isDuplicate) status = 'duplicated';
  else if (warnings.length > 0) status = 'warning';
  else status = 'valid';

  return { status, errors, warnings, diagnostics };
}

function resolveInfo(row: LinhaImportada, contaLookup: Map<string, ContaResolved>, fazendaLookup: Map<string, string>): ResolvedInfo {
  const contaKey = norm(row.contaOrigem);
  const contaDestKey = norm(row.contaDestino);
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

// ── Filter labels ──

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Todos',
  valid: 'Válidas',
  warning: 'Alertas',
  error: 'Erros',
  duplicated: 'Duplicadas',
  fornecedor_vazio: 'Fornecedor vazio',
  valor_negativo: 'Valor negativo',
  conta_nao_encontrada: 'Conta não encontrada',
  subcentro_nao_encontrado: 'Subcentro inválido/vazio',
  fazenda_nao_encontrada: 'Fazenda não encontrada',
};

const NIVEL_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  D1: { label: 'D1 — Duplicado real', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950/40' },
  D2: { label: 'D2 — Suspeita forte', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-950/40' },
  D3: { label: 'D3 — Suspeita fraca', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-950/40' },
  NOVO: { label: 'Novo', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-950/40' },
  ERRO: { label: 'Erro', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-950/40' },
};

// ── Component ──

export function ConferenciaImportacaoDialog({ open, onClose, nomeArquivo, linhas, excelHeaders, contas, fazendas, clienteId, subcentrosOficiais, onConfirmar }: Props) {
  const contaLookup = useMemo(() => buildContaLookup(contas), [contas]);
  const fazendaLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fazendas) m.set(f.codigo.toLowerCase().trim(), f.nome);
    return m;
  }, [fazendas]);

  // Phase 1 data: Map<candidateKey, ExistingRecord[]>
  const [candidateMap, setCandidateMap] = useState<Map<string, ExistingRecord[]> | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // Phase 1: Fetch ALL existing records for the relevant fazendas+anoMeses, indexed by (fazenda+anoMes+fornecedor)
  useEffect(() => {
    if (!open || !clienteId) { setCandidateMap(new Map()); return; }
    let cancelled = false;

    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      const map = new Map<string, ExistingRecord[]>();

      // Build fornecedor id→name lookup
      const fornecedorMap = new Map<string, string>();
      {
        let from = 0;
        const batchSize = 1000;
        while (!cancelled) {
          const { data } = await supabase
            .from('financeiro_fornecedores')
            .select('id, nome')
            .eq('cliente_id', clienteId)
            .range(from, from + batchSize - 1);
          if (!data || data.length === 0) break;
          for (const f of data) fornecedorMap.set(f.id, f.nome);
          if (data.length < batchSize) break;
          from += batchSize;
        }
      }

      // Get unique fazenda+anoMes combos from import
      const fazendaIds = [...new Set(linhas.map(l => l.fazendaId).filter(Boolean))] as string[];
      const anoMeses = [...new Set(linhas.map(l => l.anoMes).filter(Boolean))] as string[];

      // Fetch all existing lancamentos for those fazendas and anoMeses
      for (const fid of fazendaIds) {
        for (const am of anoMeses) {
          let from = 0;
          const batchSize = 1000;
          while (!cancelled) {
            const { data } = await supabase
              .from('financeiro_lancamentos_v2')
              .select('id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, numero_documento, descricao, favorecido_id, subcentro, centro_custo, ano_mes')
              .eq('fazenda_id', fid)
              .eq('cliente_id', clienteId)
              .eq('ano_mes', am)
              .eq('cancelado', false)
              .range(from, from + batchSize - 1);
            if (!data || data.length === 0) break;
            for (const e of data) {
              const rec: ExistingRecord = {
                id: e.id,
                descricao: e.descricao,
                numero_documento: e.numero_documento,
                favorecido_id: e.favorecido_id,
                favorecido_nome: e.favorecido_id ? (fornecedorMap.get(e.favorecido_id) || null) : null,
                subcentro: e.subcentro,
                data_pagamento: e.data_pagamento,
                valor: e.valor,
                tipo_operacao: e.tipo_operacao,
                conta_bancaria_id: e.conta_bancaria_id,
                centro_custo: e.centro_custo,
                ano_mes: e.ano_mes,
              };
              const key = buildCandidateKey(fid, am, e.favorecido_id);
              const arr = map.get(key);
              if (arr) arr.push(rec); else map.set(key, [rec]);
            }
            if (data.length < batchSize) break;
            from += batchSize;
          }
        }
      }
      if (!cancelled) { setCandidateMap(map); setLoadingCandidates(false); }
    };
    fetchCandidates();
    return () => { cancelled = true; };
  }, [open, clienteId, linhas]);

  // Phase 2: Check duplicate for a single row
  const checkDuplicate = useCallback((row: LinhaImportada, cMap: Map<string, ExistingRecord[]>): { isDuplicate: boolean; nivel: NivelDuplicidade | null; match: ExistingRecord | null } => {
    if (!clienteId || !cMap || !row.fazendaId || !row.anoMes) return { isDuplicate: false, nivel: null, match: null };

    // Resolve fornecedor ID from the row's resolved fornecedor
    // The row may have fornecedorId set by the import parser, or we need to look up by name
    // We search candidates by the fornecedor that was resolved during import
    const contaKey = norm(row.contaOrigem);
    const contaR = contaKey ? contaLookup.get(contaKey) : null;

    // Try to find candidates: first by exact fornecedor match
    // We need to search across all fornecedor IDs since we don't have the resolved ID here
    // Strategy: iterate candidate keys that match fazenda+anoMes, compare fornecedor by name
    const prefix = `${row.fazendaId}|${row.anoMes}|`;
    
    let bestNivel: NivelDuplicidade = 'LEGITIMO';
    let bestMatch: ExistingRecord | null = null;
    const rank = { D1: 4, D2: 3, D3: 2, LEGITIMO: 0 } as const;

    for (const [key, candidates] of cMap.entries()) {
      if (!key.startsWith(prefix)) continue;
      
      // Check if fornecedor matches (by name comparison)
      const candidateFornecedorNome = candidates[0]?.favorecido_nome;
      const importFornecedor = norm(row.fornecedor);
      const existingFornecedor = norm(candidateFornecedorNome);
      
      // Skip if fornecedor doesn't match at all
      if (importFornecedor && existingFornecedor && importFornecedor !== existingFornecedor) continue;
      // If both are empty, they match
      if (!importFornecedor && !existingFornecedor) { /* match */ }
      // If one is empty and the other isn't, still consider as candidate but with penalty
      
      for (const ex of candidates) {
        const nivel = classificarNivel(
          {
            dataPagamento: row.dataPagamento,
            valor: row.valor,
            tipoOperacao: row.tipoOperacao,
            contaBancariaId: contaR?.id || null,
            descricao: row.produto || row.subcentro,
            numeroDocumento: row.numeroDocumento,
            subcentro: row.subcentro,
          },
          ex,
        );
        if (rank[nivel] > rank[bestNivel]) {
          bestNivel = nivel;
          bestMatch = ex;
        }
        if (bestNivel === 'D1') break;
      }
      if (bestNivel === 'D1') break;
    }

    return { isDuplicate: bestNivel !== 'LEGITIMO', nivel: bestNivel === 'LEGITIMO' ? null : bestNivel, match: bestMatch };
  }, [clienteId, contaLookup]);

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    if (!candidateMap) return;
    setRows(linhas.map(l => {
      const result = checkDuplicate(l, candidateMap);
      const validation = validateRow(l, contaLookup, fazendaLookup, result.isDuplicate, subcentrosOficiais);
      const autoSelect = validation.status === 'error' ? false
        : result.nivel === 'D1' ? false
        : true;
      return {
        ...l,
        _validation: validation,
        _resolved: resolveInfo(l, contaLookup, fazendaLookup),
        _isDuplicate: result.isDuplicate,
        _nivelDuplicidade: result.nivel,
        _selected: autoSelect,
        _existingMatch: result.match,
      };
    }));
  }, [linhas, candidateMap, contaLookup, fazendaLookup, checkDuplicate, subcentrosOficiais]);

  const revalidateRows = useCallback((currentRows: EditableRow[]): EditableRow[] => {
    if (!candidateMap) return currentRows;
    return currentRows.map(r => {
      const result = checkDuplicate(r, candidateMap);
      const validation = validateRow(r, contaLookup, fazendaLookup, result.isDuplicate, subcentrosOficiais);
      return { ...r, _validation: validation, _resolved: resolveInfo(r, contaLookup, fazendaLookup), _isDuplicate: result.isDuplicate, _nivelDuplicidade: result.nivel, _existingMatch: result.match };
    });
  }, [contaLookup, fazendaLookup, candidateMap, checkDuplicate, subcentrosOficiais]);

  const contaOptions = useMemo(() => contas.map(c => ({ value: c.nome_exibicao || c.nome_conta || c.id, label: c.nome_exibicao || c.nome_conta })).filter(c => !!c.value), [contas]);
  const fazendaOptions = useMemo(() => fazendas.map(f => ({ value: f.codigo || f.id, label: `${f.codigo} — ${f.nome}` })).filter(f => !!f.value), [fazendas]);

  // Stats
  const stats = useMemo(() => {
    let valid = 0, warning = 0, error = 0, duplicated = 0;
    let fornecedorVazio = 0, valorNegativo = 0, contaNaoEncontrada = 0, subcentroVazio = 0, fazendaNaoEncontrada = 0;
    let selected = 0, d1 = 0, d2 = 0, d3 = 0;
    for (const r of rows) {
      if (r._validation.status === 'valid') valid++;
      else if (r._validation.status === 'duplicated') duplicated++;
      else if (r._validation.status === 'warning') warning++;
      else error++;
      if (!r.fornecedor) fornecedorVazio++;
      if (r.valor < 0) valorNegativo++;
      if (r.contaOrigem && !r._resolved.contaResolvidaId) contaNaoEncontrada++;
      if (!r.subcentro || (r.subcentro && subcentrosOficiais && subcentrosOficiais.size > 0 && !subcentrosOficiais.has(r.subcentro))) subcentroVazio++;
      if (r.fazenda && !r.fazendaId) fazendaNaoEncontrada++;
      if (r._selected) selected++;
      if (r._nivelDuplicidade === 'D1') d1++;
      if (r._nivelDuplicidade === 'D2') d2++;
      if (r._nivelDuplicidade === 'D3') d3++;
    }
    return { valid, warning, error, duplicated, total: rows.length, fornecedorVazio, valorNegativo, contaNaoEncontrada, subcentroVazio, fazendaNaoEncontrada, selected, d1, d2, d3 };
  }, [rows, subcentrosOficiais]);

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
      case 'subcentro_nao_encontrado': return rows.filter(r => !r.subcentro || (r.subcentro && subcentrosOficiais && subcentrosOficiais.size > 0 && !subcentrosOficiais.has(r.subcentro)));
      case 'fazenda_nao_encontrada': return rows.filter(r => r.fazenda && !r.fazendaId);
      default: return rows;
    }
  }, [rows, statusFilter, subcentrosOficiais]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Selection
  const toggleSelect = (linha: number) => {
    setRows(prev => prev.map(r => r.linha === linha ? { ...r, _selected: !r._selected } : r));
  };

  const bulkSelect = (predicate: (r: EditableRow) => boolean) => {
    setRows(prev => prev.map(r => ({ ...r, _selected: predicate(r) })));
  };

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
      if (!candidateMap) return nextRows;
      return nextRows.map(r => {
        const result = checkDuplicate(r, candidateMap);
        const validation = validateRow(r, contaLookup, fazendaLookup, result.isDuplicate);
        return { ...r, _validation: validation, _resolved: resolveInfo(r, contaLookup, fazendaLookup), _isDuplicate: result.isDuplicate, _nivelDuplicidade: result.nivel, _existingMatch: result.match };
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
  const handleImport = async () => {
    const toImport = rows.filter(r => r._selected && r._validation.status !== 'error');
    if (toImport.length === 0) return;
    setImporting(true);
    const clean: LinhaImportada[] = toImport.map(({ _validation, _resolved, _isDuplicate, _selected, _existingMatch, _nivelDuplicidade, ...rest }) => rest);
    const ok = await onConfirmar(clean);
    setImporting(false);
    if (ok) onClose();
  };

  const selectedImportable = rows.filter(r => r._selected && r._validation.status !== 'error').length;
  const isLoading = loadingCandidates || candidateMap === null;

  const visibleExcelHeaders = useMemo(() => excelHeaders.filter(h => h && h !== ''), [excelHeaders]);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => r._selected);
  const toggleFilteredSelection = () => {
    const linhaSet = new Set(filteredRows.map(r => r.linha));
    if (allFilteredSelected) {
      setRows(prev => prev.map(r => linhaSet.has(r.linha) ? { ...r, _selected: false } : r));
    } else {
      setRows(prev => prev.map(r => linhaSet.has(r.linha) ? { ...r, _selected: true } : r));
    }
  };

  // Main columns for the simplified table
  const mainCols = [
    { key: 'anoMes', label: 'Competência' },
    { key: 'dataPagamento', label: 'Dt Pagto' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'produto', label: 'Produto' },
    { key: 'valor', label: 'Valor' },
    { key: 'subcentro', label: 'Centro/Subcentro' },
    { key: 'numeroDocumento', label: 'Documento' },
    { key: 'status', label: 'Status' },
  ] as const;

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
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando candidatos no banco...
          </div>
        )}

        {/* Negative values banner */}
        {!isLoading && negativeCount > 0 && (
          <div className="px-4 pb-2 shrink-0">
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-300">
                <strong>{negativeCount}</strong> valor(es) negativo(s).
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
            <SummaryCard label="Novos" value={stats.valid} color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" icon={<CheckCircle2 className="h-3 w-3" />} onClick={() => { setStatusFilter('valid'); setPage(0); }} active={statusFilter === 'valid'} />
            <SummaryCard label="Alertas" value={stats.warning} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" icon={<AlertTriangle className="h-3 w-3" />} onClick={() => { setStatusFilter('warning'); setPage(0); }} active={statusFilter === 'warning'} />
            <SummaryCard label="Duplicadas" value={stats.duplicated} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-950/30" icon={<Copy className="h-3 w-3" />} onClick={() => { setStatusFilter('duplicated'); setPage(0); }} active={statusFilter === 'duplicated'} />
            <SummaryCard label="Erros" value={stats.error} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" icon={<XCircle className="h-3 w-3" />} onClick={() => { setStatusFilter('error'); setPage(0); }} active={statusFilter === 'error'} />
          </div>
        </div>

        {/* Selection toolbar */}
        {!isLoading && (
          <div className="px-4 pb-2 shrink-0">
            <div className="rounded-lg border bg-muted/30 p-2 flex items-center gap-2 flex-wrap">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Seleção:</span>
              <Badge variant="outline" className="text-[10px] h-5 tabular-nums">
                {stats.selected}/{stats.total} selecionadas
              </Badge>
              {stats.d1 > 0 && <Badge variant="outline" className="text-[10px] h-5 text-red-600">D1: {stats.d1}</Badge>}
              {stats.d2 > 0 && <Badge variant="outline" className="text-[10px] h-5 text-orange-600">D2: {stats.d2}</Badge>}
              {stats.d3 > 0 && <Badge variant="outline" className="text-[10px] h-5 text-amber-600">D3: {stats.d3}</Badge>}
              <div className="flex gap-1 ml-auto flex-wrap">
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(() => true)}>
                  <CheckSquare className="h-3 w-3 mr-0.5" /> Todas
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(() => false)}>
                  <Square className="h-3 w-3 mr-0.5" /> Nenhuma
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(r => r._validation.status === 'valid' || r._validation.status === 'warning')}>
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Só novos
                </Button>
                {stats.duplicated > 0 && (
                  <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={() => bulkSelect(r => r._validation.status !== 'error' && r._nivelDuplicidade !== 'D1')}>
                    <Filter className="h-3 w-3 mr-0.5" /> Novos + suspeitas
                  </Button>
                )}
                {stats.d1 > 0 && (
                  <Button variant="outline" size="sm" className="h-6 text-[9px] text-red-600" onClick={() => setRows(prev => prev.map(r => r._nivelDuplicidade === 'D1' ? { ...r, _selected: false } : r))}>
                    <ShieldAlert className="h-3 w-3 mr-0.5" /> Desmarcar D1 ({stats.d1})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

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

        {/* Grid — simplified columns */}
        <TooltipProvider delayDuration={200}>
          <div className="flex-1 overflow-auto px-1 min-h-0">
            <table className="w-full text-[9px] border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="px-1 py-1.5 text-center w-6 sticky left-0 bg-background z-20">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleFilteredSelection} className="h-3 w-3" />
                  </th>
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-8">Status</th>
                  <th className="px-1 py-1.5 text-left font-semibold text-muted-foreground w-6">Ln</th>

                  {/* Excel original columns — hidden by default */}
                  {showOriginal && visibleExcelHeaders.map(h => (
                    <th key={`orig-${h}`} className="px-1.5 py-1.5 text-left font-semibold bg-blue-50/60 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 whitespace-nowrap min-w-[60px]">
                      {h}
                    </th>
                  ))}
                  {showOriginal && <th className="w-1 bg-border" />}

                  {/* Main simplified columns */}
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[60px]">Competência</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[70px]">Dt Pagto</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[120px]">Fornecedor</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[100px]">Produto</th>
                  <th className="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap min-w-[70px]">Valor</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[100px]">Centro/Subcentro</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[60px]">Documento</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap min-w-[70px]">Conta</th>
                  <th className="px-1.5 py-1.5 text-left font-semibold min-w-[120px]">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(row => (
                  <ConferenceRow
                    key={row.linha}
                    row={row}
                    showOriginal={showOriginal}
                    excelHeaders={visibleExcelHeaders}
                    contaOptions={contaOptions}
                    fazendaOptions={fazendaOptions}
                    onUpdate={updateRow}
                    onToggleSelect={toggleSelect}
                    expanded={expandedRow === row.linha}
                    onToggleExpand={() => setExpandedRow(expandedRow === row.linha ? null : row.linha)}
                    totalCols={4 + (showOriginal ? visibleExcelHeaders.length + 1 : 0) + 8 + 1}
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

function NivelBadge({ row }: { row: EditableRow }) {
  if (row._validation.status === 'error') {
    const cfg = NIVEL_LABELS.ERRO;
    return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
  }
  if (row._nivelDuplicidade && row._nivelDuplicidade !== 'LEGITIMO') {
    const cfg = NIVEL_LABELS[row._nivelDuplicidade];
    return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
  }
  const cfg = NIVEL_LABELS.NOVO;
  return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

/** Inline comparison: existing bank record shown below the imported row */
function ExistingRecordRow({ existing, imported }: { existing: ExistingRecord; imported: EditableRow }) {
  const cmpClass = (a: string | null | undefined, b: string | null | undefined) => {
    const na = norm(a); const nb = norm(b);
    if (na === nb) return 'text-muted-foreground';
    return 'text-amber-600 dark:text-amber-400 font-semibold';
  };
  const valMatch = Math.round((imported.valor || 0) * 100) === Math.round((existing.valor || 0) * 100);

  return (
    <tr className="border-b border-border/30 bg-muted/40">
      <td className="px-1 py-0.5" />
      <td className="px-1 py-0.5 text-[8px] text-muted-foreground italic" colSpan={2}>↳ banco</td>
      <td className="px-1.5 py-0.5 text-muted-foreground font-mono">{existing.ano_mes || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(imported.dataPagamento, existing.data_pagamento)}`}>{existing.data_pagamento || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(imported.fornecedor, existing.favorecido_nome)}`}>{existing.favorecido_nome || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(imported.produto, existing.descricao)}`}>{existing.descricao || '—'}</td>
      <td className={`px-1.5 py-0.5 text-right tabular-nums font-mono ${valMatch ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400 font-semibold'}`}>
        {existing.valor != null ? `R$ ${existing.valor.toFixed(2)}` : '—'}
      </td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(imported.subcentro, existing.subcentro)}`}>{existing.subcentro || '—'}</td>
      <td className={`px-1.5 py-0.5 font-mono ${cmpClass(imported.numeroDocumento, existing.numero_documento)}`}>{existing.numero_documento || '—'}</td>
      <td className="px-1.5 py-0.5 text-muted-foreground font-mono text-[8px]">{existing.conta_bancaria_id ? '✓' : '—'}</td>
      <td className="px-1.5 py-0.5" />
    </tr>
  );
}

function ConferenceRow({ row, showOriginal, excelHeaders, contaOptions, fazendaOptions, onUpdate, onToggleSelect, expanded, onToggleExpand, totalCols }: {
  row: EditableRow;
  showOriginal: boolean;
  excelHeaders: string[];
  contaOptions: { value: string; label: string }[];
  fazendaOptions: { value: string; label: string }[];
  onUpdate: (linha: number, field: keyof LinhaImportada, value: string | number | null) => void;
  onToggleSelect: (linha: number) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  totalCols: number;
}) {
  const v = row._validation;
  const r = row._resolved;
  const bgClass = v.status === 'error' ? 'bg-red-50/60 dark:bg-red-950/20'
    : v.status === 'duplicated' ? 'bg-blue-50/60 dark:bg-blue-950/20'
    : v.status === 'warning' ? 'bg-amber-50/60 dark:bg-amber-950/20' : '';

  const origCellCls = 'px-1.5 py-0.5 text-muted-foreground font-mono bg-blue-50/20 dark:bg-blue-950/5 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis';
  const hasMatch = row._existingMatch && row._nivelDuplicidade && row._nivelDuplicidade !== 'LEGITIMO';

  return (
    <>
      <tr className={`border-b border-border/50 ${bgClass} ${!row._selected ? 'opacity-50' : ''} hover:bg-muted/30`}>
        {/* Checkbox */}
        <td className="px-1 py-0.5 text-center sticky left-0 bg-background z-10">
          <Checkbox checked={row._selected} onCheckedChange={() => onToggleSelect(row.linha)} className="h-3 w-3" disabled={v.status === 'error'} />
        </td>
        {/* Status + expand */}
        <td className="px-1 py-0.5">
          <div className="flex items-center gap-0.5">
            <NivelBadge row={row} />
            {hasMatch && (
              <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground">
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>
        </td>
        <td className="px-1 py-0.5 text-muted-foreground tabular-nums">{row.linha}</td>

        {/* Excel original */}
        {showOriginal && excelHeaders.map(h => (
          <td key={`orig-${h}`} className={origCellCls} title={row.rawExcel?.[h] || ''}>
            {row.rawExcel?.[h] || ''}
          </td>
        ))}
        {showOriginal && <td className="w-1 bg-border" />}

        {/* Main columns */}
        <td className="px-1.5 py-0.5 tabular-nums">{row.anoMes || '—'}</td>
        <td className="px-1.5 py-0.5 tabular-nums">{row.dataPagamento || '—'}</td>
        <td className="px-1.5 py-0.5 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.fornecedor || ''}>
          {row.fornecedor || <span className="text-muted-foreground italic">vazio</span>}
        </td>
        <td className="px-1.5 py-0.5 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.produto || ''}>
          {row.produto || row.subcentro || '—'}
        </td>
        <td className="px-1.5 py-0.5 text-right tabular-nums font-bold text-[10px]">
          {row.valor != null ? `R$ ${row.valor.toFixed(2)}` : '—'}
        </td>
        <td className="px-1.5 py-0.5 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.subcentro || ''}>
          {row.subcentro || '—'}
        </td>
        <td className="px-1.5 py-0.5 tabular-nums">{row.numeroDocumento || '—'}</td>
        <td className="px-1.5 py-0.5 text-[8px]">
          {r.contaResolvidaNome ? (
            <span className="text-green-600" title={r.contaResolvidaNome}>✓ {r.contaResolvidaNome.substring(0, 12)}</span>
          ) : (
            <span className="text-red-500">{row.contaOrigem?.substring(0, 12) || '—'}</span>
          )}
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

      {/* Expanded: show existing bank record inline for comparison */}
      {expanded && hasMatch && row._existingMatch && (
        <ExistingRecordRow existing={row._existingMatch} imported={row} />
      )}
    </>
  );
}
