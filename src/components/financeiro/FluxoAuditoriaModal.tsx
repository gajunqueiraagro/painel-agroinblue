/**
 * Modal de Auditoria — abre ao clicar num valor do Fluxo de Caixa (modo Amplo).
 * Mostra lançamentos reais filtrados POR IDs do nó — nunca refaz filtro textual.
 * Layout: Header fixo → Tabela com scroll (header sticky) → Footer fixo.
 *
 * Funcionalidades de auditoria:
 *  - Filtro por tipo de inconsistência (clicável no header)
 *  - Destaque visual em linhas inconsistentes
 *  - Botão de edição em cada linha
 *  - Preservação de contexto ao editar
 */
import { useState, useMemo } from 'react';
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
import { Pencil, AlertTriangle, Filter, X } from 'lucide-react';

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

export function FluxoAuditoriaModal({ open, onClose, payload, lancamentos, valorClicado, onEditLancamento }: Props) {
  const [filtroInc, setFiltroInc] = useState<InconsistenciaTipo | null>(null);

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

  // Apply inconsistency filter
  const filtered = useMemo(() => {
    if (!filtroInc) return allFiltered;
    const incIds = new Set(
      (payload?.inconsistencias ?? [])
        .filter(i => i.tipo === filtroInc)
        .map(i => i.lancamentoId)
    );
    return allFiltered.filter(l => incIds.has(l.id));
  }, [allFiltered, filtroInc, payload]);

  const totalLanc = useMemo(
    () => filtered.reduce((s, l) => s + Math.abs(l.valor), 0),
    [filtered],
  );

  // Reset filter when modal closes/opens
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setFiltroInc(null);
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
        </DialogHeader>

        {/* ── TABELA COM SCROLL + HEADER STICKY ── */}
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
                <thead className="[&_tr]:border-b bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b transition-colors bg-muted hover:bg-muted">
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold whitespace-nowrap w-[68px] uppercase tracking-wider text-muted-foreground">Data Pgto</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold w-[110px] uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold w-[100px] uppercase tracking-wider text-muted-foreground">Produto</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold w-[130px] uppercase tracking-wider text-muted-foreground">Centro</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold w-[140px] uppercase tracking-wider text-muted-foreground">Subcentro</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-right font-bold w-[80px] uppercase tracking-wider text-muted-foreground">Valor</th>
                    <th className="text-[9px] px-1.5 py-1.5 text-left font-bold w-[55px] uppercase tracking-wider text-muted-foreground">Status</th>
                    {onEditLancamento && (
                      <th className="text-[9px] px-1.5 py-1.5 font-bold w-[32px]" />
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
          <span className={`font-bold font-mono text-xs ${valColor}`}>
            Total: {formatMoeda(totalLanc)}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
