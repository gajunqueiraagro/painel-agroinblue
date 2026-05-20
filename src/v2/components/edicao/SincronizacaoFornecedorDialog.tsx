/**
 * SincronizacaoFornecedorDialog — confirmação explícita ao trocar fornecedor
 * de uma compra zoo que já possui parcelas financeiras vinculadas.
 *
 * Z4 (zoo-fornecedor): aparece ANTES do save zoo, mostrando breakdown REAL
 * das parcelas (sincronizáveis vs congeladas).
 *
 * REGRAS SOBERANAS (Gabriel):
 *  - Parcelas conciliadas (conciliado_em IS NOT NULL) NUNCA alteradas.
 *  - Parcelas realizadas (status_transacao='realizado') NUNCA alteradas.
 *  - Apenas demais (cancelado=false + conciliado_em=null + status!='realizado')
 *    são sincronizáveis.
 *  - Modal mostra breakdown real, sem mensagens genéricas.
 *  - Atomicidade lógica: UPDATE de parcelas falhar → zoo NÃO salva
 *    (responsabilidade do caller via onAtualizar).
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, CheckCircle, Lock } from 'lucide-react';

export interface ParcelaInfo {
  id: string;
  descricao: string | null;
  valor: number;
  data_competencia: string | null;
  data_pagamento: string | null;
  status_transacao: string | null;
  conciliado_em: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedorAntigo: { id: string | null; nome: string | null };
  fornecedorNovo: { id: string | null; nome: string | null };
  parcelas: {
    sincronizaveis: ParcelaInfo[];
    congeladas: ParcelaInfo[];
  };
  /** Atualiza sincronizáveis com novo favorecido_id E salva zoo (transacional). */
  onAtualizar: () => Promise<void>;
  /** Apenas salva zoo, deixa parcelas com favorecido antigo (registra divergência). */
  onNaoTocar: () => Promise<void>;
  /** Fecha modal sem nada. Caller reverte fornecedor. */
  onCancelar: () => void;
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  // YYYY-MM-DD → DD/MM/YYYY (sem parseISO para evitar timezone shift)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function motivoCongelada(p: ParcelaInfo): string {
  if (p.conciliado_em) return 'conciliada';
  if (p.status_transacao === 'realizado') return 'realizada';
  return 'protegida';
}

function ParcelaLinha({ parcela, motivo }: { parcela: ParcelaInfo; motivo?: string }) {
  const dataExibida = parcela.data_pagamento || parcela.data_competencia;
  return (
    <div className="flex items-start gap-2 py-1 text-[11px] leading-snug">
      <span className="text-muted-foreground">•</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium truncate">{parcela.descricao || '(sem descrição)'}</span>
          <span className="tabular-nums font-semibold">{fmtBRL(parcela.valor)}</span>
          <span className="text-muted-foreground tabular-nums">{fmtData(dataExibida)}</span>
          {parcela.status_transacao && (
            <span className="text-[10px] px-1 py-px rounded bg-muted text-muted-foreground">
              {parcela.status_transacao}
            </span>
          )}
        </div>
        {motivo && (
          <div className="text-[10px] text-muted-foreground italic mt-0.5">
            Motivo: {motivo}
          </div>
        )}
      </div>
    </div>
  );
}

export function SincronizacaoFornecedorDialog({
  open,
  onOpenChange,
  fornecedorAntigo,
  fornecedorNovo,
  parcelas,
  onAtualizar,
  onNaoTocar,
  onCancelar,
}: Props) {
  const sincQtd = parcelas.sincronizaveis.length;
  const congQtd = parcelas.congeladas.length;
  const totalQtd = sincQtd + congQtd;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancelar(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fornecedor zoo alterado</DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-foreground">
              <span className="text-muted-foreground text-[11px]">De:</span>
              <span className="font-medium">{fornecedorAntigo.nome ?? '(sem fornecedor)'}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{fornecedorNovo.nome ?? '(sem fornecedor)'}</span>
            </div>
            <div className="text-[12px]">
              <strong>{totalQtd}</strong> parcela{totalQtd !== 1 ? 's' : ''} financeira{totalQtd !== 1 ? 's' : ''} vinculada{totalQtd !== 1 ? 's' : ''} a este lançamento.
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {sincQtd > 0 && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
              <div className="flex items-center gap-1.5 mb-1 text-emerald-800 dark:text-emerald-300">
                <CheckCircle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold">Sincronizáveis ({sincQtd})</span>
              </div>
              <div className="divide-y divide-emerald-100 dark:divide-emerald-900/50">
                {parcelas.sincronizaveis.map(p => (
                  <ParcelaLinha key={p.id} parcela={p} />
                ))}
              </div>
            </div>
          )}

          {congQtd > 0 && (
            <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-2">
              <div className="flex items-center gap-1.5 mb-1 text-rose-800 dark:text-rose-300">
                <Lock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold">Congeladas ({congQtd})</span>
              </div>
              <div className="divide-y divide-rose-100 dark:divide-rose-900/50">
                {parcelas.congeladas.map(p => (
                  <ParcelaLinha key={p.id} parcela={p} motivo={motivoCongelada(p)} />
                ))}
              </div>
            </div>
          )}

          {totalQtd === 0 && (
            <div className="text-[11px] text-muted-foreground italic py-2">
              Nenhuma parcela financeira vinculada.
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter className="flex flex-col sm:flex-col gap-1.5">
          <Button
            type="button"
            onClick={() => { void onAtualizar(); }}
            disabled={sincQtd === 0}
            className="w-full justify-start"
          >
            Atualizar {sincQtd} parcela{sincQtd !== 1 ? 's' : ''} sincronizá{sincQtd !== 1 ? 'veis' : 'vel'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void onNaoTocar(); }}
            className="w-full justify-start"
          >
            Não tocar nas parcelas (registrar divergência)
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelar}
            className="w-full justify-start"
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
