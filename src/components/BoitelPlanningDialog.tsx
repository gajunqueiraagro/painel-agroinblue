import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TrendingUp, DollarSign, Calendar, Truck, Calculator, ChevronDown, Info } from 'lucide-react';

export interface BoitelData {
  qtdCabecas: number;
  pesoInicial: number;
  quebraViagem: number;
  custoOportunidade: number;
  dias: number;
  gmd: number;
  rendimento: number;
  custoDiaria: number;
  custoFrete: number;
  outrosCustos: number;
  custoNutricao: number;
  custoSanidade: number;
  custoOutrosDetalhe: number;
  custoNfAbate: number;
  precoVendaArroba: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: BoitelData) => void;
  initialData?: Partial<BoitelData>;
  quantidade?: number;
  pesoKg?: number;
}

const defaultData: BoitelData = {
  qtdCabecas: 0,
  pesoInicial: 0,
  quebraViagem: 3,
  custoOportunidade: 0,
  dias: 90,
  gmd: 0.800,
  rendimento: 52,
  custoDiaria: 0,
  custoFrete: 0,
  outrosCustos: 0,
  custoNutricao: 0,
  custoSanidade: 0,
  custoOutrosDetalhe: 0,
  custoNfAbate: 0,
  precoVendaArroba: 0,
};

