import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronDown, CheckCircle, AlertTriangle, Info, Plus, Calculator } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';
import { formatMoeda } from '@/lib/calculos/formatters';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { BoitelPlanningDialog, type BoitelData } from '@/components/BoitelPlanningDialog';
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
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  statusOp: StatusOperacional;
  lancamentoId?: string;
  mode?: 'create' | 'update';
  onFinanceiroUpdated?: () => void;
  onRequestRegister?: () => void;
  registerLabel?: string;
  submitting?: boolean;
  // Tipo de venda field (managed by parent for persistence)
  tipoPeso: string;
  onTipoPesoChange: (v: string) => void;
  // Values from parent calc
  valorBruto: number;
  totalBonus: number;
  totalDescontos: number;
  valorLiquido: number;
  // Discount fields (managed by parent for calc)
  funruralPct: string;
  onFunruralPctChange: (v: string) => void;
  descontoQualidade: string;
  onDescontoQualidadeChange: (v: string) => void;
  outrosDescontos: string;
  onOutrosDescontosChange: (v: string) => void;
  descFunruralTotal: number;
  descQualidadeTotal: number;
}

export interface VendaFinanceiroPanelRef {
  generateFinanceiro: (lancamentoId: string) => Promise<boolean>;
  getValidationErrors: () => string[];
  getFornecedorId: () => string;
  resetForm: () => void;
}

