import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, SaldoInicial } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, AlertTriangle, Plus, Lock, Calendar, Users } from 'lucide-react';

interface Props {
  saldosIniciais: SaldoInicial[];
  onSetSaldo: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number, precoKg?: number) => void;
  anoBase?: number;
  totalLancamentos?: number;
  alwaysVisible?: boolean;
  /** Whether the base month is officially closed (locks qty/peso editing) */
  mesFechado?: boolean;
}

export function SaldoInicialForm({ saldosIniciais, onSetSaldo, anoBase, totalLancamentos = 0, alwaysVisible, mesFechado = false }: Props) {
  const anoSaldo = useMemo(() => {
    const anos = saldosIniciais.map(s => s.ano);
    if (anos.length > 0) return Math.min(...anos);
    return anoBase || new Date().getFullYear();
  }, [saldosIniciais, anoBase]);

  const shouldRender = !anoBase || anoBase === anoSaldo;

  const hasSaldo = useMemo(() => {
    return saldosIniciais.some(s => s.ano === anoSaldo && s.quantidade > 0);
  }, [saldosIniciais, anoSaldo]);

  const totalCabecas = useMemo(() => {
    return saldosIniciais
      .filter(s => s.ano === anoSaldo)
      .reduce((sum, s) => sum + s.quantidade, 0);
  }, [saldosIniciais, anoSaldo]);

  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [anoSelecionado, setAnoSelecionado] = useState(String(anoSaldo));

  const anoOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const anos: string[] = [];
    for (let y = current; y >= 2010; y--) anos.push(String(y));
    return anos;
  }, []);

  useEffect(() => {
    if (!open) return;
    const anoForm = hasSaldo ? anoSaldo : Number(anoSelecionado);
    const v: Record<string, string> = {};
    const p: Record<string, string> = {};
    const pr: Record<string, string> = {};
    CATEGORIAS.forEach(c => {
      const s = saldosIniciais.find(s => s.ano === anoForm && s.categoria === c.value);
      v[c.value] = s ? String(s.quantidade) : '';
      p[c.value] = s?.pesoMedioKg ? String(s.pesoMedioKg) : '';
      pr[c.value] = s?.precoKg ? String(s.precoKg) : '';
    });
    setValores(v);
    setPesos(p);
    setPrecos(pr);
    if (!hasSaldo) setAnoSelecionado(String(anoSaldo));
  }, [open, saldosIniciais, anoSaldo, hasSaldo]);

  const parseNumero = (v: string | null | undefined): number | undefined => {
    if (v == null || v === '') return undefined;
    const normalized = v.replace(',', '.');
    const n = Number(normalized);
    return isNaN(n) ? undefined : n;
  };

  const handleSalvar = async () => {
    const anoFinal = hasSaldo ? anoSaldo : Number(anoSelecionado);
    for (const c of CATEGORIAS) {
      const qtd = parseNumero(valores[c.value]) ?? 0;
      const peso = parseNumero(pesos[c.value]);
      const preco = parseNumero(precos[c.value]);
      await onSetSaldo(anoFinal, c.value, qtd, peso, preco);
    }
    setOpen(false);
  };

  const handleEditClick = () => {
    if (totalLancamentos > 0 && !mesFechado) {
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
              precos={precos}
              setValores={setValores}
              setPesos={setPesos}
              setPrecos={setPrecos}
              onSalvar={handleSalvar}
              mesFechado={false}
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
            {mesFechado && (
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                Mês fechado — só preço editável
              </span>
            )}
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
          precos={precos}
          setValores={setValores}
          setPesos={setPesos}
          setPrecos={setPrecos}
          onSalvar={handleSalvar}
          mesFechado={mesFechado}
        />
      </Dialog>
    </>
  );
}

