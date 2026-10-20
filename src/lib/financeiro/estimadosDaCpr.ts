/**
 * O QUE AINDA E' ESTIMATIVA NA CPR — UM conceito, duas origens (REC-VALOR-CERTO-02 + FIN-POS-FIXADO-01a). Puro.
 *   · recorrencia: a ocorrencia de recorrencia "A confirmar" sem o valor do mes (regra `ocorrenciaEstimada`);
 *   · juros_pos:   os juros futuros de contrato pos-fixado (regra `_fn_juros_estimado` no banco).
 * O conjunto `ids` (a uniao) e' o que o dono do recorte reparte; a origem so' muda o `title` do selo e dos totais.
 */
export type OrigemDoEstimado = 'recorrencia' | 'juros_pos';

export const TITULO_DO_ESTIMADO: Record<OrigemDoEstimado, string> = {
  recorrencia: 'valor estimado pela recorrência · informe o valor do mês no lançamento',
  juros_pos: 'juros estimados pela taxa do contrato pós-fixado · o valor real entra quando a parcela for paga',
};
const ORDEM: readonly OrigemDoEstimado[] = ['recorrencia', 'juros_pos'];

export interface EstimadosDaCpr {
  ids: Set<string>;
  origens: Map<string, OrigemDoEstimado[]>;
  /** A leitura da recorrencia bateu no teto (vale para o conjunto inteiro). */
  incompleto: boolean;
}

export const SEM_ESTIMADOS: EstimadosDaCpr = { ids: new Set(), origens: new Map(), incompleto: false };

export function juntarEstimados(recorrencia: ReadonlySet<string>, jurosPos: ReadonlySet<string>, incompleto: boolean): EstimadosDaCpr {
  const origens = new Map<string, OrigemDoEstimado[]>();
  const por = (ids: ReadonlySet<string>, o: OrigemDoEstimado) => { for (const id of ids) origens.set(id, [...(origens.get(id) ?? []), o]); };
  por(recorrencia, 'recorrencia');
  por(jurosPos, 'juros_pos');
  return { ids: new Set(origens.keys()), origens, incompleto };
}

/** As origens presentes no conjunto (para o `title` dos totais), na ordem fixa. */
export const origensPresentes = (e: EstimadosDaCpr): OrigemDoEstimado[] =>
  ORDEM.filter((o) => [...e.origens.values()].some((lista) => lista.includes(o)));

/** O `title`: um texto por origem (as duas, numa linha que tem as duas), e o aviso de leitura incompleta por ultimo. */
export function tituloDoEstimado(origens: readonly OrigemDoEstimado[] | undefined, aviso: string): string {
  const textos = ORDEM.filter((o) => (origens ?? []).includes(o)).map((o) => TITULO_DO_ESTIMADO[o]);
  return [...(textos.length ? textos : [TITULO_DO_ESTIMADO.recorrencia]), ...(aviso ? [aviso] : [])].join('\n');
}
