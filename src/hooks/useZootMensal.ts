/**
 * ZootMensal — a LINHA DO MÊS do rebanho (totais de uma fazenda ou do Global).
 *
 * REBANHO-LEITURA-01 D1 (Gabriel 01/11/2026): o hook que lia a view `vw_zoot_fazenda_mensal` SAIU. Numa fazenda a view estourava o
 * tempo do papel `authenticated` (8,1 s, 57014) para todo cliente e todo número da linha do mês saía "—". A linha agora é MONTADA das
 * categorias do `zoot_mensal_cache` em `useRebanhoOficial` (`buildFazendaRowsFromCategories`), a mesma regra do Global. Aqui ficam o
 * tipo e o `indexByMes`, que os consumidores importam por `useRebanhoOficial`.
 */

export interface ZootMensal {
  fazenda_id: string;
  cliente_id: string;
  ano: number;
  mes: number;
  cenario: 'realizado' | 'meta';
  mes_key: string;       // '01'..'12'
  ano_mes: string;        // '2025-03'
  cabecas_inicio: number;
  cabecas_final: number;
  peso_inicio_kg: number;
  peso_total_final_kg: number;
  peso_medio_final_kg: number | null;
  peso_entradas_kg: number;
  peso_saidas_kg: number;
  entradas: number;
  saidas: number;
  dias_mes: number;
  gmd_kg_cab_dia: number | null;
  gmd_numerador_kg: number | null;
  ua_media: number | null;
  area_produtiva_ha: number;
  lotacao_ua_ha: number | null;
  fonte_oficial_mes: 'fechamento' | 'fallback_movimentacao' | 'projecao' | 'parcial';
}

/**
 * Helper: converte array de ZootMensal em Record<mes_key, ZootMensal>
 * para acesso direto por mês (ex: byMes['03']).
 */
export function indexByMes(rows: ZootMensal[]): Record<string, ZootMensal> {
  const map: Record<string, ZootMensal> = {};
  for (const r of rows) {
    map[r.mes_key] = r;
  }
  return map;
}
