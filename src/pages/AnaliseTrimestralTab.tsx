/**
 * AnaliseTrimestralTab — Relatório trimestral do cliente.
 * 2 abas: Gerente da Fazenda | Proprietário/Financeiro.
 * Tema escuro inline + print CSS (window.print()).
 */

import { useState, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useAnaliseTrimestral, useAnaliseDREPeriodo, type Trimestre } from '@/hooks/useAnaliseTrimestral';
import { Button } from '@/components/ui/button';
import { Printer, BarChart3 } from 'lucide-react';

type AbaId = 'gerente' | 'proprietario' | 'dre';
type Arr3 = [number, number, number];

const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoeda(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–';
  if (Math.abs(v) >= 1_000_000) return `R$ ${fmt(v / 1_000_000, 2)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${fmt(v / 1_000, 1)}k`;
  return `R$ ${fmt(v, 0)}`;
}
function sum3(a: Arr3): number { return a[0] + a[1] + a[2]; }
function avg3(a: Arr3): number { return (a[0] + a[1] + a[2]) / 3; }
function pctDelta(real: number, ref: number): number | null {
  if (!Number.isFinite(real) || !Number.isFinite(ref) || ref === 0) return null;
  return ((real - ref) / Math.abs(ref)) * 100;
}

// Paleta tema claro — alinhado com tokens shadcn/ui
const COLOR_BG = 'hsl(var(--background))';
const COLOR_CARD = 'hsl(var(--card))';
const COLOR_BORDER = 'hsl(var(--border))';
const COLOR_TEXT = 'hsl(var(--foreground))';
const COLOR_TEXT_MUTED = 'hsl(var(--muted-foreground))';
const COLOR_ACCENT = 'hsl(var(--primary))';
const COLOR_GOOD = '#16a34a';
const COLOR_BAD = '#dc2626';
const COLOR_SEC = 'hsl(var(--muted))';
const COLOR_SEC_LIGHT = 'hsl(var(--muted) / 0.3)';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; font-size: 10pt; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .report { color: black !important; background: white !important; }
  .report * { color: black !important; background: transparent !important; border-color: #999 !important; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #bbb; padding: 3px 5px; font-size: 9pt; }
  .sec-row td { background: #eee !important; font-weight: 700; }
  .bold-row td { font-weight: 700; }
  .acum { font-weight: 700; }
  .avoid-break { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
}
@media screen {
  .report { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .report .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
}
`;

function DeltaArrow({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const pos = pct >= 0;
  return (
    <span style={{ color: pos ? COLOR_GOOD : COLOR_BAD, fontWeight: 600, fontSize: 12 }}>
      {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function KPI({ label, value, sub, deltas, valueColor }: {
  label: string;
  value: string;
  sub?: string;
  deltas?: { label: string; pct: number | null }[];
  valueColor?: string;
}) {
  return (
    <div style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 8, padding: '10px 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 10, color: COLOR_TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'space-between' }}>
        <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: valueColor || COLOR_TEXT, marginTop: 2, lineHeight: 1.1 }}>{value}</div>
        {deltas && deltas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            {deltas.map((d, i) => (
              <div key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <DeltaArrow pct={d.pct} />
                <span style={{ color: COLOR_TEXT_MUTED }}>{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 10, color: COLOR_TEXT_MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

interface RowProps {
  label: string;
  values: Arr3;
  acum: number | string;
  dec?: number;
  mode?: 'num' | 'money' | 'pct';
  emphasis?: boolean;
}

function Row({ label, values, acum, dec = 0, mode = 'num', emphasis }: RowProps) {
  const f = (v: number) => {
    if (mode === 'money') return fmtMoeda(v);
    if (mode === 'pct') return `${fmt(v, dec)}%`;
    return fmt(v, dec);
  };
  return (
    <tr className={emphasis ? 'bold-row' : ''} style={{ fontWeight: emphasis ? 700 : 400 }}>
      <td style={{ padding: '5px 8px', color: COLOR_TEXT }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{f(v)}</td>
      ))}
      <td className="mono acum" style={{ padding: '5px 8px', color: COLOR_ACCENT, textAlign: 'right', fontWeight: 700 }}>
        {typeof acum === 'number' ? f(acum) : acum}
      </td>
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="sec-row">
      <td colSpan={5} style={{ padding: '6px 8px', background: COLOR_SEC, color: COLOR_ACCENT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11, borderTop: `1px solid ${COLOR_BORDER}` }}>
        {label}
      </td>
    </tr>
  );
}

export function AnaliseTrimestralTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const anoCurrent = new Date().getFullYear();
  const [ano, setAno] = useState<number>(anoCurrent);
  const [trimestre, setTrimestre] = useState<Trimestre>(((Math.floor(new Date().getMonth() / 3) + 1) as Trimestre) || 1);
  // DRE: período acumulado (1..12 meses)
  const [dreAteMes, setDreAteMes] = useState<number>(trimestre * 3);
  const [aba, setAba] = useState<AbaId>('gerente');

  const q = useAnaliseTrimestral({ clienteId, ano, trimestre });
  const d = q.data;
  const qDre = useAnaliseDREPeriodo({ clienteId, ano, ateMes: dreAteMes });
  const dDre = qDre.data;
  const mesLabels: Arr3 = useMemo(() => {
    const ms = [(trimestre - 1) * 3, (trimestre - 1) * 3 + 1, (trimestre - 1) * 3 + 2];
    return [MES_NOMES[ms[0]], MES_NOMES[ms[1]], MES_NOMES[ms[2]]] as unknown as Arr3;
  }, [trimestre]);

  const anosOptions: number[] = [];
  for (let y = 2020; y <= anoCurrent + 1; y++) anosOptions.push(y);

  // Observações automáticas
  const observacoes = useMemo(() => {
    if (!d) return [] as string[];
    const msgs: string[] = [];
    const gmdAcumReal = avg3(d.zootecnico.gmd);
    const gmdAcumMeta = avg3(d.zootecnico.gmdMeta);
    const delta = pctDelta(gmdAcumReal, gmdAcumMeta);
    if (delta != null) msgs.push(`GMD trimestral ${delta >= 0 ? 'acima' : 'abaixo'} da meta em ${fmt(Math.abs(delta), 1)}%.`);
    const cpSum = sum3(d.custoPec.total);
    const rebMedAvg = avg3(d.rebanho.rebanhoMedio);
    if (rebMedAvg > 0) msgs.push(`Custo médio R$/cab/mês: ${fmtMoeda(cpSum / rebMedAvg / 3)} (CP / reb.médio / 3 meses).`);
    const margem = avg3(d.resultado.margemPct);
    msgs.push(`Margem bruta pecuária média: ${fmt(margem, 1)}%.`);
    if (d.zootecnico.mortalidadePct.some(p => p > 2)) msgs.push('⚠ Mortalidade mensal > 2% detectada em pelo menos 1 mês.');
    return msgs;
  }, [d]);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="report" style={{ background: COLOR_BG, color: COLOR_TEXT, minHeight: '100vh', padding: 16 }}>
        {/* Header */}
        <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${COLOR_BORDER}`, paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: COLOR_ACCENT }}>AGROINBLUE</div>
            <div style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>
              Análise Trimestral — {clienteAtual?.nome || '—'} · T{trimestre}/{ano}
            </div>
            <div style={{ fontSize: 11, color: COLOR_TEXT_MUTED }}>
              Área pecuária: <span className="mono">{d ? fmt(d.area.areaPecuariaHa, 0) : '…'} ha</span>
            </div>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ background: COLOR_CARD, color: COLOR_TEXT, border: `1px solid ${COLOR_BORDER}`, borderRadius: 4, padding: '6px 8px' }}>
              {anosOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {aba !== 'dre' ? (
              <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value) as Trimestre)} style={{ background: COLOR_CARD, color: COLOR_TEXT, border: `1px solid ${COLOR_BORDER}`, borderRadius: 4, padding: '6px 8px' }}>
                {[1,2,3,4].map(t => <option key={t} value={t}>T{t}</option>)}
              </select>
            ) : (
              <select value={dreAteMes} onChange={e => setDreAteMes(Number(e.target.value))} style={{ background: COLOR_CARD, color: COLOR_TEXT, border: `1px solid ${COLOR_BORDER}`, borderRadius: 4, padding: '6px 8px' }}>
                {MES_NOMES.map((m, i) => <option key={i} value={i + 1}>Até {m}</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 16, background: COLOR_CARD, padding: 4, borderRadius: 6, width: 'fit-content' }}>
          <button onClick={() => setAba('gerente')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, background: aba === 'gerente' ? COLOR_ACCENT : 'transparent', color: aba === 'gerente' ? '#0f172a' : COLOR_TEXT, border: 'none', cursor: 'pointer' }}>📋 Gerente</button>
          <button onClick={() => setAba('proprietario')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, background: aba === 'proprietario' ? COLOR_ACCENT : 'transparent', color: aba === 'proprietario' ? '#0f172a' : COLOR_TEXT, border: 'none', cursor: 'pointer' }}>📊 Proprietário</button>
          <button onClick={() => setAba('dre')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, background: aba === 'dre' ? COLOR_ACCENT : 'transparent', color: aba === 'dre' ? '#0f172a' : COLOR_TEXT, border: 'none', cursor: 'pointer' }}>📒 DRE</button>
        </div>

        {aba !== 'dre' && q.isLoading && <div style={{ padding: 20, color: COLOR_TEXT_MUTED }}>Carregando dados do trimestre…</div>}
        {aba !== 'dre' && q.error && <div style={{ padding: 20, color: COLOR_BAD }}>Erro: {(q.error as Error).message}</div>}
        {d && aba === 'gerente' && <TabGerente d={d} mesLabels={mesLabels} />}
        {d && aba === 'proprietario' && <TabProprietario d={d} mesLabels={mesLabels} />}
        {aba === 'dre' && qDre.isLoading && <div style={{ padding: 20, color: COLOR_TEXT_MUTED }}>Carregando DRE do período…</div>}
        {aba === 'dre' && qDre.error && <div style={{ padding: 20, color: COLOR_BAD }}>Erro: {(qDre.error as Error).message}</div>}
        {dDre && aba === 'dre' && <TabDREPeriodo dDre={dDre} />}

        {/* Observações */}
        {d && observacoes.length > 0 && (
          <div className="avoid-break" style={{ marginTop: 16, padding: 12, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_ACCENT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Observações</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: COLOR_TEXT }}>
              {observacoes.map((o, i) => <li key={i} style={{ marginBottom: 4 }}>{o}</li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

// ====================================================================
// ABA: GERENTE
// ====================================================================
function TabGerente({ d, mesLabels }: { d: NonNullable<ReturnType<typeof useAnaliseTrimestral>['data']>; mesLabels: Arr3 }) {
  const reb = d.rebanho;
  const zoo = d.zootecnico;
  const des = d.desfrutes;
  const cp = d.custoPec;

  // Para saldo inicial/final a "acumulado" não faz sentido como soma — usa primeiro/último.
  const sumAcum = (a: Arr3) => sum3(a);
  const avgAcum = (a: Arr3) => avg3(a);
  const gmdAcum = avg3(zoo.gmd);
  const gmdMetaAcum = avg3(zoo.gmdMeta);
  const gmdYoyAcum = avg3(zoo.gmdYoy);
  const lotAcum = avg3(zoo.lotacaoUaHa);
  const lotMetaAcum = avg3(zoo.lotacaoMeta);

  const cpTotalAcum = sumAcum(cp.total);
  const rebMedAvg = avgAcum(reb.rebanhoMedio);
  const rCabAcum = rebMedAvg > 0 ? cpTotalAcum / rebMedAvg / 3 : 0;

  return (
    <>
      {/* KPIs Gerente (4 col) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KPI label="Rebanho médio" value={fmt(rebMedAvg, 0)} sub="cab (média trim.)" />
        <KPI label="GMD realizado" value={fmt(gmdAcum, 3)} sub={`meta ${fmt(gmdMetaAcum, 3)} · YoY ${fmt(gmdYoyAcum, 3)}`} />
        <KPI label="Lotação UA/ha" value={fmt(lotAcum, 2)} sub={`meta ${fmt(lotMetaAcum, 2)}`} />
        <KPI label="R$/cab/mês" value={fmtMoeda(rCabAcum)} sub="custo pec. médio" />
      </div>

      <TabelaTrimestral mesLabels={mesLabels}>
        <SectionHeader label="Rebanho" />
        <Row label="Saldo Inicial" values={reb.saldoInicial} acum={reb.saldoInicial[0]} />
        <Row label="Nascimentos" values={reb.nascimentos} acum={sumAcum(reb.nascimentos)} />
        <Row label="Compras" values={reb.compras} acum={sumAcum(reb.compras)} />
        <Row label="Abates" values={reb.abates} acum={sumAcum(reb.abates)} />
        <Row label="Vendas" values={reb.vendas} acum={sumAcum(reb.vendas)} />
        <Row label="Mortes" values={reb.mortes} acum={sumAcum(reb.mortes)} />
        <Row label="Consumo" values={reb.consumo} acum={sumAcum(reb.consumo)} />
        <Row label="Saldo Final" values={reb.saldoFinal} acum={reb.saldoFinal[2]} emphasis />
        <Row label="Rebanho Médio" values={reb.rebanhoMedio} acum={rebMedAvg} dec={0} emphasis />

        <SectionHeader label="Zootécnico" />
        <Row label="GMD realizado" values={zoo.gmd} acum={gmdAcum} dec={3} />
        <Row label="GMD meta" values={zoo.gmdMeta} acum={gmdMetaAcum} dec={3} />
        <Row label="GMD YoY (ano-1)" values={zoo.gmdYoy} acum={gmdYoyAcum} dec={3} />
        <Row label="Var vs Meta (%)" values={zoo.gmd.map((g, i) => {
          const m = zoo.gmdMeta[i]; return m > 0 ? ((g - m) / m) * 100 : 0;
        }) as Arr3} acum={(() => { const m = gmdMetaAcum; return m > 0 ? ((gmdAcum - m) / m) * 100 : 0; })()} dec={1} mode="pct" />
        <Row label="Lotação UA/ha" values={zoo.lotacaoUaHa} acum={lotAcum} dec={2} />
        <Row label="Lotação Meta" values={zoo.lotacaoMeta} acum={lotMetaAcum} dec={2} />
        <Row label="Mortalidade (%)" values={zoo.mortalidadePct} acum={avgAcum(zoo.mortalidadePct)} dec={2} mode="pct" />

        <SectionHeader label="Desfrutes" />
        <Row label="Abates (cab)" values={des.abatesCab} acum={sumAcum(des.abatesCab)} />
        <Row label="Abates (kg)" values={des.abatesKg} acum={sumAcum(des.abatesKg)} />
        <Row label="Abates (R$)" values={des.abatesValor} acum={sumAcum(des.abatesValor)} mode="money" />
        <Row label="Preço R$/@" values={des.precoArroba} acum={(() => {
          const totKg = sumAcum(des.abatesKg); const totVal = sumAcum(des.abatesValor);
          const arr = totKg * 0.5 / 15; return arr > 0 ? totVal / arr : 0;
        })()} mode="money" />
        <Row label="Compras (cab)" values={des.comprasCab} acum={sumAcum(des.comprasCab)} />

        <SectionHeader label="Custo Pecuária (R$/cab./mês)" />
        {(() => {
          // Divisão por cab_medio mensal (por linha). Acum divide pela média dos meses.
          const divArr = (a: Arr3, b: Arr3): Arr3 => [0, 1, 2].map(i => b[i] > 0 ? a[i] / b[i] : 0) as Arr3;
          const acumRatio = (a: Arr3): number => rebMedAvg > 0 ? sumAcum(a) / rebMedAvg / 3 : 0;
          const rebMed = reb.rebanhoMedio;
          const fixoPorCab = divArr(cp.custoFixo, rebMed);
          const varPorCab = divArr(cp.custoVariavel, rebMed);
          const custeioPorCab: Arr3 = [0, 1, 2].map(i => fixoPorCab[i] + varPorCab[i]) as Arr3;
          const investPorCab = divArr(cp.investPec, rebMed);
          const desembolsoPorCab: Arr3 = [0, 1, 2].map(i => custeioPorCab[i] + investPorCab[i]) as Arr3;
          const META_DESEMBOLSO = 141.80; // até ter meta financeira no DB
          return (
            <>
              <Row label="Custo Fixo por cab./mês" values={fixoPorCab} acum={acumRatio(cp.custoFixo)} dec={2} mode="money" />
              <Row label="Custo Variável por cab./mês" values={varPorCab} acum={acumRatio(cp.custoVariavel)} dec={2} mode="money" />
              <Row label="Custeio de Produção por cab./mês" values={custeioPorCab} acum={acumRatio(cp.custoFixo) + acumRatio(cp.custoVariavel)} dec={2} mode="money" emphasis />
              <Row label="Investimentos Pecuária por cab./mês" values={investPorCab} acum={acumRatio(cp.investPec)} dec={2} mode="money" />
              <Row label="Desembolso de Produção por cab./mês" values={desembolsoPorCab} acum={acumRatio(cp.custoFixo) + acumRatio(cp.custoVariavel) + acumRatio(cp.investPec)} dec={2} mode="money" emphasis />
              <tr style={{ fontSize: 10, color: COLOR_TEXT_MUTED }}>
                <td style={{ padding: '3px 8px' }} colSpan={2}>Meta Desembolso (fixa): {fmtMoeda(META_DESEMBOLSO)}/cab/mês</td>
                <td colSpan={3}></td>
              </tr>
            </>
          );
        })()}
      </TabelaTrimestral>
    </>
  );
}

// ====================================================================
// ABA: PROPRIETÁRIO
// ====================================================================
function TabProprietario({ d, mesLabels }: { d: NonNullable<ReturnType<typeof useAnaliseTrimestral>['data']>; mesLabels: Arr3 }) {
  const r = d.resultado;
  const fc = d.fluxoCaixa;
  const det = d.detalhamentoSaidas;
  const ap = d.aportes;
  const zoo = d.zootecnico;
  const des = d.desfrutes;
  const reb = d.rebanho;
  const cp = d.custoPec;

  const fatTot = sum3(r.faturamentoTotal);
  const cpTot = sum3(r.custoProducaoPec);
  const lucroTot = sum3(r.lucroBrutoPec);
  const margemAvg = avg3(r.margemPct);
  const saldoIniTri = fc.saldoInicial[0];
  const saldoFinTri = fc.saldoFinal[2];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <KPI label="Faturamento trim." value={fmtMoeda(fatTot)} />
        <KPI label="Lucro bruto pec." value={fmtMoeda(lucroTot)} sub={`margem ${fmt(margemAvg, 1)}%`} />
        <KPI label="Saldo final caixa" value={fmtMoeda(saldoFinTri)} sub={`ini ${fmtMoeda(saldoIniTri)}`} />
      </div>

      <TabelaTrimestral mesLabels={mesLabels}>
        <SectionHeader label="Resultado" />
        <Row label="Faturamento Total" values={r.faturamentoTotal} acum={fatTot} mode="money" emphasis />
        <Row label="Receita Pecuária" values={r.receitaPec} acum={sum3(r.receitaPec)} mode="money" />
        <Row label="Custo Produção Pec." values={r.custoProducaoPec} acum={cpTot} mode="money" />
        <Row label="Lucro Bruto Pec." values={r.lucroBrutoPec} acum={lucroTot} mode="money" emphasis />
        <Row label="Margem (%)" values={r.margemPct} acum={margemAvg} dec={1} mode="pct" />

        <SectionHeader label="Fluxo de Caixa" />
        <Row label="Saldo Inicial" values={fc.saldoInicial} acum={fc.saldoInicial[0]} mode="money" />
        <Row label="Entradas" values={fc.entradas} acum={sum3(fc.entradas)} mode="money" />
        <Row label="Saídas" values={fc.saidas} acum={sum3(fc.saidas)} mode="money" />
        <Row label="Saldo Final" values={fc.saldoFinal} acum={fc.saldoFinal[2]} mode="money" emphasis />

        <SectionHeader label="Detalhamento Saídas" />
        <Row label="Custo Fixo Pec." values={det.custoFixoPec} acum={sum3(det.custoFixoPec)} mode="money" />
        <Row label="Custo Variável Pec." values={det.custoVarPec} acum={sum3(det.custoVarPec)} mode="money" />
        <Row label="Custo Fixo Agr." values={det.custoFixoAgr} acum={sum3(det.custoFixoAgr)} mode="money" />
        <Row label="Custo Variável Agr." values={det.custoVarAgr} acum={sum3(det.custoVarAgr)} mode="money" />
        <Row label="Invest. Pecuária" values={det.investPec} acum={sum3(det.investPec)} mode="money" />
        <Row label="Invest. Agricultura" values={det.investAgr} acum={sum3(det.investAgr)} mode="money" />
        <Row label="Compra Bovinos" values={det.compraBovinos} acum={sum3(det.compraBovinos)} mode="money" />
        <Row label="Dividendos" values={det.dividendos} acum={sum3(det.dividendos)} mode="money" />

        <SectionHeader label="Indicadores" />
        <Row label="R$/cab/mês (pec)" values={cp.rCabMes} acum={(() => {
          const r = avg3(reb.rebanhoMedio); return r > 0 ? sum3(cp.total) / r / 3 : 0;
        })()} mode="money" />
        <Row label="GMD médio (kg/cab/dia)" values={zoo.gmd} acum={avg3(zoo.gmd)} dec={3} />
        <Row label="Abates (cab)" values={des.abatesCab} acum={sum3(des.abatesCab)} />
        <Row label="Preço R$/@" values={des.precoArroba} acum={(() => {
          const kg = sum3(des.abatesKg); const v = sum3(des.abatesValor);
          const arr = kg * 0.5 / 15; return arr > 0 ? v / arr : 0;
        })()} mode="money" />

        <SectionHeader label="Aportes" />
        <Row label="Dividendos (saída)" values={ap.dividendos} acum={sum3(ap.dividendos)} mode="money" />
        <Row label="Aportes Pessoais (entrada)" values={ap.aportePessoal} acum={sum3(ap.aportePessoal)} mode="money" />
        <Row label="Dividendo Líquido" values={ap.dividendoLiquido} acum={sum3(ap.dividendoLiquido)} mode="money" emphasis />
      </TabelaTrimestral>
    </>
  );
}

// ====================================================================
// ABA: DRE PERÍODO (acumulado 1..N meses)
// ====================================================================
function TabDREPeriodo({ dDre }: { dDre: NonNullable<ReturnType<typeof useAnaliseDREPeriodo>['data']> }) {
  const { dre, ateMes, meses, ano, rebanhoPeriodo } = dDre;
  const ref = dre.refAnoAnterior;
  const acum = dre.acum;
  const mesHeaders = meses.map(m => MES_NOMES[m - 1]);

  const clr = (v: number) => !Number.isFinite(v) || v === 0 ? COLOR_TEXT_MUTED : (v < 0 ? COLOR_BAD : COLOR_GOOD);
  const fmtC = (v: number, mode: 'money' | 'pct' = 'money') => {
    if (!Number.isFinite(v) || v === 0) return '–';
    return mode === 'money' ? fmtMoeda(v) : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  };
  const deltaFmt = (real: number, refVal: number) => {
    const p = pctDelta(real, refVal);
    return p == null ? null : p;
  };

  const th = { padding: '6px 8px', textAlign: 'left' as const, color: COLOR_TEXT_MUTED, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.3 };
  const td = { padding: '5px 8px', fontSize: 11 };

  type DRERowProps = {
    label: string;
    values: number[];
    acum: number;
    refAno: number;
    signal: '+' | '-' | '=' | '+/-';
    mode?: 'money' | 'pct';
    pendente?: boolean[];
  };
  const renderLine = ({ label, values, acum, refAno, signal, mode = 'money', pendente }: DRERowProps) => {
    const isResult = signal === '=';
    const isDeduct = signal === '-';
    const bg = isResult ? COLOR_SEC_LIGHT : undefined;
    const vColor = (v: number) => isDeduct ? COLOR_BAD : clr(v);
    const delta = deltaFmt(acum, refAno);
    return (
      <tr style={{ background: bg, fontWeight: isResult ? 700 : 400 }}>
        <td style={{ ...td, color: COLOR_TEXT, borderTop: isResult ? `1px solid ${COLOR_BORDER}` : undefined }}>
          <span style={{ color: COLOR_TEXT_MUTED, marginRight: 4, display: 'inline-block', width: 14 }}>{signal}</span>
          {label}
        </td>
        {values.map((v, i) => {
          const pend = pendente && pendente[i];
          return (
            <td key={i} className="mono" style={{ ...td, textAlign: 'right', color: pend ? COLOR_TEXT_MUTED : vColor(v) }}>
              {pend ? <span style={{ fontStyle: 'italic', fontSize: 10 }}>Pend.</span> : fmtC(v, mode)}
            </td>
          );
        })}
        <td className="mono" style={{ ...td, textAlign: 'right', color: vColor(acum), fontWeight: 700, background: isResult ? 'rgba(var(--primary-rgb, 245, 158, 11), 0.15)' : undefined }}>
          {fmtC(acum, mode)}
        </td>
        <td className="mono" style={{ ...td, textAlign: 'right', color: COLOR_TEXT_MUTED, borderLeft: `1px solid ${COLOR_BORDER}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span>{fmtC(refAno, mode)}</span>
            {delta != null && (
              <span style={{ fontSize: 9 }}><DeltaArrow pct={delta} /></span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      {/* KPIs DRE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KPI label="Faturamento (competência)" value={fmtMoeda(acum.faturamento)}
          deltas={[{ label: `${ref.ano}`, pct: pctDelta(acum.faturamento, ref.faturamento) }]} />
        <KPI label="Lucro Líquido" value={fmtMoeda(acum.lucroLiquido)}
          deltas={[{ label: `${ref.ano}`, pct: pctDelta(acum.lucroLiquido, ref.lucroLiquido) }]}
          valueColor={acum.lucroLiquido < 0 ? COLOR_BAD : COLOR_GOOD} />
        <KPI label="Margem" value={`${acum.margemLucroPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          deltas={[{ label: `${ref.ano}`, pct: pctDelta(acum.margemLucroPct, ref.margemLucroPct) }]} />
        <KPI label="Markup" value={`${acum.markupPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          deltas={[{ label: `${ref.ano}`, pct: pctDelta(acum.markupPct, ref.markupPct) }]} />
      </div>

      <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: COLOR_SEC }}>
            <tr>
              <th style={th}>DRE — Até {MES_NOMES[ateMes - 1]} / {ano}</th>
              {mesHeaders.map((m, i) => (
                <th key={i} style={{ ...th, textAlign: 'right' }}>{m}</th>
              ))}
              <th style={{ ...th, textAlign: 'right', color: COLOR_ACCENT }}>Acum. {ano}</th>
              <th style={{ ...th, textAlign: 'right', borderLeft: `1px solid ${COLOR_BORDER}` }}>Ref. {ref.ano}</th>
            </tr>
          </thead>
          <tbody>
            {renderLine({ label: 'Faturamento — competência', values: dre.faturamento, acum: acum.faturamento, refAno: ref.faturamento, signal: '+' })}
            {renderLine({ label: 'Desembolso de Produção', values: dre.desembolsoProducao, acum: acum.desembolsoProducao, refAno: ref.desembolsoProducao, signal: '-' })}
            {renderLine({ label: 'Lucro Bruto', values: dre.lucroBruto, acum: acum.lucroBruto, refAno: ref.lucroBruto, signal: '=' })}
            {renderLine({ label: 'Reposição de Bovinos', values: dre.reposicaoBovinos, acum: acum.reposicaoBovinos, refAno: ref.reposicaoBovinos, signal: '-' })}
            {renderLine({ label: 'Variação do Estoque de Gado', values: dre.variacaoEstoque, acum: acum.variacaoEstoque, refAno: ref.variacaoEstoque, signal: '+/-', pendente: dre.fechamentoPendente })}
            {renderLine({ label: 'Lucro Operacional', values: dre.lucroOperacional, acum: acum.lucroOperacional, refAno: ref.lucroOperacional, signal: '=' })}
            {renderLine({ label: 'Juros de Financiamento', values: dre.jurosFinanciamento, acum: acum.jurosFinanciamento, refAno: ref.jurosFinanciamento, signal: '-' })}
            {renderLine({ label: 'Lucro Líquido', values: dre.lucroLiquido, acum: acum.lucroLiquido, refAno: ref.lucroLiquido, signal: '=' })}
            {renderLine({ label: 'Margem de Lucro (%)', values: dre.margemLucroPct, acum: acum.margemLucroPct, refAno: ref.margemLucroPct, signal: '+/-', mode: 'pct' })}
            {renderLine({ label: 'Markup (%)', values: dre.markupPct, acum: acum.markupPct, refAno: ref.markupPct, signal: '+/-', mode: 'pct' })}
          </tbody>
        </table>
      </div>

      {/* Explicação das fórmulas */}
      <div className="avoid-break" style={{ marginTop: 10, padding: 10, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, fontSize: 10, color: COLOR_TEXT_MUTED, lineHeight: 1.5 }}>
        <div>* <strong>Margem de Lucro (%)</strong> = Lucro Líquido ÷ Faturamento × 100</div>
        <div>* <strong>Markup (%)</strong> = Lucro Líquido ÷ Desembolso de Produção × 100</div>
        <div>* <strong>DRE por competência</strong>: receita reconhecida na data do abate/venda. Fluxo de Caixa registra na data do pagamento. Variação de estoque é econômica e não transita pelo caixa.</div>
        <div>* <strong>Reposição de Bovinos</strong>: vem de <code>lancamentos</code> (tipo=compra, valor_total), por competência zootécnica. "–" quando valor_total ausente.</div>
      </div>

      {/* Rebanho no Período */}
      <div className="avoid-break" style={{ marginTop: 12, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${COLOR_BORDER}`, background: COLOR_SEC }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_ACCENT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rebanho no Período</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            {[
              { l: 'Qtde cabeças inicial', v: fmt(rebanhoPeriodo.cabInicial, 0), color: COLOR_TEXT },
              { l: 'Valor do rebanho inicial', v: rebanhoPeriodo.valorInicialPendente ? 'Pendente' : fmtMoeda(rebanhoPeriodo.valorInicial), color: rebanhoPeriodo.valorInicialPendente ? COLOR_TEXT_MUTED : COLOR_TEXT },
              { l: 'Qtde cabeças final', v: fmt(rebanhoPeriodo.cabFinal, 0), color: COLOR_TEXT },
              { l: 'Valor do rebanho final', v: rebanhoPeriodo.valorFinalPendente ? 'Pendente' : fmtMoeda(rebanhoPeriodo.valorFinal), color: rebanhoPeriodo.valorFinalPendente ? COLOR_TEXT_MUTED : COLOR_TEXT },
              { l: 'Diferença (cabeças)', v: fmt(rebanhoPeriodo.diferencaCab, 0), color: clr(rebanhoPeriodo.diferencaCab) },
              { l: 'Variação do rebanho (R$)', v: fmtMoeda(rebanhoPeriodo.variacaoReboR), color: clr(rebanhoPeriodo.variacaoReboR) },
            ].map((r, i) => (
              <tr key={i} style={{ borderTop: i > 0 ? `1px solid ${COLOR_BORDER}` : undefined }}>
                <td style={{ ...td, color: COLOR_TEXT, width: '60%' }}>{r.l}</td>
                <td className="mono" style={{ ...td, color: r.color, textAlign: 'right', fontWeight: 600 }}>{r.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ====================================================================
// ABA: DRE (antigo — trimestre fixo, mantido para compat se futuramente pedir)
// ====================================================================
function _TabDRELegacy({ d, mesLabels }: { d: NonNullable<ReturnType<typeof useAnaliseTrimestral>['data']>; mesLabels: Arr3 }) {
  const dre = (d as any).dre as {
    faturamento: Arr3; desembolsoProducao: Arr3; lucroBruto: Arr3;
    reposicaoBovinos: Arr3; variacaoEstoque: Arr3; fechamentoPendente: [boolean, boolean, boolean];
    lucroOperacional: Arr3; jurosFinanciamento: Arr3; lucroLiquido: Arr3;
    margemLucroPct: Arr3; markupPct: Arr3;
    refAnoAnterior: {
      ano: number; faturamento: number; desembolsoProducao: number; lucroBruto: number;
      reposicaoBovinos: number; variacaoEstoque: number; lucroOperacional: number;
      jurosFinanciamento: number; lucroLiquido: number; margemLucroPct: number;
      markupPct: number; fechamentoPendente: boolean;
    };
  };

  const ref = dre.refAnoAnterior;

  // Cor por sinal. Zero = muted.
  const clr = (v: number): string => {
    if (!Number.isFinite(v) || v === 0) return COLOR_TEXT_MUTED;
    return v < 0 ? COLOR_BAD : COLOR_GOOD;
  };
  const fmtCell = (v: number, mode: 'money' | 'pct' = 'money') => {
    if (!Number.isFinite(v) || v === 0) return '–';
    return mode === 'money' ? fmtMoeda(v) : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  };

  // Renderiza linha DRE. `signal` define categoria; `pendente` indica mês com fechamento ausente.
  const renderLine = (
    label: string,
    values: Arr3,
    acum: number,
    refAno: number,
    opts: { signal: '+' | '-' | '=' | ''; pendente?: boolean[]; mode?: 'money' | 'pct'; emphasis?: boolean } = { signal: '' }
  ) => {
    const { signal, pendente, mode = 'money', emphasis } = opts;
    const bg = signal === '=' ? 'rgba(245, 158, 11, 0.08)' : undefined;
    const italic = signal === '-';
    return (
      <tr style={{ background: bg, fontWeight: emphasis || signal === '=' ? 700 : 400, fontStyle: italic ? 'italic' : 'normal' }}>
        <td style={{ padding: '6px 10px', color: COLOR_TEXT, borderTop: signal === '=' ? `1px solid ${COLOR_BORDER}` : undefined }}>
          <span style={{ color: COLOR_TEXT_MUTED, fontSize: 11, marginRight: 4, display: 'inline-block', width: 16 }}>{signal}</span>
          {label}
        </td>
        {values.map((v, i) => {
          const isPend = pendente && pendente[i];
          return (
            <td key={i} className="mono" style={{ padding: '6px 10px', textAlign: 'right', color: isPend ? COLOR_TEXT_MUTED : clr(v) }}>
              {isPend ? <span style={{ fontStyle: 'italic', fontSize: 10 }}>Pendente</span> : fmtCell(v, mode)}
            </td>
          );
        })}
        <td className="mono acum" style={{ padding: '6px 10px', textAlign: 'right', color: clr(acum), fontWeight: 700, background: signal === '=' ? 'rgba(245, 158, 11, 0.15)' : undefined }}>
          {fmtCell(acum, mode)}
        </td>
        <td className="mono" style={{ padding: '6px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, borderLeft: `1px solid ${COLOR_BORDER}` }}>
          {fmtCell(refAno, mode)}
        </td>
      </tr>
    );
  };

  return (
    <>
      {/* KPIs DRE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KPI label="Faturamento (competência)" value={fmtMoeda(sum3(dre.faturamento))} sub={`ref ${ref.ano}: ${fmtMoeda(ref.faturamento)}`} />
        <KPI label="Lucro Líquido" value={fmtMoeda(sum3(dre.lucroLiquido))} sub={`ref ${ref.ano}: ${fmtMoeda(ref.lucroLiquido)}`} />
        <KPI label="Margem" value={`${avg3(dre.margemLucroPct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} sub={`ref ${ref.ano}: ${ref.margemLucroPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} />
        <KPI label="Markup" value={`${avg3(dre.markupPct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} sub={`ref ${ref.ano}: ${ref.markupPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} />
      </div>

      <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: COLOR_SEC }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>DRE — Demonstrativo de Resultado</th>
              {mesLabels.map((m, i) => (
                <th key={i} style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{m}</th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_ACCENT, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Acum. T{d.trimestre}/{d.ano}</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderLeft: `1px solid ${COLOR_BORDER}` }}>Ref. {ref.ano}*</th>
            </tr>
          </thead>
          <tbody>
            {renderLine('Faturamento — competência', dre.faturamento, sum3(dre.faturamento), ref.faturamento, { signal: '+' })}
            {renderLine('Desembolso de Produção', dre.desembolsoProducao, sum3(dre.desembolsoProducao), ref.desembolsoProducao, { signal: '-' })}
            {renderLine('Lucro Bruto', dre.lucroBruto, sum3(dre.lucroBruto), ref.lucroBruto, { signal: '=', emphasis: true })}
            {renderLine('Reposição de Bovinos', dre.reposicaoBovinos, sum3(dre.reposicaoBovinos), ref.reposicaoBovinos, { signal: '-' })}
            {renderLine('Variação do Estoque de Gado', dre.variacaoEstoque, sum3(dre.variacaoEstoque), ref.variacaoEstoque, { signal: '+/-', pendente: dre.fechamentoPendente } as any)}
            {renderLine('Lucro Operacional', dre.lucroOperacional, sum3(dre.lucroOperacional), ref.lucroOperacional, { signal: '=', emphasis: true })}
            {renderLine('Juros de Financiamento', dre.jurosFinanciamento, sum3(dre.jurosFinanciamento), ref.jurosFinanciamento, { signal: '-' })}
            {renderLine('Lucro Líquido', dre.lucroLiquido, sum3(dre.lucroLiquido), ref.lucroLiquido, { signal: '=', emphasis: true })}
            {renderLine('Margem de Lucro (%)', dre.margemLucroPct, avg3(dre.margemLucroPct), ref.margemLucroPct, { signal: '', mode: 'pct' })}
            {renderLine('Markup (%)', dre.markupPct, avg3(dre.markupPct), ref.markupPct, { signal: '', mode: 'pct' })}
          </tbody>
        </table>
      </div>

      <div className="avoid-break" style={{ marginTop: 12, padding: 10, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, fontSize: 10, color: COLOR_TEXT_MUTED, lineHeight: 1.5 }}>
        <div style={{ marginBottom: 4 }}>* <strong>Faturamento por competência</strong> = receitas reconhecidas na data do abate/venda (não na data do pagamento).</div>
        <div>
          <strong>DRE ≠ Fluxo de Caixa</strong>: o DRE reconhece receita na data do abate/venda (competência);
          o Fluxo de Caixa registra na data do pagamento (caixa). Variação de estoque é econômica e não transita pelo caixa.
          Linhas com &ldquo;Pendente&rdquo; indicam mês sem <code>valor_rebanho_fechamento</code> disponível — fechar o mês para computar a variação de estoque.
        </div>
      </div>
    </>
  );
}

function TabelaTrimestral({ mesLabels, children }: { mesLabels: Arr3; children: React.ReactNode }) {
  return (
    <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: COLOR_SEC }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Indicador</th>
            {mesLabels.map((m, i) => (
              <th key={i} style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m}</th>
            ))}
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_ACCENT, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Acumulado</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
