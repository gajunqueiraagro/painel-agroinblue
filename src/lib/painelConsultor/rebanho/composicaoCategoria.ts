/**
 * Função pura montarComposicaoCategoria.
 *
 * Recebe o array retornado por useRebanhoOficial.getCategoriasDetalhe(mes)
 * e devolve a estrutura executiva ItemComposicaoCategoria[] do PC-100,
 * com percentuais e ordenação canônica.
 *
 * Não faz query. Não tem efeito colateral. Função pura.
 */
import type { ItemComposicaoCategoria } from './types';

/** Shape mínimo de cada item de entrada (subset de CategoriaDetalhe). */
interface CategoriaDetalheMinimo {
  categoria_id?: string;
  categoriaId?: string;
  categoria_codigo?: string;
  categoriaCodigo?: string;
  categoria_nome?: string;
  categoriaNome?: string;
  ordem_exibicao?: number;
  ordem?: number;
  saldo_final?: number | null;
  saldoFinal?: number | null;
  peso_total_final?: number | null;
  pesoTotalFinal?: number | null;
  peso_medio_final?: number | null;
  pesoMedioFinal?: number | null;
  gmd?: number | null;
}

function num(v: number | null | undefined): number {
  if (v == null || Number.isNaN(v)) return 0;
  return v;
}

function nullable(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

/**
 * Aceita tanto camelCase (já mapeado por getCategoriasDetalhe) quanto
 * snake_case (caso venha do raw).
 *
 * Modo Global: getCategoriasDetalhe retorna 1 linha POR FAZENDA × CATEGORIA,
 * então a função AGREGA por categoriaId (soma cabecas + pesoTotalKg, gmd
 * ponderado por cabecas). pesoMedioKg é DERIVADO (peso/cab), não lido direto
 * de pesoMedioFinal — preserva consistência após agregação.
 *
 * Filtra cabecas > 0. Ordena por cabecas DESC.
 */
export function montarComposicaoCategoria(
  detalhes: CategoriaDetalheMinimo[] | null | undefined,
): ItemComposicaoCategoria[] | null {
  if (!detalhes || detalhes.length === 0) return null;

  // 1. Normalizar entrada (camelCase OU snake_case)
  const normalizados = detalhes.map((d) => ({
    categoriaId:     d.categoriaId    ?? d.categoria_id    ?? '',
    categoriaCodigo: d.categoriaCodigo ?? d.categoria_codigo ?? '',
    categoria:       d.categoriaNome  ?? d.categoria_nome  ?? '',
    ordem:           d.ordem          ?? d.ordem_exibicao  ?? 999,
    cabecas:         num(d.saldoFinal       ?? d.saldo_final),
    pesoTotalKg:     num(d.pesoTotalFinal   ?? d.peso_total_final),
    gmd:             nullable(d.gmd),
  }));

  // 2. Agregar por categoriaId (modo Global tem N linhas por categoria)
  interface Acc {
    categoriaId: string;
    categoriaCodigo: string;
    categoria: string;
    ordem: number;
    cabecas: number;
    pesoTotalKg: number;
    gmdSomaPonderada: number;  // soma de (gmd * cabecas)
    gmdPesoTotal: number;       // soma de cabecas que têm gmd válido
  }

  const agregadosMap = new Map<string, Acc>();
  for (const c of normalizados) {
    if (!c.categoriaId) continue;
    let acc = agregadosMap.get(c.categoriaId);
    if (!acc) {
      acc = {
        categoriaId: c.categoriaId,
        categoriaCodigo: c.categoriaCodigo,
        categoria: c.categoria,
        ordem: c.ordem,
        cabecas: 0,
        pesoTotalKg: 0,
        gmdSomaPonderada: 0,
        gmdPesoTotal: 0,
      };
      agregadosMap.set(c.categoriaId, acc);
    }
    acc.cabecas += c.cabecas;
    acc.pesoTotalKg += c.pesoTotalKg;
    if (c.gmd != null && c.cabecas > 0) {
      acc.gmdSomaPonderada += c.gmd * c.cabecas;
      acc.gmdPesoTotal     += c.cabecas;
    }
  }

  // 3. Filtrar cabecas > 0
  const ativos = Array.from(agregadosMap.values()).filter((a) => a.cabecas > 0);
  if (ativos.length === 0) return null;

  // 4. Totais globais para pcts
  const totalCabecas = ativos.reduce((acc, a) => acc + a.cabecas, 0);
  const totalPeso    = ativos.reduce((acc, a) => acc + a.pesoTotalKg, 0);

  // 5. Montar resultado final
  const itens: ItemComposicaoCategoria[] = ativos.map((a) => ({
    categoriaId:    a.categoriaId,
    categoriaCodigo: a.categoriaCodigo,
    categoria:      a.categoria,
    ordem:          a.ordem,
    cabecas:        a.cabecas,
    pesoTotalKg:    a.pesoTotalKg,
    pesoMedioKg:    a.cabecas > 0 ? a.pesoTotalKg / a.cabecas : 0,
    gmd:            a.gmdPesoTotal > 0 ? a.gmdSomaPonderada / a.gmdPesoTotal : null,
    pctRebanho:     totalCabecas > 0 ? a.cabecas / totalCabecas : 0,
    pctPeso:        totalPeso    > 0 ? a.pesoTotalKg / totalPeso : 0,
  }));

  // 6. Ordenar cabecas DESC
  itens.sort((a, b) => b.cabecas - a.cabecas);

  return itens;
}
