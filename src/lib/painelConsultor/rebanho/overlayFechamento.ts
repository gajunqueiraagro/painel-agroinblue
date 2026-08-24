/**
 * Overlay de fechamento — a regra que transforma cache em numero oficial.
 *
 * POR QUE EXISTE COMO LIB. Ate o PR-34 este corpo vivia dentro do
 * `rawCategorias` de `useRebanhoOficial`, um useMemo de UM ano. Quem
 * precisasse do mesmo numero para outro ano nao tinha como pedir, e lia o
 * `zoot_mensal_cache` cru — foi o que o `useHistoricoZootCache` (PR-23) e o
 * `useSeriePorFazenda` (PR-25) fizeram. Resultado medido na Agnaldo Cedenho,
 * Global, jul/2026: o tile dizia 245,0 @ e a barra do historico dizia 273,3,
 * na MESMA tela.
 *
 * Extrair nao criou segunda implementacao — expos a unica que havia.
 *
 * NAO E FILTRO NEM DEDUCAO: e SUBSTITUICAO DE FONTE. Para mes fechado,
 * `saldo_final` e `peso_total_final` vem de `fechamento_pasto_itens`, e a
 * producao biologica e RECALCULADA a partir deles.
 *
 * Tres detalhes que o comportamento depende e que sao faceis de perder ao
 * reescrever — foi por isso que o corpo foi movido byte a byte:
 *
 *  1. O `?? 0` e LITERAL. Categoria que existe no cache e nao no fechamento
 *     e ZERADA, nao ignorada. E categoria que existe no fechamento e nao no
 *     cache NUNCA entra: o laco percorre linhas do cache.
 *  2. A cadeia e semeada em `${ano - 1}-12`. Um fechamento de dez/25 morde
 *     jan/26.
 *  3. Mes ABERTO tambem e corrigido, quando ha fechamento anterior — e so o
 *     primeiro: depois `prevPesoTotalFinalOficial = null` e a cadeia para.
 *
 * Medido na Agnaldo, jul/2026: a divergencia inteira eram DUAS categorias
 * numa fazenda — `mamotes_f` 32,0 -> 0,0 @ e `novilhas` 0,0 -> 3,7 @. As
 * outras doze batiam. A NJ Pecuaria nao divergia por ESCALA (base 7x maior),
 * nao por estar certa.
 */
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

/** Consolidado de `fechamento_pasto_itens` por fazenda + ano_mes + categoria. */
export interface FechamentoConsolidado {
  ano_mes: string;
  fazenda_id: string;
  categoria_id: string;
  qtd: number;
  peso_total: number;
  peso_medio: number | null;
}

