/**
 * A FAZENDA DOS FORMULARIOS DE MOVIMENTACAO — TRANSF-FAZENDA-ORIGEM-01 (27/09/2026).
 *
 * Regra do Gabriel: "Global" NAO E' FAZENDA. O campo de fazenda e' sempre um seletor com todas as
 * fazendas ativas do cliente; com o filtro numa fazenda ele nasce com ela (e troca); em Global nasce
 * VAZIO e obrigatorio, em vermelho no proprio campo. Na edicao mostra a fazenda GRAVADA.
 *
 * ⚠ SAO AS REGRAS QUE O NASCIMENTO, A MORTE E AS COMPRAS/VENDAS DE META JA' SEGUIAM, escritas uma vez para
 *   os tres tipos que ficaram de fora — Transferencia (saida), Consumo e Evoluir categoria. O de fora mostrava
 *   o NOME DO FILTRO num campo somente-leitura: em Global, a palavra "Global".
 * ⚠ PURO, SEM REACT: o `LancamentosTab` nao se monta em teste (nenhum teste da casa o monta), entao a regra
 *   mora aqui e o teste a exercita direto.
 */

/** O `id` da sentinela de navegacao do `FazendaContext` — nao e' fazenda nenhuma. */
const SENTINELA_GLOBAL = '__global__';

/** A mensagem do obrigatorio, embaixo do campo (UX-OBRIGATORIOS-01) — a mesma do Nascimento e da Morte. */
export const MSG_FAZENDA_OBRIGATORIA = 'Selecione a fazenda do lançamento.';

/** Com o filtro numa fazenda, o campo nasce com ela; em Global (ou sem contexto), nasce vazio. */
export function fazendaSemeada(fazendaAtualId: string | null | undefined): string {
  return fazendaAtualId && fazendaAtualId !== SENTINELA_GLOBAL ? fazendaAtualId : '';
}

/** O Destino da transferencia: todas as fazendas do seletor, MENOS a Origem escolhida (e nao a do filtro). */
export function destinosDaTransferencia<T extends { id: string }>(fazendas: readonly T[], origemId: string): T[] {
  return fazendas.filter(f => f.id !== origemId);
}

/**
 * O Destino depois de trocar a Origem. O Destino GRAVA O NOME (e' assim a coluna `fazenda_destino`); se a
 * Origem nova for a mesma fazenda, ele e' limpo — uma transferencia de uma fazenda para ela mesma nao existe.
 */
export function destinoAposTrocarOrigem(destinoNome: string, origemNome: string | null): string {
  return origemNome && destinoNome === origemNome ? '' : destinoNome;
}

/**
 * A guarda da fazenda no registrar:
 *   'global' — o tipo nao escolhe fazenda e o filtro e' Global: nao ha fazenda a herdar (a recusa de sempre);
 *   'falta'  — o tipo escolhe e o campo esta' vazio: o campo ja' esta' em vermelho, e herdar a do contexto
 *              gravaria uma fazenda que o operador nao escolheu (ou a sentinela, em Global);
 *   null     — pode seguir.
 */
export function bloqueioDaFazenda(p: { isGlobal: boolean; escolheFazenda: boolean; fazendaId: string }): 'global' | 'falta' | null {
  if (!p.escolheFazenda) return p.isGlobal ? 'global' : null;
  return p.fazendaId ? null : 'falta';
}
