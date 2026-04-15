import { useState, useMemo } from 'react';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, MapPin, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function PastoForm({ pasto, onSave, onCancel }: { pasto?: Pasto; onSave: (data: any) => void; onCancel: () => void }) {
  const { fazendaAtual } = useFazenda();
  const [nome, setNome] = useState(pasto?.nome || '');
  const [area, setArea] = useState(pasto?.area_produtiva_ha?.toString() || '');
  const [entraConciliacao, setEntraConciliacao] = useState(pasto?.entra_conciliacao ?? true);
  const [observacoes, setObservacoes] = useState(pasto?.observacoes || '');

  const handleSubmit = () => {
    if (!nome.trim()) return;
    onSave({
      fazenda_id: fazendaAtual?.id,
      nome: nome.trim(),
      area_produtiva_ha: area ? Number(area) : null,
      entra_conciliacao: entraConciliacao,
      observacoes: observacoes || null,
      ativo: pasto?.ativo ?? true,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Nome *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do pasto" className="h-10" />
      </div>
      <div>
        <Label>Área Produtiva (ha)</Label>
        <Input type="number" value={area} onChange={e => setArea(e.target.value)} placeholder="0" className="h-10" />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={entraConciliacao} onCheckedChange={setEntraConciliacao} />
        <Label>Entra na conciliação</Label>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações gerais..." />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} className="flex-1 h-10">{pasto ? 'Atualizar' : 'Criar Pasto'}</Button>
        <Button variant="outline" onClick={onCancel} className="h-10">Cancelar</Button>
      </div>
    </div>
  );
}

function SortablePastoCard({
  pasto,
  onEdit,
  onToggle,
}: {
  pasto: Pasto;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pasto.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 flex items-center gap-1.5 ${!pasto.ativo ? 'opacity-40' : ''}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-xs truncate flex-1 min-w-0">{pasto.nome}</span>
          {pasto.entra_conciliacao && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight shrink-0">Conc</Badge>
          )}
        </div>
        {pasto.area_produtiva_ha != null && (
          <span className="text-[10px] text-muted-foreground">{pasto.area_produtiva_ha} ha</span>
        )}
      </div>
      <button onClick={onEdit} className="text-muted-foreground hover:text-foreground shrink-0 p-0.5">
        <Edit2 className="h-3 w-3" />
      </button>
      <Switch checked={pasto.ativo} onCheckedChange={onToggle} className="scale-75 shrink-0" />
    </div>
  );
}

export function PastosTab() {
  const { pastos, loading, criarPasto, editarPasto, toggleAtivo, reorderPastos } = usePastos();
  const { isGlobal } = useFazenda();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPasto, setEditingPasto] = useState<Pasto | undefined>();
  const [showInativos, setShowInativos] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(
    () => (showInativos ? pastos : pastos.filter(p => p.ativo)),
    [pastos, showInativos],
  );

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para gerenciar pastos.</div>;

  const handleSave = async (data: any) => {
    const ok = editingPasto
      ? await editarPasto(editingPasto.id, data)
      : await criarPasto(data);
    if (ok) { setDialogOpen(false); setEditingPasto(undefined); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filtered.findIndex(p => p.id === active.id);
    const newIndex = filtered.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(filtered, oldIndex, newIndex);
    reorderPastos(reordered.map(p => p.id));
  };

  return (
    <div className="p-3 pb-20 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold">Pastos</h2>
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Switch checked={showInativos} onCheckedChange={setShowInativos} className="scale-75" />
            Inativos
          </label>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingPasto(undefined); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingPasto ? 'Editar Pasto' : 'Novo Pasto'}</DialogTitle></DialogHeader>
              <PastoForm pasto={editingPasto} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingPasto(undefined); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center text-muted-foreground py-8 text-xs">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhum pasto cadastrado</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(p => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {filtered.map(p => (
                <SortablePastoCard
                  key={p.id}
                  pasto={p}
                  onEdit={() => { setEditingPasto(p); setDialogOpen(true); }}
                  onToggle={(v) => toggleAtivo(p.id, v)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
