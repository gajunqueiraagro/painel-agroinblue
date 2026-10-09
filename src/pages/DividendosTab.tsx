import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import {
  FN_DIVIDENDO,
  fraseDoQueSegura,
  lerRespostaDoDividendo,
  ordemCompleta,
  type RespostaDoDividendo,
} from '@/lib/financeiro/dividendosCadastro';

interface Dividendo {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
  ordem_exibicao: number;
}

function SortableRow({ item, onEdit, onToggle }: {
  item: Dividendo;
  onEdit: () => void;
  onToggle: (ativo: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 px-2 py-1 rounded border bg-card ${!item.ativo ? 'opacity-50' : ''}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="text-[11px] font-medium flex-1">{item.nome}</span>
      <Badge variant={item.ativo ? 'default' : 'secondary'} className="text-[8px] px-1 py-0 leading-none">
        {item.ativo ? 'Ativo' : 'Inativo'}
      </Badge>
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onEdit}>
        <Pencil className="h-3 w-3" />
      </Button>
      <Switch checked={item.ativo} onCheckedChange={onToggle} className="h-3.5 w-6" />
    </div>
  );
}

/* DIVIDENDO-ESCRITOR-UNICO-01: a tela NÃO escreve em `financeiro_dividendos` (o banco recusa). Cada gesto chama a função
   do escritor único, que mexe no cadastro e na conta do plano na mesma transação; a recusa fica ESCRITA, nunca em toast. */
async function chamarDividendo(fn: string, args: Record<string, unknown>): Promise<RespostaDoDividendo> {
  const { data, error } = await (supabase as any).rpc(fn, args);
  return lerRespostaDoDividendo(data, error);
}