export function roundNumber(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @param entrada       linhas do cache (ja normalizadas, se cenario meta)
 * @param overlayMap    `${ano_mes}|${fazenda_id}|${categoria_id}` -> consolidado
 * @param mesesFechados `${ano_mes}|${fazenda_id}` dos meses com fechamento
 * @param ano           ano da serie — define a semeadura em `${ano - 1}-12`
 * @param cenario       so 'realizado' recebe overlay
 */
export function aplicarOverlayFechamento(
  entrada: ZootCategoriaMensal[],
  overlayMap: Map<string, FechamentoConsolidado>,
  mesesFechados: Set<string>,
  ano: number,
  cenario: string,
): ZootCategoriaMensal[] {
  let rows = entrada;

    // ── REGRA ABSOLUTA: mês fechado = fonte exclusiva do fechamento de pastos ──
    // Substitui saldo_final, peso_total_final, peso_medio_final, producao_biologica, gmd
    // Categoria ausente no fechamento → zerada (saldo=0, peso=0)
    // ENCADEAMENTO: peso_total_final oficial do mês N → peso_total_inicial do mês N+1
    if (cenario === 'realizado' && mesesFechados.size > 0) {
      // Agrupar por categoria para processamento sequencial
      const byCat = new Map<string, { indices: number[]; rows: ZootCategoriaMensal[] }>();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const key = `${row.fazenda_id}|${row.categoria_id}`;
        if (!byCat.has(key)) byCat.set(key, { indices: [], rows: [] });
        const entry = byCat.get(key)!;
        entry.indices.push(i);
        entry.rows.push(row);
      }

      const result = [...rows];

      for (const [catKey, { indices, rows: catRows }] of byCat.entries()) {
        // Ordenar por mês para garantir sequência
        const sorted = catRows.map((r, idx) => ({ row: r, origIdx: indices[idx] }))
          .sort((a, b) => {
            if (a.row.ano !== b.row.ano) return a.row.ano - b.row.ano;
            return a.row.mes - b.row.mes;
          });

        // Seed: peso oficial de dez do ano anterior para esta categoria+fazenda
        const [seedFazId, seedCatId] = catKey.split('|');
        const seedKey = `${ano - 1}-12|${seedFazId}|${seedCatId}`;
        const seedFc = overlayMap.get(seedKey);
        let prevPesoTotalFinalOficial: number | null =
          seedFc ? (seedFc.peso_total ?? null) : null;

        for (const { row, origIdx } of sorted) {
          const anoMes = `${row.ano}-${String(row.mes).padStart(2, '0')}`;
          const isMesFechado = mesesFechados.has(`${anoMes}|${row.fazenda_id}`);

          // Propagar peso_total_final oficial do mês anterior como peso_total_inicial
          let pesoTotalInicialCorrigido = row.peso_total_inicial;
          if (prevPesoTotalFinalOficial !== null) {
            pesoTotalInicialCorrigido = prevPesoTotalFinalOficial;
          }

          if (!isMesFechado) {
            // Mês aberto: apenas propagar peso_total_inicial se houve fechamento anterior
            if (prevPesoTotalFinalOficial !== null) {
              const producaoBioCorrigida = roundNumber(
                row.peso_total_final
                - pesoTotalInicialCorrigido
                - row.peso_entradas_externas
                + row.peso_saidas_externas
                - row.peso_evol_cat_entrada
                + row.peso_evol_cat_saida,
                2,
              );
              const cabMedias = (row.saldo_inicial + row.saldo_final) / 2;
              const gmdCorrigido = cabMedias > 0 && row.dias_mes > 0
                ? roundNumber(producaoBioCorrigida / cabMedias / row.dias_mes, 4)
                : null;

              result[origIdx] = {
                ...row,
                peso_total_inicial: pesoTotalInicialCorrigido,
                peso_medio_inicial: row.saldo_inicial > 0
                  ? roundNumber(pesoTotalInicialCorrigido / row.saldo_inicial, 2)
                  : null,
                producao_biologica: producaoBioCorrigida,
                gmd: gmdCorrigido,
              };
            }
            // Para meses abertos, não atualizar prevPesoTotalFinalOficial
            // (a cadeia oficial para ao encontrar mês aberto)
            prevPesoTotalFinalOficial = null;
            continue;
          }

          // Mês fechado: buscar dados oficiais do fechamento
          const fc = overlayMap.get(`${anoMes}|${row.fazenda_id}|${row.categoria_id}`);

          // Categoria ausente no fechamento → zero oficial
          const saldoFinalOficial = fc?.qtd ?? 0;
          const pesoTotalFinalOficial = fc?.peso_total ?? 0;
          const pesoMedioFinalOficial = saldoFinalOficial > 0
            ? roundNumber(pesoTotalFinalOficial / saldoFinalOficial, 2)
            : null;

          // Recalcular produção biológica com peso oficial + peso inicial corrigido
          const producaoBiologicaOficial = roundNumber(
            pesoTotalFinalOficial
            - pesoTotalInicialCorrigido
            - row.peso_entradas_externas
            + row.peso_saidas_externas
            - row.peso_evol_cat_entrada
            + row.peso_evol_cat_saida,
            2,
          );

          // GMD oficial recalculado
          const cabecasMedias = (row.saldo_inicial + saldoFinalOficial) / 2;
          const gmdOficial = cabecasMedias > 0 && row.dias_mes > 0
            ? roundNumber(producaoBiologicaOficial / cabecasMedias / row.dias_mes, 4)
            : null;

          result[origIdx] = {
            ...row,
            saldo_final: saldoFinalOficial,
            peso_total_inicial: pesoTotalInicialCorrigido,
            peso_medio_inicial: row.saldo_inicial > 0
              ? roundNumber(pesoTotalInicialCorrigido / row.saldo_inicial, 2)
              : null,
            peso_total_final: pesoTotalFinalOficial,
            peso_medio_final: pesoMedioFinalOficial,
            producao_biologica: producaoBiologicaOficial,
            gmd: gmdOficial,
            fonte_oficial_mes: 'fechamento' as const,
          };

          // Propagar para o mês seguinte
          prevPesoTotalFinalOficial = pesoTotalFinalOficial;
        }
      }

      rows = result;
    }
    return rows;
}
