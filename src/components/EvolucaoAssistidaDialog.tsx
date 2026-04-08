/**
 * EvolucaoAssistidaDialog — Fluxo assistido de evolução de categoria
 *
 * Conceito: mostra a categoria ANTERIOR que pode alimentar a categoria
 * do lançamento atual. Ex: lançando Bois → mostra Garrotes elegíveis.
 *
 * Nesta fase:
 *   - Apenas exibe elegibilidade, origem, destino, peso e saldo
 *   - NÃO grava movimentações automáticas
 *   - NÃO estima quantidade parcial
 */

import { ArrowRight, CheckCircle2, Info, Scale, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CATEGORIAS } from '@/types/cattle';
import type { EvolucaoSugestao } from '@/components/MetaLancamentoPanel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sugestao: EvolucaoSugestao | null;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getCategoriaLabel(codigo: string): string {
  return CATEGORIAS.find(c => c.value === codigo)?.label || codigo;
}

export function EvolucaoAssistidaDialog({ open, onOpenChange, sugestao }: Props) {
  if (!sugestao) return null;

  const { categoriaAtual, categoriaAnterior, pesoMedioAnterior, pesoEvolucao, elegivel, saldoAnterior, natureza } = sugestao;
  const isObrigatoria = natureza === 'obrigatoria';
  const progressPct = pesoEvolucao > 0 ? Math.min((pesoMedioAnterior / pesoEvolucao) * 100, 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <Scale className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            {isObrigatoria ? 'Evolução Necessária' : 'Evolução Assistida de Categoria'}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {isObrigatoria
              ? 'Categoria anterior elegível para alimentar este lançamento. A evolução é necessária para sustentar a operação.'
              : 'Categoria anterior elegível para evolução. Sugestão consultiva — nenhuma movimentação será gravada automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Fluxo visual: Anterior → Atual */}
        <div className="flex items-center justify-center gap-3 py-2">
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground uppercase font-medium">Origem</span>
            <div className="mt-1 bg-muted rounded-md px-3 py-2">
              <span className="text-[13px] font-semibold">{getCategoriaLabel(categoriaAnterior)}</span>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-orange-500 shrink-0 mt-3" />
          <div className="text-center">
            <span className="text-[10px] text-muted-foreground uppercase font-medium">Destino</span>
            <div className="mt-1 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2">
              <span className="text-[13px] font-semibold text-orange-700 dark:text-orange-400">
                {getCategoriaLabel(categoriaAtual)}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Dados da categoria anterior */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Dados da Categoria Anterior</h4>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded p-2 space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" /> Saldo disponível
              </div>
              <span className="text-[13px] font-semibold">{saldoAnterior} cab</span>
            </div>

            <div className="bg-muted/50 rounded p-2 space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Scale className="h-3 w-3" /> Peso médio
              </div>
              <span className="text-[13px] font-semibold">{fmt(pesoMedioAnterior, 1)} kg</span>
            </div>
          </div>

          {/* Barra de progresso de peso */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Peso mínimo de evolução</span>
              <span className="font-semibold">{fmt(pesoEvolucao, 0)} kg</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  elegivel
                    ? 'bg-green-500 dark:bg-green-400'
                    : 'bg-orange-400 dark:bg-orange-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Atual: {fmt(pesoMedioAnterior, 1)} kg</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Status de elegibilidade */}
        {elegivel ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-[12px] font-semibold text-green-700 dark:text-green-400">
                Categoria anterior elegível
              </span>
            </div>
            <p className="text-[10px] text-green-600 dark:text-green-500">
              {getCategoriaLabel(categoriaAnterior)} ({saldoAnterior} cab, {fmt(pesoMedioAnterior, 1)} kg) pode evoluir para {getCategoriaLabel(categoriaAtual)}.
              Para concluir, crie manualmente uma movimentação de reclassificação.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                Categoria anterior ainda não elegível
              </span>
            </div>
            <p className="text-[10px] text-amber-600 dark:text-amber-500">
              Faltam {fmt(pesoEvolucao - pesoMedioAnterior, 1)} kg no peso médio de {getCategoriaLabel(categoriaAnterior)} para atingir o mínimo de evolução.
            </p>
          </div>
        )}

        {/* Rastreabilidade */}
        <div className="flex items-start gap-1.5 text-[9px] text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 shrink-0 mt-0.5 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[240px]">
              Fonte: cfg_categoria_parametros (peso_evolucao_kg, categoria_proxima).
              Saldo/peso: vw_zoot_categoria_mensal (cenario = meta).
            </TooltipContent>
          </Tooltip>
          <span>
            Nesta fase, a evolução deve ser registrada manualmente via reclassificação.
            Quantidade exata e geração automática estarão disponíveis em fase futura.
          </span>
        </div>

        {/* Ações */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
