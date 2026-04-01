import { useState, useMemo, useCallback } from 'react';
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
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, RefreshCw } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { STATUS_OPTIONS, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';

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

  const tipoInfo = TODOS_TIPOS.find(t => t.value === lancamento.tipo);
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);

  // Transferências de entrada são somente leitura (criadas automaticamente)
  const isTransferenciaEntrada = lancamento.tipo === 'transferencia_entrada';

  const handleSalvar = () => {
    const isTransSaida = form.tipo === 'transferencia_saida';
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

  if (!editando) {
    const entrada = isEntrada(lancamento.tipo);
    const reclass = isReclassificacao(lancamento.tipo);
    const catDestinoInfo = lancamento.categoriaDestino
      ? CATEGORIAS.find(c => c.value === lancamento.categoriaDestino)
      : null;

    return (
      <><Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{tipoInfo?.icon}</span>
              {tipoInfo?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Data</p>
                <p className="font-bold text-foreground">
                  {format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Quantidade</p>
                <p className={`font-bold ${entrada ? 'text-success' : reclass ? 'text-foreground' : 'text-destructive'}`}>
                  {entrada ? '+' : reclass ? '' : '-'}{lancamento.quantidade} cab.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Categoria</p>
                <p className="font-bold text-foreground">{catInfo?.label}</p>
              </div>
              {catDestinoInfo && (
                <div>
                  <p className="text-muted-foreground">Categoria Destino</p>
                  <p className="font-bold text-foreground">{catDestinoInfo.label}</p>
                </div>
              )}
              {lancamento.pesoMedioKg && (
                <div>
                  <p className="text-muted-foreground">Peso Médio</p>
                  <p className="font-bold text-foreground">{lancamento.pesoMedioKg} kg ({lancamento.pesoMedioArrobas} @)</p>
                </div>
              )}
              {lancamento.precoMedioCabeca && (
                <div>
                  <p className="text-muted-foreground">Preço/Cabeça</p>
                  <p className="font-bold text-foreground">R$ {lancamento.precoMedioCabeca.toLocaleString('pt-BR')}</p>
                </div>
              )}
              {lancamento.fazendaOrigem && (
                <div>
                  <p className="text-muted-foreground">Fazenda Origem</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaOrigem}</p>
                </div>
              )}
              {lancamento.fazendaDestino && (
                <div>
                  <p className="text-muted-foreground">Fazenda Destino</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaDestino}</p>
                </div>
              )}
              {lancamento.precoMedioCabeca && lancamento.quantidade && (
                <div className="col-span-2 bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Valor Total</p>
                  <p className="font-extrabold text-foreground text-lg">
                    R$ {(lancamento.precoMedioCabeca * lancamento.quantidade).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
            {/* Audit info */}
            <div className="col-span-2 bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Histórico</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold">ID:</span> {lancamento.id.slice(0, 8)}
              </p>
              {lancamento.createdAt && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold">Criado:</span>{' '}
                  {format(parseISO(lancamento.createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  {lancamento.createdByNome && ` por ${lancamento.createdByNome}`}
                </p>
              )}
              {lancamento.updatedAt && lancamento.updatedAt !== lancamento.createdAt && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold">Editado:</span>{' '}
                  {format(parseISO(lancamento.updatedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  {lancamento.updatedByNome && ` por ${lancamento.updatedByNome}`}
                </p>
              )}
            </div>
            {isTransferenciaEntrada && (
              <div className="col-span-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  🔒 Transferência automática — só pode ser editada/removida na fazenda de origem.
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {!isTransferenciaEntrada && (
                <>
                  <Button variant="outline" className="flex-1 touch-target" onClick={() => { setForm({ ...lancamento }); setEditando(true); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  <Button variant="destructive" className="flex-1 touch-target" onClick={handleRemoverClick} disabled={checkingVinculos}>
                    <Trash2 className="h-4 w-4 mr-1" /> Apagar
                  </Button>
                </>
              )}
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

  // --- Edit mode ---
  const isTransSaida = form.tipo === 'transferencia_saida';
  const isNascimento = form.tipo === 'nascimento';
  const isSaidaAuto = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(form.tipo);
  const isEntradaAuto = ['nascimento', 'compra', 'transferencia_entrada'].includes(form.tipo);
  const showOrigem = !isNascimento;

  return (
    <><Dialog open={open} onOpenChange={onClose}>
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

          {/* Fazenda Origem / Destino com mesmas regras do formulário de criação */}
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
