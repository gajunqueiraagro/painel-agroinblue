import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { AlertTriangle, CheckCircle, Edit, DollarSign } from 'lucide-react';
import type { VendaDetalhes } from './VendaDetalhesDialog';

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
  onCancelEdit?: () => void;
}

export function VendaResumoPanel({
  quantidade, pesoKg, categoria, compradorNome,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel,
  isBoitel, onCancelEdit,
}: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';
  const totalKg = (quantidade || 0) * (pesoKg || 0);

  const calc = useMemo(() => {
    if (!detalhes) return null;
    const vi = Number(detalhes.precoInput) || 0;
    let valorBruto = 0;
    if (detalhes.tipoPreco === 'por_kg') valorBruto = totalKg * vi;
    else if (detalhes.tipoPreco === 'por_cab') valorBruto = (quantidade || 0) * vi;
    else valorBruto = vi;

    const freteVal = Number(detalhes.frete) || 0;
    const comissaoVal = valorBruto * ((Number(detalhes.comissaoPct) || 0) / 100);
    const outrosCustosVal = Number(detalhes.outrosCustos) || 0;
    const totalDespesas = freteVal + comissaoVal + outrosCustosVal;

    const funruralReaisFilled = !!detalhes.funruralReais && Number(detalhes.funruralReais) > 0;
    const descFunruralTotal = funruralReaisFilled
      ? (Number(detalhes.funruralReais) || 0)
      : valorBruto * ((Number(detalhes.funruralPct) || 0) / 100);
    const totalDeducoes = descFunruralTotal;

    const valorLiquido = valorBruto - totalDespesas - totalDeducoes;

    return { valorBruto, totalDespesas, totalDeducoes, valorLiquido };
  }, [detalhes, totalKg, quantidade]);

  const tipoVendaLabel = detalhes?.tipoVenda === 'desmama' ? 'Desmama' : detalhes?.tipoVenda === 'gado_adulto' ? 'Gado Adulto' : '-';
  const tipoPrecoLabel = detalhes?.tipoPreco === 'por_kg' ? 'Por kg' : detalhes?.tipoPreco === 'por_cab' ? 'Por cabeça' : 'Por total';
  const pagLabel = detalhes?.formaReceb === 'prazo' && detalhes.parcelas.length > 0 ? `A prazo (${detalhes.parcelas.length}x)` : 'À vista';

  if (isBoitel) return null;

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg || '-'} kg</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><strong>{catLabel}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Comprador</span><strong className="truncate max-w-[120px]">{compradorNome || '-'}</strong></div>
        {detalhesPreenchidos && detalhes && (
          <div className="flex justify-between"><span className="text-muted-foreground">Tipo de venda</span><strong>{tipoVendaLabel}</strong></div>
        )}
      </div>

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
          <div className="space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo de preço</span><strong>{tipoPrecoLabel}</strong></div>
            {calc && calc.valorBruto > 0 && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span><strong>{formatMoeda(calc.valorBruto)}</strong></div>
                {calc.totalDespesas > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Despesas</span><strong className="text-orange-600 dark:text-orange-400">-{formatMoeda(calc.totalDespesas)}</strong></div>
                )}
                {calc.totalDeducoes > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Deduções</span><strong className="text-destructive">-{formatMoeda(calc.totalDeducoes)}</strong></div>
                )}
                <Separator />
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Valor líquido</span>
                  <span className="text-primary">{formatMoeda(calc.valorLiquido)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Recebimento</span><strong>{pagLabel}</strong></div>
            {detalhes?.notaFiscal && (
              <div className="flex justify-between"><span className="text-muted-foreground">NF</span><strong>{detalhes.notaFiscal}</strong></div>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1.5 leading-tight">
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

      <div className="space-y-1">
        {onCancelEdit && (
          <Button type="button" variant="outline" className="w-full h-7 text-[11px] font-bold" onClick={onCancelEdit}>
            Cancelar Edição
          </Button>
        )}
        <Button type="button" className="w-full h-8 text-[11px] font-bold" onClick={onRequestRegister} disabled={submitting || !detalhesPreenchidos}>
          {submitting ? 'Registrando...' : (registerLabel || 'Registrar Venda')}
        </Button>
      </div>
    </div>
  );
}
