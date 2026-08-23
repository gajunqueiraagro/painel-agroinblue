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
 * QUATRO indicadores, nao mais. `uaHa` e `kgHa` exigem area por fazenda —
 * segunda fonte — e os sete financeiros dependem da
 * `vw_financeiro_dashboard_mensal`, hoje VAZIA. Nesses nove a aba nao existe:
 * aba vazia e proibida.
 *
 * ⚠ COMPRIMENTO 12, indexado 0=Jan. O `useHistoricoZootCache` e as series do
 * PC-100 usam 13, com a posicao 0 reservada para "Dez do ano anterior". Aqui
 * NAO ha posicao reservada — quem cruzar as duas convencoes erra por um.
 *
 * As formulas vem de `painelConsultorIndicadores`; as que nao tem funcao
 * canonica (soma de saldo_final, soma de producao_biologica / 30) reproduzem a
 * expressao de `useHistoricoIndicador`, citada em cada ponto.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  cabecasMediaPeriodoFromRows,
  pesoMedioPonderadoFromRows,
  computePeriodGmd,
} from '@/lib/calculos/painelConsultorIndicadores';

export interface SerieFazenda {
  fazendaId: string;
  /** Rotulo da linha no grafico. */
  nome: string;
  /** 12 posicoes, 0=Jan. `null` = sem dado ou mes futuro. */
  mes:     Array<number | null>;
  periodo: Array<number | null>;
}

interface LinhaCache {
  fazenda_id: string;
  /* `ano` e constante nesta query (`.eq('ano', ano)`), mas entra no select
     porque `CacheRowZoot` — o tipo que as funcoes canonicas recebem — o
     declara obrigatorio. Sem ele so passaria com cast, e cast aqui seria
     mascarar incompatibilidade de contrato. */
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
  /** UM ano — o corrente. */
  ano: number;
  /** 1-12. Meses posteriores devolvem `null`: nao ha realizado futuro. */
  mesAtual: number;
}

interface Result {
  cabecas:   SerieFazenda[];
  pesoMedio: SerieFazenda[];
  arrobas:   SerieFazenda[];
  gmd:       SerieFazenda[];
  loading:   boolean;
}

const PAGE = 1000;
const MESES = 12;

export function useSeriePorFazenda({
  enabled, clienteId, fazendaIds, ano, mesAtual,
}: Params): Result {
  const { fazendas } = useFazenda();
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
          /* Ordem TOTAL obrigatoria: a tabela nao tem PRIMARY KEY e sem ela a
             paginacao repete ou pula linhas — armadilha ja registrada. */
          const { data, error } = await (supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('zoot_mensal_cache' as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select('fazenda_id, ano, mes, saldo_inicial, saldo_final, peso_total_final, producao_biologica, gmd') as any)
            .eq('cenario', 'realizado')
            .eq('ano', ano)
            .in('fazenda_id', fazendaIds)
            .order('fazenda_id').order('mes').order('categoria_id')
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
  }, [enabled, clienteId, fazendasKey, ano]);   // eslint-disable-line react-hooks/exhaustive-deps

  const vazio: Result = { cabecas: [], pesoMedio: [], arrobas: [], gmd: [], loading };
  if (rows.length === 0) return vazio;

  const nomeDe = (id: string) => fazendas.find(f => f.id === id)?.nome ?? id;
  const num = (v: unknown) => Number(v) || 0;

  /* As fazendas que o cache DE FATO tem — nao as pedidas. Fazenda sem linha
     nenhuma nao vira serie de nulos: some da lista, e o grafico nao desenha
     uma reta vazia com legenda. */
  const idsComDado = Array.from(new Set(rows.map(r => String(r.fazenda_id))));

  const montar = (
    calc: (linhasFaz: LinhaCache[], mes: number, todas12: LinhaCache[]) => number | null,
  ): SerieFazenda[] => idsComDado.map(id => {
    const linhasFaz = rows.filter(r => String(r.fazenda_id) === id);
    const serie = (recorte: 'mes' | 'periodo') =>
      Array.from({ length: MESES }, (_, i) => {
        const m = i + 1;
        if (m > mesAtual) return null;          // sem realizado futuro
        const alvo = recorte === 'periodo'
          ? linhasFaz.filter(r => Number(r.mes) <= m)
          : linhasFaz.filter(r => Number(r.mes) === m);
        return calc(alvo, m, linhasFaz);
      });
    return { fazendaId: id, nome: nomeDe(id), mes: serie('mes'), periodo: serie('periodo') };
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
    const linhasFaz = rows.filter(r => String(r.fazenda_id) === id);
    const { prodKg12, cabMedia12, dias12 } = seriesDoAno(linhasFaz);
    const per12 = computePeriodGmd(prodKg12, cabMedia12, dias12);
    const corta = (v: number | null | undefined, m: number) =>
      m > mesAtual || v == null || isNaN(v) ? null : v;
    return {
      fazendaId: id,
      nome: nomeDe(id),
      mes: Array.from({ length: MESES }, (_, i) => {
        const cm = cabMedia12[i], pb = prodKg12[i], d = dias12[i];
        return corta(cm > 0 && d > 0 ? pb / cm / d : null, i + 1);
      }),
      periodo: Array.from({ length: MESES }, (_, i) => corta(per12[i], i + 1)),
    };
  });

  return { cabecas, pesoMedio, arrobas, gmd, loading };
}
