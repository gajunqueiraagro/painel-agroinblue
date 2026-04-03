import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { Calculator, Info } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

interface Parcela {
  data: string;
  valor: number;
}

export interface BoitelData {
  qtdCabecas: number;
  pesoInicial: number;
  fazendaOrigem: string;
  nomeBoitel: string;
  lote: string;
  numeroContrato: string;
  dataEnvio: string;
  quebraViagem: number;
  custoOportunidade: number;
  dias: number;
  gmd: number;
  rendimentoEntrada: number;
  rendimento: number;
  modalidadeCusto: 'diaria' | 'arroba' | 'parceria';
  custoDiaria: number;
  custoArroba: number;
  percentualParceria: number;
  custosExtrasParceria: number;
  custoFrete: number;
  outrosCustos: number;
  custoNutricao: number;
  custoSanidade: number;
  custoNfAbate: number;
  precoVendaArroba: number;
  despesasAbate: number;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: number;
  parcelas: Parcela[];
  possuiAdiantamento: boolean;
  dataAdiantamento: string;
  pctAdiantamentoDiarias: number;
  valorAdiantamentoDiarias: number;
  valorAdiantamentoSanitario: number;
  valorAdiantamentoOutros: number;
  valorTotalAntecipado: number;
  adiantamentoObservacao: string;
  _faturamentoBruto?: number;
  _faturamentoLiquido?: number;
  _receitaProdutor?: number;
  _custoTotal?: number;
  _lucroTotal?: number;
  _boitelId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: BoitelData) => void;
  initialData?: Partial<BoitelData>;
  quantidade?: number;
  pesoKg?: number;
  fazendaNome?: string;
  dataLancamento?: string;
  destinoNome?: string;
}

const defaultData: BoitelData = {
  qtdCabecas: 0,
  pesoInicial: 0,
  fazendaOrigem: '',
  nomeBoitel: '',
  lote: '',
  numeroContrato: '',
  dataEnvio: '',
  quebraViagem: 3,
  custoOportunidade: 0,
  dias: 90,
  gmd: 0.800,
  rendimentoEntrada: 50,
  rendimento: 52,
  modalidadeCusto: 'diaria',
  custoDiaria: 0,
  custoArroba: 0,
  percentualParceria: 50,
  custosExtrasParceria: 0,
  custoFrete: 0,
  outrosCustos: 0,
  custoNutricao: 0,
  custoSanidade: 0,
  custoNfAbate: 0,
  precoVendaArroba: 0,
  despesasAbate: 0,
  formaReceb: 'avista',
  qtdParcelas: 1,
  parcelas: [],
  possuiAdiantamento: false,
  dataAdiantamento: '',
  pctAdiantamentoDiarias: 0,
  valorAdiantamentoDiarias: 0,
  valorAdiantamentoSanitario: 0,
  valorAdiantamentoOutros: 0,
  valorTotalAntecipado: 0,
  adiantamentoObservacao: '',
};

