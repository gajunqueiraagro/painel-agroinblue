import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, CheckCircle, AlertTriangle, Info, Calculator } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';
import { BoitelPlanningDialog, type BoitelData } from '@/components/BoitelPlanningDialog';
import { salvarBoitelLote, salvarBoitelPlanejamento, vincularBoitelAoLancamento, gerarFinanceiroBoitel, carregarBoitelOperacao } from '@/hooks/useBoitelOperacoes';
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
  destino: string;
  fornecedorId: string;
  onFornecedorIdChange: (id: string) => void;
  fornecedores: { id: string; nome: string }[];
  onCreateFornecedor: (nome: string, cpfCnpj?: string) => Promise<void>;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  statusOp: StatusOperacional;
  lancamentoId?: string;
  mode?: 'create' | 'update';
  onFinanceiroUpdated?: () => void;
  onRequestRegister?: () => void;
  registerLabel?: string;
  submitting?: boolean;
  tipoPeso: string;
  onTipoPesoChange: (v: string) => void;
  vendaTipoPreco: string;
  onVendaTipoPrecoChange: (v: string) => void;
  vendaPrecoInput: string;
  onVendaPrecoInputChange: (v: string) => void;
  valorBruto: number;
  totalBonus: number;
  totalDescontos: number;
  valorLiquido: number;
  funruralPct: string;
  onFunruralPctChange: (v: string) => void;
  descontoQualidade: string;
  onDescontoQualidadeChange: (v: string) => void;
  outrosDescontos: string;
  onOutrosDescontosChange: (v: string) => void;
  descFunruralTotal: number;
  descQualidadeTotal: number;
  frete: string;
  onFreteChange: (v: string) => void;
  comissao: string;
  onComissaoChange: (v: string) => void;
  // Funrural R$ manual input
  funruralReais: string;
  onFunruralReaisChange: (v: string) => void;
  // Calculation values for resumo
  comissaoVal: number;
  freteVal: number;
  onBoitelDataChange?: (data: BoitelData | null) => void;
  initialBoitelData?: Partial<BoitelData> | null;
}

export interface VendaFinanceiroPanelRef {
  generateFinanceiro: (lancamentoId: string) => Promise<boolean>;
  getValidationErrors: () => string[];
  getFornecedorId: () => string;
  getRecebimentoSnapshot: () => { formaReceb: 'avista' | 'prazo'; parcelas: Parcela[] };
  getBoitelData: () => BoitelData | null;
  resetForm: () => void;
  openBoitelDialog: () => void;
}

