import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, ArrowUpRight, ArrowDownRight, ArrowUpDown, Wallet, BarChart3, Info, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { buscarPlanoContasBoitel, BOITEL_CLASSIFICACAO } from '@/lib/financeiro/boitelMapping';
import { toast } from 'sonner';

const isDev = import.meta.env.DEV;

interface BoitelOp {
  id: string;
  lote_codigo: string;
  contrato_baia: string | null;
  boitel_destino: string;
  quantidade_cab: number;
  data_envio: string | null;
  status_lote: string;
  // From planejamento join
  dias: number;
  receita_produtor: number;
  faturamento_bruto: number;
  faturamento_liquido: number;
  lucro_total: number;
  custo_total: number;
  custo_frete: number;
  custo_sanidade: number;
  custo_nutricao: number;
  outros_custos: number;
  custos_extras_parceria: number;
  despesas_abate: number;
  valor_total_antecipado: number;
  possui_adiantamento: boolean;
}

interface FinLancamento {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  descricao: string | null;
  valor: number;
  sinal: number;
  tipo_operacao: string;
  origem_tipo: string | null;
  status_transacao: string | null;
  cancelado: boolean;
  grupo_geracao_id: string | null;
  created_at?: string;
  historico?: string | null;
  macro_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
}

interface Props {
  onBack: () => void;
}

const ORIGEM_LABELS: Record<string, string> = {
  'boitel:receita': 'Recebimento',
  'boitel:adiantamento_pago': 'Adiantamento pago',
  'boitel:adiantamento_recebido': 'Adiantamento recebido',
  'boitel:adiantamento': 'Adiantamento pago',
  'boitel:custo': 'Custo',
  'boitel:custo_frete': 'Frete',
  'boitel:custo_sanidade': 'Sanidade',
  'boitel:custo_outros': 'Outros custos',
};

// === Row component for financial summary lines ===
function SummaryRow({ label, value, variant, indent, bold }: {
  label: string;
  value: string;
  variant?: 'default' | 'positive' | 'negative' | 'highlight' | 'muted';
  indent?: boolean;
  bold?: boolean;
}) {
  const colorClass = variant === 'positive' ? 'text-primary'
    : variant === 'negative' ? 'text-destructive'
    : variant === 'highlight' ? 'text-primary'
    : variant === 'muted' ? 'text-muted-foreground'
    : 'text-foreground';

  return (
    <div className={`flex justify-between items-baseline ${indent ? 'pl-3' : ''}`}>
      <span className={`text-[11px] ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-[11px] font-mono tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${colorClass}`}>{value}</span>
    </div>
  );
}

