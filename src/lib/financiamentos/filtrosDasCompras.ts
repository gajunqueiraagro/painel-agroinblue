/**
 * COMPRAS-PARC-LAYOUT-02 (Gabriel 19/11; D1 aprovada) — as regras puras dos filtros da aba "Compras parceladas":
 *  · o filtro "Atividade" vem das atividades LIGADAS do cliente (fonte única `fn_cliente_atividades_liberadas`), nunca de lista fixa;
 *    "Administrativo" (escopo gravado na compra, não atividade do cadastro) entra SEMPRE como a última opção (D1);
 *  · o sufixo da linha diz o escopo certo (PEC/AGR/SILV/ADM; antes tudo que não era pecuária saía "AGR");
 *  · os credores do filtro são os das linhas que passam nos OUTROS filtros, com a contagem;
 *  · o botão do topo segue a aba.
 */
import type { AtividadesLidas, GrupoAtividade } from '@/v2/pages/visaoGeral/atividadesDaVisao';

const SIGLA: Readonly<Record<string, string>> = { pecuaria: 'PEC', agricultura: 'AGR', silvicultura: 'SILV', administrativo: 'ADM' };
const ROTULO: Readonly<Record<string, string>> = { pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura', administrativo: 'Administrativo' };
const ORDEM_DOS_GRUPOS: readonly GrupoAtividade[] = ['pecuaria', 'agricultura', 'silvicultura'];

/** O sufixo do escopo (`tipo_financiamento`) na linha. Desconhecido = "—" (nunca outro escopo no lugar). */
export const escopoSigla = (tipo: string | null | undefined): string => SIGLA[tipo ?? ''] ?? '—';

export interface OpcaoDeAtividade { valor: string; rotulo: string }

/**
 * As opções do filtro: os GRUPOS das atividades ligadas do cliente (na ordem do cadastro, sem repetir) e "Administrativo" por último.
 * Sem cadastro ou com a leitura falhada (`lidas` nulo / `cadastrado = false`): os grupos que as compras TÊM (a regra da Visão Geral:
 * falhar nunca vira "sem atividade"), na ordem pecuária → agricultura → silvicultura.
 */
export function opcoesDeAtividade(lidas: AtividadesLidas | null, escoposDasCompras: readonly string[]): OpcaoDeAtividade[] {
  const grupos: string[] = [];
  if (lidas && lidas.cadastrado) {
    for (const a of lidas.atividades) if (!grupos.includes(a.grupo)) grupos.push(a.grupo);
  } else {
    for (const g of ORDEM_DOS_GRUPOS) if (escoposDasCompras.includes(g)) grupos.push(g);
  }
  return [...grupos, 'administrativo'].map((g) => ({ valor: g, rotulo: ROTULO[g] ?? g }));
}

export interface CredorDaLinha { id: string; nome: string; nome_fantasia: string | null; cpf_cnpj: string | null; aliases_norm: string[] | null; ativo: boolean }

/**
 * Os credores das linhas que passam nos outros filtros, com a contagem (`uso` = nº de compras), o mais usado primeiro. O escolhido que
 * deixou de aparecer quem chama marca como "valor inexistente" (P94: a tela nunca filtra o que não mostra).
 */
export function credoresComContagem(linhas: readonly CredorDaLinha[]): (CredorDaLinha & { uso: number })[] {
  const m = new Map<string, CredorDaLinha & { uso: number }>();
  for (const l of linhas) {
    const atual = m.get(l.id);
    if (atual) atual.uso += 1;
    else m.set(l.id, { id: l.id, nome: l.nome, nome_fantasia: l.nome_fantasia, cpf_cnpj: l.cpf_cnpj, aliases_norm: l.aliases_norm, ativo: l.ativo, uso: 1 });
  }
  return [...m.values()].sort((a, b) => b.uso - a.uso || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type AbaDaLista = 'financiamentos' | 'parcelas' | 'consorcios';
/** O botão do topo segue a aba (largura fixa de 176px): o tipo vem da aba, travado. */
export const ROTULO_DO_NOVO: Readonly<Record<AbaDaLista, string>> = {
  financiamentos: 'Novo financiamento', parcelas: 'Nova compra parcelada', consorcios: 'Novo consórcio',
};
