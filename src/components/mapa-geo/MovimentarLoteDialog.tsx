import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePastoMovimentacoes, TIPOS_MOV_PASTO } from '@/hooks/usePastoMovimentacoes';
import { CATEGORIAS } from '@/types/cattle';
import type { Pasto } from '@/hooks/usePastos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasto: Pasto;
  anoMes: string;
  allPastos: Pasto[];
  onSaved?: () => void;
}

export function MovimentarLoteDialog({ open, onOpenChange, pasto, anoMes, allPastos, onSaved }: Props) {
  const { registrarMovimentacao } = usePastoMovimentacoes();
  const [tipo, setTipo] = useState('entrada');
  const [categoria, setCategoria] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [pesoMedio, setPesoMedio] = useState('');
  const [refRebanho, setRefRebanho] = useState('');
  const [pastoDestinoId, setPastoDestinoId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [dataMov, setDataMov] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const isTransferencia = tipo === 'transferencia';
  const isSaida = ['saida', 'venda', 'abate', 'morte', 'consumo'].includes(tipo);
  const isEntrada = ['entrada', 'compra'].includes(tipo);

  const otherPastos = allPastos.filter(p => p.id !== pasto.id && p.ativo);

  const handleSave = async () => {
    const qty = parseInt(quantidade);
    if (!qty || qty <= 0) { return; }

    if (isTransferencia && !pastoDestinoId) { return; }

    setSaving(true);
    const success = await registrarMovimentacao({
      fazenda_id: pasto.fazenda_id,
      cliente_id: (pasto as any).cliente_id || '',
      pasto_origem_id: (isSaida || isTransferencia) ? pasto.id : null,
      pasto_destino_id: isTransferencia ? pastoDestinoId : isEntrada ? pasto.id : null,
      data: dataMov,
      tipo,
      quantidade: qty,
      categoria: categoria || null,
      peso_medio_kg: pesoMedio ? parseFloat(pesoMedio) : null,
      referencia_rebanho: refRebanho || null,
      observacoes: observacao || null,
    });

    setSaving(false);
    if (success) {
      setQuantidade('');
      setPesoMedio('');
      setRefRebanho('');
      setObservacao('');
      setPastoDestinoId('');
      onSaved?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <DialogTitle>Movimentação — {pasto.nome}</DialogTitle>
          <DialogDescription>Registrar movimentação de animais.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          <div>
            <Label>Data</Label>
            <Input type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_MOV_PASTO.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isTransferencia && (
            <div>
              <Label>Pasto Destino</Label>
              <Select value={pastoDestinoId} onValueChange={setPastoDestinoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o pasto destino" /></SelectTrigger>
                <SelectContent>
                  {otherPastos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Quantidade *</Label>
              <Input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="50" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Peso Médio (kg)</Label>
              <Input type="number" value={pesoMedio} onChange={e => setPesoMedio(e.target.value)} placeholder="350" />
            </div>
            <div>
              <Label>Ref. Rebanho</Label>
              <Input value={refRebanho} onChange={e => setRefRebanho(e.target.value)} placeholder="Ex: Lote A" />
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
          </div>
        </div>
        {/* Sticky footer */}
        <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || !quantidade}>
            {saving ? 'Registrando...' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
