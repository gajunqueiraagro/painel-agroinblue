import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import { Calculator } from 'lucide-react';
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
function fmtPct(v: number) { if (v === null || v === undefined || isNaN(v)) return '-'; return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
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
    const qCab = pi * (qv / 100);
    const cdCP = cd * dias;
    const frCab = q > 0 ? cf / q : 0;
    const saCab = q > 0 ? cs / q : 0;
    const oCab = q > 0 ? oc / q : 0;
    const pvCab = aS * pva;
    const daCab = q > 0 ? da / q : 0;
    const coCabC = co * pi;
    return { ple, ganho, pf, aEF, aS, aPcab, aP, aTS, gmc, fba, cAb, fLiq, pParte, pArr, rProd, cDT, cs, oc, cf: cf, cOp, rBoitel, tOp, coT, coCab, rLiq, rLCab, rLKg, lViab, lVCab, lVKg, cPCab, cPArr, qCab, cdCP, frCab, saCab, oCab, pvCab, daCab, coCabC };
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
  const saldoFinal = calc.rBoitel - data.valorTotalAntecipado - calc.cf;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[98vw] w-[1440px] p-0 gap-0 overflow-hidden" style={{ maxHeight: '96vh' }}>
        <TooltipProvider delayDuration={200}>

          {/* ═══ CABEÇALHO AZUL ═══ */}
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-4 py-2.5">
            <div className="flex items-center justify-between">
              {/* Lado esquerdo: título + dados base */}
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-blue-300" />
                  <span className="text-[12px] font-bold tracking-wide">SIMULADOR BOITEL</span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <HChip label="Cabeças" value={String(data.qtdCabecas || '-')} />
                  <HChip label="Peso inicial" value={fmtP(data.pesoInicial)} />
                  <HChip label="Peso líq." value={fmtP(calc.ple)} />
                  <HChip label="Envio" value={fmtDate(data.dataEnvio)} />
                  <HChip label="Abate" value={fmtDate(dataAbateISO)} />
                  <HChip label="Dias" value={String(data.dias)} />
                  <HChip label="Destino" value={data.nomeBoitel || '-'} />
                </div>
              </div>

              {/* Lado direito: resultado principal */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[8px] uppercase text-blue-300 block">Resultado Líquido</span>
                  <strong className={`text-[18px] tabular-nums leading-tight ${pos ? 'text-green-300' : 'text-red-300'}`}>{formatMoeda(calc.rLiq)}</strong>
                </div>
                <div className="flex gap-3 text-right">
                  <div>
                    <span className="text-[7px] uppercase text-blue-300 block">R$/cab</span>
                    <strong className={`text-[13px] tabular-nums ${pos ? 'text-green-300' : 'text-red-300'}`}>{formatMoeda(calc.rLCab)}</strong>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase text-blue-300 block">R$/kg</span>
                    <strong className={`text-[13px] tabular-nums ${pos ? 'text-green-300' : 'text-red-300'}`}>{formatMoeda(calc.rLKg)}</strong>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase text-blue-300 block">@ prod.</span>
                    <strong className="text-[13px] tabular-nums text-blue-100">{fmtA(calc.aP)}</strong>
                  </div>
                  {data.possuiAdiantamento && data.valorTotalAntecipado > 0 && (
                    <div>
                      <span className="text-[7px] uppercase text-blue-300 block">Saldo caixa</span>
                      <strong className={`text-[13px] tabular-nums ${saldoFinal >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatMoeda(saldoFinal)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ CORPO — 4 COLUNAS ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_18rem] gap-2 px-3 py-2 overflow-y-auto" style={{ maxHeight: 'calc(96vh - 56px)' }}>

            {/* COL 1 — BASE OPERACIONAL */}
            <div className="space-y-1.5">
              <CT>Base Operacional</CT>
              <div className="grid grid-cols-3 gap-1">
                <F label="Cabeças"><I type="number" value={data.qtdCabecas || ''} onChange={e => set('qtdCabecas', +e.target.value || 0)} /></F>
                <F label="Peso inicial"><I type="number" value={data.pesoInicial || ''} onChange={e => set('pesoInicial', +e.target.value || 0)} /></F>
                <F label="Peso líq. ent."><CV>{fmtP(calc.ple)}</CV></F>
              </div>
              <F label="Fazenda origem"><CV>{data.fazendaOrigem || '-'}</CV></F>
              <div className="grid grid-cols-2 gap-1">
                <F label="Data envio"><I type="date" value={data.dataEnvio} onChange={e => set('dataEnvio', e.target.value)} /></F>
                <F label="Data abate"><CV cls="text-primary">{fmtDate(dataAbateISO)}</CV></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Boitel / Destino"><I value={data.nomeBoitel} onChange={e => set('nomeBoitel', e.target.value)} /></F>
                <F label="Modalidade">
                  <Select value={data.modalidadeCusto} onValueChange={(v: any) => set('modalidadeCusto', v)}>
                    <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria" className="text-[10px]">Diária</SelectItem>
                      <SelectItem value="arroba" className="text-[10px]">Arroba</SelectItem>
                      <SelectItem value="parceria" className="text-[10px]">Parceria</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Lote"><I value={data.lote} onChange={e => set('lote', e.target.value)} /></F>
                <F label="Contrato / Baia"><I value={data.numeroContrato} onChange={e => set('numeroContrato', e.target.value)} /></F>
              </div>

              {/* Adiantamento inline */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[8px] font-bold uppercase text-muted-foreground">Adiantamento</span>
                <TB a={data.possuiAdiantamento} o={() => set('possuiAdiantamento', true)}>Sim</TB>
                <TB a={!data.possuiAdiantamento} o={() => { set('possuiAdiantamento', false); set('valorAdiantamentoDiarias', 0); set('valorAdiantamentoSanitario', 0); set('valorAdiantamentoOutros', 0); set('valorTotalAntecipado', 0); set('pctAdiantamentoDiarias', 0); set('dataAdiantamento', ''); set('adiantamentoObservacao', ''); }}>Não</TB>
              </div>
              {data.possuiAdiantamento && (
                <div className="bg-muted/30 rounded p-1.5 border space-y-1">
                  <div className="grid grid-cols-2 gap-1">
                    <F label="Data"><I type="date" value={data.dataAdiantamento} onChange={e => set('dataAdiantamento', e.target.value)} /></F>
                    <F label="% diárias"><I type="number" value={data.pctAdiantamentoDiarias || ''} onChange={e => set('pctAdiantamentoDiarias', +e.target.value || 0)} /></F>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <F label="Diárias R$"><I type="number" value={data.valorAdiantamentoDiarias || ''} onChange={e => { set('valorAdiantamentoDiarias', +e.target.value || 0); set('pctAdiantamentoDiarias', 0); }} /></F>
                    <F label="Sanit. R$"><I type="number" value={data.valorAdiantamentoSanitario || ''} onChange={e => set('valorAdiantamentoSanitario', +e.target.value || 0)} /></F>
                    <F label="Outros R$"><I type="number" value={data.valorAdiantamentoOutros || ''} onChange={e => set('valorAdiantamentoOutros', +e.target.value || 0)} /></F>
                  </div>
                  <div className="flex justify-between text-[9px] bg-primary/5 rounded px-1.5 py-0.5 border border-primary/20">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-primary tabular-nums">{formatMoeda(data.valorTotalAntecipado)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* COL 2 — DESEMPENHO */}
            <div className="space-y-1.5">
              <CT>Desempenho</CT>
              <div className="grid grid-cols-2 gap-1">
                <F label="Quebra viagem %"><I type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', +e.target.value || 0)} step="0.1" /><H>{fmtP(calc.qCab)}/cab</H></F>
                <F label="Custo oport. R$/kg"><I type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', +e.target.value || 0)} step="0.01" /><H>{formatMoeda(calc.coCabC)}/cab</H></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Dias confin."><I type="number" value={data.dias || ''} onChange={e => set('dias', +e.target.value || 0)} /></F>
                <F label="GMD kg/dia"><I type="number" value={data.gmd || ''} onChange={e => set('gmd', +e.target.value || 0)} step="0.001" /></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Rend. entrada %"><I type="number" value={data.rendimentoEntrada || ''} onChange={e => set('rendimentoEntrada', +e.target.value || 0)} step="0.1" /></F>
                <F label="Rend. saída %"><I type="number" value={data.rendimento || ''} onChange={e => set('rendimento', +e.target.value || 0)} step="0.1" /></F>
              </div>
              {/* Calculados */}
              <div className="bg-muted/40 rounded border p-1.5 grid grid-cols-3 gap-1">
                <IV l="Peso final" v={fmtP(calc.pf)} t="Peso inicial + GMD × Dias" />
                <IV l="@ prod." v={fmtA(calc.aP)} t="(@saída-@entrada)×cab" />
                <IV l="Ganho/cab" v={fmtP(calc.ganho)} t="GMD × Dias" />
              </div>
              <div className="bg-muted/40 rounded border p-1.5 grid grid-cols-3 gap-1">
                <IV l="GMC" v={fmtG(calc.gmc)} t="(Carc.saída-Carc.ent)/Dias" />
                <IV l="@/cab saída" v={fmtA(calc.aS)} t="(PF×Rend)/15" />
                <IV l="Custo/cab" v={formatMoeda(calc.cPCab)} t="Custos op./cab" />
              </div>
            </div>

            {/* COL 3 — CUSTOS + COMERCIALIZAÇÃO + RECEBIMENTO */}
            <div className="space-y-1.5">
              <CT>Custos + Venda</CT>
              <div className="grid grid-cols-2 gap-1">
                {data.modalidadeCusto === 'diaria' && <F label="R$/cab/dia"><I type="number" value={data.custoDiaria || ''} onChange={e => set('custoDiaria', +e.target.value || 0)} step="0.01" /><H>{formatMoeda(calc.cdCP)}/cab per.</H></F>}
                {data.modalidadeCusto === 'arroba' && <F label="R$/@ prod."><I type="number" value={data.custoArroba || ''} onChange={e => set('custoArroba', +e.target.value || 0)} /></F>}
                {data.modalidadeCusto === 'parceria' && (<><F label="% parceiro"><I type="number" value={data.percentualParceria || ''} onChange={e => set('percentualParceria', +e.target.value || 0)} /></F><F label="Extras R$"><I type="number" value={data.custosExtrasParceria || ''} onChange={e => set('custosExtrasParceria', +e.target.value || 0)} /></F></>)}
                <F label="Frete R$"><I type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', +e.target.value || 0)} /><H>{formatMoeda(calc.frCab)}/cab</H></F>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <F label="Sanidade R$"><I type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', +e.target.value || 0)} /><H>{formatMoeda(calc.saCab)}/cab</H></F>
                <F label="Outros R$"><I type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', +e.target.value || 0)} /><H>{formatMoeda(calc.oCab)}/cab</H></F>
              </div>
              <Separator className="!my-1" />
              <span className="text-[8px] font-bold uppercase text-muted-foreground">Comercialização</span>
              <div className="grid grid-cols-2 gap-1">
                <F label="Preço venda R$/@"><I type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', +e.target.value || 0)} step="0.01" /><H>{formatMoeda(calc.pvCab)}/cab</H></F>
                <F label="Desp. abate R$"><I type="number" value={data.despesasAbate || ''} onChange={e => set('despesasAbate', +e.target.value || 0)} /><H>{formatMoeda(calc.daCab)}/cab</H></F>
              </div>
              <F label="NF Abate R$"><I type="number" value={data.custoNfAbate || ''} onChange={e => set('custoNfAbate', +e.target.value || 0)} /></F>
              <Separator className="!my-1" />
              <span className="text-[8px] font-bold uppercase text-muted-foreground">Recebimento</span>
              <div className="grid grid-cols-2 gap-1">
                <TB a={data.formaReceb === 'avista'} o={() => handleForma('avista')} full>À vista</TB>
                <TB a={data.formaReceb === 'prazo'} o={() => handleForma('prazo')} full>A prazo</TB>
              </div>
              {data.formaReceb === 'prazo' && (
                <div className="space-y-1">
                  <F label="Parcelas"><I type="number" min="1" max="48" value={data.qtdParcelas} onChange={e => handleQtdP(e.target.value)} /></F>
                  {data.parcelas.map((p, i) => (
                    <div key={i} className="grid grid-cols-2 gap-1 bg-muted/20 rounded p-1">
                      <div><Label className="text-[7px]">P{i + 1}</Label><I type="date" value={p.data} onChange={e => { const np = [...data.parcelas]; np[i] = { ...np[i], data: e.target.value }; set('parcelas', np); }} /></div>
                      <div><Label className="text-[7px]">R$</Label><I type="number" value={String(p.valor)} onChange={e => { const np = [...data.parcelas]; np[i] = { ...np[i], valor: +e.target.value || 0 }; set('parcelas', np); }} /></div>
                    </div>
                  ))}
                  <div className="text-[7px] text-muted-foreground text-right">Base: {formatMoeda(basePar)}</div>
                </div>
              )}
            </div>

            {/* COL 4 — PAINEL RESULTADO */}
            <div className="bg-muted/20 rounded-lg border p-2 space-y-1.5 lg:sticky lg:top-0 h-fit">
              <CT>Resultado</CT>

              <RG label="Indicadores">
                <RR l="GMD" v={`${fmtG(data.gmd)} kg/dia`} t="Ganho médio diário" />
                <RR l="GMC" v={`${fmtG(calc.gmc)} kg/dia`} t="Carcaça/dia" />
                <RR l="@ produzidas" v={fmtA(calc.aP)} />
                <RR l="Custo/@" v={formatMoeda(calc.cPArr)} c="text-destructive" />
              </RG>

              <Sep />
              <RG label="Receita">
                <RR l="Fat. Bruto" v={formatMoeda(calc.fba)} b t="@ saída × Preço" />
                <RR l="(-) Custos Abate" v={formatMoeda(calc.cAb)} c="text-destructive" />
                <DL />
                <RR l="= Fat. Líquido" v={formatMoeda(calc.fLiq)} b accent />
                {data.modalidadeCusto === 'parceria' && calc.pParte > 0 && <RR l={`(-) Parceiro ${data.percentualParceria}%`} v={formatMoeda(calc.pParte)} c="text-destructive" />}
              </RG>

              <Sep />
              <RG label="Operacional">
                <RR l="(-) Diárias" v={formatMoeda(calc.cDT)} c="text-destructive" />
                <RR l="(-) Sanidade" v={formatMoeda(calc.cs)} c="text-destructive" />
                <RR l="(-) Outros" v={formatMoeda(calc.oc)} c="text-destructive" />
                <DL />
                <RR l="= Res. c/ Boitel" v={formatMoeda(calc.rBoitel)} b accent />
                <RR l="(-) Frete" v={formatMoeda(calc.cf)} c="text-destructive" />
                <DL />
                <RR l="= Total Operac." v={formatMoeda(calc.tOp)} b accent />
              </RG>

              {data.possuiAdiantamento && data.valorTotalAntecipado > 0 && (<>
                <Sep />
                <RG label="Conciliação">
                  <RR l="Res. c/ Boitel" v={formatMoeda(calc.rBoitel)} b />
                  <RR l="(+) Adiantamento" v={formatMoeda(data.valorTotalAntecipado)} c="text-destructive" />
                  <DL />
                  <RR l="= Saldo a receber" v={formatMoeda(calc.rBoitel - data.valorTotalAntecipado)} b accent />
                  <RR l="(-) Frete" v={formatMoeda(calc.cf)} c="text-destructive" />
                  <DL />
                  <RR l="= Saldo final" v={formatMoeda(saldoFinal)} b accent />
                </RG>
              </>)}

              <Sep />
              {/* DESTAQUE FINAL */}
              <div className={`rounded border px-2 py-2 text-center ${pos ? 'bg-green-50/80 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-destructive/5 border-destructive/20'}`}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[7px] uppercase text-muted-foreground font-bold block">Total Operac.</span>
                    <strong className={`text-[14px] tabular-nums ${pos ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{formatMoeda(calc.tOp)}</strong>
                  </div>
                  <div>
                    <span className="text-[7px] uppercase text-muted-foreground font-bold block">Res. Líquido</span>
                    <strong className={`text-[14px] tabular-nums ${pos ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{formatMoeda(calc.rLiq)}</strong>
                  </div>
                </div>
                <div className="flex justify-around text-[8px] mt-1 text-muted-foreground">
                  <span>/cab <strong className="text-foreground tabular-nums">{formatMoeda(calc.rLCab)}</strong></span>
                  <span>/kg <strong className="text-foreground tabular-nums">{formatMoeda(calc.rLKg)}</strong></span>
                </div>
              </div>

              <RG label="Custo Oportunidade">
                <RR l="Total" v={formatMoeda(calc.coT)} c="text-destructive" />
                <RR l="Viabilidade" v={formatMoeda(calc.lViab)} b c={calc.lViab >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
                <RR l="/cab" v={formatMoeda(calc.lVCab)} c={calc.lVCab >= 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'} />
              </RG>

              <div className="flex gap-1.5 pt-1">
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1 text-[9px] h-6">Cancelar</Button>
                <Button size="sm" onClick={handleSave} className="flex-1 font-bold text-[9px] h-6">Salvar</Button>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

/* ═══ MICRO-COMPONENTS ═══ */
function HChip({ label, value }: { label: string; value: string }) {
  return <div className="bg-blue-800/60 rounded px-1.5 py-0.5"><span className="text-[7px] text-blue-300 block leading-tight">{label}</span><span className="text-[10px] font-bold tabular-nums leading-tight">{value}</span></div>;
}
function CT({ children }: { children: React.ReactNode }) { return <h3 className="text-[9px] font-bold uppercase text-muted-foreground tracking-wide border-b border-border/60 pb-0.5">{children}</h3>; }
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-[8px] leading-none">{label}</Label>{children}</div>; }
function I(props: React.ComponentProps<typeof Input>) { return <Input {...props} className={`h-6 text-[10px] tabular-nums text-right bg-background ${props.className || ''}`} />; }
function H({ children }: { children: React.ReactNode }) { return <span className="text-[7px] text-muted-foreground italic block">{children}</span>; }
function CV({ children, cls = '' }: { children: React.ReactNode; cls?: string }) { return <div className={`h-6 flex items-center px-1.5 rounded bg-muted/50 border text-[10px] font-medium tabular-nums ${cls}`}>{children}</div>; }
function IV({ l, v, t }: { l: string; v: string; t?: string }) {
  const el = <div className="text-center"><span className="text-[7px] text-muted-foreground block leading-tight">{l}</span><strong className="text-[10px] tabular-nums">{v}</strong></div>;
  if (!t) return el;
  return <Tooltip><TooltipTrigger asChild><div className="cursor-help">{el}</div></TooltipTrigger><TooltipContent className="text-[9px]">{t}</TooltipContent></Tooltip>;
}
function TB({ a, o, children, full }: { a: boolean; o: () => void; children: React.ReactNode; full?: boolean }) {
  return <button type="button" onClick={o} className={`h-5 px-2 rounded text-[9px] font-bold border transition-all ${full ? 'w-full' : ''} ${a ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{children}</button>;
}
function RG({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-0"><span className="text-[7px] font-bold uppercase text-muted-foreground tracking-wide">{label}</span>{children}</div>; }
function RR({ l, v, b, accent, c = '', t }: { l: string; v: string; b?: boolean; accent?: boolean; c?: string; t?: string }) {
  const row = <div className="flex justify-between text-[9px] leading-snug"><span className="text-muted-foreground">{l}</span><span className={`tabular-nums ${b ? 'font-bold' : 'font-medium'} ${accent ? 'text-primary' : ''} ${c}`}>{v}</span></div>;
  if (!t) return row;
  return <Tooltip><TooltipTrigger asChild><div className="cursor-help">{row}</div></TooltipTrigger><TooltipContent side="left" className="text-[9px]">{t}</TooltipContent></Tooltip>;
}
function Sep() { return <Separator className="!my-0.5" />; }
function DL() { return <div className="border-t border-dashed my-0.5" />; }
