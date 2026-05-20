/**
 * BlocoConferenciaMensalRebanhoFechamento.tsx — FASE 3 / PR3.3C
 *
 * Slide B do par Movimentações: prancha de conferência operacional.
 * Mostra a tabela Jan→Dez completa do rebanho (Saldo Início, movimentos,
 * Saldo Final) por mês, com totais. Auditoria operacional.
 *
 * Slide A (narrativa) = BlocoMovimentacoesRebanhoFechamento.
 * Os dois consomem o mesmo useMovimentacoesAgregadas (cache compartilhado
 * pela queryKey idêntica — sem custo extra de queries).
 */
import { useMemo } from 'react';
import { useMovimentacoesAgregadas } from '@/v2/hooks/useMovimentacoesAgregadas';
import { ExecutiveSlide } from '@/v2/components/executive/ExecutiveSlide';
import {
  fmtCab,
  MESES_CURTOS,
  buildLinhas,
  corSinal,
} from './BlocoMovimentacoesRebanhoFechamento';

interface Props {
  ano: number;
  mes: number;
  viewMode: 'mes' | 'periodo';
  isGlobal: boolean;
}

export function BlocoConferenciaMensalRebanhoFechamento({
  ano,
  mes,
  viewMode,
  isGlobal,
}: Props) {
  const { loading, porTipo, saldoInicialAnual } = useMovimentacoesAgregadas({
    ano,
    mes,
    viewMode,
    isGlobal,
  });

  // Saldo chain — mesma lógica do bloco narrativo (cache compartilhado pela queryKey).
  const { saldoInicial, saldoFinal } = useMemo(() => {
    const si: number[] = [0];
    const sf: number[] = [0];
    let cur = saldoInicialAnual;
    for (let m = 1; m <= 12; m++) {
      const ent = porTipo['soma_entradas']?.seriesJanDez.cab.real[m] ?? 0;
      const sai = porTipo['soma_saidas']?.seriesJanDez.cab.real[m] ?? 0;
      si.push(cur);
      sf.push(cur + ent - sai);
      cur = cur + ent - sai;
    }
    return { saldoInicial: si, saldoFinal: sf };
  }, [saldoInicialAnual, porTipo]);

  const colunas = Array.from({ length: 12 }, (_, i) => i + 1);
  const linhas  = buildLinhas(isGlobal);

  if (loading) {
    return (
      <div className="my-6 p-4 text-sm text-muted-foreground">
        Carregando conferência mensal…
      </div>
    );
  }

  return (
    <ExecutiveSlide
      title="Conferência Mensal — Movimentação do Rebanho"
      subtitle={`Jan a ${String(mes).padStart(2, '0')}/${ano} · Auditoria operacional`}
      className="my-6"
      footer="Saldos encadeados mês a mês · Meses futuros em cinza · Fonte: lançamentos realizados"
    >
      <div className="h-full overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/60 min-w-[120px]">
                Movimentação
              </th>
              {colunas.map(m => (
                <th key={m} className="text-right px-2 py-1.5 font-semibold min-w-[52px]">
                  {MESES_CURTOS[m - 1]}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-semibold min-w-[64px] border-l border-border/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((row, idx) => {
              const isSaldoInicio = row.label === 'Saldo Início';
              const isSaldoFinal  = row.label === 'Saldo Final';
              const isSaldo = isSaldoInicio || isSaldoFinal;
              return (
                <tr
                  key={idx}
                  className={isSaldo ? 'bg-muted/40 border-t border-border/40' : 'hover:bg-muted/20'}
                >
                  <td className={`px-2 py-1 sticky left-0 ${isSaldo ? 'bg-muted/40 font-semibold' : 'bg-background'} ${corSinal(row.sinal)}`}>
                    {!isSaldo && (
                      <span className="mr-1 opacity-50">
                        {row.sinal === 'entrada' ? '+' : '–'}
                      </span>
                    )}
                    {row.label}
                  </td>
                  {colunas.map(m => {
                    const futuro = m > mes;
                    let v: number;
                    if (isSaldoInicio)     v = saldoInicial[m];
                    else if (isSaldoFinal)  v = saldoFinal[m];
                    else                    v = row.tipo ? (porTipo[row.tipo]?.seriesJanDez.cab.real[m] ?? 0) : 0;
                    return (
                      <td
                        key={m}
                        className={`text-right px-2 py-1 tabular-nums ${
                          futuro ? 'text-muted-foreground/30 bg-muted/10' : corSinal(row.sinal)
                        }`}
                      >
                        {futuro || v === 0
                          ? <span className="text-muted-foreground/30">—</span>
                          : fmtCab(v)}
                      </td>
                    );
                  })}
                  <td className={`text-right px-2 py-1 tabular-nums border-l border-border/60 ${isSaldo ? 'font-semibold' : ''} ${corSinal(row.sinal)}`}>
                    {(() => {
                      if (isSaldoInicio) return fmtCab(saldoInicial[1]);
                      if (isSaldoFinal)  return fmtCab(saldoFinal[mes]);
                      const tot = colunas
                        .filter(m => m <= mes)
                        .reduce((s, m) => s + (row.tipo ? (porTipo[row.tipo]?.seriesJanDez.cab.real[m] ?? 0) : 0), 0);
                      return tot !== 0
                        ? fmtCab(tot)
                        : <span className="text-muted-foreground/30">—</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ExecutiveSlide>
  );
}
