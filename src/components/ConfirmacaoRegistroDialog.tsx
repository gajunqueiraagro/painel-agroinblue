import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { STATUS_LABEL } from '@/lib/statusOperacional';

interface DadosOperacionais {
  status: string;
  data: string;
  quantidade: number;
  categoria: string;
  pesoKg: number;
  fazendaOrigem?: string;
  fazendaDestino?: string;
  observacao?: string;
}

interface DadosFinanceiros {
  tipoOperacao: string;       // "Compra", "Abate", "Venda em Pé"
  fornecedorOuFrigorifico?: string;
  precoBase?: number;
  precoBaseLabel?: string;     // "R$/kg", "R$/@", etc.
  totalBruto?: number;
  totalBonus?: number;
  totalDescontos?: number;
  formaPagamento?: string;     // "À vista", "A prazo"
  parcelas?: { data: string; valor: number }[];
  valorLiquido?: number;
  // Abate-specific
  rendCarcaca?: number;
  totalArrobas?: number;
  comercializacao?: string;
  tipoAbate?: string;
  dataVenda?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operacionais: DadosOperacionais;
  financeiros: DadosFinanceiros;
  submitting?: boolean;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  conciliado: { label: 'Realizado', cls: 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400' },
  confirmado: { label: 'Programado', cls: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' },
  previsto: { label: 'Previsto', cls: 'bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400' },
};

function fmtDate(d?: string) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; }
}

export function ConfirmacaoRegistroDialog({ open, onClose, onConfirm, operacionais, financeiros, submitting }: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === operacionais.categoria)?.label || operacionais.categoria;
  const statusCfg = STATUS_MAP[operacionais.status] || STATUS_MAP.conciliado;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <CheckCircle className="h-5 w-5 text-primary" />
            Confirmar {financeiros.tipoOperacao}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Revise os dados antes de confirmar o registro.
          </DialogDescription>
        </DialogHeader>

        {/* Dados Operacionais */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Dados Operacionais</h4>
          <div className="bg-muted/30 rounded-md p-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusCfg.cls}`}>{statusCfg.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <strong>{fmtDate(operacionais.data)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantidade</span>
              <strong>{operacionais.quantidade} cab.</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Categoria</span>
              <strong>{catLabel}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso médio</span>
              <strong>{operacionais.pesoKg} kg</strong>
            </div>
            {operacionais.fazendaOrigem && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Origem</span>
                <strong>{operacionais.fazendaOrigem}</strong>
              </div>
            )}
            {operacionais.fazendaDestino && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destino</span>
                <strong>{operacionais.fazendaDestino}</strong>
              </div>
            )}
            {operacionais.observacao && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Observação</span>
                <strong className="text-right max-w-[60%] truncate">{operacionais.observacao}</strong>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Dados Financeiros */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Dados Financeiros</h4>
          <div className="bg-muted/30 rounded-md p-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <strong>{financeiros.tipoOperacao}</strong>
            </div>
            {financeiros.fornecedorOuFrigorifico && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fornecedor / Frigorífico</span>
                <strong className="text-right max-w-[50%] truncate">{financeiros.fornecedorOuFrigorifico}</strong>
              </div>
            )}
            {financeiros.comercializacao && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Comercialização</span>
                <strong>{financeiros.comercializacao}</strong>
              </div>
            )}
            {financeiros.tipoAbate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo de Abate</span>
                <strong>{financeiros.tipoAbate === 'vivo' ? 'Peso vivo' : 'Peso morto'}</strong>
              </div>
            )}
            {financeiros.rendCarcaca && financeiros.rendCarcaca > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rend. Carcaça</span>
                <strong>{financeiros.rendCarcaca.toFixed(2)}%</strong>
              </div>
            )}
            {financeiros.totalArrobas && financeiros.totalArrobas > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Arrobas</span>
                <strong>{financeiros.totalArrobas.toFixed(2)} @</strong>
              </div>
            )}
            {financeiros.precoBase && financeiros.precoBase > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preço base {financeiros.precoBaseLabel || ''}</span>
                <strong>{formatMoeda(financeiros.precoBase)}</strong>
              </div>
            )}
            {financeiros.totalBruto && financeiros.totalBruto > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor bruto</span>
                <strong>{formatMoeda(financeiros.totalBruto)}</strong>
              </div>
            )}
            {financeiros.totalBonus && financeiros.totalBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bônus</span>
                <strong className="text-green-600">+{formatMoeda(financeiros.totalBonus)}</strong>
              </div>
            )}
            {financeiros.totalDescontos && financeiros.totalDescontos > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descontos</span>
                <strong className="text-destructive">-{formatMoeda(financeiros.totalDescontos)}</strong>
              </div>
            )}
            {financeiros.dataVenda && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data da Venda</span>
                <strong>{fmtDate(financeiros.dataVenda)}</strong>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Resumo Final */}
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Resumo Final</h4>
          <div className="bg-primary/10 rounded-md p-2 space-y-1">
            {financeiros.formaPagamento && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Pagamento</span>
                <strong>{financeiros.formaPagamento}</strong>
              </div>
            )}
            {financeiros.parcelas && financeiros.parcelas.length > 1 && (
              <div className="space-y-0.5">
                {financeiros.parcelas.map((p, i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Parcela {i + 1}/{financeiros.parcelas!.length} — {fmtDate(p.data)}</span>
                    <span className="font-semibold">{formatMoeda(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            {financeiros.valorLiquido !== undefined && financeiros.valorLiquido > 0 && (
              <div className="flex justify-between text-[13px] font-bold pt-1">
                <span>Valor Líquido Total</span>
                <span className="text-primary">{formatMoeda(financeiros.valorLiquido)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Voltar e editar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Registrando...' : `Confirmar ${financeiros.tipoOperacao}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