export const VendaFinanceiroPanel = forwardRef<VendaFinanceiroPanelRef, Props>(function VendaFinanceiroPanel({
  quantidade, pesoKg, categoria, data, destino, notaFiscal, onNotaFiscalChange,
  statusOp, lancamentoId, mode = 'create', onFinanceiroUpdated,
  onRequestRegister, registerLabel, submitting: externalSubmitting,
  tipoPeso, onTipoPesoChange,
  valorBruto, totalBonus, totalDescontos, valorLiquido,
  funruralPct, onFunruralPctChange,
  descontoQualidade, onDescontoQualidadeChange,
  outrosDescontos, onOutrosDescontosChange,
  descFunruralTotal, descQualidadeTotal,
}: Props, ref) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const isPrevisto = statusOp === 'previsto';
  const isConfirmado = statusOp === 'confirmado';
  const isConciliado = statusOp === 'conciliado';

  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>('avista');
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [existingLoaded, setExistingLoaded] = useState(false);

  // Fornecedor state
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  const [boitelOpen, setBoitelOpen] = useState(false);
  const [boitelData, setBoitelData] = useState<BoitelData | null>(null);

  useEffect(() => {
    if (!clienteAtual) return;
    supabase
      .from('financeiro_fornecedores')
      .select('id, nome')
      .eq('cliente_id', clienteAtual.id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { if (data) setFornecedores(data); });
  }, [clienteAtual]);

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
    if (n > 0 && valorLiquido > 0) {
      setParcelas(gerarParcelas(n, data, valorLiquido));
    }
  };

  const handleNovoFornecedor = async (nome: string, cpfCnpj?: string) => {
    if (!clienteAtual || !fazendaAtual) return;
    const { data: rec, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteAtual.id, fazenda_id: fazendaAtual.id, nome, cpf_cnpj: cpfCnpj || null })
      .select('id, nome')
      .single();
    if (error) { toast.error('Erro ao salvar fornecedor'); return; }
    if (rec) {
      setFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFornecedorId(rec.id);
      toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
    }
    setNovoFornecedorOpen(false);
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (valorLiquido <= 0 && valorBruto <= 0) errors.push('Valor da venda deve ser maior que zero.');
    if (formaReceb === 'prazo' && parcelas.length > 0) {
      const soma = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const ref = Math.round(valorLiquido * 100) / 100;
      if (Math.abs(soma - ref) > 0.01) {
        errors.push(`A soma das parcelas (${formatMoeda(soma)}) deve ser igual ao valor líquido (${formatMoeda(ref)}).`);
      }
      parcelas.forEach((p, i) => {
        if (!p.data) errors.push(`Parcela ${i + 1}: data obrigatória.`);
        if (!p.valor || p.valor <= 0) errors.push(`Parcela ${i + 1}: valor deve ser maior que zero.`);
      });
    }
    return errors;
  }, [valorLiquido, valorBruto, formaReceb, parcelas]);

  const resetForm = useCallback(() => {
    setFornecedorId('');
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
    resetForm,
  }));

  const handleGerarFinanceiroInternal = async (targetLancamentoId: string): Promise<boolean> => {
    if (!targetLancamentoId) { toast.error('Salve o lançamento zootécnico primeiro.'); return false; }
    if (!fazendaAtual || !clienteAtual) return false;
    if (validationErrors.length > 0) { toast.error(validationErrors[0]); return false; }

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

      // Determine subcentro for receita based on gender
      const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
      const isFemea = FEMEAS.includes(categoria);
      // Try specific vendas subcentros first, then fallback to general
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

      // Use first match (priority order is maintained by candidates array)
      const clasReceita = planoReceita.find(p => subcentroCandidates.indexOf(p.subcentro!) >= 0) || planoReceita[0];
      const statusFin = isPrevisto ? 'previsto' : 'confirmado';

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
        const valorReceita = totalDescontos > 0 ? valorLiquido + totalDescontos : valorLiquido;
        inserts.push({
          ...baseRecord,
          ano_mes: anoMes,
          valor: valorReceita,
          data_competencia: data,
          data_pagamento: data,
          descricao: vendaLabel,
          historico: destino ? `Comprador: ${destino}` : undefined,
          origem_tipo: 'venda:parcela',
        });
      }

      // Generate deduction for discounts
      if (totalDescontos > 0) {
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
          valor: totalDescontos,
          data_competencia: data,
          data_pagamento: data,
          descricao: `Dedução ${vendaLabel}${destino ? ` | ${destino}` : ''}`,
          historico: destino ? `Comprador: ${destino}` : undefined,
          origem_tipo: 'venda:deducao',
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

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wide">Detalhes Financeiros — Venda</h3>
      <Separator />

      {/* Tipo de Venda */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground min-w-[90px]">Tipo de Venda</span>
        <Select value={tipoPeso} onValueChange={(v: any) => onTipoPesoChange(v)}>
          <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="desmama" className="text-[11px]">Desmama</SelectItem>
            <SelectItem value="gado_adulto" className="text-[11px]">Gado Adulto</SelectItem>
            <SelectItem value="boitel" className="text-[11px]">Boitel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Fornecedor / Comprador */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Comprador</h4>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-1">
          <SearchableSelect
            options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
            value={fornecedorId}
            onValueChange={setFornecedorId}
            placeholder="Selecione o comprador"
            className="h-7 text-[11px]"
          />
          <button type="button" onClick={() => setNovoFornecedorOpen(true)}
            className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:underline">
            <Plus className="h-3 w-3" /> Novo comprador
          </button>
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* Descontos */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Descontos</h4>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 pt-1">
          <div>
            <Label className="text-[11px]">Funrural (%)</Label>
            <Input type="number" value={funruralPct} onChange={e => onFunruralPctChange(e.target.value)} placeholder="0,00" step="0.01" className="h-7 text-[11px]" />
            {descFunruralTotal > 0 && (
              <span className="text-[10px] text-destructive">Funrural: -{formatMoeda(descFunruralTotal)}</span>
            )}
          </div>
          <div>
            <Label className="text-[11px]">Desconto Qualidade (R$)</Label>
            <Input type="number" value={descontoQualidade} onChange={e => onDescontoQualidadeChange(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />
            {descQualidadeTotal > 0 && (
              <span className="text-[10px] text-destructive">Qualidade: -{formatMoeda(descQualidadeTotal)}</span>
            )}
          </div>
          <div>
            <Label className="text-[11px]">Outros Descontos (R$)</Label>
            <Input type="number" value={outrosDescontos} onChange={e => onOutrosDescontosChange(e.target.value)} placeholder="0,00" className="h-7 text-[11px]" />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator />
      {valorBruto > 0 && (
        <div className="bg-muted/30 rounded-md p-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span><span className="font-semibold">{formatMoeda(valorBruto)}</span></div>
          {totalBonus > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bônus</span><span className="font-semibold text-success">+{formatMoeda(totalBonus)}</span></div>}
          {totalDescontos > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Descontos</span><span className="font-semibold text-destructive">-{formatMoeda(totalDescontos)}</span></div>}
          <Separator className="my-1" />
          <div className="flex justify-between font-bold text-[11px]"><span>Valor líquido</span><span className="text-primary">{formatMoeda(valorLiquido)}</span></div>
        </div>
      )}

      <Separator />

      {/* Informações de Pagamento */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Informações de Recebimento</h4>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">

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

      <NovoFornecedorDialog
        open={novoFornecedorOpen}
        onClose={() => setNovoFornecedorOpen(false)}
        onSave={handleNovoFornecedor}
      />
    </div>
  );
});
