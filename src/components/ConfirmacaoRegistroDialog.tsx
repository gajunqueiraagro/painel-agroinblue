import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda, formatArroba } from '@/lib/calculos/formatters';
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
  tipoOperacao: string;       // "Compra", "Abate", "Venda em Pé", "Boitel"
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
  // Full breakdown (from buildAbateCalculation)
  valorBase?: number;
  funruralTotal?: number;
  liqArroba?: number;
  liqCabeca?: number;
  liqKg?: number;
  // Boitel-specific
  boitelDias?: number;
  boitelGmd?: number;
  boitelReceitaProdutor?: number;
  boitelAdiantamento?: number;
  boitelFrete?: number;
  boitelResultadoLiquido?: number;
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
  realizado: { label: STATUS_LABEL.realizado, cls: 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400' },
  programado: { label: STATUS_LABEL.programado, cls: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' },
  meta: { label: STATUS_LABEL.meta, cls: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' },
};

function fmtDate(d?: string) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; }
}

export function ConfirmacaoRegistroDialog({ open, onClose, onConfirm, operacionais, financeiros, submitting }: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === operacionais.categoria)?.label || operacionais.categoria;
  const statusCfg = STATUS_MAP[operacionais.status] || STATUS_MAP.realizado;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-2 p-4">
        <DialogHeader className="space-y-0.5 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <CheckCircle className="h-5 w-5 text-primary" />
            Confirmar {financeiros.tipoOperacao}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Revise os dados antes de confirmar o registro.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
        {/* 2-column layout: Operacionais | Financeiros */}
        <div className="grid grid-cols-2 gap-2">
        {/* Coluna Esquerda: Dados Operacionais */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Dados Operacionais</h4>
          <div className="bg-muted/30 rounded-md p-1.5 space-y-0 text-[11px] [&>div]:py-0.5">
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

        {/* Coluna Direita: Dados Financeiros */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Dados Financeiros</h4>
          <div className="bg-muted/30 rounded-md p-1.5 space-y-0 text-[11px] [&>div]:py-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <strong>{financeiros.tipoOperacao}</strong>
            </div>
            {financeiros.fornecedorOuFrigorifico && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{financeiros.tipoOperacao === 'Boitel' ? 'Boitel / Destino' : 'Fornecedor / Frigorífico'}</span>
                <strong className="text-right max-w-[50%] truncate">{financeiros.fornecedorOuFrigorifico}</strong>
              </div>
            )}

            {/* ── BOITEL-specific block ── */}
            {financeiros.tipoOperacao === 'Boitel' ? (
              <div className="space-y-0.5 pt-1">
                {financeiros.boitelDias != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Dias confinamento</span><strong>{financeiros.boitelDias}</strong></div>
                )}
                {financeiros.boitelGmd != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">GMD</span><strong>{financeiros.boitelGmd} kg/dia</strong></div>
                )}
                <Separator className="my-0.5" />
                {financeiros.totalBruto != null && financeiros.totalBruto > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Faturamento Bruto</span><strong className="tabular-nums">{formatMoeda(financeiros.totalBruto)}</strong></div>
                )}
                {financeiros.boitelReceitaProdutor != null && financeiros.boitelReceitaProdutor > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Receita Produtor</span><strong className="tabular-nums">{formatMoeda(financeiros.boitelReceitaProdutor)}</strong></div>
                )}
                {financeiros.totalDescontos != null && financeiros.totalDescontos > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">(–) Custos Operacionais</span><strong className="text-destructive tabular-nums">-{formatMoeda(financeiros.totalDescontos)}</strong></div>
                )}
                {financeiros.boitelFrete != null && financeiros.boitelFrete > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">(–) Frete</span><strong className="text-destructive tabular-nums">-{formatMoeda(financeiros.boitelFrete)}</strong></div>
                )}
                {financeiros.boitelAdiantamento != null && financeiros.boitelAdiantamento > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">(+) Adiantamento p/ Boitel</span><strong className="text-blue-600 dark:text-blue-400 tabular-nums">{formatMoeda(financeiros.boitelAdiantamento)}</strong></div>
                )}
                <Separator className="my-0.5" />
                <div className="flex justify-between text-[12px] font-bold">
                  <span>= Valor a Receber do Boitel</span>
                  <span className={`tabular-nums ${(financeiros.valorLiquido || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatMoeda(financeiros.valorLiquido || 0)}</span>
                </div>
                {financeiros.boitelResultadoLiquido != null && financeiros.boitelResultadoLiquido !== 0 && (
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Resultado Líquido (econômico)</span><strong className={`tabular-nums ${financeiros.boitelResultadoLiquido >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatMoeda(financeiros.boitelResultadoLiquido)}</strong></div>
                )}
                {financeiros.liqCabeca != null && (
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">R$/cab líq.</span><strong className="tabular-nums">{formatMoeda(financeiros.liqCabeca)}</strong></div>
                )}
                {financeiros.liqKg != null && (
                  <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">R$/kg líq.</span><strong className="tabular-nums">{formatMoeda(financeiros.liqKg)}</strong></div>
                )}
              </div>
            ) : (
              /* ── Standard (Abate / Venda / Compra) block ── */
              <>
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
                {financeiros.rendCarcaca != null && financeiros.rendCarcaca > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rend. Carcaça</span>
                    <strong>{financeiros.rendCarcaca.toFixed(2)}%</strong>
                  </div>
                )}
                {financeiros.totalArrobas != null && financeiros.totalArrobas > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Arrobas</span>
                    <strong>{formatArroba(financeiros.totalArrobas)}</strong>
                  </div>
                )}
                {financeiros.precoBase != null && financeiros.precoBase > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preço base {financeiros.precoBaseLabel || ''}</span>
                    <strong>{formatMoeda(financeiros.precoBase)}</strong>
                  </div>
                )}
                {/* Full Abate financial hierarchy — versão enxuta para o modal de confirmação */}
                {financeiros.valorBase != null && financeiros.valorBase > 0 ? (
                  <div className="space-y-0 pt-0.5">
                    <Separator className="my-0.5" />
                    {financeiros.funruralTotal != null && financeiros.funruralTotal > 0 && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">(–) Funrural</span><strong className="text-destructive tabular-nums">-{formatMoeda(financeiros.funruralTotal)}</strong></div>
                    )}
                    <div className="flex justify-between font-bold"><span>= Valor Bruto</span><span className="tabular-nums">{formatMoeda(financeiros.totalBruto || 0)}</span></div>
                    {financeiros.totalBonus != null && financeiros.totalBonus > 0 && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">(+) Bônus</span><strong className="text-green-600 tabular-nums">+{formatMoeda(financeiros.totalBonus)}</strong></div>
                    )}
                    {financeiros.totalDescontos != null && financeiros.totalDescontos > 0 && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">(–) Descontos</span><strong className="text-destructive tabular-nums">-{formatMoeda(financeiros.totalDescontos)}</strong></div>
                    )}
                    <Separator className="my-0.5" />
                    <div className="flex justify-between text-[12px] font-bold">
                      <span>= Valor Líquido</span>
                      <span className="text-primary tabular-nums">{formatMoeda(financeiros.valorLiquido || 0)}</span>
                    </div>
                    {financeiros.liqArroba != null && financeiros.liqArroba > 0 && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">R$/@ líq.</span><strong className="tabular-nums">{formatMoeda(financeiros.liqArroba)}</strong></div>
                    )}
                  </div>
                ) : (
                  <>
                    {financeiros.totalBruto != null && financeiros.totalBruto > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor bruto</span>
                        <strong>{formatMoeda(financeiros.totalBruto)}</strong>
                      </div>
                    )}
                    {financeiros.totalBonus != null && financeiros.totalBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bônus</span>
                        <strong className="text-green-600">+{formatMoeda(financeiros.totalBonus)}</strong>
                      </div>
                    )}
                    {financeiros.totalDescontos != null && financeiros.totalDescontos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Descontos</span>
                        <strong className="text-destructive">-{formatMoeda(financeiros.totalDescontos)}</strong>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        </div>{/* close grid */}

        {/* Resumo Final — full width */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Resumo Final</h4>
          <div className="bg-primary/10 rounded-md p-1.5 space-y-0">
            {financeiros.formaPagamento && (
              <div className="flex justify-between text-[11px] py-0.5">
                <span className="text-muted-foreground">Pagamento</span>
                <strong>{financeiros.formaPagamento}</strong>
              </div>
            )}
            {financeiros.parcelas && financeiros.parcelas.length > 1 && (
              <div className="space-y-0">
                {financeiros.parcelas.map((p, i) => (
                  <div key={i} className="flex justify-between text-[10px] py-0.5">
                    <span className="text-muted-foreground">Parcela {i + 1}/{financeiros.parcelas!.length} — {fmtDate(p.data)}</span>
                    <span className="font-semibold">{formatMoeda(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            {financeiros.valorLiquido !== undefined && (financeiros.valorLiquido > 0 || financeiros.tipoOperacao === 'Boitel') && (
              <div className="flex justify-between text-[13px] font-bold pt-1">
                <span>{financeiros.tipoOperacao === 'Boitel' ? 'Resultado Líquido' : 'Valor Líquido Total'}</span>
                <span className={`tabular-nums ${(financeiros.valorLiquido || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatMoeda(financeiros.valorLiquido)}</span>
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
