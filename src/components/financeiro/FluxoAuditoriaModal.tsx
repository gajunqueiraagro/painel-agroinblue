/**
 * Modal de Auditoria — abre ao clicar num valor do Fluxo de Caixa (modo Amplo).
 * Mostra lançamentos reais filtrados POR IDs do nó — nunca refaz filtro textual.
 * Layout: Header fixo → Tabela com scroll (header sticky azul) → Footer fixo.
 *
 * Funcionalidades de auditoria:
 *  - Ordenação por coluna (clique no cabeçalho)
 *  - Filtro por tipo de inconsistência (clicável no header)
 *  - Destaque visual em linhas inconsistentes
 *  - Botão de edição em cada linha (abre dialog overlay, preserva contexto)
 *  - Alerta de divergência no rodapé
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatMoeda } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { FluxoDrillPayload, Inconsistencia, InconsistenciaTipo } from './FluxoFinanceiro';
import { Pencil, AlertTriangle, Filter, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

const INCONSISTENCIA_LABELS: Record<InconsistenciaTipo, string> = {
  sem_macro: 'Sem macro',
  macro_sem_grupo: 'Macro sem grupo',
  grupo_sem_centro: 'Grupo sem centro',
  centro_sem_subcentro: 'Centro sem subcentro',
  subcentro_fora_plano: 'Subcentro fora do plano',
};

interface Props {
  open: boolean;
  onClose: () => void;
  payload: FluxoDrillPayload | null;
  lancamentos: FinanceiroLancamento[];
  valorClicado: number;
  onEditLancamento?: (lancamento: FinanceiroLancamento) => void;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = 'data_pagamento' | 'fornecedor' | 'produto' | 'centro_custo' | 'subcentro' | 'valor' | 'status_transacao';
type SortDir = 'asc' | 'desc';

const TEXT_KEYS: SortKey[] = ['fornecedor', 'produto', 'centro_custo', 'subcentro', 'status_transacao'];

function compareLanc(a: FinanceiroLancamento, b: FinanceiroLancamento, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  if (key === 'valor') {
    cmp = Math.abs(a.valor) - Math.abs(b.valor);
  } else if (key === 'data_pagamento') {
    const da = a.data_pagamento || '';
    const db = b.data_pagamento || '';
    cmp = da.localeCompare(db);
  } else {
    const va = ((a as any)[key] || '').toLowerCase();
    const vb = ((b as any)[key] || '').toLowerCase();
    cmp = va.localeCompare(vb, 'pt-BR');
  }
  return dir === 'asc' ? cmp : -cmp;
}

// ---------------------------------------------------------------------------
// Column header component
// ---------------------------------------------------------------------------

const HEADER_BG = 'hsl(215 50% 23%)'; // Azul Marinho padrão do sistema

function SortableHeader({
  label, sortKey, currentKey, currentDir, onSort, align = 'left', className = '',
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`text-[9px] px-1.5 py-1.5 font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:brightness-125 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
      style={{ background: HEADER_BG, color: 'hsl(210 40% 96%)' }}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive ? (
          currentDir === 'asc'
            ? <ArrowUp className="h-2.5 w-2.5 opacity-90" />
            : <ArrowDown className="h-2.5 w-2.5 opacity-90" />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function FluxoAuditoriaModal({ open, onClose, payload, lancamentos, valorClicado, onEditLancamento }: Props) {
  const [filtroInc, setFiltroInc] = useState<InconsistenciaTipo | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      // Default direction: text = asc (A-Z), numeric/date = desc (maior primeiro)
      setSortDir(TEXT_KEYS.includes(key) ? 'asc' : 'desc');
      return key;
    });
  }, []);

  // Build a lookup map once
  const lancMap = useMemo(() => {
    const m = new Map<string, FinanceiroLancamento>();
    for (const l of lancamentos) m.set(l.id, l);
    return m;
  }, [lancamentos]);

  // All lancamentos for this node
  const allFiltered = useMemo(() => {
    if (!payload) return [];
    const idSet = new Set(payload.lancamentoIds);
    const result: FinanceiroLancamento[] = [];
    for (const id of idSet) {
      const l = lancMap.get(id);
      if (l) result.push(l);
    }
    return result;
  }, [payload, lancMap]);

  // Inconsistency index by lancamento id
  const incByLancId = useMemo(() => {
    if (!payload) return new Map<string, Inconsistencia>();
    const m = new Map<string, Inconsistencia>();
    for (const inc of payload.inconsistencias) {
      m.set(inc.lancamentoId, inc);
    }
    return m;
  }, [payload]);

  // Inconsistency summary counts
  const incSummary = useMemo(() => {
    if (!payload || !payload.inconsistencias.length) return [];
    const counts = new Map<InconsistenciaTipo, number>();
    for (const inc of payload.inconsistencias) {
      counts.set(inc.tipo, (counts.get(inc.tipo) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([tipo, qtd]) => ({
      tipo,
      label: INCONSISTENCIA_LABELS[tipo],
      qtd,
    }));
  }, [payload]);

  // Apply inconsistency filter + sorting
  const filtered = useMemo(() => {
    let list = allFiltered;
    if (filtroInc) {
      const incIds = new Set(
        (payload?.inconsistencias ?? [])
          .filter(i => i.tipo === filtroInc)
          .map(i => i.lancamentoId)
      );
      list = list.filter(l => incIds.has(l.id));
    }
    if (sortKey) {
      list = [...list].sort((a, b) => compareLanc(a, b, sortKey, sortDir));
    }
    return list;
  }, [allFiltered, filtroInc, payload, sortKey, sortDir]);

  const totalAllLanc = useMemo(
    () => allFiltered.reduce((s, l) => s + Math.abs(l.valor), 0),
    [allFiltered],
  );

  const totalFiltered = useMemo(
    () => filtered.reduce((s, l) => s + Math.abs(l.valor), 0),
    [filtered],
  );

  // Divergence check — always compare full node total vs clicked value
  const diff = totalAllLanc - valorClicado;
  const hasDiff = Math.abs(diff) > 0.01;

  // Reset filter when modal closes
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setFiltroInc(null);
      setSortKey(null);
      onClose();
    }
  };

  if (!payload) return null;

  const mesLabel = payload.mes ? MESES_NOMES[payload.mes - 1] : 'Acumulado';
  const tipoLabel = payload.tipo === 'entrada' ? 'Entrada' : 'Saída';
  const isEntrada = payload.tipo === 'entrada';
  const valColor = isEntrada ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const hasInc = incSummary.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        {/* ── HEADER FIXO ── */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0 bg-muted/40">
          <div className="space-y-0.5 min-w-0">
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5 truncate">
              🔎 Auditoria — {payload.hierarquia}
            </DialogTitle>
            <DialogDescription className="text-[10px] text-muted-foreground">
              {tipoLabel} · {mesLabel}/{payload.ano} · {allFiltered.length} lançamentos
            </DialogDescription>
          </div>

          {/* Inconsistency alerts — clickable to filter */}
          {hasInc && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {incSummary.map(({ tipo, label, qtd }) => {
                const isActive = filtroInc === tipo;
                return (
                  <button
                    key={tipo}
                    onClick={() => setFiltroInc(isActive ? null : tipo)}
                    className={`inline-flex items-center gap-1 text-[9px] rounded px-1.5 py-0.5 cursor-pointer transition-colors border ${
                      isActive
                        ? 'bg-amber-200 dark:bg-amber-800 border-amber-400 dark:border-amber-600 ring-1 ring-amber-400'
                        : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                    }`}
                  >
                    <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                    <span className="text-amber-800 dark:text-amber-300 font-medium">{label}: {qtd}</span>
                    {isActive && <X className="h-2.5 w-2.5 text-amber-600 ml-0.5" />}
                  </button>
                );
              })}

              {filtroInc && (
                <button
                  onClick={() => setFiltroInc(null)}
                  className="inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 transition-colors"
                >
                  <Filter className="h-2.5 w-2.5" />
                  Ver todos
                </button>
              )}
            </div>
          )}

          {/* Divergence alert in header */}
          {hasDiff && (
            <div className="mt-2 flex items-center gap-1.5 text-[9px] bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              <span className="text-destructive font-medium">
                Divergência detectada: valor na árvore {formatMoeda(valorClicado)} ≠ soma dos lançamentos {formatMoeda(totalAllLanc)} (Δ {formatMoeda(diff)})
              </span>
            </div>
          )}
        </DialogHeader>

        {/* ── TABELA COM SCROLL + HEADER STICKY AZUL ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 pb-1">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-xs">
                {filtroInc
                  ? 'Nenhum lançamento com essa inconsistência.'
                  : 'Nenhum lançamento encontrado para este filtro.'}
              </div>
            ) : (
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b sticky top-0 z-10">
                  <tr className="border-b">
                    <SortableHeader label="Data Pgto" sortKey="data_pagamento" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[68px]" />
                    <SortableHeader label="Fornecedor" sortKey="fornecedor" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[110px]" />
                    <SortableHeader label="Produto" sortKey="produto" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[100px]" />
                    <SortableHeader label="Centro" sortKey="centro_custo" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[130px]" />
                    <SortableHeader label="Subcentro" sortKey="subcentro" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[140px]" />
                    <SortableHeader label="Valor" sortKey="valor" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" className="w-[80px]" />
                    <SortableHeader label="Status" sortKey="status_transacao" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="w-[55px]" />
                    {onEditLancamento && (
                      <th className="text-[9px] px-1.5 py-1.5 font-bold w-[32px]" style={{ background: HEADER_BG }} />
                    )}
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {filtered.map((l, idx) => {
                    const inc = incByLancId.get(l.id);
                    const hasIncRow = !!inc;

                    return (
                      <tr
                        key={l.id}
                        className={`border-b transition-colors hover:bg-accent/40 ${
                          idx % 2 === 0 ? '' : 'bg-muted/15'
                        } ${hasIncRow ? 'bg-amber-50/60 dark:bg-amber-950/30 border-l-2 border-l-amber-400' : ''}`}
                      >
                        <td className="text-[9px] px-1.5 py-1 whitespace-nowrap align-middle">{l.data_pagamento || '-'}</td>
                        <td className="text-[9px] px-1.5 py-1 truncate max-w-[110px] align-middle" title={l.fornecedor || undefined}>{l.fornecedor || '-'}</td>
                        <td className="text-[9px] px-1.5 py-1 truncate max-w-[100px] align-middle" title={l.produto || undefined}>{l.produto || '-'}</td>
                        <td className="text-[9px] px-1.5 py-1 truncate max-w-[130px] align-middle" title={l.centro_custo || undefined}>
                          {l.centro_custo || <span className="text-amber-500 italic">vazio</span>}
                        </td>
                        <td className="text-[9px] px-1.5 py-1 align-middle">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="truncate max-w-[100px]" title={l.subcentro || undefined}>
                              {l.subcentro || <span className="text-amber-500 italic">vazio</span>}
                            </span>
                            {hasIncRow && (
                              <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 shrink-0 border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/40">
                                {INCONSISTENCIA_LABELS[inc.tipo]}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className={`text-[9px] px-1.5 py-1 text-right font-mono font-bold whitespace-nowrap align-middle ${valColor}`}>
                          {formatMoeda(Math.abs(l.valor))}
                        </td>
                        <td className="text-[9px] px-1.5 py-1 truncate align-middle">{l.status_transacao || '-'}</td>
                        {onEditLancamento && (
                          <td className="px-1 py-1 align-middle">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-5 w-5 ${hasIncRow ? 'hover:bg-amber-200/60 dark:hover:bg-amber-800/40 text-amber-700 dark:text-amber-400' : 'hover:bg-primary/10'}`}
                              onClick={() => onEditLancamento(l)}
                              title="Editar lançamento"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </ScrollArea>

        {/* ── RODAPÉ FIXO ── */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-[10px] shrink-0 bg-muted/40">
          <span className="text-muted-foreground font-medium">
            {filtroInc
              ? `${filtered.length} inconsistentes de ${allFiltered.length}`
              : `${filtered.length} lançamentos`}
          </span>
          <div className="flex items-center gap-3">
            <span className={`font-bold font-mono text-xs ${valColor}`}>
              Total: {formatMoeda(filtroInc ? totalFiltered : totalAllLanc)}
            </span>
            {hasDiff && !filtroInc && (
              <span className="font-bold font-mono text-xs text-destructive">
                Δ {formatMoeda(diff)}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
