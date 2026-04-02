import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda } from '@/lib/calculos/formatters';
import { ShoppingCart, Truck, CreditCard, FileText } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

export type TipoPrecoCompra = 'por_kg' | 'por_cab' | 'por_total';

export interface CompraDetalhes {
  tipoPreco: TipoPrecoCompra;
  precoKg: string;
  precoCab: string;
  valorTotal: string;
  frete: string;
  comissaoPct: string;
  formaPag: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: { data: string; valor: number }[];
  notaFiscal: string;
}

export const EMPTY_COMPRA_DETALHES: CompraDetalhes = {
  tipoPreco: 'por_kg',
  precoKg: '',
  precoCab: '',
  valorTotal: '',
  frete: '',
  comissaoPct: '',
  formaPag: 'avista',
  qtdParcelas: '1',
  parcelas: [],
  notaFiscal: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: CompraDetalhes) => void;
  initialData: CompraDetalhes;
  quantidade: number;
  pesoKg: number;
  dataCompra: string;
}

export function CompraDetalhesDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, dataCompra }: Props) {
  const [tipoPreco, setTipoPreco] = useState<TipoPrecoCompra>(initialData.tipoPreco);
  const [precoKg, setPrecoKg] = useState(initialData.precoKg);
  const [precoCab, setPrecoCab] = useState(initialData.precoCab);
  const [valorTotal, setValorTotal] = useState(initialData.valorTotal);
  const [frete, setFrete] = useState(initialData.frete);
  const [comissaoPct, setComissaoPct] = useState(initialData.comissaoPct);
  const [formaPag, setFormaPag] = useState<'avista' | 'prazo'>(initialData.formaPag);
  const [qtdParcelas, setQtdParcelas] = useState(initialData.qtdParcelas);
  const [parcelas, setParcelas] = useState(initialData.parcelas);
  const [notaFiscal, setNotaFiscal] = useState(initialData.notaFiscal);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Reset when dialog opens with new data
  useEffect(() => {
    if (open) {
      setTipoPreco(initialData.tipoPreco);
      setPrecoKg(initialData.precoKg);
      setPrecoCab(initialData.precoCab);
      setValorTotal(initialData.valorTotal);
      setFrete(initialData.frete);
      setComissaoPct(initialData.comissaoPct);
      setFormaPag(initialData.formaPag);
      setQtdParcelas(initialData.qtdParcelas);
      setParcelas(initialData.parcelas);
      setNotaFiscal(initialData.notaFiscal);
      setDirty(false);
      setConfirmClose(false);
    }
  }, [open, initialData]);

  const markDirty = () => setDirty(true);

  const tryClose = () => {
    if (dirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;
  const totalKg = peso * qtd;

  const calc = useMemo(() => {
    let valorBase = 0;
    let rKg = 0;
    let rCab = 0;

    if (tipoPreco === 'por_kg') {
      rKg = Number(precoKg) || 0;
      valorBase = totalKg * rKg;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    } else if (tipoPreco === 'por_cab') {
      rCab = Number(precoCab) || 0;
      valorBase = qtd * rCab;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
    } else {
      valorBase = Number(valorTotal) || 0;
      rKg = totalKg > 0 ? valorBase / totalKg : 0;
      rCab = qtd > 0 ? valorBase / qtd : 0;
    }

    const freteVal = Number(frete) || 0;
    const comissaoVal = valorBase * ((Number(comissaoPct) || 0) / 100);
    const totalDespesas = freteVal + comissaoVal;
    const liqTotal = valorBase + totalDespesas;
    const liqKg = totalKg > 0 ? liqTotal / totalKg : 0;
    const liqCab = qtd > 0 ? liqTotal / qtd : 0;

    return { valorBase, rKg, rCab, freteVal, comissaoVal, totalDespesas, liqTotal, liqKg, liqCab };
  }, [tipoPreco, precoKg, precoCab, valorTotal, frete, comissaoPct, totalKg, qtd]);

  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: { data: string; valor: number }[] = [];
    const vp = base / n;
    const baseDate = dataCompra || format(new Date(), 'yyyy-MM-dd');
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(baseDate), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [dataCompra]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && calc.valorBase > 0) {
      setParcelas(gerarParcelas(n, calc.valorBase));
    }
  };

  const handleSave = () => {
    onSave({
      tipoPreco,
      precoKg,
      precoCab,
      valorTotal,
      frete,
      comissaoPct,
      formaPag,
      qtdParcelas,
      parcelas,
      notaFiscal,
    });
  };

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-1.5 pt-0.5">
      {icon}
      <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Detalhes da Compra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">

          {/* Resumo operacional */}
          <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
            <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{peso} kg</p></div>
            <div><span className="text-muted-foreground">Peso total</span><p className="font-bold">{totalKg.toLocaleString('pt-BR')} kg</p></div>
          </div>

          <Separator />

          {/* 1. Tipo de Compra */}
          {sectionTitle(<ShoppingCart className="h-4 w-4 text-muted-foreground" />, 'Tipo de Compra')}
          <Select value={tipoPreco} onValueChange={(v: TipoPrecoCompra) => { setTipoPreco(v); setPrecoKg(''); setPrecoCab(''); setValorTotal(''); markDirty(); }}>
            <SelectTrigger className="h-8 text-[11px] w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="por_kg">Por kg</SelectItem>
              <SelectItem value="por_cab">Por cabeça</SelectItem>
              <SelectItem value="por_total">Por valor total</SelectItem>
            </SelectContent>
          </Select>

          <Separator />

          {/* 2. Preço Base */}
          {sectionTitle(<span className="text-muted-foreground text-sm">R$</span>, 'Preço Base')}
          <div className="grid grid-cols-2 gap-2">
            {tipoPreco === 'por_kg' && (
              <div>
                <Label className="text-[10px]">R$/kg</Label>
                <Input type="number" value={precoKg} onChange={e => { setPrecoKg(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
              </div>
            )}
            {tipoPreco === 'por_cab' && (
              <div>
                <Label className="text-[10px]">R$/cabeça</Label>
                <Input type="number" value={precoCab} onChange={e => { setPrecoCab(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
              </div>
            )}
            {tipoPreco === 'por_total' && (
              <div>
                <Label className="text-[10px]">Valor total (R$)</Label>
                <Input type="number" value={valorTotal} onChange={e => { setValorTotal(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
              </div>
            )}
            {calc.valorBase > 0 && (
              <div className="bg-muted/30 rounded p-2 space-y-0.5 text-[10px]">
                {tipoPreco !== 'por_kg' && (
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/kg</span><strong>{formatMoeda(calc.rKg)}</strong></div>
                )}
                {tipoPreco !== 'por_cab' && (
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/cab.</span><strong>{formatMoeda(calc.rCab)}</strong></div>
                )}
                <div className="flex justify-between font-bold text-[11px]">
                  <span>Total base</span>
                  <span className="text-primary">{formatMoeda(calc.valorBase)}</span>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* 3. Despesas */}
          {sectionTitle(<Truck className="h-4 w-4 text-muted-foreground" />, 'Despesas Extras')}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Frete (R$)</Label>
              <Input type="number" value={frete} onChange={e => { setFrete(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
            </div>
            <div>
              <Label className="text-[10px]">Comissão (%)</Label>
              <Input type="number" value={comissaoPct} onChange={e => { setComissaoPct(e.target.value); markDirty(); }} placeholder="0" className="h-8 text-[11px] w-28" />
            </div>
          </div>
          {calc.comissaoVal > 0 && (
            <div className="flex justify-between text-[10px] px-1">
              <span className="text-muted-foreground">Comissão (R$)</span>
              <strong>{formatMoeda(calc.comissaoVal)}</strong>
            </div>
          )}
          {calc.totalDespesas > 0 && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-2 py-1.5 flex justify-between text-[10px] font-bold">
              <span className="text-orange-700 dark:text-orange-400">Total despesas</span>
              <span className="text-orange-800 dark:text-orange-300">{formatMoeda(calc.totalDespesas)}</span>
            </div>
          )}

          <Separator />

          {/* 4. Pagamento */}
          {sectionTitle(<CreditCard className="h-4 w-4 text-muted-foreground" />, 'Informações de Pagamento')}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setFormaPag('avista'); setParcelas([]); markDirty(); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaPag('prazo'); markDirty(); if (calc.valorBase > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorBase)); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaPag === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>

          {formaPag === 'prazo' && (
            <div className="space-y-1.5">
              <div className="w-24">
                <Label className="text-[10px]">Nº de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[11px]" />
              </div>
              <p className="text-[9px] text-muted-foreground">Parcelas sobre o valor base (sem frete/comissão)</p>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[9px]">Parcela {i + 1}</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); markDirty(); }} className="h-7 text-[10px]" />
                  </div>
                  <div>
                    <Label className="text-[9px]">R$</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); markDirty(); }} className="h-7 text-[10px]" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right">
                  Soma: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* 5. Nota Fiscal */}
          {sectionTitle(<FileText className="h-4 w-4 text-muted-foreground" />, 'Nota Fiscal')}
          <Input value={notaFiscal} onChange={e => { setNotaFiscal(e.target.value); markDirty(); }} placeholder="Nº da nota fiscal" className="h-8 text-[11px] w-48" />

          <Separator />

          {/* Totalizador */}
          {calc.valorBase > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Valor base</span>
                <strong>{formatMoeda(calc.valorBase)}</strong>
              </div>
              {calc.totalDespesas > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Despesas</span>
                  <strong className="text-orange-600 dark:text-orange-400">+{formatMoeda(calc.totalDespesas)}</strong>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-[12px] font-bold">
                <span>Total da compra</span>
                <span className="text-primary">{formatMoeda(calc.liqTotal)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">R$/kg líq.</span>
                <strong>{formatMoeda(calc.liqKg)}</strong>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">R$/cab. líq.</span>
                <strong>{formatMoeda(calc.liqCab)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Footer fixo */}
        <div className="flex justify-end gap-2 pt-2 border-t mt-1">
          <Button variant="outline" size="sm" onClick={tryClose} className="h-7 text-[11px]">Cancelar</Button>
          <Button size="sm" onClick={handleSave} className="h-7 text-[11px]">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deseja sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            As alterações feitas nos detalhes da compra serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConfirmClose(false); onClose(); }}>
            Sair sem salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
