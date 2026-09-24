/**
 * A CÉLULA "NF" DO PDF DE MOVIMENTAÇÕES — OC-PDF-ORIGEM-NF-01.
 *
 * ⚠ O NÚMERO DA NOTA NÃO MORA NO LANÇAMENTO quando ele nasce de uma Operação Comercial:
 * mora em `zoo_operacao_documentos`. Medido em 24/09/2026: dos 109 lançamentos de OC
 * (33 abate · 65 compra · 11 venda), **100%** têm `numero_documento` nulo — então o PDF saía
 * com "—" em todos, enquanto a NF estava cadastrada na aba Documentos.
 *
 * ⚠ O LEGADO CONTINUA MANDANDO. Lançamento que tem `notaFiscal` gravada lê dali e pronto: ele
 * não passa por OC nenhuma, e ir buscar na operação seria trocar a fonte de quem já tem dono.
 */

/** Uma NF vinda da operação. `numero` nulo existe no banco e é tratado aqui. */
export type NFdaOperacao = { numero: string | null | undefined };

/**
 * O que a célula NF mostra.
 *
 * ⚠ NF SEM NÚMERO É IGNORADA, NÃO VIRA "?" — medido: a venda 581d075c tem DUAS
 * `nf_principal` com `numero` nulo. Um "?" na coluna afirmaria que existe uma nota cujo número
 * ninguém sabe; o "—" diz o que é verdade, que não há número a mostrar. Se sobrar alguma com
 * número, ela aparece e as sem número somem — a célula não mente por omissão nem por invenção.
 *
 * ⚠ ORDEM POR NÚMERO, e ela é estável porque o formato é fixo: os números chegam do banco já em
 * `000.008.301` (A18), então a ordenação de texto é a numérica. Conferido: 100% dos
 * `nf_principal` com número seguem esse formato.
 */
export function celulaNF(
  notaFiscalLegado: string | null | undefined,
  nfsDaOperacao: readonly NFdaOperacao[] | undefined,
): string {
  const legado = (notaFiscalLegado ?? '').trim();
  if (legado) return legado;

  const numeros = (nfsDaOperacao ?? [])
    .map(d => (d.numero ?? '').trim())
    .filter(n => n.length > 0)
    .sort((a, b) => a.localeCompare(b));

  return numeros.length > 0 ? numeros.join(' · ') : '—';
}

/**
 * A ORIGEM de uma linha de abate ou venda.
 *
 * ⚠ A CHAVE É A FONTE, O TEXTO É CACHE — a mesma doutrina do `PR-FIN-PLANO-CHAVE-02` no plano de
 * contas. `fazenda_origem` é texto livre do legado e os escritores da OC
 * (`oc_registrar_movimentacao`, `oc_sincronizar`) não o preenchem — medido, nulo em 100% dos 109
 * lançamentos de OC. Mas `fazenda_id` está gravado em TODOS eles: o dado nunca faltou, o PDF é
 * que lia a coluna errada. A compra já fazia assim desde o PR-FORNECEDOR-FIX.
 */
export function origemDaLinha(
  fazendaMap: ReadonlyMap<string, string>,
  fazendaId: string | null | undefined,
  fazendaOrigemLegado: string | null | undefined,
): string {
  const pelaChave = fazendaId ? fazendaMap.get(fazendaId) : undefined;
  return pelaChave || (fazendaOrigemLegado ?? '').trim() || '—';
}
