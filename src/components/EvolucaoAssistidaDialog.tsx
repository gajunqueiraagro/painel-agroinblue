/**
 * EvolucaoAssistidaDialog — Fluxo assistido de evolução de categoria
 *
 * Dois modos:
 *   A) Consultivo (natureza = 'sugestao'): apenas informa elegibilidade
 *   B) Executivo (natureza = 'obrigatoria'): permite registrar a evolução
 *
 * Ao registrar, grava um par oficial de reclassificação:
 *   - evol_cat_saida na categoria origem
 *   - evol_cat_entrada na categoria destino
 *   - cenario = meta, status_operacional = null
 */

import { useState, useMemo, useCallback } from 'react';
import { ArrowRight, CheckCircle2, Info, Scale, Users, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CATEGORIAS, kgToArrobas, type Lancamento } from '@/types/cattle';
import type { EvolucaoSugestao } from '@/components/MetaLancamentoPanel';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sugestao: EvolucaoSugestao | null;
  /** Data do lançamento original (mesma competência) */
  dataLancamento: string;
  /** Quantidade do lançamento original (para calcular mínimo necessário) */
  quantidadeLancamento: number;
  /** Saldo atual da categoria destino (do lançamento original) */
  saldoDestinoAtual: number;
  /** Save handler — same as onAdicionar from LancamentosTab */
  onRegistrar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  /** Called after successful save */
  onSucesso?: () => void;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getCategoriaLabel(codigo: string): string {
  return CATEGORIAS.find(c => c.value === codigo)?.label || codigo;
}

