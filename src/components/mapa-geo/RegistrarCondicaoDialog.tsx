import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePastoCondicoes } from '@/hooks/usePastoCondicoes';
import type { Pasto } from '@/hooks/usePastos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasto: Pasto;
}

const CONDICOES = [
  { value: 'bom', label: '🟢 Bom' },
  { value: 'regular', label: '🟡 Regular' },
  { value: 'ruim', label: '🔴 Ruim' },
];

export function RegistrarCondicaoDialog({ open, onOpenChange, pasto }: Props) {
  const { registrarCondicao, condicoes, loadCondicoes, loading } = usePastoCondicoes();
  const [condicao, setCondicao] = useState('bom');
  const [alturaCm, setAlturaCm] = useState('');
  const [coberturaPerc, setCoberturaPerc] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = (v: boolean) => {
    onOpenChange(v);
    if (v) loadCondicoes(pasto.id);
  };

  const handleSave = async () => {
    setSaving(true);
    await registrarCondicao({
      pasto_id: pasto.id,
      fazenda_id: pasto.fazenda_id,
      cliente_id: (pasto as any).cliente_id || '',
      condicao,
      altura_pasto_cm: alturaCm ? parseFloat(alturaCm) : null,
      cobertura_perc: coberturaPerc ? parseFloat(coberturaPerc) : null,
      observacoes: obs || null,
    });
    setSaving(false);
    setCondicao('bom');
    setAlturaCm('');
    setCoberturaPerc('');
    setObs('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar Condição — {pasto.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Condição</Label>
            <Select value={condicao} onValueChange={setCondicao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDICOES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Altura (cm)</Label>
              <Input type="number" value={alturaCm} onChange={e => setAlturaCm(e.target.value)} placeholder="Ex: 25" />
            </div>
            <div>
              <Label>Cobertura (%)</Label>
              <Input type="number" value={coberturaPerc} onChange={e => setCoberturaPerc(e.target.value)} placeholder="Ex: 80" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
          </div>

          {/* Recent conditions */}
          {condicoes.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Últimos registros:</p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {condicoes.slice(0, 5).map(c => (
                  <div key={c.id} className="flex justify-between text-xs">
                    <span>{c.data_registro}</span>
                    <span className="font-medium">{CONDICOES.find(x => x.value === c.condicao)?.label || c.condicao}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar Condição'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
