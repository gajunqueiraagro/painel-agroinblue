/**
 * Historico zootecnico multi-ano lido DIRETO do `zoot_mensal_cache`.
 *
 * POR QUE EXISTE. Para desenhar quatro barrinhas de anos antigos, o modal
 * montava quatro copias inteiras do painel (histArr2..histArr5). Medido no
 * navegador da NJ Pecuaria: cada uma paginava `financeiro_lancamentos_v2` ate
 * offset 4000 — a NJ tem ~4.000 lancamentos financeiros POR ANO, entao eram
 * cerca de dezesseis mil linhas por abertura de modal. E as barras de
 * 2021-2024 saiam VAZIAS mesmo assim: em toda a janela de captura nao houve
 * uma unica requisicao a `zoot_mensal_cache`, que e a fonte das arrobas.
 *
 * Aqui e UMA consulta paginada cobrindo a faixa inteira de anos, agrupada em
 * memoria. Modelo copiado de `useHistoricoIndicador.ts:126-156` — mesma
 * tabela, mesmo select, mesma paginacao.
 *
 * DIVERGENCIA CONHECIDA com o PC-100: esta leitura e do cache RAW, sem o
 * overlay de fechamento do `useRebanhoOficial`. No ano corrente reproduz o
 * painel (medido: 16.914,0 @ contra 16.912,7 na tela — arredondamento); em
 * 2025 da 2,3% de diferenca, que e o overlay. Mesma ressalva ja documentada
 * no topo do `useHistoricoIndicador`.
 *
 * As formulas NAO sao reimplementadas: `pesoMedioPonderadoFromRows` e
 * `computePeriodGmd` vem de `painelConsultorIndicadores`. Arrobas nao tem
 * funcao canonica — e `Σ producao_biologica / 30`, a mesma expressao inline
 * de `useHistoricoIndicador:900-905`.
 *
 * Divisao por zero devolve `null`, nunca zero: ausencia de dado nao e zero.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  pesoMedioPonderadoFromRows,
  computePeriodGmd,
} from '@/lib/calculos/painelConsultorIndicadores';

export interface AnoValorHist { ano: number; valor: number | null }
export interface HistoricoPorModoZoot {
  mes:     AnoValorHist[];
  periodo: AnoValorHist[];
}

interface LinhaCache {
  ano: number;
  mes: number;
  saldo_inicial?: number | null;
  saldo_final?: number | null;
  peso_total_final?: number | null;
  producao_biologica?: number | null;
  gmd?: number | null;
}

interface Params {
  enabled: boolean;
  clienteId?: string;
  /** Fazendas de pecuaria; em Global, todas as do cliente. */
  fazendaIds: string[];
  anoInicio: number;
  anoFim: number;
  /** 1-12 — define o ponto do "mes" e o recorte Jan→m do "periodo". */
  mesAtual: number;
}

interface Result {
  arrobas:   HistoricoPorModoZoot;
  gmd:       HistoricoPorModoZoot;
  pesoMedio: HistoricoPorModoZoot;
  loading:   boolean;
}

const VAZIO: HistoricoPorModoZoot = { mes: [], periodo: [] };
const PAGE = 1000;

