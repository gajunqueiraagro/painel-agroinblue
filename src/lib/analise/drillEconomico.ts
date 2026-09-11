/**
 * A NAVEGAÇÃO DO DRILL-DOWN ECONÔMICO — FIN-PAINEL-SAFRA-02 (B).
 *
 * ⚠ ESTE MÓDULO NÃO CLASSIFICA NADA. Ele agrupa os itens que já vêm classificados pelo plano
 * (`macro`, `grupo`, `centroPlano`, `subcentro`, todos colunas do lançamento) e responde
 * "quais são os filhos deste nó". A régua de o que ENTRA — só um lado do caixa, sem
 * tesouraria — é de `distribuicaoEconomica`, e é ela quem entrega os itens daqui.
 *
 * ⚠ NÃO HAVIA O QUE REUSAR, e vale dizer por quê para ninguém procurar de novo: o
 * `DrillDownMacro` do Finanças NÃO é um drill-down navegável. É uma TABELA MENSAL expansível
 * — monta a árvore inteira de uma vez, exibe colunas de meses, expande com chevron, não tem
 * breadcrumb, não chega ao lançamento, e é presa a `{ano, meses}` e ao tipo do `useFinanceiro`
 * (outro hook). São duas peças diferentes com nomes parecidos.
 */
/**
 * O mínimo para ORDENAR uma lista de lançamentos.
 *
 * ⚠ É MENOS QUE `ItemDrill` DE PROPÓSITO: os Maiores compromissos não têm hierarquia completa
 * (não carregam macro nem subcentro) e ordenam a mesma lista pela mesma régua. Exigir a
 * hierarquia para ordenar por data obrigaria o chamador a inventar campos que ele não tem —
 * e campo inventado é o começo de um dado errado.
 */
export interface ItemOrdenavel {
  id: string;
  data: string;
  mov: number;
  produto: string | null;
  fornecedor: string;
  doc: string;
}

export interface ItemDrill extends ItemOrdenavel {
  tipo: string;
  macro: string | null;
  grupo: string | null;
  centroPlano: string | null;
  subcentro: string | null;
}

/** Os quatro degraus, na ordem em que o plano de contas os encaixa. */
export type NivelDrill = 'macro' | 'grupo' | 'centroPlano' | 'subcentro';

export const NIVEIS_DRILL: readonly NivelDrill[] = ['macro', 'grupo', 'centroPlano', 'subcentro'];

export const ROTULO_NIVEL: Record<NivelDrill, string> = {
  macro: 'Natureza', grupo: 'Grupo', centroPlano: 'Centro', subcentro: 'Subcentro',
};

/**
 * ⚠ "SEM X" É UM NÓ, NÃO UM DESCARTE. Esconder o que o plano não classificou faria os filhos
 * somarem menos que o pai, e o operador conferiria a diferença sem achar onde ela está — que
 * é exatamente o tipo de buraco que esta tela existe para fechar.
 */
export const semNivel = (n: NivelDrill): string => `(Sem ${ROTULO_NIVEL[n].toLowerCase()})`;

export interface NoDrill<T> {
  chave: string;
  total: number;
  count: number;
  itens: T[];
}

/** Agrupa por um nível. O total é sempre em módulo — o lado já foi decidido antes. */
export function agruparPorNivel<T extends ItemDrill>(itens: T[], nivel: NivelDrill): NoDrill<T>[] {
  const mapa = new Map<string, NoDrill<T>>();
  for (const it of itens) {
    const chave = (it[nivel] || '').trim() || semNivel(nivel);
    const no = mapa.get(chave) ?? { chave, total: 0, count: 0, itens: [] };
    no.total += Math.abs(it.mov);
    no.count += 1;
    no.itens.push(it);
    mapa.set(chave, no);
  }
  return [...mapa.values()];
}

export type CampoOrdem = 'nome' | 'valor';
export type Direcao = 'asc' | 'desc';

/**
 * ⚠ "SEM X" VAI SEMPRE PARA O FIM, nos dois sentidos da ordenação — é a mesma regra do
 * ranking da distribuição. Ele não compete por valor nem por nome: é o resto, e resto se lê
 * por último.
 */
export function ordenarNos<T>(
  nos: NoDrill<T>[], campo: CampoOrdem, direcao: Direcao, sentinela: string,
): NoDrill<T>[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return nos.slice().sort((a, b) => {
    if (a.chave === sentinela) return 1;
    if (b.chave === sentinela) return -1;
    return campo === 'nome'
      ? sinal * a.chave.localeCompare(b.chave, 'pt-BR')
      : sinal * (a.total - b.total);
  });
}

export type CampoOrdemLanc = 'data' | 'produto' | 'fornecedor' | 'doc' | 'mov';

/**
 * ⚠ O DESEMPATE É SEMPRE O `id`, e não é detalhe: sem ele, duas linhas de mesma data trocam
 * de lugar entre renders (o `sort` do V8 não é estável para o que compara igual em todos os
 * campos), e a lista "pisca" quando o operador está justamente conferindo uma delas.
 */
export function ordenarLancamentos<T extends ItemOrdenavel>(
  itens: T[], campo: CampoOrdemLanc, direcao: Direcao,
): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  const texto = (it: T): string => {
    if (campo === 'produto') return it.produto ?? '';
    if (campo === 'fornecedor') return it.fornecedor ?? '';
    return it.doc ?? '';
  };
  return itens.slice().sort((a, b) => {
    let c = 0;
    if (campo === 'data') c = a.data.localeCompare(b.data);
    else if (campo === 'mov') c = Math.abs(a.mov) - Math.abs(b.mov);
    else c = texto(a).localeCompare(texto(b), 'pt-BR');
    return c !== 0 ? sinal * c : a.id.localeCompare(b.id);
  });
}
