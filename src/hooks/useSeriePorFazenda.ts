/**
 * Serie mensal POR FAZENDA, lida direto do `zoot_mensal_cache`.
 *
 * PARA QUE. A aba "Por Fazenda" do modal mostra, por indicador, uma linha por
 * fazenda ao longo dos doze meses. Sem meta e sem ano anterior, por decisao de
 * Gabriel: a aba Global responde "como estou contra o planejado"; esta responde
 * "quem esta puxando". Para ver a meta de uma fazenda, usa-se o seletor do
 * cabecalho do app.
 *
 * O dado ja existe — `zoot_mensal_cache` tem `fazenda_id`. E a MESMA consulta
 * do `useHistoricoZootCache`, com outro recorte (um ano) e outro agrupamento
 * (por fazenda, nao por ano). Mesma paginacao, mesma ordem total, mesmo idioma
 * de cast.
 *
 * SETE indicadores desde o PR-SERIE-FAZENDA-01. Os quatro do cache
 * (cabecas, pesoMedio, arrobas, gmd) mais `arrobasEstoque`, que sai do mesmo
 * `peso_total_final` que o pesoMedio ja lia, e mais `areaProdutivaPec` e
 * `arrobasHa`, que dependem da area por fazenda — ela chega por PARAMETRO,
 * ja carregada pelo PC-100, sem query nova.
 *
 * `uaHa` e `kgHa` NAO entraram, e o motivo nao e' a area: e' a regra do
 * PERIODO. Os dois sao razao de ESTOQUE, e o Global os calcula com
 * `rollingAvg` da razao mensal (usePainelConsultorData:2205 e :2265) —
 * media de razoes. `arrobasHa` e' fluxo e usa razao de agregados
 * (`calcularArrHaAcumulado`). Media de razoes nao comuta com agregacao,
 * entao a soma ponderada das fazendas NAO reproduz o Global no periodo.
 * Medido na NJ ate jul/2026: 440,76 (regra de hoje) contra 440,30
 * (media do estoque / media da area) — 0,10%. Pequeno e sistematico.
 * Decidir a regra do periodo para razao de estoque vem antes de expor a
 * serie; ver o relatorio do PR-SERIE-FAZENDA-01.
 *
 * Os sete financeiros seguem dependendo da `vw_financeiro_dashboard_mensal`,
 * hoje VAZIA. Nesses a aba nao existe: aba vazia e proibida.
 *
 * ⚠ COMPRIMENTO 12, indexado 0=Jan. O `useHistoricoZootCache` e as series do
 * PC-100 usam 13, com a posicao 0 reservada para "Dez do ano anterior". Aqui
 * NAO ha posicao reservada — quem cruzar as duas convencoes erra por um.
 *
 * As formulas vem de `painelConsultorIndicadores`; as que nao tem funcao
 * canonica (soma de saldo_final, soma de producao_biologica / 30) reproduzem a
 * expressao de `useHistoricoIndicador`, citada em cada ponto.
 *
 * OVERLAY DE FECHAMENTO — desde o PR-34. Este hook nasceu (PR-25) lendo o
 * cache RAW e por isso divergia do tile pelo mesmo motivo que o historico:
 * medido na Agnaldo Cedenho, jul/2026, a Sta. Tereza dava 85,1 @ aqui contra
 * 56,8 oficiais, e a soma das fazendas dava 273,3 contra 245,0 do tile.
 * Aplica `aplicarOverlayFechamento`, a MESMA funcao do `useRebanhoOficial` e
 * do `useHistoricoZootCache` — a regra tem uma implementacao so no repo.
 * A conferencia do PR-25 (soma das fazendas = Global) continua valendo: com o
 * overlay, 188,2 + 56,8 = 245,0, que e exatamente o tile.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  cabecasMediaPeriodoFromRows,
  pesoMedioPonderadoFromRows,
  computePeriodGmd,
} from '@/lib/calculos/painelConsultorIndicadores';
import {
  aplicarOverlayFechamento,
  type FechamentoConsolidado,
} from '@/lib/painelConsultor/rebanho/overlayFechamento';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { SnapshotAreaFazendaMes } from '@/hooks/useFechamentoArea';
import { calcularArrHaMensal, calcularArrHaAcumulado } from '@/lib/calculos/eficienciaArea';

export interface SerieFazenda {
  fazendaId: string;
  /** Rotulo da linha no grafico. */
  nome: string;
  /** Sigla do CADASTRO (`fazendas.codigo`), para tooltip e tabela, onde o
   *  nome inteiro nao cabe. NUNCA derivar abreviacao do nome: as dez
   *  fazendas de pecuaria tem a coluna preenchida (3M, BG, PUR, LUZ, EXP,
   *  SM, ST, MTR, UM, SR). Cai para o nome quando vier nulo — nunca vazio,
   *  que produziria linha sem rotulo no grafico. */
  codigo: string;
  /** 12 posicoes, 0=Jan. `null` = sem dado ou mes futuro. */
  mes:     Array<number | null>;
  periodo: Array<number | null>;
}