export function ContaBoitelTab({ onBack }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const { fazendaAtual } = useFazenda();
  const [boitels, setBoitels] = useState<BoitelOp[]>([]);
  const [selected, setSelected] = useState<BoitelOp | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailLanc, setDetailLanc] = useState<FinLancamento | null>(null);

  const [novoTipo, setNovoTipo] = useState<'adiantamento_pago' | 'adiantamento_recebido'>('adiantamento_recebido');
  const [novoData, setNovoData] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoDesc, setNovoDesc] = useState('');

  useEffect(() => {
    if (!clienteId) return;
    loadBoitels();
  }, [clienteId, fazendaAtual?.id]);

  async function loadBoitels() {
    setLoading(true);
    let query = supabase
      .from('boitel_lotes')
      .select(`id, lote_codigo, contrato_baia, boitel_destino, quantidade_cab, data_envio, status_lote,
        boitel_planejamento(dias, receita_produtor, faturamento_bruto, faturamento_liquido, lucro_total, custo_total, custo_frete, custo_sanidade, custo_nutricao, outros_custos, custos_extras_parceria, despesas_abate, valor_total_antecipado, possui_adiantamento)`)
      .eq('cliente_id', clienteId!)
      .neq('status_lote', 'cancelado');
    if (fazendaAtual?.id) query = query.eq('fazenda_id', fazendaAtual.id);
    const { data } = await query.order('data_envio', { ascending: false });
    // Flatten planejamento join
    const flat = (data || []).map((d: any) => {
      const p = Array.isArray(d.boitel_planejamento) ? d.boitel_planejamento[0] : d.boitel_planejamento;
      return { ...d, ...(p || {}), boitel_planejamento: undefined };
    });
    setBoitels(flat as any[]);
    setLoading(false);
  }

  async function loadLancamentos(boitelId: string) {
    const { data } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, data_competencia, data_pagamento, descricao, valor, sinal, tipo_operacao, origem_tipo, status_transacao, cancelado, grupo_geracao_id, created_at, historico, macro_custo, centro_custo, subcentro')
      .eq('boitel_lote_id', boitelId)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true });
    setLancamentos((data as any[]) || []);
  }

  function selectBoitel(b: BoitelOp) {
    setSelected(b);
    loadLancamentos(b.id);
  }

  // === RESULTADO ECONÔMICO ===
  const resultadoEconomico = useMemo(() => {
    if (!selected) return null;
    const fretTotal = selected.custo_frete || 0;
    return {
      faturamentoBruto: selected.faturamento_bruto,
      despesasAbate: selected.despesas_abate,
      faturamentoLiquido: selected.faturamento_liquido,
      resultadoBoitel: selected.receita_produtor,
      frete: fretTotal,
      totalOperacional: selected.receita_produtor - fretTotal,
    };
  }, [selected]);

  // === CONCILIAÇÃO FINANCEIRA ===
  const conciliacao = useMemo(() => {
    if (!selected) return null;

    const adiantPagos = lancamentos
      .filter(l => l.origem_tipo === 'boitel:adiantamento' || l.origem_tipo === 'boitel:adiantamento_pago')
      .reduce((s, l) => s + l.valor, 0);

    const adiantRecebidos = lancamentos
      .filter(l => l.origem_tipo === 'boitel:adiantamento_recebido')
      .reduce((s, l) => s + l.valor, 0);

    const saldoAReceberBoitel = selected.receita_produtor + adiantPagos;
    const saldoLiquidoEsperado = saldoAReceberBoitel - adiantRecebidos - (selected.custo_frete || 0);

    const totalRealizado = lancamentos
      .filter(l => l.status_transacao === 'realizado' || l.status_transacao === 'programado')
      .reduce((s, l) => s + (l.sinal * l.valor), 0);

    const totalEntradas = lancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
    const totalSaidas = lancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

    const gap = totalRealizado - saldoLiquidoEsperado;
    const gapOk = gap >= -0.01 && gap <= 0.01;

    return { adiantPagos, adiantRecebidos, saldoAReceberBoitel, saldoLiquidoEsperado, totalRealizado, totalEntradas, totalSaidas, gap, gapOk };
  }, [selected, lancamentos]);

  async function handleNovoLancamento() {
    if (!selected || !clienteId || !fazendaAtual?.id) return;
    const valor = parseFloat(novoValor);
    if (!novoData || isNaN(valor) || valor <= 0) {
      toast.error('Preencha data e valor válidos.');
      return;
    }

    const origemTipo = `boitel:${novoTipo}`;
    const config = BOITEL_CLASSIFICACAO[origemTipo];
    if (!config) { toast.error('Tipo de lançamento inválido.'); return; }

    const cls = await buscarPlanoContasBoitel(supabase, clienteId, origemTipo);
    if (!cls) {
      toast.error(`Mapeamento financeiro não encontrado. Cadastre um dos subcentros: ${config.subcentroCandidatos.join(', ')}`);
      return;
    }

    const isPago = novoTipo === 'adiantamento_pago';
    const desc = novoDesc || `${isPago ? 'Adiantamento pago' : 'Adiantamento recebido'} - Boitel ${selected.lote_codigo || selected.boitel_destino}`;

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
      cliente_id: clienteId,
      fazenda_id: fazendaAtual.id,
      tipo_operacao: config.tipo_operacao,
      sinal: config.sinal,
      status_transacao: 'programado',
      origem_lancamento: 'boitel',
      boitel_lote_id: selected.id,
      macro_custo: cls.macro_custo,
      centro_custo: cls.centro_custo,
      subcentro: cls.subcentro,
      ano_mes: novoData.slice(0, 7),
      valor,
      data_competencia: novoData,
      data_pagamento: novoData,
      descricao: desc,
      origem_tipo: origemTipo,
      sem_movimentacao_caixa: false,
    });

    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }

    toast.success('Lançamento registrado!');
    setDialogOpen(false);
    setNovoValor('');
    setNovoDesc('');
    setNovoData('');
    loadLancamentos(selected.id);
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
  const fmtDateTime = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return d; }
  };

  if (loading) {
    return (
      <div className="w-full px-4 pb-20 animate-fade-in">
        <div className="p-4"><p className="text-muted-foreground text-sm">Carregando operações boitel...</p></div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-full px-4 pb-20 animate-fade-in">
        <div className="p-4 space-y-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 h-7 text-[11px]">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>

          {!selected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" /> Conta Boitel
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Controle financeiro e conciliação por lote</p>
                </div>
                {isDev && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="h-7 text-[11px] gap-1">
                        <Trash2 className="h-3 w-3" /> Reset Boitel (teste)
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset completo do Boitel</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação irá apagar <strong>todos os dados de teste do Boitel</strong> para este cliente:
                          lotes, planejamentos, históricos, adiantamentos e lançamentos financeiros vinculados ao Boitel.
                          <br /><br />
                          <strong>Essa ação é irreversível.</strong> Confirma?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            if (!clienteId) return;
                            try {
                              const { data, error } = await supabase.functions.invoke('reset-boitel-teste', {
                                body: { cliente_id: clienteId },
                              });
                              if (error) throw error;
                              if (data?.error) throw new Error(data.error);
                              const r = data.resumo;
                              toast.success(
                                `Reset concluído: ${r.lotes_removidos} lotes, ${r.financeiros_removidos} financeiros, ${r.planejamentos_removidos} planejamentos, ${r.historicos_removidos} históricos, ${r.adiantamentos_removidos} adiantamentos removidos.`
                              );
                              loadBoitels();
                            } catch (err: any) {
                              toast.error('Erro no reset: ' + (err.message || 'Erro desconhecido'));
                            }
                          }}
                        >
                          Sim, apagar tudo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {boitels.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">
                  Nenhuma operação boitel encontrada.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {boitels.map(b => (
                    <Card key={b.id} className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                      onClick={() => selectBoitel(b)}>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[13px] font-bold text-foreground">
                              {b.lote_codigo || b.boitel_destino}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {b.quantidade_cab} cab · {b.dias} dias · Envio: {fmtDate(b.data_envio)}
                            </p>
                            {b.contrato_baia && (
                              <p className="text-[10px] text-muted-foreground">Contrato: {b.contrato_baia}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-bold text-primary font-mono tabular-nums">{fmt(b.receita_produtor)}</p>
                            <p className="text-[10px] text-muted-foreground">Resultado</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* HEADER */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {selected.lote_codigo || selected.boitel_destino}
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    {selected.quantidade_cab} cab · {selected.dias} dias · Contrato: {selected.contrato_baia || '-'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setSelected(null); setLancamentos([]); }}>
                  ← Lista
                </Button>
              </div>

              {/* GAP HIGHLIGHT — sempre visível no topo quando há lançamentos */}
              {conciliacao && lancamentos.length > 0 && (
                <div className={`rounded-lg border-2 p-3 flex items-center justify-between ${
                  conciliacao.gapOk
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-destructive/40 bg-destructive/5'
                }`}>
                  <div className="flex items-center gap-2">
                    {conciliacao.gapOk ? (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    )}
                    <div>
                      <p className="text-[11px] font-semibold text-foreground">
                        {conciliacao.gapOk ? 'Conciliação OK' : 'Divergência encontrada'}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        Diferença entre saldo esperado e realizado
                      </p>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`text-lg font-bold font-mono tabular-nums cursor-help ${
                        conciliacao.gapOk ? 'text-primary' : 'text-destructive'
                      }`}>
                        {fmt(conciliacao.gap)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[280px] text-[10px] space-y-0.5">
                      <p className="font-bold mb-1">Como é calculado:</p>
                      <p>Total Financeiro Realizado: {fmt(conciliacao.totalRealizado)}</p>
                      <p>(-) Saldo Líquido Esperado: {fmt(conciliacao.saldoLiquidoEsperado)}</p>
                      <p className="font-bold border-t border-border pt-1 mt-1">= Diferença: {fmt(conciliacao.gap)}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {/* A. RESULTADO ECONÔMICO */}
              {resultadoEconomico && (
                <Card>
                  <CardHeader className="pb-1.5 pt-3 px-3">
                    <CardTitle className="text-[12px] flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                      <BarChart3 className="h-3.5 w-3.5" /> Resultado Econômico
                      <Badge variant="secondary" className="text-[8px] h-4 px-1.5 font-normal ml-auto">Simulador</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 px-3 pb-3">
                    <SummaryRow label="Faturamento Bruto Abate" value={fmt(resultadoEconomico.faturamentoBruto)} />
                    <SummaryRow label="(-) Despesas Abate" value={fmt(resultadoEconomico.despesasAbate)} variant="negative" />
                    <SummaryRow label="= Faturamento Líquido" value={fmt(resultadoEconomico.faturamentoLiquido)} bold />
                    <div className="border-t border-border my-1" />
                    <SummaryRow label="Resultado com Boitel" value={fmt(resultadoEconomico.resultadoBoitel)} variant="highlight" bold />
                    <SummaryRow label="(-) Frete" value={fmt(resultadoEconomico.frete)} variant="negative" />
                    <SummaryRow label="= Total Operacional" value={fmt(resultadoEconomico.totalOperacional)} bold />
                  </CardContent>
                </Card>
              )}

              {/* B. CONCILIAÇÃO FINANCEIRA */}
              {conciliacao && (
                <Card>
                  <CardHeader className="pb-1.5 pt-3 px-3">
                    <CardTitle className="text-[12px] flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                      <Wallet className="h-3.5 w-3.5" /> Conciliação Financeira
                      <Badge variant="outline" className="text-[8px] h-4 px-1.5 font-normal ml-auto">Simulador + Caixa</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 px-3 pb-3">
                    <SummaryRow label="Resultado com Boitel" value={fmt(selected.receita_produtor)} variant="highlight" />
                    <SummaryRow label="(+) Adiantamento pago ao boitel" value={fmt(conciliacao.adiantPagos)} variant="positive" indent />
                    <SummaryRow label="= Saldo a receber do boitel" value={fmt(conciliacao.saldoAReceberBoitel)} bold />
                    <SummaryRow label="(-) Adiantamentos recebidos" value={fmt(conciliacao.adiantRecebidos)} variant="muted" indent />
                    <SummaryRow label="(-) Frete pago fora" value={fmt(selected.custo_frete || 0)} variant="negative" indent />
                    <div className="border-t border-border my-1" />
                    <SummaryRow label="Saldo líquido final de caixa" value={fmt(conciliacao.saldoLiquidoEsperado)} bold />
                    <SummaryRow label="Total financeiro realizado" value={fmt(conciliacao.totalRealizado)} />
                    <div className="border-t border-dashed border-border my-1" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] font-bold text-foreground">Diferença de conciliação</span>
                      <span className={`text-sm font-bold font-mono tabular-nums ${conciliacao.gapOk ? 'text-primary' : 'text-destructive'}`}>
                        {fmt(conciliacao.gap)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ACTION BAR */}
              <Button size="sm" className="w-full gap-1 h-8 text-[11px]" onClick={() => {
                setNovoTipo('adiantamento_recebido');
                setNovoData('');
                setNovoValor('');
                setNovoDesc('');
                setDialogOpen(true);
              }}>
                <Plus className="h-3.5 w-3.5" /> Novo Lançamento
              </Button>

              {/* C. EXTRATO FINANCEIRO */}
              <Card>
                <CardHeader className="pb-1.5 pt-3 px-3">
                  <CardTitle className="text-[12px] flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                    <ArrowUpDown className="h-3.5 w-3.5" /> Extrato Financeiro
                    <span className="ml-auto text-[9px] font-normal text-muted-foreground/70">
                      {lancamentos.length} lançamento{lancamentos.length !== 1 ? 's' : ''}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {lancamentos.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-6">Nenhum lançamento vinculado a este lote.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-border">
                        {lancamentos.map(l => {
                          const isEntrada = l.sinal > 0;
                          const isSimulador = !!l.grupo_geracao_id;
                          return (
                            <Tooltip key={l.id}>
                              <TooltipTrigger asChild>
                                <div
                                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors"
                                  onClick={() => setDetailLanc(l)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      {isEntrada ? (
                                        <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0" />
                                      ) : (
                                        <ArrowDownRight className="h-3.5 w-3.5 text-destructive shrink-0" />
                                      )}
                                      <span className="text-[11px] font-medium text-foreground truncate">
                                        {l.descricao || ORIGEM_LABELS[l.origem_tipo || ''] || 'Lançamento'}
                                      </span>
                                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold shrink-0 uppercase tracking-wider ${
                                        isSimulador
                                          ? 'bg-primary/10 text-primary'
                                          : 'bg-muted text-muted-foreground'
                                      }`}>
                                        {isSimulador ? 'Simulador' : 'Manual'}
                                      </span>
                                    </div>
                                    <p className="text-[9px] text-muted-foreground ml-5 mt-0.5">
                                      {fmtDate(l.data_pagamento)} · {ORIGEM_LABELS[l.origem_tipo || ''] || l.origem_tipo || '-'}
                                    </p>
                                  </div>
                                  <span className={`text-[11px] font-bold font-mono tabular-nums whitespace-nowrap ml-2 ${
                                    isEntrada ? 'text-primary' : 'text-destructive'
                                  }`}>
                                    {isEntrada ? '+' : '−'} {fmt(l.valor)}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[240px] text-[9px] space-y-0.5">
                                <p className="font-semibold">{isSimulador ? 'Gerado pelo simulador' : 'Lançado manualmente'}</p>
                                <p>Criado em: {fmtDateTime(l.created_at || null)}</p>
                                {l.historico && <p className="text-muted-foreground">{l.historico}</p>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>

                      {/* TOTALS */}
                      <div className="border-t-2 border-border px-3 py-2 space-y-0.5 bg-muted/30">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Total Entradas</span>
                          <span className="font-bold font-mono tabular-nums text-primary">+ {fmt(conciliacao?.totalEntradas || 0)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Total Saídas</span>
                          <span className="font-bold font-mono tabular-nums text-destructive">− {fmt(conciliacao?.totalSaidas || 0)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* LEGENDA */}
              <div className="flex items-center gap-4 text-[9px] text-muted-foreground/70 px-1">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-primary/20" />
                  <span><strong className="text-primary">Simulador</strong> = gerado automaticamente</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-muted" />
                  <span><strong className="text-muted-foreground">Manual</strong> = lançado pelo usuário</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* DIALOG: Novo Lançamento */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Novo Lançamento Boitel</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px]">Tipo</Label>
                <Select value={novoTipo} onValueChange={(v: any) => setNovoTipo(v)}>
                  <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adiantamento_pago">Adiantamento Pago (Saída)</SelectItem>
                    <SelectItem value="adiantamento_recebido">Adiantamento Recebido (Entrada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Data</Label>
                <Input type="date" className="h-8 text-[11px]" value={novoData} onChange={e => setNovoData(e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px]">Valor (R$)</Label>
                <Input type="number" step="0.01" className="h-8 text-[11px] text-right font-mono" value={novoValor} onChange={e => setNovoValor(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-[11px]">Descrição (opcional)</Label>
                <Textarea className="text-[11px]" value={novoDesc} onChange={e => setNovoDesc(e.target.value)} rows={2} placeholder="Ex: Antecipação 30 dias" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" className="h-8 text-[11px]" onClick={handleNovoLancamento}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* SHEET: Detalhe do Lançamento */}
        <Sheet open={!!detailLanc} onOpenChange={open => { if (!open) setDetailLanc(null); }}>
          <SheetContent side="bottom" className="max-h-[60vh]">
            {detailLanc && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-sm flex items-center gap-2">
                    {detailLanc.sinal > 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-destructive" />
                    )}
                    {detailLanc.descricao || 'Lançamento'}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2 text-[11px]">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Valor</p>
                      <p className={`font-bold font-mono tabular-nums ${detailLanc.sinal > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {detailLanc.sinal > 0 ? '+' : '−'} {fmt(detailLanc.valor)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Origem</p>
                      <Badge variant={detailLanc.grupo_geracao_id ? 'default' : 'secondary'} className="text-[9px] h-4 mt-0.5">
                        {detailLanc.grupo_geracao_id ? 'Simulador' : 'Manual'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Data Pagamento</p>
                      <p className="font-medium">{fmtDate(detailLanc.data_pagamento)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Data Competência</p>
                      <p className="font-medium">{fmtDate(detailLanc.data_competencia)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Tipo</p>
                      <p className="font-medium">{ORIGEM_LABELS[detailLanc.origem_tipo || ''] || detailLanc.origem_tipo || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Status</p>
                      <p className="font-medium">{detailLanc.status_transacao || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Classificação</p>
                      <p className="font-medium text-[10px]">{[detailLanc.macro_custo, detailLanc.centro_custo, detailLanc.subcentro].filter(Boolean).join(' / ') || '-'}</p>
                    </div>
                    {detailLanc.historico && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Histórico</p>
                        <p className="text-[10px] text-muted-foreground">{detailLanc.historico}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">Criado em</p>
                      <p className="text-[10px]">{fmtDateTime(detailLanc.created_at || null)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
