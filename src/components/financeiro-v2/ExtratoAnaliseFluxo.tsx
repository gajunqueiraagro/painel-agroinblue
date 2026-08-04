/**
 * ExtratoAnaliseFluxo — PR-FIN-V2-FLUXO-PROJETADO (visão analítica do Extrato Gerencial).
 *
 * NÃO cria verdade nova: é outra apresentação do MESMO extrato (mesma conta/mês/status).
 * Recebe do ExtratoGerencialTab o array `linhas` já computado (mov + saldo corrido) + saldo inicial.
 *
 * PR-A — "Evolução do caixa projetado":
 *   - COLUNAS: valor líquido movimentado por dia (entrada +, saída −), da soma de `mov` por dia;
 *   - LINHA: saldo acumulado da conta (último saldo corrido de cada dia); ponto inicial = saldo inicial;
 *     ponto final OBRIGATORIAMENTE = saldo projetado do extrato (mesma regra de saldo corrido);
 *   - projeção depende dos STATUS selecionados (compromissos) — rótulo explícito (Art. 19);
 *   - sem saldo inicial → não projeta.
 *
 * Sem interpretação financeira automática (nada de "risco"/"alerta") — ferramenta de visualização.
 * Blocos de distribuição/ranking (PR-B) e alertas (PR-C) chegam depois.
 */
import { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';

interface LinhaFluxo { data: string; mov: number; saldo: number | null; }

function diaCurto(iso: string): string {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  return m ? m[1] : '—';
}
function fmtEixoY(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}${Math.round(abs / 1000)}k`;
  return String(Math.round(v));
}

export function ExtratoAnaliseFluxo({ linhas, saldoIni, contaNome, periodoLabel }: {
  linhas: LinhaFluxo[];
  saldoIni: number | null;
  contaNome: string;
  periodoLabel: string;
}) {
  const serie = useMemo(() => {
    if (saldoIni === null) return [];
    const movPorDia = new Map<string, number>();
    const saldoPorDia = new Map<string, number>();
    for (const p of linhas) {
      movPorDia.set(p.data, (movPorDia.get(p.data) ?? 0) + p.mov);
      if (p.saldo !== null) saldoPorDia.set(p.data, p.saldo); // linhas ordenadas asc → último do dia sobrescreve
    }
    const pontos: { dia: string; mov: number; saldo: number }[] = [{ dia: 'Início', mov: 0, saldo: saldoIni }];
    for (const d of saldoPorDia.keys()) pontos.push({ dia: diaCurto(d), mov: movPorDia.get(d) ?? 0, saldo: saldoPorDia.get(d) ?? 0 });
    return pontos;
  }, [linhas, saldoIni]);

  const menor = useMemo(() => (serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null), [serie]);
  const saldoFinal = serie.length ? serie[serie.length - 1].saldo : null;

  return (
    <div className="flex flex-col h-full rounded-lg border p-2">
      <div className="flex items-baseline justify-between gap-2 shrink-0 mb-1">
        <div className="text-[12px] font-semibold">Evolução do caixa projetado</div>
        <div className="text-[9px] text-muted-foreground">Baseado nos compromissos selecionados · {contaNome} · {periodoLabel}</div>
      </div>

      {saldoIni === null ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground">
          Saldo inicial não informado — não é possível projetar.
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="saldo" tick={{ fontSize: 10 }} width={44} tickFormatter={fmtEixoY} />
                <YAxis yAxisId="mov" orientation="right" tick={{ fontSize: 10 }} width={44} tickFormatter={fmtEixoY} />
                <Tooltip
                  formatter={(v, name) => [typeof v === 'number' ? formatMoeda(v) : String(v), name === 'mov' ? 'Líquido do dia' : 'Saldo acumulado']}
                  labelFormatter={(l) => `Dia ${l}`}
                  contentStyle={{ fontSize: 11 }}
                />
                <Bar yAxisId="mov" dataKey="mov" barSize={14}>
                  {serie.map((p, i) => <Cell key={i} fill={p.mov >= 0 ? '#22784a' : '#b91c1c'} />)}
                </Bar>
                <Line yAxisId="saldo" type="monotone" dataKey="saldo" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="shrink-0 mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>Saldo inicial: <span className="font-semibold text-foreground">{formatMoeda(saldoIni)}</span></span>
            <span>Saldo projetado: <span className={`font-semibold ${saldoFinal !== null && saldoFinal < 0 ? 'text-rose-700' : 'text-foreground'}`}>{saldoFinal !== null ? formatMoeda(saldoFinal) : '—'}</span></span>
            {menor && <span>Menor saldo projetado: <span className={`font-semibold ${menor.saldo < 0 ? 'text-rose-700' : 'text-foreground'}`}>{formatMoeda(menor.saldo)}</span>{menor.dia !== 'Início' ? ` · dia ${menor.dia}` : ''}</span>}
          </div>
        </>
      )}
    </div>
  );
}
