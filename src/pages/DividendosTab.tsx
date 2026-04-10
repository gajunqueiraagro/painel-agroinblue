import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function DividendosTab() {
  const { clienteAtual } = useCliente();
  const [items, setItems] = useState<Dividendo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Dividendo | null>(null);
  const [nome, setNome] = useState('');
  const [showInativos, setShowInativos] = useState(false);

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

  const filtered = showInativos ? items : items.filter(i => i.ativo);

  const handleSave = async () => {
    if (!clienteAtual?.id || !nome.trim()) return;
    if (editItem) {
      const { error } = await supabase
        .from('financeiro_dividendos')
        .update({ nome: nome.trim() })
        .eq('id', editItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Dividendo atualizado');
    } else {
      const maxOrdem = items.reduce((m, i) => Math.max(m, i.ordem_exibicao), -1);
      const { error } = await supabase
        .from('financeiro_dividendos')
        .insert({ cliente_id: clienteAtual.id, nome: nome.trim(), ordem_exibicao: maxOrdem + 1 });
      if (error) { toast.error(error.message); return; }
      toast.success('Dividendo criado');
    }
    setDialogOpen(false);
    setEditItem(null);
    setNome('');
    load();
  };

  const toggleAtivo = async (item: Dividendo, ativo: boolean) => {
    await supabase.from('financeiro_dividendos').update({ ativo }).eq('id', item.id);
    load();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filtered.findIndex(i => i.id === active.id);
    const newIndex = filtered.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(filtered, oldIndex, newIndex);
    setItems(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      reordered.forEach((r, i) => { const p = map.get(r.id); if (p) p.ordem_exibicao = i; });
      return [...prev].sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
    });

    const updates = reordered.map((r, i) =>
      supabase.from('financeiro_dividendos').update({ ordem_exibicao: i }).eq('id', r.id)
    );
    await Promise.all(updates);
  };

  const openNew = () => { setEditItem(null); setNome(''); setDialogOpen(true); };
  const openEdit = (item: Dividendo) => { setEditItem(item); setNome(item.nome); setDialogOpen(true); };

  return (
    <div className="w-full p-3 pb-20 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-foreground">Dividendos</h2>
          <p className="text-[9px] text-muted-foreground">Cadastro de nomes para distribuição de dividendos</p>
        </div>
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
            <Button onClick={handleSave} disabled={!nome.trim()} className="w-full">
              {editItem ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
