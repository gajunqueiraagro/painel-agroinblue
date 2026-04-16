/**
 * ProjetosInvestimento — CRUD completo para meta_projetos_investimento.
 * Seção 1: Lista com tabela. Seção 2: Modal novo/editar.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeft, SplitSquareVertical } from 'lucide-react';

const MESES_KEYS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'] as const;
const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface Projeto {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  ano: number;
  nome: string;
  subcentro: string;
  centro_custo: string;
  grupo_custo: string;
  macro_custo: string;
  responsavel: string | null;
  status: string;
  orcamento_total: number;
  jan: number; fev: number; mar: number; abr: number; mai: number; jun: number;
  jul: number; ago: number; set: number; out: number; nov: number; dez: number;
  observacao: string | null;
}

interface SubcentroOption {
  subcentro: string;
  centro_custo: string;
  grupo_custo: string;
}

const STATUS_OPTIONS = [
  { value: 'planejado', label: 'Planejado', color: 'bg-muted text-muted-foreground' },
  { value: 'em_andamento', label: 'Em andamento', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'concluido', label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
];

const fmt = (v: number) => v === 0 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyForm = (): Omit<Projeto, 'id' | 'cliente_id'> => ({
  fazenda_id: null,
  ano: new Date().getFullYear(),
  nome: '',
  subcentro: '',
  centro_custo: '',
  grupo_custo: '',
  macro_custo: 'Investimento na Fazenda',
  responsavel: null,
  status: 'planejado',
  orcamento_total: 0,
  jan: 0, fev: 0, mar: 0, abr: 0, mai: 0, jun: 0,
  jul: 0, ago: 0, set: 0, out: 0, nov: 0, dez: 0,
  observacao: null,
});

interface Props {
  ano: number;
  onBack: () => void;
  onDataChanged?: () => void;
}

export function ProjetosInvestimento({ ano, onBack, onDataChanged }: Props) {
  const { clienteAtual } = useCliente();
  const { fazendas, fazendaAtual } = useFazenda();
  const clienteId = clienteAtual?.id;
  const isGlobal = !fazendaAtual?.id || fazendaAtual.id === '__global__';

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(false);
  const [subcentroOptions, setSubcentroOptions] = useState<SubcentroOption[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load subcentros from plano de contas
  useEffect(() => {
    (async () => {
      const { data } = await (supabase
        .from('financeiro_plano_contas' as any)
        .select('subcentro, centro_custo, grupo_custo')
        .eq('macro_custo', 'Investimento na Fazenda')
        .eq('ativo', true)
        .order('ordem_exibicao') as any);
      setSubcentroOptions((data || []).filter((r: any) => r.subcentro) as SubcentroOption[]);
    })();
  }, []);

  // Load projetos
  const loadProjetos = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('meta_projetos_investimento' as any)
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .order('nome');

      if (!isGlobal && fazendaAtual?.id) {
        query = query.eq('fazenda_id', fazendaAtual.id);
      }

      const { data, error } = await (query as any);
      if (error) throw error;
      setProjetos((data || []) as Projeto[]);
    } catch (e: any) {
      console.error('Erro ao carregar projetos:', e);
    } finally {
      setLoading(false);
    }
  }, [clienteId, ano, fazendaAtual?.id, isGlobal]);

  useEffect(() => { loadProjetos(); }, [loadProjetos]);

  // Totais
  const totais = useMemo(() => {
    const t = new Array(12).fill(0);
    for (const p of projetos) {
      MESES_KEYS.forEach((k, i) => { t[i] += Number((p as any)[k]) || 0; });
    }
    return t;
  }, [projetos]);

  const totalGeral = totais.reduce((a, b) => a + b, 0);

  // Handlers
  const openNew = () => {
    setEditId(null);
    const f = emptyForm();
    f.ano = ano;
    if (!isGlobal && fazendaAtual?.id) f.fazenda_id = fazendaAtual.id;
    setForm(f);
    setModalOpen(true);
  };

  const openEdit = (p: Projeto) => {
    setEditId(p.id);
    const { id, cliente_id, ...rest } = p;
    setForm(rest);
    setModalOpen(true);
  };

  const handleSubcentroChange = (sub: string) => {
    const opt = subcentroOptions.find(o => o.subcentro === sub);
    if (opt) {
      setForm(prev => ({ ...prev, subcentro: opt.subcentro, centro_custo: opt.centro_custo, grupo_custo: opt.grupo_custo }));
    }
  };

  const distribuirIgual = () => {
    const total = form.orcamento_total || 0;
    const perMonth = Math.round((total / 12) * 100) / 100;
    const update: any = {};
    MESES_KEYS.forEach(k => { update[k] = perMonth; });
    // Adjust last month for rounding
    const diff = Math.round((total - perMonth * 12) * 100) / 100;
    update.dez = Math.round((perMonth + diff) * 100) / 100;
    setForm(prev => ({ ...prev, ...update }));
  };

  const formTotal = MESES_KEYS.reduce((s, k) => s + (Number((form as any)[k]) || 0), 0);

  const handleSave = async () => {
    if (!clienteId) return;
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.subcentro) { toast.error('Subcentro é obrigatório'); return; }
    if (!form.fazenda_id) { toast.error('Fazenda é obrigatória'); return; }

    const payload = {
      ...form,
      cliente_id: clienteId,
      orcamento_total: formTotal,
    };

    try {
      if (editId) {
        const { error } = await (supabase
          .from('meta_projetos_investimento' as any)
          .update(payload)
          .eq('id', editId) as any);
        if (error) throw error;
        toast.success('Projeto atualizado');
      } else {
        const { error } = await (supabase
          .from('meta_projetos_investimento' as any)
          .insert(payload) as any);
        if (error) throw error;
        toast.success('Projeto criado');
      }
      setModalOpen(false);
      await loadProjetos();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await (supabase
        .from('meta_projetos_investimento' as any)
        .delete()
        .eq('id', deleteConfirm) as any);
      if (error) throw error;
      toast.success('Projeto excluído');
      setDeleteConfirm(null);
      await loadProjetos();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    }
  };

  const statusBadge = (s: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === s);
    return <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${opt?.color || ''}`}>{opt?.label || s}</Badge>;
  };

  const fazendaNome = (fid: string | null) => {
    if (!fid) return '–';
    const f = fazendas.find(fz => fz.id === fid);
    return f?.nome || '–';
  };

  return (
    <div className="w-full px-2 sm:px-4 animate-fade-in flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background py-2 flex flex-wrap items-center gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <span className="text-xs font-semibold text-card-foreground whitespace-nowrap">
          Projetos de Investimento — {ano}
        </span>
        <div className="flex-1" />
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />Novo Projeto
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-auto relative flex-1 min-h-0" style={{ height: 'calc(100vh - 120px)' }}>
        <Table className="min-w-[900px] text-[9px] tabular-nums">
          <TableHeader>
            <TableRow className="border-b-2 border-border">
              <TableHead className="sticky left-0 z-20 bg-card w-[140px]">Nome</TableHead>
              <TableHead className="w-[80px]">Fazenda</TableHead>
              <TableHead className="w-[120px]">Subcentro</TableHead>
              <TableHead className="w-[70px]">Responsável</TableHead>
              {MESES_LABELS.map(m => (
                <TableHead key={m} className="text-right w-[56px]">{m}</TableHead>
              ))}
              <TableHead className="text-right w-[66px] font-extrabold border-l-2 border-border">Total</TableHead>
              <TableHead className="w-[60px]">Status</TableHead>
              <TableHead className="w-[50px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={18} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!loading && projetos.length === 0 && (
              <TableRow><TableCell colSpan={18} className="text-center py-8 text-muted-foreground">Nenhum projeto cadastrado para {ano}.</TableCell></TableRow>
            )}
            {projetos.map(p => {
              const pTotal = MESES_KEYS.reduce((s, k) => s + (Number((p as any)[k]) || 0), 0);
              return (
                <TableRow key={p.id} className="border-b border-border/30">
                  <TableCell className="sticky left-0 z-10 bg-card font-medium truncate">{p.nome}</TableCell>
                  <TableCell className="truncate">{fazendaNome(p.fazenda_id)}</TableCell>
                  <TableCell className="truncate text-muted-foreground">{p.subcentro}</TableCell>
                  <TableCell className="truncate">{p.responsavel || '–'}</TableCell>
                  {MESES_KEYS.map((k, i) => (
                    <TableCell key={k} className={`text-right${i === 2 || i === 5 || i === 8 ? ' border-r border-border/30' : ''}`}>
                      {fmt(Number((p as any)[k]) || 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold border-l-2 border-border">{fmt(pTotal)}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openEdit(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => setDeleteConfirm(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Rodapé Total */}
            {projetos.length > 0 && (
              <TableRow className="border-t-2 border-border bg-muted/50 font-bold">
                <TableCell className="sticky left-0 z-10 bg-muted/50 text-[9px] font-bold">TOTAL</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                {totais.map((v, i) => (
                  <TableCell key={i} className={`text-right text-[9px] font-bold${i === 2 || i === 5 || i === 8 ? ' border-r border-border/30' : ''}`}>{fmt(v)}</TableCell>
                ))}
                <TableCell className="text-right text-[9px] font-extrabold border-l-2 border-border">{fmt(totalGeral)}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Novo/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Projeto' : 'Novo Projeto de Investimento'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium">Nome do Projeto *</label>
              <Input value={form.nome} onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))} placeholder="Ex: Reforma de cercas" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium">Fazenda *</label>
              <Select value={form.fazenda_id || ''} onValueChange={v => setForm(prev => ({ ...prev, fazenda_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazendas.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Subcentro *</label>
              <Select value={form.subcentro || ''} onValueChange={handleSubcentroChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {subcentroOptions.map(o => (
                    <SelectItem key={o.subcentro} value={o.subcentro}>{o.subcentro}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Responsável</label>
              <Input value={form.responsavel || ''} onChange={e => setForm(prev => ({ ...prev, responsavel: e.target.value || null }))} placeholder="Nome" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium">Status</label>
              <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">Observação</label>
              <Textarea value={form.observacao || ''} onChange={e => setForm(prev => ({ ...prev, observacao: e.target.value || null }))} rows={2} className="text-xs" />
            </div>
          </div>

          {/* Distribuição mensal */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold">Distribuição Mensal</span>
              <div className="flex-1" />
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Orçamento:</label>
                <Input
                  type="number"
                  value={form.orcamento_total || ''}
                  onChange={e => setForm(prev => ({ ...prev, orcamento_total: Number(e.target.value) || 0 }))}
                  className="h-7 w-[100px] text-xs"
                  placeholder="R$"
                />
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={distribuirIgual}>
                  <SplitSquareVertical className="h-3 w-3 mr-1" />Distribuir igual
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {MESES_KEYS.map((k, i) => (
                <div key={k}>
                  <label className="text-[9px] font-medium text-muted-foreground">{MESES_LABELS[i]}</label>
                  <Input
                    type="number"
                    value={(form as any)[k] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [k]: Number(e.target.value) || 0 }))}
                    className="h-7 text-xs text-right"
                  />
                </div>
              ))}
            </div>
            <div className="text-right mt-1 text-xs font-semibold">
              Total: {fmt(formTotal)}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
