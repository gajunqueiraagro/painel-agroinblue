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
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, LabelList } from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';
import { serieEvolucao } from '@/lib/analise/analiseAgregacoes';

interface LinhaFluxo { data: string; mov: number; saldo: number | null; }
function fmtEixoY(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}${Math.round(abs / 1000)}k`;
  return String(Math.round(v));
}
// Valor compacto para labels de pontos (mesmo padrão das colunas): R$ 27,9k · R$ 405k.
function fmtCompacto(v: number): string {
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return formatMoeda(v);
}

export function ExtratoAnaliseFluxo({ linhas, saldoIni, contaNome, periodoLabel, ano, mes }: {
  linhas: LinhaFluxo[];
  saldoIni: number | null;
  contaNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
}) {
  const serie = useMemo(() => serieEvolucao(linhas, saldoIni, ano, mes), [linhas, saldoIni, ano, mes]);

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

  // Ponto de virada da zona (azul acima do zero / vermelho abaixo) — fração do topo onde o saldo cruza 0.
  const gradOffset = useMemo(() => {
    if (serie.length === 0) return 1;
    const vals = serie.map((p) => p.saldo);
    const mx = Math.max(...vals), mn = Math.min(...vals);
    if (mx <= 0) return 0;
    if (mn >= 0) return 1;
    return mx / (mx - mn);
  }, [serie]);

  return (
    <div className="w-full max-w-[780px] mx-auto rounded-lg border px-4 py-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-[12px] font-semibold">Evolução do caixa projetado</div>
        <div className="text-[9px] text-muted-foreground">Baseado nos compromissos selecionados · {contaNome} · {periodoLabel}</div>
      </div>

      {saldoIni === null ? (
        <div className="h-[240px] flex items-center justify-center text-[11px] text-muted-foreground">
          Saldo inicial não informado — não é possível projetar.
        </div>
      ) : (
        <>
          {/* altura executiva reduzida — não ocupa a tela inteira */}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="zonaSaldoFluxo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gradOffset} stopColor="#3b82f6" stopOpacity={0.12} />
                    <stop offset={gradOffset} stopColor="#ef4444" stopOpacity={0.12} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
                {/* Zona de fundo: azul p/ saldo>0, vermelho p/ saldo<0 — leitura de aperto de caixa. */}
                <Area type="monotone" dataKey="saldo" stroke="none" fill="url(#zonaSaldoFluxo)" baseValue={0} isAnimationActive={false} />
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
                <Line type="monotone" dataKey="saldo" stroke="#1e3a5f" strokeWidth={1.2} dot={false} />
                {inicial && <ReferenceDot x={inicial.dia} y={inicial.saldo} r={3} fill="#1e3a5f" stroke="#fff" label={{ value: fmtCompacto(inicial.saldo), position: 'top', fontSize: 9, fill: '#1e3a5f' }} />}
                {final && <ReferenceDot x={final.dia} y={final.saldo} r={3.5} fill="#1e3a5f" stroke="#fff" label={{ value: fmtCompacto(final.saldo), position: 'top', fontSize: 9, fill: '#1e3a5f' }} />}
                {menor && <ReferenceDot x={menor.dia} y={menor.saldo} r={3} fill={menor.saldo < 0 ? '#b91c1c' : '#22784a'} stroke="#fff" label={{ value: fmtCompacto(menor.saldo), position: 'bottom', fontSize: 9, fill: menor.saldo < 0 ? '#b91c1c' : '#22784a' }} />}
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