export const VendaFinanceiroPanel = forwardRef<VendaFinanceiroPanelRef, Props>(function VendaFinanceiroPanel({
  quantidade, pesoKg, categoria, data, destino, fornecedorId, notaFiscal, onNotaFiscalChange,
  statusOp, lancamentoId, mode = 'create', onFinanceiroUpdated,
  onRequestRegister, registerLabel, submitting: externalSubmitting,
  tipoPeso, onTipoPesoChange,
  vendaTipoPreco, onVendaTipoPrecoChange, vendaPrecoInput, onVendaPrecoInputChange,
  valorBruto, totalBonus, totalDescontos, valorLiquido,
  funruralPct, onFunruralPctChange,
  descontoQualidade, onDescontoQualidadeChange,
  outrosDescontos, onOutrosDescontosChange,
  descFunruralTotal, descQualidadeTotal,
  frete, onFreteChange, comissao, onComissaoChange,
  funruralReais, onFunruralReaisChange,
  comissaoVal, freteVal,
  onBoitelDataChange, initialBoitelData,
}: Props, ref) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const isPrevisto = statusOp === 'meta';
  const isConfirmado = statusOp === 'programado';
  const isConciliado = statusOp === 'realizado';

  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  const [boitelOpen, setBoitelOpen] = useState(false);
  const [boitelData, setBoitelDataInternal] = useState<BoitelData | null>(null);
  const [boitelLoaded, setBoitelLoaded] = useState(false);

  // Wrapper to notify parent on every change
  const setBoitelData = (val: BoitelData | null | ((prev: BoitelData | null) => BoitelData | null)) => {
    setBoitelDataInternal(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      onBoitelDataChange?.(next);
      return next;
    });
  };

  // Initialize from snapshot first, then fallback to DB
  useEffect(() => {
    if (tipoPeso !== 'boitel' || boitelLoaded || boitelData) return;

    // Priority 1: Use snapshot data passed from parent (from detalhesSnapshot.boitelSnapshot)
    if (initialBoitelData && Object.keys(initialBoitelData).length > 0) {
      console.log('[Boitel Edit] Rehydrating from snapshot', initialBoitelData);
      const rehydrated: BoitelData = {
        qtdCabecas: initialBoitelData.qtdCabecas ?? quantidade,
        pesoInicial: initialBoitelData.pesoInicial ?? pesoKg,
        fazendaOrigem: initialBoitelData.fazendaOrigem ?? '',
        nomeBoitel: initialBoitelData.nomeBoitel ?? '',
        lote: initialBoitelData.lote ?? '',
        numeroContrato: initialBoitelData.numeroContrato ?? '',
        dataEnvio: initialBoitelData.dataEnvio ?? '',
        quebraViagem: initialBoitelData.quebraViagem ?? 3,
        custoOportunidade: initialBoitelData.custoOportunidade ?? 0,
        dias: initialBoitelData.dias ?? 90,
        gmd: initialBoitelData.gmd ?? 0.8,
        rendimentoEntrada: initialBoitelData.rendimentoEntrada ?? 50,
        rendimento: initialBoitelData.rendimento ?? 52,
        modalidadeCusto: initialBoitelData.modalidadeCusto ?? 'diaria',
        custoDiaria: initialBoitelData.custoDiaria ?? 0,
        custoArroba: initialBoitelData.custoArroba ?? 0,
        percentualParceria: initialBoitelData.percentualParceria ?? 50,
        custosExtrasParceria: initialBoitelData.custosExtrasParceria ?? 0,
        custoFrete: initialBoitelData.custoFrete ?? 0,
        outrosCustos: initialBoitelData.outrosCustos ?? 0,
        custoNutricao: initialBoitelData.custoNutricao ?? 0,
        custoSanidade: initialBoitelData.custoSanidade ?? 0,
        custoNfAbate: initialBoitelData.custoNfAbate ?? 0,
        precoVendaArroba: initialBoitelData.precoVendaArroba ?? 0,
        despesasAbate: initialBoitelData.despesasAbate ?? 0,
        formaReceb: initialBoitelData.formaReceb ?? 'avista',
        qtdParcelas: initialBoitelData.qtdParcelas ?? 1,
        parcelas: initialBoitelData.parcelas ?? [],
        possuiAdiantamento: initialBoitelData.possuiAdiantamento ?? false,
        dataAdiantamento: initialBoitelData.dataAdiantamento ?? '',
        pctAdiantamentoDiarias: initialBoitelData.pctAdiantamentoDiarias ?? 0,
        valorAdiantamentoDiarias: initialBoitelData.valorAdiantamentoDiarias ?? 0,
        valorAdiantamentoSanitario: initialBoitelData.valorAdiantamentoSanitario ?? 0,
        valorAdiantamentoOutros: initialBoitelData.valorAdiantamentoOutros ?? 0,
        valorTotalAntecipado: initialBoitelData.valorTotalAntecipado ?? 0,
        adiantamentoObservacao: initialBoitelData.adiantamentoObservacao ?? '',
        _faturamentoBruto: initialBoitelData._faturamentoBruto,
        _faturamentoLiquido: initialBoitelData._faturamentoLiquido,
        _receitaProdutor: initialBoitelData._receitaProdutor,
        _custoTotal: initialBoitelData._custoTotal,
        _lucroTotal: initialBoitelData._lucroTotal,
        _saldoReceber: initialBoitelData._saldoReceber,
        _boitelId: initialBoitelData._boitelId,
      };
      setBoitelData(rehydrated);
      setBoitelLoaded(true);
      return;
    }

    // Priority 2: Load from DB via boitel_lote_id
    if (!lancamentoId) { setBoitelLoaded(true); return; }
    (async () => {
      const { data: lanc } = await supabase
        .from('lancamentos')
        .select('boitel_lote_id')
        .eq('id', lancamentoId)
        .single();
      if (!lanc?.boitel_lote_id) { setBoitelLoaded(true); return; }
      const boitel = await carregarBoitelOperacao(lanc.boitel_lote_id as string);
      if (boitel) {
        const p = boitel.planejamento;
        console.log('[Boitel Edit] Loaded boitelData from DB:', boitel.id);
        setBoitelData({
          qtdCabecas: boitel.quantidade_cab,
          pesoInicial: boitel.peso_saida_fazenda_kg,
          fazendaOrigem: '',
          nomeBoitel: boitel.boitel_destino,
          lote: boitel.lote_codigo || '',
          numeroContrato: boitel.contrato_baia || '',
          dataEnvio: boitel.data_envio || '',
          quebraViagem: 3,
          custoOportunidade: 0,
          dias: p.dias,
          gmd: p.gmd,
          rendimentoEntrada: p.rendimento_entrada,
          rendimento: p.rendimento_saida,
          modalidadeCusto: p.modalidade as 'diaria' | 'arroba' | 'parceria',
          custoDiaria: p.custo_diaria,
          custoArroba: p.custo_arroba,
          percentualParceria: p.percentual_parceria,
          custosExtrasParceria: p.custos_extras_parceria,
          custoFrete: p.custo_frete,
          outrosCustos: p.outros_custos,
          custoNutricao: p.custo_nutricao || 0,
          custoSanidade: p.custo_sanidade || 0,
          custoNfAbate: 0,
          precoVendaArroba: p.preco_venda_arroba,
          despesasAbate: p.despesas_abate,
          formaReceb: 'avista',
          qtdParcelas: 1,
          parcelas: [],
          possuiAdiantamento: p.possui_adiantamento ?? false,
          dataAdiantamento: p.data_adiantamento ?? '',
          pctAdiantamentoDiarias: p.pct_adiantamento_diarias ?? 0,
          valorAdiantamentoDiarias: p.valor_adiantamento_diarias ?? 0,
          valorAdiantamentoSanitario: p.valor_adiantamento_sanitario ?? 0,
          valorAdiantamentoOutros: p.valor_adiantamento_outros ?? 0,
          valorTotalAntecipado: p.valor_total_antecipado ?? 0,
          adiantamentoObservacao: p.adiantamento_observacao ?? '',
          _faturamentoBruto: p.faturamento_bruto,
          _faturamentoLiquido: p.faturamento_liquido,
          _receitaProdutor: p.receita_produtor,
          _custoTotal: p.custo_total,
          _lucroTotal: p.lucro_total,
          _saldoReceber: undefined,
          _boitelId: boitel.id,
        });
      }
      setBoitelLoaded(true);
    })();
  }, [tipoPeso, lancamentoId, boitelLoaded, boitelData, initialBoitelData]);

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

  const gerarParcelas = useCallback((numParcelas: number, baseDate: string, valorTotal: number) => {
    const p: Parcela[] = [];
    const vp = valorTotal / numParcelas;
    for (let i = 0; i < numParcelas; i++) {
      const d = addDays(parseISO(baseDate || data), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((valorTotal - rest) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcelasChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0) {
      setParcelas(gerarParcelas(n, data, valorBruto));
    }
  };

  useEffect(() => {
    if (formaReceb === 'prazo') {
      const n = Number(qtdParcelas);
      if (n > 0) {
        setParcelas(gerarParcelas(n, data, valorBruto));
      }
    }
  }, [valorBruto, formaReceb, qtdParcelas, data, gerarParcelas]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (valorLiquido <= 0 && valorBruto <= 0) errors.push('Valor da venda deve ser maior que zero.');
    if (formaReceb === 'prazo' && parcelas.length > 0) {
      const soma = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const ref = Math.round(valorBruto * 100) / 100;
      if (Math.abs(soma - ref) > 0.01) {
        errors.push(`A soma das parcelas (${formatMoeda(soma)}) deve ser igual ao valor bruto (${formatMoeda(ref)}).`);
      }
      parcelas.forEach((p, i) => {
        if (!p.data) errors.push(`Parcela ${i + 1}: data obrigatória.`);
        if (!p.valor || p.valor <= 0) errors.push(`Parcela ${i + 1}: valor deve ser maior que zero.`);
      });
    }
    return errors;
  }, [valorLiquido, valorBruto, formaReceb, parcelas]);

  const resetForm = useCallback(() => {
    setFormaReceb('avista');
    setParcelas([]);
    setQtdParcelas('1');
    setGerado(false);
    setExistingLoaded(false);
    setExistingCount(0);
  }, []);

  useImperativeHandle(ref, () => ({
    generateFinanceiro: async (extLancamentoId: string) => handleGerarFinanceiroInternal(extLancamentoId),
    getValidationErrors: () => validationErrors,
    getFornecedorId: () => fornecedorId,
    getRecebimentoSnapshot: () => {
      if (tipoPeso === 'boitel' && boitelData) {
        return { formaReceb: boitelData.formaReceb || 'avista', parcelas: boitelData.parcelas || [] };
      }
      return { formaReceb, parcelas };
    },
    getBoitelData: () => boitelData,
    resetForm,
    openBoitelDialog: () => setBoitelOpen(true),
  }), [fornecedorId, formaReceb, parcelas, resetForm, validationErrors, tipoPeso, boitelData]);

  const handleGerarFinanceiroInternal = async (targetLancamentoId: string): Promise<boolean> => {
    console.log('[Venda Financeiro] generateFinanceiro chamado', { targetLancamentoId, tipoPeso, temBoitelData: !!boitelData });
    if (!targetLancamentoId) { toast.error('Salve o lançamento zootécnico primeiro.'); return false; }
    if (!fazendaAtual || !clienteAtual) {
      console.error('[Venda Financeiro] fazendaAtual ou clienteAtual ausente', { fazendaAtual: !!fazendaAtual, clienteAtual: !!clienteAtual });
      return false;
    }

    // ── BOITEL FLOW ──
    if (tipoPeso === 'boitel') {
      if (!boitelData) {
        console.error('[Venda Financeiro] BOITEL selecionado mas boitelData está vazio');
        toast.error('Preencha os dados do Boitel antes de registrar.');
        return false;
      }
      console.log('[Venda Financeiro] Entrando no fluxo BOITEL', { receitaProdutor: boitelData._receitaProdutor, lucroTotal: boitelData._lucroTotal });
      setGerando(true);
      try {
        // Resolve existing boitel_lote_id
        let resolvedLoteId = boitelData._boitelId;
        if (!resolvedLoteId && targetLancamentoId) {
          const { data: lancDb } = await supabase
            .from('lancamentos')
            .select('boitel_lote_id')
            .eq('id', targetLancamentoId)
            .single();
          if (lancDb?.boitel_lote_id) {
            resolvedLoteId = lancDb.boitel_lote_id as string;
            console.log('[Boitel] Resolved existing boitel_lote_id from lancamento:', resolvedLoteId);
          }
        }

        // 1. Save/update lote
        const loteId = await salvarBoitelLote({
          id: resolvedLoteId || undefined,
          cliente_id: clienteAtual.id,
          fazenda_id: fazendaAtual.id,
          lote_codigo: boitelData.lote || '',
          data_envio: boitelData.dataEnvio || data,
          boitel_destino: boitelData.nomeBoitel || '',
          contrato_baia: boitelData.numeroContrato || '',
          quantidade_cab: boitelData.qtdCabecas,
          peso_saida_fazenda_kg: boitelData.pesoInicial,
        });
        if (!loteId) { setGerando(false); return false; }

        // 2. Save/update planejamento (auto-creates history on update)
        const planOk = await salvarBoitelPlanejamento({
          boitel_lote_id: loteId,
          modalidade: boitelData.modalidadeCusto,
          dias: boitelData.dias,
          gmd: boitelData.gmd,
          rendimento_entrada: boitelData.rendimentoEntrada,
          rendimento_saida: boitelData.rendimento,
          custo_diaria: boitelData.custoDiaria,
          custo_arroba: boitelData.custoArroba,
          percentual_parceria: boitelData.percentualParceria,
          custos_extras_parceria: boitelData.custosExtrasParceria,
          custo_nutricao: boitelData.custoNutricao,
          custo_sanidade: boitelData.custoSanidade,
          custo_frete: boitelData.custoFrete,
          outros_custos: boitelData.outrosCustos,
          despesas_abate: boitelData.despesasAbate,
          preco_venda_arroba: boitelData.precoVendaArroba,
          faturamento_bruto: boitelData._faturamentoBruto || 0,
          faturamento_liquido: boitelData._faturamentoLiquido || 0,
          receita_produtor: boitelData._receitaProdutor || 0,
          custo_total: boitelData._custoTotal || 0,
          lucro_total: boitelData._lucroTotal || 0,
          possui_adiantamento: boitelData.possuiAdiantamento || false,
          data_adiantamento: boitelData.dataAdiantamento || null,
          pct_adiantamento_diarias: boitelData.pctAdiantamentoDiarias || 0,
          valor_adiantamento_diarias: boitelData.valorAdiantamentoDiarias || 0,
          valor_adiantamento_sanitario: boitelData.valorAdiantamentoSanitario || 0,
          valor_adiantamento_outros: boitelData.valorAdiantamentoOutros || 0,
          valor_total_antecipado: boitelData.valorTotalAntecipado || 0,
          adiantamento_observacao: boitelData.adiantamentoObservacao || null,
        });
        if (!planOk) { setGerando(false); return false; }

        // 3. Link to lancamento
        await vincularBoitelAoLancamento(targetLancamentoId, loteId);
        setBoitelData(prev => prev ? { ...prev, _boitelId: loteId } : prev);

        // Data financeira = data de abate (dataEnvio + dias)
        let dataFinanceira = data;
        if (boitelData.dataEnvio && boitelData.dias > 0) {
          try {
            dataFinanceira = format(addDays(parseISO(boitelData.dataEnvio), boitelData.dias), 'yyyy-MM-dd');
          } catch { /* keep data */ }
        }

        // 4. Generate financial records
        const isUpdate = mode === 'update' || existingCount > 0;
        const plan = {
          boitel_lote_id: loteId,
          modalidade: boitelData.modalidadeCusto as 'diaria' | 'arroba' | 'parceria',
          dias: boitelData.dias, gmd: boitelData.gmd,
          rendimento_entrada: boitelData.rendimentoEntrada, rendimento_saida: boitelData.rendimento,
          custo_diaria: boitelData.custoDiaria, custo_arroba: boitelData.custoArroba,
          percentual_parceria: boitelData.percentualParceria, custos_extras_parceria: boitelData.custosExtrasParceria,
          custo_nutricao: boitelData.custoNutricao, custo_sanidade: boitelData.custoSanidade,
          custo_frete: boitelData.custoFrete, outros_custos: boitelData.outrosCustos,
          despesas_abate: boitelData.despesasAbate, preco_venda_arroba: boitelData.precoVendaArroba,
          faturamento_bruto: boitelData._faturamentoBruto || 0, faturamento_liquido: boitelData._faturamentoLiquido || 0,
          receita_produtor: boitelData._receitaProdutor || 0, custo_total: boitelData._custoTotal || 0,
          lucro_total: boitelData._lucroTotal || 0,
          possui_adiantamento: boitelData.possuiAdiantamento || false,
          data_adiantamento: boitelData.dataAdiantamento || null,
          pct_adiantamento_diarias: boitelData.pctAdiantamentoDiarias || 0,
          valor_adiantamento_diarias: boitelData.valorAdiantamentoDiarias || 0,
          valor_adiantamento_sanitario: boitelData.valorAdiantamentoSanitario || 0,
          valor_adiantamento_outros: boitelData.valorAdiantamentoOutros || 0,
          valor_total_antecipado: boitelData.valorTotalAntecipado || 0,
          adiantamento_observacao: boitelData.adiantamentoObservacao || null,
        };
        const lote = {
          id: loteId, cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id,
          lote_codigo: boitelData.lote || '', data_envio: boitelData.dataEnvio || data,
          boitel_destino: boitelData.nomeBoitel || '', contrato_baia: boitelData.numeroContrato || '',
          quantidade_cab: boitelData.qtdCabecas, peso_saida_fazenda_kg: boitelData.pesoInicial,
        };
        const ok = await gerarFinanceiroBoitel(
          loteId, plan, lote,
          targetLancamentoId,
          clienteAtual.id,
          fazendaAtual.id,
          dataFinanceira,
          {
            fornecedorId: fornecedorId || undefined,
            notaFiscal: notaFiscal || undefined,
            isUpdate,
            formaReceb: boitelData.formaReceb || 'avista',
            parcelas: boitelData.parcelas || [],
          }
        );

        if (ok) {
          setGerado(true);
          if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
        }
        return ok;
      } catch (err: any) {
        toast.error('Erro no processamento do boitel: ' + (err.message || err));
        return false;
      } finally {
        setGerando(false);
      }
    }

    // ── VENDA NORMAL FLOW ──
    if (validationErrors.length > 0) { toast.error(validationErrors[0]); return false; }

    setGerando(true);
    try {
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
          await supabase.from('audit_log_movimentacoes').insert({
            cliente_id: clienteAtual.id, usuario_id: userId || null,
            acao: 'recalculo_financeiro_venda', movimentacao_id: targetLancamentoId,
            financeiro_ids: oldIds, detalhes: { registros_cancelados: oldIds.length, motivo: 'Recálculo financeiro da venda' },
          });
        }
      } else {
        const { data: existing } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', targetLancamentoId)
          .eq('cancelado', false)
          .limit(1);
        if (existing && existing.length > 0) {
          toast.error('Lançamentos financeiros já foram gerados para esta venda.');
          setGerado(true);
          return false;
        }
      }

      const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
      const vendaLabel = `Venda ${quantidade} ${catLabel}`;
      const anoMes = data.slice(0, 7);
      const inserts: any[] = [];

      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      const subcentroCandidates = isFemea
        ? ['PEC/RECEITA/VENDAS EM PÉ/FEMEAS', 'PEC/RECEITA/VENDAS/FEMEAS', 'PEC/RECEITA/ABATES/FEMEAS']
        : ['PEC/RECEITA/VENDAS EM PÉ/MACHOS', 'PEC/RECEITA/VENDAS/MACHOS', 'PEC/RECEITA/ABATES/MACHOS'];

      const { data: planoReceita } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativo', true)
        .eq('tipo_operacao', '1-Entradas')
        .in('subcentro', subcentroCandidates);

      if (!planoReceita || planoReceita.length === 0) {
        toast.error(`Não foi encontrado mapeamento financeiro válido para receita de venda em pé no plano de classificação. Subcentros buscados: ${subcentroCandidates.join(', ')}`);
        setGerando(false);
        return false;
      }

      const clasReceita = planoReceita.find(p => subcentroCandidates.indexOf(p.subcentro!) >= 0) || planoReceita[0];
      const statusFin = isPrevisto ? 'previsto' : 'programado';

      const baseRecord: Record<string, any> = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        tipo_operacao: '1-Entradas',
        sinal: 1,
        status_transacao: statusFin,
        origem_lancamento: 'movimentacao_rebanho',
        movimentacao_rebanho_id: targetLancamentoId,
        macro_custo: clasReceita.macro_custo,
        centro_custo: clasReceita.centro_custo,
        subcentro: clasReceita.subcentro,
        nota_fiscal: notaFiscal || undefined,
      };

      if (fornecedorId) baseRecord.favorecido_id = fornecedorId;

      if (formaReceb === 'prazo' && parcelas.length > 0) {
        parcelas.forEach((p, i) => {
          inserts.push({
            ...baseRecord,
            ano_mes: p.data.slice(0, 7),
            valor: p.valor,
            data_competencia: data,
            data_pagamento: p.data,
            descricao: `${vendaLabel} - Parcela ${i + 1}/${parcelas.length}`,
            historico: destino ? `Comprador: ${destino}` : undefined,
            origem_tipo: 'venda:parcela',
          });
        });
      } else {
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          valor: valorBruto,
          data_competencia: data,
          data_pagamento: data,
          descricao: vendaLabel,
          historico: destino ? `Comprador: ${destino}` : undefined,
          origem_tipo: 'venda:parcela',
        });
      }

      const saidasSeparadas = [
        { descricao: 'Frete', origemTipo: 'venda:frete', valor: freteVal },
        { descricao: 'Comissão', origemTipo: 'venda:comissao', valor: comissaoVal },
        { descricao: 'Funrural', origemTipo: 'venda:funrural', valor: descFunruralTotal },
        { descricao: 'Desconto Qualidade', origemTipo: 'venda:desconto_qualidade', valor: descQualidadeTotal },
        { descricao: 'Outros Custos', origemTipo: 'venda:outros_custos', valor: Number(outrosDescontos) || 0 },
      ].filter(item => item.valor > 0);

      if (saidasSeparadas.length > 0) {
        const subcentroDeducao = 'PEC/NOTAS COM ABATES E VENDAS EM PÉ';
        const { data: planoDeducao } = await supabase
          .from('financeiro_plano_contas')
          .select('id, macro_custo, centro_custo, subcentro')
          .eq('cliente_id', clienteAtual.id)
          .eq('ativo', true)
          .eq('tipo_operacao', '2-Saídas')
          .eq('subcentro', subcentroDeducao)
          .limit(1);

        if (!planoDeducao || planoDeducao.length === 0) {
          toast.error(`Não foi encontrado mapeamento financeiro válido para "${subcentroDeducao}" no plano de classificação.`);
          setGerando(false);
          return false;
        }

        const clasDed = planoDeducao[0];
        saidasSeparadas.forEach(item => {
          inserts.push({
            cliente_id: clienteAtual.id,
            fazenda_id: fazendaAtual.id,
            tipo_operacao: '2-Saídas',
            sinal: -1,
            status_transacao: statusFin,
            origem_lancamento: 'movimentacao_rebanho',
            movimentacao_rebanho_id: targetLancamentoId,
            macro_custo: clasDed.macro_custo,
            centro_custo: clasDed.centro_custo,
            subcentro: clasDed.subcentro,
            nota_fiscal: notaFiscal || undefined,
            ano_mes: anoMes,
            valor: item.valor,
            data_competencia: data,
            data_pagamento: data,
            descricao: `${item.descricao} ${vendaLabel}${destino ? ` | ${destino}` : ''}`,
            historico: destino ? `Comprador: ${destino}` : undefined,
            origem_tipo: item.origemTipo,
          });
        });
      }

      const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
      if (error) throw error;

      setGerado(true);
      toast.success(`${inserts.length} lançamento(s) financeiro(s) de venda gerado(s)!`);
      if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
      return true;
    } catch (err: any) {
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
      return false;
    } finally {
      setGerando(false);
    }
  };

  const hasTipoVendaSelecionado = ['desmama', 'gado_adulto', 'boitel'].includes(tipoPeso);
  const isBoitel = tipoPeso === 'boitel';
  const isNormalVenda = tipoPeso === 'desmama' || tipoPeso === 'gado_adulto';

  // Summaries for collapsed headers
  const tipoVendaLabel = tipoPeso === 'desmama' ? 'Desmama' : tipoPeso === 'gado_adulto' ? 'Gado Adulto' : tipoPeso === 'boitel' ? 'Boitel' : '';
  const tipoPrecoLabel = vendaTipoPreco === 'por_kg' ? 'Por kg' : vendaTipoPreco === 'por_cab' ? 'Por cabeça' : 'Por total';
  const despesasComTotal = freteVal + comissaoVal + (Number(outrosDescontos) || 0);
  const deducoesTotal = descFunruralTotal;
  const recebLabel = formaReceb === 'avista' ? 'À vista' : `A prazo (${parcelas.length}x)`;

  // Funrural mode: if user typed R$ manually, disable %; if typed %, disable R$
  const funruralPctFilled = !!funruralPct && Number(funruralPct) > 0;
  const funruralReaisFilled = !!funruralReais && Number(funruralReais) > 0;
  const funruralPctCalculado = funruralReaisFilled && valorBruto > 0
    ? ((Number(funruralReais) / valorBruto) * 100).toFixed(2)
    : funruralPct;
  const funruralReaisCalculado = funruralPctFilled
    ? (descFunruralTotal > 0 ? descFunruralTotal.toFixed(2) : '')
    : funruralReais;

  const summaryBadge = (text: string) => (
    <span className="text-[11px] italic text-muted-foreground font-normal ml-1.5 truncate max-w-[140px]">{text}</span>
  );

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros — Venda</h3>
      <Separator />

      {/* 1. TIPO DE VENDA */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <div className="flex items-center">
            <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Tipo de Venda</h4>
            {tipoVendaLabel && summaryBadge(tipoVendaLabel)}
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <Select value={tipoPeso || undefined} onValueChange={(v: any) => onTipoPesoChange(v)}>
            <SelectTrigger className="h-7 text-[11px] w-full"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desmama" className="text-[11px]">Desmama</SelectItem>
              <SelectItem value="gado_adulto" className="text-[11px]">Gado Adulto</SelectItem>
              <SelectItem value="boitel" className="text-[11px]">Boitel</SelectItem>
            </SelectContent>
          </Select>
        </CollapsibleContent>
      </Collapsible>

      {/* Boitel section */}
      {hasTipoVendaSelecionado && isBoitel && (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full h-9 text-[12px] font-bold gap-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={async () => {
              // Se já existe boitelData (edição), verificar se há lançamentos manuais
              if (boitelData?._boitelId) {
                const { data: manuais } = await supabase
                  .from('financeiro_lancamentos_v2')
                  .select('id')
                  .eq('boitel_lote_id', boitelData._boitelId)
                  .eq('cancelado', false)
                  .is('grupo_geracao_id', null)
                  .limit(1);
                if (manuais && manuais.length > 0) {
                  const confirmou = window.confirm(
                    '⚠️ Este boitel já possui movimentações financeiras registradas.\n\n' +
                    'Alterar o planejamento pode gerar divergência entre o resultado projetado e o financeiro já realizado.\n\n' +
                    'Recomendação:\n• Utilizar a Conta Boitel para controle e conciliação\n• Evitar alterações após início da movimentação financeira\n\n' +
                    'Deseja continuar mesmo assim?'
                  );
                  if (!confirmou) return;
                }
              }
              setBoitelOpen(true);
            }}
          >
            <Calculator className="h-4 w-4" />
            {boitelData ? 'Editar Planejamento Boitel' : 'Abrir Planejamento Boitel'}
          </Button>
          {boitelData && (
            <div className="bg-primary/5 rounded-md p-2 text-[10px] space-y-0.5 border border-primary/20">
              <div className="flex justify-between"><span className="text-muted-foreground">Boitel</span><span className="font-semibold">{boitelData.nomeBoitel || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dias</span><span className="font-semibold">{boitelData.dias}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GMD</span><span className="font-semibold">{boitelData.gmd} kg/dia</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lucro Líquido</span><span className={`font-semibold ${(boitelData._lucroTotal || 0) > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{boitelData._lucroTotal ? formatMoeda(boitelData._lucroTotal) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recebimento</span><span className="font-semibold">{boitelData.formaReceb === 'prazo' ? `A prazo (${boitelData.qtdParcelas}x)` : 'À vista'}</span></div>
            </div>
          )}
        </>
      )}

      <Separator />

      {/* ── NORMAL VENDA BLOCKS (Desmama / Gado Adulto) ── */}
      {isNormalVenda && (
        <>
          {/* TIPO DE PREÇO + PREÇO BASE — unified block */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center">
                <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Tipo de Preço</h4>
                {summaryBadge(`${tipoPrecoLabel}${valorBruto > 0 ? ` · ${formatMoeda(valorBruto)}` : ''}`)}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1 space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                {(['por_kg', 'por_cab', 'por_total'] as const).map(tp => (
                  <button key={tp} type="button"
                    onClick={() => onVendaTipoPrecoChange(tp)}
                    className={`h-8 rounded text-[11px] font-bold border-2 transition-all ${vendaTipoPreco === tp ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                    {tp === 'por_kg' ? 'Por kg' : tp === 'por_cab' ? 'R$/cabeça' : 'Por total'}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-[11px]">
                  {vendaTipoPreco === 'por_kg' ? 'R$/kg' : vendaTipoPreco === 'por_cab' ? 'R$/cabeça' : 'Valor total (R$)'}
                </Label>
                <Input
                  type="number"
                  value={vendaPrecoInput}
                  onChange={e => onVendaPrecoInputChange(e.target.value)}
                  placeholder="0,00"
                  className="h-7 text-[11px]"
                />
              </div>
              {valorBruto > 0 && (
                <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[10px]">
                  {quantidade > 0 && pesoKg > 0 && vendaTipoPreco !== 'por_kg' && (
                    <div className="flex justify-between"><span className="text-muted-foreground">R$/kg</span><span className="font-semibold">{formatMoeda(valorBruto / (pesoKg * quantidade))}</span></div>
                  )}
                  {quantidade > 0 && vendaTipoPreco !== 'por_cab' && (
                    <div className="flex justify-between"><span className="text-muted-foreground">R$/cab</span><span className="font-semibold">{formatMoeda(valorBruto / quantidade)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Total base</span><span className="font-semibold">{formatMoeda(valorBruto)}</span></div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* DESPESAS COMERCIAIS */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center">
                <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Despesas Comerciais</h4>
                {despesasComTotal > 0 && summaryBadge(formatMoeda(despesasComTotal))}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Frete (R$)</Label>
                  <Input type="number" value={frete} onChange={e => onFreteChange(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Comissão (%)</Label>
                  <Input type="number" value={comissao} onChange={e => onComissaoChange(e.target.value)} placeholder="0" className="h-7 text-[11px]" />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Outros custos extras (R$)</Label>
                <Input type="number" value={outrosDescontos} onChange={e => onOutrosDescontosChange(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* DEDUÇÕES / ENCARGOS — Funrural with mutual exclusion */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center">
                <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Deduções / Encargos</h4>
                {deducoesTotal > 0 && summaryBadge(formatMoeda(deducoesTotal))}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Funrural (%)</Label>
                  <Input
                    type="number"
                    value={funruralPctCalculado}
                    onChange={e => {
                      onFunruralPctChange(e.target.value);
                      if (e.target.value && Number(e.target.value) > 0) onFunruralReaisChange('');
                    }}
                    placeholder="0,00"
                    step="0.01"
                    className="h-7 text-[11px]"
                    disabled={funruralReaisFilled}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Funrural (R$)</Label>
                  <Input
                    type="number"
                    value={funruralReaisCalculado}
                    onChange={e => {
                      onFunruralReaisChange(e.target.value);
                      if (e.target.value && Number(e.target.value) > 0) onFunruralPctChange('');
                    }}
                    placeholder="0,00"
                    className={`h-7 text-[11px] ${funruralPctFilled ? 'bg-muted/40' : ''}`}
                    disabled={funruralPctFilled}
                    readOnly={funruralPctFilled}
                  />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">Informe em % ou R$ — o outro será calculado automaticamente.</p>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Resumo financeiro — normal */}
          {valorBruto > 0 && (
            <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[10px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span><span className="font-semibold">{formatMoeda(valorBruto)}</span></div>
              {freteVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-semibold text-destructive">-{formatMoeda(freteVal)}</span></div>}
              {comissaoVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Comissão</span><span className="font-semibold text-destructive">-{formatMoeda(comissaoVal)}</span></div>}
              {(Number(outrosDescontos) || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outros custos</span><span className="font-semibold text-destructive">-{formatMoeda(Number(outrosDescontos) || 0)}</span></div>}
              {descFunruralTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Funrural</span><span className="font-semibold text-destructive">-{formatMoeda(descFunruralTotal)}</span></div>}
              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-[11px]"><span>Valor líquido</span><span className="text-primary">{formatMoeda(valorLiquido)}</span></div>
            </div>
          )}

          <Separator />
        </>
      )}

      {/* Boitel no longer shows DESCONTOS block here — handled inside BoitelPlanningDialog */}

      {/* Informações de Recebimento — only for normal venda; boitel handles it inside its own dialog */}
      {!isBoitel && (
        <>
          <Separator />
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center">
                <h4 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Informações de Recebimento</h4>
                {summaryBadge(recebLabel)}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">

              <div className="space-y-1.5">
                <h5 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Forma de Recebimento</h5>
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

              {formaReceb === 'prazo' && (
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
                    <div key={i} className="flex gap-1 items-start">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              )}

              {isPrevisto && (
                <div className="flex items-center gap-2 text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border border-orange-300 dark:border-orange-800 rounded p-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>Status Previsto: financeiro previsto será gerado ao registrar.</span>
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
        </>
      )}

      {/* Register button */}
      <Separator />
      <Button
        type="button"
        className="w-full h-10 text-[13px] font-bold"
        onClick={onRequestRegister}
        disabled={externalSubmitting}
      >
        {registerLabel || 'Registrar Venda'}
      </Button>

      <BoitelPlanningDialog
        open={boitelOpen}
        onClose={() => setBoitelOpen(false)}
        onSave={setBoitelData}
        initialData={boitelData || undefined}
        quantidade={quantidade}
        pesoKg={pesoKg}
        fazendaNome={fazendaAtual?.nome}
        dataLancamento={data}
        destinoNome={destino}
      />
    </div>
  );
});
