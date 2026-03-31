import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Pasto } from '@/hooks/usePastos';
import { CATEGORIAS, TIPOS_ENTRADA, TIPOS_SAIDA } from '@/types/cattle';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasto: Pasto;
  anoMes: string;
}

const TIPOS_MOV = [
  ...TIPOS_ENTRADA.map(t => ({ ...t, group: 'Entrada' })),
  ...TIPOS_SAIDA.map(t => ({ ...t, group: 'Saída' })),
];

export function MovimentarLoteDialog({ open, onOpenChange, pasto, anoMes }: Props) {
  const [tipo, setTipo] = useState('compra');
  const [categoria, setCategoria] = useState('bois');
  const [quantidade, setQuantidade] = useState('');
  const [pesoMedio, setPesoMedio] = useState('');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const qty = parseInt(quantidade);
    if (!qty || qty <= 0) { toast.error('Quantidade inválida'); return; }

    setSaving(true);
    const hoje = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from('lancamentos').insert({
      fazenda_id: pasto.fazenda_id,
      cliente_id: (pasto as any).cliente_id || '',
      data: hoje,
      tipo,
      categoria,
      quantidade: qty,
      peso_medio_kg: pesoMedio ? parseFloat(pesoMedio) : null,
      observacao: observacao || `Movimentação via Mapa - Pasto ${pasto.nome}`,
      status_operacional: 'confirmado',
    });

    setSaving(false);
    if (error) {
      toast.error('Erro ao registrar movimentação');
      console.error(error);
      return;
    }

    toast.success('Movimentação registrada');
    setQuantidade('');
    setPesoMedio('');
    setObservacao('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Movimentar Lote — {pasto.nome}</DialogTitle>
          <DialogDescription>Registre entrada ou saída de animais neste pasto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo de Movimentação</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_MOV.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Quantidade</Label>
              <Input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="Ex: 50" />
            </div>
            <div>
              <Label>Peso Médio (kg)</Label>
              <Input type="number" value={pesoMedio} onChange={e => setPesoMedio(e.target.value)} placeholder="Ex: 350" />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Registrando...' : 'Registrar Movimentação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
