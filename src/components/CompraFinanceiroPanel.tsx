import { useState, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import type { FiltroVisual } from '@/lib/statusOperacional';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';

type TipoPreco = 'por_kg' | 'por_cab' | 'por_total';

interface Parcela {
  data: string;
  valor: number;
}

interface Props {
  quantidade: number;
  pesoKg: number;
  data: string;
  categoria: string;
  statusOp: FiltroVisual;
  fazendaOrigem: string;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  fornecedorId: string;
  lancamentoId?: string;
  mode?: 'create' | 'update';
  onFinanceiroUpdated?: () => void;
  onValidationChange?: (errors: string[]) => void;
  onRequestRegister?: () => void;
  registerLabel?: string;
  submitting?: boolean;
}

export interface CompraFinanceiroPanelRef {
  generateFinanceiro: (lancamentoId: string) => Promise<boolean>;
  getValidationErrors: () => string[];
  getFornecedorId: () => string;
  getValorBase: () => number;
  getTipoPreco: () => string;
  resetForm: () => void;
}

function CollapsibleBlock({ title, open, onOpenChange, children, summary }: { title: string; open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode; summary?: string }) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="flex items-center justify-between w-full text-[12px] font-semibold uppercase text-muted-foreground tracking-wide py-1 hover:text-foreground transition-colors group">
        <div className="flex items-center gap-1.5">
          {title}
          {summary && <span className="text-[11px] italic text-muted-foreground font-normal normal-case truncate max-w-[140px]">{summary}</span>}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export const CompraFinanceiroPanel = forwardRef<CompraFinanceiroPanelRef, Props>(function CompraFinanceiroPanel({
  quantidade, pesoKg, data, categoria, statusOp, fazendaOrigem, notaFiscal, onNotaFiscalChange, fornecedorId, lancamentoId, mode = 'create', onFinanceiroUpdated, onValidationChange, onRequestRegister, registerLabel, submitting: externalSubmitting,
}, ref) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();

  const [tipoPreco, setTipoPreco] = useState<TipoPreco>('por_kg');
  const [precoKg, setPrecoKg] = useState('');
  const [precoCab, setPrecoCab] = useState('');
  const [valorTotal, setValorTotal] = useState('');

  const [frete, setFrete] = useState('');
  const [comissaoPct, setComissaoPct] = useState('');

  const [tipoCompraOpen, setTipoCompraOpen] = useState(false);
  const [precoBaseOpen, setPrecoBaseOpen] = useState(false);
  const [despesasOpen, setDespesasOpen] = useState(false);
  const [pagamentoOpen, setPagamentoOpen] = useState(false);

  const [formaPag, setFormaPag] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  // Load existing financial records in update mode
  useEffect(() => {
    if (mode !== 'update' || !lancamentoId) { setExistingLoaded(true); return; }
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, valor, data_competencia, data_pagamento, descricao, origem_tipo, favorecido_id, numero_documento')
      .eq('movimentacao_rebanho_id', lancamentoId)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true })
      .then(({ data: records }) => {
        const recs = records || [];
        setExistingCount(recs.length);
        setExistingLoaded(true);

        if (recs.length === 0) return;

        const parcelaRecs = recs.filter(r => r.origem_tipo?.includes('parcela'));
        const freteRec = recs.find(r => r.origem_tipo?.includes('frete'));
        const comissaoRec = recs.find(r => r.origem_tipo?.includes('comissao'));

        const totalParcelas = parcelaRecs.reduce((s, r) => s + (r.valor || 0), 0);

        if (totalParcelas > 0) {
          setTipoPreco('por_total');
          setValorTotal(String(totalParcelas));
          setTipoCompraOpen(true);
          setPrecoBaseOpen(true);
        }

        if (freteRec && freteRec.valor > 0) {
          setFrete(String(freteRec.valor));
          setDespesasOpen(true);
        }

        if (comissaoRec && comissaoRec.valor > 0 && totalParcelas > 0) {
          const pct = (comissaoRec.valor / totalParcelas) * 100;
          setComissaoPct(String(Math.round(pct * 100) / 100));
          setDespesasOpen(true);
        }

        if (parcelaRecs.length > 1) {
          setFormaPag('prazo');
          setPagamentoOpen(true);
          setQtdParcelas(String(parcelaRecs.length));
          setParcelas(parcelaRecs.map(r => ({
            data: r.data_pagamento || r.data_competencia,
            valor: r.valor,
          })));
        }

        const nf = parcelaRecs[0]?.numero_documento;
        if (nf && !notaFiscal) {
          onNotaFiscalChange(nf as string);
          setPagamentoOpen(true);
        }
      });
  }, [mode, lancamentoId]);

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;
  const totalKg = peso * qtd;

  const calc = useMemo(() => {
    let valorBase = 0;
    let rKg = 0;
    let rCab = 0;

    if (tipoPreco === 'por_kg') {
      rKg = Number(precoKg) || 0;
      valorBase = totalKg * rKg;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    } else if (tipoPreco === 'por_cab') {
      rCab = Number(precoCab) || 0;
      valorBase = qtd * rCab;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
    } else {
      valorBase = Number(valorTotal) || 0;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    }

    const freteVal = Number(frete) || 0;
    const comissaoVal = valorBase * ((Number(comissaoPct) || 0) / 100);
    const totalDespesas = freteVal + comissaoVal;

    const liqTotal = valorBase + totalDespesas;
    const liqKg = totalKg > 0 ? liqTotal / totalKg : 0;
    const liqCab = qtd > 0 ? liqTotal / qtd : 0;

    return { valorBase, rKg, rCab, freteVal, comissaoVal, totalDespesas, liqTotal, liqKg, liqCab };
  }, [tipoPreco, precoKg, precoCab, valorTotal, frete, comissaoPct, totalKg, qtd]);

  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: Parcela[] = [];
    const vp = base / n;
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(data || format(new Date(), 'yyyy-MM-dd')), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && calc.valorBase > 0) {
      setParcelas(gerarParcelas(n, calc.valorBase));
    }
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    
    if (calc.valorBase <= 0) errors.push('Preencha o valor da compra antes de gerar.');
    if (formaPag === 'prazo' && parcelas.length > 0) {
      const somaParcelas = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const valorBaseRound = Math.round(calc.valorBase * 100) / 100;
      if (Math.abs(somaParcelas - valorBaseRound) > 0.01) {
        errors.push(`A soma das parcelas (${formatMoeda(somaParcelas)}) deve ser igual ao valor base da compra (${formatMoeda(valorBaseRound)}).`);
      }
      parcelas.forEach((p, i) => {
        if (!p.data) errors.push(`Parcela ${i + 1}: data obrigatória.`);
        if (!p.valor || p.valor <= 0) errors.push(`Parcela ${i + 1}: valor deve ser maior que zero.`);
      });
    }
    return errors;
   }, [fornecedorId, calc.valorBase, formaPag, parcelas]);

  const canGenerate = validationErrors.length === 0;

  useEffect(() => {
    onValidationChange?.(validationErrors);
  }, [validationErrors, onValidationChange]);

  const handleClickGerar = () => {
    if (mode === 'update' && existingCount > 0) {
      setConfirmUpdateOpen(true);
    } else {
      handleGerarFinanceiro();
    }
  };

  const handleGerarFinanceiro = useCallback(async (overrideLancamentoId?: string) => {
    const effectiveId = overrideLancamentoId || lancamentoId;
    if (!effectiveId) { toast.error('Salve o lançamento zootécnico antes de gerar os financeiros.'); return false; }
    if (!fazendaAtual || !clienteAtual) return false;
    if (validationErrors.length > 0) { toast.error(validationErrors[0]); return false; }

    setGerando(true);
    try {
      if (mode === 'update') {
        const { data: oldRecords } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', effectiveId)
          .eq('cancelado', false);

        const oldIds = (oldRecords || []).map(r => r.id);
        if (oldIds.length > 0) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase
            .from('financeiro_lancamentos_v2')
            .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por: userId || null })
            .in('id', oldIds);

          await supabase.from('audit_log_movimentacoes').insert({
            cliente_id: clienteAtual.id,
            usuario_id: userId || null,
            acao: 'recalculo_financeiro_compra',
            movimentacao_id: effectiveId,
            financeiro_ids: oldIds,
            detalhes: { registros_cancelados: oldIds.length, motivo: 'Recálculo financeiro da compra' },
          });
        }
      } else {
        const { data: existing } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .eq('movimentacao_rebanho_id', effectiveId)
          .eq('cancelado', false)
          .limit(1);

        if (existing && existing.length > 0) {
          toast.error('Lançamentos financeiros já foram gerados para esta movimentação.');
          setGerado(true);
          return false;
        }
      }

      const statusFin = statusOp === 'meta' ? 'meta' : 'programado';
      const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
      const compraLabel = `Compra ${quantidade} ${catLabel}`;
      const anoMes = data.slice(0, 7);
      const inserts: any[] = [];

      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      const subcentroCompra = isFemea ? 'COMPRAS ANIMAIS/FEMEAS' : 'COMPRAS ANIMAIS/MACHOS';

      const subcentrosNecessarios = [subcentroCompra];
      if (calc.freteVal > 0) subcentrosNecessarios.push('FRETE COMPRA ANIMAIS');
      if (calc.comissaoVal > 0) subcentrosNecessarios.push('COMISSÃO COMPRA ANIMAIS');

      const { data: planoContas } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativo', true)
        .eq('tipo_operacao', '2-Saídas')
        .in('subcentro', subcentrosNecessarios);

      const planoMap = new Map((planoContas || []).map(p => [p.subcentro, p]));

      for (const sub of subcentrosNecessarios) {
        if (!planoMap.has(sub)) {
          toast.error(`Não foi encontrado mapeamento financeiro válido para "${sub}" no plano de classificação.`);
          return false;
        }
      }

      const clasCompra = planoMap.get(subcentroCompra)!;

      const baseRecord: Record<string, any> = {
        cliente_id: clienteAtual.id,
        fazenda_id: fazendaAtual.id,
        tipo_operacao: '2-Saídas',
        sinal: -1,
        status_transacao: statusFin,
        origem_lancamento: 'movimentacao_rebanho',
        movimentacao_rebanho_id: effectiveId,
        macro_custo: clasCompra.macro_custo,
        centro_custo: clasCompra.centro_custo,
      };

      if (fornecedorId) baseRecord.favorecido_id = fornecedorId;

      if (formaPag === 'prazo' && parcelas.length > 0) {
        parcelas.forEach((p, i) => {
          inserts.push({
            ...baseRecord,
            ano_mes: p.data.slice(0, 7),
            subcentro: clasCompra.subcentro,
            valor: p.valor,
            data_competencia: data,
            data_pagamento: p.data,
            descricao: `${compraLabel} - Parcela ${i + 1}/${parcelas.length}`,
            historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
            origem_tipo: 'compra_rebanho:parcela',
            numero_documento: notaFiscal || undefined,
          });
        });
      } else {
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          subcentro: clasCompra.subcentro,
          valor: calc.valorBase,
          data_competencia: data,
          data_pagamento: data,
          descricao: compraLabel,
          historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
          origem_tipo: 'compra_rebanho:parcela',
          numero_documento: notaFiscal || undefined,
        });
      }

      if (calc.freteVal > 0) {
        const clasFrete = planoMap.get('FRETE COMPRA ANIMAIS')!;
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          macro_custo: clasFrete.macro_custo,
          centro_custo: clasFrete.centro_custo,
          subcentro: clasFrete.subcentro,
          valor: calc.freteVal,
          data_competencia: data,
          data_pagamento: data,
          descricao: `Prev. Frete - ${compraLabel}`,
          origem_tipo: 'compra_rebanho:frete',
        });
      }

      if (calc.comissaoVal > 0) {
        const clasComissao = planoMap.get('COMISSÃO COMPRA ANIMAIS')!;
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          macro_custo: clasComissao.macro_custo,
          centro_custo: clasComissao.centro_custo,
          subcentro: clasComissao.subcentro,
          valor: calc.comissaoVal,
          data_competencia: data,
          data_pagamento: data,
          descricao: `Prev. Comissão - ${compraLabel}`,
          origem_tipo: 'compra_rebanho:comissao',
        });
      }

      const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
      if (error) throw error;

      setGerado(true);
      const msg = mode === 'update'
        ? `Financeiro atualizado: ${inserts.length} novo(s) lançamento(s) gerado(s)`
        : `${inserts.length} lançamento(s) financeiro(s) gerado(s) com sucesso!`;
      toast.success(msg);
      if (mode === 'update' && onFinanceiroUpdated) onFinanceiroUpdated();
      return true;
    } catch (err: any) {
      toast.error('Erro ao gerar lançamentos: ' + (err.message || err));
      return false;
    } finally {
      setGerando(false);
    }
  }, [lancamentoId, fazendaAtual, clienteAtual, validationErrors, mode, statusOp, categoria, quantidade, data, fazendaOrigem, notaFiscal, fornecedorId, formaPag, parcelas, calc, onFinanceiroUpdated]);

  const resetForm = useCallback(() => {
    setTipoPreco('por_kg');
    setPrecoKg(''); setPrecoCab(''); setValorTotal('');
    setFrete(''); setComissaoPct('');
    setFormaPag('avista'); setQtdParcelas('1'); setParcelas([]);
    setGerado(false); setGerando(false);
    setExistingCount(0); setExistingLoaded(false);
    setTipoCompraOpen(false);
    setPrecoBaseOpen(false); setDespesasOpen(false); setPagamentoOpen(false);
  }, []);

  useImperativeHandle(ref, () => ({
    generateFinanceiro: (id: string) => handleGerarFinanceiro(id),
    getValidationErrors: () => validationErrors,
    getFornecedorId: () => fornecedorId,
    getValorBase: () => calc.valorBase,
    getTipoPreco: () => tipoPreco,
    resetForm,
  }), [handleGerarFinanceiro, validationErrors, fornecedorId, calc.valorBase, tipoPreco, resetForm]);

  const isPrevisto = statusOp === 'meta';
  const previstoInputClass = isPrevisto ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';

  return (
    <div className="bg-card rounded-md border shadow-sm p-2.5 space-y-1.5 self-start relative">

      <h3 className="text-[14px] font-semibold text-foreground">
        {mode === 'update' ? 'Atualizar Financeiro da Compra' : 'Detalhes Financeiros'}
      </h3>
      {mode === 'update' && existingCount > 0 && (
        <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{existingCount} lançamento(s) existente(s) serão cancelados e substituídos.</span>
        </div>
      )}
      {mode === 'update' && existingLoaded && existingCount > 0 && (
        <p className="text-[9px] text-muted-foreground/70 italic">Valores atuais carregados automaticamente</p>
      )}
      <Separator />

      {/* === BLOCO RECOLHÍVEL: Tipo de Compra === */}
      <CollapsibleBlock title="Tipo de Compra" open={tipoCompraOpen} onOpenChange={setTipoCompraOpen} summary={tipoPreco === 'por_kg' ? 'Por kg' : tipoPreco === 'por_cab' ? 'Por cab.' : 'Por total'}>
        <Select
          value={tipoPreco}
          onValueChange={(v: TipoPreco) => { setTipoPreco(v); setPrecoKg(''); setPrecoCab(''); setValorTotal(''); }}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="por_kg">Por kg</SelectItem>
            <SelectItem value="por_cab">Por cab.</SelectItem>
            <SelectItem value="por_total">Por total</SelectItem>
          </SelectContent>
        </Select>
      </CollapsibleBlock>

      <Separator />

      {/* === BLOCO RECOLHÍVEL: Preço Base === */}
      <CollapsibleBlock title="Preço Base" open={precoBaseOpen} onOpenChange={setPrecoBaseOpen} summary={calc.valorBase > 0 ? formatMoeda(calc.valorBase) : undefined}>
        {tipoPreco === 'por_kg' && (
          <div>
            <Label className="text-[10px]">R$/kg</Label>
            <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_cab' && (
          <div>
            <Label className="text-[10px]">R$/cab.</Label>
            <Input type="number" value={precoCab} onChange={e => setPrecoCab(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}
        {tipoPreco === 'por_total' && (
          <div>
            <Label className="text-[10px]">Valor total (R$)</Label>
            <Input type="number" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        )}

        {calc.valorBase > 0 && (
          <div className="bg-muted/30 rounded px-2 py-1.5 space-y-px text-[10px]">
            {tipoPreco !== 'por_kg' && (
              <div className="flex justify-between"><span className="text-muted-foreground">R$/kg</span><strong>{formatMoeda(calc.rKg)}</strong></div>
            )}
            {tipoPreco !== 'por_cab' && (
              <div className="flex justify-between"><span className="text-muted-foreground">R$/cab.</span><strong>{formatMoeda(calc.rCab)}</strong></div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Total base</span>
              <span>{formatMoeda(calc.valorBase)}</span>
            </div>
          </div>
        )}
      </CollapsibleBlock>

      <Separator />

      {/* === BLOCO RECOLHÍVEL: Despesas Extras === */}
      <CollapsibleBlock title="Despesas Extras" open={despesasOpen} onOpenChange={setDespesasOpen} summary={calc.totalDespesas > 0 ? formatMoeda(calc.totalDespesas) : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Frete (R$)</Label>
            <Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
          <div>
            <Label className="text-[10px]">Comissão (%)</Label>
            <Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-7 text-[11px] ${previstoInputClass}`} />
          </div>
        </div>
        {calc.comissaoVal > 0 && (
          <div className="flex justify-between text-[10px] px-1">
            <span className="text-muted-foreground">Comissão (R$)</span>
            <strong>{formatMoeda(calc.comissaoVal)}</strong>
          </div>
        )}
        {calc.totalDespesas > 0 && (
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-2 py-1.5 flex justify-between text-[10px] font-bold">
            <span className="text-orange-700 dark:text-orange-400">Total despesas</span>
            <span className="text-orange-800 dark:text-orange-300">{formatMoeda(calc.totalDespesas)}</span>
          </div>
        )}
      </CollapsibleBlock>

      <Separator />

      {/* === BLOCO RECOLHÍVEL: Informações de Pagamento === */}
      <CollapsibleBlock title="Informações de Pagamento" open={pagamentoOpen} onOpenChange={setPagamentoOpen} summary={formaPag === 'avista' ? 'À vista' : parcelas.length > 0 ? `${parcelas.length}x` : undefined}>
        <div>
          <Label className="text-[10px]">Nota Fiscal</Label>
          <Input value={notaFiscal} onChange={e => onNotaFiscalChange(e.target.value)} placeholder="Nº da nota" className="h-7 text-[11px]" />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => { setFormaPag('avista'); setParcelas([]); }}
            className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
            À vista
          </button>
          <button type="button" onClick={() => { setFormaPag('prazo'); if (calc.valorBase > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorBase)); }}
            className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
            A prazo
          </button>
        </div>

        {formaPag === 'prazo' && (
          <div className="space-y-1.5">
            <div>
              <Label className="text-[11px]">Quantidade de parcelas</Label>
              <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[11px]" />
            </div>
            <p className="text-[9px] text-muted-foreground">Parcelas calculadas sobre o valor base (sem frete/comissão)</p>
            {parcelas.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-1 bg-muted/30 rounded p-1.5">
                <div>
                  <Label className="text-[10px]">Parcela {i + 1}</Label>
                  <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); }} className="h-7 text-[10px]" />
                </div>
                <div>
                  <Label className="text-[10px]">R$</Label>
                  <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); }} className="h-7 text-[10px]" />
                </div>
              </div>
            ))}
            {parcelas.length > 0 && (
              <div className="text-[10px] text-muted-foreground text-right">
                Soma: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
              </div>
            )}
          </div>
        )}
      </CollapsibleBlock>

      <Separator />

      {/* === Valor Líquido === */}
      {calc.valorBase > 0 && (
        <div className={`rounded-md px-2 py-1.5 ${isPrevisto ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[11px] font-bold">
            <span>Valor total líquido</span>
            <span className={`text-sm ${isPrevisto ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}`}>{formatMoeda(calc.liqTotal)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">R$/kg líq.</span>
            <strong>{formatMoeda(calc.liqKg)}</strong>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">R$/cab. líq.</span>
            <strong>{formatMoeda(calc.liqCab)}</strong>
          </div>
        </div>
      )}

      <Separator />

      {/* === Sugestões financeiras + Gerar === */}
      {calc.valorBase > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Sugestões financeiras da movimentação</span>

          <div className="bg-muted/30 rounded-md p-2 space-y-1 text-[10px]">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Os lançamentos abaixo serão sugeridos:</span>
            </div>
            {formaPag === 'prazo' && parcelas.length > 0 ? (
              parcelas.map((p, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span>Parcela {i + 1}/{parcelas.length} — {format(parseISO(p.data), 'dd/MM/yyyy')}</span>
                  <span className="font-semibold">{formatMoeda(p.valor)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between text-[10px]">
                <span>Pagamento único</span>
                <span className="font-semibold">{formatMoeda(calc.valorBase)}</span>
              </div>
            )}
            {calc.freteVal > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Frete</span>
                <span className="font-semibold">{formatMoeda(calc.freteVal)}</span>
              </div>
            )}
            {calc.comissaoVal > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Comissão</span>
                <span className="font-semibold">{formatMoeda(calc.comissaoVal)}</span>
              </div>
            )}
          </div>

          {validationErrors.length > 0 && !gerado && (
            <div className="space-y-1 p-2 rounded-md border border-destructive/30 bg-destructive/5">
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {gerado ? (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md p-2 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-3.5 w-3.5" />
              {mode === 'update' ? 'Financeiro atualizado com sucesso' : 'Lançamentos financeiros já gerados'}
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant={mode === 'update' ? 'default' : 'outline'}
                size="sm"
                className={`w-full h-8 text-[11px] font-bold ${mode === 'update' ? 'shadow-sm' : ''}`}
                disabled={!canGenerate || gerando || (!lancamentoId && mode === 'create')}
                onClick={handleClickGerar}
              >
                {gerando
                  ? (mode === 'update' ? 'Atualizando...' : 'Gerando...')
                  : (mode === 'update' ? '✓ Atualizar lançamentos no financeiro' : 'Gerar lançamentos no financeiro')}
              </Button>
              {!lancamentoId && mode === 'create' && (
                <p className="text-[9px] text-muted-foreground text-center">O financeiro será gerado automaticamente ao registrar a entrada</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Unified register button */}
      {onRequestRegister && (
        <>
          <Separator />
          <Button
            type="button"
            className="w-full h-10 text-[13px] font-bold"
            onClick={onRequestRegister}
            disabled={externalSubmitting}
          >
            {externalSubmitting ? 'Registrando...' : (registerLabel || 'Registrar Compra')}
          </Button>
        </>
      )}

      {/* Confirmation dialog for update */}
      <AlertDialog open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar atualização financeira</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta compra possui <strong>{existingCount} lançamento(s) financeiro(s)</strong> vinculado(s).</p>
              <p>Ao confirmar:</p>
              <ul className="list-disc pl-4 space-y-1 text-[12px]">
                <li>Os lançamentos atuais serão <strong>cancelados</strong></li>
                <li>Novos lançamentos serão gerados com os valores atualizados</li>
              </ul>
              <p className="text-[11px] text-muted-foreground">Esta ação é registrada no log de auditoria.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmUpdateOpen(false); handleGerarFinanceiro(); }}>
              Confirmar e atualizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