export function EvolucaoAssistidaDialog({
  open, onOpenChange, sugestao, dataLancamento,
  quantidadeLancamento, saldoDestinoAtual, onRegistrar, onSucesso,
}: Props) {
  const [qtdStr, setQtdStr] = useState('');
  const [pesoStr, setPesoStr] = useState('');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const qtdInput = useIntegerInput(qtdStr, setQtdStr);
  const pesoInput = useDecimalInput(pesoStr, setPesoStr, 2);

  const isObrigatoria = sugestao?.natureza === 'obrigatoria';

  // Pre-fill when dialog opens
  const handleOpenChange = useCallback((v: boolean) => {
    if (v && sugestao) {
      // Quantidade sugerida: mínimo entre saldo disponível e déficit
      const deficit = Math.max(0, quantidadeLancamento - saldoDestinoAtual);
      const sugerida = isObrigatoria ? Math.min(sugestao.saldoAnterior, deficit || 1) : '';
      setQtdStr(String(sugerida));
      setPesoStr(sugestao.pesoMedioAnterior > 0 ? String(sugestao.pesoMedioAnterior) : '');
      setObservacao('');
    }
    onOpenChange(v);
  }, [sugestao, quantidadeLancamento, saldoDestinoAtual, isObrigatoria, onOpenChange]);

  // Derived
  const qtd = Number(qtdStr) || 0;
  const peso = Number(pesoStr) || 0;

  const deficit = useMemo(() => {
    if (!isObrigatoria) return 0;
    return Math.max(0, quantidadeLancamento - saldoDestinoAtual);
  }, [isObrigatoria, quantidadeLancamento, saldoDestinoAtual]);

  // Validations
  const validacoes = useMemo(() => {
    if (!sugestao || !isObrigatoria) return [];
    const errs: string[] = [];
    if (qtd <= 0) errs.push('Informe a quantidade a evoluir.');
    if (qtd > sugestao.saldoAnterior) errs.push(`Quantidade (${qtd}) maior que o saldo disponível (${sugestao.saldoAnterior}).`);
    if (peso <= 0) errs.push('Informe o peso da evolução.');
    if (qtd > 0 && qtd < deficit) errs.push(`Quantidade (${qtd}) insuficiente para sustentar o lançamento (mín. ${deficit} cab).`);
    return errs;
  }, [sugestao, isObrigatoria, qtd, peso, deficit]);

  const canSave = isObrigatoria && qtd > 0 && peso > 0 && validacoes.length === 0;

  const handleRegistrar = useCallback(async () => {
    if (!sugestao || !canSave) return;
    setSaving(true);
    try {
      const result = await onRegistrar({
        data: dataLancamento,
        tipo: 'reclassificacao',
        quantidade: qtd,
        categoria: sugestao.categoriaAnterior as any,
        categoriaDestino: sugestao.categoriaAtual as any,
        pesoMedioKg: peso,
        pesoMedioArrobas: kgToArrobas(peso),
        statusOperacional: null,
        observacao: observacao || undefined,
      });

      if (result) {
        toast.success('Evolução registrada com sucesso.', {
          description: `${getCategoriaLabel(sugestao.categoriaAnterior)} → ${getCategoriaLabel(sugestao.categoriaAtual)} | ${qtd} cab | Meta`,
          style: { borderLeft: '4px solid #f97316' },
        });
        onOpenChange(false);
        onSucesso?.();
      } else {
        toast.error('Não foi possível registrar a evolução.');
      }
    } catch (err) {
      toast.error('Erro ao registrar evolução.');
    } finally {
      setSaving(false);
    }
  }, [sugestao, canSave, qtd, peso, observacao, dataLancamento, onRegistrar, onOpenChange, onSucesso]);

  if (!sugestao) return null;

  const { categoriaAtual, categoriaAnterior, pesoMedioAnterior, pesoEvolucao, elegivel, saldoAnterior } = sugestao;
  const progressPct = pesoEvolucao > 0 ? Math.min((pesoMedioAnterior / pesoEvolucao) * 100, 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* ── Header (fixed) ── */}
        <div className="p-4 pb-3">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Scale className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              {isObrigatoria ? 'Evolução Necessária' : 'Evolução Assistida'}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              {isObrigatoria
                ? 'Registre a evolução necessária para sustentar o lançamento atual.'
                : 'Categoria anterior elegível para evolução. Sugestão consultiva.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator />

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Resumo do contexto */}
          <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
            <div className="flex items-center justify-center gap-3">
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase font-medium block">Origem</span>
                <span className="text-[13px] font-semibold">{getCategoriaLabel(categoriaAnterior)}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-orange-500 shrink-0" />
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase font-medium block">Destino</span>
                <span className="text-[13px] font-semibold text-orange-600 dark:text-orange-400">{getCategoriaLabel(categoriaAtual)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] pt-1 border-t border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo origem</span>
                <span className="font-semibold">{saldoAnterior} cab</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso médio origem</span>
                <span className="font-semibold">{fmt(pesoMedioAnterior, 1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso mín. evolução</span>
                <span className="font-semibold">{fmt(pesoEvolucao, 0)} kg</span>
              </div>
              {isObrigatoria && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lançamento a sustentar</span>
                  <span className="font-semibold">{quantidadeLancamento} cab / {fmt(Number(pesoStr) || 0, 0)} kg</span>
                </div>
              )}
            </div>
          </div>

          {/* Barra de progresso de peso */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Progresso do peso para evolução</span>
              <span className="font-semibold">{progressPct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  elegivel ? 'bg-green-500 dark:bg-green-400' : 'bg-orange-400 dark:bg-orange-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Atual: {fmt(pesoMedioAnterior, 1)} kg</span>
              <span>Mín: {fmt(pesoEvolucao, 0)} kg</span>
            </div>
          </div>

          {/* Status de elegibilidade */}
          {elegivel ? (
            <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                Categoria anterior elegível — peso médio atingiu o mínimo de evolução
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
              <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Categoria anterior ainda não elegível — faltam {fmt(pesoEvolucao - pesoMedioAnterior, 1)} kg
              </span>
            </div>
          )}

          {/* ── Bloco de execução (somente obrigatória) ── */}
          {isObrigatoria && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase">
                  Evolução a registrar
                </h4>

                {deficit > 0 && (
                  <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-amber-700 dark:text-amber-400">
                      Para sustentar o lançamento em {getCategoriaLabel(categoriaAtual)}, evolua ao menos <strong>{deficit} cab</strong> de {getCategoriaLabel(categoriaAnterior)}.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold">Categoria origem</Label>
                    <Input value={getCategoriaLabel(categoriaAnterior)} disabled className="h-7 text-[11px] bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold">Categoria destino</Label>
                    <Input value={getCategoriaLabel(categoriaAtual)} disabled className="h-7 text-[11px] bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold">Quantidade a evoluir</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={qtdInput.displayValue}
                      onChange={qtdInput.onChange}
                      onBlur={qtdInput.onBlur}
                      onFocus={qtdInput.onFocus}
                      placeholder="0"
                      className="h-7 text-[11px] text-right font-bold tabular-nums border-orange-300 dark:border-orange-700"
                    />
                    <span className="text-[9px] text-muted-foreground">
                      Disponível: {saldoAnterior} cab {deficit > 0 && `· Mín: ${deficit} cab`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold">Peso (kg)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={pesoInput.displayValue}
                      onChange={pesoInput.onChange}
                      onBlur={pesoInput.onBlur}
                      onFocus={pesoInput.onFocus}
                      placeholder="0,00"
                      className="h-7 text-[11px] text-right tabular-nums border-orange-300 dark:border-orange-700"
                    />
                    <span className="text-[9px] text-muted-foreground">
                      Peso médio atual: {fmt(pesoMedioAnterior, 1)} kg
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold">Observação (opcional)</Label>
                  <Textarea
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    placeholder="Motivo ou detalhes da evolução..."
                    className="h-14 text-[11px] resize-none"
                  />
                </div>

                {/* Validation errors */}
                {validacoes.length > 0 && qtd > 0 && (
                  <div className="space-y-1">
                    {validacoes.map((msg, i) => (
                      <div key={i} className="flex items-start gap-1.5 bg-destructive/10 text-destructive rounded p-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="text-[10px] font-medium">{msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Rastreabilidade */}
          <div className="flex items-start gap-1.5 text-[9px] text-muted-foreground pt-1">
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
              {isObrigatoria
                ? 'A evolução será gravada como reclassificação oficial em cenário Meta, com rastreabilidade completa.'
                : 'Nesta fase, a evolução deve ser registrada manualmente via reclassificação.'}
            </span>
          </div>
        </div>

        <Separator />

        {/* ── Footer (fixed) ── */}
        <div className="p-4 pt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isObrigatoria ? 'Cancelar' : 'Fechar'}
          </Button>
          {isObrigatoria && (
            <Button
              size="sm"
              onClick={handleRegistrar}
              disabled={!canSave || saving}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {saving ? 'Registrando...' : 'Registrar evolução'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
