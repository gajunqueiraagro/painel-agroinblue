import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TrendingUp, DollarSign, Calendar, Truck, Calculator, ArrowRight } from 'lucide-react';

export interface BoitelData {
  // Entrada
  qtdCabecas: number;
  pesoInicial: number;
  quebraViagem: number;
  custoOportunidade: number;
  // Período
  dias: number;
  gmd: number;
  rendimento: number;
  // Custos
  tipoCusto: 'diaria' | 'arroba' | 'parceria';
  custoDiaria: number;
  custoArroba: number;
  percentualParceria: number;
  custoFrete: number;
  outrosCustos: number;
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
  gmd: 0.8,
  rendimento: 52,
  tipoCusto: 'diaria',
  custoDiaria: 0,
  custoArroba: 0,
  percentualParceria: 50,
  custoFrete: 0,
  outrosCustos: 0,
};

function fmt(v: number, decimals = 2) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function BoitelPlanningDialog({ open, onClose, onSave, initialData, quantidade, pesoKg }: Props) {
  const [data, setData] = useState<BoitelData>({ ...defaultData });

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
    const { qtdCabecas, pesoInicial, quebraViagem, dias, gmd, rendimento, tipoCusto, custoDiaria, custoArroba, percentualParceria, custoFrete, outrosCustos, custoOportunidade } = data;

    // Entrada
    const pesoLiquidoEntrada = pesoInicial * (1 - quebraViagem / 100);
    const pesoTotalEntrada = pesoLiquidoEntrada * qtdCabecas;

    // Período
    const ganhoKgCab = gmd * dias;
    const pesoFinal = pesoLiquidoEntrada + ganhoKgCab;
    const pesoTotalFinal = pesoFinal * qtdCabecas;

    // Arrobas
    const pesoCarcacaEntrada = pesoLiquidoEntrada * rendimento / 100;
    const arrobasEntrada = pesoCarcacaEntrada / 15;
    const pesoCarcacaSaida = pesoFinal * rendimento / 100;
    const arrobasSaida = pesoCarcacaSaida / 15;
    const arrobasProduzidas = (arrobasSaida - arrobasEntrada) * qtdCabecas;
    const arrobasTotalSaida = arrobasSaida * qtdCabecas;

    // Custos
    let custoTotal = 0;
    if (tipoCusto === 'diaria') {
      custoTotal = custoDiaria * dias * qtdCabecas;
    } else if (tipoCusto === 'arroba') {
      custoTotal = custoArroba * arrobasProduzidas;
    } else if (tipoCusto === 'parceria') {
      // Parceria: produtor cede % das arrobas produzidas
      custoTotal = 0; // Custo operacional em parceria é zero (paga-se em arrobas)
    }

    custoTotal += custoFrete + outrosCustos + custoOportunidade;

    // Resultado parceria
    const arrobasLiquidasProdutor = tipoCusto === 'parceria'
      ? arrobasProduzidas * (1 - percentualParceria / 100)
      : arrobasProduzidas;

    const custoArrProd = arrobasProduzidas > 0 ? custoTotal / arrobasProduzidas : 0;

    return {
      pesoLiquidoEntrada,
      pesoTotalEntrada,
      ganhoKgCab,
      pesoFinal,
      pesoTotalFinal,
      arrobasEntrada,
      arrobasSaida,
      arrobasProduzidas,
      arrobasTotalSaida,
      arrobasLiquidasProdutor,
      custoTotal,
      custoArrProd,
    };
  }, [data]);

  const handleSave = () => {
    onSave(data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Planejamento Boitel
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">Simulação e modelagem de engorda em confinamento/boitel</p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ENTRADA */}
            <div className="bg-card rounded-lg border p-4 space-y-3">
              <h3 className="text-[12px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-4 w-4" /> Entrada
              </h3>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Qtde Cabeças</Label>
                  <Input type="number" value={data.qtdCabecas || ''} onChange={e => set('qtdCabecas', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px]">Peso Inicial (kg)</Label>
                  <Input type="number" value={data.pesoInicial || ''} onChange={e => set('pesoInicial', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px]">Quebra de Viagem (%)</Label>
                  <Input type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', Number(e.target.value) || 0)} className="h-8 text-[12px]" step="0.5" />
                  {calc.pesoLiquidoEntrada > 0 && (
                    <span className="text-[9px] text-muted-foreground">Peso líq. entrada: {fmt(calc.pesoLiquidoEntrada)} kg</span>
                  )}
                </div>
                <div>
                  <Label className="text-[11px]">Custo Oportunidade (R$)</Label>
                  <Input type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
                </div>
              </div>
            </div>

            {/* PERÍODO */}
            <div className="bg-card rounded-lg border p-4 space-y-3">
              <h3 className="text-[12px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Período
              </h3>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Dias de Confinamento</Label>
                  <Input type="number" value={data.dias || ''} onChange={e => set('dias', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px]">GMD (kg/dia)</Label>
                  <Input type="number" value={data.gmd || ''} onChange={e => set('gmd', Number(e.target.value) || 0)} className="h-8 text-[12px]" step="0.01" />
                  {calc.ganhoKgCab > 0 && (
                    <span className="text-[9px] text-muted-foreground">Ganho: {fmt(calc.ganhoKgCab)} kg/cab</span>
                  )}
                </div>
                <div>
                  <Label className="text-[11px]">Rendimento Carcaça (%)</Label>
                  <Input type="number" value={data.rendimento || ''} onChange={e => set('rendimento', Number(e.target.value) || 0)} className="h-8 text-[12px]" step="0.5" />
                </div>
                <div className="flex flex-col justify-end">
                  {calc.pesoFinal > 0 && (
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <div>Peso final: <strong>{fmt(calc.pesoFinal)} kg</strong></div>
                      <div>@ saída/cab: <strong>{fmt(calc.arrobasSaida)}</strong></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CUSTOS */}
          <div className="bg-card rounded-lg border p-4 space-y-3">
            <h3 className="text-[12px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Custos
            </h3>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label className="text-[11px]">Tipo de Custo</Label>
                <Select value={data.tipoCusto} onValueChange={(v: any) => set('tipoCusto', v)}>
                  <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria" className="text-[12px]">Diária (R$/cab/dia)</SelectItem>
                    <SelectItem value="arroba" className="text-[12px]">Arroba Produzida (R$/@)</SelectItem>
                    <SelectItem value="parceria" className="text-[12px]">Parceria (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {data.tipoCusto === 'diaria' && (
                <div>
                  <Label className="text-[11px]">R$/cab/dia</Label>
                  <Input type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', Number(e.target.value) || 0)} className="h-8 text-[12px]" step="0.01" />
                </div>
              )}

              {data.tipoCusto === 'arroba' && (
                <div>
                  <Label className="text-[11px]">R$/@ Produzida</Label>
                  <Input type="number" value={data.custoArroba || ''} onChange={e => set('custoArroba', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
                </div>
              )}

              {data.tipoCusto === 'parceria' && (
                <div>
                  <Label className="text-[11px]">% do Parceiro</Label>
                  <Input type="number" value={data.percentualParceria || ''} onChange={e => set('percentualParceria', Number(e.target.value) || 0)} className="h-8 text-[12px]" step="1" min="0" max="100" />
                  <span className="text-[9px] text-muted-foreground">Sua parte: {100 - (data.percentualParceria || 0)}%</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Frete (R$)</Label>
                <Input type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
              </div>
              <div>
                <Label className="text-[11px]">Outros Custos (R$)</Label>
                <Input type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', Number(e.target.value) || 0)} className="h-8 text-[12px]" />
              </div>
            </div>
          </div>

          {/* RESULTADO */}
          <div className="bg-primary/5 rounded-lg border-2 border-primary/20 p-4 space-y-3">
            <h3 className="text-[13px] font-bold uppercase text-primary flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Resultado
            </h3>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">@ Entrada/cab</span>
                <strong className="text-[16px]">{fmt(calc.arrobasEntrada)}</strong>
              </div>
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">@ Saída/cab</span>
                <strong className="text-[16px]">{fmt(calc.arrobasSaida)}</strong>
              </div>
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">@ Produzidas (total)</span>
                <strong className="text-[16px] text-primary">{fmt(calc.arrobasProduzidas)}</strong>
              </div>
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">@ Total Saída</span>
                <strong className="text-[16px]">{fmt(calc.arrobasTotalSaida)}</strong>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">Custo Total</span>
                <strong className="text-[14px] text-destructive">{formatMoeda(calc.custoTotal)}</strong>
              </div>
              <div className="bg-background rounded-md p-3 text-center border">
                <span className="text-[10px] text-muted-foreground block">Custo/@ Produzida</span>
                <strong className="text-[14px]">{calc.custoArrProd > 0 ? formatMoeda(calc.custoArrProd) : '-'}</strong>
              </div>
              {data.tipoCusto === 'parceria' && (
                <div className="bg-background rounded-md p-3 text-center border">
                  <span className="text-[10px] text-muted-foreground block">@ Líquidas (Produtor)</span>
                  <strong className="text-[14px] text-primary">{fmt(calc.arrobasLiquidasProdutor)}</strong>
                </div>
              )}
            </div>

            {/* Summary line */}
            <div className="flex items-center justify-between bg-background rounded-md p-3 border text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Peso:</span>
                <strong>{fmt(calc.pesoLiquidoEntrada)} kg</strong>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <strong>{fmt(calc.pesoFinal)} kg</strong>
                <span className="text-muted-foreground ml-2">({fmt(calc.ganhoKgCab)} kg em {data.dias} dias)</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} className="font-bold">
              Salvar Planejamento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
