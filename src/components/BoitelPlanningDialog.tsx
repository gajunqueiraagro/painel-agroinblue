import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import { Calculator, ChevronDown } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

interface Parcela { data: string; valor: number; }

export interface BoitelData {
  qtdCabecas: number; pesoInicial: number; fazendaOrigem: string; nomeBoitel: string;
  lote: string; numeroContrato: string; dataEnvio: string; quebraViagem: number;
  custoOportunidade: number; dias: number; gmd: number; rendimentoEntrada: number;
  rendimento: number; modalidadeCusto: 'diaria' | 'arroba' | 'parceria';
  custoDiaria: number; custoArroba: number; percentualParceria: number;
  custosExtrasParceria: number; custoFrete: number; outrosCustos: number;
  custoNutricao: number; custoSanidade: number; custoNfAbate: number;
  precoVendaArroba: number; despesasAbate: number;
  formaReceb: 'avista' | 'prazo'; qtdParcelas: number; parcelas: Parcela[];
  possuiAdiantamento: boolean; dataAdiantamento: string; pctAdiantamentoDiarias: number;
  valorAdiantamentoDiarias: number; valorAdiantamentoSanitario: number;
  valorAdiantamentoOutros: number; valorTotalAntecipado: number; adiantamentoObservacao: string;
  _faturamentoBruto?: number; _faturamentoLiquido?: number; _receitaProdutor?: number;
  _custoTotal?: number; _lucroTotal?: number; _boitelId?: string;
}

interface Props {
  open: boolean; onClose: () => void; onSave: (data: BoitelData) => void;
  initialData?: Partial<BoitelData>; quantidade?: number; pesoKg?: number;
  fazendaNome?: string; dataLancamento?: string; destinoNome?: string;
}

const defaultData: BoitelData = {
  qtdCabecas: 0, pesoInicial: 0, fazendaOrigem: '', nomeBoitel: '', lote: '',
  numeroContrato: '', dataEnvio: '', quebraViagem: 3, custoOportunidade: 0, dias: 90,
  gmd: 0.800, rendimentoEntrada: 50, rendimento: 52, modalidadeCusto: 'diaria',
  custoDiaria: 0, custoArroba: 0, percentualParceria: 50, custosExtrasParceria: 0,
  custoFrete: 0, outrosCustos: 0, custoNutricao: 0, custoSanidade: 0, custoNfAbate: 0,
  precoVendaArroba: 0, despesasAbate: 0, formaReceb: 'avista', qtdParcelas: 1, parcelas: [],
  possuiAdiantamento: false, dataAdiantamento: '', pctAdiantamentoDiarias: 0,
  valorAdiantamentoDiarias: 0, valorAdiantamentoSanitario: 0, valorAdiantamentoOutros: 0,
  valorTotalAntecipado: 0, adiantamentoObservacao: '',
};