export function useHistoricoZootCache({
  enabled, clienteId, fazendaIds, anoInicio, anoFim, mesAtual,
}: Params): Result {
  const [rows, setRows] = useState<LinhaCache[]>([]);
  const [loading, setLoading] = useState(false);

  const fazendasKey = fazendaIds.join(',');

  useEffect(() => {
    if (!enabled || !clienteId || fazendaIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const acc: LinhaCache[] = [];
        let from = 0;
        while (true) {
          /* `.order()` OBRIGATORIO: sem ele o PostgREST corta em 1000 linhas
             com ordem indeterminada, e os numeros mudam sem deploy. Armadilha
             registrada no handoff — ja mordeu neste mesmo bloco. */
          const { data, error } = await (supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('zoot_mensal_cache' as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select('ano, mes, saldo_inicial, saldo_final, peso_total_final, producao_biologica, gmd') as any)
            .eq('cenario', 'realizado')
            .gte('ano', anoInicio)
            .lte('ano', anoFim)
            .in('fazenda_id', fazendaIds)
            .order('ano').order('mes').order('fazenda_id').order('categoria_id')
            .range(from, from + PAGE - 1);
          if (cancelled) return;
          if (error) { setRows([]); return; }
          if (!data || data.length === 0) break;
          acc.push(...(data as LinhaCache[]));
          if (data.length < PAGE) break;
          from += PAGE;
        }
        if (!cancelled) setRows(acc);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, clienteId, fazendasKey, anoInicio, anoFim]);   // eslint-disable-line react-hooks/exhaustive-deps

  const anos: number[] = [];
  for (let a = anoInicio; a <= anoFim; a++) anos.push(a);

  const doAno = (a: number) => rows.filter(r => Number(r.ano) === a);
  const num = (v: unknown) => Number(v) || 0;

  const montar = (
    calc: (rowsAno: LinhaCache[], ano: number, modo: 'mes' | 'periodo') => number | null,
  ): HistoricoPorModoZoot => ({
    mes:     anos.map(a => ({ ano: a, valor: calc(doAno(a), a, 'mes') })),
    periodo: anos.map(a => ({ ano: a, valor: calc(doAno(a), a, 'periodo') })),
  });

  if (rows.length === 0) {
    return { arrobas: VAZIO, gmd: VAZIO, pesoMedio: VAZIO, loading };
  }

  /* Arrobas — Σ producao_biologica / 30. Sem funcao canonica: e a mesma
     expressao inline de `useHistoricoIndicador:900-905`. */
  const arrobas = montar((rowsAno, _a, modo) => {
    const alvo = modo === 'periodo'
      ? rowsAno.filter(r => Number(r.mes) <= mesAtual)
      : rowsAno.filter(r => Number(r.mes) === mesAtual);
    const pb = alvo.reduce((s, r) => s + num(r.producao_biologica), 0);
    return pb !== 0 ? pb / 30 : null;
  });

  /* Peso medio — `pesoMedioPonderadoFromRows` nas duas leituras, so muda o
     recorte de linhas. Ela ja devolve null quando Σ saldo_final e zero. */
  const pesoMedio = montar((rowsAno, _a, modo) => {
    const alvo = modo === 'periodo'
      ? rowsAno.filter(r => Number(r.mes) <= mesAtual)
      : rowsAno.filter(r => Number(r.mes) === mesAtual);
    return pesoMedioPonderadoFromRows(alvo);
  });

  /* GMD — as tres series de 12 e `computePeriodGmd` no periodo; no mes, a
     formula pontual prodKg[m] / cabMedia[m] / dias[m]. Espelha
     `useHistoricoIndicador:906-937`. */
  const gmd = montar((rowsAno, a, modo) => {
    const prodKg12 = Array.from({ length: 12 }, (_, i) =>
      rowsAno.filter(r => Number(r.mes) === i + 1)
             .reduce((s, r) => s + num(r.producao_biologica), 0));
    const cabMedia12 = Array.from({ length: 12 }, (_, i) => {
      const rs = rowsAno.filter(r => Number(r.mes) === i + 1);
      const ini = rs.reduce((s, r) => s + num(r.saldo_inicial), 0);
      const fin = rs.reduce((s, r) => s + num(r.saldo_final), 0);
      return (ini + fin) / 2;
    });
    const dias12 = Array.from({ length: 12 }, (_, i) => new Date(a, i + 1, 0).getDate());

    if (modo === 'periodo') {
      const v = computePeriodGmd(prodKg12, cabMedia12, dias12)[mesAtual - 1];
      return v != null && !isNaN(v) ? v : null;
    }
    const cm = cabMedia12[mesAtual - 1];
    const pb = prodKg12[mesAtual - 1];
    const d  = dias12[mesAtual - 1];
    return cm > 0 && d > 0 ? pb / cm / d : null;
  });

  return { arrobas, gmd, pesoMedio, loading };
}