function fmtPeso(v: number) { return formatKg(v); }
function fmtGmd(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg/dia';
}
function fmtArr(v: number) { return formatArroba(v); }
function fmtPct1(v: number) {
  if (v === null || v === undefined || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

export function BoitelPlanningDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, fazendaNome, dataLancamento, destinoNome }: Props) {
  const [data, setData] = useState<BoitelData>({ ...defaultData });

  useEffect(() => {
    if (open) {
      setData({
        ...defaultData,
        qtdCabecas: quantidade || 0,
        pesoInicial: pesoKg || 0,
        fazendaOrigem: fazendaNome || '',
        dataEnvio: dataLancamento || '',
        nomeBoitel: destinoNome || '',
        ...initialData,
      });
    }
  }, [open, initialData, quantidade, pesoKg, fazendaNome, dataLancamento, destinoNome]);

  const set = useCallback(<K extends keyof BoitelData>(key: K, value: BoitelData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const dataAbateISO = useMemo(() => {
    if (!data.dataEnvio || !data.dias) return '';
    try { return format(addDays(parseISO(data.dataEnvio), data.dias), 'yyyy-MM-dd'); } catch { return ''; }
  }, [data.dataEnvio, data.dias]);

  const dataAbate = useMemo(() => {
    if (!dataAbateISO) return '';
    try { return format(parseISO(dataAbateISO), 'dd/MM/yyyy'); } catch { return ''; }
  }, [dataAbateISO]);

  const calc = useMemo(() => {
    const {
      qtdCabecas, pesoInicial, quebraViagem, dias, gmd, rendimentoEntrada, rendimento,
      modalidadeCusto, custoDiaria, custoArroba, percentualParceria,
      custoFrete, custoOportunidade,
      custoSanidade, outrosCustos,
      precoVendaArroba, despesasAbate, custoNfAbate,
    } = data;

    const pesoLiqEntrada = pesoInicial * (1 - quebraViagem / 100);
    const ganhoKg = gmd * dias;
    const pesoFinal = pesoInicial + ganhoKg;

    const arrobasEntradaFazenda = pesoInicial / 30;
    const arrobasEntrada = (pesoLiqEntrada * rendimentoEntrada / 100) / 15;
    const arrobasSaida = (pesoFinal * rendimento / 100) / 15;
    const arrobasProduzidasCab = arrobasSaida - arrobasEntradaFazenda;
    const arrobasProduzidas = arrobasProduzidasCab * qtdCabecas;
    const arrobasTotalSaida = arrobasSaida * qtdCabecas;

    const gmc = dias > 0 ? ((pesoFinal * rendimento / 100) - (pesoLiqEntrada * rendimentoEntrada / 100)) / dias : 0;

    const faturamentoBrutoAbate = arrobasTotalSaida * precoVendaArroba;
    const custosAbate = despesasAbate + custoNfAbate;
    const faturamentoLiquido = faturamentoBrutoAbate - custosAbate;

    let custoDiariaTotal = 0;
    if (modalidadeCusto === 'diaria') {
      custoDiariaTotal = custoDiaria * dias * qtdCabecas;
    } else if (modalidadeCusto === 'arroba') {
      custoDiariaTotal = custoArroba * arrobasProduzidas;
    }

    const custosSanitarios = custoSanidade;
    const outrosCustosOp = outrosCustos;
    const custosFreteTotal = custoFrete;
    const custosOperacionais = custoDiariaTotal + custosSanitarios + outrosCustosOp + custosFreteTotal;
    const resultadoComBoitel = faturamentoLiquido - custoDiariaTotal - custosSanitarios - outrosCustosOp;
    const totalOperacional = resultadoComBoitel - custosFreteTotal;

    const custoOportTotal = custoOportunidade * pesoInicial * qtdCabecas;
    const custoOportCab = qtdCabecas > 0 ? custoOportTotal / qtdCabecas : 0;
    const custoOportKg = pesoInicial > 0 ? custoOportCab / pesoInicial : 0;

    let receitaProdutor = faturamentoLiquido;
    let parceiroParte = 0;
    let parceiroArrobas = 0;
    if (modalidadeCusto === 'parceria') {
      parceiroArrobas = arrobasProduzidas * (percentualParceria / 100);
      parceiroParte = parceiroArrobas * precoVendaArroba;
      receitaProdutor = faturamentoLiquido - parceiroParte;
    }

    const resultadoLiquido = receitaProdutor - custosOperacionais;
    const resultadoLiqCab = qtdCabecas > 0 ? resultadoLiquido / qtdCabecas : 0;
    const resultadoLiqKg = pesoInicial > 0 ? resultadoLiqCab / pesoInicial : 0;

    const lucroViabilidade = resultadoLiquido - custoOportTotal;
    const lucroViabCab = qtdCabecas > 0 ? lucroViabilidade / qtdCabecas : 0;
    const lucroViabKg = pesoInicial > 0 ? lucroViabCab / pesoInicial : 0;

    const custoPorCab = qtdCabecas > 0 ? custosOperacionais / qtdCabecas : 0;
    const custoPorArrobaProduzida = arrobasProduzidas > 0 ? custosOperacionais / arrobasProduzidas : 0;

    const quebraCab = pesoInicial * (quebraViagem / 100);
    const custoDiariaCabPeriodo = custoDiaria * dias;
    const freteCab = qtdCabecas > 0 ? custoFrete / qtdCabecas : 0;
    const sanidadeCab = qtdCabecas > 0 ? custoSanidade / qtdCabecas : 0;
    const outrosCab = qtdCabecas > 0 ? outrosCustos / qtdCabecas : 0;
    const precoVendaCab = arrobasSaida * precoVendaArroba;
    const despesasAbateCab = qtdCabecas > 0 ? despesasAbate / qtdCabecas : 0;
    const custoOportCabCalc = custoOportunidade * pesoInicial;

    return {
      pesoLiqEntrada, ganhoKg, pesoFinal,
      arrobasEntradaFazenda, arrobasEntrada, arrobasSaida, arrobasProduzidasCab, arrobasProduzidas, arrobasTotalSaida,
      gmc,
      faturamentoBrutoAbate, custosAbate, faturamentoLiquido,
      parceiroParte, parceiroArrobas, receitaProdutor,
      custoDiariaTotal, custosSanitarios, outrosCustosOp,
      custosFreteTotal, custosOperacionais, resultadoComBoitel, totalOperacional,
      custoOportTotal, custoOportCab, custoOportKg,
      custoPorCab, custoPorArrobaProduzida,
      resultadoLiquido, resultadoLiqCab, resultadoLiqKg,
      lucroViabilidade, lucroViabCab, lucroViabKg,
      quebraCab, custoDiariaCabPeriodo, freteCab, sanidadeCab, outrosCab,
      precoVendaCab, despesasAbateCab, custoOportCabCalc,
    };
  }, [data]);

  const gerarParcelas = useCallback((numParcelas: number, valorTotal: number): Parcela[] => {
    const base = dataAbateISO || data.dataEnvio || '';
    const p: Parcela[] = [];
    const vp = valorTotal / numParcelas;
    for (let i = 0; i < numParcelas; i++) {
      try {
        const d = addDays(parseISO(base), 30 * (i + 1));
        p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
      } catch {
        p.push({ data: '', valor: Math.round(vp * 100) / 100 });
      }
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((valorTotal - rest) * 100) / 100;
    }
    return p;
  }, [dataAbateISO, data.dataEnvio]);

  const handleFormaRecebChange = (forma: 'avista' | 'prazo') => {
    set('formaReceb', forma);
    if (forma === 'avista') {
      set('parcelas', []);
    } else {
      const n = data.qtdParcelas || 1;
      const base = calc.resultadoComBoitel - calc.parceiroParte;
      set('parcelas', gerarParcelas(n, base));
    }
  };

  const handleQtdParcelasChange = (v: string) => {
    const n = Math.max(1, Math.min(48, Number(v) || 1));
    set('qtdParcelas', n);
    const base = calc.resultadoComBoitel - calc.parceiroParte;
    set('parcelas', gerarParcelas(n, base));
  };

  const baseParcelamento = (calc.resultadoComBoitel - calc.parceiroParte) - (data.possuiAdiantamento ? data.valorTotalAntecipado : 0);

  useEffect(() => {
    if (data.possuiAdiantamento) {
      const total = data.valorAdiantamentoDiarias + data.valorAdiantamentoSanitario + data.valorAdiantamentoOutros;
      if (total !== data.valorTotalAntecipado) {
        setData(prev => ({ ...prev, valorTotalAntecipado: total }));
      }
    }
  }, [data.possuiAdiantamento, data.valorAdiantamentoDiarias, data.valorAdiantamentoSanitario, data.valorAdiantamentoOutros]);

  useEffect(() => {
    if (data.possuiAdiantamento && data.pctAdiantamentoDiarias > 0) {
      const valDiarias = Math.round(calc.custoDiariaTotal * data.pctAdiantamentoDiarias / 100 * 100) / 100;
      if (valDiarias !== data.valorAdiantamentoDiarias) {
        setData(prev => ({ ...prev, valorAdiantamentoDiarias: valDiarias }));
      }
    }
  }, [data.possuiAdiantamento, data.pctAdiantamentoDiarias, calc.custoDiariaTotal]);

  useEffect(() => {
    if (data.formaReceb === 'prazo' && data.qtdParcelas > 0 && baseParcelamento > 0) {
      const newParcelas = gerarParcelas(data.qtdParcelas, baseParcelamento);
      setData(prev => ({ ...prev, parcelas: newParcelas }));
    }
  }, [baseParcelamento, data.formaReceb, data.qtdParcelas, dataAbateISO]);

  const handleSave = () => {
    const dataWithSnapshot: BoitelData = {
      ...data,
      _faturamentoBruto: calc.faturamentoBrutoAbate,
      _faturamentoLiquido: calc.faturamentoLiquido,
      _receitaProdutor: calc.receitaProdutor,
      _custoTotal: calc.custosOperacionais,
      _lucroTotal: calc.resultadoLiquido,
    };
    onSave(dataWithSnapshot);
    onClose();
  };

  const isPositive = calc.resultadoLiquido > 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[96vw] w-[1400px] max-h-[94vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-4 pt-3 pb-0 shrink-0">
          <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Simulador Boitel
          </DialogTitle>
        </DialogHeader>

        <TooltipProvider delayDuration={200}>
          <div className="flex-1 overflow-hidden px-4 pb-3 pt-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_20rem] gap-3 h-full">

              {/* ═══════════════════════════════════════════════════
                  COLUNA 1 — DADOS BASE
                  ═══════════════════════════════════════════════════ */}
              <div className="space-y-2.5 overflow-y-auto pr-1 pb-2" style={{ maxHeight: 'calc(94vh - 80px)' }}>
                <ColTitle>Dados Base</ColTitle>

                {/* Linha 1: Cabeças | Peso inicial | Peso líq entrada */}
                <div className="grid grid-cols-3 gap-1.5">
                  <F label="Cabeças">
                    <Inp type="number" value={data.qtdCabecas || ''} onChange={e => set('qtdCabecas', Number(e.target.value) || 0)} />
                  </F>
                  <F label="Peso inicial (kg)">
                    <Inp type="number" value={data.pesoInicial || ''} onChange={e => set('pesoInicial', Number(e.target.value) || 0)} />
                  </F>
                  <F label="Peso líq. entrada">
                    <CalcVal>{fmtPeso(calc.pesoLiqEntrada)}</CalcVal>
                    <Hint>Após quebra de {fmtPct1(data.quebraViagem)}</Hint>
                  </F>
                </div>

                {/* Linha 2: Fazenda origem */}
                <F label="Fazenda origem">
                  <CalcVal className="text-[11px]">{data.fazendaOrigem || '-'}</CalcVal>
                </F>

                {/* Linha 3: Data envio | Data abate */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Data envio">
                    <Inp type="date" value={data.dataEnvio} onChange={e => set('dataEnvio', e.target.value)} />
                  </F>
                  <F label="Data de abate">
                    <CalcVal className="text-primary">{dataAbate || '-'}</CalcVal>
                    <Hint>Envio + {data.dias} dias</Hint>
                  </F>
                </div>

                {/* Linha 4: Boitel/Destino | Modalidade */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Boitel / Destino">
                    <Inp value={data.nomeBoitel} onChange={e => set('nomeBoitel', e.target.value)} placeholder="Nome" />
                  </F>
                  <F label="Modalidade">
                    <Select value={data.modalidadeCusto} onValueChange={(v: any) => set('modalidadeCusto', v)}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diaria" className="text-[11px]">Diária</SelectItem>
                        <SelectItem value="arroba" className="text-[11px]">Arroba</SelectItem>
                        <SelectItem value="parceria" className="text-[11px]">Parceria</SelectItem>
                      </SelectContent>
                    </Select>
                  </F>
                </div>

                {/* Linha 5: Lote | Nº contrato */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Lote">
                    <Inp value={data.lote} onChange={e => set('lote', e.target.value)} placeholder="Lote" />
                  </F>
                  <F label="Nº Contrato / Baia">
                    <Inp value={data.numeroContrato} onChange={e => set('numeroContrato', e.target.value)} placeholder="Contrato" />
                  </F>
                </div>

                {/* ADIANTAMENTO */}
                <Separator className="my-1" />
                <ColSubtitle>Adiantamento ao Boitel</ColSubtitle>
                <div className="flex items-center gap-2">
                  <Label className="text-[9px]">Pagamento antecipado?</Label>
                  <ToggleBtn active={data.possuiAdiantamento} onClick={() => set('possuiAdiantamento', true)}>Sim</ToggleBtn>
                  <ToggleBtn active={!data.possuiAdiantamento} onClick={() => {
                    set('possuiAdiantamento', false);
                    set('valorAdiantamentoDiarias', 0); set('valorAdiantamentoSanitario', 0);
                    set('valorAdiantamentoOutros', 0); set('valorTotalAntecipado', 0);
                    set('pctAdiantamentoDiarias', 0); set('dataAdiantamento', ''); set('adiantamentoObservacao', '');
                  }}>Não</ToggleBtn>
                </div>
                {data.possuiAdiantamento && (
                  <div className="space-y-1.5 bg-muted/30 rounded p-2 border">
                    <div className="grid grid-cols-2 gap-1.5">
                      <F label="Data adiantamento">
                        <Inp type="date" value={data.dataAdiantamento} onChange={e => set('dataAdiantamento', e.target.value)} />
                      </F>
                      <F label="% sobre diárias">
                        <Inp type="number" value={data.pctAdiantamentoDiarias || ''} onChange={e => set('pctAdiantamentoDiarias', Number(e.target.value) || 0)} step="1" min="0" max="100" />
                        <Hint>Total diárias: {formatMoeda(calc.custoDiariaTotal)}</Hint>
                      </F>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <F label="Diárias (R$)">
                        <Inp type="number" value={data.valorAdiantamentoDiarias || ''} onChange={e => { set('valorAdiantamentoDiarias', Number(e.target.value) || 0); set('pctAdiantamentoDiarias', 0); }} />
                      </F>
                      <F label="Sanitário (R$)">
                        <Inp type="number" value={data.valorAdiantamentoSanitario || ''} onChange={e => set('valorAdiantamentoSanitario', Number(e.target.value) || 0)} />
                      </F>
                      <F label="Outros (R$)">
                        <Inp type="number" value={data.valorAdiantamentoOutros || ''} onChange={e => set('valorAdiantamentoOutros', Number(e.target.value) || 0)} />
                      </F>
                    </div>
                    <div className="flex justify-between items-center bg-primary/5 rounded px-2 py-1 border border-primary/20">
                      <span className="text-[9px] font-bold">Total Antecipado</span>
                      <span className="text-[11px] font-bold text-primary tabular-nums">{formatMoeda(data.valorTotalAntecipado)}</span>
                    </div>
                    <F label="Observação">
                      <Inp value={data.adiantamentoObservacao} onChange={e => set('adiantamentoObservacao', e.target.value)} placeholder="Ex: 30% diárias + sanitário" />
                    </F>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════
                  COLUNA 2 — DESEMPENHO
                  ═══════════════════════════════════════════════════ */}
              <div className="space-y-2.5 overflow-y-auto pr-1 pb-2" style={{ maxHeight: 'calc(94vh - 80px)' }}>
                <ColTitle>Desempenho</ColTitle>

                {/* Linha 1: Quebra viagem | Custo oportunidade */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Quebra viagem (%)">
                    <Inp type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', Number(e.target.value) || 0)} step="0.1" />
                    <Hint>{fmtPeso(calc.quebraCab)}/cab</Hint>
                  </F>
                  <F label="Custo oport. (R$/kg)">
                    <Inp type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', Number(e.target.value) || 0)} step="0.01" />
                    <Hint>{formatMoeda(calc.custoOportCabCalc)}/cab</Hint>
                  </F>
                </div>

                {/* Linha 2: Dias | GMD */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Dias confinamento">
                    <Inp type="number" value={data.dias || ''} onChange={e => set('dias', Number(e.target.value) || 0)} />
                  </F>
                  <F label="GMD (kg/dia)">
                    <Inp type="number" value={data.gmd || ''} onChange={e => set('gmd', Number(e.target.value) || 0)} step="0.001" />
                  </F>
                </div>

                {/* Linha 3: Rendimentos */}
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Rend. entrada (%)">
                    <Inp type="number" value={data.rendimentoEntrada || ''} onChange={e => set('rendimentoEntrada', Number(e.target.value) || 0)} step="0.1" />
                  </F>
                  <F label="Rend. saída (%)">
                    <Inp type="number" value={data.rendimento || ''} onChange={e => set('rendimento', Number(e.target.value) || 0)} step="0.1" />
                  </F>
                </div>

                {/* Linha 4: Calculados (info) */}
                <div className="bg-muted/40 rounded border p-2 space-y-1">
                  <span className="text-[8px] uppercase font-bold text-muted-foreground">Resultados calculados</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <InfoVal label="Peso final" value={fmtPeso(calc.pesoFinal)} tip="Peso inicial + (GMD × Dias)" />
                    <InfoVal label="@ produzidas" value={fmtArr(calc.arrobasProduzidas)} tip="(@saída - @entrada) × cabeças" />
                    <InfoVal label="Ganho/cab" value={fmtPeso(calc.ganhoKg)} tip="GMD × Dias" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <InfoVal label="GMC (carcaça/dia)" value={fmtGmd(calc.gmc)} tip="(Carcaça saída - Carcaça entrada) / Dias" />
                    <InfoVal label="@ saída/cab" value={fmtArr(calc.arrobasSaida)} tip="(Peso final × Rend. saída) / 15" />
                  </div>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════
                  COLUNA 3 — CUSTOS + VENDA
                  ═══════════════════════════════════════════════════ */}
              <div className="space-y-2.5 overflow-y-auto pr-1 pb-2" style={{ maxHeight: 'calc(94vh - 80px)' }}>
                <ColTitle>Custos + Venda</ColTitle>

                {/* BLOCO CUSTOS */}
                <ColSubtitle>Custos</ColSubtitle>
                <div className="grid grid-cols-2 gap-1.5">
                  {data.modalidadeCusto === 'diaria' && (
                    <F label="R$/cab/dia">
                      <Inp type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', Number(e.target.value) || 0)} step="0.01" />
                      <Hint>{formatMoeda(calc.custoDiariaCabPeriodo)}/cab período</Hint>
                    </F>
                  )}
                  {data.modalidadeCusto === 'arroba' && (
                    <F label="R$/@ produzida">
                      <Inp type="number" value={data.custoArroba || ''} onChange={e => set('custoArroba', Number(e.target.value) || 0)} />
                    </F>
                  )}
                  {data.modalidadeCusto === 'parceria' && (
                    <>
                      <F label="% do parceiro">
                        <Inp type="number" value={data.percentualParceria || ''} onChange={e => set('percentualParceria', Number(e.target.value) || 0)} min="0" max="100" />
                        <Hint>Sua parte: {100 - (data.percentualParceria || 0)}%</Hint>
                      </F>
                      <F label="Custos extras (R$)">
                        <Inp type="number" value={data.custosExtrasParceria || ''} onChange={e => set('custosExtrasParceria', Number(e.target.value) || 0)} />
                      </F>
                    </>
                  )}
                  <F label="Frete (R$)">
                    <Inp type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', Number(e.target.value) || 0)} />
                    <Hint>{formatMoeda(calc.freteCab)}/cab</Hint>
                  </F>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Sanidade (R$)">
                    <Inp type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', Number(e.target.value) || 0)} />
                    <Hint>{formatMoeda(calc.sanidadeCab)}/cab</Hint>
                  </F>
                  <F label="Outros custos (R$)">
                    <Inp type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', Number(e.target.value) || 0)} />
                    <Hint>{formatMoeda(calc.outrosCab)}/cab</Hint>
                  </F>
                </div>

                {/* BLOCO COMERCIALIZAÇÃO */}
                <Separator className="my-1" />
                <ColSubtitle>Comercialização</ColSubtitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <F label="Preço venda (R$/@)">
                    <Inp type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', Number(e.target.value) || 0)} step="0.01" />
                    <Hint>{formatMoeda(calc.precoVendaCab)}/cab</Hint>
                  </F>
                  <F label="Despesas abate (R$)">
                    <Inp type="number" value={data.despesasAbate || ''} onChange={e => set('despesasAbate', Number(e.target.value) || 0)} />
                    <Hint>{formatMoeda(calc.despesasAbateCab)}/cab</Hint>
                  </F>
                </div>
                <F label="NF Abate (R$)">
                  <Inp type="number" value={data.custoNfAbate || ''} onChange={e => set('custoNfAbate', Number(e.target.value) || 0)} />
                </F>

                {/* BLOCO RECEBIMENTO */}
                <Separator className="my-1" />
                <ColSubtitle>Recebimento</ColSubtitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <ToggleBtn active={data.formaReceb === 'avista'} onClick={() => handleFormaRecebChange('avista')} full>À vista</ToggleBtn>
                  <ToggleBtn active={data.formaReceb === 'prazo'} onClick={() => handleFormaRecebChange('prazo')} full>A prazo</ToggleBtn>
                </div>
                {data.formaReceb === 'prazo' && (
                  <div className="space-y-1.5">
                    <F label="Qtd. parcelas">
                      <Inp type="number" min="1" max="48" value={data.qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} />
                    </F>
                    {data.parcelas.map((p, i) => (
                      <div key={i} className="grid grid-cols-2 gap-1.5 bg-muted/30 rounded p-1.5">
                        <div>
                          <Label className="text-[8px]">Parcela {i + 1}</Label>
                          <Inp type="date" value={p.data} onChange={e => {
                            const np = [...data.parcelas]; np[i] = { ...np[i], data: e.target.value };
                            set('parcelas', np);
                          }} />
                        </div>
                        <div>
                          <Label className="text-[8px]">Valor</Label>
                          <Inp type="number" value={String(p.valor)} onChange={e => {
                            const np = [...data.parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 };
                            set('parcelas', np);
                          }} />
                        </div>
                      </div>
                    ))}
                    <div className="text-[8px] text-muted-foreground text-right space-y-0.5">
                      <div>Base: {formatMoeda(baseParcelamento)}</div>
                      {data.parcelas.length > 0 && (
                        <div>Soma: {formatMoeda(data.parcelas.reduce((s, p) => s + p.valor, 0))}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════
                  COLUNA 4 — RESUMO FIXO (STICKY)
                  ═══════════════════════════════════════════════════ */}
              <div className="bg-muted/30 rounded-lg border p-3 space-y-2 overflow-y-auto text-[10px]" style={{ maxHeight: 'calc(94vh - 80px)' }}>
                <ColTitle>Resumo</ColTitle>

                {/* INDICADORES */}
                <RGroup label="Indicadores">
                  <RRow label="GMD" value={fmtGmd(data.gmd)} tip="Ganho médio diário" />
                  <RRow label="GMC" value={fmtGmd(calc.gmc)} tip="Ganho médio carcaça/dia" />
                  <RRow label="@ produzidas" value={fmtArr(calc.arrobasProduzidas)} tip="(@saída - @entrada) × cab" />
                  <RRow label="Custo/@" value={formatMoeda(calc.custoPorArrobaProduzida)} tip="Custos operacionais / @ produzidas" cls="text-destructive" />
                </RGroup>

                <Separator />

                {/* RECEITA */}
                <RGroup label="Receita">
                  <RRow label="Faturamento Bruto" value={formatMoeda(calc.faturamentoBrutoAbate)} bold tip="@ total saída × Preço/@" />
                  <RRow label="(-) Custos Abate" value={formatMoeda(calc.custosAbate)} cls="text-destructive" />
                  <DashedLine />
                  <RRow label="= Faturamento Líquido" value={formatMoeda(calc.faturamentoLiquido)} bold accent />
                  {data.modalidadeCusto === 'parceria' && calc.parceiroParte > 0 && (
                    <RRow label={`(-) Parceiro ${data.percentualParceria}%`} value={formatMoeda(calc.parceiroParte)} cls="text-destructive" />
                  )}
                </RGroup>

                <Separator />

                {/* OPERACIONAL */}
                <RGroup label="Operacional">
                  <RRow label="(-) Diárias" value={formatMoeda(calc.custoDiariaTotal)} cls="text-destructive" />
                  <RRow label="(-) Sanidade" value={formatMoeda(calc.custosSanitarios)} cls="text-destructive" />
                  <RRow label="(-) Outros" value={formatMoeda(calc.outrosCustosOp)} cls="text-destructive" />
                  <DashedLine />
                  <RRow label="= Resultado c/ Boitel" value={formatMoeda(calc.resultadoComBoitel)} bold accent />
                  <RRow label="(-) Frete" value={formatMoeda(calc.custosFreteTotal)} cls="text-destructive" />
                  <DashedLine />
                  <RRow label="= Total Operacional" value={formatMoeda(calc.totalOperacional)} bold accent />
                </RGroup>

                {/* CONCILIAÇÃO */}
                {data.possuiAdiantamento && data.valorTotalAntecipado > 0 && (
                  <>
                    <Separator />
                    <RGroup label="Conciliação Financeira">
                      <RRow label="Resultado c/ Boitel" value={formatMoeda(calc.resultadoComBoitel)} bold />
                      <RRow label="(+) Adiantamento pago" value={formatMoeda(data.valorTotalAntecipado)} cls="text-destructive" />
                      <DashedLine />
                      <RRow label="= Saldo a receber" value={formatMoeda(calc.resultadoComBoitel - data.valorTotalAntecipado)} bold accent />
                      <RRow label="(-) Frete" value={formatMoeda(calc.custosFreteTotal)} cls="text-destructive" />
                      <DashedLine />
                      <RRow label="= Saldo líquido final" value={formatMoeda(calc.resultadoComBoitel - data.valorTotalAntecipado - calc.custosFreteTotal)} bold accent />
                    </RGroup>
                  </>
                )}

                <Separator />

                {/* RESULTADO FINAL — DESTAQUE */}
                <div className={`rounded border px-3 py-2.5 text-center ${isPositive ? 'bg-green-50/80 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-destructive/5 border-destructive/20'}`}>
                  <span className="text-[8px] text-muted-foreground block uppercase font-bold tracking-wide">Total Operacional</span>
                  <strong className={`text-[15px] tabular-nums ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                    {formatMoeda(calc.totalOperacional)}
                  </strong>
                  <Separator className="my-1.5" />
                  <span className="text-[8px] text-muted-foreground block uppercase font-bold tracking-wide">Resultado Líquido</span>
                  <strong className={`text-[15px] tabular-nums ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                    {formatMoeda(calc.resultadoLiquido)}
                  </strong>
                  <div className="flex justify-between text-[9px] mt-1 text-muted-foreground">
                    <span>/cab: <strong className="text-foreground tabular-nums">{formatMoeda(calc.resultadoLiqCab)}</strong></span>
                    <span>/kg: <strong className="text-foreground tabular-nums">{formatMoeda(calc.resultadoLiqKg)}</strong></span>
                  </div>
                </div>

                {/* CUSTO OPORTUNIDADE */}
                <RGroup label="Custo Oportunidade">
                  <RRow label="Total" value={formatMoeda(calc.custoOportTotal)} cls="text-destructive" />
                  <RRow label="/cab" value={formatMoeda(calc.custoOportCab)} cls="text-destructive" />
                </RGroup>

                <Separator />
                <RGroup label="Viabilidade Comparada">
                  <RRow label="Lucro Líquido" value={formatMoeda(calc.lucroViabilidade)} bold cls={calc.lucroViabilidade >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                  <RRow label="/cab" value={formatMoeda(calc.lucroViabCab)} cls={calc.lucroViabCab >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                  <RRow label="/kg" value={formatMoeda(calc.lucroViabKg)} cls={calc.lucroViabKg >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                </RGroup>

                {/* ACTIONS */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={onClose} className="flex-1 text-[10px] h-7">Cancelar</Button>
                  <Button size="sm" onClick={handleSave} className="flex-1 font-bold text-[10px] h-7">Salvar</Button>
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════ */

function ColTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide border-b pb-1">{children}</h3>;
}

function ColSubtitle({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-bold uppercase text-muted-foreground flex items-center gap-1">{children}</span>;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[9px] leading-tight">{label}</Label>
      {children}
    </div>
  );
}

function Inp(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={`h-7 text-[11px] tabular-nums text-right ${props.className || ''}`} />;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[8px] text-muted-foreground italic block mt-0.5">{children}</span>;
}

function CalcVal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`h-7 flex items-center px-2 rounded bg-muted/50 border text-[11px] font-medium tabular-nums ${className}`}>
      {children}
    </div>
  );
}

function InfoVal({ label, value, tip }: { label: string; value: string; tip?: string }) {
  const content = (
    <div className="text-center">
      <span className="text-[8px] text-muted-foreground block">{label}</span>
      <strong className="text-[11px] tabular-nums text-foreground">{value}</strong>
    </div>
  );
  if (!tip) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div className="cursor-help">{content}</div></TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] max-w-[200px]">{tip}</TooltipContent>
    </Tooltip>
  );
}

function ToggleBtn({ active, onClick, children, full }: { active: boolean; onClick: () => void; children: React.ReactNode; full?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`h-6 px-3 rounded text-[10px] font-bold border-2 transition-all ${full ? 'w-full' : ''} ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
      {children}
    </button>
  );
}

function RGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[8px] font-bold uppercase text-muted-foreground tracking-wide">{label}</span>
      {children}
    </div>
  );
}

function RRow({ label, value, bold, accent, cls = '', tip }: { label: string; value: string; bold?: boolean; accent?: boolean; cls?: string; tip?: string }) {
  const row = (
    <div className="flex justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${accent ? 'text-primary' : ''} ${cls}`}>{value}</span>
    </div>
  );
  if (!tip) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div className="cursor-help">{row}</div></TooltipTrigger>
      <TooltipContent side="left" className="text-[10px] max-w-[220px]">{tip}</TooltipContent>
    </Tooltip>
  );
}

function DashedLine() {
  return <div className="border-t border-dashed my-0.5" />;
}
