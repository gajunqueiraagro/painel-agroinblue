import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, SaldoInicial } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Pencil, AlertTriangle, Plus } from 'lucide-react';

interface Props {
  saldosIniciais: SaldoInicial[];
  onSetSaldo: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
  /** The year for the initial balance (January of this year) */
  anoBase?: number;
}

/**
 * Saldo Inicial — one per fazenda, always January.
 * Shows a warning banner when no saldo exists, or a discrete edit button when it does.
 */
export function SaldoInicialForm({ saldosIniciais, onSetSaldo, anoBase }: Props) {
  // Determine the single year for this fazenda's saldo inicial
  const anoSaldo = useMemo(() => {
    if (anoBase) return anoBase;
    // Use the earliest year that has saldo, or current year
    const anos = saldosIniciais.map(s => s.ano);
    if (anos.length > 0) return Math.min(...anos);
    return new Date().getFullYear();
  }, [saldosIniciais, anoBase]);

  const hasSaldo = useMemo(() => {
    return saldosIniciais.some(s => s.ano === anoSaldo && s.quantidade > 0);
  }, [saldosIniciais, anoSaldo]);

  const [open, setOpen] = useState(false);

  const [valores, setValores] = useState<Record<string, string>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});

  // Sync form state when dialog opens or saldos change
  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    const p: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === anoSaldo && s.categoria === c.value);
      v[c.value] = s ? String(s.quantidade) : '';
      p[c.value] = s?.pesoMedioKg ? String(s.pesoMedioKg) : '';
    });
    setValores(v);
    setPesos(p);
  }, [open, saldosIniciais, anoSaldo]);

  const handleSalvar = () => {
    CATEGORIAS.forEach(c => {
      const qtd = valores[c.value] ? Number(valores[c.value]) : 0;
      const peso = pesos[c.value] ? Number(pesos[c.value]) : undefined;
      onSetSaldo(anoSaldo, c.value, qtd, peso);
    });
    setOpen(false);
  };

  // Warning banner when no saldo exists
  if (!hasSaldo) {
    return (
      <div className="mx-2 my-2 flex items-center gap-2 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
        <p className="text-xs text-orange-700 dark:text-orange-400 flex-1">
          Defina o saldo inicial para iniciar o controle do rebanho (Jan/{anoSaldo})
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default" className="h-7 text-xs gap-1 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Cadastrar
            </Button>
          </DialogTrigger>
          <SaldoInicialDialogContent
            anoSaldo={anoSaldo}
            valores={valores}
            pesos={pesos}
            setValores={setValores}
            setPesos={setPesos}
            onSalvar={handleSalvar}
          />
        </Dialog>
      </div>
    );
  }

  // Discrete edit button when saldo already exists
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
          <Pencil className="h-3 w-3" /> Saldo Inicial (Jan/{anoSaldo})
        </Button>
      </DialogTrigger>
      <SaldoInicialDialogContent
        anoSaldo={anoSaldo}
        valores={valores}
        pesos={pesos}
        setValores={setValores}
        setPesos={setPesos}
        onSalvar={handleSalvar}
      />
    </Dialog>
  );
}

// Extracted dialog content to avoid duplication
function SaldoInicialDialogContent({
  anoSaldo,
  valores,
  pesos,
  setValores,
  setPesos,
  onSalvar,
}: {
  anoSaldo: number;
  valores: Record<string, string>;
  pesos: Record<string, string>;
  setValores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPesos: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSalvar: () => void;
}) {
  return (
    <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Saldo Inicial — Janeiro/{anoSaldo}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Informe a quantidade de cabeças e peso médio (kg) no início de Janeiro/{anoSaldo} por categoria:
        </p>
        <div className="space-y-2">
          {CATEGORIAS.map((c, i) => {
            const isSeparator = c.value === 'mamotes_f';
            return (
              <div key={c.value} className={`space-y-1 ${isSeparator ? 'border-t border-border pt-2' : ''}`}>
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
            );
          })}
        </div>
        <Button className="w-full touch-target font-bold" onClick={onSalvar}>
          Salvar Saldo Inicial
        </Button>
      </div>
    </DialogContent>
  );
}
