import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';

interface Props {
  fazendaAtual: Fazenda | null;
}

export function CodigoFazendaField({ fazendaAtual }: Props) {
  const { reloadFazendas } = useFazenda();
  const [editing, setEditing] = useState(false);
  const [codigo, setCodigo] = useState(fazendaAtual?.codigo_importacao || '');
  const [saving, setSaving] = useState(false);

  const currentCode = fazendaAtual?.codigo_importacao;

  const handleSave = async () => {
    if (!fazendaAtual || !codigo.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('fazendas')
      .update({ codigo_importacao: codigo.trim().toUpperCase() })
      .eq('id', fazendaAtual.id);
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        toast.error('Este código já está em uso por outra fazenda.');
      } else {
        toast.error('Erro ao salvar código: ' + error.message);
      }
    } else {
      toast.success('Código da fazenda atualizado!');
      setEditing(false);
      await reloadFazendas();
    }
    setSaving(false);
  };

  if (!editing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">Código da Fazenda</Label>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground min-h-[36px] flex items-center px-3 py-2 rounded-md bg-muted/50 flex-1 uppercase">
            {currentCode || <span className="text-muted-foreground italic font-normal">Não definido</span>}
          </p>
          <Button variant="outline" size="sm" onClick={() => { setCodigo(currentCode || ''); setEditing(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Código usado na coluna "Fazenda" do Excel financeiro (ex: 3M, BG, ADM)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-muted-foreground">Código da Fazenda</Label>
      <div className="flex items-center gap-2">
        <Input
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          placeholder="Ex: 3M, BG, ADM"
          className="uppercase font-bold"
          maxLength={20}
        />
        <Button size="sm" onClick={handleSave} disabled={saving || !codigo.trim()}>
          <Save className="h-4 w-4 mr-1" /> {saving ? '...' : 'Salvar'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Deve ser único. Usado para vincular importações do Excel automaticamente.
      </p>
    </div>
  );
}
