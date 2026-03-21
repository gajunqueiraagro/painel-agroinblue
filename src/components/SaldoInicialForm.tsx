import { useState } from 'react';
import { CATEGORIAS, Categoria, SaldoInicial } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';

interface Props {
  saldosIniciais: SaldoInicial[];
  onSetSaldo: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
}

export function SaldoInicialForm({ saldosIniciais, onSetSaldo }: Props) {
  const [open, setOpen] = useState(false);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === Number(ano) && s.categoria === c.value);
      v[c.value] = s ? String(s.quantidade) : '';
    });
    return v;
  });
  const [pesos, setPesos] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === Number(ano) && s.categoria === c.value);
      p[c.value] = s?.pesoMedioKg ? String(s.pesoMedioKg) : '';
    });
    return p;
  });

  const handleAnoChange = (novoAno: string) => {
    setAno(novoAno);
    const v: Record<string, string> = {};
    const p: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === Number(novoAno) && s.categoria === c.value);
      v[c.value] = s ? String(s.quantidade) : '';
      p[c.value] = s?.pesoMedioKg ? String(s.pesoMedioKg) : '';
    });
    setValores(v);
    setPesos(p);
  };

  const handleSalvar = () => {
    CATEGORIAS.forEach(c => {
      const qtd = valores[c.value] ? Number(valores[c.value]) : 0;
      const peso = pesos[c.value] ? Number(pesos[c.value]) : undefined;
      onSetSaldo(Number(ano), c.value, qtd, peso);
    });
    setOpen(false);
  };

  const anosOpcoes = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="touch-target">
          <Settings className="h-4 w-4 mr-1" /> Saldo Inicial
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Saldo Inicial do Ano</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="font-bold text-foreground">Ano</Label>
            <Select value={ano} onValueChange={handleAnoChange}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosOpcoes.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Informe a quantidade de cabeças no início do ano por categoria:</p>
          <div className="space-y-2">
            {CATEGORIAS.map(c => (
              <div key={c.value} className="space-y-1">
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      value={valores[c.value] || ''}
                      onChange={e => setValores(v => ({ ...v, [c.value]: e.target.value }))}
                      placeholder="Cab."
                      min="0"
                      className="text-center font-bold text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      value={pesos[c.value] || ''}
                      onChange={e => setPesos(p => ({ ...p, [c.value]: e.target.value }))}
                      placeholder="Peso kg"
                      min="0"
                      step="0.1"
                      className="text-center text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full touch-target font-bold" onClick={handleSalvar}>
            Salvar Saldo Inicial
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
