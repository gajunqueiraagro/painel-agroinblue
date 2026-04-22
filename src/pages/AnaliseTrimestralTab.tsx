/**
 * AnaliseTrimestralTab — Relatório trimestral do cliente.
 * 2 abas: Gerente da Fazenda | Proprietário/Financeiro.
 * Tema escuro inline + print CSS (window.print()).
 */

import { useState, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useAnaliseTrimestral, type Trimestre } from '@/hooks/useAnaliseTrimestral';
import { Button } from '@/components/ui/button';
import { Printer, BarChart3 } from 'lucide-react';

type AbaId = 'gerente' | 'proprietario';
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

// Paleta tema escuro
const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_BORDER = '#334155';
const COLOR_TEXT = '#e2e8f0';
const COLOR_TEXT_MUTED = '#94a3b8';
const COLOR_ACCENT = '#f59e0b';
const COLOR_GOOD = '#10b981';
const COLOR_BAD = '#ef4444';
const COLOR_SEC = '#0b1220';

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

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: COLOR_TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: COLOR_TEXT, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: COLOR_TEXT_MUTED, marginTop: 2 }}>{sub}</div>}
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
  const [aba, setAba] = useState<AbaId>('gerente');

  const q = useAnaliseTrimestral({ clienteId, ano, trimestre });
  const d = q.data;
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
            <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value) as Trimestre)} style={{ background: COLOR_CARD, color: COLOR_TEXT, border: `1px solid ${COLOR_BORDER}`, borderRadius: 4, padding: '6px 8px' }}>
              {[1,2,3,4].map(t => <option key={t} value={t}>T{t}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 16, background: COLOR_CARD, padding: 4, borderRadius: 6, width: 'fit-content' }}>
          <button onClick={() => setAba('gerente')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, background: aba === 'gerente' ? COLOR_ACCENT : 'transparent', color: aba === 'gerente' ? '#0f172a' : COLOR_TEXT, border: 'none', cursor: 'pointer' }}>📋 Gerente</button>
          <button onClick={() => setAba('proprietario')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, background: aba === 'proprietario' ? COLOR_ACCENT : 'transparent', color: aba === 'proprietario' ? '#0f172a' : COLOR_TEXT, border: 'none', cursor: 'pointer' }}>📊 Proprietário</button>
        </div>

        {q.isLoading && <div style={{ padding: 20, color: COLOR_TEXT_MUTED }}>Carregando dados do trimestre…</div>}
        {q.error && <div style={{ padding: 20, color: COLOR_BAD }}>Erro: {(q.error as Error).message}</div>}
        {d && aba === 'gerente' && <TabGerente d={d} mesLabels={mesLabels} />}
        {d && aba === 'proprietario' && <TabProprietario d={d} mesLabels={mesLabels} />}

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

        <SectionHeader label="Custo Pecuária" />
        <Row label="Custo Fixo" values={cp.custoFixo} acum={sumAcum(cp.custoFixo)} mode="money" />
        <Row label="Custo Variável" values={cp.custoVariavel} acum={sumAcum(cp.custoVariavel)} mode="money" />
        <Row label="Juros Financiamento" values={cp.juros} acum={sumAcum(cp.juros)} mode="money" />
        <Row label="Deduções" values={cp.deducoes} acum={sumAcum(cp.deducoes)} mode="money" />
        <Row label="Total (CP)" values={cp.total} acum={cpTotalAcum} mode="money" emphasis />
        <Row label="R$/cab/mês" values={cp.rCabMes} acum={rCabAcum} mode="money" />
        <Row label="Investimentos Pecuária" values={cp.investPec} acum={sumAcum(cp.investPec)} mode="money" />
        <Row label="Compra Bovinos" values={cp.compraBovinos} acum={sumAcum(cp.compraBovinos)} mode="money" />
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