/* A linha e a do cache INTEIRA: `aplicarOverlayFechamento` precisa de
   categoria_id, dos quatro pesos de movimentacao, de dias_mes e do
   peso_total_inicial para refazer a producao. O select cresceu; a contagem de
   linhas, nao. `ano` ja era obrigatorio aqui por causa de `CacheRowZoot`. */
type LinhaCache = ZootCategoriaMensal;

interface Params {
  enabled: boolean;
  clienteId?: string;
  /** Fazendas de pecuaria; em Global, todas as do cliente. */
  fazendaIds: string[];
  /** UM ano — o corrente. */
  ano: number;
  /** 1-12. Meses posteriores devolvem `null`: nao ha realizado futuro. */
  mesAtual: number;
  /* Area por (fazenda, mes), ja carregada pelo PC-100 e passada por prop.
     NENHUMA query nova: `snapshotsFazenda` sai de `useSnapshotAreaAnual`,
     que o `usePainelConsultorData` ja chama, e o V2Home ja desestrutura.
     Chega por parametro em vez de a divisao morar no V2Home porque o
     `ModalAtividade` declara no cabecalho que recebe tudo PRONTO — calculo
     na pagina quebraria esse contrato. */
  areaPorFazendaMes?: SnapshotAreaFazendaMes[];
}

interface Result {
  cabecas:   SerieFazenda[];
  pesoMedio: SerieFazenda[];
  arrobas:   SerieFazenda[];
  gmd:       SerieFazenda[];
  /** @ em estoque — Σ peso_total_final / 30. ESTOQUE: mes = periodo. */
  arrobasEstoque: SerieFazenda[];
  /** Hectares de pecuaria da fazenda. Periodo = MEDIA, como o card Global. */
  areaProdutivaPec: SerieFazenda[];
  /** @ produzidas / area. Periodo = `calcularArrHaAcumulado`. */
  arrobasHa: SerieFazenda[];
  loading:   boolean;
}

const PAGE = 1000;
const MESES = 12;

