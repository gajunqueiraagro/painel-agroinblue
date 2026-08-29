import { isEntrada, type Lancamento, type TipoMovimentacao } from '@/types/cattle';

/**
 * Nome da fazenda A QUE O REGISTRO PERTENCE.
 *
 * PRECEDENCIA: UUID primeiro (`fazenda_id`, coluna estrutural e estavel),
 * texto so' como ultimo recurso. A ordem importa: `fazenda_origem` e
 * `fazenda_destino` sao TEXTO LIVRE gravado no momento da criacao, e o writer
 * ja' gravou o sentinel 'Global' quando o lancamento nasceu em modo Global —
 * medido no proto em 29/08/2026: 1 nascimento (destino) e 18 saidas (origem),
 * das quais 11 abates e 7 vendas. O UUID desses 19 registros esta' correto;
 * so' a copia textual ficou envenenada.
 *
 * Esta e' a UNICA definicao da regra. Ela nasceu local no LancamentoZooModal
 * (painel de edicao) e foi extraida aqui em PR-UI-LANC-CARD-FAZENDA-01, porque
 * o LancamentoDetalhe (card "i") tinha uma SEGUNDA copia com a precedencia
 * INVERTIDA — texto primeiro — e por isso exibia "Global" para o mesmo
 * registro que o painel ao lado exibia certo.
 */
export function nomeFazendaDoRegistro(
  lancamento: Pick<Lancamento, 'fazendaId' | 'fazendaDestino' | 'fazendaOrigem'> | null | undefined,
  fazendas: Array<{ id: string; nome: string }>,
): string {
  if (!lancamento) return '';
  const fz = fazendas.find(f => f.id === lancamento.fazendaId);
  if (fz?.nome) return fz.nome;
  if (lancamento.fazendaDestino) return lancamento.fazendaDestino;
  if (lancamento.fazendaOrigem) return lancamento.fazendaOrigem;
  return '';
}

/**
 * O lado (origem|destino) e' DERIVADO da fazenda do registro, em vez de escolha
 * do usuario?
 *
 * Espelha `getCamposFazenda` (LancamentosTab), onde a identidade e' exata e sem
 * excecao: toda ENTRADA tem `destino` com `auto: true`; toda SAIDA tem `origem`
 * com `auto: true`; `reclassificacao` cai no default e nao tem nenhum dos dois.
 * Por isso a regra deriva de `isEntrada` e nao de uma lista nova — nao ha
 * segunda lista para sair de sincronia.
 *
 * O lado NAO derivado e' dado de verdade e nunca deve ser substituido: destino
 * de transferencia_saida e' outra fazenda, de abate e' o frigorifico, de venda
 * e' o comprador, de morte/consumo e' o MOTIVO; origem de compra e' o
 * fornecedor.
 */
export function campoFazendaEDerivado(tipo: TipoMovimentacao, lado: 'origem' | 'destino'): boolean {
  if (tipo === 'reclassificacao') return false;
  return lado === (isEntrada(tipo) ? 'destino' : 'origem');
}