function fmtP(v: number) { return formatKg(v); }
function fmtG(v: number) { if (!v || isNaN(v)) return '-'; return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmtA(v: number) { return formatArroba(v); }
function fmtPct2(v: number) { if (v === null || v === undefined || isNaN(v)) return '-'; return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
function fmtPct1(v: number) { if (v === null || v === undefined || isNaN(v)) return '-'; return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
function fmtR$(v: number) { if (v === null || v === undefined || isNaN(v)) return '-'; return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(iso: string) { if (!iso) return '-'; try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return '-'; } }

export function BoitelPlanningDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, fazendaNome, dataLancamento, destinoNome }: Props) {
  const [data, setData] = useState<BoitelData>({ ...defaultData });

  useEffect(() => {
    if (open) setData({ ...defaultData, qtdCabecas: quantidade || 0, pesoInicial: pesoKg || 0, fazendaOrigem: fazendaNome || '', dataEnvio: dataLancamento || '', nomeBoitel: destinoNome || '', ...initialData });
  }, [open, initialData, quantidade, pesoKg, fazendaNome, dataLancamento, destinoNome]);

  const set = useCallback(<K extends keyof BoitelData>(key: K, value: BoitelData[K]) => { setData(prev => ({ ...prev, [key]: value })); }, []);

  const dataAbateISO = useMemo(() => {
    if (!data.dataEnvio || !data.dias) return '';
    try { return format(addDays(parseISO(data.dataEnvio), data.dias), 'yyyy-MM-dd'); } catch { return ''; }
  }, [data.dataEnvio, data.dias]);

  const calc = useMemo(() => {
    const { qtdCabecas: q, pesoInicial: pi, quebraViagem: qv, dias, gmd, rendimentoEntrada: re, rendimento: rs, modalidadeCusto: mc, custoDiaria: cd, custoArroba: ca, percentualParceria: pp, custoFrete: cf, custoOportunidade: co, custoSanidade: cs, outrosCustos: oc, precoVendaArroba: pva, despesasAbate: da, custoNfAbate: nf } = data;
    const ple = pi * (1 - qv / 100);
    const ganho = gmd * dias;
    const pf = pi + ganho;
    const aEF = pi / 30;
    const aS = (pf * rs / 100) / 15;
    const aPcab = aS - aEF;
    const aP = aPcab * q;
    const aTS = aS * q;
    const gmc = dias > 0 ? ((pf * rs / 100) - (ple * re / 100)) / dias : 0;
    const fba = aTS * pva;
    const cAb = da + nf;
    const fLiq = fba - cAb;
    let cDT = 0;
    if (mc === 'diaria') cDT = cd * dias * q;
    else if (mc === 'arroba') cDT = ca * aP;
    const cOp = cDT + cs + oc + cf;
    const rBoitel = fLiq - cDT - cs - oc;
    const tOp = rBoitel - cf;
    const coT = co * pi * q;
    const coCab = q > 0 ? coT / q : 0;
    let rProd = fLiq, pParte = 0, pArr = 0;
    if (mc === 'parceria') { pArr = aP * (pp / 100); pParte = pArr * pva; rProd = fLiq - pParte; }
    const rLiq = rProd - cOp;
    const rLCab = q > 0 ? rLiq / q : 0;
    const rLKg = pi > 0 ? rLCab / pi : 0;
    const lViab = rLiq - coT;
    const lVCab = q > 0 ? lViab / q : 0;
    const lVKg = pi > 0 ? lVCab / pi : 0;
    const cPCab = q > 0 ? cOp / q : 0;
    const cPArr = aP > 0 ? cOp / aP : 0;
    const custoTotalBoitel = cDT + cs + oc;
    const margemVenda = fba > 0 ? ((fba - cOp) / fba * 100) : 0;
    // Oportunidade per-unit
    const coKg = co;
    const coCabC = co * pi;
    return { ple, ganho, pf, aEF, aS, aPcab, aP, aTS, gmc, fba, cAb, fLiq, pParte, pArr, rProd, cDT, cs, oc, cf, cOp, rBoitel, tOp, coT, coCab, rLiq, rLCab, rLKg, lViab, lVCab, lVKg, cPCab, cPArr, custoTotalBoitel, margemVenda, coKg, coCabC };
  }, [data]);

  const gerarParcelas = useCallback((n: number, total: number): Parcela[] => {
    const base = dataAbateISO || data.dataEnvio || '';
    const p: Parcela[] = [];
    const vp = total / n;
    for (let i = 0; i < n; i++) { try { p.push({ data: format(addDays(parseISO(base), 30 * (i + 1)), 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 }); } catch { p.push({ data: '', valor: Math.round(vp * 100) / 100 }); } }
    if (p.length > 0) { const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0); p[p.length - 1].valor = Math.round((total - rest) * 100) / 100; }
    return p;
  }, [dataAbateISO, data.dataEnvio]);

  const handleForma = (f: 'avista' | 'prazo') => { set('formaReceb', f); if (f === 'avista') set('parcelas', []); else set('parcelas', gerarParcelas(data.qtdParcelas || 1, calc.rBoitel - calc.pParte)); };
  const handleQtdP = (v: string) => { const n = Math.max(1, Math.min(48, Number(v) || 1)); set('qtdParcelas', n); set('parcelas', gerarParcelas(n, calc.rBoitel - calc.pParte)); };
  const basePar = (calc.rBoitel - calc.pParte) - (data.possuiAdiantamento ? data.valorTotalAntecipado : 0);

  useEffect(() => { if (data.possuiAdiantamento) { const t = data.valorAdiantamentoDiarias + data.valorAdiantamentoSanitario + data.valorAdiantamentoOutros; if (t !== data.valorTotalAntecipado) setData(p => ({ ...p, valorTotalAntecipado: t })); } }, [data.possuiAdiantamento, data.valorAdiantamentoDiarias, data.valorAdiantamentoSanitario, data.valorAdiantamentoOutros]);
  useEffect(() => { if (data.possuiAdiantamento && data.pctAdiantamentoDiarias > 0) { const v = Math.round(calc.cDT * data.pctAdiantamentoDiarias / 100 * 100) / 100; if (v !== data.valorAdiantamentoDiarias) setData(p => ({ ...p, valorAdiantamentoDiarias: v })); } }, [data.possuiAdiantamento, data.pctAdiantamentoDiarias, calc.cDT]);
  useEffect(() => { if (data.formaReceb === 'prazo' && data.qtdParcelas > 0 && basePar > 0) setData(p => ({ ...p, parcelas: gerarParcelas(p.qtdParcelas, basePar) })); }, [basePar, data.formaReceb, data.qtdParcelas, dataAbateISO]);

  const handleSave = () => { onSave({ ...data, _faturamentoBruto: calc.fba, _faturamentoLiquido: calc.fLiq, _receitaProdutor: calc.rProd, _custoTotal: calc.cOp, _lucroTotal: calc.rLiq }); onClose(); };

  const pos = calc.rLiq > 0;
  const saldoReceber = calc.fba - calc.custoTotalBoitel + data.valorTotalAntecipado;

  // Comparativo oportunidade
  const diffTotal = calc.rLiq - calc.coT;
  const diffCab = calc.rLCab - calc.coCabC;
  const diffKg = calc.rLKg - calc.coKg;
  const pctDiffOp = calc.coT > 0 ? ((calc.rLiq - calc.coT) / calc.coT * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1180px] p-0 gap-0 overflow-hidden flex flex-col" style={{ maxHeight: '96vh' }}>
        <TooltipProvider delayDuration={200}>

          {/* ═══ CABEÇALHO AZUL PETRÓLEO ═══ */}
          <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white px-4 py-1.5 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-black tracking-widest uppercase text-slate-300">Simulador Boitel</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-0 text-[9px]">
                <HI l="Faz. Origem" v={data.fazendaOrigem || '-'} />
                <HI l="Data envio" v={fmtDate(data.dataEnvio)} />
                <HI l="Qtde cab." v={String(data.qtdCabecas || '-')} />
                <HI l="Data Abate" v={fmtDate(dataAbateISO)} />
                <HI l="Peso Saída Faz." v={fmtP(data.pesoInicial)} />
                <HI l="Período" v={`${data.dias} dias`} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0 text-[9px]">
                <HI l="Custo @ Prod." v={formatMoeda(calc.cPArr)} />
                <div className="flex gap-2 items-baseline justify-end">
                  <span className="text-slate-400 text-[8px]">RES. LÍQ. TOTAL</span>
                  <strong className={`text-[15px] tabular-nums ${pos ? 'text-emerald-300' : 'text-red-300'}`}>{formatMoeda(calc.rLiq)}</strong>
                </div>
                <HI l="Custo cab." v={formatMoeda(calc.cPCab)} />
                <div className="flex gap-2 items-baseline justify-end">
                  <span className="text-slate-400 text-[8px]">RES. LÍQ. R$/CAB</span>
                  <strong className={`text-[13px] tabular-nums ${pos ? 'text-emerald-300' : 'text-red-300'}`}>{formatMoeda(calc.rLCab)}</strong>
                </div>
                <HI l="R$/KG" v={formatMoeda(calc.rLKg)} />
                <div className="flex gap-2 items-baseline justify-end">
                  <span className="text-slate-400 text-[8px]">RES. LÍQ. R$/KG</span>
                  <strong className={`text-[13px] tabular-nums ${pos ? 'text-emerald-300' : 'text-red-300'}`}>{formatMoeda(calc.rLKg)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ CORPO — 4 COLUNAS ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.8fr_14rem] gap-x-2 gap-y-1 px-3 py-1.5 flex-1 overflow-y-auto min-h-0">

            {/* COL 1 — BASE OPERACIONAL + ADIANTAMENTO */}
            {/* COL 1 — BASE OPERACIONAL + ADIANTAMENTO */}
            <div className="space-y-1">
              <ST>Base Operacional</ST>
              <div className="grid grid-cols-3 gap-1">
                <F label="Cabeças"><I type="number" value={data.qtdCabecas || ''} onChange={e => set('qtdCabecas', +e.target.value || 0)} /></F>
                <F label="Peso inicial kg"><I type="number" value={data.pesoInicial || ''} onChange={e => set('pesoInicial', +e.target.value || 0)} step="0.01" /></F>
                <F label="Peso líq. ent."><CV>{fmtP(calc.ple)}</CV></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Boitel / Destino"><I value={data.nomeBoitel} onChange={e => set('nomeBoitel', e.target.value)} className="text-left" /></F>
                <F label="Modalidade">
                  <Select value={data.modalidadeCusto} onValueChange={(v: any) => set('modalidadeCusto', v)}>
                    <SelectTrigger className="h-5 text-[9px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria" className="text-[10px]">Diária</SelectItem>
                      <SelectItem value="arroba" className="text-[10px]">Arroba</SelectItem>
                      <SelectItem value="parceria" className="text-[10px]">Parceria</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <F label="Lote"><I value={data.lote} onChange={e => set('lote', e.target.value)} className="text-left" /></F>
              <F label="Contrato / Baia"><I value={data.numeroContrato} onChange={e => set('numeroContrato', e.target.value)} className="text-left" /></F>

              {/* ADIANTAMENTO */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[8px] font-bold uppercase text-foreground">Adiantamento p/ Boitel</span>
                <TB a={data.possuiAdiantamento} o={() => set('possuiAdiantamento', true)}>Sim</TB>
                <TB a={!data.possuiAdiantamento} o={() => { set('possuiAdiantamento', false); set('valorAdiantamentoDiarias', 0); set('valorAdiantamentoSanitario', 0); set('valorAdiantamentoOutros', 0); set('valorTotalAntecipado', 0); set('pctAdiantamentoDiarias', 0); set('dataAdiantamento', ''); set('adiantamentoObservacao', ''); }}>Não</TB>
              </div>
              {data.possuiAdiantamento && (
                <div className="bg-blue-50/60 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800 p-1 space-y-0.5">
                  <div className="grid grid-cols-2 gap-1">
                    <F label="Data"><I type="date" value={data.dataAdiantamento} onChange={e => set('dataAdiantamento', e.target.value)} /></F>
                    <F label="% diárias"><I type="number" value={data.pctAdiantamentoDiarias || ''} onChange={e => set('pctAdiantamentoDiarias', +e.target.value || 0)} step="0.1" /></F>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <F label="Diárias R$"><I type="number" value={data.valorAdiantamentoDiarias || ''} onChange={e => { set('valorAdiantamentoDiarias', +e.target.value || 0); set('pctAdiantamentoDiarias', 0); }} /></F>
                    <F label="Sanitário R$"><I type="number" value={data.valorAdiantamentoSanitario || ''} onChange={e => set('valorAdiantamentoSanitario', +e.target.value || 0)} /></F>
                    <F label="Outros R$"><I type="number" value={data.valorAdiantamentoOutros || ''} onChange={e => set('valorAdiantamentoOutros', +e.target.value || 0)} /></F>
                  </div>
                  <div className="flex justify-between text-[8px] bg-blue-100/60 dark:bg-blue-900/30 rounded px-1.5 py-0.5 border border-blue-300 dark:border-blue-700">
                    <span className="font-bold text-blue-800 dark:text-blue-300">Total</span>
                    <span className="font-bold text-blue-800 dark:text-blue-300 tabular-nums">{formatMoeda(data.valorTotalAntecipado)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* COL 2 — DESEMPENHO + CUSTOS + COMERCIALIZAÇÃO */}
            <div className="space-y-1">
              <ST>Desempenho</ST>
              <div className="grid grid-cols-2 gap-1">
                <F label="Quebra viagem %"><I type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', +e.target.value || 0)} step="0.1" /></F>
                <F label="Custo oport. R$/kg"><I type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', +e.target.value || 0)} step="0.01" /></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Dias confinamento"><I type="number" value={data.dias || ''} onChange={e => set('dias', +e.target.value || 0)} /></F>
                <F label="GMD kg/dia"><I type="number" value={data.gmd || ''} onChange={e => set('gmd', +e.target.value || 0)} step="0.001" /></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Rend. entrada %"><I type="number" value={data.rendimentoEntrada || ''} onChange={e => set('rendimentoEntrada', +e.target.value || 0)} step="0.01" /></F>
                <F label="Rend. saída %"><I type="number" value={data.rendimento || ''} onChange={e => set('rendimento', +e.target.value || 0)} step="0.01" /></F>
              </div>

              <Separator className="!my-0.5" />
              <ST>Custos</ST>
              <div className="grid grid-cols-2 gap-1">
                {data.modalidadeCusto === 'diaria' && <F label="R$/cab/dia"><I type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', +e.target.value || 0)} step="0.01" /></F>}
                {data.modalidadeCusto === 'arroba' && <F label="R$/@ prod."><I type="number" value={data.custoArroba || ''} onChange={e => set('custoArroba', +e.target.value || 0)} /></F>}
                {data.modalidadeCusto === 'parceria' && (<><F label="% parceiro"><I type="number" value={data.percentualParceria || ''} onChange={e => set('percentualParceria', +e.target.value || 0)} /></F><F label="Extras R$"><I type="number" value={data.custosExtrasParceria || ''} onChange={e => set('custosExtrasParceria', +e.target.value || 0)} /></F></>)}
                <F label="Frete R$"><I type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', +e.target.value || 0)} step="0.01" /></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Sanidade R$"><I type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', +e.target.value || 0)} /></F>
                <F label="Outros R$"><I type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', +e.target.value || 0)} step="0.01" /></F>
              </div>

              <Separator className="!my-0.5" />
              <ST>Comercialização</ST>
              <div className="grid grid-cols-2 gap-1">
                <F label="Preço venda R$/@"><I type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', +e.target.value || 0)} step="0.01" /></F>
                <F label="Despesas com abate R$"><I type="number" value={data.despesasAbate || ''} onChange={e => set('despesasAbate', +e.target.value || 0)} /></F>
              </div>
            </div>

            {/* COL 3 — RECEBIMENTO */}
            <div className="space-y-1">
              <ST>Recebimento</ST>
              <div className="grid grid-cols-2 gap-1">
                <TB a={data.formaReceb === 'avista'} o={() => handleForma('avista')} full>À vista</TB>
                <TB a={data.formaReceb === 'prazo'} o={() => handleForma('prazo')} full>A prazo</TB>
              </div>
              {data.formaReceb === 'prazo' && (
                <div className="space-y-0.5">
                  <F label="Parcelas"><I type="number" min="1" max="48" value={data.qtdParcelas} onChange={e => handleQtdP(e.target.value)} /></F>
                  <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                    {data.parcelas.map((p, i) => (
                      <div key={i} className="grid grid-cols-2 gap-1 bg-muted/20 rounded px-1 py-0.5">
                        <div><Label className="text-[7px]">P{i + 1}</Label><I type="date" value={p.data} onChange={e => { const np = [...data.parcelas]; np[i] = { ...np[i], data: e.target.value }; set('parcelas', np); }} /></div>
                        <div><Label className="text-[7px]">R$</Label><I type="number" value={String(p.valor)} onChange={e => { const np = [...data.parcelas]; np[i] = { ...np[i], valor: +e.target.value || 0 }; set('parcelas', np); }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[7px] text-muted-foreground text-right">Base: {formatMoeda(basePar)}</div>
                </div>
              )}
            </div>

            {/* COL 4 — RESULTADO + COMPARATIVO */}
            <div className="bg-muted/20 rounded-lg border p-1.5 space-y-0.5 lg:sticky lg:top-0 h-fit">
              <h3 className="text-[9px] font-black uppercase tracking-wide text-foreground mb-0.5">Resultado</h3>

              <CSection title="Indicadores" defaultOpen>
                <RR l="GMD" v={`${fmtG(data.gmd)} kg/dia`} />
                <RR l="GMC" v={`${fmtG(calc.gmc)} kg/dia`} />
                <RR l="@ prod./cab" v={fmtA(calc.aPcab)} />
                <RR l="Preço Venda R$/@" v={formatMoeda(data.precoVendaArroba)} />
                <RR l="Custo/@" v={formatMoeda(calc.cPArr)} c="text-destructive" />
                <RR l="Margem de venda" v={fmtPct1(calc.margemVenda)} />
              </CSection>

              <CSection title="Operação" defaultOpen>
                <RR l="Fat. Bruto" v={formatMoeda(calc.fba)} b />
                <RR l="(-) Custos Abate" v={formatMoeda(calc.cAb)} c="text-destructive" />
                <DL />
                <RR l="= Fat. Líquido" v={formatMoeda(calc.fLiq)} b accent />
                {data.modalidadeCusto === 'parceria' && calc.pParte > 0 && <RR l={`(-) Parceiro ${data.percentualParceria}%`} v={formatMoeda(calc.pParte)} c="text-destructive" />}
                <RR l="(-) Diárias Boitel" v={formatMoeda(calc.cDT)} c="text-destructive" />
                <RR l="(-) Sanidade Boitel" v={formatMoeda(calc.cs)} c="text-destructive" />
                <RR l="(-) Outros Boitel" v={formatMoeda(calc.oc)} c="text-destructive" />
                <DL />
                <RR l="= Res. Direto Boitel" v={formatMoeda(calc.rBoitel)} b accent />
                <RR l="(-) Frete Terceiros" v={formatMoeda(calc.cf)} c="text-destructive" />
                <DL />
                <RR l="= Total Operação" v={formatMoeda(calc.tOp)} b accent />
              </CSection>

              {data.possuiAdiantamento && data.valorTotalAntecipado > 0 && (
                <CSection title="Acerto com Boitel" defaultOpen={false}>
                  <RR l="Fat. Bruto" v={formatMoeda(calc.fba)} b />
                  <RR l="(-) Custo Total Boitel" v={`-${formatMoeda(calc.custoTotalBoitel)}`} c="text-destructive" />
                  <RR l="(+) Adiant. p/ Boitel" v={formatMoeda(data.valorTotalAntecipado)} c="text-blue-600 dark:text-blue-400" />
                  <DL />
                  <RR l="= Saldo a receber" v={formatMoeda(saldoReceber)} b accent />
                </CSection>
              )}

              {/* DESTAQUE FINAL */}
              <div className={`rounded border px-1.5 py-1 text-center ${pos ? 'bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-destructive/5 border-destructive/20'}`}>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <span className="text-[7px] uppercase text-muted-foreground font-bold block">Total Op.</span>
                    <strong className={`text-[12px] tabular-nums ${pos ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>{formatMoeda(calc.tOp)}</strong>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase text-muted-foreground font-bold block">Res. Líquido</span>
                    <strong className={`text-[12px] tabular-nums ${pos ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>{formatMoeda(calc.rLiq)}</strong>
                  </div>
                </div>
                <div className="flex justify-around text-[7px] mt-0.5 text-muted-foreground">
                  <span>/cab <strong className="text-foreground tabular-nums">{formatMoeda(calc.rLCab)}</strong></span>
                  <span>/kg <strong className="text-foreground tabular-nums">{formatMoeda(calc.rLKg)}</strong></span>
                </div>
              </div>

              {/* COMPARATIVO */}
              <Separator className="!my-0.5" />
              <ST>Comparativo Resultado</ST>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-[7px]">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="text-left px-1 py-0.5 font-semibold text-muted-foreground">Resultado</th>
                      <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground">Líquido</th>
                      <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground">Oport.</th>
                      <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground">Dif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CmpRow label="R$" liq={calc.rLiq} opp={calc.coT} diff={diffTotal} />
                    <CmpRow label="R$/cab" liq={calc.rLCab} opp={calc.coCabC} diff={diffCab} />
                    <CmpRow label="R$/kg" liq={calc.rLKg} opp={calc.coKg} diff={diffKg} />
                  </tbody>
                </table>
              </div>
              <p className="text-[7px] text-muted-foreground italic leading-tight">
                {calc.coT > 0
                  ? pctDiffOp >= 0
                    ? `Resultado ${fmtPct1(Math.abs(pctDiffOp))} acima do custo de oportunidade.`
                    : `Resultado ${fmtPct1(Math.abs(pctDiffOp))} abaixo do custo de oportunidade.`
                  : 'Informe o custo de oportunidade para comparação.'}
              </p>
            </div>
          </div>

          {/* ═══ BOTÕES — SEMPRE VISÍVEIS ═══ */}
          <div className="flex justify-end gap-2 px-3 py-1.5 border-t bg-background shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} className="text-[10px] h-7 px-4">Cancelar</Button>
            <Button size="sm" onClick={handleSave} className="font-bold text-[10px] h-7 px-6">Salvar</Button>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

/* ═══ MICRO-COMPONENTS ═══ */
function HI({ l, v }: { l: string; v: string }) {
  return <div className="flex gap-1.5"><span className="text-slate-400">{l}</span><strong className="tabular-nums text-white">{v}</strong></div>;
}
function ST({ children }: { children: React.ReactNode }) { return <h3 className="text-[9px] font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wide border-b border-slate-300 dark:border-slate-600 pb-0.5">{children}</h3>; }
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-[7px] leading-none text-muted-foreground">{label}</Label>{children}</div>; }
function I(props: React.ComponentProps<typeof Input>) { return <Input {...props} className={`h-5 text-[9px] tabular-nums text-right bg-background ${props.className || ''}`} />; }
function CV({ children }: { children: React.ReactNode }) { return <div className="h-5 flex items-center px-1.5 rounded bg-muted/50 border text-[9px] font-medium tabular-nums">{children}</div>; }
function TB({ a, o, children, full }: { a: boolean; o: () => void; children: React.ReactNode; full?: boolean }) {
  return <button type="button" onClick={o} className={`h-5 px-2 rounded text-[8px] font-bold border transition-all ${full ? 'w-full' : ''} ${a ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{children}</button>;
}
function RR({ l, v, b, accent, c = '' }: { l: string; v: string; b?: boolean; accent?: boolean; c?: string }) {
  return <div className="flex justify-between text-[8px] leading-snug"><span className="text-muted-foreground">{l}</span><span className={`tabular-nums ${b ? 'font-bold' : 'font-medium'} ${accent ? 'text-primary' : ''} ${c}`}>{v}</span></div>;
}
function DL() { return <div className="border-t border-dashed my-0.5" />; }

function CSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full group">
        <span className="text-[8px] font-bold uppercase text-foreground tracking-wide">{title}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0 pt-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CmpRow({ label, liq, opp, diff }: { label: string; liq: number; opp: number; diff: number }) {
  return (
    <tr className="border-t border-border/40">
      <td className="px-1 py-0.5 font-medium">{label}</td>
      <td className="px-1 py-0.5 text-right tabular-nums font-semibold">{formatMoeda(liq)}</td>
      <td className="px-1 py-0.5 text-right tabular-nums text-muted-foreground">{formatMoeda(opp)}</td>
      <td className={`px-1 py-0.5 text-right tabular-nums font-bold ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
        {diff >= 0 ? '+' : ''}{formatMoeda(diff)}
      </td>
    </tr>
  );
}