// ── Helpers ──
function fmtBrl(v: number | null): string {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Dialog content ──
function SaldoInicialDialogContent({
  anoSaldo, valores, pesos, precos, setValores, setPesos, setPrecos, onSalvar,
  mesFechado, showAnoSelector, anoSelecionado, setAnoSelecionado, anoOptions,
}: {
  anoSaldo: number;
  valores: Record<string, string>;
  pesos: Record<string, string>;
  precos: Record<string, string>;
  setValores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPesos: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPrecos: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSalvar: () => void;
  mesFechado: boolean;
  showAnoSelector?: boolean;
  anoSelecionado?: string;
  setAnoSelecionado?: (v: string) => void;
  anoOptions?: string[];
}) {
  const displayAno = showAnoSelector && anoSelecionado ? Number(anoSelecionado) : anoSaldo;

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
              {mesFechado
                ? '🔒 Mês fechado — apenas R$/kg pode ser editado. Quantidade e peso estão bloqueados.'
                : '⚠️ Alterações no saldo inicial impactam toda a base histórica.'}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Rebanho em Janeiro/{displayAno}:
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left w-[100px]">Categoria</TableHead>
              <TableHead className="text-center w-[70px]">Qtd</TableHead>
              <TableHead className="text-center w-[70px]">Peso (kg)</TableHead>
              <TableHead className="text-center w-[70px]">R$/kg</TableHead>
              <TableHead className="text-right w-[70px]">R$/@</TableHead>
              <TableHead className="text-right w-[70px]">R$/cab</TableHead>
              <TableHead className="text-right w-[80px]">Valor Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CATEGORIAS.map((c) => {
              const qtd = Number(valores[c.value]) || 0;
              const peso = Number(pesos[c.value]) || 0;
              const preco = Number(precos[c.value]) || 0;
              const arrobaKg = 15;
              const precoArroba = preco > 0 ? preco * arrobaKg : null;
              const precoCab = preco > 0 && peso > 0 ? preco * peso : null;
              const valorTotal = preco > 0 && peso > 0 && qtd > 0 ? qtd * peso * preco : null;
              const isSeparator = c.value === 'mamotes_f';

              return (
                <TableRow key={c.value} className={isSeparator ? 'border-t-2 border-border' : ''}>
                  <TableCell className="font-semibold text-xs">{c.label}</TableCell>
                  <TableCell className="p-0.5">
                    <Input
                      type="number"
                      value={valores[c.value] || ''}
                      onChange={e => setValores(v => ({ ...v, [c.value]: e.target.value }))}
                      placeholder="0"
                      min="0"
                      disabled={mesFechado}
                      className="text-center text-xs h-7 font-bold"
                    />
                  </TableCell>
                  <TableCell className="p-0.5">
                    <Input
                      type="number"
                      value={pesos[c.value] || ''}
                      onChange={e => setPesos(p => ({ ...p, [c.value]: e.target.value }))}
                      placeholder="0"
                      min="0"
                      step="0.1"
                      disabled={mesFechado}
                      className="text-center text-xs h-7"
                    />
                  </TableCell>
                  <TableCell className="p-0.5">
                    <Input
                      type="number"
                      value={precos[c.value] || ''}
                      onChange={e => setPrecos(pr => ({ ...pr, [c.value]: e.target.value }))}
                      placeholder="0,00"
                      min="0"
                      step="0.01"
                      className="text-center text-xs h-7"
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{fmtBrl(precoArroba)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{fmtBrl(precoCab)}</TableCell>
                  <TableCell className="text-right text-xs font-semibold">
                    {valorTotal != null ? `R$ ${fmtBrl(valorTotal)}` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Total row */}
            <TableRow className="bg-muted/30 font-bold border-t-2">
              <TableCell className="text-xs font-bold">TOTAL</TableCell>
              <TableCell className="text-center text-xs font-bold">
                {CATEGORIAS.reduce((s, c) => s + (Number(valores[c.value]) || 0), 0).toLocaleString('pt-BR')}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right text-xs font-bold">
                {(() => {
                  const total = CATEGORIAS.reduce((s, c) => {
                    const q = Number(valores[c.value]) || 0;
                    const p = Number(pesos[c.value]) || 0;
                    const pr = Number(precos[c.value]) || 0;
                    return s + q * p * pr;
                  }, 0);
                  return total > 0 ? `R$ ${fmtBrl(total)}` : '—';
                })()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Button className="w-full touch-target font-bold" onClick={onSalvar}>
          Salvar Saldo Inicial
        </Button>
      </div>
    </DialogContent>
  );
}
