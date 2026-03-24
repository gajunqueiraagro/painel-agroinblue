/**
 * Módulo de gestão de fazendas: lista, criação e edição inline.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, X, Pencil, Check, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface EditingState {
  id: string;
  nome: string;
  codigo_importacao: string;
}

export function FazendasList() {
  const { fazendas, fazendaAtual, setFazendaAtual, criarFazenda, reloadFazendas } = useFazenda();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);

  // New fazenda form state
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');

  const handleCreate = async () => {
    if (!nome.trim() || !codigo.trim()) {
      toast.error('Nome e Código são obrigatórios.');
      return;
    }
    setSaving(true);
    const result = await criarFazenda(nome.trim(), codigo.trim().toUpperCase());
    if (result) {
      setNome('');
      setCodigo('');
      setShowForm(false);
      toast.success('Fazenda criada com sucesso!');
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editing || !editing.nome.trim() || !editing.codigo_importacao.trim()) {
      toast.error('Nome e Código são obrigatórios.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('fazendas')
      .update({
        nome: editing.nome.trim(),
        codigo_importacao: editing.codigo_importacao.trim().toUpperCase(),
      })
      .eq('id', editing.id);

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        toast.error('Este código já está em uso por outra fazenda.');
      } else {
        toast.error('Erro ao atualizar: ' + error.message);
      }
    } else {
      toast.success('Fazenda atualizada!');
      setEditing(null);
      await reloadFazendas();
    }
    setSaving(false);
  };

  // Filter out global
  const listaFazendas = fazendas.filter(f => f.id !== '__global__');

  return (
    <div className="space-y-3">
      {/* Lista */}
      {listaFazendas.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma fazenda cadastrada.
        </p>
      )}

      {listaFazendas.map(f => {
        const isEditing = editing?.id === f.id;
        const isActive = fazendaAtual?.id === f.id;

        if (isEditing) {
          return (
            <Card key={f.id} className="border-2 border-primary/40">
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
                  <Label className="text-xs font-semibold text-muted-foreground">Código</Label>
                  <Input
                    value={editing.codigo_importacao}
                    onChange={e => setEditing({ ...editing, codigo_importacao: e.target.value })}
                    className="h-9 text-sm font-bold uppercase"
                    maxLength={20}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleUpdate} disabled={saving} className="flex-1">
                    <Save className="h-4 w-4 mr-1" /> {saving ? '...' : 'Salvar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card
            key={f.id}
            className={`cursor-pointer transition-all ${isActive ? 'border-primary/60 bg-primary/5' : 'hover:border-primary/30'}`}
            onClick={() => setFazendaAtual(f)}
          >
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Building2 className={`h-5 w-5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{f.nome}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {f.codigo_importacao || '—'}
                    </Badge>
                    {isActive && (
                      <span className="text-xs text-primary font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ativa
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={e => {
                  e.stopPropagation();
                  setEditing({
                    id: f.id,
                    nome: f.nome,
                    codigo_importacao: f.codigo_importacao || '',
                  });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {/* Formulário de nova fazenda */}
      {showForm && (
        <Card className="border-2 border-dashed border-primary/40">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-bold">Nova Fazenda</p>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Nome da Fazenda *</Label>
              <Input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Faz. 3 Muchachas"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Código da Fazenda *</Label>
              <Input
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="Ex: 3M, BG, ADM"
                className="h-9 text-sm uppercase"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Código único usado na coluna "Fazenda" do Excel financeiro
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={saving || !nome.trim() || !codigo.trim()} className="flex-1">
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Criando...' : 'Criar Fazenda'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setNome(''); setCodigo(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão adicionar */}
      {!showForm && (
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" /> Adicionar Fazenda
        </Button>
      )}
    </div>
  );
}