function fmtPeso(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
}
function fmtGmd(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function fmtPct(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
function fmtArr(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' @';
}
function fmtNum(v: number, d = 2) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function BoitelPlanningDialog({ open, onClose, onSave, initialData, quantidade, pesoKg }: Props) {
  const [data, setData] = useState<BoitelData>({ ...defaultData });
  const [showDetalhe, setShowDetalhe] = useState(false);

  useEffect(() => {
    if (open) {
      setData({
        ...defaultData,
        qtdCabecas: quantidade || 0,
        pesoInicial: pesoKg || 0,
        ...initialData,
      });
    }
  }, [open, initialData, quantidade, pesoKg]);

  const set = useCallback(<K extends keyof BoitelData>(key: K, value: BoitelData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const calc = useMemo(() => {
    const { qtdCabecas, pesoInicial, quebraViagem, dias, gmd, rendimento, custoDiaria, custoFrete, outrosCustos, custoOportunidade, custoNutricao, custoSanidade, custoOutrosDetalhe, custoNfAbate, precoVendaArroba } = data;

    const pesoLiqEntrada = pesoInicial * (1 - quebraViagem / 100);
    const ganhoKg = gmd * dias;
    const pesoFinal = pesoLiqEntrada + ganhoKg;

    const arrobasEntrada = (pesoLiqEntrada * rendimento / 100) / 15;
    const arrobasSaida = (pesoFinal * rendimento / 100) / 15;
    const arrobasProduzidas = (arrobasSaida - arrobasEntrada) * qtdCabecas;
    const arrobasTotalSaida = arrobasSaida * qtdCabecas;

    // Custos
    const custoDiariaTotal = custoDiaria * dias * qtdCabecas;
    const custoDetalheTotal = custoNutricao + custoSanidade + custoOutrosDetalhe + custoNfAbate;
    const custoTotal = custoDiariaTotal + custoFrete + outrosCustos + custoDetalheTotal + (custoOportunidade * pesoLiqEntrada * qtdCabecas);
    const custoPorCab = qtdCabecas > 0 ? custoTotal / qtdCabecas : 0;
    const custoPorArroba = arrobasProduzidas > 0 ? custoTotal / arrobasProduzidas : 0;

    // Receita
    const receitaTotal = arrobasTotalSaida * precoVendaArroba;
    const receitaPorCab = qtdCabecas > 0 ? receitaTotal / qtdCabecas : 0;

    // Lucro
    const lucroTotal = receitaTotal - custoTotal;
    const lucroPorCab = qtdCabecas > 0 ? lucroTotal / qtdCabecas : 0;
    const lucroPorArroba = arrobasProduzidas > 0 ? lucroTotal / arrobasProduzidas : 0;
    const lucroPorKg = (ganhoKg * qtdCabecas) > 0 ? lucroTotal / (ganhoKg * qtdCabecas) : 0;

    return {
      pesoLiqEntrada, ganhoKg, pesoFinal,
      arrobasEntrada, arrobasSaida, arrobasProduzidas, arrobasTotalSaida,
      custoTotal, custoPorCab, custoPorArroba,
      receitaTotal, receitaPorCab,
      lucroTotal, lucroPorCab, lucroPorArroba, lucroPorKg,
    };
  }, [data]);

  const handleSave = () => { onSave(data); onClose(); };

  const isPositive = calc.lucroTotal > 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-4 pb-0">
          <DialogTitle className="text-[14px] font-bold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Simulador Boitel
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">

          {/* CABEÇALHO — Dados automáticos */}
          <div className="flex items-center gap-6 bg-muted/40 rounded-md px-4 py-2.5 border">
            <div>
              <span className="text-[10px] text-muted-foreground block">Cabeças</span>
              <strong className="text-[14px]">{data.qtdCabecas || '-'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Peso inicial</span>
              <strong className="text-[14px]">{fmtPeso(data.pesoInicial)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Peso líq. entrada</span>
              <strong className="text-[14px] text-primary">{fmtPeso(calc.pesoLiqEntrada)}</strong>
            </div>
            <span className="text-[9px] text-muted-foreground ml-auto flex items-center gap-1">
              <Info className="h-3 w-3" /> Peso base: saída da fazenda
            </span>
          </div>

          {/* GRID: Entrada + Período + Custos */}
          <div className="grid grid-cols-3 gap-3">

            {/* ENTRADA */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" /> Entrada
              </h4>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-[10px]">Quebra de viagem (%)</Label>
                  <Input type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.5" />
                </div>
                <div>
                  <Label className="text-[10px]">Custo oportunidade (R$/kg)</Label>
                  <Input type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                  <span className="text-[8px] text-muted-foreground italic">Referência: preço atual de mercado da categoria</span>
                </div>
              </div>
            </div>

            {/* PERÍODO */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Período
              </h4>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-[10px]">Dias de confinamento</Label>
                  <Input type="number" value={data.dias || ''} onChange={e => set('dias', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                </div>
                <div>
                  <Label className="text-[10px]">GMD (kg/dia)</Label>
                  <Input type="number" value={data.gmd || ''} onChange={e => set('gmd', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.001" />
                  {calc.ganhoKg > 0 && <span className="text-[9px] text-muted-foreground">Ganho: {fmtPeso(calc.ganhoKg)}</span>}
                </div>
                <div>
                  <Label className="text-[10px]">Rendimento carcaça (%)</Label>
                  <Input type="number" value={data.rendimento || ''} onChange={e => set('rendimento', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.5" />
                </div>
                {calc.pesoFinal > 0 && (
                  <div className="bg-muted/30 rounded px-2 py-1 text-[9px] space-y-0.5">
                    <div>Peso final: <strong>{fmtPeso(calc.pesoFinal)}</strong></div>
                    <div>@ saída/cab: <strong>{fmtArr(calc.arrobasSaida)}</strong></div>
                  </div>
                )}
              </div>
            </div>

            {/* CUSTOS */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" /> Custos
              </h4>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-[10px]">Custo (R$/cab/dia)</Label>
                  <Input type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                </div>
                <div>
                  <Label className="text-[10px]">Frete (R$)</Label>
                  <Input type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Outros custos (R$)</Label>
                  <Input type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                </div>

                <Collapsible open={showDetalhe} onOpenChange={setShowDetalhe}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-primary hover:underline cursor-pointer">
                    <ChevronDown className={`h-3 w-3 transition-transform ${showDetalhe ? 'rotate-180' : ''}`} />
                    Ver detalhamento de custos
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1.5 pt-1">
                    <div>
                      <Label className="text-[10px]">Nutrição (R$)</Label>
                      <Input type="number" value={data.custoNutricao || ''} onChange={e => set('custoNutricao', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Sanidade (R$)</Label>
                      <Input type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Outros (R$)</Label>
                      <Input type="number" value={data.custoOutrosDetalhe || ''} onChange={e => set('custoOutrosDetalhe', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </div>
                    <div>
                      <Label className="text-[10px]">NF Abate (R$)</Label>
                      <Input type="number" value={data.custoNfAbate || ''} onChange={e => set('custoNfAbate', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>

          {/* RESULTADO */}
          <div className="bg-primary/5 rounded-lg border-2 border-primary/20 p-4 space-y-3">
            <h4 className="text-[12px] font-bold uppercase text-primary flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Resultado
            </h4>

            {/* Preço venda input */}
            <div className="flex items-end gap-3">
              <div className="w-44">
                <Label className="text-[10px]">Preço venda (R$/@)</Label>
                <Input type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', Number(e.target.value) || 0)} className="h-7 text-[11px] border-primary/30" step="0.01" />
              </div>
              <div className="text-[10px] text-muted-foreground">
                @ produzidas: <strong className="text-foreground">{fmtArr(calc.arrobasProduzidas)}</strong>
                <span className="mx-2">|</span>
                @ total saída: <strong className="text-foreground">{fmtArr(calc.arrobasTotalSaida)}</strong>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-3 text-center">
              {/* Receita */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase text-muted-foreground block">Receita</span>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por cabeça</span>
                  <strong className="text-[13px]">{formatMoeda(calc.receitaPorCab)}</strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Total</span>
                  <strong className="text-[13px]">{formatMoeda(calc.receitaTotal)}</strong>
                </div>
              </div>

              {/* Custos */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase text-muted-foreground block">Custos</span>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por cabeça</span>
                  <strong className="text-[13px] text-destructive">{formatMoeda(calc.custoPorCab)}</strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por arroba</span>
                  <strong className="text-[13px] text-destructive">{formatMoeda(calc.custoPorArroba)}</strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Total</span>
                  <strong className="text-[13px] text-destructive">{formatMoeda(calc.custoTotal)}</strong>
                </div>
              </div>

              {/* Lucro */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase text-muted-foreground block">Lucro</span>
                <div className={`rounded border-2 px-2 py-2 ${isPositive ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700' : 'bg-destructive/5 border-destructive/20'}`}>
                  <span className="text-[9px] text-muted-foreground block">Lucro líquido total</span>
                  <strong className={`text-[16px] ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                    {formatMoeda(calc.lucroTotal)}
                  </strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por cabeça</span>
                  <strong className="text-[12px]">{formatMoeda(calc.lucroPorCab)}</strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por arroba</span>
                  <strong className="text-[12px]">{formatMoeda(calc.lucroPorArroba)}</strong>
                </div>
                <div className="bg-background rounded border px-2 py-1.5">
                  <span className="text-[9px] text-muted-foreground block">Por kg</span>
                  <strong className="text-[12px]">{formatMoeda(calc.lucroPorKg)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} className="font-bold">Salvar Planejamento</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
