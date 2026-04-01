import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Lancamento,
  CATEGORIAS,
  TODOS_TIPOS,
  Categoria,
  TipoMovimentacao,
  kgToArrobas,
} from '@/types/cattle';
import { isEntrada, isReclassificacao } from '@/lib/calculos/zootecnicos';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, DollarSign, AlertTriangle } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { STATUS_OPTIONS, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onClose: () => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  onCountFinanceiros?: (id: string) => Promise<number>;
}

export function LancamentoDetalhe({ lancamento, open, onClose, onEditar, onRemover, onCountFinanceiros }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const nomeFazenda = fazendaAtual?.nome || '';
  const outrasFazendas = useMemo(() => fazendas.filter(f => f.id !== fazendaAtual?.id), [fazendas, fazendaAtual]);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ ...lancamento });

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [financeiroCount, setFinanceiroCount] = useState(0);
  const [checkingVinculos, setCheckingVinculos] = useState(false);
  const [notaFiscalEdit, setNotaFiscalEdit] = useState(lancamento.notaFiscal || '');

  // Unified purchase edit sheet
  const [compraEditSheetOpen, setCompraEditSheetOpen] = useState(false);
  const [compraForm, setCompraForm] = useState({ ...lancamento });
  const [compraSaving, setCompraSaving] = useState(false);
  const [compraZooSaved, setCompraZooSaved] = useState(false);

  // Financial records summary for purchases
  interface FinResumo { id: string; descricao: string; valor: number; data_pagamento: string | null; cancelado: boolean; origem_tipo: string | null; }
  const [finRecords, setFinRecords] = useState<FinResumo[]>([]);
  const [finLoading, setFinLoading] = useState(false);

  const isCompra = lancamento.tipo === 'compra';

  const loadFinRecords = useCallback(() => {
    if (!isCompra) return;
    setFinLoading(true);
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao, valor, data_pagamento, cancelado, origem_tipo')
      .eq('movimentacao_rebanho_id', lancamento.id)
      .eq('cancelado', false)
      .order('data_pagamento', { ascending: true })
      .then(({ data }) => {
        setFinRecords((data as FinResumo[]) || []);
        setFinLoading(false);
      });
  }, [isCompra, lancamento.id]);

  useEffect(() => {
    if (open) loadFinRecords();
  }, [open, loadFinRecords]);

  const tipoInfo = TODOS_TIPOS.find(t => t.value === lancamento.tipo);
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);

  const isTransferenciaEntrada = lancamento.tipo === 'transferencia_entrada';

  // ---- Handle edit click ----
  const handleEditClick = () => {
    if (isCompra) {
      // Open unified purchase edit sheet
      setCompraForm({ ...lancamento });
      setCompraZooSaved(false);
      setNotaFiscalEdit(lancamento.notaFiscal || '');
      setCompraEditSheetOpen(true);
    } else {
      setForm({ ...lancamento });
      setEditando(true);
    }
  };

  // ---- Simple edit save (non-purchase) ----
  const handleSalvar = () => {
    const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
    const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);

    onEditar(lancamento.id, {
      data: form.data,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      categoriaDestino: form.categoriaDestino,
      fazendaOrigem: isSaidaAuto ? nomeFazenda : (form.fazendaOrigem || undefined),
      fazendaDestino: isEntradaAuto ? nomeFazenda : (form.fazendaDestino || undefined),
      pesoMedioKg: form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined,
      pesoMedioArrobas: form.pesoMedioKg ? kgToArrobas(Number(form.pesoMedioKg)) : undefined,
      precoMedioCabeca: form.precoMedioCabeca ? Number(form.precoMedioCabeca) : undefined,
      statusOperacional: form.statusOperacional || 'conciliado',
    });
    setEditando(false);
    onClose();
  };

  // ---- Purchase zootécnico save ----
  const handleSalvarCompraZoo = async () => {
    setCompraSaving(true);
    try {
      await onEditar(lancamento.id, {
        data: compraForm.data,
        tipo: compraForm.tipo,
        quantidade: Number(compraForm.quantidade),
        categoria: compraForm.categoria,
        fazendaOrigem: compraForm.fazendaOrigem || undefined,
        fazendaDestino: nomeFazenda,
        pesoMedioKg: compraForm.pesoMedioKg ? Number(compraForm.pesoMedioKg) : undefined,
        pesoMedioArrobas: compraForm.pesoMedioKg ? kgToArrobas(Number(compraForm.pesoMedioKg)) : undefined,
        statusOperacional: compraForm.statusOperacional || 'conciliado',
      });
      setCompraZooSaved(true);
    } finally {
      setCompraSaving(false);
    }
  };

  // ---- Deletion ----
  const handleRemoverClick = useCallback(async () => {
    if (onCountFinanceiros) {
      setCheckingVinculos(true);
      try {
        const count = await onCountFinanceiros(lancamento.id);
        setFinanceiroCount(count);
        setConfirmOpen(true);
      } finally {
        setCheckingVinculos(false);
      }
    } else {
      setFinanceiroCount(0);
      setConfirmOpen(true);
    }
  }, [lancamento.id, onCountFinanceiros]);

  const handleConfirmRemover = () => {
    setConfirmOpen(false);
    onRemover(lancamento.id);
    onClose();
  };

  // ===================== VIEW MODE =====================
  if (!editando) {
    const entrada = isEntrada(lancamento.tipo);
    const reclass = isReclassificacao(lancamento.tipo);
    const catDestinoInfo = lancamento.categoriaDestino
      ? CATEGORIAS.find(c => c.value === lancamento.categoriaDestino)
      : null;

    return (
      <>
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="text-xl">{tipoInfo?.icon}</span>
                {tipoInfo?.label}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                <div>
                  <p className="text-[10px] text-muted-foreground">Data</p>
                  <p className="font-bold text-foreground">
                    {format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Quantidade</p>
                  <p className={`font-bold ${entrada ? 'text-success' : reclass ? 'text-foreground' : 'text-destructive'}`}>
                    {entrada ? '+' : reclass ? '' : '-'}{lancamento.quantidade} cab.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Categoria</p>
                  <p className="font-bold text-foreground">{catInfo?.label}</p>
                </div>
                {catDestinoInfo && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Categoria Destino</p>
                    <p className="font-bold text-foreground">{catDestinoInfo.label}</p>
                  </div>
                )}
                {lancamento.pesoMedioKg && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Peso Médio</p>
                    <p className="font-bold text-foreground">{lancamento.pesoMedioKg} kg ({lancamento.pesoMedioArrobas} @)</p>
                  </div>
                )}
                {lancamento.precoMedioCabeca && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Preço/Cabeça</p>
                    <p className="font-bold text-foreground">R$ {lancamento.precoMedioCabeca.toLocaleString('pt-BR')}</p>
                  </div>
                )}
                {lancamento.fazendaOrigem && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Fazenda Origem</p>
                    <p className="font-bold text-foreground">{lancamento.fazendaOrigem}</p>
                  </div>
                )}
                {lancamento.fazendaDestino && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Fazenda Destino</p>
                    <p className="font-bold text-foreground">{lancamento.fazendaDestino}</p>
                  </div>
                )}
                {lancamento.precoMedioCabeca && lancamento.quantidade && (
                  <div className="col-span-2 bg-primary/10 rounded-md p-2 mt-0.5">
                    <p className="text-[10px] text-muted-foreground">Valor Total</p>
                    <p className="font-extrabold text-primary text-lg leading-tight">
                      R$ {(lancamento.precoMedioCabeca * lancamento.quantidade).toLocaleString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>
              {/* Audit info */}
              <div className="bg-muted/40 rounded-md px-2.5 py-1.5 space-y-0.5">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">Histórico</p>
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-semibold">ID:</span> {lancamento.id.slice(0, 8)}
                </p>
                {lancamento.createdAt && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-semibold">Criado:</span>{' '}
                    {format(parseISO(lancamento.createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    {lancamento.createdByNome && ` por ${lancamento.createdByNome}`}
                  </p>
                )}
                {lancamento.updatedAt && lancamento.updatedAt !== lancamento.createdAt && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-semibold">Editado:</span>{' '}
                    {format(parseISO(lancamento.updatedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    {lancamento.updatedByNome && ` por ${lancamento.updatedByNome}`}
                  </p>
                )}
              </div>
              {isTransferenciaEntrada && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                    🔒 Transferência automática — só pode ser editada/removida na fazenda de origem.
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {!isTransferenciaEntrada && (
                  <>
                    <Button variant="default" size="sm" className="flex-1 h-8 text-[11px] font-bold" onClick={handleEditClick}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8 text-[11px]" onClick={handleRemoverClick} disabled={checkingVinculos}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
                    </Button>
                  </>
                )}
              </div>
              {/* Resumo financeiro da compra (view-only) */}
              {isCompra && !isTransferenciaEntrada && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide">
                    <DollarSign className="h-3 w-3" /> Financeiro vinculado
                  </div>
                  {finLoading ? (
                    <p className="text-[10px] text-muted-foreground">Carregando...</p>
                  ) : finRecords.length === 0 ? (
                    <div className="bg-muted/40 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground">
                      Nenhum lançamento financeiro gerado para esta compra.
                    </div>
                  ) : (
                    <div className="bg-muted/20 rounded-md px-2 py-1.5 space-y-px">
                      {finRecords.map(r => {
                        const label = r.origem_tipo?.includes('frete') ? '🚚' : r.origem_tipo?.includes('comissao') ? '📋' : '💰';
                        return (
                          <div key={r.id} className="flex justify-between text-[10px] leading-relaxed">
                            <span className="text-muted-foreground truncate max-w-[60%]">{label} {r.descricao}</span>
                            <span className="font-semibold shrink-0">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between text-[11px] font-bold pt-0.5 border-t border-border/50 text-primary">
                        <span>Total</span>
                        <span>R$ {finRecords.reduce((s, r) => s + r.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Unified purchase edit sheet */}
        <Sheet open={compraEditSheetOpen} onOpenChange={(v) => {
          setCompraEditSheetOpen(v);
          if (!v) loadFinRecords();
        }}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader className="pb-1">
              <SheetTitle className="text-sm">Editar Compra</SheetTitle>
              <p className="text-[10px] text-muted-foreground/70 italic">
                Alterações irão recalcular o financeiro da compra
              </p>
            </SheetHeader>
            <div className="mt-2 space-y-2.5">
              {/* BLOCO 1 — Zootécnico */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide">
                  📋 Dados Zootécnicos
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Data</Label>
                    <Input type="date" value={compraForm.data} onChange={e => setCompraForm(f => ({ ...f, data: e.target.value }))} className="mt-0.5 h-7 text-[11px]" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Quantidade</Label>
                    <Input type="number" value={compraForm.quantidade} onChange={e => setCompraForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-0.5 h-7 text-[11px]" min="1" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Peso (kg)</Label>
                    <Input type="number" value={compraForm.pesoMedioKg || ''} onChange={e => setCompraForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-0.5 h-7 text-[11px]" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Categoria</Label>
                    <Select value={compraForm.categoria} onValueChange={v => setCompraForm(f => ({ ...f, categoria: v as Categoria }))}>
                      <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Origem</Label>
                    <Input value={compraForm.fazendaOrigem || ''} onChange={e => setCompraForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-0.5 h-7 text-[11px]" placeholder="Faz. Boa Vista" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-foreground">Destino</Label>
                    <Input value={nomeFazenda} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
                  </div>
                </div>
                {/* Status */}
                <div>
                  <Label className="text-[10px] font-bold text-foreground">Status</Label>
                  <div className="flex gap-1 mt-0.5">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setCompraForm(f => ({ ...f, statusOperacional: s.value }))}
                        className={`flex-1 py-1 rounded text-[10px] font-bold border-2 transition-all ${
                          (compraForm.statusOperacional || 'conciliado') === s.value
                            ? `${s.bg} text-white border-transparent shadow-md`
                            : 'border-border text-muted-foreground bg-muted/30'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Warning: zootécnico changes impact financeiro */}
                {finRecords.length > 0 && (
                  compraForm.quantidade !== lancamento.quantidade ||
                  compraForm.pesoMedioKg !== lancamento.pesoMedioKg ||
                  compraForm.categoria !== lancamento.categoria
                ) && (
                  <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Alterações nos dados zootécnicos impactam o financeiro.</span>
                  </div>
                )}
                {/* Save zootécnico button */}
                {!compraZooSaved ? (
                  <Button
                    className="w-full h-7 text-[10px] font-bold"
                    size="sm"
                    onClick={handleSalvarCompraZoo}
                    disabled={compraSaving}
                  >
                    {compraSaving ? 'Salvando...' : '1. Salvar dados zootécnicos'}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 border border-green-200 dark:border-green-800">
                    ✅ Dados zootécnicos salvos
                  </div>
                )}
              </div>

              <Separator />

              {/* BLOCO 2 — Financeiro */}
              <div className="relative">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide mb-1.5">
                  <DollarSign className="h-3 w-3" /> 2. Recalcular Financeiro
                </div>
                {/* Warning about recalculation */}
                {finRecords.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 mb-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Os {finRecords.length} lançamento(s) existente(s) serão cancelados e substituídos.</span>
                  </div>
                )}
                {!compraZooSaved && (
                  <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] rounded-md flex items-center justify-center p-4">
                    <div className="text-center space-y-1">
                      <AlertTriangle className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Salve os dados zootécnicos primeiro
                      </p>
                    </div>
                  </div>
                )}
                <CompraFinanceiroPanel
                  quantidade={compraZooSaved ? Number(compraForm.quantidade) : lancamento.quantidade}
                  pesoKg={compraZooSaved ? (compraForm.pesoMedioKg || 0) : (lancamento.pesoMedioKg || 0)}
                  data={compraZooSaved ? compraForm.data : lancamento.data}
                  categoria={compraZooSaved ? compraForm.categoria : lancamento.categoria}
                  statusOp={(compraZooSaved ? (compraForm.statusOperacional || 'conciliado') : (lancamento.statusOperacional || 'conciliado')) as StatusOperacional}
                  fazendaOrigem={compraZooSaved ? (compraForm.fazendaOrigem || '') : (lancamento.fazendaOrigem || '')}
                  notaFiscal={notaFiscalEdit}
                  onNotaFiscalChange={setNotaFiscalEdit}
                  lancamentoId={lancamento.id}
                  mode="update"
                  onFinanceiroUpdated={() => {
                    setCompraEditSheetOpen(false);
                    loadFinRecords();
                  }}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Confirmation dialog for deletion */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                {financeiroCount > 0
                  ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                  : 'Deseja realmente excluir esta movimentação?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ===================== SIMPLE EDIT MODE (non-purchase types) =====================
  const isTransSaida = form.tipo === 'transferencia_saida';
  const isNascimento = form.tipo === 'nascimento';
  const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
  const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);
  const showOrigem = !isNascimento;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="font-bold text-foreground">Quantidade</Label>
                <Input type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-1" min="1" />
              </div>
            </div>
            <div>
              <Label className="font-bold text-foreground">Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as Categoria }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'reclassificacao' && (
              <div>
                <Label className="font-bold text-foreground">Categoria Destino</Label>
                <Select value={form.categoriaDestino || ''} onValueChange={v => setForm(f => ({ ...f, categoriaDestino: v as Categoria }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.filter(c => c.value !== form.categoria).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-foreground">Peso (kg)</Label>
                <Input type="number" value={form.pesoMedioKg || ''} onChange={e => setForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
              </div>
              <div>
                <Label className="font-bold text-foreground">Preço/Cab (R$)</Label>
                <Input type="number" value={form.precoMedioCabeca || ''} onChange={e => setForm(f => ({ ...f, precoMedioCabeca: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {showOrigem && (
                <div>
                  <Label className="font-bold text-foreground">Faz. Origem</Label>
                  {isSaidaAuto ? (
                    <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                  ) : (
                    <Input value={form.fazendaOrigem || ''} onChange={e => setForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-1" />
                  )}
                </div>
              )}
              <div>
                <Label className="font-bold text-foreground">
                  {form.tipo === 'morte' ? 'Motivo da Morte' : form.tipo === 'consumo' ? 'Motivo' : 'Faz. Destino'}
                </Label>
                {isEntradaAuto ? (
                  <Input value={nomeFazenda} readOnly className="mt-1 bg-muted cursor-not-allowed" />
                ) : isTransSaida && outrasFazendas.length > 0 ? (
                  <Select value={form.fazendaDestino || ''} onValueChange={v => setForm(f => ({ ...f, fazendaDestino: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                    <SelectContent>
                      {outrasFazendas.map(f => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.fazendaDestino || ''}
                    onChange={e => setForm(f => ({ ...f, fazendaDestino: e.target.value }))}
                    placeholder={form.tipo === 'morte' ? 'Ex: Raio, Picada de cobra' : form.tipo === 'consumo' ? 'Ex: Consumo interno' : 'Ex: Faz. Santa Cruz'}
                    className="mt-1"
                  />
                )}
              </div>
            </div>

            {/* Status Operacional */}
            <div>
              <Label className="font-bold text-foreground">Status</Label>
              <div className="flex gap-1 mt-1">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, statusOperacional: s.value }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                      (form.statusOperacional || 'conciliado') === s.value
                        ? `${s.bg} text-white border-transparent shadow-md`
                        : 'border-border text-muted-foreground bg-muted/30'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 touch-target" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button variant="destructive" className="touch-target" onClick={handleRemoverClick} disabled={checkingVinculos}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button className="flex-1 touch-target" onClick={handleSalvar}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {financeiroCount > 0
                ? `Esta movimentação possui ${financeiroCount} lançamento(s) financeiro(s) vinculado(s). Ao excluir, os lançamentos financeiros restantes também serão removidos.`
                : 'Deseja realmente excluir esta movimentação?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemover} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {financeiroCount > 0 ? 'Excluir tudo' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
