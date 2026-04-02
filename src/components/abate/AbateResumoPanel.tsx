import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { AlertTriangle, CheckCircle, Edit, Tag } from 'lucide-react';
import type { AbateDetalhes } from './AbateDetalhesDialog';

interface Props {
  quantidade: number;
  pesoKg: number;
  categoria: string;
  frigorificoNome: string;
  detalhes: AbateDetalhes | null;
  detalhesPreenchidos: boolean;
  canOpenModal: boolean;
  onOpenModal: () => void;
  onRequestRegister: () => void;
  submitting: boolean;
  registerLabel?: string;
}

export function AbateResumoPanel({
  quantidade, pesoKg, categoria, frigorificoNome,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel,
}: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  const calc = useMemo(() => {
    if (!detalhes) return null;
    const rend = Number(detalhes.rendCarcaca) || 0;
    const carcacaCalc = rend > 0 ? pesoKg * rend / 100 : 0;
    const pesoArrobaCab = carcacaCalc > 0 ? carcacaCalc / 15 : 0;
    const totalArrobas = pesoArrobaCab * quantidade;
    const preco = Number(detalhes.precoArroba) || 0;
    const valorBruto = totalArrobas * preco;

    const bonusPrecoceTotal = (Number(detalhes.bonusPrecoce) || 0) * totalArrobas;
    const bonusQualidadeTotal = (Number(detalhes.bonusQualidade) || 0) * totalArrobas;
    const bonusListaTraceTotal = (Number(detalhes.bonusListaTrace) || 0) * totalArrobas;
    const totalBonus = bonusPrecoceTotal + bonusQualidadeTotal + bonusListaTraceTotal;

    const descQualidadeTotal = (Number(detalhes.descontoQualidade) || 0) * totalArrobas;
    const funruralReaisVal = Number(detalhes.funruralReais) || 0;
    const descFunruralTotal = funruralReaisVal > 0 ? funruralReaisVal : valorBruto * (Number(detalhes.funruralPct) || 0) / 100;
    const descOutrosTotal = Number(detalhes.outrosDescontos) || 0;
    const totalDescontos = descQualidadeTotal + descFunruralTotal + descOutrosTotal;

    const valorLiquido = valorBruto + totalBonus - totalDescontos;

    return { valorBruto, totalBonus, totalDescontos, valorLiquido, totalArrobas };
  }, [detalhes, pesoKg, quantidade]);

  const tipoAbateLabel = detalhes?.tipoPeso === 'morto' ? 'Peso morto' : detalhes?.tipoPeso === 'vivo' ? 'Peso vivo' : '-';
  const comercLabel = detalhes?.tipoVenda
    ? { escala: 'Escala', a_termo: 'A termo', spot: 'Spot', outro: 'Outro' }[detalhes.tipoVenda] || detalhes.tipoVenda
    : '-';
  const pagLabel = detalhes?.formaReceb === 'prazo' && detalhes.parcelas.length > 0
    ? `A prazo (${detalhes.parcelas.length}x)`
    : 'À vista';

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
          <strong>{pesoKg ? formatKg(pesoKg) : '-'}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Categoria</span>
          <strong>{catLabel}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Frigorífico</span>
          <strong className="truncate max-w-[120px]">{frigorificoNome || '-'}</strong>
        </div>
        {detalhesPreenchidos && detalhes && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo de Abate</span>
              <strong>{tipoAbateLabel}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comercialização</span>
              <strong>{comercLabel}</strong>
            </div>
          </>
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
            <Tag className="h-4 w-4" />
            Completar Abate
          </Button>
          {!canOpenModal && (
            <p className="text-[10px] text-muted-foreground text-center">
              Preencha Data, Quantidade, Peso, Categoria e Frigorífico para liberar
            </p>
          )}
        </>
      ) : (
        <>
          {/* Resumo financeiro */}
          <div className="space-y-1 text-[11px]">
            {calc && calc.valorBruto > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor bruto</span>
                  <strong>{formatMoeda(calc.valorBruto)}</strong>
                </div>
                {calc.totalBonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bônus</span>
                    <strong className="text-green-600 dark:text-green-400">+{formatMoeda(calc.totalBonus)}</strong>
                  </div>
                )}
                {calc.totalDescontos > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descontos</span>
                    <strong className="text-destructive">-{formatMoeda(calc.totalDescontos)}</strong>
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
              <span className="text-muted-foreground">Pagamento</span>
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
        {submitting ? 'Registrando...' : (registerLabel || 'Registrar Abate')}
      </Button>
    </div>
  );
}
