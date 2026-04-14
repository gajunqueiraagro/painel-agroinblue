import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { Calendar, Tag, Award, TrendingDown, CreditCard, FileText, Shield } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import type { StatusOperacional } from '@/lib/statusOperacional';
import { getStatusBadge } from '@/lib/statusOperacional';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';

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
  // Bidirectional R$ fields
  bonusPrecoceReais?: string;
  bonusQualidadeReais?: string;
  bonusListaTraceReais?: string;
  descontoQualidadeReais?: string;
  outrosDescontosArroba?: string;
  pesoCarcacaKgManual?: string;
  /** Official calculation snapshot — single source of truth */
  calculation?: AbateCalculation;
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

/** Format a number for display in R$ format inline */
function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AbateDetalhesDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, categoria, dataAbate, statusOp }: Props) {
  const [dataVenda, setDataVenda] = useState(initialData.dataVenda);
  const [dataEmbarque, setDataEmbarque] = useState(initialData.dataEmbarque);
  const [dataAbateLocal, setDataAbateLocal] = useState(initialData.dataAbate);
  const [tipoVenda, setTipoVenda] = useState(initialData.tipoVenda);
  const [tipoPeso, setTipoPeso] = useState(initialData.tipoPeso);
  const [rendCarcaca, setRendCarcaca] = useState(initialData.rendCarcaca);
  const [precoArroba, setPrecoArroba] = useState(initialData.precoArroba);

  // Bonus bidirectional: store arroba-based and reais-based
  const [bonusPrecoce, setBonusPrecoce] = useState(initialData.bonusPrecoce);
  const [bonusPrecoceReais, setBonusPrecoceReais] = useState(initialData.bonusPrecoceReais || '');
  const [bonusQualidade, setBonusQualidade] = useState(initialData.bonusQualidade);
  const [bonusQualidadeReais, setBonusQualidadeReais] = useState(initialData.bonusQualidadeReais || '');
  const [bonusListaTrace, setBonusListaTrace] = useState(initialData.bonusListaTrace);
  const [bonusListaTraceReais, setBonusListaTraceReais] = useState(initialData.bonusListaTraceReais || '');

  // Discount bidirectional
  const [descontoQualidade, setDescontoQualidade] = useState(initialData.descontoQualidade);
  const [descontoQualidadeReais, setDescontoQualidadeReais] = useState(initialData.descontoQualidadeReais || '');
  const [outrosDescontos, setOutrosDescontos] = useState(initialData.outrosDescontos);
  const [outrosDescontosArroba, setOutrosDescontosArroba] = useState(initialData.outrosDescontosArroba || '');

  // Funrural
  const [funruralPct, setFunruralPct] = useState(initialData.funruralPct);
  const [funruralReais, setFunruralReais] = useState(initialData.funruralReais);

  const [notaFiscal, setNotaFiscal] = useState(initialData.notaFiscal);
  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>(initialData.formaReceb);
  const [qtdParcelas, setQtdParcelas] = useState(initialData.qtdParcelas);
  const [parcelas, setParcelas] = useState(initialData.parcelas);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const isPrevisto = (statusOp as string) === 'meta';
  const isProgramado = statusOp === 'programado';
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
      setBonusPrecoceReais(initialData.bonusPrecoceReais || '');
      setBonusQualidade(initialData.bonusQualidade);
      setBonusQualidadeReais(initialData.bonusQualidadeReais || '');
      setBonusListaTrace(initialData.bonusListaTrace);
      setBonusListaTraceReais(initialData.bonusListaTraceReais || '');
      setDescontoQualidade(initialData.descontoQualidade);
      setDescontoQualidadeReais(initialData.descontoQualidadeReais || '');
      setOutrosDescontos(initialData.outrosDescontos);
      setOutrosDescontosArroba(initialData.outrosDescontosArroba || '');
      setFunruralPct(initialData.funruralPct);
      setFunruralReais(initialData.funruralReais);
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

  // Peso carcaça kg state for bidirectional
  const [pesoCarcacaKg, setPesoCarcacaKg] = useState('');

  // Core calculations — single source of truth via buildAbateCalculation
  const calc = useMemo(() => {
    return buildAbateCalculation({
      quantidade: qtd,
      pesoKg: peso,
      pesoCarcacaKg: pesoCarcacaKg || undefined,
      rendCarcaca: rendCarcaca || undefined,
      precoArroba: precoArroba || undefined,
      funruralPct: funruralPct || undefined,
      funruralReais: funruralReais || undefined,
      bonusPrecoce: bonusPrecoce || undefined,
      bonusPrecoceReais: bonusPrecoceReais || undefined,
      bonusQualidade: bonusQualidade || undefined,
      bonusQualidadeReais: bonusQualidadeReais || undefined,
      bonusListaTrace: bonusListaTrace || undefined,
      bonusListaTraceReais: bonusListaTraceReais || undefined,
      descontoQualidade: descontoQualidade || undefined,
      descontoQualidadeReais: descontoQualidadeReais || undefined,
      outrosDescontos: outrosDescontos || undefined,
      outrosDescontosArroba: outrosDescontosArroba || undefined,
      formaReceb,
      qtdParcelas: qtdParcelas || undefined,
      parcelas,
    });
  }, [peso, qtd, rendCarcaca, pesoCarcacaKg, precoArroba, bonusPrecoce, bonusPrecoceReais, bonusQualidade, bonusQualidadeReais, bonusListaTrace, bonusListaTraceReais, descontoQualidade, descontoQualidadeReais, outrosDescontos, outrosDescontosArroba, funruralPct, funruralReais, formaReceb, qtdParcelas, parcelas]);

  // Auto-sync parcelas when valor líquido changes and formaReceb === 'prazo'
  const prevValorLiquido = useRef(calc.valorLiquido);
  useEffect(() => {
    if (formaReceb === 'prazo' && calc.valorLiquido > 0 && calc.valorLiquido !== prevValorLiquido.current) {
      const n = Math.max(1, Number(qtdParcelas) || 1);
      setParcelas(current => {
        const newParcelas = current.map((p, i) => {
          const parcelaVal = Math.round((calc.valorLiquido / n) * 100) / 100;
          return { data: p.data, valor: parcelaVal };
        });
        // Adjust last parcela for rounding
        if (newParcelas.length > 0) {
          const sumOthers = newParcelas.slice(0, -1).reduce((s, p) => s + p.valor, 0);
          newParcelas[newParcelas.length - 1].valor = Math.round((calc.valorLiquido - sumOthers) * 100) / 100;
        }
        return newParcelas;
      });
    }
    prevValorLiquido.current = calc.valorLiquido;
  }, [calc.valorLiquido, formaReceb, qtdParcelas]);

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
      bonusPrecoceReais, bonusQualidadeReais, bonusListaTraceReais,
      descontoQualidadeReais, outrosDescontosArroba,
      pesoCarcacaKgManual: pesoCarcacaKg || undefined,
      calculation: calc,
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

  // Bonus/discount handlers — exclusive fields (only one filled at a time)
  const handleBonusArrobaChange = (
    setArr: (v: string) => void,
    setReais: (v: string) => void,
    value: string,
  ) => {
    setArr(value); markDirty();
    setReais('');
  };

  // Funrural bidirectional
  const handleFunruralPctChange = (value: string) => {
    setFunruralPct(value); markDirty();
    const v = Number(value) || 0;
    if (v > 0 && calc.valorBase > 0) {
      setFunruralReais(String(Math.round(calc.valorBase * v / 100 * 100) / 100));
    } else {
      setFunruralReais('');
    }
  };

  const handleFunruralReaisChange = (value: string) => {
    setFunruralReais(value); markDirty();
    const v = Number(value) || 0;
    if (v > 0 && calc.valorBase > 0) {
      setFunruralPct(String(Math.round((v / calc.valorBase) * 10000) / 100));
    } else {
      setFunruralPct('');
    }
  };

  // Table row component for bonus/discount
  const BiRow = ({ label, arrobaVal, reaisVal, totalVal, onArrobaChange, onReaisChange }: {
    label: string;
    arrobaVal: string;
    reaisVal: string;
    totalVal: number;
    onArrobaChange: (v: string) => void;
    onReaisChange: (v: string) => void;
  }) => (
    <tr className="border-b border-border/30">
      <td className="py-1 pr-2 text-[10px] text-muted-foreground font-medium whitespace-nowrap">{label}</td>
      <td className="py-1 px-1">
        <Input type="number" value={arrobaVal} onChange={e => onArrobaChange(e.target.value)} placeholder="0,00" className="h-7 text-[10px] w-20 text-right tabular-nums" step="0.01" />
      </td>
      <td className="py-1 px-1">
        <Input type="number" value={reaisVal} onChange={e => onReaisChange(e.target.value)} placeholder="0,00" className="h-7 text-[10px] w-24 text-right tabular-nums" step="0.01" />
      </td>
      <td className="py-1 pl-1 text-[10px] font-bold text-right tabular-nums whitespace-nowrap">
        {totalVal > 0 ? formatMoeda(totalVal) : '-'}
      </td>
    </tr>
  );


  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-0">
         <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
             <Tag className="h-4 w-4 text-primary" />
             Detalhes do Abate
             {(() => {
               const badge = getStatusBadge({ statusOperacional: statusOp } as any);
               return (
                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                   {badge.label}
                 </span>
               );
             })()}
           </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          {/* Resumo operacional */}
          <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
            <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{formatKg(peso)}</p></div>
            <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
          </div>

          <Separator />

          {/* BLOCO 1 — Datas */}
          {sectionTitle(<Calendar className="h-4 w-4 text-muted-foreground" />, 'Datas da Operação')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Data da Venda</Label>
              <Input type="date" value={dataVendaAuto} onChange={e => { setDataVenda(e.target.value); markDirty(); }} className="h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[10px]">Data Embarque</Label>
              <Input type="date" value={dataEmbarqueAuto} readOnly className="h-7 text-[10px] bg-muted cursor-not-allowed" />
            </div>
            <div>
              <Label className="text-[10px]">Data Abate</Label>
              <Input type="date" value={dataAbateAuto} readOnly className="h-7 text-[10px] bg-muted cursor-not-allowed" />
            </div>
          </div>

          <Separator />

          {/* BLOCO 2 — Preço Base & Rendimento */}
          {sectionTitle(<Tag className="h-4 w-4 text-muted-foreground" />, 'Comercialização')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">R$/@ (Preço Base)</Label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                <Input type="number" value={precoArroba} onChange={e => { setPrecoArroba(e.target.value); markDirty(); }} placeholder="0,00" className="h-7 text-[10px] text-right tabular-nums pl-7" step="0.01" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Tipo de Abate</Label>
              <Select value={tipoPeso} onValueChange={(v) => { setTipoPeso(v); markDirty(); }}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivo">Peso vivo</SelectItem>
                  <SelectItem value="morto">Peso morto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Comercialização</Label>
              <Select value={tipoVenda} onValueChange={(v) => { setTipoVenda(v); markDirty(); }}>
                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="escala">Escala</SelectItem>
                  <SelectItem value="a_termo">A termo</SelectItem>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desempenho do Abate — 3 cols, bidirectional */}
          <h4 className="text-[10px] font-semibold text-muted-foreground pt-1">Desempenho do Abate</h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">{usePrev ? 'Rend. Carcaça Prev. (%)' : 'Rend. Carcaça (%)'}</Label>
              <div className="relative">
                <Input type="number" value={rendCarcaca} onChange={e => { setRendCarcaca(e.target.value); setPesoCarcacaKg(''); markDirty(); }} placeholder="0,00" step="0.01" className="h-7 text-[10px] text-right tabular-nums pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Peso Carcaça (kg)</Label>
              <div className="relative">
                <Input type="number" value={pesoCarcacaKg || (calc.carcacaCalc > 0 ? String(Math.round(calc.carcacaCalc * 100) / 100) : '')} onChange={e => { setPesoCarcacaKg(e.target.value); const v = Number(e.target.value) || 0; if (v > 0 && peso > 0) setRendCarcaca(String(Math.round((v / peso) * 10000) / 100)); markDirty(); }} placeholder="0,00" step="0.01" className="h-7 text-[10px] text-right tabular-nums pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">kg</span>
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Peso Carcaça (@)</Label>
              <Input type="text" readOnly value={calc.pesoArrobaCab > 0 ? formatArroba(calc.pesoArrobaCab) : '-'} className="h-7 text-[10px] text-right tabular-nums bg-muted cursor-not-allowed" />
            </div>
          </div>

          {/* Indicadores calculados inline */}
          {calc.valorBase > 0 && (
            <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-x-3 text-[10px]">
              <div><span className="text-muted-foreground">@/cab</span><p className="font-bold">{formatArroba(calc.pesoArrobaCab)}</p></div>
              <div><span className="text-muted-foreground">Total Arrobas</span><p className="font-bold">{formatArroba(calc.totalArrobas)}</p></div>
              <div><span className="text-muted-foreground">Valor Base</span><p className="font-bold text-primary">{formatMoeda(calc.valorBase)}</p></div>
            </div>
          )}

          <Separator />

          {/* BLOCO 3 — Impostos (Funrural) */}
          {sectionTitle(<Shield className="h-4 w-4 text-muted-foreground" />, 'IMPOSTOS')}
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1 text-muted-foreground font-medium">Tipo</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">%</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30">
                <td className="py-1 pr-2 text-muted-foreground font-medium">Funrural</td>
                <td className="py-1 px-1">
                  <div className="relative">
                    <Input type="number" value={funruralPct} onChange={e => handleFunruralPctChange(e.target.value)} placeholder="0,00" step="0.01" className="h-7 text-[10px] w-20 text-right tabular-nums pr-6 mx-auto" />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </td>
                <td className="py-1 px-1">
                  <div className="relative">
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                    <Input type="number" value={funruralReais} onChange={e => handleFunruralReaisChange(e.target.value)} placeholder="0,00" step="0.01" className="h-7 text-[10px] w-28 text-right tabular-nums pl-7 mx-auto" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          {calc.valorBruto > 0 && calc.funruralTotal > 0 && (
            <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
              <span className="font-bold">Valor Bruto (desconto - Funrural)</span>
              <span className="font-bold text-primary tabular-nums">{formatMoeda(calc.valorBruto)}</span>
            </div>
          )}

          <Separator />

          {/* BLOCO 4 — Bônus */}
          {sectionTitle(<Award className="h-4 w-4 text-muted-foreground" />, usePrev ? 'BÔNUS Prev. (R$/@)' : 'BÔNUS (R$/@)')}
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1 text-muted-foreground font-medium">Tipo Bônus</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">R$/@</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
                <th className="text-center py-1 text-muted-foreground font-medium pl-1">R$ Total</th>
              </tr>
            </thead>
            <tbody>
              <BiRow
                label={prevLabel('Precoce')}
                arrobaVal={bonusPrecoce}
                reaisVal={bonusPrecoceReais}
                totalVal={calc.bonusPrecoceTotal}
                onArrobaChange={v => handleBonusArrobaChange(setBonusPrecoce, setBonusPrecoceReais, v)}
                onReaisChange={v => handleBonusReaisChange(setBonusPrecoce, setBonusPrecoceReais, v)}
              />
              <BiRow
                label={prevLabel('Qualidade')}
                arrobaVal={bonusQualidade}
                reaisVal={bonusQualidadeReais}
                totalVal={calc.bonusQualidadeTotal}
                onArrobaChange={v => handleBonusArrobaChange(setBonusQualidade, setBonusQualidadeReais, v)}
                onReaisChange={v => handleBonusReaisChange(setBonusQualidade, setBonusQualidadeReais, v)}
              />
              <BiRow
                label={prevLabel('Lista Trace')}
                arrobaVal={bonusListaTrace}
                reaisVal={bonusListaTraceReais}
                totalVal={calc.bonusListaTraceTotal}
                onArrobaChange={v => handleBonusArrobaChange(setBonusListaTrace, setBonusListaTraceReais, v)}
                onReaisChange={v => handleBonusReaisChange(setBonusListaTrace, setBonusListaTraceReais, v)}
              />
            </tbody>
          </table>
          {calc.totalBonus > 0 && (
            <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
              <span className="font-bold">Total Bônus</span>
              <span className="font-bold tabular-nums">+{formatMoeda(calc.totalBonus)}</span>
            </div>
          )}

          <Separator />

          {/* BLOCO 5 — Descontos */}
          {sectionTitle(<TrendingDown className="h-4 w-4 text-muted-foreground" />, usePrev ? 'DESCONTOS Prev. (R$/@)' : 'DESCONTOS (R$/@)')}
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1 text-muted-foreground font-medium">Tipo Desconto</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">R$/@</th>
                <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
                <th className="text-center py-1 text-muted-foreground font-medium pl-1">R$ Total</th>
              </tr>
            </thead>
            <tbody>
              <BiRow
                label={prevLabel('Qualidade')}
                arrobaVal={descontoQualidade}
                reaisVal={descontoQualidadeReais}
                totalVal={calc.descQualidadeTotal}
                onArrobaChange={v => handleBonusArrobaChange(setDescontoQualidade, setDescontoQualidadeReais, v)}
                onReaisChange={v => handleBonusReaisChange(setDescontoQualidade, setDescontoQualidadeReais, v)}
              />
              <BiRow
                label={prevLabel('Outros')}
                arrobaVal={outrosDescontosArroba}
                reaisVal={outrosDescontos}
                totalVal={calc.descOutrosTotal}
                onArrobaChange={v => handleBonusArrobaChange(setOutrosDescontosArroba, setOutrosDescontos, v)}
                onReaisChange={v => handleBonusReaisChange(setOutrosDescontosArroba, setOutrosDescontos, v)}
              />
            </tbody>
          </table>
          {calc.totalDescontos > 0 && (
            <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
              <span className="font-bold">Total Descontos</span>
              <span className="font-bold text-destructive tabular-nums">-{formatMoeda(calc.totalDescontos)}</span>
            </div>
          )}

          <Separator />

          {/* BLOCO 6 — Resultado Final */}
          {calc.valorBase > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 space-y-0.5">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase">
                {usePrev ? 'Resultado Esperado' : 'Resultado Final'}
              </h4>
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Valor Base</span><strong className="tabular-nums">{formatMoeda(calc.valorBase)}</strong></div>
                {calc.funruralTotal > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">(–) Funrural</span><strong className="text-destructive tabular-nums">-{formatMoeda(calc.funruralTotal)}</strong></div>
                )}
                <Separator className="my-0.5" />
                <div className="flex justify-between font-bold"><span>= Valor Bruto</span><span className="tabular-nums">{formatMoeda(calc.valorBruto)}</span></div>

                {/* Bônus breakdown */}
                <div className="flex justify-between"><span className="text-muted-foreground">(+) Bônus</span><strong className="tabular-nums">{calc.totalBonus > 0 ? `+${formatMoeda(calc.totalBonus)}` : '-'}</strong></div>
                {calc.totalBonus > 0 && (
                  <div className="pl-3 space-y-0 text-muted-foreground">
                    {calc.bonusPrecoceTotal > 0 && <div className="flex justify-between"><span>Precoce</span><span className="tabular-nums">{formatMoeda(calc.bonusPrecoceTotal)}</span></div>}
                    {calc.bonusQualidadeTotal > 0 && <div className="flex justify-between"><span>Qualidade</span><span className="tabular-nums">{formatMoeda(calc.bonusQualidadeTotal)}</span></div>}
                    {calc.bonusListaTraceTotal > 0 && <div className="flex justify-between"><span>Lista Trace</span><span className="tabular-nums">{formatMoeda(calc.bonusListaTraceTotal)}</span></div>}
                  </div>
                )}

                {/* Descontos breakdown */}
                <div className="flex justify-between"><span className="text-muted-foreground">(–) Descontos</span><strong className="text-destructive tabular-nums">{calc.totalDescontos > 0 ? `-${formatMoeda(calc.totalDescontos)}` : '-'}</strong></div>
                {calc.totalDescontos > 0 && (
                  <div className="pl-3 space-y-0 text-muted-foreground">
                    {calc.descQualidadeTotal > 0 && <div className="flex justify-between"><span>Qualidade</span><span className="tabular-nums">{formatMoeda(calc.descQualidadeTotal)}</span></div>}
                    {calc.descOutrosTotal > 0 && <div className="flex justify-between"><span>Outros</span><span className="tabular-nums">{formatMoeda(calc.descOutrosTotal)}</span></div>}
                  </div>
                )}

                <Separator className="my-0.5" />
                <div className="flex justify-between text-[12px] font-bold">
                  <span>= Valor Líquido</span>
                  <span className="text-primary tabular-nums">{formatMoeda(calc.valorLiquido)}</span>
                </div>
              </div>

              {/* Indicadores finais */}
              <div className="bg-muted/30 rounded p-1.5 mt-1 grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px]">
                <div><span className="text-muted-foreground">Qtde</span><p className="font-bold">{qtd} cab.</p></div>
                <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{formatKg(peso)}</p></div>
                <div><span className="text-muted-foreground">Rendimento</span><p className="font-bold">{calc.rendCalc > 0 ? `${fmtR(calc.rendCalc)}%` : '-'}</p></div>
                <div><span className="text-muted-foreground">@/cab</span><p className="font-bold">{formatArroba(calc.pesoArrobaCab)}</p></div>
                <div><span className="text-muted-foreground">Total @</span><p className="font-bold">{formatArroba(calc.totalArrobas)}</p></div>
                <div><span className="text-muted-foreground">R$/@ líq.</span><p className="font-bold">{formatMoeda(calc.liqArroba)}</p></div>
                <div><span className="text-muted-foreground">R$/cab líq.</span><p className="font-bold">{formatMoeda(calc.liqCabeca)}</p></div>
                <div><span className="text-muted-foreground">R$/kg líq.</span><p className="font-bold">{formatMoeda(calc.liqKg)}</p></div>
              </div>
            </div>
          )}

          <Separator />

          {/* BLOCO 7 — Pagamento (last) */}
          {sectionTitle(<CreditCard className="h-4 w-4 text-muted-foreground" />, 'Informações de Pagamento')}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Nota Fiscal</Label>
              <Input value={notaFiscal} onChange={e => { setNotaFiscal(e.target.value); markDirty(); }} placeholder="Nº NF" className="h-7 text-[10px]" />
            </div>
            <button type="button" onClick={() => { setFormaReceb('avista'); setParcelas([]); markDirty(); }}
              className={`h-7 rounded text-[10px] font-bold border-2 transition-all self-end ${formaReceb === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaReceb('prazo'); markDirty(); if (calc.valorLiquido > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorLiquido)); }}
              className={`h-7 rounded text-[10px] font-bold border-2 transition-all self-end ${formaReceb === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>
          {formaReceb === 'prazo' && (
            <div className="space-y-1">
              <div className="w-24">
                <Label className="text-[10px]">Nº de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[10px]" />
              </div>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[9px]">Parcela {i + 1}</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); markDirty(); }} className="h-7 text-[10px]" />
                  </div>
                  <div>
                    <Label className="text-[9px]">Valor</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); markDirty(); }} className="h-7 text-[10px] text-right tabular-nums" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right tabular-nums">
                  Soma Liq.: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
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
