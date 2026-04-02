import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { Calendar, Tag, Award, TrendingDown, CreditCard, FileText } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import type { StatusOperacional } from '@/lib/statusOperacional';

export interface AbateDetalhes {
  dataVenda: string;
  dataEmbarque: string;
  dataAbate: string;
  tipoVenda: string;
  tipoPeso: string;
  rendCarcaca: string;
  precoArroba: string;
  bonusPrecoce: string;
  bonusQualidade: string;
  bonusListaTrace: string;
  descontoQualidade: string;
  funruralPct: string;
  funruralReais: string;
  outrosDescontos: string;
  notaFiscal: string;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: { data: string; valor: number }[];
}

export const EMPTY_ABATE_DETALHES: AbateDetalhes = {
  dataVenda: '',
  dataEmbarque: '',
  dataAbate: '',
  tipoVenda: '',
  tipoPeso: 'vivo',
  rendCarcaca: '',
  precoArroba: '',
  bonusPrecoce: '',
  bonusQualidade: '',
  bonusListaTrace: '',
  descontoQualidade: '',
  funruralPct: '',
  funruralReais: '',
  outrosDescontos: '',
  notaFiscal: '',
  formaReceb: 'avista',
  qtdParcelas: '1',
  parcelas: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: AbateDetalhes) => void;
  initialData: AbateDetalhes;
  quantidade: number;
  pesoKg: number;
  categoria: string;
  dataAbate: string;
  statusOp: StatusOperacional;
}

