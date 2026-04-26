import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Save, X, Pencil, Building2, Check, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ClienteRow {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  created_at: string;
}

interface EditingState {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

export function ClientesTab() {
  const { isAdmin } = useCliente();
  const { isManager } = usePermissions();
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const { reloadClientes } = useCliente();

  const loadClientes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome');
    if (error) {
      toast.error('Erro ao carregar clientes');
    } else {
      setClientes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadClientes(); }, [loadClientes]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNomeChange = (value: string) => {
    setNome(value);
    setSlug(generateSlug(value));
  };

  const handleCreate = async () => {
    if (saving) return;
    if (!nome.trim() || !slug.trim()) {
      toast.error('Nome e identificador são obrigatórios.');
      return;
    }
    setSaving(true);

    // 1. Criar cliente
    const { data: novoCliente, error } = await supabase
      .from('clientes')
      .insert({ nome: nome.trim(), slug: slug.trim() })
      .select('id')
      .single();

    if (error || !novoCliente) {
      if (error?.message.includes('duplicate') || error?.message.includes('unique')) {
        toast.error('Já existe um cliente com este identificador.');
      } else {
        toast.error('Erro ao criar cliente: ' + (error?.message || 'desconhecido'));
      }
      setSaving(false);
      return;
    }

    const clienteId = novoCliente.id;
    const userId = (await supabase.auth.getUser()).data.user?.id;

    // 2. Criar fazenda Administrativo + vincular usuário como admin
    const promises: Promise<any>[] = [];

    const [fazRes, memRes] = await Promise.all([
      supabase.from('fazendas').insert({
        nome: 'Administrativo',
        cliente_id: clienteId,
        tem_pecuaria: false,
        owner_id: userId!,
      }).select(),
      supabase.from('cliente_membros').insert({
        cliente_id: clienteId,
        user_id: userId!,
        perfil: 'admin_agroinblue',
      }).select(),
    ]);

    const results = [fazRes, memRes];
    const erros = results.filter(r => r.error);

    if (erros.length > 0) {
      console.error('Erros no bootstrap:', erros.map(r => r.error));
      toast.warning('Cliente criado, mas houve erros na configuração automática.');
    } else {
      toast.success('Cliente criado e configurado com sucesso!');
    }

    setNome('');
    setSlug('');
    setShowForm(false);
    await loadClientes();
    await reloadClientes();
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (saving) return;
    if (!editing || !editing.nome.trim() || !editing.slug.trim()) {
      toast.error('Nome e identificador são obrigatórios.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('clientes')
      .update({
        nome: editing.nome.trim(),
        slug: editing.slug.trim(),
        ativo: editing.ativo,
      })
      .eq('id', editing.id);

    if (error) {
      toast.error('Erro ao atualizar: ' + error.message);
    } else {
      toast.success('Cliente atualizado!');
      setEditing(null);
      await loadClientes();
      await reloadClientes();
    }
    setSaving(false);
  };

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');

  const handleDelete = async (clienteId: string, clienteNome: string) => {
    if (confirmDelete !== clienteNome) {
      toast.error('Digite o nome exato do cliente para confirmar.');
      return;
    }
    setDeleting(true);

    // Delete in order: fazenda_membros → fazendas → cliente_membros → cliente
    const { data: fazendas } = await supabase
      .from('fazendas')
      .select('id')
      .eq('cliente_id', clienteId);

    const fazendaIds = (fazendas || []).map(f => f.id);

    if (fazendaIds.length > 0) {
      await supabase.from('fazenda_membros').delete().in('fazenda_id', fazendaIds);
      await supabase.from('fazendas').delete().eq('cliente_id', clienteId);
    }

    await supabase.from('cliente_membros').delete().eq('cliente_id', clienteId);

    const { error } = await supabase.from('clientes').delete().eq('id', clienteId);

    if (error) {
      toast.error('Erro ao apagar cliente: ' + error.message);
    } else {
      toast.success('Cliente apagado com sucesso!');
      setEditing(null);
      setConfirmDelete('');
      await loadClientes();
      await reloadClientes();
    }
    setDeleting(false);
  };

  if (!isAdmin) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Apenas administradores podem gerenciar clientes.
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground text-sm">Carregando clientes...</div>;
  }

  return (
    <div className="space-y-3">
      {clientes.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum cliente cadastrado.
        </p>
      )}

      {clientes.map(c => {
        const isEditing = editing?.id === c.id;

        if (isEditing) {
          return (
            <Card key={c.id} className="border-2 border-primary/40">
              <CardContent className="p-3 space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Nome</Label>
                  <Input
                    value={editing.nome}
                    onChange={e => setEditing({ ...editing, nome: e.target.value })}
                    className="h-9 text-sm font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Identificador (slug)</Label>
                  <Input
                    value={editing.slug}
                    onChange={e => setEditing({ ...editing, slug: e.target.value })}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.ativo}
                    onCheckedChange={v => setEditing({ ...editing, ativo: v })}
                  />
                  <Label className="text-xs font-semibold text-muted-foreground">
                    {editing.ativo ? 'Ativo' : 'Inativo'}
                  </Label>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleUpdate} disabled={saving} className="flex-1">
                    <Save className="h-4 w-4 mr-1" /> {saving ? '...' : 'Salvar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(null); setConfirmDelete(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <Separator className="my-3" />

                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-xs font-bold">Zona Perigosa</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Apagar o cliente remove todas as fazendas, membros e dados vinculados. Esta ação é irreversível.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Digite <span className="font-bold text-foreground">{editing.nome}</span> para confirmar
                    </Label>
                    <Input
                      value={confirmDelete}
                      onChange={e => setConfirmDelete(e.target.value)}
                      placeholder={editing.nome}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    disabled={deleting || confirmDelete !== editing.nome}
                    onClick={() => handleDelete(editing.id, editing.nome)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> {deleting ? 'Apagando...' : 'Apagar Cliente Permanentemente'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card key={c.id} className="transition-all">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{c.nome}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-mono">{c.slug}</Badge>
                    <Badge variant={c.ativo ? 'default' : 'destructive'} className="text-xs">
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setEditing({
                  id: c.id,
                  nome: c.nome,
                  slug: c.slug,
                  ativo: c.ativo,
                })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {/* New client form */}
      {showForm && (
        <Card className="border-2 border-dashed border-primary/40">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-bold">Novo Cliente</p>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Nome *</Label>
              <Input
                value={nome}
                onChange={e => handleNomeChange(e.target.value)}
                placeholder="Ex: Fazenda São João Ltda"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Identificador (slug) *</Label>
              <Input
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="fazenda-sao-joao"
                className="h-9 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Gerado automaticamente a partir do nome
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={saving || !nome.trim()} className="flex-1">
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Criando...' : 'Criar Cliente'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setNome(''); setSlug(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && (
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Adicionar Cliente
        </Button>
      )}
    </div>
  );
}
