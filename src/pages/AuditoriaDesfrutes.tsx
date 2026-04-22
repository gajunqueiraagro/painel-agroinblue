/**
 * AuditoriaDesfrutes — validação de Abates/Vendas/Consumo antes do
 * relatório trimestral. 3 sub-abas + consolidado, comparação Realizado×Meta,
 * histórico 6 anos (gráfico + tabela).
 */

import { useState, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuditoriaDesfrutes, type TipoDesfrute, type DesfruteAgregado, type HistoricoAno } from '@/hooks/useAuditoriaDesfrutes';
import type { Trimestre } from '@/hooks/useAnaliseTrimestral';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Arr3 = [number, number, number];
type AbaId = 'abate' | 'venda' | 'consumo' | 'desfrutes';

const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const LABEL_TIPO: Record<AbaId, string> = { abate: 'Abates', venda: 'Vendas', consumo: 'Consumo', desfrutes: 'Desfrutes (consolidado)' };
const ICON_TIPO: Record<AbaId, string> = { abate: '🔪', venda: '💰', consumo: '🍖', desfrutes: '📊' };

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
  .avoid-break { page-break-inside: avoid; }
  .chart-wrapper { display: none !important; } /* evita imprimir gráficos */
}
@media screen { .report { font-family: 'IBM Plex Sans', system-ui, sans-serif; } .report .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; } }
`;

function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoeda(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '–';
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}
const sum3 = (a: Arr3) => a[0] + a[1] + a[2];
function pct(real: number, ref: number): number | null {
  if (!Number.isFinite(real) || !Number.isFinite(ref) || ref === 0) return null;
  return ((real - ref) / Math.abs(ref)) * 100;
}
function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: COLOR_TEXT_MUTED }}>–</span>;
  const pos = pct >= 0;
  return <span style={{ color: pos ? COLOR_GOOD : COLOR_BAD, fontWeight: 600 }}>{pos ? '+' : ''}{pct.toFixed(1)}%</span>;
}

export function AuditoriaDesfrutes() {
  const { clienteAtual } = useCliente();
  const anoCurrent = new Date().getFullYear();
  const [ano, setAno] = useState<number>(anoCurrent);
  const [trimestre, setTrimestre] = useState<Trimestre>(((Math.floor(new Date().getMonth() / 3) + 1) as Trimestre) || 1);
  const [aba, setAba] = useState<AbaId>('abate');

  const q = useAuditoriaDesfrutes({ clienteId: clienteAtual?.id, ano, trimestre });
  const d = q.data;

  const mesLabels: [string, string, string] = useMemo(() => {
    const ms = [(trimestre - 1) * 3, (trimestre - 1) * 3 + 1, (trimestre - 1) * 3 + 2];
    return [MES_NOMES[ms[0]], MES_NOMES[ms[1]], MES_NOMES[ms[2]]];
  }, [trimestre]);

  const anosOptions: number[] = [];
  for (let y = 2020; y <= anoCurrent + 1; y++) anosOptions.push(y);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="report" style={{ background: COLOR_BG, color: COLOR_TEXT, minHeight: '100vh', padding: 16 }}>
        {/* Header */}
        <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${COLOR_BORDER}`, paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: COLOR_ACCENT }}>AUDITORIA DE DESFRUTES</div>
            <div style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>
              {clienteAtual?.nome || '—'} · T{trimestre}/{ano}
            </div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8 }}>
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
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 16, background: COLOR_CARD, padding: 4, borderRadius: 6, width: 'fit-content', flexWrap: 'wrap' }}>
          {(['abate', 'venda', 'consumo', 'desfrutes'] as AbaId[]).map(id => (
            <button key={id} onClick={() => setAba(id)} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4,
              background: aba === id ? COLOR_ACCENT : 'transparent',
              color: aba === id ? '#0f172a' : COLOR_TEXT,
              border: 'none', cursor: 'pointer',
            }}>{ICON_TIPO[id]} {LABEL_TIPO[id]}</button>
          ))}
        </div>

        {q.isLoading && <div style={{ padding: 20, color: COLOR_TEXT_MUTED }}>Carregando…</div>}
        {q.error && <div style={{ padding: 20, color: COLOR_BAD }}>Erro: {(q.error as Error).message}</div>}

        {d && (
          <>
            <TabelaRealVsMeta real={d.realizado[aba]} meta={d.meta[aba]} mesLabels={mesLabels} />
            <div className="avoid-break chart-wrapper" style={{ marginTop: 16, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_ACCENT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                Histórico — {LABEL_TIPO[aba]} — T{trimestre} (últimos 6 anos)
              </div>
              <HistoricoChart data={d.historico[aba]} />
            </div>
            <div style={{ marginTop: 16 }}>
              <TabelaHistorica data={d.historico[aba]} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ====================================================================
function TabelaRealVsMeta({ real, meta, mesLabels }: { real: DesfruteAgregado; meta: DesfruteAgregado; mesLabels: [string, string, string] }) {
  const rows: { label: string; realV: Arr3; metaV: Arr3; mode: 'num' | 'money'; dec?: number }[] = [
    { label: 'Cabeças',             realV: real.cabecas,       metaV: meta.cabecas,       mode: 'num' },
    { label: 'Peso Total (kg)',     realV: real.pesoTotalKg,   metaV: meta.pesoTotalKg,   mode: 'num', dec: 0 },
    { label: 'Peso Médio/cab (kg)', realV: real.pesoMedioCab,  metaV: meta.pesoMedioCab,  mode: 'num', dec: 1 },
    { label: 'Arrobas (@)',         realV: real.arrobas,       metaV: meta.arrobas,       mode: 'num', dec: 1 },
    { label: 'Valor Total (R$)',    realV: real.valorTotal,    metaV: meta.valorTotal,    mode: 'money' },
    { label: 'Preço R$/@',          realV: real.precoArroba,   metaV: meta.precoArroba,   mode: 'money' },
    { label: 'Preço R$/cab',        realV: real.precoCab,      metaV: meta.precoCab,      mode: 'money' },
  ];

  const fmtVal = (v: number, mode: 'num' | 'money', dec = 0) => {
    if (mode === 'money') return fmtMoeda(v);
    return fmt(v, dec);
  };

  return (
    <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: COLOR_SEC }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Indicador</th>
            {mesLabels.map(m => <th key={m} style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>{m}</th>)}
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_ACCENT, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Acum.</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Meta Acum.</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Var%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            // Acumulado: para valores "soma" somamos; para médios (peso médio, preço) precisamos derivar.
            // Regra: peso_medio e preço são derivados. Para acumulado/meta usamos soma dos subtotais.
            // Médios reais do trimestre são calculados a partir dos totais (já feito no hook para
            // cada mês; no acum derivado aqui fazemos a soma simples dos 3 valores mensais — visual).
            const realAcum = sum3(r.realV);
            const metaAcum = sum3(r.metaV);
            const v = pct(realAcum, metaAcum);
            return (
              <tr key={r.label}>
                <td style={{ padding: '5px 8px', color: COLOR_TEXT }}>{r.label}</td>
                {r.realV.map((val, i) => (
                  <td key={i} className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmtVal(val, r.mode, r.dec)}</td>
                ))}
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_ACCENT, textAlign: 'right', fontWeight: 700 }}>{fmtVal(realAcum, r.mode, r.dec)}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT_MUTED, textAlign: 'right' }}>{fmtVal(metaAcum, r.mode, r.dec)}</td>
                <td className="mono" style={{ padding: '5px 8px', textAlign: 'right' }}><Delta pct={v} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ====================================================================
function HistoricoChart({ data }: { data: HistoricoAno[] }) {
  const chartData = data.map(h => ({
    ano: String(h.ano),
    cabecas: h.cabecas,
    preco: Math.round(h.precoArroba),
  }));
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_BORDER} strokeOpacity={0.5} />
          <XAxis dataKey="ano" tick={{ fontSize: 11, fill: COLOR_TEXT_MUTED }} />
          <YAxis yAxisId="cab" tick={{ fontSize: 10, fill: COLOR_TEXT_MUTED }} />
          <YAxis yAxisId="preco" orientation="right" tick={{ fontSize: 10, fill: COLOR_ACCENT }} />
          <Tooltip
            contentStyle={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, fontSize: 11 }}
            labelStyle={{ color: COLOR_TEXT }}
            itemStyle={{ color: COLOR_TEXT }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="cab" dataKey="cabecas" name="Cabeças" fill={COLOR_ACCENT} fillOpacity={0.75} />
          <Line yAxisId="preco" type="monotone" dataKey="preco" name="R$/@" stroke={COLOR_GOOD} strokeWidth={2.5} dot={{ r: 3, fill: COLOR_GOOD }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ====================================================================
function TabelaHistorica({ data }: { data: HistoricoAno[] }) {
  const refAno = data[data.length - 1];
  return (
    <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: COLOR_SEC }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Ano</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Cab</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Peso Méd. (kg)</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Arrobas</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>R$/@</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Faturamento</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Var% Cab</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', color: COLOR_TEXT_MUTED, fontWeight: 700, fontSize: 10 }}>Var% R$/@</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => {
            const prev = i > 0 ? data[i - 1] : null;
            const vCab = prev ? pct(h.cabecas, prev.cabecas) : null;
            const vPreco = prev ? pct(h.precoArroba, prev.precoArroba) : null;
            const isRef = refAno && h.ano === refAno.ano;
            return (
              <tr key={h.ano} style={{ background: isRef ? COLOR_SEC : undefined, fontWeight: isRef ? 700 : 400 }}>
                <td style={{ padding: '5px 8px', color: isRef ? COLOR_ACCENT : COLOR_TEXT }}>{h.ano}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmt(h.cabecas)}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmt(h.pesoMedioCab, 1)}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmt(h.arrobas, 1)}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmtMoeda(h.precoArroba)}</td>
                <td className="mono" style={{ padding: '5px 8px', color: COLOR_TEXT, textAlign: 'right' }}>{fmtMoeda(h.faturamentoReceitaPec)}</td>
                <td className="mono" style={{ padding: '5px 8px', textAlign: 'right' }}><Delta pct={vCab} /></td>
                <td className="mono" style={{ padding: '5px 8px', textAlign: 'right' }}><Delta pct={vPreco} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