export function AbateDetalhesDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, categoria, dataAbate, statusOp }: Props) {
  const [dataVenda, setDataVenda] = useState(initialData.dataVenda);
  const [dataEmbarque, setDataEmbarque] = useState(initialData.dataEmbarque);
  const [dataAbateLocal, setDataAbateLocal] = useState(initialData.dataAbate);
  const [tipoVenda, setTipoVenda] = useState(initialData.tipoVenda);
  const [tipoPeso, setTipoPeso] = useState(initialData.tipoPeso);
  const [rendCarcaca, setRendCarcaca] = useState(initialData.rendCarcaca);
  const [precoArroba, setPrecoArroba] = useState(initialData.precoArroba);
  const [bonusPrecoce, setBonusPrecoce] = useState(initialData.bonusPrecoce);
  const [bonusQualidade, setBonusQualidade] = useState(initialData.bonusQualidade);
  const [bonusListaTrace, setBonusListaTrace] = useState(initialData.bonusListaTrace);
  const [descontoQualidade, setDescontoQualidade] = useState(initialData.descontoQualidade);
  const [funruralPct, setFunruralPct] = useState(initialData.funruralPct);
  const [funruralReais, setFunruralReais] = useState(initialData.funruralReais);
  const [outrosDescontos, setOutrosDescontos] = useState(initialData.outrosDescontos);
  const [notaFiscal, setNotaFiscal] = useState(initialData.notaFiscal);
  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>(initialData.formaReceb);
  const [qtdParcelas, setQtdParcelas] = useState(initialData.qtdParcelas);
  const [parcelas, setParcelas] = useState(initialData.parcelas);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const isPrevisto = statusOp === 'previsto';
  const isProgramado = statusOp === 'confirmado';
  const usePrev = isPrevisto || isProgramado;

  useEffect(() => {
    if (open) {
      setDataVenda(initialData.dataVenda);
      setDataEmbarque(initialData.dataEmbarque);
      setDataAbateLocal(initialData.dataAbate);
      setTipoVenda(initialData.tipoVenda);
      setTipoPeso(initialData.tipoPeso);
      setRendCarcaca(initialData.rendCarcaca);
      setPrecoArroba(initialData.precoArroba);
      setBonusPrecoce(initialData.bonusPrecoce);
      setBonusQualidade(initialData.bonusQualidade);
      setBonusListaTrace(initialData.bonusListaTrace);
      setDescontoQualidade(initialData.descontoQualidade);
      setFunruralPct(initialData.funruralPct);
      setFunruralReais(initialData.funruralReais);
      setOutrosDescontos(initialData.outrosDescontos);
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

  // Calculations
  const calc = useMemo(() => {
    const rend = Number(rendCarcaca) || 0;
    const carcacaCalc = rend > 0 ? peso * rend / 100 : 0;
    const pesoArrobaCab = carcacaCalc > 0 ? carcacaCalc / 15 : 0;
    const totalArrobas = pesoArrobaCab * qtd;
    const totalKg = peso * qtd;
    const preco = Number(precoArroba) || 0;
    const valorBruto = totalArrobas * preco;

    const bonusPrecoceTotal = (Number(bonusPrecoce) || 0) * totalArrobas;
    const bonusQualidadeTotal = (Number(bonusQualidade) || 0) * totalArrobas;
    const bonusListaTraceTotal = (Number(bonusListaTrace) || 0) * totalArrobas;
    const totalBonus = bonusPrecoceTotal + bonusQualidadeTotal + bonusListaTraceTotal;

    const descQualidadeTotal = (Number(descontoQualidade) || 0) * totalArrobas;
    const funruralReaisVal = Number(funruralReais) || 0;
    const descFunruralTotal = funruralReaisVal > 0 ? funruralReaisVal : valorBruto * (Number(funruralPct) || 0) / 100;
    const descOutrosTotal = Number(outrosDescontos) || 0;
    const totalDescontos = descQualidadeTotal + descFunruralTotal + descOutrosTotal;

    const valorLiquido = valorBruto + totalBonus - totalDescontos;
    const liqArroba = totalArrobas > 0 ? valorLiquido / totalArrobas : 0;
    const liqCabeca = qtd > 0 ? valorLiquido / qtd : 0;
    const liqKg = totalKg > 0 ? valorLiquido / totalKg : 0;

    return {
      carcacaCalc, pesoArrobaCab, totalArrobas, totalKg, valorBruto,
      bonusPrecoceTotal, bonusQualidadeTotal, bonusListaTraceTotal, totalBonus,
      descQualidadeTotal, descFunruralTotal, descOutrosTotal, totalDescontos,
      valorLiquido, liqArroba, liqCabeca, liqKg,
    };
  }, [peso, qtd, rendCarcaca, precoArroba, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, funruralPct, funruralReais, outrosDescontos]);

  // Auto-compute dates
  const dataVendaAuto = dataVenda || format(new Date(), 'yyyy-MM-dd');
  const dataEmbarqueAuto = dataAbate ? format(addDays(parseISO(dataAbate), -1), 'yyyy-MM-dd') : '';
  const dataAbateAuto = dataAbate;

  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: { data: string; valor: number }[] = [];
    const vp = base / n;
    const baseDate = dataAbate || format(new Date(), 'yyyy-MM-dd');
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(baseDate), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [dataAbate]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v); markDirty();
    const n = Number(v);
    if (n > 0 && calc.valorLiquido > 0) {
      setParcelas(gerarParcelas(n, calc.valorLiquido));
    }
  };

  const handleSave = () => {
    onSave({
      dataVenda: dataVendaAuto,
      dataEmbarque: dataEmbarqueAuto,
      dataAbate: dataAbateAuto,
      tipoVenda, tipoPeso, rendCarcaca, precoArroba,
      bonusPrecoce, bonusQualidade, bonusListaTrace,
      descontoQualidade, funruralPct, funruralReais, outrosDescontos,
      notaFiscal, formaReceb, qtdParcelas, parcelas,
    });
  };

  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-1.5 pt-0.5">
      {icon}
      <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
    </div>
  );

  const prevLabel = (base: string) => usePrev ? `${base} Prev.` : base;

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Detalhes do Abate
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">
          {/* Resumo operacional */}
          <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
            <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{formatKg(peso)}</p></div>
            <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
          </div>

          <Separator />

          {/* BLOCO 1 — Datas da Operação */}
          {sectionTitle(<Calendar className="h-4 w-4 text-muted-foreground" />, 'Datas da Operação')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Data da Venda</Label>
              <Input type="date" value={dataVendaAuto} onChange={e => { setDataVenda(e.target.value); markDirty(); }} className="h-8 text-[11px]" />
            </div>
            <div>
              <Label className="text-[10px]">Data Embarque</Label>
              <Input type="date" value={dataEmbarqueAuto} readOnly className="h-8 text-[11px] bg-muted cursor-not-allowed" />
            </div>
            <div>
              <Label className="text-[10px]">Data Abate</Label>
              <Input type="date" value={dataAbateAuto} readOnly className="h-8 text-[11px] bg-muted cursor-not-allowed" />
            </div>
          </div>

          <Separator />

          {/* BLOCO 2 — Comercialização */}
          {sectionTitle(<Tag className="h-4 w-4 text-muted-foreground" />, 'Comercialização')}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">R$/@ (preço base)</Label>
              <Input type="number" value={precoArroba} onChange={e => { setPrecoArroba(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px] w-40" />
            </div>
            <div>
              <Label className="text-[10px]">Tipo de Abate</Label>
              <Select value={tipoPeso} onValueChange={(v) => { setTipoPeso(v); markDirty(); }}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivo">Peso vivo</SelectItem>
                  <SelectItem value="morto">Peso morto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">{usePrev ? 'Rend. Carcaça Prev. (%)' : 'Rend. Carcaça (%)'}</Label>
              <Input type="number" value={rendCarcaca} onChange={e => { setRendCarcaca(e.target.value); markDirty(); }} placeholder="0,0" step="0.1" className="h-8 text-[11px] w-28" />
            </div>
            <div>
              <Label className="text-[10px]">Comercialização</Label>
              <Select value={tipoVenda} onValueChange={(v) => { setTipoVenda(v); markDirty(); }}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="escala">Escala</SelectItem>
                  <SelectItem value="a_termo">A termo</SelectItem>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Calculated indicators */}
          {calc.valorBruto > 0 && (
            <div className="bg-muted/30 rounded p-2 space-y-0.5 text-[10px]">
              {calc.carcacaCalc > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Peso Carcaça</span><strong>{formatKg(calc.carcacaCalc)}</strong></div>
              )}
              {calc.pesoArrobaCab > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Arrobas/cab</span><strong>{formatArroba(calc.pesoArrobaCab)}</strong></div>
              )}
              {calc.totalArrobas > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Total Arrobas</span><strong>{formatArroba(calc.totalArrobas)}</strong></div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-[11px]">
                <span>Valor Bruto Total</span>
                <span className="text-primary">{formatMoeda(calc.valorBruto)}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* BLOCO 3 — Bônus */}
          {sectionTitle(<Award className="h-4 w-4 text-muted-foreground" />, usePrev ? 'BÔNUS Prev. (R$/@)' : 'BÔNUS (R$/@)')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">{prevLabel('Precoce')} R$/@</Label>
              <Input type="number" value={bonusPrecoce} onChange={e => { setBonusPrecoce(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px]" />
            </div>
            <div>
              <Label className="text-[10px]">{prevLabel('Qualidade')} R$/@</Label>
              <Input type="number" value={bonusQualidade} onChange={e => { setBonusQualidade(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px]" />
            </div>
            <div>
              <Label className="text-[10px]">{prevLabel('Lista Trace')} R$/@</Label>
              <Input type="number" value={bonusListaTrace} onChange={e => { setBonusListaTrace(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px]" />
            </div>
          </div>
          {calc.totalBonus > 0 && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded px-2 py-1.5 space-y-0.5 text-[10px]">
              <div className="flex justify-between font-bold">
                <span className="text-green-700 dark:text-green-400">Total Bônus</span>
                <span className="text-green-800 dark:text-green-300">{formatMoeda(calc.totalBonus)}</span>
              </div>
              {qtd > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Bônus/cab</span>
                  <span>{formatMoeda(calc.totalBonus / qtd)}</span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* BLOCO 4 — Descontos */}
          {sectionTitle(<TrendingDown className="h-4 w-4 text-muted-foreground" />, usePrev ? 'DESCONTOS Prev. (R$/@)' : 'DESCONTOS (R$/@)')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">{prevLabel('Qualidade')} R$/@</Label>
              <Input type="number" value={descontoQualidade} onChange={e => { setDescontoQualidade(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px]" />
            </div>
            <div>
              <Label className="text-[10px]">{prevLabel('Funrural')} %</Label>
              <Input type="number" value={funruralPct} onChange={e => { setFunruralPct(e.target.value); markDirty(); }} placeholder="0,00" step="0.01" className="h-8 text-[11px]" />
            </div>
            <div>
              <Label className="text-[10px]">{prevLabel('Outros')} R$</Label>
              <Input type="number" value={outrosDescontos} onChange={e => { setOutrosDescontos(e.target.value); markDirty(); }} placeholder="0,00" className="h-8 text-[11px]" />
            </div>
          </div>
          {calc.totalDescontos > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 space-y-0.5 text-[10px]">
              <div className="flex justify-between font-bold">
                <span className="text-red-700 dark:text-red-400">Total Descontos</span>
                <span className="text-red-800 dark:text-red-300">-{formatMoeda(calc.totalDescontos)}</span>
              </div>
              {qtd > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Descontos/cab</span>
                  <span>-{formatMoeda(calc.totalDescontos / qtd)}</span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* BLOCO 5 — Informações de Pagamento */}
          {sectionTitle(<CreditCard className="h-4 w-4 text-muted-foreground" />, 'Informações de Pagamento')}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Nota Fiscal</Label>
              <Input value={notaFiscal} onChange={e => { setNotaFiscal(e.target.value); markDirty(); }} placeholder="Nº da nota fiscal" className="h-8 text-[11px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setFormaReceb('avista'); setParcelas([]); markDirty(); }}
              className={`h-7 rounded text-[11px] font-bold border-2 transition-all ${formaReceb === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaReceb('prazo'); markDirty(); if (calc.valorLiquido > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorLiquido)); }}
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
              <p className="text-[9px] text-muted-foreground">Parcelas sobre o valor líquido do abate</p>
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

          {/* BLOCO 6 — Resultado */}
          {calc.valorBruto > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 space-y-0.5">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase">
                {usePrev ? 'Resultado Esperado' : 'Resultado Final'}
              </h4>
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor Bruto</span><strong>{formatMoeda(calc.valorBruto)}</strong></div>
                {calc.totalBonus > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">+ Bônus</span><strong className="text-green-600 dark:text-green-400">+{formatMoeda(calc.totalBonus)}</strong></div>
                )}
                {calc.totalDescontos > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">- Descontos</span><strong className="text-destructive">-{formatMoeda(calc.totalDescontos)}</strong></div>
                )}
                <Separator />
                <div className="flex justify-between text-[12px] font-bold">
                  <span>Valor Líquido Total</span>
                  <span className="text-primary">{formatMoeda(calc.valorLiquido)}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">R$/@ líq.</span><strong>{formatMoeda(calc.liqArroba)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R$/cab. líq.</span><strong>{formatMoeda(calc.liqCabeca)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R$/kg vivo líq.</span><strong>{formatMoeda(calc.liqKg)}</strong></div>
              </div>
              {calc.totalArrobas > 0 && (
                <div className="bg-muted/30 rounded p-1.5 mt-1 space-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{formatKg(peso)}</strong></div>
                  {Number(rendCarcaca) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Rendimento</span><strong>{formatPercent(Number(rendCarcaca))}</strong></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Arrobas/cab</span><strong>{formatArroba(calc.pesoArrobaCab)}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total arrobas</span><strong>{formatArroba(calc.totalArrobas)}</strong></div>
                </div>
              )}
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
            As alterações feitas nos detalhes do abate serão perdidas.
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
