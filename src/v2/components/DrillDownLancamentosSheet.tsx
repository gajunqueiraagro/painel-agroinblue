/**
 * DrillDownLancamentosSheet — Onda 1 drill-down GMD.
 *
 * Sheet lateral que lista lançamentos agregados em uma célula da
 * Conferência Mensal (EvolucaoCategoriaTab) para edição rápida do
 * lançamento original.
 *
 * Tipos editáveis via modal standalone (linha clicável):
 *   - Compra, Venda, Abate, Transferência Saída/Entrada
 *
 * Tipos com fallback gracioso (linha desabilitada + tooltip + toast.info):
 *   - Nascimento, Morte, Consumo (formulário inline em LancamentosTab,
 *     sem modal standalone disponível)
 *
 * Reclassificação NÃO entra aqui (Onda 2, briefing próprio).
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Pencil, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { Lancamento } from '@/types/cattle';

const MESES_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Tipos editáveis via modal standalone (Onda 1). */
const TIPOS_EDITAVEIS_MODAL = new Set<string>([
  'compra',
  'venda',
  'abate',
  'transferencia_saida',
  'transferencia_entrada',
]);

const TIPO_LABEL: Record<string, string> = {
  compra: 'Compra',
  venda: 'Venda',
  abate: 'Abate',
  transferencia_entrada: 'Transf. Entrada',
  transferencia_saida: 'Transf. Saída',
  nascimento: 'Nascimento',
  morte: 'Morte',
  consumo: 'Consumo',
  reclassificacao: 'Reclassificação',
};

const TIPO_COR: Record<string, string> = {
  compra: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  venda: 'bg-rose-100 text-rose-800 border-rose-200',
  abate: 'bg-rose-100 text-rose-800 border-rose-200',
  transferencia_entrada: 'bg-blue-100 text-blue-800 border-blue-200',
  transferencia_saida: 'bg-amber-100 text-amber-800 border-amber-200',
  nascimento: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  morte: 'bg-slate-200 text-slate-700 border-slate-300',
  consumo: 'bg-slate-200 text-slate-700 border-slate-300',
};

interface CelulaInfo {
  ano: string;
  mes: number;
  cenario: 'realizado' | 'meta';
  categoria: string;
  categoriaNome?: string;
  coluna: 'ent_ext' | 'sai_ext';
}

interface Props {
  open: boolean;
  onClose: () => void;
  cel: CelulaInfo | null;
  lancamentos: Lancamento[];
  /** Callback para tipos editáveis via modal (Compra/Venda/Abate/Transferência). */
  onSelectEditable: (l: Lancamento) => void;
}

function fmtData(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getFornecedorOuComprador(l: Lancamento): string {
  // Convenção: compra/transferencia_entrada usam fazendaOrigem como fornecedor;
  // venda/abate/transferencia_saida usam fazendaDestino como destino/comprador.
  if (l.tipo === 'compra' || l.tipo === 'transferencia_entrada') {
    return l.fazendaOrigem || '—';
  }
  if (l.tipo === 'venda' || l.tipo === 'abate' || l.tipo === 'transferencia_saida') {
    return l.fazendaDestino || '—';
  }
  return l.fazendaOrigem || l.fazendaDestino || '—';
}

export function DrillDownLancamentosSheet({ open, onClose, cel, lancamentos, onSelectEditable }: Props) {
  if (!cel) return null;

  const colunaLabel = cel.coluna === 'ent_ext' ? 'Entrada Externa' : 'Saída Externa';
  const cenarioLabel = cel.cenario === 'meta' ? 'Meta' : 'Realizado';
  const mesLabel = MESES_LABELS[cel.mes] ?? String(cel.mes);
  const totalCab = lancamentos.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {colunaLabel} — {cel.categoriaNome || cel.categoria}
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            {mesLabel}/{cel.ano} · {cenarioLabel} · {lancamentos.length} lançamento{lancamentos.length === 1 ? '' : 's'} · {fmtNum(totalCab)} cab
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {lancamentos.length === 0 && (
            <div className="text-[12px] text-muted-foreground py-6 text-center">
              Nenhum lançamento encontrado para esta célula.
            </div>
          )}

          {lancamentos.map((l) => {
            const editavel = TIPOS_EDITAVEIS_MODAL.has(l.tipo);
            const fornecedor = getFornecedorOuComprador(l);
            const tipoLabel = TIPO_LABEL[l.tipo] ?? l.tipo;
            const tipoCor = TIPO_COR[l.tipo] ?? 'bg-muted text-muted-foreground border-border';

            return (
              <div
                key={l.id}
                className={`grid grid-cols-[64px_110px_70px_70px_1fr_36px] gap-2 items-center px-2 py-1.5 rounded border border-border/40 text-[11px] ${
                  editavel ? 'hover:bg-muted/40 transition-colors' : 'opacity-70'
                }`}
              >
                <span className="text-muted-foreground tabular-nums">{fmtData(l.data)}</span>
                <Badge variant="outline" className={`text-[10px] font-medium ${tipoCor}`}>
                  {tipoLabel}
                </Badge>
                <span className="tabular-nums text-right font-medium">{fmtNum(l.quantidade)} cab</span>
                <span className="tabular-nums text-right text-muted-foreground">{fmtNum(l.pesoMedioKg, 1)} kg</span>
                <span className="truncate text-muted-foreground" title={fornecedor + (l.observacao ? ' · ' + l.observacao : '')}>
                  {fornecedor}
                  {l.observacao ? <span className="text-muted-foreground/70"> · {l.observacao}</span> : null}
                </span>

                {editavel ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onSelectEditable(l)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 cursor-not-allowed"
                          onClick={() => toast.info('Edição inline disponível em Movimentações')}
                        >
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[11px]">
                        Edição inline disponível em Movimentações
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
