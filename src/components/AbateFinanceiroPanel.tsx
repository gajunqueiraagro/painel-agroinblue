import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';

interface Parcela {
  data: string;
  valor: number;
}

interface Props {
  quantidade: number;
  categoria: string;
  data: string;
  valorLiquido: number;
  totalDescontos?: number;
  frigorifico: string;
  fornecedorId?: string;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  lancamentoId?: string;
  mode?: 'create' | 'update';
  onFinanceiroUpdated?: () => void;
  statusOperacional?: 'previsto' | 'programado' | 'agendado' | 'realizado';
}

export interface AbateFinanceiroOverrides {
  valorLiquido?: number;
  totalDescontos?: number;
  formaReceb?: 'avista' | 'prazo';
  parcelas?: Parcela[];
}

export interface AbateFinanceiroPanelRef {
  generateFinanceiro: (lancamentoId: string, overrides?: AbateFinanceiroOverrides) => Promise<boolean>;
  getValidationErrors: () => string[];
}

export const AbateFinanceiroPanel = forwardRef<AbateFinanceiroPanelRef, Props>(function AbateFinanceiroPanel({
  quantidade, categoria, data, valorLiquido, totalDescontos = 0, frigorifico,
  fornecedorId, notaFiscal, onNotaFiscalChange, lancamentoId, mode = 'create', onFinanceiroUpdated,
  statusOperacional = 'realizado',
}: Props, ref) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const isPrevisto = statusOperacional === 'previsto';

  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('2');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  // Load existing financial records for update mode
  useEffect(() => {
    if (!lancamentoId || existingLoaded) return;
    (async () => {
      const { data: existing, count } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id', { count: 'exact' })
        .eq('movimentacao_rebanho_id', lancamentoId)
        .eq('cancelado', false);
      setExistingCount(count || 0);
      setExistingLoaded(true);
      if ((count || 0) > 0) setGerado(true);
    })();
  }, [lancamentoId, existingLoaded]);

  const gerarParcelas = useCallback((numParcelas: number, baseDate: string, valorTotal: number) => {
    const p: Parcela[] = [];
    const valorParcela = valorTotal / numParcelas;
    for (let i = 0; i < numParcelas; i++) {
      const d = addDays(parseISO(baseDate || data), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(valorParcela * 100) / 100 });
    }
    if (p.length > 0) {
      const sumOthers = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((valorTotal - sumOthers) * 100) / 100;
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
    if (valorLiquido <= 0) errors.push('Valor líquido do abate deve ser maior que zero.');
    if (formaReceb === 'prazo' && parcelas.length > 0) {
      const somaParcelas = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const valorRound = Math.round(valorLiquido * 100) / 100;
      if (Math.abs(somaParcelas - valorRound) > 0.01) {
        errors.push(`A soma das parcelas (${formatMoeda(somaParcelas)}) deve ser igual ao valor líquido (${formatMoeda(valorRound)}).`);
      }
      parcelas.forEach((p, i) => {
        if (!p.data) errors.push(`Parcela ${i + 1}: data obrigatória.`);
        if (!p.valor || p.valor <= 0) errors.push(`Parcela ${i + 1}: valor deve ser maior que zero.`);
      });
    }
    return errors;
  }, [valorLiquido, formaReceb, parcelas]);

  const canGenerate = validationErrors.length === 0 && !!lancamentoId;

  // Expose methods via ref for parent to call
  useImperativeHandle(ref, () => ({
    generateFinanceiro: async (extLancamentoId: string, overrides?: AbateFinanceiroOverrides) => {
      return handleGerarFinanceiroInternal(extLancamentoId, overrides);
    },
    getValidationErrors: () => validationErrors,
  }));

  const handleClickGerar = () => {
    if (mode === 'update' && existingCount > 0) {
      setConfirmUpdateOpen(true);
    } else {
      handleGerarFinanceiroInternal(lancamentoId!);
    }
  };

  const handleGerarFinanceiroInternal = async (targetLancamentoId: string, overrides?: AbateFinanceiroOverrides): Promise<boolean> => {
    // Use overrides if provided (avoids race condition with stale props)
    const efValorLiquido = overrides?.valorLiquido ?? valorLiquido;
    const efTotalDescontos = overrides?.totalDescontos ?? totalDescontos;
    const efFormaReceb = overrides?.formaReceb ?? formaReceb;
    const efParcelas = overrides?.parcelas ?? parcelas;

    console.log('[AbateFinanceiro] gerarInternal called', {
      targetLancamentoId,
      efValorLiquido,
      efTotalDescontos,
      efFormaReceb,
      efParcelas,
      fazendaAtual: fazendaAtual?.id,
      clienteAtual: clienteAtual?.id,
      overrides,
    });

    if (!targetLancamentoId) {
      toast.error('Salve o lançamento zootécnico antes de gerar os financeiros.');
      return false;
    }
    if (!fazendaAtual || !clienteAtual) {
      console.warn('[AbateFinanceiro] ABORT: fazendaAtual or clienteAtual is null');
      return false;
    }
    if (efValorLiquido <= 0) {
      console.warn('[AbateFinanceiro] ABORT: efValorLiquido <= 0', efValorLiquido);
      toast.error('Valor líquido do abate deve ser maior que zero.');
      return false;
    }

    setGerando(true);
    try {
      // In update mode, cancel existing records first
      if (mode === 'update') {
        const { data: oldRecords } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', targetLancamentoId)
          .eq('cancelado', false);

        const oldIds = (oldRecords || []).map(r => r.id);
        if (oldIds.length > 0) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase
            .from('financeiro_lancamentos_v2')
            .update({
              cancelado: true,
              cancelado_em: new Date().toISOString(),
              cancelado_por: userId || null,
            })
            .in('id', oldIds);

          await supabase.from('audit_log_movimentacoes').insert({
            cliente_id: clienteAtual.id,
            usuario_id: userId || null,
            acao: 'recalculo_financeiro_abate',
            movimentacao_id: targetLancamentoId,
            financeiro_ids: oldIds,
            detalhes: {
              registros_cancelados: oldIds.length,
              motivo: 'Recálculo financeiro do abate',
            },
          });
        }
      } else {
        // In create mode, check duplicates
        const { data: existing } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', targetLancamentoId)
          .eq('cancelado', false)
          .limit(1);

        if (existing && existing.length > 0) {
          toast.error('Lançamentos financeiros já foram gerados para este abate.');
          setGerado(true);
          return false;
        }
      }

      const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
      const abateLabel = `Abate ${quantidade} ${catLabel}`;
      const anoMes = data.slice(0, 7);
      const inserts: any[] = [];

      // Determinar subcentro correto baseado na categoria (fêmeas vs machos)
      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      // Candidatos em ordem de prioridade: novo plano → legado
      const subcentroCandidatos = isFemea
        ? ['Abates de Fêmeas', 'PEC/RECEITA/ABATES/FEMEAS']
        : ['Abates de Machos', 'PEC/RECEITA/ABATES/MACHOS'];

      // Validar classificação no plano de contas real
      const { data: planoReceita } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('ativo', true)
        .eq('tipo_operacao', '1-Entradas')
        .in('subcentro', subcentroCandidatos)
        .limit(2);

      if (!planoReceita || planoReceita.length === 0) {
        toast.error(`Não foi encontrado mapeamento financeiro válido para abates (${isFemea ? 'fêmeas' : 'machos'}) no plano de classificação.`);
        setGerando(false);
        return false;
      }

      // Priorizar pelo ordem dos candidatos
      const clasReceita = subcentroCandidatos.reduce<(typeof planoReceita)[0] | null>(
        (found, sub) => found || planoReceita.find(p => p.subcentro === sub) || null, null
      ) || planoReceita[0];

      const baseRecord: Record<string, any> = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        tipo_operacao: '1-Entradas',
        sinal: 1,
        status_transacao: isPrevisto ? 'previsto' : 'programado',
        origem_lancamento: 'movimentacao_rebanho',
        movimentacao_rebanho_id: targetLancamentoId,
        macro_custo: clasReceita.macro_custo,
        centro_custo: clasReceita.centro_custo,
        subcentro: clasReceita.subcentro,
        numero_documento: notaFiscal || null,
        ...(fornecedorId ? { favorecido_id: fornecedorId } : {}),
      };

      if (efFormaReceb === 'prazo' && efParcelas.length > 0) {
        efParcelas.forEach((p, i) => {
          inserts.push({
            ...baseRecord,
            ano_mes: p.data.slice(0, 7),
            valor: p.valor,
            data_competencia: data,
            data_pagamento: p.data,
            descricao: `${abateLabel} - Parcela ${i + 1}/${efParcelas.length}`,
            historico: frigorifico ? `Frigorífico: ${frigorifico}` : null,
            origem_tipo: 'abate:parcela',
          });
        });
      } else {
        // Revenue = valorLiquido (net value that actually moves cash)
        const valorReceita = efValorLiquido;
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          valor: valorReceita,
          data_competencia: data,
          data_pagamento: data,
          descricao: abateLabel,
          historico: frigorifico ? `Frigorífico: ${frigorifico}` : null,
          origem_tipo: 'abate:parcela',
        });
      }

      // Generate deduction records when there are discounts
      if (efTotalDescontos > 0) {
        const subcentroDeducaoCandidatos = [
          'Impostos e Despesas de Abates e Vendas',
          'PEC/NOTAS COM ABATES E VENDAS EM PÉ',
        ];
        const { data: planoDeducao } = await supabase
          .from('financeiro_plano_contas')
          .select('id, macro_custo, centro_custo, subcentro')
          .eq('ativo', true)
          .eq('tipo_operacao', '2-Saídas')
          .in('subcentro', subcentroDeducaoCandidatos)
          .limit(2);

        if (!planoDeducao || planoDeducao.length === 0) {
          toast.error('Não foi encontrado mapeamento financeiro válido para deduções de abates no plano de classificação.');
          setGerando(false);
          return false;
        }

        const clasDed = subcentroDeducaoCandidatos.reduce<(typeof planoDeducao)[0] | null>(
          (found, sub) => found || planoDeducao.find(p => p.subcentro === sub) || null, null
        ) || planoDeducao[0];
        const frigorificoLabel = frigorifico ? ` | ${frigorifico}` : '';
        const descDeducao = `Dedução ${abateLabel}${frigorificoLabel}`;
        // Funrural deductions are fiscal-only (no cash movement)
        const isFunrural = /funrural/i.test(descDeducao) || /funrural/i.test(frigorifico || '');
        inserts.push({
          cliente_id: clienteAtual.id,
          fazenda_id: fazendaAtual.id,
          tipo_operacao: '2-Saídas',
          sinal: -1,
          status_transacao: isPrevisto ? 'previsto' : 'programado',
          origem_lancamento: 'movimentacao_rebanho',
          movimentacao_rebanho_id: targetLancamentoId,
          macro_custo: clasDed.macro_custo,
          centro_custo: clasDed.centro_custo,
          subcentro: clasDed.subcentro,
          numero_documento: notaFiscal || null,
          ano_mes: anoMes,
          valor: efTotalDescontos,
          data_competencia: data,
          data_pagamento: data,
          descricao: descDeducao,
          historico: frigorifico ? `Frigorífico: ${frigorifico}` : null,
          origem_tipo: 'abate:deducao',
          sem_movimentacao_caixa: isFunrural,
        });
      }

      console.log('[AbateFinanceiro] INSERT payload', JSON.stringify(inserts, null, 2));
      const { error, data: insertedData } = await supabase.from('financeiro_lancamentos_v2').insert(inserts).select('id');
      if (error) {
        console.error('[AbateFinanceiro] INSERT ERROR', error, JSON.stringify(error));
        console.error('[AbateFinanceiro] INSERT payload was', JSON.stringify(inserts));
        throw error;
      }
      console.log('[AbateFinanceiro] INSERT OK', insertedData?.length, 'records');

      setGerado(true);
      const msg = mode === 'update'
        ? `Financeiro atualizado: ${inserts.length} novo(s) lançamento(s) gerado(s)`
        : `${inserts.length} lançamento(s) financeiro(s) de receita gerado(s)!`;
      toast.success(msg);
      if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
      return true;
    } catch (err: any) {
      console.error('[AbateFinanceiro] CATCH ERROR', err, JSON.stringify(err));
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
      return false;
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-2">
      <Separator />
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Informações de Pagamento</h4>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {/* Nota Fiscal */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground min-w-[90px]">Nota Fiscal</span>
            <Input value={notaFiscal} onChange={e => onNotaFiscalChange(e.target.value)} placeholder="Nº da nota" className="h-7 text-[11px] flex-1" />
          </div>

          {/* Valor líquido reference */}
          {valorLiquido > 0 && (
            <div className="flex justify-between items-center text-[11px] bg-muted/30 rounded px-2 py-1">
              <span className="text-muted-foreground">Valor líquido total</span>
              <strong className="text-primary">{formatMoeda(valorLiquido)}</strong>
            </div>
          )}

          {/* Forma de Recebimento */}
          <div className="space-y-1.5">
            <h5 className="text-[10px] font-bold text-muted-foreground uppercase">Forma de Recebimento</h5>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => { setFormaReceb('avista'); setParcelas([]); }}
                className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaReceb === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                À vista
              </button>
              <button type="button" onClick={() => { setFormaReceb('prazo'); handleQtdParcelasChange(qtdParcelas); }}
                className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaReceb === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                A prazo
              </button>
            </div>
          </div>

          {/* Parcelas */}
          {formaReceb === 'prazo' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="2" max="48" value={qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} className="h-8 text-[12px]" />
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

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 text-destructive text-[10px] rounded p-2 space-y-0.5">
              {validationErrors.map((e, i) => (
                <div key={i} className="flex gap-1 items-start">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Info banner for previsto */}
          {isPrevisto && (
            <div className="flex items-center gap-2 text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border border-orange-300 dark:border-orange-800 rounded p-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>Status Previsto: o financeiro será gerado automaticamente ao registrar o abate.</span>
            </div>
          )}

          {/* Show status when financeiro already generated (for update mode) */}
          {gerado && (
            <div className="flex items-center gap-2 text-[11px] text-primary bg-primary/10 rounded p-2">
              <CheckCircle className="h-4 w-4" />
              <span className="font-semibold">Financeiro gerado ({existingCount > 0 ? existingCount : 1} registro{existingCount > 1 ? 's' : ''})</span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Confirm update dialog */}
      <AlertDialog open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Substituir lançamentos financeiros?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Existem <strong>{existingCount}</strong> lançamento(s) financeiro(s) vinculado(s) a este abate.
              Ao continuar, os registros antigos serão cancelados e novos serão gerados com os valores atuais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleGerarFinanceiroInternal(lancamentoId!)}>
              Confirmar Substituição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
