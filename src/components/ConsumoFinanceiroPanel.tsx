import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { StatusOperacional } from '@/lib/statusOperacional';

interface Parcela {
  data: string;
  valor: number;
}

interface Props {
  quantidade: number;
  pesoKg: number;
  categoria: string;
  data: string;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  statusOp: StatusOperacional;
  lancamentoId?: string;
  mode?: 'create' | 'update';
  onFinanceiroUpdated?: () => void;
  onRequestRegister?: () => void;
  registerLabel?: string;
  submitting?: boolean;
  // Values from parent calc
  valorBruto: number;
  valorLiquido: number;
}

export interface ConsumoFinanceiroPanelRef {
  generateFinanceiro: (lancamentoId: string) => Promise<boolean>;
  getValidationErrors: () => string[];
  getValorBase: () => number;
  resetForm: () => void;
}

export const ConsumoFinanceiroPanel = forwardRef<ConsumoFinanceiroPanelRef, Props>(function ConsumoFinanceiroPanel({
  quantidade, pesoKg, categoria, data, notaFiscal, onNotaFiscalChange,
  statusOp, lancamentoId, mode = 'create', onFinanceiroUpdated,
  onRequestRegister, registerLabel, submitting: externalSubmitting,
  valorBruto, valorLiquido,
}: Props, ref) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const isPrevisto = statusOp === 'meta';

  const [formaPag, setFormaPag] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  useEffect(() => {
    if (!lancamentoId || existingLoaded) return;
    (async () => {
      const { count } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id', { count: 'exact' })
        .eq('movimentacao_rebanho_id', lancamentoId)
        .eq('cancelado', false);
      setExistingCount(count || 0);
      setExistingLoaded(true);
      if ((count || 0) > 0) setGerado(true);
    })();
  }, [lancamentoId, existingLoaded]);

  const gerarParcelas = useCallback((n: number, baseDate: string, total: number) => {
    const p: Parcela[] = [];
    const vp = total / n;
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(baseDate || data), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((total - rest) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcelasChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && valorLiquido > 0) {
      setParcelas(gerarParcelas(n, data, valorLiquido));
    }
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (valorLiquido <= 0 && valorBruto <= 0) errors.push('Valor do consumo deve ser maior que zero.');
    if (formaPag === 'prazo' && parcelas.length > 0) {
      const soma = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const ref = Math.round(valorLiquido * 100) / 100;
      if (Math.abs(soma - ref) > 0.01) {
        errors.push(`A soma das parcelas (${formatMoeda(soma)}) deve ser igual ao valor (${formatMoeda(ref)}).`);
      }
    }
    return errors;
  }, [valorLiquido, valorBruto, formaPag, parcelas]);

  const resetForm = useCallback(() => {
    setFormaPag('avista');
    setParcelas([]);
    setQtdParcelas('1');
    setGerado(false);
    setExistingLoaded(false);
    setExistingCount(0);
  }, []);

  useImperativeHandle(ref, () => ({
    generateFinanceiro: async (extLancamentoId: string) => handleGerarFinanceiroInternal(extLancamentoId),
    getValidationErrors: () => validationErrors,
    getValorBase: () => valorLiquido,
    resetForm,
  }));

  const handleGerarFinanceiroInternal = async (targetLancamentoId: string): Promise<boolean> => {
    if (!targetLancamentoId) { toast.error('Salve o lançamento zootécnico primeiro.'); return false; }
    if (!fazendaAtual || !clienteAtual) return false;
    // Consumo can have zero value — only block if explicitly negative
    if (valorLiquido < 0) { toast.error('Valor do consumo inválido.'); return false; }
    // If valor is 0, skip financial generation silently
    if (valorLiquido <= 0) return true;

    setGerando(true);
    try {
      // Cancel existing in update mode
      if (mode === 'update') {
        const { data: old } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', targetLancamentoId)
          .eq('cancelado', false);
        const oldIds = (old || []).map(r => r.id);
        if (oldIds.length > 0) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase.from('financeiro_lancamentos_v2')
            .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por: userId || null })
            .in('id', oldIds);
        }
      } else {
        const { data: existing } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', targetLancamentoId)
          .eq('cancelado', false)
          .limit(1);
        if (existing && existing.length > 0) {
          toast.error('Lançamentos financeiros já foram gerados para este consumo.');
          setGerado(true);
          return false;
        }
      }

      const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
      const consumoLabel = `Consumo ${quantidade} ${catLabel}`;
      const anoMes = data.slice(0, 7);

      // Find subcentro for consumo in plano de contas
      const subcentroCandidates = ['PEC/CONSUMO INTERNO', 'CONSUMO INTERNO', 'PEC/CONSUMO'];
      const { data: planoContas } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativo', true)
        .eq('tipo_operacao', '2-Saídas')
        .in('subcentro', subcentroCandidates);

      if (!planoContas || planoContas.length === 0) {
        toast.error(`Não foi encontrado mapeamento financeiro válido para consumo no plano de classificação. Subcentros buscados: ${subcentroCandidates.join(', ')}`);
        setGerando(false);
        return false;
      }

      const clasConsumo = planoContas[0];
      const statusFin = isPrevisto ? 'previsto' : 'programado';
      const inserts: any[] = [];

      const baseRecord: Record<string, any> = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        tipo_operacao: '2-Saídas',
        sinal: -1,
        status_transacao: statusFin,
        origem_lancamento: 'movimentacao_rebanho',
        movimentacao_rebanho_id: targetLancamentoId,
        macro_custo: clasConsumo.macro_custo,
        centro_custo: clasConsumo.centro_custo,
        subcentro: clasConsumo.subcentro,
        nota_fiscal: notaFiscal || undefined,
      };

      if (formaPag === 'prazo' && parcelas.length > 0) {
        parcelas.forEach((p, i) => {
          inserts.push({
            ...baseRecord,
            ano_mes: p.data.slice(0, 7),
            valor: p.valor,
            data_competencia: data,
            data_pagamento: p.data,
            descricao: `${consumoLabel} - Parcela ${i + 1}/${parcelas.length}`,
            origem_tipo: 'consumo:parcela',
          });
        });
      } else {
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          valor: valorLiquido,
          data_competencia: data,
          data_pagamento: data,
          descricao: consumoLabel,
          origem_tipo: 'consumo:parcela',
        });
      }

      const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
      if (error) throw error;

      setGerado(true);
      toast.success(`${inserts.length} lançamento(s) financeiro(s) de consumo gerado(s)!`);
      if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
      return true;
    } catch (err: any) {
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
      return false;
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros — Consumo</h3>
      <Separator />

      {/* Resumo de valores */}
      {valorBruto > 0 && (
        <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between font-bold text-[11px]">
            <span>Valor da despesa</span>
            <span className="text-destructive">{formatMoeda(valorLiquido)}</span>
          </div>
        </div>
      )}

      <Separator />

      {/* Informações de Pagamento */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Informações de Pagamento</h4>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground min-w-[90px]">Nota Fiscal</span>
            <Input value={notaFiscal} onChange={e => onNotaFiscalChange(e.target.value)} placeholder="Nº da nota" className="h-7 text-[11px] flex-1" />
          </div>

          <div className="space-y-1.5">
            <h5 className="text-[10px] font-bold text-muted-foreground uppercase">Forma de Pagamento</h5>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => { setFormaPag('avista'); setParcelas([]); }}
                className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPag === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                À vista
              </button>
              <button type="button" onClick={() => { setFormaPag('prazo'); handleQtdParcelasChange(qtdParcelas); }}
                className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPag === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                A prazo
              </button>
            </div>
          </div>

          {formaPag === 'prazo' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} className="h-8 text-[12px]" />
              </div>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[10px]">Parcela {i + 1} - Data</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Valor (R$)</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right">
                  Soma parcelas: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 text-destructive text-[10px] rounded p-2 space-y-0.5">
              {validationErrors.map((e, i) => (
                <div key={i} className="flex gap-1 items-start"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /><span>{e}</span></div>
              ))}
            </div>
          )}

          {isPrevisto && (
            <div className="flex items-center gap-2 text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border border-orange-300 dark:border-orange-800 rounded p-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>Status Previsto: despesa prevista será gerada ao registrar.</span>
            </div>
          )}

          {gerado && (
            <div className="flex items-center gap-2 text-[11px] text-primary bg-primary/10 rounded p-2">
              <CheckCircle className="h-4 w-4" />
              <span className="font-semibold">Financeiro gerado ({existingCount > 0 ? existingCount : 1} registro{existingCount > 1 ? 's' : ''})</span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Register button */}
      <Separator />
      <Button
        type="button"
        className="w-full h-10 text-[13px] font-bold"
        onClick={onRequestRegister}
        disabled={externalSubmitting}
      >
        {registerLabel || 'Registrar Consumo'}
      </Button>
    </div>
  );
});
