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
 * OVERLAY DE FECHAMENTO — resolvido no PR-34. Ate ali esta leitura era do
 * cache RAW e divergia do PC-100: medido na Agnaldo Cedenho, Global,
 * jul/2026, o tile dizia 245,0 @ e a barra de 2026 daqui dizia 273,3, na
 * MESMA tela. A NJ Pecuaria nao acusava por ESCALA (base 7x maior), nao por
 * estar certa — em 2025 ja dava 2,3%.
 * Agora este hook aplica `aplicarOverlayFechamento`, a MESMA funcao que o
 * `useRebanhoOficial` usa. Nao ha segunda implementacao da regra.
 * Cobertura medida em todos os clientes: nenhum ano com cache esta sem
 * fechamento, entao o overlay roda na serie inteira e ela fica coerente
 * consigo mesma — sem degrau entre anos antigos e recentes.
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
import {
  aplicarOverlayFechamento,
  type FechamentoConsolidado,
} from '@/lib/painelConsultor/rebanho/overlayFechamento';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

export interface AnoValorHist { ano: number; valor: number | null }
export interface HistoricoPorModoZoot {
  mes:     AnoValorHist[];
  periodo: AnoValorHist[];
}

/* A linha passa a ser a do cache INTEIRA: `aplicarOverlayFechamento` precisa
   de fazenda_id, categoria_id, os quatro pesos de movimentacao, dias_mes e o
   peso_total_inicial para refazer a producao. O select cresceu; a contagem de
   linhas, nao. */
type LinhaCache = ZootCategoriaMensal;

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
  const [fech, setFech] = useState<FechamentoConsolidado[]>([]);
  const [loading, setLoading] = useState(false);

  const fazendasKey = fazendaIds.join(',');

  useEffect(() => {
    if (!enabled || !clienteId || fazendaIds.length === 0) {
      setRows([]);
      setFech([]);
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
            .select('*') as any)
            .eq('cenario', 'realizado')
            .gte('ano', anoInicio)
            .lte('ano', anoFim)
            .in('fazenda_id', fazendaIds)
            .order('ano').order('mes').order('fazenda_id').order('categoria_id')
            .range(from, from + PAGE - 1);
          if (cancelled) return;
          if (error) { setRows([]); setFech([]); return; }
          if (!data || data.length === 0) break;
          acc.push(...(data as LinhaCache[]));
          if (data.length < PAGE) break;
          from += PAGE;
        }
        if (!cancelled) setRows(acc);

        /* Overlay MULTI-ANO. A query do `useRebanhoOficial` cobre um ano so
           (`${ano-1}-12` a `${ano}-12`); aqui a faixa inteira, porque a serie
           tem seis barras. Custo medido: 1.025 itens fechados na Agnaldo e
           2.029 na NJ para 2020-01..2026-07 — duas paginas. Nao e o problema
           de escala que motivou o PR-23, que eram dezesseis mil linhas de
           `financeiro_lancamentos_v2` por abertura de modal.
           A semeadura da cadeia exige comecar em dezembro do ano ANTERIOR ao
           primeiro: um fechamento de dez/N-1 morde jan/N. */
        const accF: FechamentoConsolidado[] = [];
        {
          const agg = new Map<string, { qtd: number; pesoTotal: number }>();
          let fromF = 0;
          while (true) {
            /* Mesma armadilha do PostgREST: sem ordem TOTAL o corte em mil
               linhas e indeterminado e os numeros mudam sem deploy. */
            const { data, error } = await (supabase
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .from('fechamento_pasto_itens' as any)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .select('id, categoria_id, quantidade, peso_medio_kg, fechamento_pastos!inner(ano_mes, status, fazenda_id)') as any)
              .eq('fechamento_pastos.status', 'fechado')
              .gte('fechamento_pastos.ano_mes', `${anoInicio - 1}-12`)
              .lte('fechamento_pastos.ano_mes', `${anoFim}-12`)
              .in('fechamento_pastos.fazenda_id', fazendaIds)
              .order('id')
              .range(fromF, fromF + PAGE - 1);
            if (cancelled) return;
            if (error) { setFech([]); break; }
            if (!data || data.length === 0) break;
            for (const item of data as Array<Record<string, unknown>>) {
              const fp = item.fechamento_pastos as Record<string, unknown> | Array<Record<string, unknown>>;
              const fpObj = Array.isArray(fp) ? fp[0] : fp;
              const anoMes = fpObj?.ano_mes as string | undefined;
              const fazId  = fpObj?.fazenda_id as string | undefined;
              if (!anoMes || !fazId) continue;
              const key = `${anoMes}|${fazId}|${String(item.categoria_id)}`;
              const cur = agg.get(key) || { qtd: 0, pesoTotal: 0 };
              cur.qtd += Number(item.quantidade) || 0;
              cur.pesoTotal += (Number(item.quantidade) || 0) * (Number(item.peso_medio_kg) || 0);
              agg.set(key, cur);
            }
            if (data.length < PAGE) break;
            fromF += PAGE;
          }
          for (const [key, val] of agg) {
            const [anoMes, fazId, categoriaId] = key.split('|');
            accF.push({
              ano_mes: anoMes, fazenda_id: fazId, categoria_id: categoriaId,
              qtd: val.qtd, peso_total: val.pesoTotal,
              peso_medio: val.qtd > 0 ? val.pesoTotal / val.qtd : null,
            });
          }
        }
        if (!cancelled) setFech(accF);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, clienteId, fazendasKey, anoInicio, anoFim]);   // eslint-disable-line react-hooks/exhaustive-deps

  const anos: number[] = [];
  for (let a = anoInicio; a <= anoFim; a++) anos.push(a);

  /* AQUI a serie deixa de ser cache cru. Mesma funcao que o
     `useRebanhoOficial` chama — o historico CONSOME a regra em vez de
     recalcular. Um `aplicarOverlayFechamento` por ano, porque a semeadura da
     cadeia e por ano (`${a - 1}-12`); aplicar na faixa inteira de uma vez
     misturaria as cadeias.
     Calculado uma vez por render e nao a cada chamada de `doAno`: sao tres
     indicadores x dois modos x N anos de leituras sobre o mesmo ano. */
  const overlayMap = new Map<string, FechamentoConsolidado>();
  const mesesFechados = new Set<string>();
  for (const fc of fech) {
    overlayMap.set(`${fc.ano_mes}|${fc.fazenda_id}|${fc.categoria_id}`, fc);
    mesesFechados.add(`${fc.ano_mes}|${fc.fazenda_id}`);
  }
  const porAno = new Map<number, LinhaCache[]>();
  for (const a of anos) {
    porAno.set(a, aplicarOverlayFechamento(
      rows.filter(r => Number(r.ano) === a), overlayMap, mesesFechados, a, 'realizado',
    ));
  }

  const doAno = (a: number) => porAno.get(a) ?? [];
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
