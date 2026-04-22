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

// Tema claro compacto (bg-background-like)
const COLOR_BG = 'hsl(var(--background))';
const COLOR_CARD = 'hsl(var(--card))';
const COLOR_BORDER = 'hsl(var(--border))';
const COLOR_TEXT = 'hsl(var(--foreground))';
const COLOR_TEXT_MUTED = 'hsl(var(--muted-foreground))';
const COLOR_ACCENT = 'hsl(var(--primary))';
const COLOR_GOOD = '#16a34a';
const COLOR_BAD = '#dc2626';
const COLOR_SEC = 'hsl(var(--muted))';

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
  return <span style={{ color: pos ? COLOR_GOOD : COLOR_BAD, fontWeight: 600 }}>{pos ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</span>;
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
      <div className="report" style={{ background: COLOR_BG, color: COLOR_TEXT, minHeight: '100vh', padding: 10 }}>
        {/* Header */}
        <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${COLOR_BORDER}`, paddingBottom: 8, marginBottom: 8 }}>
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
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 8, background: COLOR_CARD, padding: 3, borderRadius: 6, width: 'fit-content', flexWrap: 'wrap' }}>
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
            <div className="avoid-break chart-wrapper" style={{ marginTop: 8, background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLOR_ACCENT, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Histórico — {LABEL_TIPO[aba]} — T{trimestre} (últimos 6 anos)
              </div>
              <HistoricoChart data={d.historico[aba]} />
            </div>
            <div style={{ marginTop: 8 }}>
              <TabelaHistorica data={d.historico[aba]} meta={(d as any).historicoMeta[aba]} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ====================================================================
function TabelaRealVsMeta({ real, meta, mesLabels }: { real: DesfruteAgregado; meta: DesfruteAgregado; mesLabels: [string, string, string] }) {
  // Cada row traz o acumulado derivado do hook (DesfruteAgregado.acum) para evitar
  // somar médias. Campos "soma" (cabecas/pesoTotalKg/arrobas/valorTotal) vêm dos
  // acum.* diretamente (que são somas dos 3 meses); médias (pesoMedio/preco) vêm
  // das razões dos totais.
  const rows: { label: string; realV: Arr3; metaV: Arr3; realAcum: number; metaAcum: number; mode: 'num' | 'money'; dec?: number }[] = [
    { label: 'Cabeças',             realV: real.cabecas,      metaV: meta.cabecas,      realAcum: real.acum.cabecas,      metaAcum: meta.acum.cabecas,      mode: 'num' },
    { label: 'Peso Total (kg)',     realV: real.pesoTotalKg,  metaV: meta.pesoTotalKg,  realAcum: real.acum.pesoTotalKg,  metaAcum: meta.acum.pesoTotalKg,  mode: 'num', dec: 0 },
    { label: 'Peso Médio/cab (kg)', realV: real.pesoMedioCab, metaV: meta.pesoMedioCab, realAcum: real.acum.pesoMedioCab, metaAcum: meta.acum.pesoMedioCab, mode: 'num', dec: 1 },
    { label: 'Arrobas (@)',         realV: real.arrobas,      metaV: meta.arrobas,      realAcum: real.acum.arrobas,      metaAcum: meta.acum.arrobas,      mode: 'num', dec: 1 },
    { label: 'Valor Total (R$)',    realV: real.valorTotal,   metaV: meta.valorTotal,   realAcum: real.acum.valorTotal,   metaAcum: meta.acum.valorTotal,   mode: 'money' },
    { label: 'Preço R$/@',          realV: real.precoArroba,  metaV: meta.precoArroba,  realAcum: real.acum.precoArroba,  metaAcum: meta.acum.precoArroba,  mode: 'money' },
    { label: 'Preço R$/cab',        realV: real.precoCab,     metaV: meta.precoCab,     realAcum: real.acum.precoCab,     metaAcum: meta.acum.precoCab,     mode: 'money' },
  ];

  const fmtVal = (v: number, mode: 'num' | 'money', dec = 0) =>
    mode === 'money' ? fmtMoeda(v) : fmt(v, dec);

  const th = { padding: '4px 8px', color: COLOR_TEXT_MUTED, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.3 };
  const td = { padding: '3px 8px', fontSize: 11 };

  return (
    <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: COLOR_SEC }}>
            <th style={{ ...th, textAlign: 'left' }}>Indicador</th>
            {mesLabels.map(m => <th key={m} style={{ ...th, textAlign: 'right' }}>{m}</th>)}
            <th style={{ ...th, textAlign: 'right', color: COLOR_ACCENT }}>Acum.</th>
            <th style={{ ...th, textAlign: 'right' }}>Meta Acum.</th>
            <th style={{ ...th, textAlign: 'right' }}>Var%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const v = pct(r.realAcum, r.metaAcum);
            return (
              <tr key={r.label}>
                <td style={{ ...td, color: COLOR_TEXT }}>{r.label}</td>
                {r.realV.map((val, i) => (
                  <td key={i} className="mono" style={{ ...td, color: COLOR_TEXT, textAlign: 'right' }}>{fmtVal(val, r.mode, r.dec)}</td>
                ))}
                <td className="mono" style={{ ...td, color: COLOR_ACCENT, textAlign: 'right', fontWeight: 700 }}>{fmtVal(r.realAcum, r.mode, r.dec)}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT_MUTED, textAlign: 'right' }}>{fmtVal(r.metaAcum, r.mode, r.dec)}</td>
                <td className="mono" style={{ ...td, textAlign: 'right' }}><Delta pct={v} /></td>
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
    <div style={{ width: '100%', height: 150, maxHeight: 180 }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLOR_BORDER} strokeOpacity={0.4} />
          <XAxis dataKey="ano" tick={{ fontSize: 9, fill: COLOR_TEXT_MUTED }} />
          <YAxis yAxisId="cab" tick={{ fontSize: 9, fill: COLOR_TEXT_MUTED }} />
          <YAxis yAxisId="preco" orientation="right" tick={{ fontSize: 9, fill: COLOR_ACCENT }} />
          <Tooltip
            contentStyle={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, fontSize: 10, padding: 6 }}
            labelStyle={{ color: COLOR_TEXT, fontSize: 10 }}
            itemStyle={{ color: COLOR_TEXT, fontSize: 10 }}
          />
          <Bar yAxisId="cab" dataKey="cabecas" name="Cab" fill={COLOR_ACCENT} fillOpacity={0.75} />
          <Line yAxisId="preco" type="monotone" dataKey="preco" name="R$/@" stroke={COLOR_GOOD} strokeWidth={2} dot={{ r: 2.5, fill: COLOR_GOOD }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ====================================================================
function TabelaHistorica({ data, meta }: { data: HistoricoAno[]; meta: HistoricoAno[] }) {
  const refAno = data[data.length - 1];
  const metaByAno = new Map(meta.map(m => [m.ano, m]));
  const th = { padding: '4px 6px', color: COLOR_TEXT_MUTED, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.3 };
  const td = { padding: '3px 6px', fontSize: 11 };

  return (
    <div className="avoid-break" style={{ background: COLOR_CARD, border: `1px solid ${COLOR_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: COLOR_SEC }}>
            <th style={{ ...th, textAlign: 'left' }}>Ano</th>
            <th style={{ ...th, textAlign: 'right' }}>Cab Real</th>
            <th style={{ ...th, textAlign: 'right' }}>Cab Meta</th>
            <th style={{ ...th, textAlign: 'right' }}>Var%</th>
            <th style={{ ...th, textAlign: 'right' }}>@ Real</th>
            <th style={{ ...th, textAlign: 'right' }}>@ Meta</th>
            <th style={{ ...th, textAlign: 'right' }}>R$/@ Real</th>
            <th style={{ ...th, textAlign: 'right' }}>R$/@ Meta</th>
            <th style={{ ...th, textAlign: 'right' }}>Fat. Real</th>
          </tr>
        </thead>
        <tbody>
          {data.map(h => {
            const m = metaByAno.get(h.ano);
            const vCab = m && m.cabecas > 0 ? pct(h.cabecas, m.cabecas) : null;
            const isRef = refAno && h.ano === refAno.ano;
            return (
              <tr key={h.ano} style={{ background: isRef ? COLOR_SEC : undefined, fontWeight: isRef ? 700 : 400 }}>
                <td style={{ ...td, color: isRef ? COLOR_ACCENT : COLOR_TEXT }}>{h.ano}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT, textAlign: 'right' }}>{fmt(h.cabecas)}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT_MUTED, textAlign: 'right' }}>{m ? fmt(m.cabecas) : '–'}</td>
                <td className="mono" style={{ ...td, textAlign: 'right' }}><Delta pct={vCab} /></td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT, textAlign: 'right' }}>{fmt(h.arrobas, 1)}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT_MUTED, textAlign: 'right' }}>{m ? fmt(m.arrobas, 1) : '–'}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT, textAlign: 'right' }}>{fmtMoeda(h.precoArroba)}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT_MUTED, textAlign: 'right' }}>{m ? fmtMoeda(m.precoArroba) : '–'}</td>
                <td className="mono" style={{ ...td, color: COLOR_TEXT, textAlign: 'right' }}>{fmtMoeda(h.faturamentoReceitaPec)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
