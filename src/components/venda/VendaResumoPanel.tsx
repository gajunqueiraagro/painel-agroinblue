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
  /** Whether Boitel mode is active (shows different flow) */
  isBoitel?: boolean;
}

export function VendaResumoPanel({
  quantidade, pesoKg, categoria, compradorNome,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel,
  isBoitel,
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

  // If Boitel, don't show the modal flow — just pass through
  if (isBoitel) return null;

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2.5 self-start">
      <h3 className="text-[14px] font-semibold text-foreground">Resumo da Operação</h3>
      <Separator />

      {/* Dados operacionais */}
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Quantidade</span>
          <strong>{quantidade || '-'} cab.</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Peso médio</span>
          <strong>{pesoKg || '-'} kg</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Categoria</span>
          <strong>{catLabel}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Comprador</span>
          <strong className="truncate max-w-[120px]">{compradorNome || '-'}</strong>
        </div>
        {detalhesPreenchidos && detalhes && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tipo de venda</span>
            <strong>{tipoVendaLabel}</strong>
          </div>
        )}
      </div>

      <Separator />

      {/* Status financeiro */}
      {!detalhesPreenchidos ? (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Detalhes financeiros não preenchidos</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 text-[12px] font-bold gap-2"
            disabled={!canOpenModal}
            onClick={onOpenModal}
          >
            <DollarSign className="h-4 w-4" />
            Completar Venda
          </Button>
          {!canOpenModal && (
            <p className="text-[10px] text-muted-foreground text-center">
              Preencha Data, Quantidade, Peso, Categoria e Comprador para liberar
            </p>
          )}
        </>
      ) : (
        <>
          {/* Resumo financeiro */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo de preço</span>
              <strong>{tipoPrecoLabel}</strong>
            </div>
            {calc && calc.valorBruto > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor bruto</span>
                  <strong>{formatMoeda(calc.valorBruto)}</strong>
                </div>
                {calc.totalDespesas > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Despesas</span>
                    <strong className="text-orange-600 dark:text-orange-400">-{formatMoeda(calc.totalDespesas)}</strong>
                  </div>
                )}
                {calc.totalDeducoes > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deduções</span>
                    <strong className="text-destructive">-{formatMoeda(calc.totalDeducoes)}</strong>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-[12px] font-bold">
                  <span>Valor líquido</span>
                  <span className="text-primary">{formatMoeda(calc.valorLiquido)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recebimento</span>
              <strong>{pagLabel}</strong>
            </div>
            {detalhes?.notaFiscal && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">NF</span>
                <strong>{detalhes.notaFiscal}</strong>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-2">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Detalhes financeiros preenchidos</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-8 text-[11px] font-medium gap-1.5 text-muted-foreground"
            onClick={onOpenModal}
          >
            <Edit className="h-3.5 w-3.5" />
            Editar Detalhes
          </Button>
        </>
      )}

      <Separator />

      {/* Botão final de registro */}
      <Button
        type="button"
        className="w-full h-10 text-[13px] font-bold"
        onClick={onRequestRegister}
        disabled={submitting || !detalhesPreenchidos}
      >
        {submitting ? 'Registrando...' : (registerLabel || 'Registrar Venda')}
      </Button>
    </div>
  );
}
