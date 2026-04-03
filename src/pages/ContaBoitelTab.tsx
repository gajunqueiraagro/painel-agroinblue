import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, TrendingUp, TrendingDown, ArrowUpDown, Wallet, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { buscarPlanoContasBoitel, BOITEL_CLASSIFICACAO } from '@/lib/financeiro/boitelMapping';
import { toast } from 'sonner';

interface BoitelOp {
  id: string;
  lote: string | null;
  numero_contrato: string | null;
  fazenda_destino_nome: string;
  quantidade: number;
  data_envio: string | null;
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

export function ContaBoitelTab({ onBack }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const { fazendaAtual } = useFazenda();
  const [boitels, setBoitels] = useState<BoitelOp[]>([]);
  const [selected, setSelected] = useState<BoitelOp | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    const q = supabase
      .from('boitel_operacoes')
      .select('id, lote, numero_contrato, fazenda_destino_nome, quantidade, data_envio, dias, receita_produtor, faturamento_bruto, faturamento_liquido, lucro_total, custo_total, custo_frete, custo_sanidade, custo_nutricao, outros_custos, custos_extras_parceria, despesas_abate, valor_total_antecipado, possui_adiantamento')
      .eq('cliente_id', clienteId!);
    if (fazendaAtual?.id) q.eq('fazenda_origem_id', fazendaAtual.id);
    const { data } = await q.order('data_envio', { ascending: false });
    setBoitels((data as any[]) || []);
    setLoading(false);
  }

