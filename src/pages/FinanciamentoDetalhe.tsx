import { useState } from 'react';
import ModalBaixaParcela from '@/components/financiamentos/ModalBaixaParcela';
import { CredorAutocomplete } from '@/components/financiamentos/CredorAutocomplete';
import { ArrowLeft, Pencil, Trash2, DollarSign, CheckCircle2, Clock, AlertTriangle, BarChart3 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  from?: 'lancamentos';
}

export default function FinanciamentoDetalhe({ id, onVoltar, from }: FinanciamentoDetalheProps = {}) {
  const qc = useQueryClient();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [planosEntrada, setPlanosEntrada] = useState<Array<{id:string; subcentro:string}>>([]);
  const [editingCell, setEditingCell] = useState<{ parcelaId: string; field: 'valor_principal' | 'valor_juros' } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [parcelaEdit, setParcelaEdit] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── Financiamento ── */
  const { data: fin, isLoading: loadingFin } = useQuery({
    queryKey: ['financiamento-detalhe', id],
    enabled: !!id && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamentos')
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome), financeiro_contas_bancarias!financiamentos_conta_bancaria_id_fkey(nome_conta, nome_exibicao)')
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
      const { data } = await supabase.from('financeiro_contas_bancarias').select('id, nome_conta, nome_exibicao').eq('cliente_id', clienteId!).eq('ativa', true).order('ordem_exibicao');
      return data ?? [];
    },
  });

  /* ── Edit financiamento ── */
  const openEdit = () => {
    if (!fin) return;
    setEditForm({
      descricao: fin.descricao,
      numero_contrato: fin.numero_contrato ?? '',
      tipo_financiamento: fin.tipo_financiamento,
      credor_id: fin.credor_id ?? '',
      conta_bancaria_id: fin.conta_bancaria_id ?? '',
      valor_total: fin.valor_total,
      valor_entrada: fin.valor_entrada,
      taxa_juros_mensal: fin.taxa_juros_mensal,
      data_contrato: fin.data_contrato,
      observacao: fin.observacao ?? '',
      status: fin.status,
      gerar_lancamento_captacao: fin.gerar_lancamento_captacao ?? false,
      plano_conta_captacao_id: fin.plano_conta_captacao_id ?? '',
    });
    setEditOpen(true);
    if (planosEntrada.length === 0) {
      supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro')
        .eq('tipo_operacao', '1-Entradas')
        .eq('ativo', true)
        .order('ordem_exibicao')
        .then(({ data }) => { if (data) setPlanosEntrada(data as any); });
    }
  };

  const saveEdit = async () => {
    const { error } = await supabase
      .from('financiamentos')
      .update({
        descricao: editForm.descricao,
        numero_contrato: editForm.numero_contrato?.trim() || null,
        tipo_financiamento: editForm.tipo_financiamento,
        credor_id: editForm.credor_id || null,
        conta_bancaria_id: editForm.conta_bancaria_id || null,
        valor_total: Number(editForm.valor_total),
        valor_entrada: Number(editForm.valor_entrada),
        taxa_juros_mensal: Number(editForm.taxa_juros_mensal),
        data_contrato: editForm.data_contrato,
        observacao: editForm.observacao || null,
        status: editForm.status,
        gerar_lancamento_captacao: !!editForm.gerar_lancamento_captacao,
        plano_conta_captacao_id: editForm.plano_conta_captacao_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id!);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }

    // ── Sync lançamento de captação ──────────────────────────────────
    const novoGerar = !!editForm.gerar_lancamento_captacao;
    const novoPlanoCap = editForm.plano_conta_captacao_id;
    const lancId: string | null = (fin as any)?.lancamento_captacao_id ?? null;
    const anoMes = format(new Date(editForm.data_contrato + 'T12:00:00'), 'yyyy-MM');

    if (novoGerar && novoPlanoCap) {
      if (lancId) {
        await supabase.from('financeiro_lancamentos_v2').update({
          valor: Number(editForm.valor_total),
          data_competencia: editForm.data_contrato,
          data_pagamento: editForm.data_contrato,
          conta_bancaria_id: editForm.conta_bancaria_id || null,
          favorecido_id: editForm.credor_id || null,
          plano_conta_id: novoPlanoCap,
          ano_mes: anoMes,
          cancelado: false,
          cancelado_em: null,
          cancelado_por: null,
          sem_movimentacao_caixa: false,
          updated_at: new Date().toISOString(),
        }).eq('id', lancId);
      } else {
        const { data: novoLanc } = await supabase
          .from('financeiro_lancamentos_v2')
          .insert({
            cliente_id: (fin as any)?.cliente_id,
            fazenda_id: (fin as any)?.fazenda_id,
            financiamento_id: id!,
            conta_bancaria_id: editForm.conta_bancaria_id || null,
            favorecido_id: editForm.credor_id || null,
            tipo_operacao: '1-Entradas',
            sinal: 1,
            valor: Number(editForm.valor_total),
            data_competencia: editForm.data_contrato,
            data_pagamento: editForm.data_contrato,
            ano_mes: anoMes,
            origem_lancamento: 'financiamento',
            origem_tipo: 'financiamento_captacao',
            plano_conta_id: novoPlanoCap,
            descricao: `Captação: ${(editForm.descricao ?? '').trim()}`,
            status_transacao: 'realizado',
            sem_movimentacao_caixa: false,
            cancelado: false,
          })
          .select('id')
          .single();
        if (novoLanc?.id) {
          await supabase.from('financiamentos')
            .update({ lancamento_captacao_id: novoLanc.id })
            .eq('id', id!);
        }
      }
    } else if (!novoGerar && lancId) {
      await supabase.from('financeiro_lancamentos_v2').update({
        cancelado: true,
        cancelado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', lancId);
    }
    // ─────────────────────────────────────────────────────────────────

    toast.success('Financiamento atualizado');
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ['financiamento-detalhe', id] });
  };

  const excluirFinanciamento = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // Apaga mirrors (financeiro_lancamentos_v2 + planejamento_financeiro) de cada parcela
      const { data: pRows } = await supabase
        .from('financiamento_parcelas')
        .select('id')
        .eq('financiamento_id', id);
      if (pRows && pRows.length > 0) {
        const { deletarMirrorParcela } = await import('@/lib/financiamentos/parcelaMirror');
        await Promise.all(pRows.map((p: any) => deletarMirrorParcela(supabase as any, p.id)));
      }
      await supabase.from('financiamento_parcelas').delete().eq('financiamento_id', id);
      const { error } = await supabase.from('financiamentos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Financiamento excluído');
      qc.invalidateQueries({ queryKey: ['financiamentos-lista'] });
      setConfirmDelete(false);
      setEditOpen(false);
      onVoltar?.();
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e.message || e));
    } finally {
      setDeleting(false);
    }
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
    if (error) {
      toast.error(error.message);
    } else {
      // Buscar IDs oficiais para sincronizar o financeiro
      const { data: parcelaAtualizada } = await supabase
        .from('financiamento_parcelas')
        .select('lancamento_id, lancamento_juros_id, valor_principal, valor_juros')
        .eq('id', editingCell.parcelaId)
        .maybeSingle();
      if (parcelaAtualizada?.lancamento_id || parcelaAtualizada?.lancamento_juros_id) {
        const { atualizarValoresMirror } = await import('@/lib/financiamentos/parcelaMirror');
        await atualizarValoresMirror(
          supabase as any,
          parcelaAtualizada.lancamento_id ?? null,
          parcelaAtualizada.lancamento_juros_id ?? null,
          Number(parcelaAtualizada.valor_principal) || 0,
          Number(parcelaAtualizada.valor_juros) || 0,
        );
      }
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', id] });
      qc.invalidateQueries({ queryKey: ['financeiro-lancamentos'] });
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
      <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> {from === 'lancamentos' ? 'Voltar aos Lançamentos' : 'Voltar'}
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
          <Info label="Nº Contrato" value={fin.numero_contrato || '—'} />
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
          <Info label="Conta bancária" value={(fin.financeiro_contas_bancarias as any)?.nome_exibicao || fin.financeiro_contas_bancarias?.nome_conta || '—'} />
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
                        <div className="flex items-center gap-1">
                          {p.status === 'pago' && p.lancamento_id && (
                            <Button variant="ghost" size="sm" className="text-[10px] h-6" disabled>
                              Ver lançamento
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setParcelaEdit(p)}
                            title="Editar parcela"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
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
            <div>
              <Label className="text-xs">Nº Contrato</Label>
              <Input value={editForm.numero_contrato ?? ''} onChange={e => setEditForm(p => ({ ...p, numero_contrato: e.target.value }))} placeholder="Ex: 0123456-78/2024" />
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
                {clienteId && (
                  <CredorAutocomplete
                    value={editForm.credor_id || ''}
                    onChange={(credorId) => setEditForm(p => ({ ...p, credor_id: credorId }))}
                    clienteId={clienteId}
                  />
                )}
              </div>
              <div>
                <Label className="text-xs">Conta bancária</Label>
                <Select value={editForm.conta_bancaria_id} onValueChange={v => setEditForm(p => ({ ...p, conta_bancaria_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {contas.map(c => <SelectItem key={c.id} value={c.id}>{(c as any).nome_exibicao || c.nome_conta}</SelectItem>)}
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

            {/* Captação */}
            <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-captacao"
                  checked={!!editForm.gerar_lancamento_captacao}
                  onCheckedChange={v => setEditForm(p => ({ ...p, gerar_lancamento_captacao: !!v }))}
                />
                <Label htmlFor="edit-captacao" className="text-xs cursor-pointer font-medium text-amber-800">
                  Registrar entrada da captação no fluxo de caixa
                </Label>
              </div>
              {editForm.gerar_lancamento_captacao && (
                <div>
                  <Label className="text-xs">Conta de captação (plano)</Label>
                  <Select
                    value={editForm.plano_conta_captacao_id ?? ''}
                    onValueChange={v => setEditForm(p => ({ ...p, plano_conta_captacao_id: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                    <SelectContent>
                      {planosEntrada.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.subcentro}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir contrato
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={saveEdit}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir financiamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove permanentemente o contrato e todas as parcelas associadas. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirFinanciamento}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal único: editar parcela (cobre registro de pagamento via mudança de status) ── */}
      <ModalBaixaParcela
        parcela={parcelaEdit}
        financiamento={fin}
        onClose={() => setParcelaEdit(null)}
        modo="editar"
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
