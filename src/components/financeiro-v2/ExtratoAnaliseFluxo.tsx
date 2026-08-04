/**
 * ExtratoAnaliseFluxo — PR-FIN-V2-FLUXO-PROJETADO (visão analítica do Extrato Gerencial).
 *
 * NÃO cria verdade nova: outra apresentação do MESMO extrato (mesma conta/mês/status).
 * Recebe do ExtratoGerencialTab o array `linhas` já computado (mov + saldo corrido) + saldo inicial.
 *
 * PR-A/A.1 — "Evolução do caixa projetado" (executivo, orientado à decisão):
 *   - série COMPLETA do mês (01..fim), saldo carregado dia-a-dia (carry-forward);
 *   - COLUNAS = líquido movimentado por dia (entrada verde +, saída vermelha −);
 *   - LINHA = saldo acumulado; ponto inicial = saldo inicial; ponto final = saldo projetado do extrato;
 *   - eixo Y único, domínio simétrico em torno do zero quando há negativos + linha zero destacada;
 *   - labels nas barras (dias com movimento) e nos pontos inicial/final/mínimo;
 *   - sem saldo inicial → não projeta. Sem interpretação ("risco"/"alerta").
 */
import { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, LabelList } from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';

interface LinhaFluxo { data: string; mov: number; saldo: number | null; }
const pad2 = (n: number) => String(n).padStart(2, '0');
function fmtEixoY(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}${Math.round(abs / 1000)}k`;
  return String(Math.round(v));
}

export function ExtratoAnaliseFluxo({ linhas, saldoIni, contaNome, periodoLabel, ano, mes }: {
  linhas: LinhaFluxo[];
  saldoIni: number | null;
  contaNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
}) {
  const serie = useMemo(() => {
    if (saldoIni === null) return [];
    const movPorDia = new Map<number, number>();
    for (const p of linhas) {
      const dd = Number(p.data.slice(8, 10));
      if (dd) movPorDia.set(dd, (movPorDia.get(dd) ?? 0) + p.mov);
    }
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const pontos: { dia: string; mov: number; saldo: number }[] = [{ dia: 'Início', mov: 0, saldo: saldoIni }];
    let acc = saldoIni;
    for (let d = 1; d <= diasNoMes; d++) { const mv = movPorDia.get(d) ?? 0; acc += mv; pontos.push({ dia: pad2(d), mov: mv, saldo: acc }); }
    return pontos;
  }, [linhas, saldoIni, ano, mes]);

  const menor = useMemo(() => (serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null), [serie]);
  const inicial = serie.length ? serie[0] : null;
  const final = serie.length ? serie[serie.length - 1] : null;

  // Domínio Y único; simétrico em torno de zero quando há valores negativos.
  const dominio = useMemo((): [number, number] => {
    if (serie.length === 0) return [0, 1];
    const vals = serie.flatMap((p) => [p.saldo, p.mov]);
    const maxV = Math.max(...vals, 0);
    const minV = Math.min(...vals, 0);
    if (minV < 0) { const M = Math.max(Math.abs(minV), Math.abs(maxV)) * 1.1; return [-M, M]; }
    return [0, maxV * 1.1 || 1];
  }, [serie]);

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-[12px] font-semibold">Evolução do caixa projetado</div>
        <div className="text-[9px] text-muted-foreground">Baseado nos compromissos selecionados · {contaNome} · {periodoLabel}</div>
      </div>

      {saldoIni === null ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-muted-foreground">
          Saldo inicial não informado — não é possível projetar.
        </div>
      ) : (
        <>
          {/* altura executiva fixa — não ocupa a tela inteira */}
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tick={{ fontSize: 9 }} width={44} domain={dominio} tickFormatter={fmtEixoY} />
                <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.2} />
                <Tooltip
                  formatter={(v, name) => [typeof v === 'number' ? formatMoeda(v) : String(v), name === 'mov' ? 'Líquido do dia' : 'Saldo acumulado']}
                  labelFormatter={(l) => `Dia ${l}`}
                  contentStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="mov" barSize={10}>
                  {serie.map((p, i) => <Cell key={i} fill={p.mov >= 0 ? '#22784a' : '#b91c1c'} />)}
                  <LabelList dataKey="mov" position="top" formatter={(v) => (typeof v === 'number' && v !== 0 ? fmtEixoY(v) : '')} style={{ fontSize: 8, fill: '#64748b' }} />
                </Bar>
                <Line type="monotone" dataKey="saldo" stroke="#1e3a5f" strokeWidth={2} dot={false} />
                {inicial && <ReferenceDot x={inicial.dia} y={inicial.saldo} r={3} fill="#1e3a5f" stroke="#fff" label={{ value: formatMoeda(inicial.saldo), position: 'top', fontSize: 9, fill: '#1e3a5f' }} />}
                {final && <ReferenceDot x={final.dia} y={final.saldo} r={3.5} fill="#1e3a5f" stroke="#fff" label={{ value: formatMoeda(final.saldo), position: 'top', fontSize: 9, fill: '#1e3a5f' }} />}
                {menor && <ReferenceDot x={menor.dia} y={menor.saldo} r={3} fill={menor.saldo < 0 ? '#b91c1c' : '#22784a'} stroke="#fff" label={{ value: formatMoeda(menor.saldo), position: 'bottom', fontSize: 9, fill: menor.saldo < 0 ? '#b91c1c' : '#22784a' }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>Saldo inicial: <span className="font-semibold text-foreground">{formatMoeda(saldoIni)}</span></span>
            <span>Saldo projetado: <span className={`font-semibold ${final && final.saldo < 0 ? 'text-rose-700' : 'text-foreground'}`}>{final ? formatMoeda(final.saldo) : '—'}</span></span>
            {menor && <span>Menor saldo projetado: <span className={`font-semibold ${menor.saldo < 0 ? 'text-rose-700' : 'text-foreground'}`}>{formatMoeda(menor.saldo)}</span>{menor.dia !== 'Início' ? ` · dia ${menor.dia}` : ''}</span>}
          </div>
        </>
      )}
    </div>
  );
}
