import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatMoeda } from '@/lib/calculos/formatters';
import { TrendingUp, DollarSign, Calendar, Truck, Calculator, ChevronDown, Info, ShoppingCart, Tag } from 'lucide-react';

export interface BoitelData {
  // Identificação
  qtdCabecas: number;
  pesoInicial: number;
  fazendaOrigem: string;
  nomeBoitel: string;
  lote: string;
  numeroContrato: string;
  dataEnvio: string;
  // Entrada
  quebraViagem: number;
  custoOportunidade: number;
  // Período
  dias: number;
  gmd: number;
  rendimentoEntrada: number;
  rendimento: number;
  // Custos
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
  // Comercialização
  precoVendaArroba: number;
  despesasAbate: number;
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

function fmtPeso(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
}
function fmtGmd(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg/dia';
}
function fmtArr(v: number) {
  if (!v || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' @';
}

export function BoitelPlanningDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, fazendaNome, dataLancamento }: Props) {
  const [data, setData] = useState<BoitelData>({ ...defaultData });
  const [showDetalhe, setShowDetalhe] = useState(false);

  useEffect(() => {
    if (open) {
      setData({
        ...defaultData,
        qtdCabecas: quantidade || 0,
        pesoInicial: pesoKg || 0,
        fazendaOrigem: fazendaNome || '',
        dataEnvio: dataLancamento || '',
        ...initialData,
      });
    }
  }, [open, initialData, quantidade, pesoKg, fazendaNome, dataLancamento]);

  const set = useCallback(<K extends keyof BoitelData>(key: K, value: BoitelData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const calc = useMemo(() => {
    const {
      qtdCabecas, pesoInicial, quebraViagem, dias, gmd, rendimentoEntrada, rendimento,
      modalidadeCusto, custoDiaria, custoArroba, percentualParceria, custosExtrasParceria,
      custoFrete, outrosCustos, custoOportunidade,
      custoNutricao, custoSanidade, custoNfAbate,
      precoVendaArroba, despesasAbate,
    } = data;

    const pesoLiqEntrada = pesoInicial * (1 - quebraViagem / 100);
    const ganhoKg = gmd * dias;
    const pesoFinal = pesoLiqEntrada + ganhoKg;

    // Arrobas: entrada usa rendimento de entrada (padrão 50%), saída usa rendimento real
    const arrobasEntrada = (pesoLiqEntrada * rendimentoEntrada / 100) / 15;
    const arrobasSaida = (pesoFinal * rendimento / 100) / 15;
    const arrobasProduzidas = (arrobasSaida - arrobasEntrada) * qtdCabecas;
    const arrobasTotalSaida = arrobasSaida * qtdCabecas;

    // GMC (ganho médio de carcaça kg/dia)
    const gmc = dias > 0 ? ((pesoFinal * rendimento / 100) - (pesoLiqEntrada * rendimentoEntrada / 100)) / dias : 0;

    // ── FATURAMENTO ──
    const faturamentoBruto = arrobasTotalSaida * precoVendaArroba;
    const custosAbate = despesasAbate + custoNfAbate;
    const faturamentoLiquido = faturamentoBruto - custosAbate;

    // ── CUSTOS OPERACIONAIS ──
    let custoDiariaTotal = 0;
    if (modalidadeCusto === 'diaria') {
      custoDiariaTotal = custoDiaria * dias * qtdCabecas;
    } else if (modalidadeCusto === 'arroba') {
      custoDiariaTotal = custoArroba * arrobasProduzidas;
    }
    // Parceria: não gera custo operacional — é divisão de receita

    const custosSanitarios = custoSanidade;
    const outrosCustosTotal = outrosCustos + custoNutricao + custosExtrasParceria;
    const custosFreteTotal = custoFrete;

    const custosOperacionais = custoDiariaTotal + custosSanitarios + outrosCustosTotal + custosFreteTotal;

    // ── CUSTO DE OPORTUNIDADE (indicador econômico separado) ──
    const custoOportTotal = custoOportunidade * pesoLiqEntrada * qtdCabecas;

    // ── PARCERIA: divisão da receita ──
    // Em parceria, a receita do produtor é apenas sua parte do faturamento líquido
    let receitaProdutor = faturamentoLiquido;
    let parceiroParte = 0;
    if (modalidadeCusto === 'parceria') {
      parceiroParte = faturamentoLiquido * (percentualParceria / 100);
      receitaProdutor = faturamentoLiquido - parceiroParte;
    }

    // ── LUCRO ──
    // Lucro = Receita do produtor - Custos operacionais
    const lucroTotal = receitaProdutor - custosOperacionais;
    const lucroComOportunidade = lucroTotal - custoOportTotal;
    const lucroPorCab = qtdCabecas > 0 ? lucroTotal / qtdCabecas : 0;
    const lucroPorArroba = arrobasProduzidas > 0 ? lucroTotal / arrobasProduzidas : 0;
    const ganhoTotalKg = ganhoKg * qtdCabecas;
    const lucroPorKg = ganhoTotalKg > 0 ? lucroTotal / ganhoTotalKg : 0;

    const custoPorCab = qtdCabecas > 0 ? custosOperacionais / qtdCabecas : 0;
    const custoPorArroba = arrobasProduzidas > 0 ? custosOperacionais / arrobasProduzidas : 0;

    return {
      pesoLiqEntrada, ganhoKg, pesoFinal,
      arrobasEntrada, arrobasSaida, arrobasProduzidas, arrobasTotalSaida,
      gmc,
      faturamentoBruto, custosAbate, faturamentoLiquido,
      parceiroParte, receitaProdutor,
      custoDiariaTotal, custosSanitarios, outrosCustosTotal, custosFreteTotal,
      custosOperacionais, custoOportTotal,
      custoPorCab, custoPorArroba,
      lucroTotal, lucroComOportunidade, lucroPorCab, lucroPorArroba, lucroPorKg,
    };
  }, [data]);




  const handleSave = () => { onSave(data); onClose(); };
  const isPositive = calc.lucroTotal > 0;

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
                <span className="text-[10px] text-muted-foreground block">Peso inicial</span>
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
              <div>
                <Label className="text-[9px] text-muted-foreground">Data Envio</Label>
                <div className="text-[11px] font-medium">{data.dataEnvio || '-'}</div>
              </div>
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
                    <Input type="number" value={data.quebraViagem || ''} onChange={e => set('quebraViagem', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.5" />
                  </Field>
                  <Field label="Custo oportunidade (R$/kg)">
                    <Input type="number" value={data.custoOportunidade || ''} onChange={e => set('custoOportunidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                    <span className="text-[8px] text-muted-foreground italic">Ref: preço de mercado da categoria</span>
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
                  </Field>
                  <Field label="Rend. entrada (%)">
                    <Input type="number" value={data.rendimentoEntrada || ''} onChange={e => set('rendimentoEntrada', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.5" />
                    <span className="text-[8px] text-muted-foreground">Padrão: 50%</span>
                  </Field>
                  <Field label="Rend. saída (%)">
                    <Input type="number" value={data.rendimento || ''} onChange={e => set('rendimento', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.5" />
                  </Field>
                </div>
                {calc.pesoFinal > 0 && (
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
                        <span className="text-[9px] text-muted-foreground">Sua parte: {100 - (data.percentualParceria || 0)}%</span>
                      </Field>
                      <Field label="Custos extras do acordo (R$)">
                        <Input type="number" value={data.custosExtrasParceria || ''} onChange={e => set('custosExtrasParceria', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                      </Field>
                    </>
                  )}
                  <Field label="Frete (R$)">
                    <Input type="number" value={data.custoFrete || ''} onChange={e => set('custoFrete', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                  </Field>
                  <Field label="Outros custos (R$)">
                    <Input type="number" value={data.outrosCustos || ''} onChange={e => set('outrosCustos', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                  </Field>
                </div>

                <Collapsible open={showDetalhe} onOpenChange={setShowDetalhe}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-primary hover:underline cursor-pointer mt-1">
                    <ChevronDown className={`h-3 w-3 transition-transform ${showDetalhe ? 'rotate-180' : ''}`} />
                    Ver detalhamento de custos
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid grid-cols-3 gap-2 pt-1.5">
                    <Field label="Nutrição (R$)">
                      <Input type="number" value={data.custoNutricao || ''} onChange={e => set('custoNutricao', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </Field>
                    <Field label="Sanidade (R$)">
                      <Input type="number" value={data.custoSanidade || ''} onChange={e => set('custoSanidade', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </Field>
                    <Field label="NF Abate (R$)">
                      <Input type="number" value={data.custoNfAbate || ''} onChange={e => set('custoNfAbate', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                    </Field>
                  </CollapsibleContent>
                </Collapsible>
              </Section>

              {/* COMERCIALIZAÇÃO */}
              <Section icon={<ShoppingCart className="h-3.5 w-3.5" />} title="Comercialização">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Preço venda (R$/@)">
                    <Input type="number" value={data.precoVendaArroba || ''} onChange={e => set('precoVendaArroba', Number(e.target.value) || 0)} className="h-7 text-[11px]" step="0.01" />
                  </Field>
                  <Field label="Despesas abate (R$)">
                    <Input type="number" value={data.despesasAbate || ''} onChange={e => set('despesasAbate', Number(e.target.value) || 0)} className="h-7 text-[11px]" />
                  </Field>
                </div>
              </Section>
            </div>

            {/* ── COLUNA DIREITA: RESULTADO ── */}
            <div className="bg-primary/5 rounded-lg border-2 border-primary/20 p-4 space-y-2.5 h-fit sticky top-0">
              <h4 className="text-[12px] font-bold uppercase text-primary flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> Resultado
              </h4>

              {/* DRE */}
              <ResultGroup label="DRE Boitel">
                <ResultRow label="Faturamento Bruto Abate" value={formatMoeda(calc.faturamentoBruto)} bold />
                <ResultRow label="(-) Custos com Abate" value={formatMoeda(calc.custosAbate)} className="text-destructive" />
                <div className="border-t border-dashed my-0.5" />
                <ResultRow label="= Faturamento Líquido" value={formatMoeda(calc.faturamentoLiquido)} bold accent />
                {data.modalidadeCusto === 'parceria' && calc.parceiroParte > 0 && (
                  <>
                    <ResultRow label={`(-) Parceiro (${data.percentualParceria}%)`} value={formatMoeda(calc.parceiroParte)} className="text-destructive" />
                    <ResultRow label="= Receita Produtor" value={formatMoeda(calc.receitaProdutor)} bold accent />
                  </>
                )}
                <div className="border-t border-dashed my-0.5" />
                <ResultRow label="(-) Custo com Diárias" value={formatMoeda(calc.custoDiariaTotal)} className="text-destructive" />
                <ResultRow label="(-) Custos Sanitários" value={formatMoeda(calc.custosSanitarios)} className="text-destructive" />
                <ResultRow label="(-) Outros Custos" value={formatMoeda(calc.outrosCustosTotal)} className="text-destructive" />
                <ResultRow label="(-) Custos com Frete" value={formatMoeda(calc.custosFreteTotal)} className="text-destructive" />
              </ResultGroup>

              <Separator />

              {/* Lucro principal */}
              <div className={`rounded-md border-2 px-3 py-3 text-center ${isPositive ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700' : 'bg-destructive/5 border-destructive/20'}`}>
                <span className="text-[9px] text-muted-foreground block uppercase font-bold">= Lucro Líquido Total</span>
                <strong className={`text-[20px] ${isPositive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                  {formatMoeda(calc.lucroTotal)}
                </strong>
              </div>

              {calc.custoOportTotal > 0 && (
                <div className="bg-muted/50 rounded border px-2 py-1.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo oportunidade</span>
                    <span className="text-destructive font-medium">{formatMoeda(calc.custoOportTotal)}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-muted-foreground">Lucro c/ oportunidade</span>
                    <span className={`font-bold ${calc.lucroComOportunidade > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                      {formatMoeda(calc.lucroComOportunidade)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <ResultCard label="Lucro/cab" value={formatMoeda(calc.lucroPorCab)} positive={isPositive} />
                <ResultCard label="Lucro/@" value={formatMoeda(calc.lucroPorArroba)} positive={isPositive} />
                <ResultCard label="Lucro/kg vivo" value={formatMoeda(calc.lucroPorKg)} positive={isPositive} />
              </div>

              <Separator />

              {/* Indicadores */}
              <ResultGroup label="Indicadores">
                <ResultRow label="GMD" value={fmtGmd(data.gmd)} />
                <ResultRow label="GMC" value={fmtGmd(calc.gmc)} />
                <ResultRow label="@ produzidas" value={fmtArr(calc.arrobasProduzidas)} />
                <ResultRow label="@ total saída" value={fmtArr(calc.arrobasTotalSaida)} />
                <ResultRow label="Custo/cab" value={formatMoeda(calc.custoPorCab)} />
                <ResultRow label="Custo/@" value={formatMoeda(calc.custoPorArroba)} />
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

function ResultCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-background rounded border px-2 py-1.5 text-center">
      <span className="text-[8px] text-muted-foreground block">{label}</span>
      <strong className={`text-[12px] ${positive ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{value}</strong>
    </div>
  );
}
