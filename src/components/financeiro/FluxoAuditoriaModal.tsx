/**
 * Modal de Auditoria — abre ao clicar num valor do Fluxo de Caixa (modo Amplo).
 * Mostra lançamentos reais filtrados hierarquicamente.
 */
import { useMemo, useState } from 'react';
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

      // Tipo
      if (payload.tipo === 'entrada' && !isEntradaClass(l as LancamentoClassificavel)) return false;
      if (payload.tipo === 'saida' && !isSaidaClass(l as LancamentoClassificavel)) return false;

      // Ano
      if (datePagtoAno(l as LancamentoClassificavel) !== payload.ano) return false;

      // Mês (null = Total → all months up to context)
      if (payload.mes !== null) {
        if (datePagtoMes(l as LancamentoClassificavel) !== payload.mes) return false;
      }

      // Hierarchical filters — only apply the levels present in the payload
      const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim();

      if (payload.macro) {
        if (norm(l.macro_custo) !== norm(payload.macro)) return false;
      }
      if (payload.grupo) {
        if (norm(l.grupo_custo) !== norm(payload.grupo)) return false;
      }
      if (payload.centro) {
        if (norm(l.centro_custo) !== norm(payload.centro)) return false;
      }
      if (payload.subcentro) {
        if (norm(l.subcentro) !== norm(payload.subcentro)) return false;
      }

      return true;
    });
  }, [payload, lancamentos]);

  const totalLanc = useMemo(
    () => filtered.reduce((s, l) => s + Math.abs(l.valor), 0),
    [filtered],
  );

  const diff = Math.abs(totalLanc - valorClicado);
  const hasDiff = diff > 0.01;

  if (!payload) return null;

  const mesLabel = payload.mes ? MESES_NOMES[payload.mes - 1] : 'Acumulado';
  const hierarquia = [payload.macro, payload.grupo, payload.centro, payload.subcentro].filter(Boolean).join(' › ');
  const tipoLabel = payload.tipo === 'entrada' ? 'Entrada' : 'Saída';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        {/* Fixed header */}
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border space-y-1 shrink-0 bg-muted/50">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            🔍 Auditoria — {hierarquia}
          </DialogTitle>
          <DialogDescription className="text-[10px] text-muted-foreground">
            {tipoLabel} · {mesLabel}/{payload.ano} · {filtered.length} lançamentos
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 pb-2">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-xs">
                Nenhum lançamento encontrado para este filtro.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="text-[9px] px-1.5 py-1.5 whitespace-nowrap font-bold">Data Pgto</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Fornecedor</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Produto</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Macro</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Grupo</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Centro</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Subcentro</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 text-right font-bold">Valor</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1.5 font-bold">Status</TableHead>
                    {onEditLancamento && (
                      <TableHead className="text-[9px] px-1.5 py-1.5 font-bold w-8" />
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-[9px] px-1.5 py-1 whitespace-nowrap">{l.data_pagamento || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[100px] truncate">{l.fornecedor || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[100px] truncate">{l.produto || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[80px] truncate">{l.macro_custo || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[80px] truncate">{l.grupo_custo || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[80px] truncate">{l.centro_custo || '-'}</TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1 max-w-[80px] truncate">{l.subcentro || '-'}</TableCell>
                      <TableCell className={`text-[9px] px-1.5 py-1 text-right font-mono font-bold whitespace-nowrap ${
                        payload.tipo === 'entrada' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatMoeda(Math.abs(l.valor))}
                      </TableCell>
                      <TableCell className="text-[9px] px-1.5 py-1">{l.status_transacao || '-'}</TableCell>
                      {onEditLancamento && (
                        <TableCell className="px-1 py-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
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

        {/* Fixed footer */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-[10px] shrink-0 bg-muted/50">
          <span className="text-muted-foreground font-medium">{filtered.length} lançamentos</span>
          <div className="flex items-center gap-3">
            <span className={`font-bold font-mono ${
              payload.tipo === 'entrada' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              Total: {formatMoeda(totalLanc)}
            </span>
            {hasDiff && (
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ⚠️ Δ {formatMoeda(diff)}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