export function useSeriePorFazenda({
  enabled, clienteId, fazendaIds, ano, mesAtual, areaPorFazendaMes,
}: Params): Result {
  const { fazendas } = useFazenda();
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
          /* Ordem TOTAL obrigatoria: a tabela nao tem PRIMARY KEY e sem ela a
             paginacao repete ou pula linhas — armadilha ja registrada. */
          const { data, error } = await (supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('zoot_mensal_cache' as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select('*') as any)
            .eq('cenario', 'realizado')
            .eq('ano', ano)
            .in('fazenda_id', fazendaIds)
            .order('fazenda_id').order('mes').order('categoria_id')
            .range(from, from + PAGE - 1);
          if (cancelled) return;
          if (error) { setRows([]); setFech([]); return; }
          if (!data || data.length === 0) break;
          acc.push(...(data as LinhaCache[]));
          if (data.length < PAGE) break;
          from += PAGE;
        }
        if (!cancelled) setRows(acc);

        /* Fechamento de dez do ano ANTERIOR ate dez deste: a cadeia do overlay
           e semeada em `${ano - 1}-12`, entao comecar em janeiro perderia a
           correcao do primeiro mes. Mesma faixa do `useRebanhoOficial`. */
        const agg = new Map<string, { qtd: number; pesoTotal: number }>();
        let fromF = 0;
        while (true) {
          const { data, error } = await (supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('fechamento_pasto_itens' as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select('id, categoria_id, quantidade, peso_medio_kg, fechamento_pastos!inner(ano_mes, status, fazenda_id)') as any)
            .eq('fechamento_pastos.status', 'fechado')
            .gte('fechamento_pastos.ano_mes', `${ano - 1}-12`)
            .lte('fechamento_pastos.ano_mes', `${ano}-12`)
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
        const accF: FechamentoConsolidado[] = [];
        for (const [key, val] of agg) {
          const [anoMes, fazId, categoriaId] = key.split('|');
          accF.push({
            ano_mes: anoMes, fazenda_id: fazId, categoria_id: categoriaId,
            qtd: val.qtd, peso_total: val.pesoTotal,
            peso_medio: val.qtd > 0 ? val.pesoTotal / val.qtd : null,
          });
        }
        if (!cancelled) setFech(accF);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, clienteId, fazendasKey, ano]);   // eslint-disable-line react-hooks/exhaustive-deps

  const vazio: Result = {
    cabecas: [], pesoMedio: [], arrobas: [], gmd: [],
    arrobasEstoque: [], areaProdutivaPec: [], arrobasHa: [],
    loading,
  };
  if (rows.length === 0) return vazio;

  /* AQUI a serie deixa de ser cache cru. UMA chamada basta: a query e de um
     ano so (`.eq('ano', ano)`), entao nao ha cadeias de anos diferentes para
     separar — ao contrario do `useHistoricoZootCache`, que aplica por ano. */
  const overlayMap = new Map<string, FechamentoConsolidado>();
  const mesesFechados = new Set<string>();
  for (const fc of fech) {
    overlayMap.set(`${fc.ano_mes}|${fc.fazenda_id}|${fc.categoria_id}`, fc);
    mesesFechados.add(`${fc.ano_mes}|${fc.fazenda_id}`);
  }
  const linhas = aplicarOverlayFechamento(rows, overlayMap, mesesFechados, ano, 'realizado');

  const nomeDe = (id: string) => fazendas.find(f => f.id === id)?.nome ?? id;
  /* Mesmo caminho do nome: o contexto ja traz `codigo` no select
     (FazendaContext.tsx:101). Nenhuma query nova. */
  const codigoDe = (id: string) =>
    fazendas.find(f => f.id === id)?.codigo?.trim() || nomeDe(id);
  const num = (v: unknown) => Number(v) || 0;

  /* As fazendas que o cache DE FATO tem — nao as pedidas. Fazenda sem linha
     nenhuma nao vira serie de nulos: some da lista, e o grafico nao desenha
     uma reta vazia com legenda. */
  const idsComDado = Array.from(new Set(linhas.map(r => String(r.fazenda_id))));

  const montar = (
    calc: (linhasFaz: LinhaCache[], mes: number, todas12: LinhaCache[]) => number | null,
  ): SerieFazenda[] => idsComDado.map(id => {
    const linhasFaz = linhas.filter(r => String(r.fazenda_id) === id);
    const serie = (recorte: 'mes' | 'periodo') =>
      Array.from({ length: MESES }, (_, i) => {
        const m = i + 1;
        if (m > mesAtual) return null;          // sem realizado futuro
        const alvo = recorte === 'periodo'
          ? linhasFaz.filter(r => Number(r.mes) <= m)
          : linhasFaz.filter(r => Number(r.mes) === m);
        return calc(alvo, m, linhasFaz);
      });
    return { fazendaId: id, nome: nomeDe(id), codigo: codigoDe(id),
             mes: serie('mes'), periodo: serie('periodo') };
  });

  /* Cabecas — mes: Σ saldo_final; periodo: media acumulada das medias mensais.
     Espelha `useHistoricoIndicador:880-888`. */
  const cabecasMes = montar(alvo => {
    const s = alvo.reduce((acc, r) => acc + num(r.saldo_final), 0);
    return s > 0 ? s : null;
  });
  const cabecasPer = montar((alvo, m) => cabecasMediaPeriodoFromRows(alvo, m));
  const cabecas = cabecasMes.map((f, i) => ({ ...f, periodo: cabecasPer[i].periodo }));

  /* Peso medio — `pesoMedioPonderadoFromRows` nas duas leituras; so muda o
     recorte de linhas. Ela ja devolve null quando Σ saldo_final e zero. */
  const pesoMedio = montar(alvo => pesoMedioPonderadoFromRows(alvo));

  /* Arrobas — Σ producao_biologica / 30. Sem funcao canonica: mesma expressao
     de `useHistoricoIndicador:900-905`, com `!== 0` no lugar de `> 0` porque
     producao biologica pode ser NEGATIVA (jul/2021 na NJ = -2.877,2 @) e a
     guarda do legado apagaria o mes. */
  const arrobas = montar(alvo => {
    const pb = alvo.reduce((acc, r) => acc + num(r.producao_biologica), 0);
    return pb !== 0 ? pb / 30 : null;
  });

  /* GMD — `computePeriodGmd` no periodo; no mes, a formula pontual
     prodKg[m] / cabMedia[m] / dias[m], ponderada por cabecas.
     Espelha `useHistoricoIndicador:906-937`. */
  const seriesDoAno = (linhasFaz: LinhaCache[]) => {
    const prodKg12 = Array.from({ length: MESES }, (_, i) =>
      linhasFaz.filter(r => Number(r.mes) === i + 1)
               .reduce((s, r) => s + num(r.producao_biologica), 0));
    const cabMedia12 = Array.from({ length: MESES }, (_, i) => {
      const rs = linhasFaz.filter(r => Number(r.mes) === i + 1);
      const ini = rs.reduce((s, r) => s + num(r.saldo_inicial), 0);
      const fin = rs.reduce((s, r) => s + num(r.saldo_final), 0);
      return (ini + fin) / 2;
    });
    const dias12 = Array.from({ length: MESES }, (_, i) => new Date(ano, i + 1, 0).getDate());
    return { prodKg12, cabMedia12, dias12 };
  };
  const gmd: SerieFazenda[] = idsComDado.map(id => {
    const linhasFaz = linhas.filter(r => String(r.fazenda_id) === id);
    const { prodKg12, cabMedia12, dias12 } = seriesDoAno(linhasFaz);
    const per12 = computePeriodGmd(prodKg12, cabMedia12, dias12);
    const corta = (v: number | null | undefined, m: number) =>
      m > mesAtual || v == null || isNaN(v) ? null : v;
    return {
      fazendaId: id,
      nome: nomeDe(id),
      codigo: codigoDe(id),
      mes: Array.from({ length: MESES }, (_, i) => {
        const cm = cabMedia12[i], pb = prodKg12[i], d = dias12[i];
        return corta(cm > 0 && d > 0 ? pb / cm / d : null, i + 1);
      }),
      periodo: Array.from({ length: MESES }, (_, i) => corta(per12[i], i + 1)),
    };
  });

  /* ── PR-SERIE-FAZENDA-01 ──────────────────────────────────────────────
     @ EM ESTOQUE. Σ peso_total_final / 30, o par patrimonial do "@
     produzidas". E' ESTOQUE: `mes` e `periodo` recebem a MESMA serie,
     porque estoque nao acumula. Por isso o calculo ignora `alvo` — que
     no periodo ja chega cumulativo e somaria estoques de meses
     diferentes — e usa `todas12`, recortando o proprio mes. */
  const arrobasEstoque = montar((_alvo, m, todas12) => {
    const pt = todas12.filter(r => Number(r.mes) === m)
                      .reduce((acc, r) => acc + num(r.peso_total_final), 0);
    return pt !== 0 ? pt / 30 : null;
  });

  /* ── AREA POR FAZENDA ─────────────────────────────────────────────────
     Vem por prop, ja carregada. A coluna e' `area_pecuaria_ha`, a MESMA
     que o card Global usa e que divide o @/ha — e ela ja chega com a
     pecuaria RECALCULADA de `fechamento_pastos` (useFechamentoArea:343),
     nao com a coluna crua do snapshot. */
  const areaDe = (id: string): (number | null)[] =>
    Array.from({ length: MESES }, (_, i) => {
      const s = (areaPorFazendaMes ?? []).find(
        x => x.fazenda_id === id && x.mes === i + 1);
      return s ? s.area_pecuaria_ha : null;
    });

  /* ⚠ QUARTA ocorrencia desta media no repo — `calcularArrHaAcumulado`
     (eficienciaArea), `mediaAreaAcumulada12` (usePainelConsultorData) e
     `mediaIgnorandoNulos` (PainelConsultorTab) sao as outras tres, alinhadas
     em 24/08. A regra e' a mesma: mes sem area — nulo, NaN ou ZERO — nao
     entra no divisor, porque area zero e' mes sem fechamento, nao area
     pequena. Extrair as quatro para `eficienciaArea` e' frente propria:
     este PR tem gate de arquivos e nao alcanca aquele modulo. */
  const mediaAreaAcum12 = (serie: (number | null)[]): number[] => {
    const out: number[] = [];
    let soma = 0;
    let n = 0;
    for (let i = 0; i < MESES; i++) {
      const v = serie[i];
      if (v != null && Number.isFinite(v) && v > 0) { soma += v; n += 1; }
      out.push(n > 0 ? soma / n : NaN);
    }
    return out;
  };

  /* Corta mes futuro e NaN — a mesma guarda do `gmd`. */
  const corta = (v: number | null | undefined, m: number) =>
    m > mesAtual || v == null || isNaN(v) ? null : v;

  /* Producao mensal em @, por fazenda: o numerador do @/ha. Sai das mesmas
     linhas que a serie `arrobas` acima ja usa. */
  const arrobasProd12De = (id: string): number[] =>
    Array.from({ length: MESES }, (_, i) =>
      linhas.filter(r => String(r.fazenda_id) === id && Number(r.mes) === i + 1)
            .reduce((acc, r) => acc + num(r.producao_biologica), 0) / 30);

  const areaProdutivaPec: SerieFazenda[] = idsComDado.map(id => {
    const a12 = areaDe(id);
    const med = mediaAreaAcum12(a12);
    return {
      fazendaId: id, nome: nomeDe(id), codigo: codigoDe(id),
      mes:     Array.from({ length: MESES }, (_, i) => corta(a12[i], i + 1)),
      periodo: Array.from({ length: MESES }, (_, i) => corta(med[i], i + 1)),
    };
  });

  /* @/ha — `eficienciaArea` nos dois recortes. Nenhuma divisao escrita aqui:
     ela e' a fonte unica declarada, e o periodo E' RAZAO DE AGREGADOS
     (Σ arrobas ÷ MEDIA da area), nunca media das razoes mensais. Media das
     razoes faria a soma ponderada das fazendas deixar de bater com o
     Global, e o erro seria silencioso. */
  const arrobasHa: SerieFazenda[] = idsComDado.map(id => {
    const a12   = areaDe(id);
    const prod  = arrobasProd12De(id);
    const mes12 = calcularArrHaMensal(prod, a12);
    const per12 = calcularArrHaAcumulado(prod, a12);
    return {
      fazendaId: id, nome: nomeDe(id), codigo: codigoDe(id),
      mes:     Array.from({ length: MESES }, (_, i) => corta(mes12[i], i + 1)),
      periodo: Array.from({ length: MESES }, (_, i) => corta(per12[i], i + 1)),
    };
  });

  return { cabecas, pesoMedio, arrobas, gmd,
           arrobasEstoque, areaProdutivaPec, arrobasHa, loading };
}
