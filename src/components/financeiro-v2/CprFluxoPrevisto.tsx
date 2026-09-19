/**
 * A visão Fluxo da CPR — PR-CPR-2B.
 *
 * ⚠ ELA NÃO TEM FONTE PRÓPRIA. Recebe as linhas que a Lista já carregou e o saldo que o card
 * já calculou; tudo o que faz é somar (`montarFluxoPrevisto`) e desenhar. Trocar horizonte,
 * segmento ou status muda o gráfico porque muda a Lista — não porque o gráfico escute algo.
 *
 * ⚠ recharts, NÃO SVG À MÃO: a lib já é dependência do projeto e tem 36 consumidores. O irmão
 * mais próximo é a "Evolução do caixa" do Extrato Gerencial (`ExtratoAnaliseFluxo`), e as
 * convenções de eixo vêm de lá verbatim — tick em 9px, `interval="preserveStartEnd"`, navy
 * `#1e3a5f` na linha, `ReferenceLine` no zero.
 */
import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  montarFluxoPrevisto, primeiroNegativo, type LinhaFluxoPrevisto,
} from '@/lib/financeiro/fluxoPrevisto';

/* As cores são as do irmão: verde de entrada, vermelho de saída, navy do saldo. */
const COR_ENTRADA = '#22784a';
const COR_SAIDA = '#b91c1c';
const COR_SALDO = '#1e3a5f';

/** Eixo Y em milhares — a mesma régua de `ExtratoAnaliseFluxo`. */
function fmtEixoY(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}${Math.round(abs / 1000)}k`;
  return String(Math.round(v));
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string }[];
}

function TooltipFluxo({ active, label, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const achar = (k: string) => {
    const p = payload.find((x) => x.dataKey === k);
    return typeof p?.value === 'number' ? p.value : 0;
  };
  const entradas = achar('entradas');
  const saidas = achar('saidas');
  const saldo = achar('saldo');
  return (
    <div className="rounded-md border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
      <div className="text-[10px] font-medium text-foreground">{label}</div>
      {entradas > 0 && (
        <div className="text-[10px] tabular-nums" style={{ color: COR_ENTRADA }}>
          entra {formatMoeda(entradas)}
        </div>
      )}
      {saidas < 0 && (
        <div className="text-[10px] tabular-nums" style={{ color: COR_SAIDA }}>
          sai {formatMoeda(Math.abs(saidas))}
        </div>
      )}
      <div className="mt-0.5 text-[11px] font-medium tabular-nums" style={{ color: COR_SALDO }}>
        saldo {formatMoeda(saldo)}
      </div>
    </div>
  );
}

export function CprFluxoPrevisto({ linhas, saldoInicial, caveat }: {
  linhas: readonly LinhaFluxoPrevisto[];
  /** O mesmo "Saldo em caixa (estimado)" do card. `null` quando não há âncora. */
  saldoInicial: number | null;
  /** O rótulo de conciliação do card, herdado inteiro. */
  caveat: string | null;
}) {
  const { pontos, semVencimento } = useMemo(
    () => montarFluxoPrevisto(linhas, saldoInicial ?? 0), [linhas, saldoInicial]);
  const negativo = useMemo(() => primeiroNegativo(pontos), [pontos]);

  if (saldoInicial === null) {
    return (
      <div className="flex h-full items-center justify-center px-3 py-10">
        <p className="text-center text-[11px] text-muted-foreground">
          Sem saldo conciliado de partida — o fluxo previsto não tem de onde começar.
        </p>
      </div>
    );
  }

  if (pontos.length <= 1) {
    return (
      <div className="flex h-full items-center justify-center px-3 py-10">
        <p className="text-center text-[11px] text-muted-foreground">
          Nenhum compromisso neste período — não há fluxo a projetar.
        </p>
      </div>
    );
  }

  const ultimo = pontos[pontos.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-2">
        <h2 className="text-[12px] font-medium leading-none text-foreground">
          Fluxo de caixa previsto
        </h2>
        {/* ⚠ O CAVEAT DO SALDO VEM INTEIRO, e ganha o seu próprio: o gráfico parte de um saldo
            conciliado até certa data E assume que todo compromisso cai no vencimento. As duas
            ressalvas são do mesmo número e andam juntas. */}
        <p className="mt-0.5 text-[9.5px] leading-snug text-muted-foreground">
          {caveat ? `${caveat} · ` : ''}previsto: assume que tudo cai no vencimento
          {semVencimento > 0 && ` · ${semVencimento} sem vencimento, fora do gráfico`}
        </p>
      </div>

      <div className="min-h-0 flex-1 px-1 pb-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />

            {/* ⚠ A ZONA VERMELHA COBRE DO CRUZAMENTO ATÉ O FIM, e só existe quando há
                cruzamento: num cliente que fica positivo o gráfico não ganha alarme nenhum. */}
            {negativo && (
              <ReferenceArea
                x1={negativo.rotulo} x2={ultimo.rotulo}
                fill={COR_SAIDA} fillOpacity={0.06} stroke="none"
                label={{
                  value: `caixa negativo a partir de ${negativo.rotulo}`,
                  position: 'insideTopRight', fontSize: 9, fill: COR_SAIDA,
                }}
              />
            )}

            <XAxis dataKey="rotulo" tick={{ fontSize: 9 }}
              interval="preserveStartEnd" minTickGap={14} />
            <YAxis tick={{ fontSize: 9 }} width={44} tickFormatter={fmtEixoY} />
            <Tooltip content={<TooltipFluxo />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
            <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.2} />

            {/* ⚠ MESMA `stackId` NAS DUAS BARRAS: as entradas são positivas e as saídas
                negativas (ver a lib), então o recharts empilha uma para cima e a outra para
                baixo do zero — UMA coluna por mês. Duas barras lado a lado partiriam a largura
                ao meio, e no horizonte "Tudo" (57 meses) cada metade ficaria com ~7px. */}
            <Bar dataKey="entradas" name="Entradas" stackId="mov" fill={COR_ENTRADA} maxBarSize={28} />
            <Bar dataKey="saidas" name="Saídas" stackId="mov" fill={COR_SAIDA} maxBarSize={28} />
            <Line type="monotone" dataKey="saldo" name="Saldo projetado"
              stroke={COR_SALDO} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
