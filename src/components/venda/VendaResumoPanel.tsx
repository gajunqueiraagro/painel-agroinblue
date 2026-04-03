import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { AlertTriangle, CheckCircle, Edit, DollarSign, Calculator } from 'lucide-react';
import type { VendaDetalhes } from './VendaDetalhesDialog';
import type { VendaCalculation } from '@/lib/calculos/venda';
import type { BoitelData } from '@/components/BoitelPlanningDialog';

interface Props {
  quantidade: number;
  pesoKg: number;
  categoria: string;
  compradorNome: string;
  detalhes: VendaDetalhes | null;
  detalhesPreenchidos: boolean;
  canOpenModal: boolean;
  onOpenModal: () => void;
  onRequestRegister: () => void;
  submitting: boolean;
  registerLabel?: string;
  isBoitel?: boolean;
  boitelData?: BoitelData | null;
  onCancelEdit?: () => void;
  /** Official calculation object — single source of truth */
  calculation?: VendaCalculation | null;
}

export function VendaResumoPanel({
  quantidade, pesoKg, categoria, compradorNome,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel,
  isBoitel, boitelData, onCancelEdit, calculation,
}: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  // ── BOITEL RESUMO ──
  if (isBoitel) {
    const bd = boitelData;
    const hasData = !!bd && (bd._receitaProdutor || 0) > 0;

    return (
      <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
        <h3 className="text-[12px] font-semibold text-foreground leading-tight flex items-center gap-1">
          <Calculator className="h-3 w-3" /> Resumo — Boitel
        </h3>
        <Separator />

        <div className="space-y-0.5 text-[10px] leading-tight">
          <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg ? formatKg(pesoKg) : '-'}</strong></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><strong>{catLabel}</strong></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><strong>Boitel</strong></div>
        </div>

        {hasData && bd && (
          <>
            <Separator />
            <div className="space-y-0.5 text-[10px] leading-tight">
              <div className="flex justify-between"><span className="text-muted-foreground">Boitel / Destino</span><strong className="truncate max-w-[120px]">{bd.nomeBoitel || '-'}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dias</span><strong>{bd.dias}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GMD</span><strong>{bd.gmd} kg/dia</strong></div>
            </div>

            <Separator />
            <div className="space-y-0.5 text-[10px] leading-tight">
              <div className="flex justify-between"><span className="text-muted-foreground">Receita Produtor</span><strong className="tabular-nums">{formatMoeda(bd._receitaProdutor || 0)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Custos Operacionais</span><strong className="text-destructive tabular-nums">-{formatMoeda(bd._custoTotal || 0)}</strong></div>
              <Separator className="my-0.5" />
              <div className="flex justify-between text-[11px] font-bold py-px">
                <span>Lucro Líquido</span>
                <span className={`tabular-nums ${(bd._lucroTotal || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatMoeda(bd._lucroTotal || 0)}
                </span>
              </div>
              {quantidade > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">R$/cab líq.</span><strong className="tabular-nums">{formatMoeda((bd._lucroTotal || 0) / quantidade)}</strong></div>
              )}
            </div>
            <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Recebimento</span><strong>{bd.formaReceb === 'prazo' ? `A prazo (${bd.qtdParcelas}x)` : 'À vista'}</strong></div>
          </>
        )}

        {!hasData && (
          <>
            <Separator />
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-1.5 leading-tight">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="font-medium">Planejamento Boitel não preenchido</span>
            </div>
            <Button type="button" variant="outline" className="w-full h-7 text-[11px] font-bold gap-1.5" onClick={onOpenModal}>
              <Calculator className="h-3 w-3" />
              Abrir Planejamento Boitel
            </Button>
          </>
        )}

        <Separator />
        <div className="flex items-center gap-1.5">
          {onCancelEdit && (
            <Button type="button" variant="outline" className="flex-1 h-7 text-[10px] font-bold" onClick={onCancelEdit}>
              Cancelar
            </Button>
          )}
          <Button type="button" className="flex-1 h-7 text-[10px] font-bold" onClick={onRequestRegister} disabled={submitting || !hasData}>
            {submitting ? 'Registrando...' : (registerLabel || 'Registrar Venda')}
          </Button>
        </div>
      </div>
    );
  }

  // ── VENDA NORMAL ──
  const calc = calculation || detalhes?.calculation || null;

  const tipoVendaLabel = detalhes?.tipoVenda === 'desmama' ? 'Desmama' : detalhes?.tipoVenda === 'gado_adulto' ? 'Gado Adulto' : '-';
  const tipoPrecoLabel = detalhes?.tipoPreco === 'por_kg' ? 'Por kg' : detalhes?.tipoPreco === 'por_cab' ? 'Por cabeça' : 'Por total';
  const pagLabel = detalhes?.formaReceb === 'prazo' && detalhes.parcelas.length > 0 ? `A prazo (${detalhes.parcelas.length}x)` : 'À vista';

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg ? formatKg(pesoKg) : '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><strong>{catLabel}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Comprador</span><strong className="truncate max-w-[120px]">{compradorNome || '-'}</strong></div>
        {detalhesPreenchidos && detalhes && (
          <div className="flex justify-between"><span className="text-muted-foreground">Tipo de venda</span><strong>{tipoVendaLabel}</strong></div>
        )}
      </div>

      {calc && (
        <>
          <Separator />
          <div className="space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Peso Total</span><strong className="tabular-nums">{formatKg(calc.pesoTotalKg)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">@/cab</span><strong className="tabular-nums">{formatArroba(calc.arrobasCab)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total @</span><strong className="tabular-nums">{formatArroba(calc.totalArrobas)}</strong></div>
          </div>
        </>
      )}

      <Separator />

      {!detalhesPreenchidos ? (
        <>
          <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-1.5 leading-tight">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Financeiro não preenchido</span>
          </div>
          <Button type="button" variant="outline" className="w-full h-7 text-[11px] font-bold gap-1.5" disabled={!canOpenModal} onClick={onOpenModal}>
            <DollarSign className="h-3 w-3" />
            Completar Venda
          </Button>
          {!canOpenModal && (
            <p className="text-[9px] text-muted-foreground text-center leading-tight">Preencha Data, Quantidade, Peso, Categoria e Comprador</p>
          )}
        </>
      ) : (
        <>
          <div className="space-y-0 text-[10px] leading-[1.4]">
            <div className="flex justify-between py-px"><span className="text-muted-foreground">Tipo de preço</span><strong>{tipoPrecoLabel}</strong></div>
            {calc && calc.valorBruto > 0 && (
              <>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">Valor bruto</span><strong className="tabular-nums">{formatMoeda(calc.valorBruto)}</strong></div>
                {calc.totalDespesas > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">Despesas</span><strong className="text-orange-600 dark:text-orange-400 tabular-nums">-{formatMoeda(calc.totalDespesas)}</strong></div>
                )}
                {calc.totalDeducoes > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">Deduções</span><strong className="text-destructive tabular-nums">-{formatMoeda(calc.totalDeducoes)}</strong></div>
                )}
                <Separator className="my-0.5" />
                <div className="flex justify-between text-[11px] font-bold py-px">
                  <span>Valor líquido</span>
                  <span className="text-primary tabular-nums">{formatMoeda(calc.valorLiquido)}</span>
                </div>
                {calc.liqArroba > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">R$/@ líq.</span><strong className="tabular-nums">{formatMoeda(calc.liqArroba)}</strong></div>
                )}
                {calc.liqCabeca > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">R$/cab líq.</span><strong className="tabular-nums">{formatMoeda(calc.liqCabeca)}</strong></div>
                )}
              </>
            )}
            <div className="flex justify-between py-px"><span className="text-muted-foreground">Recebimento</span><strong>{pagLabel}</strong></div>
            {detalhes?.notaFiscal && (
              <div className="flex justify-between py-px"><span className="text-muted-foreground">NF</span><strong>{detalhes.notaFiscal}</strong></div>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1 leading-tight">
            <CheckCircle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Detalhes financeiros preenchidos</span>
          </div>

          <Button type="button" variant="ghost" size="sm" className="w-full h-6 text-[10px] font-medium gap-1 text-muted-foreground" onClick={onOpenModal}>
            <Edit className="h-3 w-3" />
            Editar Detalhes
          </Button>
        </>
      )}

      <Separator />

      <div className="flex items-center gap-1.5">
        {onCancelEdit && (
          <Button type="button" variant="outline" className="flex-1 h-7 text-[10px] font-bold" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
        <Button type="button" className="flex-1 h-7 text-[10px] font-bold" onClick={onRequestRegister} disabled={submitting || !detalhesPreenchidos}>
          {submitting ? 'Registrando...' : (registerLabel || 'Registrar Venda')}
        </Button>
      </div>
    </div>
  );
}