  async function loadLancamentos(boitelId: string) {
    const { data } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, data_competencia, data_pagamento, descricao, valor, sinal, tipo_operacao, origem_tipo, status_transacao, cancelado, grupo_geracao_id')
      .eq('boitel_id', boitelId)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true });
    setLancamentos((data as any[]) || []);
  }

  function selectBoitel(b: BoitelOp) {
    setSelected(b);
    loadLancamentos(b.id);
  }

  // === RESULTADO ECONÔMICO (do simulador, imutável) ===
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

  // === CONCILIAÇÃO FINANCEIRA (extrato vs econômico) ===
  const conciliacao = useMemo(() => {
    if (!selected) return null;

    const adiantPagos = lancamentos
      .filter(l => l.origem_tipo === 'boitel:adiantamento' || l.origem_tipo === 'boitel:adiantamento_pago')
      .reduce((s, l) => s + l.valor, 0);

    const adiantRecebidos = lancamentos
      .filter(l => l.origem_tipo === 'boitel:adiantamento_recebido')
      .reduce((s, l) => s + l.valor, 0);

    const custoFrete = lancamentos
      .filter(l => l.origem_tipo === 'boitel:custo_frete' || (l.origem_tipo === 'boitel:custo' && l.descricao?.toLowerCase().includes('frete')))
      .reduce((s, l) => s + l.valor, 0);

    // Adiantamento pago ao boitel é devolvido na liquidação → soma ao saldo a receber
    const saldoAReceberBoitel = selected.receita_produtor + adiantPagos;
    const saldoLiquidoEsperado = saldoAReceberBoitel - adiantRecebidos - (selected.custo_frete || 0);

    const totalRealizado = lancamentos
      .filter(l => l.status_transacao === 'conciliado' || l.status_transacao === 'confirmado')
      .reduce((s, l) => s + (l.sinal * l.valor), 0);

    const totalEntradas = lancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
    const totalSaidas = lancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);

    const gap = totalRealizado - saldoLiquidoEsperado;

    return { adiantPagos, adiantRecebidos, custoFrete, saldoAReceberBoitel, saldoLiquidoEsperado, totalRealizado, totalEntradas, totalSaidas, gap };
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
    if (!config) {
      toast.error('Tipo de lançamento inválido.');
      return;
    }

    const cls = await buscarPlanoContasBoitel(supabase, clienteId, origemTipo);
    if (!cls) {
      toast.error(`Mapeamento financeiro não encontrado. Cadastre um dos subcentros: ${config.subcentroCandidatos.join(', ')}`);
      return;
    }

    const isPago = novoTipo === 'adiantamento_pago';
    const desc = novoDesc || `${isPago ? 'Adiantamento pago' : 'Adiantamento recebido'} - Boitel ${selected.lote || selected.fazenda_destino_nome}`;

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
      cliente_id: clienteId,
      fazenda_id: fazendaAtual.id,
      tipo_operacao: config.tipo_operacao,
      sinal: config.sinal,
      status_transacao: 'confirmado',
      origem_lancamento: 'boitel',
      boitel_id: selected.id,
      macro_custo: cls.macro_custo,
      centro_custo: cls.centro_custo,
      subcentro: cls.subcentro,
      ano_mes: novoData.slice(0, 7),
      valor,
      data_competencia: novoData,
      data_pagamento: novoData,
      descricao: desc,
      origem_tipo: origemTipo,
    });

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }

    toast.success('Lançamento registrado!');
    setDialogOpen(false);
    setNovoValor('');
    setNovoDesc('');
    setNovoData('');
    loadLancamentos(selected.id);
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

  if (loading) {
    return (
      <div className="w-full px-4 pb-20 animate-fade-in">
        <div className="p-4"><p className="text-muted-foreground text-sm">Carregando operações boitel...</p></div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 pb-20 animate-fade-in">
      <div className="p-4 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {!selected ? (
          <>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Conta Boitel
            </h2>
            <p className="text-xs text-muted-foreground">Controle financeiro por lote de boitel</p>

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
                          <p className="text-sm font-bold text-foreground">
                            {b.lote || b.fazenda_destino_nome}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {b.quantidade} cab · {b.dias} dias · Envio: {fmtDate(b.data_envio)}
                          </p>
                          {b.numero_contrato && (
                            <p className="text-[10px] text-muted-foreground">Contrato: {b.numero_contrato}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{fmt(b.receita_produtor)}</p>
                          <p className="text-[10px] text-muted-foreground">Resultado Boitel</p>
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {selected.lote || selected.fazenda_destino_nome}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selected.quantidade} cab · {selected.dias} dias · Contrato: {selected.numero_contrato || '-'}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setLancamentos([]); }}>
                ← Lista
              </Button>
            </div>

            {/* 1. RESULTADO ECONÔMICO (do simulador) */}
            {resultadoEconomico && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <BarChart3 className="h-4 w-4" /> Resultado Econômico
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturamento Bruto Abate</span>
                    <span className="font-semibold">{fmt(resultadoEconomico.faturamentoBruto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Despesas Abate</span>
                    <span className="text-destructive">{fmt(resultadoEconomico.despesasAbate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">= Faturamento Líquido</span>
                    <span className="font-semibold">{fmt(resultadoEconomico.faturamentoLiquido)}</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Resultado com Boitel</span>
                    <span className="font-bold text-primary">{fmt(resultadoEconomico.resultadoBoitel)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Frete</span>
                    <span className="text-destructive">{fmt(resultadoEconomico.frete)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">= Total Operacional</span>
                    <span className="font-bold">{fmt(resultadoEconomico.totalOperacional)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. CONCILIAÇÃO FINANCEIRA */}
            {conciliacao && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <Wallet className="h-4 w-4" /> Conciliação Financeira
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resultado com Boitel</span>
                    <span className="font-bold text-primary">{fmt(selected.receita_produtor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(+) Adiantamento pago ao boitel</span>
                    <span className="text-primary">{fmt(conciliacao.adiantPagos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">= Saldo a receber do boitel</span>
                    <span className="font-bold">{fmt(conciliacao.saldoAReceberBoitel)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Adiantamentos recebidos</span>
                    <span className="text-muted-foreground">{fmt(conciliacao.adiantRecebidos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Frete pago fora</span>
                    <span className="text-destructive">{fmt(selected.custo_frete || 0)}</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Saldo líquido final de caixa</span>
                    <span className="font-bold">{fmt(conciliacao.saldoLiquidoEsperado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total financeiro realizado</span>
                    <span className="font-semibold">{fmt(conciliacao.totalRealizado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Diferença de conciliação</span>
                    <span className={`font-bold ${conciliacao.gap >= -0.01 && conciliacao.gap <= 0.01 ? 'text-primary' : 'text-destructive'}`}>
                      {fmt(conciliacao.gap)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ACTIONS */}
            <Button size="sm" className="w-full gap-1" onClick={() => {
              setNovoTipo('adiantamento_recebido');
              setNovoData('');
              setNovoValor('');
              setNovoDesc('');
              setDialogOpen(true);
            }}>
              <Plus className="h-4 w-4" /> Novo Lançamento Boitel
            </Button>

            {/* 3. EXTRATO FINANCEIRO */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1">
                  <ArrowUpDown className="h-4 w-4" /> Extrato Financeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {lancamentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum lançamento vinculado.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {lancamentos.map(l => (
                      <div key={l.id} className="px-3 py-2 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {l.sinal > 0 ? (
                              <TrendingUp className="h-3 w-3 text-primary shrink-0" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            <span className="text-xs font-medium text-foreground truncate">
                              {l.descricao || ORIGEM_LABELS[l.origem_tipo || ''] || 'Lançamento'}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                              l.grupo_geracao_id
                                ? 'bg-secondary text-secondary-foreground'
                                : 'bg-accent text-accent-foreground'
                            }`}>
                              {l.grupo_geracao_id ? 'Simulador' : 'Manual'}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground ml-[18px]">
                            {fmtDate(l.data_pagamento)} · {ORIGEM_LABELS[l.origem_tipo || ''] || l.origem_tipo || '-'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold whitespace-nowrap ${l.sinal > 0 ? 'text-primary' : 'text-destructive'}`}>
                          {l.sinal > 0 ? '+' : '-'} {fmt(l.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* DIALOG: Novo Lançamento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lançamento Boitel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={novoTipo} onValueChange={(v: any) => setNovoTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adiantamento_pago">Adiantamento Pago (Saída)</SelectItem>
                  <SelectItem value="adiantamento_recebido">Adiantamento Recebido (Entrada)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={novoData} onChange={e => setNovoData(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" value={novoValor} onChange={e => setNovoValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea value={novoDesc} onChange={e => setNovoDesc(e.target.value)} rows={2} placeholder="Ex: Antecipação 30 dias" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleNovoLancamento}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
