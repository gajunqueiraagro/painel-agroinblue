import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { TrendingUp, DollarSign, Calendar, Truck, Calculator, Info, ShoppingCart } from 'lucide-react';

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
function fmtPerCab(total: number, qtd: number) {
  if (!qtd || qtd === 0) return '-';
  return formatMoeda(total / qtd) + '/cab';
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
    const pesoFinal = pesoLiqEntrada + ganhoKg;

    const arrobasEntrada = (pesoLiqEntrada * rendimentoEntrada / 100) / 15;
    const arrobasSaida = (pesoFinal * rendimento / 100) / 15;
    const arrobasProduzidas = (arrobasSaida - arrobasEntrada) * qtdCabecas;
    const arrobasTotalSaida = arrobasSaida * qtdCabecas;

    const gmc = dias > 0 ? ((pesoFinal * rendimento / 100) - (pesoLiqEntrada * rendimentoEntrada / 100)) / dias : 0;

    // ── FATURAMENTO ──
    const faturamentoBrutoAbate = arrobasTotalSaida * precoVendaArroba;
    const custosAbate = despesasAbate + custoNfAbate;
    const faturamentoLiquido = faturamentoBrutoAbate - custosAbate;

    // ── CUSTOS OPERACIONAIS ──
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

    // Resultado com Boitel (antes do frete)
    const resultadoComBoitel = faturamentoLiquido - custoDiariaTotal - custosSanitarios - outrosCustosOp;

    // ── CUSTO DE OPORTUNIDADE — usa pesoInicial (peso de saída da fazenda) ──
    const custoOportTotal = custoOportunidade * pesoInicial * qtdCabecas;
    const custoOportCab = qtdCabecas > 0 ? custoOportTotal / qtdCabecas : 0;
    const custoOportKg = pesoInicial > 0 ? custoOportCab / pesoInicial : 0;

    // ── PARCERIA ──
    let receitaProdutor = faturamentoLiquido;
    let parceiroParte = 0;
    let parceiroArrobas = 0;
    if (modalidadeCusto === 'parceria') {
      parceiroArrobas = arrobasProduzidas * (percentualParceria / 100);
      parceiroParte = parceiroArrobas * precoVendaArroba;
      receitaProdutor = faturamentoLiquido - parceiroParte;
    }

    // ── RESULTADO LÍQUIDO ──
    const resultadoLiquido = receitaProdutor - custosOperacionais;
    const resultadoLiqCab = qtdCabecas > 0 ? resultadoLiquido / qtdCabecas : 0;
    // Resultado Líq./kg = resultado líq. por cabeça / peso inicial saída fazenda
    const resultadoLiqKg = pesoInicial > 0 ? resultadoLiqCab / pesoInicial : 0;

    // ── VIABILIDADE COMPARADA ──
    const lucroViabilidade = resultadoLiquido - custoOportTotal;
    const lucroViabCab = qtdCabecas > 0 ? lucroViabilidade / qtdCabecas : 0;
    const lucroViabKg = pesoInicial > 0 ? lucroViabCab / pesoInicial : 0;

    const custoPorCab = qtdCabecas > 0 ? custosOperacionais / qtdCabecas : 0;
    const custoPorArrobaProduzida = arrobasProduzidas > 0 ? custosOperacionais / arrobasProduzidas : 0;

    // per-head helper values
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
      arrobasEntrada, arrobasSaida, arrobasProduzidas, arrobasTotalSaida,
      gmc,
      faturamentoBrutoAbate, custosAbate, faturamentoLiquido,
      parceiroParte, parceiroArrobas, receitaProdutor,
      custoDiariaTotal, custosSanitarios, outrosCustosOp,
      custosFreteTotal, custosOperacionais, resultadoComBoitel,
      custoOportTotal, custoOportCab, custoOportKg,
      custoPorCab, custoPorArrobaProduzida,
      resultadoLiquido, resultadoLiqCab, resultadoLiqKg,
      lucroViabilidade, lucroViabCab, lucroViabKg,
      // per-head helpers
      quebraCab, custoDiariaCabPeriodo, freteCab, sanidadeCab, outrosCab,
      precoVendaCab, despesasAbateCab, custoOportCabCalc,
    };
  }, [data]);

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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-4 pb-0">
          <DialogTitle className="text-[14px] font-bold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Simulador Boitel
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">

          {/* CABEÇALHO — Identificação */}
          <div className="bg-muted/40 rounded-md px-4 py-2.5 border space-y-2">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[10px] text-muted-foreground block">Cabeças</span>
                <strong className="text-[14px]">{data.qtdCabecas || '-'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Peso inicial (saída fazenda)</span>
                <strong className="text-[14px]">{fmtPeso(data.pesoInicial)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Peso líq. entrada</span>
                <strong className="text-[14px] text-primary">{fmtPeso(calc.pesoLiqEntrada)}</strong>
              </div>
              <span className="text-[9px] text-muted-foreground ml-auto flex items-center gap-1">
                <Info className="h-3 w-3" /> Peso base para cálculo: saída da fazenda
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <div>
                <Label className="text-[9px] text-muted-foreground">Fazenda Origem</Label>
                <div className="text-[11px] font-medium truncate">{data.fazendaOrigem || '-'}</div>
              </div>
              <Field label="Data Envio">
                <Input type="date" value={data.dataEnvio} onChange={e => set('dataEnvio', e.target.value)} className="h-6 text-[11px]" />
              </Field>
              <Field label="Boitel / Destino">
                <Input value={data.nomeBoitel} onChange={e => set('nomeBoitel', e.target.value)} className="h-6 text-[11px]" placeholder="Nome do boitel" />
              </Field>
              <Field label="Modalidade">
                <Select value={data.modalidadeCusto} onValueChange={(v: any) => set('modalidadeCusto', v)}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria" className="text-[11px]">Diária</SelectItem>
                    <SelectItem value="arroba" className="text-[11px]">Arroba</SelectItem>
                    <SelectItem value="parceria" className="text-[11px]">Parceria</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lote">
                <Input value={data.lote} onChange={e => set('lote', e.target.value)} className="h-6 text-[11px]" placeholder="Lote" />
              </Field>
              <Field label="Nº Contrato / Baia">
                <Input value={data.numeroContrato} onChange={e => set('numeroContrato', e.target.value)} className="h-6 text-[11px]" placeholder="Contrato" />
              </Field>
            </div>
          </div>

          {/* 2 COLUNAS: INPUT | RESULTADO */}
          <div className="grid grid-cols-[1fr_320px] gap-4">

            {/* ── COLUNA ESQUERDA: INPUTS ── */}
            <div className="space-y-3">

              {/* ENTRADA */}
              <Section icon={<Truck className="h-3.5 w-3.5" />} title="Entrada">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Quebra de viagem (%)">
                    <Input type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.1" />
                    <HintBelow>{fmtPct1(data.quebraViagem)} → {fmtPeso(calc.quebraCab)}/cab</HintBelow>
                  </Field>
                  <Field label="Custo oportunidade (R$/kg)">
                    <Input type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                    <HintBelow>{formatMoeda(data.custoOportunidade)}/kg → {formatMoeda(calc.custoOportCabCalc)}/cab</HintBelow>
                  </Field>
                </div>
              </Section>

              {/* PERÍODO */}
              <Section icon={<Calendar className="h-3.5 w-3.5" />} title="Período">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Dias confinamento">
                    <Input type="number" value={data.dias || ''} onChange={e => set('dias', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                  </Field>
                  <Field label="GMD (kg/dia)">
                    <Input type="number" value={data.gmd || ''} onChange={e => set('gmd', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.001" />
                    <HintBelow>{fmtGmd(data.gmd)}</HintBelow>
                  </Field>
                  <Field label="Rend. entrada (%)">
                    <Input type="number" value={data.rendimentoEntrada || ''} onChange={e => set('rendimentoEntrada', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.1" />
                    <HintBelow>{fmtPct1(data.rendimentoEntrada)}</HintBelow>
                  </Field>
                  <Field label="Rend. saída (%)">
                    <Input type="number" value={data.rendimento || ''} onChange={e => set('rendimento', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.1" />
                    <HintBelow>{fmtPct1(data.rendimento)}</HintBelow>
                  </Field>
                </div>
                {(data.gmd > 0 && data.dias > 0) && (
                  <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                    <span>Peso final: <strong className="text-foreground">{fmtPeso(calc.pesoFinal)}</strong></span>
                    <span>@/cab: <strong className="text-foreground">{fmtArr(calc.arrobasSaida)}</strong></span>
                    <span>Ganho: <strong className="text-foreground">{fmtPeso(calc.ganhoKg)}</strong></span>
                  </div>
                )}
              </Section>

              {/* CUSTOS */}
              <Section icon={<DollarSign className="h-3.5 w-3.5" />} title="Custos">
                <div className="grid grid-cols-2 gap-2">
                  {data.modalidadeCusto === 'diaria' && (
                    <Field label="R$/cab/dia">
                      <Input type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                      <HintBelow>Período: {formatMoeda(calc.custoDiariaCabPeriodo)}/cab</HintBelow>
                    </Field>
                  )}
                  {data.modalidadeCusto === 'arroba' && (
                    <Field label="R$/@ produzida">
                      <Input type="number" value={data.custoArroba || ''} onChange={e => set('custoArroba', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </Field>
                  )}
                  {data.modalidadeCusto === 'parceria' && (
                    <>
                      <Field label="% do parceiro">
                        <Input type="number" value={data.percentualParceria || ''} onChange={e => set('percentualParceria', Number(e.target.value) || 0)} className="h-7 text-[11px]" min="0" max="100" />
                        <HintBelow>Sua parte: {100 - (data.percentualParceria || 0)}%</HintBelow>
                      </Field>
                      <Field label="Custos extras do acordo (R$)">
                        <Input type="number" value={data.custosExtrasParceria || ''} onChange={e => set('custosExtrasParceria', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                      </Field>
                    </>
                  )}
                  <Field label="Frete (R$)">
                    <Input type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    <HintBelow>{formatMoeda(calc.freteCab)}/cab</HintBelow>
                  </Field>
                  <Field label="Sanidade (R$)">
                    <Input type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    <HintBelow>{formatMoeda(calc.sanidadeCab)}/cab</HintBelow>
                  </Field>
                  <Field label="Outros custos (R$)">
                    <Input type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    <HintBelow>{formatMoeda(calc.outrosCab)}/cab</HintBelow>
                  </Field>
                </div>
              </Section>

              {/* COMERCIALIZAÇÃO */}
              <Section icon={<ShoppingCart className="h-3.5 w-3.5" />} title="Comercialização">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Preço venda (R$/@)">
                    <Input type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                    <HintBelow>{formatMoeda(calc.precoVendaCab)}/cab</HintBelow>
                  </Field>
                  <Field label="Despesas abate (R$)">
                    <Input type="number" value={data.despesasAbate || ''} onChange={e => set('despesasAbate', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    <HintBelow>{formatMoeda(calc.despesasAbateCab)}/cab</HintBelow>
                  </Field>
                  <Field label="NF Abate (R$)">
                    <Input type="number" value={data.custoNfAbate || ''} onChange={e => set('custoNfAbate', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                  </Field>
                </div>
              </Section>
            </div>

            {/* ── COLUNA DIREITA: RESULTADO ── */}
            <div className="bg-muted/30 rounded-lg border p-3 space-y-2 h-fit sticky top-0 text-[11px]">

              {/* BLOCO 1 — INDICADORES */}
              <ResultGroup label="Indicadores">
                <ResultRow label="GMD" value={fmtGmd(data.gmd)} />
                <ResultRow label="GMC (kg carcaça/dia)" value={fmtGmd(calc.gmc)} />
                <ResultRow label="@ produzidas" value={fmtArr(calc.arrobasProduzidas)} />
                <ResultRow label="Custo por @ Produzida" value={formatMoeda(calc.custoPorArrobaProduzida)} />
              </ResultGroup>

              <Separator />

              {/* BLOCO 2 — RECEITA */}
              <ResultGroup label="Receita">
                <ResultRow label="Faturamento Bruto Abate" value={formatMoeda(calc.faturamentoBrutoAbate)} bold />
                <ResultRow label="(-) Custos com Abate" value={formatMoeda(calc.custosAbate)} className="text-destructive" />
                <div className="border-t border-dashed my-0.5" />
                <ResultRow label="= Faturamento Líquido" value={formatMoeda(calc.faturamentoLiquido)} bold accent />
                {data.modalidadeCusto === 'parceria' && calc.parceiroParte > 0 && (
                  <>
                    <ResultRow label={`(-) Parceiro (${data.percentualParceria}% = ${fmtArr(calc.parceiroArrobas)})`} value={formatMoeda(calc.parceiroParte)} className="text-destructive" />
                    <ResultRow label="= Receita Produtor" value={formatMoeda(calc.receitaProdutor)} bold accent />
                  </>
                )}
              </ResultGroup>

              <Separator />

              {/* BLOCO 3 — OPERACIONAL */}
              <ResultGroup label="Operacional">
                <ResultRow label="(-) Custo com Diárias" value={formatMoeda(calc.custoDiariaTotal)} className="text-destructive" />
                <ResultRow label="(-) Custos Sanitários" value={formatMoeda(calc.custosSanitarios)} className="text-destructive" />
                <ResultRow label="(-) Outros Custos" value={formatMoeda(calc.outrosCustosOp)} className="text-destructive" />
                <div className="border-t border-dashed my-0.5" />
                <ResultRow label="= Resultado com Boitel" value={formatMoeda(calc.resultadoComBoitel)} bold accent />
                <ResultRow label="(-) Custos com Frete" value={formatMoeda(calc.custosFreteTotal)} className="text-destructive" />
                <div className="border-t border-dashed my-0.5" />
                <ResultRow label="= Total Operacional" value={formatMoeda(calc.custosOperacionais)} className="text-destructive" bold />
                <ResultRow label="Custo/@ produzida" value={formatMoeda(calc.custoPorArrobaProduzida)} className="text-destructive" />
                <ResultRow label="Custo/cab" value={formatMoeda(calc.custoPorCab)} className="text-destructive" />
              </ResultGroup>

              <Separator />

              {/* BLOCO 4 — RESULTADO LÍQUIDO POR GADO MAGRO */}
              <ResultGroup label="Resultado Líquido por Gado Magro">
                <div className={`rounded border px-2.5 py-2 text-center ${isPositive ? 'bg-green-50/80 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-destructive/5 border-destructive/20'}`}>
                  <span className="text-[8px] text-muted-foreground block uppercase font-bold">Total</span>
                  <strong className={`text-[16px] ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                    {formatMoeda(calc.resultadoLiquido)}
                  </strong>
                </div>
                <ResultRow label="Resultado Líq. / cabeça" value={formatMoeda(calc.resultadoLiqCab)} bold />
                <ResultRow label="Resultado Líq. / kg" value={formatMoeda(calc.resultadoLiqKg)} bold />
              </ResultGroup>

              <Separator />

              {/* BLOCO 5 — CUSTO OPORTUNIDADE */}
              <ResultGroup label="Custo Oportunidade">
                <ResultRow label="Custo oportunidade Total" value={formatMoeda(calc.custoOportTotal)} className="text-destructive" />
                <ResultRow label="Custo oportunidade (R$/cabeça)" value={formatMoeda(calc.custoOportCab)} className="text-destructive" />
                <ResultRow label="Custo oportunidade (R$/kg)" value={formatMoeda(calc.custoOportKg)} className="text-destructive" />
              </ResultGroup>

              <Separator />

              {/* BLOCO 6 — VIABILIDADE COMPARADA */}
              <ResultGroup label="Viabilidade Comparada ao dia do envio dos animais">
                <ResultRow label="Lucro Total (R$)" value={formatMoeda(calc.lucroViabilidade)} bold className={calc.lucroViabilidade >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                <ResultRow label="Lucro (R$/cabeça)" value={formatMoeda(calc.lucroViabCab)} className={calc.lucroViabCab >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                <ResultRow label="Lucro (R$/kg)" value={formatMoeda(calc.lucroViabKg)} className={calc.lucroViabKg >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
              </ResultGroup>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1 text-[11px]">Cancelar</Button>
                <Button size="sm" onClick={handleSave} className="flex-1 font-bold text-[11px]">Salvar Planejamento</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-components ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">{icon} {title}</h4>
      <Separator />
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}

function HintBelow({ children }: { children: React.ReactNode }) {
  return <span className="text-[8px] text-muted-foreground italic block mt-0.5">{children}</span>;
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold uppercase text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ResultRow({ label, value, className = '', bold, accent }: { label: string; value: string; className?: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${accent ? 'text-primary' : ''} ${className}`}>{value}</span>
    </div>
  );
}
