/**
 * OS ATALHOS ENTRE AS TRES TELAS DE PRODUCAO — ATALHOS-PRODUCAO-01.
 *
 * ⚠ NOME NOVO DE PROPOSITO: o PR-NAV-PRODUCAO-01 que ja' existe e' o do menu "Producao"
 * (`navGrupos.ts`). Este e' o do atalho na barra de topo.
 * ⚠ SO' AS TRES TELAS DO DIA A DIA DA PECUARIA: Operacoes Comerciais, Lancar movimentacao e a
 * lista de Lancamentos. Nas outras secoes a barra fica como sempre foi — o atalho responde "qual
 * das tres estou vendo e como vou para a outra", e fora delas a pergunta nao existe.
 * ⚠ OS ROTULOS SAO OS DO MOCK APROVADO (opcao A), nao os do menu: no menu o "Lancar movimentacao"
 * se chama "Pecuaria", sob "Lancar" — solto na barra, esse nome nao diria o que e'.
 */
import type { V2Section } from '@/v2/lib/navGrupos';
import { temParamsOC } from '@/lib/oc/paramsAberturaOC';

export type SecaoAtalhoProducao = 'operacoes-comerciais' | 'lancamentos-zoot' | 'conferencia-lancamentos';

export const OPCOES_ATALHO_PRODUCAO: ReadonlyArray<{ valor: SecaoAtalhoProducao; rotulo: string }> = [
  { valor: 'operacoes-comerciais', rotulo: 'Operações Comerciais' },
  { valor: 'lancamentos-zoot', rotulo: 'Lançar movimentação' },
  { valor: 'conferencia-lancamentos', rotulo: 'Lançamentos' },
];

/** A secao atual, se ela for uma das tres; `null` fora delas (e o atalho nao aparece). */
export function secaoDoAtalho(s: V2Section): SecaoAtalhoProducao | null {
  return OPCOES_ATALHO_PRODUCAO.find(o => o.valor === s)?.valor ?? null;
}

/**
 * SAIR DE "LANCAR MOVIMENTACAO" COM UMA OC NA URL LIMPA OS `oc_*` — decisao do Gabriel.
 *
 * ⚠ E' O MODAL DA OC QUE MORA EM `lancamentos-zoot`: sair dali por qualquer caminho (o atalho ou o
 * menu lateral) desmonta o modal, e os `oc_*` que sobravam na URL o REABRIAM sozinho na proxima
 * vez que alguem voltasse a "Lancar movimentacao". A regra vale para os dois caminhos.
 * ⚠ SO' NA SAIDA DE `lancamentos-zoot`: abrir uma OC de outra tela grava os `oc_*` e troca para
 * la' — esse caminho nao passa por aqui, e limpar ali apagaria o que acabou de ser pedido.
 */
export function saiDoLancarComOC(de: V2Section, para: V2Section, searchAtual: string): boolean {
  return de === 'lancamentos-zoot' && para !== 'lancamentos-zoot' && temParamsOC(searchAtual);
}