export function DividendosTab() {
  const { clienteAtual } = useCliente();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Dividendo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Dividendo | null>(null);
  const [nome, setNome] = useState('');
  const [showInativos, setShowInativos] = useState(false);
  /* a recusa do gesto: no formulário (criar / renomear), na lista (ativar, inativar, reordenar) e na confirmação */
  const [recadoDoForm, setRecadoDoForm] = useState('');
  const [recadoDaLista, setRecadoDaLista] = useState('');
  const [recadoDaConfirmacao, setRecadoDaConfirmacao] = useState('');
  const [aInativar, setAInativar] = useState<{ item: Dividendo; seguram: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_dividendos')
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('ordem_exibicao');
    setItems((data as Dividendo[]) || []);
    setLoading(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  /* depois de gravar: a lista relê, e quem mostra o plano ou os lançamentos relê sem F5 */
  const aposGravar = useCallback((clienteId: string) => {
    load();
    queryClient.invalidateQueries({ queryKey: ['fin-classificacoes-plano', clienteId] });
    notificarLancamentosMudaram(clienteId);
  }, [load, queryClient]);

  const filtered = showInativos ? items : items.filter(i => i.ativo);

  const handleSave = async () => {
    if (isSaving) return;
    if (!clienteAtual?.id || !nome.trim()) return;
    setIsSaving(true);
    setRecadoDoForm('');
    try {
      const r = editItem
        ? await chamarDividendo(FN_DIVIDENDO.renomear, { p_id: editItem.id, p_nome: nome.trim(), p_simular: false })
        : await chamarDividendo(FN_DIVIDENDO.criar, { p_cliente_id: clienteAtual.id, p_nome: nome.trim(), p_simular: false });
      if (r.ok === false) { setRecadoDoForm(r.frase); return; }
      if (editItem) {
        toast.success('Dividendo atualizado', r.lancamentosTocados > 0
          ? { description: `${r.lancamentosTocados} lançamento(s) receberam o nome novo.` }
          : undefined);
      } else {
        toast.success('Dividendo criado');
      }
      setDialogOpen(false);
      setEditItem(null);
      setNome('');
      aposGravar(clienteAtual.id);
    } finally {
      setIsSaving(false);
    }
  };

  const inativar = async (item: Dividendo) => {
    const r = await chamarDividendo(FN_DIVIDENDO.inativar, { p_id: item.id, p_simular: false });
    if (r.ok === false) return r.frase;
    setAInativar(null);
    aposGravar(item.cliente_id);
    return '';
  };

  const toggleAtivo = async (item: Dividendo, ativo: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    setRecadoDaLista('');
    try {
      if (ativo) {
        const r = await chamarDividendo(FN_DIVIDENDO.reativar, { p_id: item.id, p_simular: false });
        if (r.ok === false) { setRecadoDaLista(r.frase); return; }
        aposGravar(item.cliente_id);
        return;
      }
      /* inativar: o banco diz ANTES quantos lançamentos seguram a conta no plano */
      const previa = await chamarDividendo(FN_DIVIDENDO.inativar, { p_id: item.id, p_simular: true });
      if (previa.ok === false) { setRecadoDaLista(previa.frase); return; }
      if (previa.lancamentosQueSeguram > 0) {
        setRecadoDaConfirmacao('');
        setAInativar({ item, seguram: previa.lancamentosQueSeguram });
        return;
      }
      setRecadoDaLista(await inativar(item));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmarInativar = async () => {
    if (!aInativar || isSaving) return;
    setIsSaving(true);
    try {
      setRecadoDaConfirmacao(await inativar(aInativar.item));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !clienteAtual?.id) return;
    const oldIndex = filtered.findIndex(i => i.id === active.id);
    const newIndex = filtered.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    /* UMA chamada, com a lista inteira do cliente (os escondidos ficam onde estavam) */
    const ids = ordemCompleta(items, arrayMove(filtered, oldIndex, newIndex));
    const porId = new Map(items.map(p => [p.id, p]));
    setItems(ids.flatMap((id, i) => { const p = porId.get(id); return p ? [{ ...p, ordem_exibicao: i }] : []; }));
    setRecadoDaLista('');
    const r = await chamarDividendo(FN_DIVIDENDO.reordenar, { p_cliente_id: clienteAtual.id, p_ids: ids, p_simular: false });
    if (r.ok === false) { setRecadoDaLista(r.frase); load(); }
  };

  const openNew = () => { setEditItem(null); setNome(''); setRecadoDoForm(''); setDialogOpen(true); };
  const openEdit = (item: Dividendo) => { setEditItem(item); setNome(item.nome); setRecadoDoForm(''); setDialogOpen(true); };

  return (
    <div className="w-full p-3 pb-20 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-foreground">Dividendos</h2>
          <p className="text-[9px] text-muted-foreground">Cadastro de nomes para distribuição de dividendos</p>
        </div>
        {/* o lugar da recusa da lista existe sempre: ativar, inativar e reordenar escrevem aqui, ao lado dos botões */}
        <p
          data-testid="dividendo-recado-lista"
          role="status"
          title={recadoDaLista || undefined}
          className="flex-1 min-w-0 truncate text-right text-[10px] text-destructive"
        >
          {recadoDaLista}
        </p>
        <div className="flex items-center gap-2">
          {items.some(i => !i.ativo) && (
            <div className="flex items-center gap-1">
              <Switch id="show-inativos" checked={showInativos} onCheckedChange={setShowInativos} className="h-3.5 w-6" />
              <Label htmlFor="show-inativos" className="text-[9px] text-muted-foreground cursor-pointer">Inativos</Label>
            </div>
          )}
          <Button size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={openNew}>
            <Plus className="h-3 w-3" /> Novo
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-2 space-y-0.5">
          {loading && <p className="text-xs text-muted-foreground text-center py-8">Carregando...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum dividendo cadastrado</p>
          )}
          {!loading && filtered.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {filtered.map(item => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    onEdit={() => openEdit(item)}
                    onToggle={(v) => toggleAtivo(item, v)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Esses nomes serão usados como subcentros dinâmicos em Despesa › Distribuição › Dividendos
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Dividendo' : 'Novo Dividendo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Higino"
                className="h-9"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <Button onClick={handleSave} disabled={!nome.trim() || isSaving} className="w-full">
              {editItem ? 'Salvar' : 'Criar'}
            </Button>
            {/* o lugar da recusa existe sempre, sob o botão: o formulário não muda de altura quando ela aparece */}
            <p data-testid="dividendo-recado-form" role="status" className="min-h-[26px] text-[10px] leading-[13px] text-destructive">
              {recadoDoForm}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aInativar} onOpenChange={(aberto) => { if (!aberto) setAInativar(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Inativar {aInativar?.item.nome}?</AlertDialogTitle>
            <AlertDialogDescription data-testid="dividendo-quem-segura" className="text-xs">
              {aInativar ? fraseDoQueSegura(aInativar.seguram) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p data-testid="dividendo-recado-confirmacao" role="status" className="min-h-[26px] text-[10px] leading-[13px] text-destructive">
            {recadoDaConfirmacao}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-xs">Voltar</AlertDialogCancel>
            <Button size="sm" className="h-7 text-xs" disabled={isSaving} onClick={confirmarInativar}>
              Inativar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
