import { useState } from 'react';
import ModalBaixaParcela from '@/components/financiamentos/ModalBaixaParcela';
import { ArrowLeft, Pencil, DollarSign, CheckCircle2, Clock, AlertTriangle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) =>
  d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy') : '—';

const today = () => format(new Date(), 'yyyy-MM-dd');

/* ================================================================ */

interface FinanciamentoDetalheProps {
  id?: string;
  onVoltar?: () => void;
}

export default function FinanciamentoDetalhe({ id, onVoltar }: FinanciamentoDetalheProps = {}) {
  const qc = useQueryClient();
  const qc = useQueryClient();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editingCell, setEditingCell] = useState<{ parcelaId: string; field: 'valor_principal' | 'valor_juros' } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [parcelaBaixa, setParcelaBaixa] = useState<any>(null);

  /* ── Financiamento ── */
  const { data: fin, isLoading: loadingFin } = useQuery({
    queryKey: ['financiamento-detalhe', id],
    enabled: !!id && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamentos')
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome), financeiro_contas_bancarias!financiamentos_conta_bancaria_id_fkey(nome_conta)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  /* ── Parcelas ── */
  const { data: parcelas = [], isLoading: loadingP } = useQuery({
    queryKey: ['financiamento-parcelas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamento_parcelas')
        .select('*')
        .eq('financiamento_id', id!)
        .order('numero_parcela');
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Resumo financeiro ── */
  const hj = today();
  const pagas = parcelas.filter(p => p.status === 'pago');
  const pendentes = parcelas.filter(p => p.status === 'pendente');
  const totalPago = pagas.reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const aVencer = pendentes.filter(p => p.data_vencimento >= hj).reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const vencido = pendentes.filter(p => p.data_vencimento < hj).reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const progresso = parcelas.length > 0 ? (pagas.length / parcelas.length) * 100 : 0;

  /* ── Lookups for edit modal ── */
  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fin-fornecedores', clienteId],
    enabled: !!clienteId && editOpen,
    queryFn: async () => {
      const { data } = await supabase.from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId!).order('nome');
      return data ?? [];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['fin-contas', clienteId],
    enabled: !!clienteId && editOpen,
    queryFn: async () => {
      const { data } = await supabase.from('financeiro_contas_bancarias').select('id, nome_conta').eq('cliente_id', clienteId!).eq('ativa', true).order('ordem_exibicao');
      return data ?? [];
    },
  });

  /* ── Edit financiamento ── */
  const openEdit = () => {
    if (!fin) return;
    setEditForm({
      descricao: fin.descricao,
      tipo_financiamento: fin.tipo_financiamento,
      credor_id: fin.credor_id ?? '',
      conta_bancaria_id: fin.conta_bancaria_id ?? '',
      valor_total: fin.valor_total,
      valor_entrada: fin.valor_entrada,
      taxa_juros_mensal: fin.taxa_juros_mensal,
      data_contrato: fin.data_contrato,
      observacao: fin.observacao ?? '',
      status: fin.status,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const { error } = await supabase
      .from('financiamentos')
      .update({
        descricao: editForm.descricao,
        tipo_financiamento: editForm.tipo_financiamento,
        credor_id: editForm.credor_id || null,
        conta_bancaria_id: editForm.conta_bancaria_id || null,
        valor_total: Number(editForm.valor_total),
        valor_entrada: Number(editForm.valor_entrada),
        taxa_juros_mensal: Number(editForm.taxa_juros_mensal),
        data_contrato: editForm.data_contrato,
        observacao: editForm.observacao || null,
        status: editForm.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id!);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Financiamento atualizado');
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ['financiamento-detalhe', id] });
  };

  /* ── Inline edit parcela ── */
  const startCellEdit = (parcelaId: string, field: 'valor_principal' | 'valor_juros', currentVal: number) => {
    setEditingCell({ parcelaId, field });
    setEditingValue(String(currentVal));
  };

  const commitCellEdit = async () => {
    if (!editingCell) return;
    const val = Number(editingValue);
    if (isNaN(val) || val < 0) {
      setEditingCell(null);
      return;
    }
    const updatePayload = editingCell.field === 'valor_principal'
      ? { valor_principal: val, updated_at: new Date().toISOString() }
      : { valor_juros: val, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from('financiamento_parcelas')
      .update(updatePayload)
      .eq('id', editingCell.parcelaId);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', id] });
    }
    setEditingCell(null);
  };

  /* ── Loading / not found ── */
  if (loadingFin || loadingP) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><span className="text-3xl animate-pulse">💰</span></div>;
  }
  if (!fin) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-sm text-muted-foreground">Financiamento não encontrado.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-5xl mx-auto space-y-4 pb-20">
      {/* Voltar */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/financiamentos')} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      {/* ── Seção 3: Resumo financeiro ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { icon: DollarSign, label: 'Valor financiado', value: fmt(Number(fin.valor_total)), color: 'text-primary' },
          { icon: CheckCircle2, label: 'Total pago', value: fmt(totalPago), color: 'text-emerald-600' },
          { icon: Clock, label: 'A vencer', value: fmt(aVencer), color: 'text-amber-600' },
          { icon: AlertTriangle, label: 'Vencido', value: fmt(vencido), color: 'text-red-600' },
          { icon: BarChart3, label: 'Progresso', value: `${pagas.length}/${parcelas.length}`, color: 'text-primary' },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-2 text-center space-y-0.5">
              <c.icon className={`h-4 w-4 mx-auto ${c.color}`} />
              <p className="text-[10px] text-muted-foreground">{c.label}</p>
              <p className="text-sm font-bold tabular-nums">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Progress value={progresso} className="h-2" />

      {/* ── Seção 1: Cabeçalho ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Dados do financiamento</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={openEdit}>
            <Pencil className="h-3 w-3" /> Editar
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <Info label="Descrição" value={fin.descricao} />
          <Info label="Tipo" value={fin.tipo_financiamento === 'pecuaria' ? 'Pecuária' : 'Agricultura'} />
          <Info label="Credor" value={fin.financeiro_fornecedores?.nome ?? '—'} />
          <Info label="Status">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${fin.status === 'ativo' ? 'bg-emerald-100 text-emerald-800' : fin.status === 'quitado' ? 'bg-muted text-muted-foreground' : 'bg-red-100 text-red-800'}`}>
              {fin.status}
            </span>
          </Info>
          <Info label="Valor total" value={fmt(Number(fin.valor_total))} />
          <Info label="Valor entrada" value={fmt(Number(fin.valor_entrada))} />
          <Info label="Taxa juros" value={`${Number(fin.taxa_juros_mensal).toFixed(2)}% a.m.`} />
          <Info label="Data contrato" value={fmtDate(fin.data_contrato)} />
          <Info label="1ª parcela" value={fmtDate(fin.data_primeira_parcela)} />
          <Info label="Total parcelas" value={String(fin.total_parcelas)} />
          <Info label="Conta bancária" value={fin.financeiro_contas_bancarias?.nome_conta ?? '—'} />
          {fin.observacao && <Info label="Observação" value={fin.observacao} className="col-span-2 sm:col-span-3" />}
        </CardContent>
      </Card>

      {/* ── Seção 2: Tabela de Parcelas ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Parcelas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcelas.map(p => {
                  const principal = Number(p.valor_principal);
                  const juros = Number(p.valor_juros);
                  const total = principal + juros;
                  const isPending = p.status === 'pendente';
                  const isOverdue = isPending && p.data_vencimento < hj;
                  const statusLabel = isOverdue ? 'atrasado' : p.status;
                  const statusClass = p.status === 'pago'
                    ? 'bg-emerald-100 text-emerald-800'
                    : isOverdue
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800';

                  const renderEditable = (field: 'valor_principal' | 'valor_juros', val: number) => {
                    if (editingCell?.parcelaId === p.id && editingCell.field === field) {
                      return (
                        <Input
                          type="number"
                          step="0.01"
                          className="h-6 w-24 text-right text-[11px]"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={commitCellEdit}
                          onKeyDown={e => e.key === 'Enter' && commitCellEdit()}
                          autoFocus
                        />
                      );
                    }
                    if (isPending) {
                      return (
                        <span
                          className="cursor-pointer hover:underline tabular-nums"
                          onClick={() => startCellEdit(p.id, field, val)}
                        >
                          {fmt(val)}
                        </span>
                      );
                    }
                    return <span className="tabular-nums">{fmt(val)}</span>;
                  };

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="tabular-nums">{p.numero_parcela}</TableCell>
                      <TableCell className="tabular-nums">{fmtDate(p.data_vencimento)}</TableCell>
                      <TableCell className="text-right">{renderEditable('valor_principal', principal)}</TableCell>
                      <TableCell className="text-right">{renderEditable('valor_juros', juros)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(total)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtDate(p.data_pagamento)}</TableCell>
                      <TableCell>
                        {p.status === 'pago' && p.lancamento_id ? (
                          <Button variant="ghost" size="sm" className="text-[10px] h-6" disabled>
                            Ver lançamento
                          </Button>
                        ) : isPending ? (
                          <Button size="sm" className="text-[10px] h-6" onClick={() => setParcelaBaixa(p)}>
                            Registrar pagamento
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Modal de edição do financiamento ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar financiamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={editForm.descricao ?? ''} onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={editForm.tipo_financiamento} onValueChange={v => setEditForm(p => ({ ...p, tipo_financiamento: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pecuaria">Pecuária</SelectItem>
                    <SelectItem value="agricultura">Agricultura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="quitado">Quitado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Credor</Label>
                <Select value={editForm.credor_id} onValueChange={v => setEditForm(p => ({ ...p, credor_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Conta bancária</Label>
                <Select value={editForm.conta_bancaria_id} onValueChange={v => setEditForm(p => ({ ...p, conta_bancaria_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Valor total</Label>
                <Input type="number" value={editForm.valor_total ?? 0} onChange={e => setEditForm(p => ({ ...p, valor_total: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Entrada</Label>
                <Input type="number" value={editForm.valor_entrada ?? 0} onChange={e => setEditForm(p => ({ ...p, valor_entrada: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Juros % a.m.</Label>
                <Input type="number" step="0.01" value={editForm.taxa_juros_mensal ?? 0} onChange={e => setEditForm(p => ({ ...p, taxa_juros_mensal: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Data contrato</Label>
              <Input type="date" value={editForm.data_contrato ?? ''} onChange={e => setEditForm(p => ({ ...p, data_contrato: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={editForm.observacao ?? ''} onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal de baixa de parcela (P5) ── */}
      <ModalBaixaParcela
        parcela={parcelaBaixa}
        financiamento={fin}
        onClose={() => setParcelaBaixa(null)}
      />
    </div>
  );
}

/* ── Helper component ── */
function Info({ label, value, children, className = '' }: { label: string; value?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      {children ?? <p className="font-medium">{value}</p>}
    </div>
  );
}
