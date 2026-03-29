import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, SaldoInicial } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Pencil, AlertTriangle, Plus } from 'lucide-react';

interface Props {
  saldosIniciais: SaldoInicial[];
  onSetSaldo: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
  /** Current year being viewed — form only renders if this matches the earliest year */
  anoBase?: number;
}

/**
 * Saldo Inicial — one per fazenda, always January.
 * Shows a warning banner when no saldo exists, or a discrete edit button when it does.
 */
export function SaldoInicialForm({ saldosIniciais, onSetSaldo, anoBase }: Props) {
  // The saldo inicial is ALWAYS for the earliest year only
  const anoSaldo = useMemo(() => {
    const anos = saldosIniciais.map(s => s.ano);
    if (anos.length > 0) return Math.min(...anos);
    return anoBase || new Date().getFullYear();
  }, [saldosIniciais, anoBase]);

  // Only render if viewing the earliest year (or no saldo exists yet)
  const shouldRender = !anoBase || anoBase === anoSaldo || saldosIniciais.length === 0;

  const hasSaldo = useMemo(() => {
    return saldosIniciais.some(s => s.ano === anoSaldo && s.quantidade > 0);
  }, [saldosIniciais, anoSaldo]);

  const [open, setOpen] = useState(false);

  const [valores, setValores] = useState<Record<string, string>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [anoSelecionado, setAnoSelecionado] = useState(String(anoSaldo));

  // Generate year options: from 2010 to current year
  const anoOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const anos: string[] = [];
    for (let y = current; y >= 2010; y--) {
      anos.push(String(y));
    }
    return anos;
  }, []);

  // Sync form state when dialog opens or saldos change
  useEffect(() => {
    if (!open) return;
    const anoForm = hasSaldo ? anoSaldo : Number(anoSelecionado);
    const v: Record<string, string> = {};
    const p: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === anoForm && s.categoria === c.value);
      v[c.value] = s ? String(s.quantidade) : '';
      p[c.value] = s?.pesoMedioKg ? String(s.pesoMedioKg) : '';
    });
    setValores(v);
    setPesos(p);
    if (!hasSaldo) {
      setAnoSelecionado(String(anoSaldo));
    }
  }, [open, saldosIniciais, anoSaldo, hasSaldo]);

  const handleSalvar = () => {
    const anoFinal = hasSaldo ? anoSaldo : Number(anoSelecionado);
    CATEGORIAS.forEach(c => {
      const qtd = valores[c.value] ? Number(valores[c.value]) : 0;
      const peso = pesos[c.value] ? Number(pesos[c.value]) : undefined;
      onSetSaldo(anoFinal, c.value, qtd, peso);
    });
    setOpen(false);
  };

  // Don't render if viewing a year other than the earliest (and saldo exists)
  if (!shouldRender) return null;

  // Warning banner when no saldo exists
  if (!hasSaldo) {
    return (
      <div className="mx-2 my-2 flex items-center gap-2 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
        <p className="text-xs text-orange-700 dark:text-orange-400 flex-1">
          Defina o saldo inicial para iniciar o controle do rebanho
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default" className="h-7 text-xs gap-1 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Cadastrar
            </Button>
          </DialogTrigger>
          <SaldoInicialDialogContent
            anoSaldo={Number(anoSelecionado)}
            valores={valores}
            pesos={pesos}
            setValores={setValores}
            setPesos={setPesos}
            onSalvar={handleSalvar}
            showAnoSelector
            anoSelecionado={anoSelecionado}
            setAnoSelecionado={setAnoSelecionado}
            anoOptions={anoOptions}
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
  showAnoSelector,
  anoSelecionado,
  setAnoSelecionado,
  anoOptions,
}: {
  anoSaldo: number;
  valores: Record<string, string>;
  pesos: Record<string, string>;
  setValores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPesos: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSalvar: () => void;
  showAnoSelector?: boolean;
  anoSelecionado?: string;
  setAnoSelecionado?: (v: string) => void;
  anoOptions?: string[];
}) {
  const displayAno = showAnoSelector && anoSelecionado ? Number(anoSelecionado) : anoSaldo;

  return (
    <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {showAnoSelector ? 'Cadastrar Saldo Inicial' : `Saldo Inicial — Janeiro/${anoSaldo}`}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        {showAnoSelector && anoOptions && setAnoSelecionado && anoSelecionado ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Ano Base (início do histórico)</Label>
            <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
              <SelectTrigger className="h-9 text-sm font-bold">
                <SelectValue placeholder="Selecione o ano" />
              </SelectTrigger>
              <SelectContent>
                {anoOptions.map(a => (
                  <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Este será o ponto zero do histórico do rebanho (Janeiro/{anoSelecionado}).
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Informe a quantidade de cabeças e peso médio (kg) no início de Janeiro/{displayAno} por categoria:
          </p>
        )}

        <div className="space-y-2">
          {CATEGORIAS.map((c) => {
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
