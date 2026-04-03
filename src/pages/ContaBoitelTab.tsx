import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, TrendingUp, TrendingDown, ArrowUpDown, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
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
  lucro_total: number;
  custo_total: number;
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
}

interface Props {
  onBack: () => void;
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

  // New lancamento dialog state
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
      .select('id, lote, numero_contrato, fazenda_destino_nome, quantidade, data_envio, dias, receita_produtor, lucro_total, custo_total, valor_total_antecipado, possui_adiantamento')
      .eq('cliente_id', clienteId!);
    if (fazendaAtual?.id) q.eq('fazenda_origem_id', fazendaAtual.id);
    const { data } = await q.order('data_envio', { ascending: false });
    setBoitels((data as any[]) || []);
    setLoading(false);
  }

  async function loadLancamentos(boitelId: string) {
    const { data } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, data_competencia, data_pagamento, descricao, valor, sinal, tipo_operacao, origem_tipo, status_transacao, cancelado')
      .eq('boitel_id', boitelId)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true });
    setLancamentos((data as any[]) || []);
  }

  function selectBoitel(b: BoitelOp) {
    setSelected(b);
    loadLancamentos(b.id);
  }

  // Computed summary
  const resumo = useMemo(() => {
    if (!selected) return null;
    const entradas = lancamentos.filter(l => l.sinal > 0).reduce((s, l) => s + l.valor, 0);
    const saidas = lancamentos.filter(l => l.sinal < 0).reduce((s, l) => s + l.valor, 0);
    const adiantPagos = lancamentos.filter(l => l.origem_tipo === 'boitel:adiantamento' || l.origem_tipo === 'boitel:adiantamento_pago').reduce((s, l) => s + l.valor, 0);
    const adiantRecebidos = lancamentos.filter(l => l.origem_tipo === 'boitel:adiantamento_recebido').reduce((s, l) => s + l.valor, 0);
    const recebFinal = lancamentos.filter(l => l.origem_tipo === 'boitel:receita').reduce((s, l) => s + l.valor, 0);
    const saldoEsperado = selected.receita_produtor - adiantPagos - adiantRecebidos;
    const totalRecebido = entradas;
    const gap = totalRecebido - selected.receita_produtor;
    return { entradas, saidas, adiantPagos, adiantRecebidos, recebFinal, saldoEsperado, totalRecebido, gap };
  }, [selected, lancamentos]);

  async function handleNovoLancamento() {
    if (!selected || !clienteId || !fazendaAtual?.id) return;
    const valor = parseFloat(novoValor);
    if (!novoData || isNaN(valor) || valor <= 0) {
      toast.error('Preencha data e valor válidos.');
      return;
    }

    const isPago = novoTipo === 'adiantamento_pago';
    const tipoOp = isPago ? '2-Saídas' : '1-Entradas';
    const sinal = isPago ? -1 : 1;
    const origemTipo = `boitel:${novoTipo}`;

    // Find plano de contas
    const subHint = isPago ? '%adiantamento%' : '%boitel%';
    const { data: plano } = await supabase
      .from('financeiro_plano_contas')
      .select('id, macro_custo, centro_custo, subcentro')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .eq('tipo_operacao', tipoOp)
      .ilike('subcentro', subHint)
      .limit(1);

    let cls = plano?.[0];
    if (!cls) {
      // Fallback
      const { data: fb } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .eq('tipo_operacao', tipoOp)
        .limit(1);
      cls = fb?.[0];
    }
    if (!cls) {
      toast.error('Nenhuma conta encontrada no Plano de Contas para este tipo de operação.');
      return;
    }

    const desc = novoDesc || `${isPago ? 'Adiantamento pago' : 'Adiantamento recebido'} - Boitel ${selected.lote || selected.fazenda_destino_nome}`;

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
      cliente_id: clienteId,
      fazenda_id: fazendaAtual.id,
      tipo_operacao: tipoOp,
      sinal,
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
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {!selected ? (
          /* LIST VIEW */
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
          /* DETAIL VIEW */
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

            {/* RESUMO */}
            {resumo && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resultado com Boitel</span>
                    <span className="font-bold text-primary">{fmt(selected.receita_produtor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Adiantamentos pagos</span>
                    <span className="font-semibold text-destructive">{fmt(resumo.adiantPagos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(-) Adiantamentos recebidos</span>
                    <span className="font-semibold text-primary">{fmt(resumo.adiantRecebidos)}</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Saldo esperado a receber</span>
                    <span className="font-bold">{fmt(resumo.saldoEsperado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total recebido</span>
                    <span className="font-semibold text-primary">{fmt(resumo.totalRecebido)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diferença (gap)</span>
                    <span className={`font-bold ${resumo.gap >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {fmt(resumo.gap)}
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

            {/* EXTRATO */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1">
                  <ArrowUpDown className="h-4 w-4" /> Extrato
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
                              <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            <span className="text-xs font-medium text-foreground truncate">
                              {l.descricao || l.origem_tipo || 'Lançamento'}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground pl-4.5">
                            {fmtDate(l.data_pagamento)} · {l.origem_tipo?.replace('boitel:', '') || '-'}
                          </p>
                        </div>
                        <span className={`text-xs font-bold whitespace-nowrap ${l.sinal > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
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
