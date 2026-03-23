import { useState } from 'react';
import { usePastos, TIPOS_USO, type Pasto } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, MapPin } from 'lucide-react';

function PastoForm({ pasto, onSave, onCancel }: { pasto?: Pasto; onSave: (data: any) => void; onCancel: () => void }) {
  const { fazendaAtual } = useFazenda();
  const [nome, setNome] = useState(pasto?.nome || '');
  const [lotePadrao, setLotePadrao] = useState(pasto?.lote_padrao || '');
  const [area, setArea] = useState(pasto?.area_produtiva_ha?.toString() || '');
  const [tipoUso, setTipoUso] = useState(pasto?.tipo_uso || 'recria');
  const [qualidade, setQualidade] = useState(pasto?.qualidade?.toString() || '');
  const [entraConciliacao, setEntraConciliacao] = useState(pasto?.entra_conciliacao ?? true);
  const [observacoes, setObservacoes] = useState(pasto?.observacoes || '');

  const handleSubmit = () => {
    if (!nome.trim()) return;
    onSave({
      fazenda_id: fazendaAtual?.id,
      nome: nome.trim(),
      lote_padrao: lotePadrao || null,
      area_produtiva_ha: area ? Number(area) : null,
      tipo_uso: tipoUso,
      qualidade: qualidade ? Number(qualidade) : null,
      entra_conciliacao: entraConciliacao,
      observacoes: observacoes || null,
      ativo: pasto?.ativo ?? true,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Nome *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do pasto" className="h-12 text-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Lote Padrão</Label>
          <Input value={lotePadrao} onChange={e => setLotePadrao(e.target.value)} placeholder="Ex: L01" className="h-12" />
        </div>
        <div>
          <Label>Área (ha)</Label>
          <Input type="number" value={area} onChange={e => setArea(e.target.value)} placeholder="0" className="h-12" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tipo de Uso</Label>
          <Select value={tipoUso} onValueChange={setTipoUso}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_USO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Qualidade (1-10)</Label>
          <Input type="number" min={1} max={10} value={qualidade} onChange={e => setQualidade(e.target.value)} placeholder="1-10" className="h-12" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={entraConciliacao} onCheckedChange={setEntraConciliacao} />
        <Label>Entra na conciliação</Label>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações..." />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} className="flex-1 h-12">{pasto ? 'Atualizar' : 'Criar Pasto'}</Button>
        <Button variant="outline" onClick={onCancel} className="h-12">Cancelar</Button>
      </div>
    </div>
  );
}

export function PastosTab() {
  const { pastos, loading, criarPasto, editarPasto, toggleAtivo } = usePastos();
  const { isGlobal } = useFazenda();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPasto, setEditingPasto] = useState<Pasto | undefined>();
  const [showInativos, setShowInativos] = useState(false);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para gerenciar pastos.</div>;

  const filtered = showInativos ? pastos : pastos.filter(p => p.ativo);

  const handleSave = async (data: any) => {
    const ok = editingPasto
      ? await editarPasto(editingPasto.id, data)
      : await criarPasto(data);
    if (ok) { setDialogOpen(false); setEditingPasto(undefined); }
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Pastos</h2>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Switch checked={showInativos} onCheckedChange={setShowInativos} />
            Inativos
          </label>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingPasto(undefined); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingPasto ? 'Editar Pasto' : 'Novo Pasto'}</DialogTitle></DialogHeader>
              <PastoForm pasto={editingPasto} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingPasto(undefined); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>Nenhum pasto cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className={`rounded-lg border p-4 ${!p.ativo ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {p.nome}
                    {p.entra_conciliacao && <Badge variant="outline" className="text-xs">Conciliação</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground flex gap-3 mt-1">
                    <span>{TIPOS_USO.find(t => t.value === p.tipo_uso)?.label || p.tipo_uso}</span>
                    {p.area_produtiva_ha && <span>{p.area_produtiva_ha} ha</span>}
                    {p.qualidade && <span>Q: {p.qualidade}/10</span>}
                    {p.lote_padrao && <span>Lote: {p.lote_padrao}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEditingPasto(p); setDialogOpen(true); }}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Switch checked={p.ativo} onCheckedChange={(v) => toggleAtivo(p.id, v)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
