import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { ShoppingCart, Truck, TrendingDown, CreditCard, FileText, Users, DollarSign } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

export type TipoPrecoVenda = 'por_kg' | 'por_cab' | 'por_total';
export type TipoVendaPe = 'desmama' | 'gado_adulto';

export interface VendaDetalhes {
  tipoVenda: TipoVendaPe;
  tipoPreco: TipoPrecoVenda;
  precoInput: string;
  frete: string;
  comissaoPct: string;
  outrosCustos: string;
  funruralPct: string;
  funruralReais: string;
  notaFiscal: string;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: { data: string; valor: number }[];
}

export const EMPTY_VENDA_DETALHES: VendaDetalhes = {
  tipoVenda: 'gado_adulto',
  tipoPreco: 'por_kg',
  precoInput: '',
  frete: '',
  comissaoPct: '',
  outrosCustos: '',
  funruralPct: '',
  funruralReais: '',
  notaFiscal: '',
  formaReceb: 'avista',
  qtdParcelas: '1',
  parcelas: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: VendaDetalhes) => void;
  initialData: VendaDetalhes;
  quantidade: number;
  pesoKg: number;
  categoria: string;
  dataVenda: string;
  compradorNome: string;
}

export function VendaDetalhesDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, categoria, dataVenda, compradorNome }: Props) {
  const [tipoVenda, setTipoVenda] = useState<TipoVendaPe>(initialData.tipoVenda);
  const [tipoPreco, setTipoPreco] = useState<TipoPrecoVenda>(initialData.tipoPreco);
  const [precoInput, setPrecoInput] = useState(initialData.precoInput);
  const [freteLocal, setFreteLocal] = useState(initialData.frete);
  const [comissaoPctLocal, setComissaoPctLocal] = useState(initialData.comissaoPct);
  const [outrosCustos, setOutrosCustos] = useState(initialData.outrosCustos);
  const [funruralPctLocal, setFunruralPctLocal] = useState(initialData.funruralPct);
  const [funruralReaisLocal, setFunruralReaisLocal] = useState(initialData.funruralReais);
  const [notaFiscal, setNotaFiscal] = useState(initialData.notaFiscal);
  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>(initialData.formaReceb);
  const [qtdParcelas, setQtdParcelas] = useState(initialData.qtdParcelas);
  const [parcelas, setParcelas] = useState(initialData.parcelas);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      setTipoVenda(initialData.tipoVenda);
      setTipoPreco(initialData.tipoPreco);
      setPrecoInput(initialData.precoInput);
      setFreteLocal(initialData.frete);
      setComissaoPctLocal(initialData.comissaoPct);
      setOutrosCustos(initialData.outrosCustos);
      setFunruralPctLocal(initialData.funruralPct);
      setFunruralReaisLocal(initialData.funruralReais);
      setNotaFiscal(initialData.notaFiscal);
      setFormaReceb(initialData.formaReceb);
      setQtdParcelas(initialData.qtdParcelas);
      setParcelas(initialData.parcelas);
      setDirty(false);
      setConfirmClose(false);
    }
  }, [open, initialData]);

  const markDirty = () => setDirty(true);
  const tryClose = () => { if (dirty) setConfirmClose(true); else onClose(); };

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;
  const totalKg = peso * qtd;
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  // Price calculations
  const calc = useMemo(() => {
    const vi = Number(precoInput) || 0;
    let valorBruto = 0;
    if (tipoPreco === 'por_kg') valorBruto = totalKg * vi;
    else if (tipoPreco === 'por_cab') valorBruto = qtd * vi;
    else valorBruto = vi;

    const rKg = totalKg > 0 ? valorBruto / totalKg : 0;
    const rCab = qtd > 0 ? valorBruto / qtd : 0;

    const freteVal = Number(freteLocal) || 0;
    const comissaoVal = valorBruto * ((Number(comissaoPctLocal) || 0) / 100);
    const outrosCustosVal = Number(outrosCustos) || 0;
    const totalDespesas = freteVal + comissaoVal + outrosCustosVal;

    // Funrural: mutual exclusion
    const funruralPctFilled = !!funruralPctLocal && Number(funruralPctLocal) > 0;
    const funruralReaisFilled = !!funruralReaisLocal && Number(funruralReaisLocal) > 0;
    const descFunruralTotal = funruralReaisFilled
      ? (Number(funruralReaisLocal) || 0)
      : valorBruto * ((Number(funruralPctLocal) || 0) / 100);
    const totalDeducoes = descFunruralTotal;

    const valorLiquido = valorBruto - totalDespesas - totalDeducoes;

    return {
      valorBruto, rKg, rCab,
      freteVal, comissaoVal, outrosCustosVal, totalDespesas,
      descFunruralTotal, totalDeducoes, funruralPctFilled, funruralReaisFilled,
      valorLiquido,
    };
  }, [tipoPreco, precoInput, totalKg, qtd, freteLocal, comissaoPctLocal, outrosCustos, funruralPctLocal, funruralReaisLocal]);

  // Funrural calculated fields
  const funruralPctCalculado = calc.funruralReaisFilled && calc.valorBruto > 0
    ? ((Number(funruralReaisLocal) / calc.valorBruto) * 100).toFixed(2)
    : funruralPctLocal;
  const funruralReaisCalculado = calc.funruralPctFilled
    ? (calc.descFunruralTotal > 0 ? calc.descFunruralTotal.toFixed(2) : '')
    : funruralReaisLocal;

  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: { data: string; valor: number }[] = [];
    const vp = base / n;
    const baseDate = dataVenda || format(new Date(), 'yyyy-MM-dd');
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(baseDate), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [dataVenda]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v); markDirty();
    const n = Number(v);
    if (n > 0 && calc.valorBruto > 0) {
      setParcelas(gerarParcelas(n, calc.valorBruto));
    }
  };

  const handleSave = () => {
    onSave({
      tipoVenda, tipoPreco, precoInput,
      frete: freteLocal, comissaoPct: comissaoPctLocal, outrosCustos,
      funruralPct: funruralPctLocal, funruralReais: funruralReaisLocal,
      notaFiscal, formaReceb, qtdParcelas, parcelas,
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
            <DollarSign className="h-4 w-4 text-primary" />
            Detalhes da Venda em Pé
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">

          {/* Resumo operacional */}
          <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
            <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{peso} kg</p></div>
            <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
          </div>

          <Separator />

          {/* Tipo de Venda herdado da tela principal — não repete aqui */}

          {/* BLOCO 2 — Comprador */}
          {sectionTitle(<Users className="h-4 w-4 text-muted-foreground" />, 'Comprador')}
          <div className="bg-muted/30 rounded p-2 text-[11px]">
            <span className="text-muted-foreground">Comprador selecionado: </span>
            <strong>{compradorNome || 'Nenhum'}</strong>
          </div>

          <Separator />

          {/* BLOCO 3 — Tipo de Preço / Preço Base */}
          {sectionTitle(<span className="text-muted-foreground text-sm">R$</span>, 'Tipo de Preço / Preço Base')}
          <div className="grid grid-cols-3 gap-1.5">
            {(['por_kg', 'por_cab', 'por_total'] as const).map(tp => (
              <button key={tp} type="button"
                onClick={() => { setTipoPreco(tp); setPrecoInput(''); markDirty(); }}
                className={`h-8 rounded text-[11px] font-bold border-2 transition-all ${tipoPreco === tp ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                {tp === 'por_kg' ? 'Por kg' : tp === 'por_cab' ? 'R$/cabeça' : 'Por total'}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-[10px]">
              {tipoPreco === 'por_kg' ? 'R$/kg' : tipoPreco === 'por_cab' ? 'R$/cabeça' : 'Valor total (R$)'}
            </Label>
            <Input type="number" value={precoInput} onChange={e => { setPrecoInput(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
          </div>
          {calc.valorBruto > 0 && (
            <div className="bg-muted/30 rounded p-2 space-y-0.5 text-[10px]">
              {tipoPreco !== 'por_kg' && (
                <div className="flex justify-between"><span className="text-muted-foreground">R$/kg</span><strong>{formatMoeda(calc.rKg)}</strong></div>
              )}
              {tipoPreco !== 'por_cab' && (
                <div className="flex justify-between"><span className="text-muted-foreground">R$/cab.</span><strong>{formatMoeda(calc.rCab)}</strong></div>
              )}
              <div className="flex justify-between font-bold text-[11px]">
                <span>Valor bruto total</span>
                <span className="text-primary">{formatMoeda(calc.valorBruto)}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* BLOCO 4 — Despesas Comerciais */}
          {sectionTitle(<Truck className="h-4 w-4 text-muted-foreground" />, 'Despesas Comerciais')}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Frete (R$)</Label>
              <Input type="number" value={freteLocal} onChange={e => { setFreteLocal(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
            </div>
            <div>
              <Label className="text-[10px]">Comissão (%)</Label>
              <Input type="number" value={comissaoPctLocal} onChange={e => { setComissaoPctLocal(e.target.value); markDirty(); }} placeholder="0" className="h-8 text-[11px] w-28" />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Outros custos extras (R$)</Label>
            <Input type="number" value={outrosCustos} onChange={e => { setOutrosCustos(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
          </div>
          {calc.totalDespesas > 0 && (
            <div className="bg-muted/30 rounded p-2 space-y-0.5 text-[10px]">
              {calc.freteVal > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><strong>{formatMoeda(calc.freteVal)}</strong></div>
                  {qtd > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete/cab</span><strong>{formatMoeda(calc.freteVal / qtd)}</strong></div>}
                </>
              )}
              {calc.comissaoVal > 0 && (
                <>
                  {calc.freteVal > 0 && <div className="border-t border-border/30 my-1" />}
                  <div className="flex justify-between"><span className="text-muted-foreground">Comissão</span><strong>{formatMoeda(calc.comissaoVal)}</strong></div>
                  {qtd > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Comissão/cab</span><strong>{formatMoeda(calc.comissaoVal / qtd)}</strong></div>}
                </>
              )}
              {calc.outrosCustosVal > 0 && (
                <>
                  <div className="border-t border-border/30 my-1" />
                  <div className="flex justify-between"><span className="text-muted-foreground">Outros custos</span><strong>{formatMoeda(calc.outrosCustosVal)}</strong></div>
                </>
              )}
            </div>
          )}
          {calc.totalDespesas > 0 && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-2 py-1.5 flex justify-between text-[10px] font-bold">
              <span className="text-orange-700 dark:text-orange-400">Total despesas comerciais</span>
              <span className="text-orange-800 dark:text-orange-300">{formatMoeda(calc.totalDespesas)}</span>
            </div>
          )}

          <Separator />

          {/* BLOCO 5 — Deduções / Encargos */}
          {sectionTitle(<TrendingDown className="h-4 w-4 text-muted-foreground" />, 'Deduções / Encargos')}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Funrural (%)</Label>
              <Input
                type="number" value={funruralPctCalculado}
                onChange={e => { setFunruralPctLocal(e.target.value); if (e.target.value && Number(e.target.value) > 0) setFunruralReaisLocal(''); markDirty(); }}
                placeholder="0,00" step="0.01" className="h-8 text-[11px]"
                disabled={calc.funruralReaisFilled}
              />
            </div>
            <div>
              <Label className="text-[10px]">Funrural (R$)</Label>
              <Input
                type="number" value={funruralReaisCalculado}
                onChange={e => { setFunruralReaisLocal(e.target.value); if (e.target.value && Number(e.target.value) > 0) setFunruralPctLocal(''); markDirty(); }}
                placeholder="0,00" className={`h-8 text-[11px] ${calc.funruralPctFilled ? 'bg-muted/40' : ''}`}
                disabled={calc.funruralPctFilled} readOnly={calc.funruralPctFilled}
              />
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">Informe em % ou R$ — o outro será calculado automaticamente.</p>
          {calc.totalDeducoes > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 flex justify-between text-[10px] font-bold">
              <span className="text-red-700 dark:text-red-400">Total deduções</span>
              <span className="text-red-800 dark:text-red-300">-{formatMoeda(calc.totalDeducoes)}</span>
            </div>
          )}

          <Separator />

          {/* BLOCO 6 — Informações de Recebimento */}
          {sectionTitle(<CreditCard className="h-4 w-4 text-muted-foreground" />, 'Informações de Recebimento')}
          <div>
            <Label className="text-[10px]">Nota Fiscal</Label>
            <Input value={notaFiscal} onChange={e => { setNotaFiscal(e.target.value); markDirty(); }} placeholder="Nº da nota fiscal" className="h-8 text-[11px] w-48" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setFormaReceb('avista'); setParcelas([]); markDirty(); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaReceb === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaReceb('prazo'); markDirty(); if (calc.valorBruto > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorBruto)); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaReceb === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>

          {formaReceb === 'prazo' && (
            <div className="space-y-1.5">
              <div className="w-24">
                <Label className="text-[10px]">Nº de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[11px]" />
              </div>
              <p className="text-[9px] text-muted-foreground">Parcelas sobre o valor bruto da venda</p>
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

          {/* BLOCO 7 — Resultado Final */}
          {calc.valorBruto > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 space-y-0.5">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Resultado Final</h4>
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span><strong>{formatMoeda(calc.valorBruto)}</strong></div>
                {calc.totalDespesas > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Despesas</span><strong className="text-orange-600 dark:text-orange-400">-{formatMoeda(calc.totalDespesas)}</strong></div>
                )}
                {calc.totalDeducoes > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Deduções</span><strong className="text-destructive">-{formatMoeda(calc.totalDeducoes)}</strong></div>
                )}
                <Separator />
                <div className="flex justify-between text-[12px] font-bold">
                  <span>Valor líquido</span>
                  <span className="text-primary">{formatMoeda(calc.valorLiquido)}</span>
                </div>
                {totalKg > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/kg líq.</span><strong>{formatMoeda(calc.valorLiquido / totalKg)}</strong></div>
                )}
                {qtd > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">R$/cab. líq.</span><strong>{formatMoeda(calc.valorLiquido / qtd)}</strong></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
            As alterações feitas nos detalhes da venda serão perdidas.
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
