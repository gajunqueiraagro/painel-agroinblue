import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, SaldoInicial } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Pencil, AlertTriangle, Plus, Lock, Calendar, Users } from 'lucide-react';

interface Props {
  saldosIniciais: SaldoInicial[];
  onSetSaldo: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
  /** Current year being viewed — form only renders if this matches the earliest year */
  anoBase?: number;
  /** Number of lancamentos that exist (for edit warning) */
  totalLancamentos?: number;
  /** Always show, regardless of which year is being viewed */
  alwaysVisible?: boolean;
}

/**
 * Saldo Inicial — one per fazenda, always January.
 * Always visible as a structural card showing the base year and totals.
 */
export function SaldoInicialForm({ saldosIniciais, onSetSaldo, anoBase, totalLancamentos = 0, alwaysVisible }: Props) {
  const anoSaldo = useMemo(() => {
    const anos = saldosIniciais.map(s => s.ano);
    if (anos.length > 0) return Math.min(...anos);
    return anoBase || new Date().getFullYear();
  }, [saldosIniciais, anoBase]);

  // Only show when viewing the base year (earliest with saldo) or when no saldo exists yet
  const shouldRender = !anoBase || anoBase === anoSaldo;

  const hasSaldo = useMemo(() => {
    return saldosIniciais.some(s => s.ano === anoSaldo && s.quantidade > 0);
  }, [saldosIniciais, anoSaldo]);

  const totalCabecas = useMemo(() => {
    return saldosIniciais
      .filter(s => s.ano === anoSaldo)
      .reduce((sum, s) => sum + s.quantidade, 0);
  }, [saldosIniciais, anoSaldo]);

  const categoriasComSaldo = useMemo(() => {
    return saldosIniciais
      .filter(s => s.ano === anoSaldo && s.quantidade > 0)
      .map(s => {
        const cat = CATEGORIAS.find(c => c.value === s.categoria);
        return { label: cat?.label || s.categoria, qtd: s.quantidade, peso: s.pesoMedioKg };
      });
  }, [saldosIniciais, anoSaldo]);

  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [anoSelecionado, setAnoSelecionado] = useState(String(anoSaldo));

  const anoOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const anos: string[] = [];
    for (let y = current; y >= 2010; y--) {
      anos.push(String(y));
    }
    return anos;
  }, []);

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

  const handleEditClick = () => {
    if (totalLancamentos > 0) {
      setShowConfirm(true);
    } else {
      setOpen(true);
    }
  };

  if (!shouldRender) return null;

  // ── No saldo exists: warning banner ──
  if (!hasSaldo) {
    return (
      <div className="mx-2 my-2 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
              Saldo Inicial não definido
            </p>
            <p className="text-[10px] text-orange-600 dark:text-orange-500 mt-0.5">
              Defina o saldo inicial para iniciar o controle do rebanho.
            </p>
          </div>
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
      </div>
    );
  }

  // ── Saldo exists: always-visible read-only card ──
  return (
    <>
      <div className="mx-2 my-2 rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">Saldo Inicial</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Jan/{anoSaldo}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-bold text-foreground">
              <Users className="h-3 w-3 text-primary" />
              {totalCabecas.toLocaleString('pt-BR')} cab.
            </span>
            <button
              onClick={handleEditClick}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-border text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
          </div>
        </div>
      </div>

      {/* Edit confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Editar Saldo Inicial
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2">
              <span className="block">
                A alteração do saldo inicial <strong>impacta toda a base histórica do rebanho</strong>.
              </span>
              {totalLancamentos > 0 && (
                <span className="block text-orange-600 dark:text-orange-400 font-semibold">
                  Existem {totalLancamentos.toLocaleString('pt-BR')} movimentações registradas que serão afetadas por essa alteração.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowConfirm(false); setOpen(true); }}>
              Desbloquear Edição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <SaldoInicialDialogContent
          anoSaldo={anoSaldo}
          valores={valores}
          pesos={pesos}
          setValores={setValores}
          setPesos={setPesos}
          onSalvar={handleSalvar}
        />
      </Dialog>
    </>
  );
}

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
          {showAnoSelector ? 'Cadastrar Saldo Inicial' : `Editar Saldo Inicial — Jan/${anoSaldo}`}
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
          <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
            <p className="text-[11px] text-orange-700 dark:text-orange-400 font-medium">
              ⚠️ Alterações no saldo inicial impactam toda a base histórica.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Quantidade de cabeças e peso médio (kg) em Janeiro/{displayAno}:
        </p>

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
