/**
 * Modal de Auditoria — abre ao clicar num valor do Fluxo de Caixa (modo Amplo).
 * Mostra lançamentos reais filtrados hierarquicamente.
 * Layout: Header fixo → Tabela com scroll → Footer fixo.
 */
import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { formatMoeda } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import {
  isRealizado,
  isEntrada as isEntradaClass,
  isSaida as isSaidaClass,
  datePagtoMes,
  datePagtoAno,
  type LancamentoClassificavel,
} from '@/lib/financeiro/classificacao';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { FluxoDrillPayload } from './FluxoFinanceiro';
import { Pencil } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: FluxoDrillPayload | null;
  lancamentos: FinanceiroLancamento[];
  valorClicado: number;
  onEditLancamento?: (lancamento: FinanceiroLancamento) => void;
}

export function FluxoAuditoriaModal({ open, onClose, payload, lancamentos, valorClicado, onEditLancamento }: Props) {
  const filtered = useMemo(() => {
    if (!payload) return [];

    return lancamentos.filter(l => {
      if (!isRealizado(l as LancamentoClassificavel)) return false;
      if (payload.tipo === 'entrada' && !isEntradaClass(l as LancamentoClassificavel)) return false;
      if (payload.tipo === 'saida' && !isSaidaClass(l as LancamentoClassificavel)) return false;
      if (datePagtoAno(l as LancamentoClassificavel) !== payload.ano) return false;
      if (payload.mes !== null) {
        if (datePagtoMes(l as LancamentoClassificavel) !== payload.mes) return false;
      }

      const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim();
      if (payload.macro && norm(l.macro_custo) !== norm(payload.macro)) return false;
      if (payload.grupo && norm(l.grupo_custo) !== norm(payload.grupo)) return false;
      if (payload.centro && norm(l.centro_custo) !== norm(payload.centro)) return false;
      if (payload.subcentro && norm(l.subcentro) !== norm(payload.subcentro)) return false;

      return true;
    });
  }, [payload, lancamentos]);

  const totalLanc = useMemo(
    () => filtered.reduce((s, l) => s + Math.abs(l.valor), 0),
    [filtered],
  );

  const diff = totalLanc - valorClicado;
  const hasDiff = Math.abs(diff) > 0.01;

  if (!payload) return null;

  const mesLabel = payload.mes ? MESES_NOMES[payload.mes - 1] : 'Acumulado';
  const hierarquia = [payload.macro, payload.grupo, payload.centro, payload.subcentro].filter(Boolean).join(' › ');
  const tipoLabel = payload.tipo === 'entrada' ? 'Entrada' : 'Saída';
  const isEntrada = payload.tipo === 'entrada';
  const valColor = isEntrada ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        {/* ── HEADER FIXO ── */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0 bg-muted/40">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <DialogTitle className="text-sm font-bold flex items-center gap-1.5 truncate">
                🔎 Auditoria — {hierarquia}
              </DialogTitle>
              <DialogDescription className="text-[10px] text-muted-foreground">
                {tipoLabel} · {mesLabel}/{payload.ano} · {filtered.length} lançamentos
              </DialogDescription>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-[10px] text-muted-foreground">
                Valor clicado: <span className={`font-bold font-mono ${valColor}`}>{formatMoeda(valorClicado)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Total encontrado: <span className={`font-bold font-mono ${valColor}`}>{formatMoeda(totalLanc)}</span>
              </div>
              {hasDiff && (
                <div className="text-[10px] font-bold text-destructive">
                  Δ Diferença: {formatMoeda(diff)}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ── TABELA COM SCROLL ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 pb-1">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-xs">
                Nenhum lançamento encontrado para este filtro.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold whitespace-nowrap w-[72px]">Data Pgto</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-[120px]">Fornecedor</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold min-w-[140px]">Produto / Histórico</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-[90px]">Centro</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-[90px]">Subcentro</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold text-right w-[85px]">Valor</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-[60px]">Status</TableHead>
                    {onEditLancamento && (
                      <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-[36px]" />
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l, idx) => (
                    <TableRow
                      key={l.id}
                      className={`hover:bg-accent/40 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/15'}`}
                    >
                      <TableCell className="text-[9px] px-1.5 py-1 whitespace-nowrap">{l.data_pagamento || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 truncate max-w-[120px]" title={l.fornecedor || undefined}>{l.fornecedor || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 truncate max-w-[200px]" title={l.produto || undefined}>{l.produto || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 truncate max-w-[90px]" title={l.centro_custo || undefined}>{l.centro_custo || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 truncate max-w-[90px]" title={l.subcentro || undefined}>{l.subcentro || '-'}</TableCell>
                      <TableCell className={`text-[9px] px-1.5 py-1 text-right font-mono font-bold whitespace-nowrap ${valColor}`}>
                        {formatMoeda(Math.abs(l.valor))}
                      </TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 truncate">{l.status_transacao || '-'}</TableCell>
                      {onEditLancamento && (
                        <TableCell className="px-1 py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 hover:bg-primary/10"
                            onClick={() => onEditLancamento(l)}
                            title="Editar lançamento"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>

        {/* ── RODAPÉ FIXO ── */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-[10px] shrink-0 bg-muted/40">
          <span className="text-muted-foreground font-medium">{filtered.length} lançamentos</span>
          <div className="flex items-center gap-4">
            <span className={`font-bold font-mono text-xs ${valColor}`}>
              Total: {formatMoeda(totalLanc)}
            </span>
            {hasDiff && (
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
